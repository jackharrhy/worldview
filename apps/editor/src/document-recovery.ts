import {
  MapDocumentSchema,
  MapSourceStateSchema,
  type IdFactory,
  type MapDocument,
  type MapSourceState,
} from '@jackharrhy/worldview-editor/core';
import { z } from 'zod';
import { completeEditorTransaction, EDITOR_STORES, openEditorDatabase } from './editor-database.js';

export const DOCUMENT_RECOVERY_DEBOUNCE_MS = 500;
export const DOCUMENT_RECOVERY_LIMIT = 20;

export interface DocumentRecoverySnapshot {
  readonly version: 1;
  readonly snapshotId: string;
  readonly documentKey: string;
  readonly fileName: string;
  readonly document: MapDocument;
  readonly source: MapSourceState;
  readonly savedDocumentRevision: number;
  readonly updatedAt: number;
  readonly label: string;
  readonly protected: boolean;
}

export const DocumentRecoverySnapshotSchema = z.strictObject({
  version: z.literal(1),
  snapshotId: z.string().min(1).max(4_096),
  documentKey: z.string().min(1).max(4_096),
  fileName: z.string().min(1).max(4_096),
  document: MapDocumentSchema,
  source: MapSourceStateSchema,
  savedDocumentRevision: z.number().int().min(-1),
  updatedAt: z.number().int().nonnegative(),
  label: z.string().max(4_096),
  protected: z.boolean(),
}) satisfies z.ZodType<DocumentRecoverySnapshot>;

export interface DocumentRecoveryStorage {
  load(documentKey: string): Promise<DocumentRecoverySnapshot | null>;
  save(snapshot: DocumentRecoverySnapshot): Promise<void>;
  list(documentKey: string): Promise<readonly DocumentRecoverySnapshot[]>;
  removeSnapshot(snapshotId: string): Promise<void>;
  updateSnapshot(snapshot: DocumentRecoverySnapshot): Promise<void>;
}

/** Replays the source-owned IDs so a reopened disk file and its recovery snapshot share anchors. */
export function recoverySourceIdFactory(snapshot: DocumentRecoverySnapshot): IdFactory {
  const document = snapshot.source.originalDocument;
  const entities = [...document.entities];
  const primitives = document.entities.flatMap((entity) => entity.primitives);
  const brushes = primitives.filter((primitive) => primitive.kind === 'brush');
  const patches = primitives.filter((primitive) => primitive.kind === 'patch');
  const brushDefs = primitives.filter((primitive) => primitive.kind === 'brush-def');
  const faceIds = primitives.flatMap((primitive) =>
    primitive.kind === 'brush'
      ? primitive.faces.map((face) => face.id)
      : primitive.kind === 'brush-def'
        ? primitive.faces.map((face) => face.id)
        : [],
  );
  return {
    document: () => document.id,
    entity: () => {
      const entity = entities.shift();
      if (!entity) throw new Error('Recovery source contains fewer entity IDs than the disk map');
      return entity.id;
    },
    brush: () => {
      const brush = brushes.shift();
      if (!brush) throw new Error('Recovery source contains fewer brush IDs than the disk map');
      return brush.id;
    },
    patch: () => {
      const patch = patches.shift();
      if (!patch) throw new Error('Recovery source contains fewer patch IDs than the disk map');
      return patch.id;
    },
    brushDef: () => {
      const brushDef = brushDefs.shift();
      if (!brushDef)
        throw new Error('Recovery source contains fewer brushDef IDs than the disk map');
      return brushDef.id;
    },
    face: () => {
      const faceId = faceIds.shift();
      if (!faceId) throw new Error('Recovery source contains fewer face IDs than the disk map');
      return faceId;
    },
  };
}

export class IndexedDbDocumentRecoveryStorage implements DocumentRecoveryStorage {
  public async load(documentKey: string): Promise<DocumentRecoverySnapshot | null> {
    const value: unknown = await (
      await openEditorDatabase()
    ).get(EDITOR_STORES.recoveryLatest, documentKey);
    const snapshot = DocumentRecoverySnapshotSchema.safeParse(value);
    return snapshot.success ? snapshot.data : null;
  }

  public async save(snapshot: DocumentRecoverySnapshot): Promise<void> {
    const database = await openEditorDatabase();
    const transaction = database.transaction(
      [EDITOR_STORES.recoveryLatest, EDITOR_STORES.recoveryHistory],
      'readwrite',
    );
    await completeEditorTransaction(
      transaction,
      Promise.all([
        transaction.objectStore(EDITOR_STORES.recoveryLatest).put(snapshot),
        transaction.objectStore(EDITOR_STORES.recoveryHistory).put(snapshot),
      ]).then(() => undefined),
    );
  }

