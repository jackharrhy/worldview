import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { StoredAssetMount } from './asset-mount-state.js';
import type { MapBuildHistoryRecord } from './build-history.js';
import type {
  DetachedHostedMap,
  StoredCollaborationOperation,
  StoredCollaborationSession,
} from './collaboration-outbox.js';
import type { DocumentRecoverySnapshot } from './document-recovery.js';
import type { LocalProjectState } from './project-local-state.js';

export const EDITOR_DATABASE_NAME = 'worldview-editor';
export const EDITOR_DATABASE_VERSION = 1;

export const EDITOR_STORES = {
  assetMounts: 'asset-mounts',
  buildHistory: 'build-history',
  collaborationOperations: 'collaboration-operations',
  collaborationSessions: 'collaboration-sessions',
  detachedMaps: 'detached-maps',
  localProjects: 'local-projects',
  recoveryHistory: 'recovery-history',
  recoveryLatest: 'recovery-latest',
} as const;

interface EditorDatabaseSchema extends DBSchema {
  'asset-mounts': {
    readonly key: string;
    readonly value: StoredAssetMount;
    readonly indexes: { readonly scopeId: string };
  };
  'build-history': {
    readonly key: string;
    readonly value: MapBuildHistoryRecord;
    readonly indexes: { readonly mapKey: string };
  };
  'collaboration-operations': {
    readonly key: string;
    readonly value: StoredCollaborationOperation;
    readonly indexes: { readonly mapId: string };
  };
  'collaboration-sessions': {
    readonly key: string;
    readonly value: StoredCollaborationSession;
  };
  'detached-maps': {
    readonly key: string;
    readonly value: DetachedHostedMap;
    readonly indexes: {
      readonly originalMapId: string;
      readonly createdAt: number;
    };
  };
  'local-projects': {
    readonly key: string;
    readonly value: LocalProjectState;
  };
  'recovery-history': {
    readonly key: string;
    readonly value: DocumentRecoverySnapshot;
    readonly indexes: { readonly documentKey: string };
  };
  'recovery-latest': {
    readonly key: string;
    readonly value: DocumentRecoverySnapshot;
  };
}

export type EditorDatabase = IDBPDatabase<EditorDatabaseSchema>;

let databasePromise: Promise<EditorDatabase> | null = null;

function createStores(database: EditorDatabase): void {
  const assetMounts = database.createObjectStore(EDITOR_STORES.assetMounts, { keyPath: 'id' });
  assetMounts.createIndex('scopeId', 'scopeId');

  const buildHistory = database.createObjectStore(EDITOR_STORES.buildHistory, {
    keyPath: 'buildId',
  });
  buildHistory.createIndex('mapKey', 'mapKey');

  const operations = database.createObjectStore(EDITOR_STORES.collaborationOperations, {
    keyPath: 'key',
  });
  operations.createIndex('mapId', 'mapId');

  database.createObjectStore(EDITOR_STORES.collaborationSessions, { keyPath: 'mapId' });

  const detachedMaps = database.createObjectStore(EDITOR_STORES.detachedMaps, { keyPath: 'id' });
  detachedMaps.createIndex('originalMapId', 'originalMapId');
  detachedMaps.createIndex('createdAt', 'createdAt');

  database.createObjectStore(EDITOR_STORES.localProjects, { keyPath: 'projectKey' });

  const recoveryHistory = database.createObjectStore(EDITOR_STORES.recoveryHistory, {
    keyPath: 'snapshotId',
  });
  recoveryHistory.createIndex('documentKey', 'documentKey');
  database.createObjectStore(EDITOR_STORES.recoveryLatest, { keyPath: 'documentKey' });
}

/** One shared, typed connection for machine-local editor state. Stored values remain untrusted. */
export function openEditorDatabase(): Promise<EditorDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable'));
  if (databasePromise) return databasePromise;

  let connection: EditorDatabase | null = null;
  const pending = openDB<EditorDatabaseSchema>(EDITOR_DATABASE_NAME, EDITOR_DATABASE_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion === 0) createStores(database);
    },
    blocking() {
      connection?.close();
      databasePromise = null;
    },
    terminated() {
      databasePromise = null;
    },
  }).then((database) => {
    connection = database;
    return database;
  });
  databasePromise = pending.catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

export async function closeEditorDatabase(): Promise<void> {
  const pending = databasePromise;
  databasePromise = null;
  (await pending?.catch(() => null))?.close();
}

/** Intended for settings/reset flows and isolated persistence tests. */
export async function deleteEditorDatabase(): Promise<void> {
  await closeEditorDatabase();
  if (!globalThis.indexedDB) return;
  await deleteDB(EDITOR_DATABASE_NAME);
}

interface CompletableTransaction {
  readonly done: Promise<unknown>;
  abort(): void;
}

/** Awaits both request work and commit, and turns an AbortSignal into a real transaction abort. */
export async function completeEditorTransaction<Result>(
  transaction: CompletableTransaction,
  work: Promise<Result>,
  signal?: AbortSignal,
): Promise<Result> {
  const abort = () => {
    try {
      transaction.abort();
    } catch {
      // The transaction may already have committed between the signal and this callback.
    }
  };
  if (signal?.aborted) {
    abort();
    throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  }
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const [result] = await Promise.all([work, transaction.done]);
    return result;
  } catch (error) {
    abort();
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
