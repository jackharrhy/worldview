import type { MapCompileResult } from '@jackharrhy/worldview-editor/core';

const DATABASE_NAME = 'worldview-editor-builds';
const DATABASE_VERSION = 1;
const BUILD_STORE = 'builds';
export const BUILD_HISTORY_LIMIT = 20;

export interface MapBuildHistoryRecord {
  readonly version: 1;
  readonly buildId: string;
  readonly mapKey: string;
  readonly createdAt: number;
  readonly result: MapCompileResult;
}

export interface MapBuildHistoryStorage {
  save(record: MapBuildHistoryRecord): Promise<void>;
  list(mapKey: string): Promise<readonly MapBuildHistoryRecord[]>;
  remove(buildId: string): Promise<void>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('Build history request failed')),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('Build history transaction failed')),
      { once: true },
    );
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('Build history transaction aborted')),
      { once: true },
    );
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      if (request.result.objectStoreNames.contains(BUILD_STORE)) return;
      const store = request.result.createObjectStore(BUILD_STORE, { keyPath: 'buildId' });
      store.createIndex('mapKey', 'mapKey', { unique: false });
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('Could not open build history')),
      { once: true },
    );
  });
}

function buildRecord(value: unknown): value is MapBuildHistoryRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MapBuildHistoryRecord>;
  return (
    candidate.version === 1 &&
    typeof candidate.buildId === 'string' &&
    typeof candidate.mapKey === 'string' &&
    typeof candidate.createdAt === 'number' &&
    Boolean(candidate.result)
  );
}

export class IndexedDbMapBuildHistoryStorage implements MapBuildHistoryStorage {
  public async save(record: MapBuildHistoryRecord): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BUILD_STORE, 'readwrite');
      transaction.objectStore(BUILD_STORE).put(record);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }

  public async list(mapKey: string): Promise<readonly MapBuildHistoryRecord[]> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BUILD_STORE, 'readonly');
      const values: unknown[] = await requestResult(
        transaction.objectStore(BUILD_STORE).index('mapKey').getAll(mapKey),
      );
      return values.filter(buildRecord).toSorted((left, right) => right.createdAt - left.createdAt);
    } finally {
      database.close();
    }
  }

  public async remove(buildId: string): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BUILD_STORE, 'readwrite');
      transaction.objectStore(BUILD_STORE).delete(buildId);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }
}

function quotaFailure(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}

export class MapBuildHistoryService {
  private lastTimestamp = 0;

  public constructor(
    private readonly storage: MapBuildHistoryStorage = new IndexedDbMapBuildHistoryStorage(),
    private readonly onError: (error: unknown) => void = console.error,
    private readonly retentionLimit = BUILD_HISTORY_LIMIT,
  ) {}

  public async record(mapKey: string, result: MapCompileResult): Promise<void> {
    const createdAt = Math.max(Date.now(), this.lastTimestamp + 1);
    this.lastTimestamp = createdAt;
    const record: MapBuildHistoryRecord = {
      version: 1,
      buildId: result.buildId,
      mapKey,
      createdAt,
      result: structuredClone(result),
    };
    try {
      await this.storage.save(record);
    } catch (error) {
      if (!quotaFailure(error)) {
        this.onError(error);
        return;
      }
      const existing = await this.storage.list(mapKey);
      for (const expired of existing.slice(Math.max(0, Math.floor(this.retentionLimit / 2)))) {
        await this.storage.remove(expired.buildId);
      }
      try {
        await this.storage.save(record);
      } catch (retryError) {
        this.onError(retryError);
        return;
      }
    }
    const records = await this.storage.list(mapKey);
    for (const expired of records.slice(this.retentionLimit)) {
      await this.storage.remove(expired.buildId);
    }
  }

  public list(mapKey: string): Promise<readonly MapBuildHistoryRecord[]> {
    return this.storage.list(mapKey);
  }
}