  public async list(documentKey: string): Promise<readonly DocumentRecoverySnapshot[]> {
    const values: unknown[] = await (
      await openEditorDatabase()
    ).getAllFromIndex(EDITOR_STORES.recoveryHistory, 'documentKey', documentKey);
    return values
      .flatMap((value) => {
        const snapshot = DocumentRecoverySnapshotSchema.safeParse(value);
        return snapshot.success ? [snapshot.data] : [];
      })
      .toSorted((left, right) => right.updatedAt - left.updatedAt);
  }

  public async removeSnapshot(snapshotId: string): Promise<void> {
    await (await openEditorDatabase()).delete(EDITOR_STORES.recoveryHistory, snapshotId);
  }

  public async updateSnapshot(snapshot: DocumentRecoverySnapshot): Promise<void> {
    await (await openEditorDatabase()).put(EDITOR_STORES.recoveryHistory, snapshot);
  }
}

export interface DocumentRecoverySource {
  readonly documentKey: string;
  readonly fileName: string;
  readonly document: MapDocument;
  readonly source: MapSourceState;
  readonly savedDocumentRevision: number;
  readonly label: string;
}

export class DocumentRecoveryService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly onPageHide = () => void this.flush();
  private readonly onVisibilityChange = () => {
    if (globalThis.document?.visibilityState === 'hidden') void this.flush();
  };

  public constructor(
    private readonly capture: () => DocumentRecoverySource,
    private readonly storage: DocumentRecoveryStorage = new IndexedDbDocumentRecoveryStorage(),
    private readonly onError: (error: unknown) => void = console.error,
    private readonly debounceMs = DOCUMENT_RECOVERY_DEBOUNCE_MS,
    private readonly retentionLimit = DOCUMENT_RECOVERY_LIMIT,
  ) {
    globalThis.window?.addEventListener('pagehide', this.onPageHide);
    globalThis.document?.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  public schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  public flush(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const captured = this.capture();
    const snapshot = this.snapshot(captured, {
      snapshotId: `${captured.documentKey}:revision:${captured.document.revision}`,
      protected: false,
    });
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(() => this.storage.save(snapshot))
      .then(() => this.prune(captured.documentKey))
      .catch(this.onError);
    return this.writeChain;
  }

  public latest(documentKey: string): Promise<DocumentRecoverySnapshot | null> {
    return this.storage.load(documentKey);
  }

  public list(documentKey: string): Promise<readonly DocumentRecoverySnapshot[]> {
    return this.storage.list(documentKey);
  }

  public async createCheckpoint(label: string): Promise<DocumentRecoverySnapshot> {
    const captured = this.capture();
    const now = Date.now();
    const snapshot = this.snapshot(captured, {
      snapshotId: `${captured.documentKey}:checkpoint:${now}`,
      label: label.trim() || `Checkpoint ${new Date(now).toLocaleString()}`,
      protected: true,
      updatedAt: now,
    });
    await this.storage.save(snapshot);
    await this.prune(captured.documentKey);
    return snapshot;
  }

  public async setProtected(snapshotId: string, protectedSnapshot: boolean): Promise<void> {
    const key = this.capture().documentKey;
    const snapshot = (await this.storage.list(key)).find(
      (candidate) => candidate.snapshotId === snapshotId,
    );
    if (!snapshot) return;
    await this.storage.updateSnapshot({ ...snapshot, protected: protectedSnapshot });
    await this.prune(key);
  }

  public dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    globalThis.window?.removeEventListener('pagehide', this.onPageHide);
    globalThis.document?.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private snapshot(
    captured: DocumentRecoverySource,
    options: {
      readonly snapshotId: string;
      readonly label?: string;
      readonly protected: boolean;
      readonly updatedAt?: number;
    },
  ): DocumentRecoverySnapshot {
    return {
      version: 1,
      snapshotId: options.snapshotId,
      documentKey: captured.documentKey,
      fileName: captured.fileName,
      document: structuredClone(captured.document),
      source: structuredClone(captured.source),
      savedDocumentRevision: captured.savedDocumentRevision,
      updatedAt: options.updatedAt ?? Date.now(),
      label: options.label ?? captured.label,
      protected: options.protected,
    };
  }

  private async prune(documentKey: string): Promise<void> {
    const snapshots = await this.storage.list(documentKey);
    const removable = snapshots.filter((snapshot) => !snapshot.protected);
    await Promise.all(
      removable
        .slice(this.retentionLimit)
        .map((snapshot) => this.storage.removeSnapshot(snapshot.snapshotId)),
    );
  }
}
