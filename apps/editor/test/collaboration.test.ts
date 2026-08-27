import { describe, expect, it, vi } from 'vitest';
import {
  createBoxBrush,
  createSequentialIdFactory,
  createStarterDocument,
  EditorSession,
  insertBrush,
} from '@jackharrhy/worldview-editor/core';
import {
  CollaborationController,
  EditorCollaborationBridge,
  CollaborationSocketClient,
  MemoryCollaborationOutbox,
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
  it('persists before broadcasting and clears only acknowledged operations', async () => {
    const outbox = new MemoryCollaborationOutbox();
    const broadcast = vi.fn();
    const controller = new CollaborationController({
      roomId: 'room',
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
      roomId: 'room',
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
    const client = new CollaborationSocketClient({
      endpoint: 'ws://localhost:8787',
      roomId: 'room',
      actorId: 'alice',
      controller,
      createSocket: () => socket,
      scheduleReconnect: (callback) => {
        reconnect = callback;
        return 1;
      },
      cancelReconnect: () => {},
    });
    client.connect();
    listeners.get('message')?.({
      data: JSON.stringify({ type: 'ready', roomVersion: 0, document: before }),
    } as MessageEvent<string>);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(JSON.parse(sent[0]!).operation.operationId).toBe(queued?.operationId);
    listeners.get('message')?.({
      data: JSON.stringify({ type: 'ack', roomVersion: 1, operationId: queued!.operationId }),
    } as MessageEvent<string>);
    await vi.waitFor(async () => expect(await controller.pending()).toEqual([]));
    listeners.get('message')?.({
      data: JSON.stringify({ type: 'operation', roomVersion: 2, operation: queued }),
    } as MessageEvent<string>);
    expect(peers).toHaveBeenCalledWith(queued);
    listeners.get('close')?.();
    expect(reconnect).not.toBeNull();
    client.close();
  });

  it('bridges real EditorSession commits while keeping remote commits out of the local outbox', async () => {
    const outbox = new MemoryCollaborationOutbox();
    const controller = new CollaborationController({
      roomId: 'room',
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
    expect(session.document.entities[0]!.brushes).toHaveLength(
      createStarterDocument().entities[0]!.brushes.length,
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
    bridge.close();
  });
});
