import {
  COLLABORATION_SCHEMA_VERSION,
  applyCollaborationOperation,
  collaborationEditsBetween,
  inverseCollaborationEdits,
  type CollaborationOperation,
  type CollaborationEdit,
  type CollaborationFailure,
  type EditorSession,
  type MapDocument,
} from '@jackharrhy/worldview-editor/core';

const DATABASE_NAME = 'worldview-map-outbox';
const DATABASE_VERSION = 1;
const OUTBOX_STORE = 'map-outbox';
const SOCKET_OPEN = 1;

export interface CollaborationOutbox {
  put(mapId: string, operation: CollaborationOperation): Promise<void>;
  pending(mapId: string): Promise<readonly CollaborationOperation[]>;
  acknowledge(mapId: string, operationId: string): Promise<void>;
}

interface StoredOperation {
  readonly key: string;
  readonly mapId: string;
  readonly operation: CollaborationOperation;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    });
    request.addEventListener('error', () => reject(request.error), {
      once: true,
    });
  });
}

export class IndexedDbCollaborationOutbox implements CollaborationOutbox {
  private readonly database: Promise<IDBDatabase>;

  public constructor(factory: IDBFactory = indexedDB) {
    this.database = new Promise((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener('upgradeneeded', () => {
        if (!request.result.objectStoreNames.contains(OUTBOX_STORE)) {
          const store = request.result.createObjectStore(OUTBOX_STORE, {
            keyPath: 'key',
          });
          store.createIndex('mapId', 'mapId');
        }
      });
      request.addEventListener('success', () => resolve(request.result), {
        once: true,
      });
      request.addEventListener('error', () => reject(request.error), {
        once: true,
      });
    });
  }

  public async put(mapId: string, operation: CollaborationOperation): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(OUTBOX_STORE, 'readwrite');
    await requestResult(
      transaction.objectStore(OUTBOX_STORE).put({
        key: `${mapId}\u0000${operation.operationId}`,
        mapId,
        operation,
      } satisfies StoredOperation),
    );
  }

  public async pending(mapId: string): Promise<readonly CollaborationOperation[]> {
    const database = await this.database;
    const transaction = database.transaction(OUTBOX_STORE, 'readonly');
    const rows = await requestResult<StoredOperation[]>(
      transaction.objectStore(OUTBOX_STORE).index('mapId').getAll(mapId),
    );
    return rows
      .map((row) => row.operation)
      .toSorted((left, right) => left.operationId.localeCompare(right.operationId));
  }

  public async acknowledge(mapId: string, operationId: string): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(OUTBOX_STORE, 'readwrite');
    await requestResult(
      transaction.objectStore(OUTBOX_STORE).delete(`${mapId}\u0000${operationId}`),
    );
  }
}

export class MemoryCollaborationOutbox implements CollaborationOutbox {
  private readonly entries = new Map<string, CollaborationOperation>();

  public async put(mapId: string, operation: CollaborationOperation): Promise<void> {
    this.entries.set(`${mapId}\u0000${operation.operationId}`, operation);
  }

  public async pending(mapId: string): Promise<readonly CollaborationOperation[]> {
    const prefix = `${mapId}\u0000`;
    return [...this.entries]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, operation]) => operation)
      .toSorted((left, right) => left.operationId.localeCompare(right.operationId));
  }

  public async acknowledge(mapId: string, operationId: string): Promise<void> {
    this.entries.delete(`${mapId}\u0000${operationId}`);
  }
}

export interface CollaborationChannel {
  publish(message: CollaborationOperation): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<CollaborationOperation>) => void,
  ): void;
  close(): void;
}

export interface CollaborationControllerOptions {
  readonly mapId: string;
  readonly actorId: string;
  readonly outbox?: CollaborationOutbox;
  readonly channel?: CollaborationChannel;
  readonly createId?: () => string;
  readonly onPeerOperation?: (operation: CollaborationOperation) => void;
  readonly onAcknowledged?: (operationId: string, mapVersion: number) => void;
}

export interface CollaborationPresence {
  readonly actorId: string;
  readonly displayName?: string;
  readonly color?: string;
  readonly selectedObjectIds?: readonly string[];
  readonly viewport?: 'perspective' | 'xy' | 'xz' | 'yz';
  readonly pointer?: readonly [number, number, number];
  readonly tool?: string;
  readonly preview?: {
    readonly interactionId: string;
    readonly sequence: number;
    readonly baseMapVersion: number;
    readonly edits: readonly CollaborationEdit[];
  };
  readonly sentAt: number;
}

