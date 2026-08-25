import { describe, expect, it, vi } from 'vitest';
import {
  createStarterDocument,
  rebaseMapSource,
  serializeMap,
} from '@jackharrhy/worldview-editor/core';

import {
  DocumentRecoveryService,
  recoverySourceIdFactory,
  type DocumentRecoverySnapshot,
  type DocumentRecoveryStorage,
} from '../src/document-recovery.js';
import { parseMapSource } from '@jackharrhy/worldview-editor/core';

class MemoryStorage implements DocumentRecoveryStorage {
  public readonly snapshots = new Map<string, DocumentRecoverySnapshot>();
  public readonly latestSnapshots = new Map<string, DocumentRecoverySnapshot>();

  public load(documentKey: string): Promise<DocumentRecoverySnapshot | null> {
    return Promise.resolve(this.latestSnapshots.get(documentKey) ?? null);
  }

  public save(snapshot: DocumentRecoverySnapshot): Promise<void> {
    this.snapshots.set(snapshot.snapshotId, snapshot);
    this.latestSnapshots.set(snapshot.documentKey, snapshot);
    return Promise.resolve();
  }

  public list(documentKey: string): Promise<readonly DocumentRecoverySnapshot[]> {
    return Promise.resolve(
      [...this.snapshots.values()]
        .filter((snapshot) => snapshot.documentKey === documentKey)
        .toSorted((left, right) => right.updatedAt - left.updatedAt),
    );
  }

  public removeSnapshot(snapshotId: string): Promise<void> {
    this.snapshots.delete(snapshotId);
    return Promise.resolve();
  }

  public updateSnapshot(snapshot: DocumentRecoverySnapshot): Promise<void> {
    this.snapshots.set(snapshot.snapshotId, snapshot);
    return Promise.resolve();
  }
}

function fixture(revision = 0) {
  const starter = { ...createStarterDocument(), revision };
  const text = serializeMap(starter);
  return {
    documentKey: 'maps/start.map',
    fileName: 'start.map',
    document: starter,
    source: rebaseMapSource(starter, text),
    savedDocumentRevision: 0,
    label: `Revision ${revision}`,
  };
}

describe('document recovery', () => {
  it('replays source-owned IDs when reopening the same disk bytes', () => {
    const source = fixture(3);
    const snapshot: DocumentRecoverySnapshot = {
      version: 1,
      snapshotId: 'snapshot',
      ...source,
      updatedAt: 1,
      protected: false,
    };
    const reopened = parseMapSource(
      snapshot.source.originalText,
      recoverySourceIdFactory(snapshot),
    );

    expect(reopened.document.id).toBe(snapshot.source.originalDocument.id);
    expect(reopened.document.entities.map(({ id }) => id)).toEqual(
      snapshot.source.originalDocument.entities.map(({ id }) => id),
    );
    expect(reopened.document.entities[0]?.brushes[0]?.faces[0]?.id).toBe(
      snapshot.source.originalDocument.entities[0]?.brushes[0]?.faces[0]?.id,
    );
  });

  it('debounces committed changes and retains the latest revision', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    let captured = fixture(1);
    const recovery = new DocumentRecoveryService(() => captured, storage, vi.fn(), 500);
    recovery.schedule();
    captured = fixture(2);
    recovery.schedule();
    await vi.advanceTimersByTimeAsync(500);
    await recovery.flush();

    expect((await recovery.latest(captured.documentKey))?.document.revision).toBe(2);
    expect(await recovery.list(captured.documentKey)).toHaveLength(1);
    recovery.dispose();
    vi.useRealTimers();
  });

  it('retains protected checkpoints while pruning automatic history', async () => {
    const storage = new MemoryStorage();
    let captured = fixture(0);
    const recovery = new DocumentRecoveryService(() => captured, storage, vi.fn(), 0, 2);
    await recovery.createCheckpoint('Before rebuild');
    for (let revision = 1; revision <= 4; revision += 1) {
      captured = fixture(revision);
      await recovery.flush();
    }

    const snapshots = await recovery.list(captured.documentKey);
    expect(snapshots.filter((snapshot) => snapshot.protected)).toHaveLength(1);
    expect(snapshots.filter((snapshot) => !snapshot.protected)).toHaveLength(2);
    recovery.dispose();
  });

  it('reports storage failures without changing the captured document', async () => {
    const captured = fixture(5);
    const storage = new MemoryStorage();
    storage.save = () => Promise.reject(new DOMException('quota full', 'QuotaExceededError'));
    const errors: unknown[] = [];
    const recovery = new DocumentRecoveryService(
      () => captured,
      storage,
      (error) => errors.push(error),
      0,
    );

    await recovery.flush();

    expect(errors).toHaveLength(1);
    expect(captured.document.revision).toBe(5);
    expect(await recovery.list(captured.documentKey)).toEqual([]);
    recovery.dispose();
  });
});
