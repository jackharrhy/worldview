import type { EditorDirectoryHandle } from './project-workspace.js';
import { z } from 'zod';
import { EDITOR_STORES, openEditorDatabase } from './editor-database.js';

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

export interface ProjectLocalStateStorage {
  load(projectKey: string): Promise<LocalProjectState | null>;
  list(): Promise<readonly LocalProjectState[]>;
  save(state: LocalProjectState): Promise<void>;
}

export class IndexedDbProjectLocalStateStorage implements ProjectLocalStateStorage {
  public async load(projectKey: string): Promise<LocalProjectState | null> {
    const value: unknown = await (
      await openEditorDatabase()
    ).get(EDITOR_STORES.localProjects, projectKey);
    const state = LocalProjectStateSchema.safeParse(value);
    return state.success ? state.data : null;
  }

  public async list(): Promise<readonly LocalProjectState[]> {
    const values: unknown[] = await (
      await openEditorDatabase()
    ).getAll(EDITOR_STORES.localProjects);
    return values
      .flatMap((value) => {
        const state = LocalProjectStateSchema.safeParse(value);
        return state.success ? [state.data] : [];
      })
      .toSorted((left, right) => right.updatedAt - left.updatedAt);
  }

  public async save(state: LocalProjectState): Promise<void> {
    await (await openEditorDatabase()).put(EDITOR_STORES.localProjects, state);
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