export interface JoinCollaborationOptions {
  readonly endpoint: string;
  readonly mapId: string;
  readonly actorId: string;
  readonly displayName?: string;
  readonly color?: string;
  /** Returns a fresh short-lived bearer token for protected hosted rooms. */
  readonly authorize?: () => Promise<string>;
  readonly onPresence?: (presence: CollaborationPresence) => void;
  readonly onLocalPresence?: (presence: CollaborationPresence) => void;
  readonly onConflict?: (operationId: string, conflicts: readonly CollaborationFailure[]) => void;
  readonly onConnectionChange?: (state: 'connecting' | 'connected' | 'disconnected') => void;
}

export interface CollaborationReconciliation {
  readonly document: MapDocument;
  readonly conflicts: readonly {
    readonly operationId: string;
    readonly details: readonly CollaborationFailure[];
  }[];
}

export function reconcilePendingOperations(
  canonical: MapDocument,
  pending: readonly CollaborationOperation[],
): CollaborationReconciliation {
  let document = canonical;
  const conflicts: { operationId: string; details: readonly CollaborationFailure[] }[] = [];
  for (const operation of pending) {
    const result = applyCollaborationOperation(document, operation);
    if (result.status === 'conflict') {
      conflicts.push({ operationId: operation.operationId, details: result.conflicts });
    } else document = result.document;
  }
  return { document, conflicts };
}

type CollaborationServerFrame =
  | {
      readonly type: 'ready';
      readonly mapId: string;
      readonly mapVersion: number;
      readonly document: MapDocument;
      readonly source: string;
      readonly sourceSha256: string;
    }
  | {
      readonly type: 'operation';
      readonly mapVersion: number;
      readonly sourceSha256: string;
      readonly operation: CollaborationOperation;
    }
  | {
      readonly type: 'ack';
      readonly operationId: string;
      readonly mapVersion: number;
      readonly sourceSha256: string;
    }
  | {
      readonly type: 'conflict';
      readonly operationId: string;
      readonly conflicts: readonly CollaborationFailure[];
    }
  | { readonly type: 'presence'; readonly presence: CollaborationPresence }
  | { readonly type: 'error'; readonly message: string };

export interface CollaborationSocket {
  readonly readyState: number;
  addEventListener(type: 'open' | 'close', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<string>) => void): void;
  send(data: string): void;
  close(): void;
}

/** Optional local-first adapter. Constructing an EditorSession never constructs this controller. */
export class CollaborationController {
  private mapVersion = 0;
  private sequence = 0;
  private readonly outbox: CollaborationOutbox;
  private readonly channel: CollaborationChannel;
  private readonly createId: () => string;
  private readonly localOperationListeners = new Set<(operation: CollaborationOperation) => void>();

  public constructor(private readonly options: CollaborationControllerOptions) {
    this.outbox = options.outbox ?? new IndexedDbCollaborationOutbox();
    this.channel =
      options.channel ??
      (() => {
        const broadcastChannel = new BroadcastChannel(`worldview-map:${options.mapId}`);
        return {
          // BroadcastChannel.postMessage has no target-origin parameter (unlike Window.postMessage).
          // oxlint-disable-next-line unicorn/require-post-message-target-origin
          publish: (message) => broadcastChannel.postMessage(message),
          addEventListener: (type, listener) => broadcastChannel.addEventListener(type, listener),
          close: () => broadcastChannel.close(),
        } satisfies CollaborationChannel;
      })();
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.channel.addEventListener('message', (event) => options.onPeerOperation?.(event.data));
  }

  public setMapVersion(mapVersion: number): void {
    this.mapVersion = Math.max(this.mapVersion, mapVersion);
  }

  public getMapVersion(): number {
    return this.mapVersion;
  }

  public async recordCommit(
    label: string,
    before: MapDocument,
    after: MapDocument,
  ): Promise<CollaborationOperation | null> {
    const edits = collaborationEditsBetween(before, after);
    if (edits.length === 0) return null;
    const id = `${this.options.actorId}:${++this.sequence}:${this.createId()}`;
    const operation: CollaborationOperation = {
      schemaVersion: COLLABORATION_SCHEMA_VERSION,
      operationId: id,
      transactionId: id,
      actorId: this.options.actorId,
      baseMapVersion: this.mapVersion,
      label,
      edits,
      inverseEdits: inverseCollaborationEdits(before, after),
    };
    await this.outbox.put(this.options.mapId, operation);
    this.channel.publish(operation);
    for (const listener of this.localOperationListeners) listener(operation);
    return operation;
  }

  public subscribeLocalOperations(
    listener: (operation: CollaborationOperation) => void,
  ): () => void {
    this.localOperationListeners.add(listener);
    return () => this.localOperationListeners.delete(listener);
  }

