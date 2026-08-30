import type { EditorDirectoryHandle } from './project-workspace.js';
import { z } from 'zod';

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
  readonly lastMapPath?: string | undefined;
  readonly updatedAt: number;
}

const DirectoryHandleSchema = z.custom<EditorDirectoryHandle>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'directory' &&
    'name' in value &&
    typeof value.name === 'string',
  { error: 'must be a directory handle' },
);

export const LocalProjectStateSchema = z.strictObject({
  version: z.literal(2),
  workspaceId: z.string().min(1).max(256),
  projectKey: z.string().min(1).max(4_096),
  displayName: z.string().min(1).max(4_096),
  handle: DirectoryHandleSchema,
  buildBindings: z.record(z.string().max(256), z.string().max(256)),
  lastMapPath: z.string().min(1).max(4_096).optional(),
  updatedAt: z.number().int().nonnegative(),
}) satisfies z.ZodType<LocalProjectState>;

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
      const state = LocalProjectStateSchema.safeParse(value);
      return state.success ? state.data : null;
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
        .flatMap((value) => {
          const state = LocalProjectStateSchema.safeParse(value);
          return state.success ? [state.data] : [];
        })
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
