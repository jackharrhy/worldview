import { DurableObject } from 'cloudflare:workers';
import {
  applyCollaborationOperation,
  type CollaborationOperation,
  type MapDocument,
} from '@jackharrhy/worldview-editor/core';
import { parseClientFrame, type ServerFrame } from './protocol.js';

interface SocketAttachment {
  readonly actorId: string;
  readonly role: 'owner' | 'editor' | 'viewer';
  readonly operationWindowStartedAt: number;
  readonly operationCount: number;
}

const MAX_ROOM_CONNECTIONS = 32;
const MAX_ACTOR_CONNECTIONS = 4;
const OPERATION_WINDOW_MS = 60_000;
const MAX_OPERATIONS_PER_WINDOW = 240;

export class MapRoom extends DurableObject<Env> {
  public constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS room_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        room_id TEXT NOT NULL,
        room_version INTEGER NOT NULL,
        document_json TEXT
      );
      CREATE TABLE IF NOT EXISTS operations (
        room_version INTEGER PRIMARY KEY,
        operation_id TEXT NOT NULL UNIQUE,
        actor_id TEXT NOT NULL,
        operation_json TEXT NOT NULL,
        accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS operations_actor_idx ON operations(actor_id, room_version);
      CREATE TABLE IF NOT EXISTS checkpoint_chunks (
        room_version INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        PRIMARY KEY (room_version, chunk_index)
      );
      INSERT OR IGNORE INTO _sql_schema_migrations(version) VALUES (1);
    `);
  }

  public async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: 'WebSocket upgrade required' }, { status: 426 });
    }
    const url = new URL(request.url);
    const actorId = url.searchParams.get('actor');
    const roomId = url.searchParams.get('room');
    const role = url.searchParams.get('role') ?? 'editor';
    if (!actorId || !roomId || actorId.length > 128 || roomId.length > 128) {
      return Response.json(
        { error: 'Valid room and actor parameters are required' },
        { status: 400 },
      );
    }
    if (role !== 'owner' && role !== 'editor' && role !== 'viewer') {
      return Response.json({ error: 'Valid collaboration role required' }, { status: 400 });
    }
    if (this.ctx.getWebSockets().length >= MAX_ROOM_CONNECTIONS) {
      return Response.json({ error: 'Collaboration room is at capacity' }, { status: 503 });
    }
    if (this.ctx.getWebSockets(`actor:${actorId}`).length >= MAX_ACTOR_CONNECTIONS) {
      return Response.json({ error: 'Actor connection limit reached' }, { status: 429 });
    }
    this.initializeRoom(roomId);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({
      actorId,
      role,
      operationWindowStartedAt: Date.now(),
      operationCount: 0,
    } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server, [`actor:${actorId}`]);
    server.send(JSON.stringify(this.readyFrame()));
    return new Response(null, { status: 101, webSocket: client });
  }

  public initializeBaseline(roomId: string, document: MapDocument): { roomVersion: number } {
    this.initializeRoom(roomId);
    const state = this.state();
    if (state.document_json !== null) throw new Error('Room baseline already exists');
    this.writeDocument(state.room_version, document);
    this.ctx.storage.sql.exec(
      "UPDATE room_state SET document_json = 'chunked' WHERE singleton = 1",
    );
    return { roomVersion: state.room_version };
  }

  public snapshot(roomId?: string): { roomVersion: number; document: MapDocument | null } {
    if (roomId) this.initializeRoom(roomId);
    const state = this.state();
    return {
      roomVersion: state.room_version,
      document: state.document_json ? this.readDocument(state.room_version) : null,
    };
  }

  public submit(actorId: string, operation: CollaborationOperation): ServerFrame {
    if (actorId !== operation.actorId) throw new Error('Operation actor does not match the caller');
    const response = this.applyOperation(operation);
    if (response.type === 'operation') this.broadcast(response);
    return response.type === 'operation'
      ? { type: 'ack', operationId: operation.operationId, roomVersion: response.roomVersion }
      : response;
  }

  public webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    try {
      const frame = parseClientFrame(message);
      if (frame.type === 'presence') {
        const attachment = socket.deserializeAttachment() as SocketAttachment | null;
        if (!attachment || attachment.actorId !== frame.presence.actorId) {
          throw new Error('Presence actor does not match the connection');
        }
        this.broadcast({ type: 'presence', presence: frame.presence }, socket);
        return;
      }
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.role === 'viewer') throw new Error('Viewer connections cannot edit maps');
      if (!attachment) throw new Error('Collaboration connection is missing its identity');
      const now = Date.now();
      const operationWindowStartedAt =
        now - attachment.operationWindowStartedAt >= OPERATION_WINDOW_MS
          ? now
          : attachment.operationWindowStartedAt;
      const operationCount = operationWindowStartedAt === now ? 1 : attachment.operationCount + 1;
      if (operationCount > MAX_OPERATIONS_PER_WINDOW) {
        socket.close(1008, 'Operation rate limit exceeded');
        return;
      }
      socket.serializeAttachment({
        ...attachment,
        operationWindowStartedAt,
        operationCount,
      } satisfies SocketAttachment);
      this.acceptSocketOperation(socket, frame.operation);
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Invalid collaboration frame',
        } satisfies ServerFrame),
      );
    }
  }

  public webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }

  private initializeRoom(roomId: string): void {
    const current = this.ctx.storage.sql
      .exec<{ room_id: string }>('SELECT room_id FROM room_state WHERE singleton = 1')
      .toArray()[0];
    if (current && current.room_id !== roomId)
      throw new Error('Durable Object room identity mismatch');
    if (!current) {
      this.ctx.storage.sql.exec(
        'INSERT INTO room_state(singleton, room_id, room_version, document_json) VALUES (1, ?, 0, NULL)',
        roomId,
      );
    }
  }

  private state(): { room_version: number; document_json: string | null } {
    return this.ctx.storage.sql
      .exec<{ room_version: number; document_json: string | null }>(
        'SELECT room_version, document_json FROM room_state WHERE singleton = 1',
      )
      .one();
  }

  private writeDocument(roomVersion: number, document: MapDocument): void {
    const serialized = JSON.stringify(document);
    const chunkSize = 128 * 1024;
    this.ctx.storage.sql.exec('DELETE FROM checkpoint_chunks WHERE room_version = ?', roomVersion);
    for (
      let offset = 0, chunkIndex = 0;
      offset < serialized.length;
      offset += chunkSize, chunkIndex += 1
    ) {
      this.ctx.storage.sql.exec(
        'INSERT INTO checkpoint_chunks(room_version, chunk_index, content) VALUES (?, ?, ?)',
        roomVersion,
        chunkIndex,
        serialized.slice(offset, offset + chunkSize),
      );
    }
  }

  private readDocument(roomVersion: number): MapDocument {
    const chunks = this.ctx.storage.sql
      .exec<{ content: string }>(
        'SELECT content FROM checkpoint_chunks WHERE room_version = ? ORDER BY chunk_index',
        roomVersion,
      )
      .toArray();
    if (chunks.length === 0) throw new Error('Room checkpoint is missing');
    return JSON.parse(chunks.map((chunk) => chunk.content).join('')) as MapDocument;
  }

  private readyFrame(): ServerFrame {
    const snapshot = this.snapshot();
    return { type: 'ready', ...snapshot };
  }

  private acceptSocketOperation(socket: WebSocket, operation: CollaborationOperation): void {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment || attachment.actorId !== operation.actorId) {
      throw new Error('Operation actor does not match the connection');
    }
    const response = this.applyOperation(operation);
    if (response.type === 'operation') {
      socket.send(
        JSON.stringify({
          type: 'ack',
          operationId: operation.operationId,
          roomVersion: response.roomVersion,
        } satisfies ServerFrame),
      );
      this.broadcast(response, socket);
    } else socket.send(JSON.stringify(response));
  }

  private applyOperation(operation: CollaborationOperation): ServerFrame {
    const duplicate = this.ctx.storage.sql
      .exec<{ room_version: number }>(
        'SELECT room_version FROM operations WHERE operation_id = ?',
        operation.operationId,
      )
      .toArray()[0];
    if (duplicate) {
      return {
        type: 'ack',
        operationId: operation.operationId,
        roomVersion: duplicate.room_version,
      };
    }
    const state = this.state();
    if (!state.document_json) throw new Error('Room baseline has not been initialized');
    const document = this.readDocument(state.room_version);
    const result = applyCollaborationOperation(document, operation);
    if (result.status === 'conflict') {
      return { type: 'conflict', operationId: operation.operationId, conflicts: result.conflicts };
    }
    const roomVersion = state.room_version + 1;
    this.ctx.storage.sql.exec(
      'INSERT INTO operations(room_version, operation_id, actor_id, operation_json) VALUES (?, ?, ?, ?)',
      roomVersion,
      operation.operationId,
      operation.actorId,
      JSON.stringify(operation),
    );
    this.writeDocument(roomVersion, result.document);
    this.ctx.storage.sql.exec(
      "UPDATE room_state SET room_version = ?, document_json = 'chunked' WHERE singleton = 1",
      roomVersion,
    );
    return { type: 'operation', roomVersion, operation };
  }

  private broadcast(frame: ServerFrame, except?: WebSocket): void {
    const serialized = JSON.stringify(frame);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== except) socket.send(serialized);
    }
  }
}
