import { describe, expect, it, vi } from 'vitest';
import {
  createBoxBrush,
  createSequentialIdFactory,
  createStarterDocument,
  EditorSession,
  insertBrush,
  serializeMap,
} from '@jackharrhy/worldview-editor/core';
import {
  CollaborationController,
  EditorCollaborationBridge,
  CollaborationSocketClient,
  MemoryCollaborationOutbox,
  reconcilePendingOperations,
  type CollaborationChannel,
  type CollaborationSocket,
} from '../src/collaboration.js';

function channel(publish: (message: unknown) => void): CollaborationChannel {
  return {
    publish,
    addEventListener: () => {},
    close: () => {},
  } as CollaborationChannel;
}

describe('CollaborationController', () => {
  it('reapplies offline operations over a canonical snapshot and reports stale edits', () => {
    const before = createStarterDocument();
    const after = insertBrush(
      before,
      before.entities[0]!.id,
      createBoxBrush([0, 0, 0], [64, 64, 64], 'STONE', createSequentialIdFactory('reconcile')),
    );
    const operation = {
      schemaVersion: 1,
      operationId: 'alice:offline',
      transactionId: 'alice:offline',
      actorId: 'alice',
      baseMapVersion: 0,
      label: 'Offline edit',
      edits: [
        {
          kind: 'insert-brush',
          entityId: before.entities[0]!.id,
          insertionIndex: before.entities[0]!.primitives.length,
          brush: after.entities[0]!.primitives.at(-1)!,
        },
      ],
    } as const;
    expect(reconcilePendingOperations(before, [operation])).toMatchObject({
      document: after,
      conflicts: [],
    });
    expect(reconcilePendingOperations(after, [operation])).toMatchObject({
      document: after,
      conflicts: [{ operationId: operation.operationId }],
    });
  });

  it('persists before broadcasting and clears only acknowledged operations', async () => {
    const outbox = new MemoryCollaborationOutbox();
    const broadcast = vi.fn();
    const controller = new CollaborationController({
      mapId: 'room',
      actorId: 'alice',
      outbox,
      channel: channel(broadcast),
      createId: () => 'fixed',
    });
    const ids = createSequentialIdFactory('outbox');
    const before = createStarterDocument();
    const after = insertBrush(
      before,
      before.entities[0]!.id,
      createBoxBrush([0, 0, 0], [64, 64, 64], 'STONE', ids),
    );
    const operation = await controller.recordCommit('Create brush', before, after);

    expect(operation?.operationId).toBe('alice:1:fixed');
    expect((await controller.pending()).map((pending) => pending.operationId)).toEqual([
      'alice:1:fixed',
    ]);
    expect(broadcast).toHaveBeenCalledWith(operation);
    await controller.acknowledge(operation!.operationId, 1);
    expect(await controller.pending()).toEqual([]);
  });

  it('flushes the offline outbox on ready, handles ack/remote frames, and reconnects', async () => {
    const listeners = new Map<string, (event?: MessageEvent<string>) => void>();
    const sent: string[] = [];
    const socket: CollaborationSocket = {
      readyState: 1,
      addEventListener: (type: string, listener: (event?: MessageEvent<string>) => void) =>
        listeners.set(type, listener),
      send: (data) => sent.push(data),
      close: vi.fn(),
    } as CollaborationSocket;
    const outbox = new MemoryCollaborationOutbox();
    const peers = vi.fn();
    const controller = new CollaborationController({
      mapId: 'room',
      actorId: 'alice',
      outbox,
      channel: channel(() => {}),
      createId: () => 'fixed',
      onPeerOperation: peers,
    });
    const before = createStarterDocument();
    const ids = createSequentialIdFactory('socket');
    const after = insertBrush(
      before,
      before.entities[0]!.id,
      createBoxBrush([0, 0, 0], [64, 64, 64], 'STONE', ids),
    );
    const queued = await controller.recordCommit('Offline edit', before, after);
    let reconnect: (() => void) | null = null;
    let finishReconciliation: (() => void) | null = null;
    const client = new CollaborationSocketClient({
      endpoint: 'ws://localhost:8787',
      mapId: 'room',
      actorId: 'alice',
      controller,
      createSocket: () => socket,
      scheduleReconnect: (callback) => {
        reconnect = callback;
        return 1;
      },
      cancelReconnect: () => {},
      onReady: () =>
        new Promise<void>((resolve) => {
          finishReconciliation = resolve;
        }),
    });
    client.connect();
    listeners.get('message')?.({
      data: JSON.stringify({
        type: 'ready',
        mapId: 'room',
        mapVersion: 0,
        document: before,
        source: serializeMap(before),
        sourceSha256: 'a'.repeat(64),
      }),
    } as MessageEvent<string>);
    await vi.waitFor(() => expect(finishReconciliation).not.toBeNull());
    expect(sent).toHaveLength(0);
    listeners.get('message')?.({
      data: JSON.stringify({
        type: 'operation',
        mapVersion: 1,
        sourceSha256: 'b'.repeat(64),
        operation: queued,
      }),
    } as MessageEvent<string>);
    expect(peers).not.toHaveBeenCalled();
    finishReconciliation!();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    await vi.waitFor(() => expect(peers).toHaveBeenCalledWith(queued));
    expect(JSON.parse(sent[0]!).operation.operationId).toBe(queued?.operationId);
    listeners.get('message')?.({
      data: JSON.stringify({
        type: 'ack',
        mapVersion: 1,
        operationId: queued!.operationId,
        sourceSha256: 'b'.repeat(64),
      }),
    } as MessageEvent<string>);
    await vi.waitFor(async () => expect(await controller.pending()).toEqual([]));
    const rejected = await controller.recordCommit('Rejected edit', before, after);
    listeners.get('message')?.({
      data: JSON.stringify({
        type: 'conflict',
        operationId: rejected!.operationId,
        conflicts: [],
      }),
    } as MessageEvent<string>);
    await vi.waitFor(async () => expect(await controller.pending()).toEqual([]));
    listeners.get('close')?.();
    expect(reconnect).not.toBeNull();
    client.close();
  });

  it('sends operations committed after the room is ready without waiting for reconnect', async () => {
    const listeners = new Map<string, (event?: MessageEvent<string>) => void>();
    const sent: string[] = [];
    const socket: CollaborationSocket = {
      readyState: 1,
      addEventListener: (type: string, listener: (event?: MessageEvent<string>) => void) =>
        listeners.set(type, listener),
      send: (data) => sent.push(data),
      close: vi.fn(),
    } as CollaborationSocket;
    const controller = new CollaborationController({
      mapId: 'room',
      actorId: 'alice',
      outbox: new MemoryCollaborationOutbox(),
      channel: channel(() => {}),
      createId: () => 'live',
    });
    const client = new CollaborationSocketClient({
      endpoint: 'ws://localhost:8787',
      mapId: 'room',
      actorId: 'alice',
      controller,
      createSocket: () => socket,
    });
    const before = createStarterDocument();
    client.connect();
    listeners.get('message')?.({
      data: JSON.stringify({
        type: 'ready',
        mapId: 'room',
        mapVersion: 0,
        document: before,
        source: serializeMap(before),
        sourceSha256: 'a'.repeat(64),
      }),
    } as MessageEvent<string>);
    await vi.waitFor(() => expect(sent).toHaveLength(0));

    const ids = createSequentialIdFactory('live');
    const after = insertBrush(
      before,
      before.entities[0]!.id,
      createBoxBrush([0, 0, 0], [64, 64, 64], 'STONE', ids),
    );
    const operation = await controller.recordCommit('Live edit', before, after);

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!).operation.operationId).toBe(operation?.operationId);
    client.close();
  });

  it('authorizes the hosted WebSocket URL before opening it', async () => {
    let openedUrl = '';
    const socket: CollaborationSocket = {
      readyState: 1,
      addEventListener: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
    };
    const controller = new CollaborationController({
      mapId: 'hosted-map',
      actorId: 'alice',
      outbox: new MemoryCollaborationOutbox(),
      channel: channel(() => {}),
    });
    const client = new CollaborationSocketClient({
      endpoint: 'wss://worldview.example',
      mapId: 'hosted-map',
      actorId: 'alice',
      authorize: async () => 'signed-ticket',
      controller,
      createSocket: (url) => {
        openedUrl = url;
        return socket;
      },
    });

    client.connect();

    await vi.waitFor(() => expect(openedUrl).not.toBe(''));
    expect(new URL(openedUrl).searchParams.get('access_token')).toBe('signed-ticket');
    client.close();
  });

  it('bridges real EditorSession commits while keeping remote commits out of the local outbox', async () => {
    const outbox = new MemoryCollaborationOutbox();
    const controller = new CollaborationController({
      mapId: 'room',
      actorId: 'alice',
      outbox,
      channel: channel(() => {}),
      createId: () => 'fixed',
    });
    const session = new EditorSession(createStarterDocument());
    const bridge = new EditorCollaborationBridge(session, controller);
    const ids = createSequentialIdFactory('bridge');
    session.commitCreationCandidate(
      session.createBrushCandidate(createBoxBrush([0, 0, 0], [64, 64, 64], 'STONE', ids)),
    );
    await vi.waitFor(async () => expect(await controller.pending()).toHaveLength(1));
    const remote = (await controller.pending())[0]!;
    const inverse = await bridge.undo(remote);
    expect(inverse.label).toBe('Undo Create brush');
    expect(session.document.entities[0]!.primitives).toHaveLength(
      createStarterDocument().entities[0]!.primitives.length,
    );
    await controller.acknowledge(inverse.operationId, 2);
    await controller.acknowledge(remote.operationId, 1);
    bridge.receive({
      ...remote,
      operationId: 'bob:1',
      transactionId: 'bob:1',
      actorId: 'bob',
      edits: [],
    });
    expect(await controller.pending()).toEqual([]);
    const synchronized = insertBrush(
      session.document,
      session.document.entities[0]!.id,
      createBoxBrush([128, 0, 0], [192, 64, 64], 'STONE', ids),
    );
    bridge.synchronize(() => session.replaceDocument(synchronized, 'Hosted reconciliation'));
    expect(session.document).toBe(synchronized);
    expect(await controller.pending()).toEqual([]);
    bridge.close();
  });
});
