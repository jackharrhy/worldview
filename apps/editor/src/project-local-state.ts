import type { EditorDirectoryHandle } from './project-workspace.js';

const DATABASE_NAME = 'worldview-editor-local-projects';
const DATABASE_VERSION = 2;
const PROJECT_STORE = 'projects';

export interface LocalProjectState {
  readonly version: 2;
  readonly workspaceId: string;
  readonly projectKey: string;
  readonly displayName: string;
  readonly handle: EditorDirectoryHandle;
  readonly buildBindings: Readonly<Record<string, string>>;
  readonly lastMapPath?: string;
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
    request.addEventListener('upgradeneeded', (event) => {
      if (!request.result.objectStoreNames.contains(PROJECT_STORE)) {
        request.result.createObjectStore(PROJECT_STORE, { keyPath: 'projectKey' });
      } else if ((event as IDBVersionChangeEvent).oldVersion < 2 && request.transaction) {
        const cursorRequest = request.transaction.objectStore(PROJECT_STORE).openCursor();
        cursorRequest.addEventListener('success', () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const previous = cursor.value as {
            readonly projectKey: string;
            readonly handle: EditorDirectoryHandle;
            readonly buildBindings?: Readonly<Record<string, string>>;
            readonly updatedAt?: number;
          };
          cursor.update({
            ...previous,
            version: 2,
            workspaceId: crypto.randomUUID(),
            displayName: previous.handle.name,
            buildBindings: previous.buildBindings ?? {},
            updatedAt: previous.updatedAt ?? Date.now(),
          });
          cursor.continue();
        });
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
    candidate.version === 2 &&
    typeof candidate.workspaceId === 'string' &&
    typeof candidate.projectKey === 'string' &&
    typeof candidate.displayName === 'string' &&
    candidate.handle?.kind === 'directory' &&
    Boolean(candidate.buildBindings) &&
    typeof candidate.updatedAt === 'number'
  );
}

export interface ProjectLocalStateStorage {
  load(projectKey: string): Promise<LocalProjectState | null>;
  list(): Promise<readonly LocalProjectState[]>;
  save(state: LocalProjectState): Promise<void>;
}

export class IndexedDbProjectLocalStateStorage implements ProjectLocalStateStorage {
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

  public async list(): Promise<readonly LocalProjectState[]> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(PROJECT_STORE, 'readonly');
      const values: unknown[] = await requestResult(
        transaction.objectStore(PROJECT_STORE).getAll(),
      );
      return values
        .filter(isLocalProjectState)
        .toSorted((left, right) => right.updatedAt - left.updatedAt);
    } finally {
      database.close();
    }
  }

  public async save(state: LocalProjectState): Promise<void> {
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

export class ProjectLocalStateService {
  public constructor(
    private readonly storage: ProjectLocalStateStorage = new IndexedDbProjectLocalStateStorage(),
  ) {}

  public load(projectKey: string): Promise<LocalProjectState | null> {
    return this.storage.load(projectKey);
  }

  public async latest(): Promise<LocalProjectState | null> {
    return (await this.storage.list())[0] ?? null;
  }

  public list(): Promise<readonly LocalProjectState[]> {
    return this.storage.list();
  }

  public async remember(
    projectKey: string,
    handle: EditorDirectoryHandle,
    displayName = handle.name,
  ): Promise<LocalProjectState | null> {
    try {
      const exact = await this.load(projectKey);
      const previous =
        exact ??
        (await this.storage.list()).find((candidate) => candidate.handle === handle) ??
        (await this.findSameDirectory(handle));
      const state: LocalProjectState = {
        version: 2,
        workspaceId: previous?.workspaceId ?? crypto.randomUUID(),
        projectKey: previous?.projectKey ?? projectKey,
        displayName,
        handle,
        buildBindings: previous?.buildBindings ?? {},
        ...(previous?.lastMapPath ? { lastMapPath: previous.lastMapPath } : {}),
        updatedAt: Date.now(),
      };
      await this.storage.save(state);
      return state;
    } catch {
      return null;
    }
  }

  private async findSameDirectory(
    handle: EditorDirectoryHandle,
  ): Promise<LocalProjectState | null> {
    if (!handle.isSameEntry) return null;
    for (const candidate of await this.storage.list()) {
      try {
        if (await handle.isSameEntry(candidate.handle)) return candidate;
      } catch {
        // A revoked or stale handle is simply not a match.
      }
    }
    return null;
  }

  public async setLastMap(projectKey: string, path: string): Promise<void> {
    const previous = await this.load(projectKey);
    if (!previous) return;
    await this.storage.save({ ...previous, lastMapPath: path, updatedAt: Date.now() });
  }

  public async setBuildBinding(
    projectKey: string,
    handle: EditorDirectoryHandle,
    logicalProfileId: string,
    capabilityId: string,
  ): Promise<void> {
    const previous = await this.load(projectKey);
    await this.storage.save({
      version: 2,
      workspaceId: previous?.workspaceId ?? crypto.randomUUID(),
      projectKey,
      displayName: previous?.displayName ?? handle.name,
      handle,
      buildBindings: { ...previous?.buildBindings, [logicalProfileId]: capabilityId },
      ...(previous?.lastMapPath ? { lastMapPath: previous.lastMapPath } : {}),
      updatedAt: Date.now(),
    });
  }
}