  public pending(): Promise<readonly CollaborationOperation[]> {
    return this.outbox.pending(this.options.mapId);
  }

  public receivePeerOperation(operation: CollaborationOperation): void {
    this.options.onPeerOperation?.(operation);
  }

  public async acknowledge(operationId: string, mapVersion: number): Promise<void> {
    this.setMapVersion(mapVersion);
    await this.outbox.acknowledge(this.options.mapId, operationId);
    this.options.onAcknowledged?.(operationId, mapVersion);
  }

  public reject(operationId: string): Promise<void> {
    return this.outbox.acknowledge(this.options.mapId, operationId);
  }

  public async recordPersonalizedUndo(
    original: CollaborationOperation,
  ): Promise<CollaborationOperation> {
    if (original.actorId !== this.options.actorId) {
      throw new Error("Cannot undo another participant's operation");
    }
    if (!original.inverseEdits) throw new Error('Operation has no inverse edits');
    const id = `${this.options.actorId}:${++this.sequence}:${this.createId()}`;
    const operation: CollaborationOperation = {
      schemaVersion: COLLABORATION_SCHEMA_VERSION,
      operationId: id,
      transactionId: id,
      actorId: this.options.actorId,
      baseMapVersion: this.mapVersion,
      label: `Undo ${original.label}`,
      edits: original.inverseEdits,
      inverseEdits: original.edits,
    };
    await this.outbox.put(this.options.mapId, operation);
    this.channel.publish(operation);
    for (const listener of this.localOperationListeners) listener(operation);
    return operation;
  }

  public close(): void {
    this.channel.close();
  }
}

export interface CollaborationSocketClientOptions {
  readonly endpoint: string;
  readonly mapId: string;
  readonly actorId: string;
  readonly authorize?: () => Promise<string>;
  readonly controller: CollaborationController;
  readonly createSocket?: (url: string) => CollaborationSocket;
  readonly scheduleReconnect?: (callback: () => void, milliseconds: number) => number;
  readonly cancelReconnect?: (handle: number) => void;
  readonly onReady?: (
    frame: Extract<CollaborationServerFrame, { type: 'ready' }>,
  ) => void | Promise<void>;
  readonly onPresence?: (presence: CollaborationPresence) => void;
  readonly onConflict?: (operationId: string, conflicts: readonly CollaborationFailure[]) => void;
  readonly onError?: (error: unknown) => void;
  readonly onConnectionChange?: (state: 'connecting' | 'connected' | 'disconnected') => void;
}

/** Reconnectable room transport. The IndexedDB outbox remains authoritative while disconnected. */
export class CollaborationSocketClient {
  private socket: CollaborationSocket | null = null;
  private reconnectHandle: number | null = null;
  private reconnectAttempt = 0;
  private connecting = false;
  private stopped = false;
  private serverReady = false;
  private receiveQueue: Promise<void> = Promise.resolve();
  private readonly sentOperationIds = new Set<string>();
  private readonly unsubscribeLocalOperations: () => void;
  private readonly createSocket: (url: string) => CollaborationSocket;
  private readonly scheduleReconnect: (callback: () => void, milliseconds: number) => number;
  private readonly cancelReconnect: (handle: number) => void;

  public constructor(private readonly options: CollaborationSocketClientOptions) {
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.scheduleReconnect =
      options.scheduleReconnect ?? ((callback, delay) => window.setTimeout(callback, delay));
    this.cancelReconnect = options.cancelReconnect ?? ((handle) => window.clearTimeout(handle));
    this.unsubscribeLocalOperations = options.controller.subscribeLocalOperations((operation) => {
      this.sendOperation(operation);
    });
  }

  public connect(): void {
    if (this.stopped || this.socket || this.connecting) return;
    if (this.options.authorize) void this.connectAuthorizedSocket();
    else {
      this.options.onConnectionChange?.('connecting');
      this.openSocket();
    }
  }

  private async connectAuthorizedSocket(): Promise<void> {
    if (this.stopped || this.socket || this.connecting) return;
    this.connecting = true;
    this.options.onConnectionChange?.('connecting');
    try {
      const token = await this.options.authorize!();
      if (this.stopped) return;
      this.openSocket(token);
    } catch (error) {
      this.options.onError?.(error);
      this.options.onConnectionChange?.('disconnected');
      this.scheduleNextReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private openSocket(token?: string): void {
    const url = new URL(this.options.endpoint);
    url.pathname = `/sync/maps/${encodeURIComponent(this.options.mapId)}/live`;
    url.searchParams.set('actor', this.options.actorId);
    if (token) url.searchParams.set('access_token', token);
    const socket = this.createSocket(url.toString());
    this.serverReady = false;
    this.sentOperationIds.clear();
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.options.onConnectionChange?.('connected');
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      this.receiveQueue = this.receiveQueue.then(() => this.receive(event.data));
    });
    socket.addEventListener('close', () => {
      if (this.socket === socket) this.socket = null;
      this.serverReady = false;
      this.options.onConnectionChange?.('disconnected');
      this.scheduleNextReconnect();
    });
  }

