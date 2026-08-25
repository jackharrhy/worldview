import type { EditorDirectoryHandle } from './project-workspace.js';

const DATABASE_NAME = 'worldview-editor-local-projects';
const DATABASE_VERSION = 1;
const PROJECT_STORE = 'projects';

export interface LocalProjectState {
  readonly version: 1;
  readonly projectKey: string;
  readonly handle: EditorDirectoryHandle;
  readonly buildBindings: Readonly<Record<string, string>>;
  readonly updatedAt: number;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('Local project state request failed')),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('Local project state transaction failed')),
      { once: true },
    );
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('Local project state transaction aborted')),
      { once: true },
    );
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(PROJECT_STORE)) {
        request.result.createObjectStore(PROJECT_STORE, { keyPath: 'projectKey' });
      }
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('Could not open local project state')),
      { once: true },
    );
  });
}

function isLocalProjectState(value: unknown): value is LocalProjectState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LocalProjectState>;
  return (
    candidate.version === 1 &&
    typeof candidate.projectKey === 'string' &&
    candidate.handle?.kind === 'directory' &&
    Boolean(candidate.buildBindings) &&
    typeof candidate.updatedAt === 'number'
  );
}

export class ProjectLocalStateService {
  public async load(projectKey: string): Promise<LocalProjectState | null> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(PROJECT_STORE, 'readonly');
      const value: unknown = await requestResult(
        transaction.objectStore(PROJECT_STORE).get(projectKey),
      );
      return isLocalProjectState(value) ? value : null;
    } finally {
      database.close();
    }
  }

  public async remember(projectKey: string, handle: EditorDirectoryHandle): Promise<void> {
    const previous = await this.load(projectKey);
    await this.save({
      version: 1,
      projectKey,
      handle,
      buildBindings: previous?.buildBindings ?? {},
      updatedAt: Date.now(),
    });
  }

  public async setBuildBinding(
    projectKey: string,
    handle: EditorDirectoryHandle,
    logicalProfileId: string,
    capabilityId: string,
  ): Promise<void> {
    const previous = await this.load(projectKey);
    await this.save({
      version: 1,
      projectKey,
      handle,
      buildBindings: { ...previous?.buildBindings, [logicalProfileId]: capabilityId },
      updatedAt: Date.now(),
    });
  }

  private async save(state: LocalProjectState): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(PROJECT_STORE, 'readwrite');
      transaction.objectStore(PROJECT_STORE).put(state);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }
}
