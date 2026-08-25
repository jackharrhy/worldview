import { describe, expect, it } from 'vitest';

import {
  ProjectLocalStateService,
  type LocalProjectState,
  type ProjectLocalStateStorage,
} from '../src/project-local-state.js';
import type { EditorDirectoryHandle } from '../src/project-workspace.js';

class MemoryProjectStateStorage implements ProjectLocalStateStorage {
  public readonly states = new Map<string, LocalProjectState>();

  public load(projectKey: string): Promise<LocalProjectState | null> {
    return Promise.resolve(this.states.get(projectKey) ?? null);
  }

  public list(): Promise<readonly LocalProjectState[]> {
    return Promise.resolve(
      [...this.states.values()].toSorted((left, right) => right.updatedAt - left.updatedAt),
    );
  }

  public save(state: LocalProjectState): Promise<void> {
    this.states.set(state.projectKey, state);
    return Promise.resolve();
  }
}

function handle(name: string): EditorDirectoryHandle {
  return {
    kind: 'directory',
    name,
    getFileHandle: () => Promise.reject(new Error('unused')),
    getDirectoryHandle: () => Promise.reject(new Error('unused')),
    async *entries() {},
  };
}

describe('machine-local project state', () => {
  it('remembers directory handles and logical build-profile bindings', async () => {
    const storage = new MemoryProjectStateStorage();
    const projects = new ProjectLocalStateService(storage);
    const directory = handle('quake-project');

    await projects.remember('quake', directory);
    await projects.setBuildBinding('quake', directory, 'preview', 'local-fast');

    expect(await projects.load('quake')).toMatchObject({
      handle: directory,
      buildBindings: { preview: 'local-fast' },
    });
  });

  it('returns the most recently used project without putting handles in the manifest', async () => {
    const storage = new MemoryProjectStateStorage();
    const projects = new ProjectLocalStateService(storage);
    storage.states.set('old', {
      version: 1,
      projectKey: 'old',
      handle: handle('old'),
      buildBindings: {},
      updatedAt: 1,
    });
    storage.states.set('new', {
      version: 1,
      projectKey: 'new',
      handle: handle('new'),
      buildBindings: {},
      updatedAt: 2,
    });

    expect((await projects.latest())?.projectKey).toBe('new');
  });
});