  public sendPresence(presence: CollaborationPresence): boolean {
    if (!this.socket || this.socket.readyState !== SOCKET_OPEN) return false;
    this.socket.send(JSON.stringify({ type: 'presence', presence }));
    return true;
  }

  public close(): void {
    this.stopped = true;
    if (this.reconnectHandle !== null) this.cancelReconnect(this.reconnectHandle);
    this.reconnectHandle = null;
    this.unsubscribeLocalOperations();
    this.socket?.close();
    this.socket = null;
  }

  private async receive(serialized: string): Promise<void> {
    try {
      const frame = JSON.parse(serialized) as CollaborationServerFrame;
      if (frame.type === 'ready') {
        this.options.controller.setMapVersion(frame.mapVersion);
        await this.options.onReady?.(frame);
        this.serverReady = true;
        await this.flushOutbox();
      } else if (frame.type === 'ack') {
        await this.options.controller.acknowledge(frame.operationId, frame.mapVersion);
      } else if (frame.type === 'operation') {
        this.options.controller.setMapVersion(frame.mapVersion);
        this.options.controller.receivePeerOperation(frame.operation);
      } else if (frame.type === 'presence') this.options.onPresence?.(frame.presence);
      else if (frame.type === 'conflict') {
        await this.options.controller.reject(frame.operationId);
        this.options.onConflict?.(frame.operationId, frame.conflicts);
      } else if (frame.type === 'error') throw new Error(frame.message);
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  private async flushOutbox(): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.readyState !== SOCKET_OPEN) return;
    for (const operation of await this.options.controller.pending()) {
      if (this.socket !== socket || socket.readyState !== SOCKET_OPEN) return;
      this.sendOperation(operation);
    }
  }

  private sendOperation(operation: CollaborationOperation): void {
    const socket = this.socket;
    if (
      !this.serverReady ||
      !socket ||
      socket.readyState !== SOCKET_OPEN ||
      this.sentOperationIds.has(operation.operationId)
    ) {
      return;
    }
    this.sentOperationIds.add(operation.operationId);
    socket.send(JSON.stringify({ type: 'operation', operation }));
  }

  private scheduleNextReconnect(): void {
    if (this.stopped || this.reconnectHandle !== null) return;
    const delay = Math.min(30_000, 500 * 2 ** Math.min(this.reconnectAttempt++, 6));
    this.reconnectHandle = this.scheduleReconnect(() => {
      this.reconnectHandle = null;
      this.connect();
    }, delay);
  }
}

/** Connects committed session transactions to an opt-in controller; solo sessions never use it. */
export class EditorCollaborationBridge {
  private previousDocument: MapDocument;
  private applyingRemote = false;
  private readonly unsubscribe: () => void;

  public constructor(
    private readonly session: EditorSession,
    private readonly controller: CollaborationController,
    private readonly onError: (error: unknown) => void = console.error,
  ) {
    this.previousDocument = session.document;
    this.unsubscribe = session.subscribe((change) => {
      if (change.kind !== 'document' && change.kind !== 'history') return;
      const before = this.previousDocument;
      const after = session.document;
      this.previousDocument = after;
      if (this.applyingRemote) return;
      void controller.recordCommit(change.label, before, after).catch(onError);
    });
  }

  public receive(operation: CollaborationOperation): void {
    this.applyingRemote = true;
    try {
      const result = this.session.applyRemoteCollaborationOperation(operation);
      if (result.status === 'conflict') {
        throw new Error(result.conflicts.map((conflict) => conflict.message).join('; '));
      }
      this.previousDocument = this.session.document;
    } finally {
      this.applyingRemote = false;
    }
  }

  public synchronize(document: MapDocument, label = 'Synchronize hosted map'): void {
    this.applyingRemote = true;
    try {
      this.session.replaceDocument(document, label);
      this.previousDocument = this.session.document;
    } finally {
      this.applyingRemote = false;
    }
  }

  public async undo(original: CollaborationOperation): Promise<CollaborationOperation> {
    const inverse = await this.controller.recordPersonalizedUndo(original);
    this.receive(inverse);
    return inverse;
  }

  public close(): void {
    this.unsubscribe();
    this.controller.close();
  }
}
