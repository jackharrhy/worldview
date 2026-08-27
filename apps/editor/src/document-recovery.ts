import type { IdFactory, MapDocument, MapSourceState } from '@jackharrhy/worldview-editor/core';

const DATABASE_NAME = 'worldview-editor-recovery';
const DATABASE_VERSION = 1;
const LATEST_STORE = 'documents';
const HISTORY_STORE = 'history';
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
  const brushes = document.entities.flatMap((entity) => entity.brushes);
  const faces = brushes.flatMap((brush) => brush.faces);
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
    face: () => {
      const face = faces.shift();
      if (!face) throw new Error('Recovery source contains fewer face IDs than the disk map');
      return face.id;
    },
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('Recovery storage request failed')),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('Recovery transaction failed')),
      { once: true },
    );
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('Recovery transaction aborted')),
      { once: true },
    );
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LATEST_STORE)) {
        database.createObjectStore(LATEST_STORE, { keyPath: 'documentKey' });
      }
      if (!database.objectStoreNames.contains(HISTORY_STORE)) {
        const history = database.createObjectStore(HISTORY_STORE, { keyPath: 'snapshotId' });
        history.createIndex('documentKey', 'documentKey', { unique: false });
      }
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('Could not open recovery storage')),
      { once: true },
    );
  });
}

function isSnapshot(value: unknown): value is DocumentRecoverySnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<DocumentRecoverySnapshot>;
  return (
    snapshot.version === 1 &&
    typeof snapshot.snapshotId === 'string' &&
    typeof snapshot.documentKey === 'string' &&
    typeof snapshot.fileName === 'string' &&
    typeof snapshot.savedDocumentRevision === 'number' &&
    typeof snapshot.updatedAt === 'number' &&
    typeof snapshot.label === 'string' &&
    typeof snapshot.protected === 'boolean' &&
    Boolean(snapshot.document) &&
    Boolean(snapshot.source)
  );
}

export class IndexedDbDocumentRecoveryStorage implements DocumentRecoveryStorage {
  public async load(documentKey: string): Promise<DocumentRecoverySnapshot | null> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(LATEST_STORE, 'readonly');
      const value: unknown = await requestResult(
        transaction.objectStore(LATEST_STORE).get(documentKey),
      );
      return isSnapshot(value) ? value : null;
    } finally {
      database.close();
    }
  }

  public async save(snapshot: DocumentRecoverySnapshot): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction([LATEST_STORE, HISTORY_STORE], 'readwrite');
      transaction.objectStore(LATEST_STORE).put(snapshot);
      transaction.objectStore(HISTORY_STORE).put(snapshot);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }

  public async list(documentKey: string): Promise<readonly DocumentRecoverySnapshot[]> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(HISTORY_STORE, 'readonly');
      const values: unknown[] = await requestResult(
        transaction.objectStore(HISTORY_STORE).index('documentKey').getAll(documentKey),
      );
      return values.filter(isSnapshot).toSorted((left, right) => right.updatedAt - left.updatedAt);
    } finally {
      database.close();
    }
  }

  public async removeSnapshot(snapshotId: string): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(HISTORY_STORE, 'readwrite');
      transaction.objectStore(HISTORY_STORE).delete(snapshotId);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }

  public async updateSnapshot(snapshot: DocumentRecoverySnapshot): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(HISTORY_STORE, 'readwrite');
      transaction.objectStore(HISTORY_STORE).put(snapshot);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
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
