import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createStarterDocument,
  rebaseMapSource,
  serializeMap,
  type MapCompileResult,
} from '@jackharrhy/worldview-editor/core';

import { IndexedDbAssetMountStorage } from '../src/asset-mount-state.js';
import { IndexedDbMapBuildHistoryStorage } from '../src/build-history.js';
import { IndexedDbDocumentRecoveryStorage } from '../src/document-recovery.js';
import {
  completeEditorTransaction,
  deleteEditorDatabase,
  EDITOR_DATABASE_VERSION,
  EDITOR_STORES,
  openEditorDatabase,
} from '../src/editor-database.js';
import { IndexedDbProjectLocalStateStorage } from '../src/project-local-state.js';
import type { EditorDirectoryHandle } from '../src/project-workspace.js';

beforeEach(deleteEditorDatabase);
afterEach(deleteEditorDatabase);

function compileResult(buildId: string): MapCompileResult {
  return {
    backend: 'remote',
    status: 'succeeded',
    buildId,
    sourceDocumentRevision: 1,
    diagnostics: [],
    artifacts: [],
    logs: [],
    elapsedMilliseconds: 1,
  };
}

describe('typed editor database', () => {
  it('creates the complete v1 schema and its query indexes in one upgrade', async () => {
    const database = await openEditorDatabase();

    expect(database.version).toBe(EDITOR_DATABASE_VERSION);
    expect([...database.objectStoreNames].toSorted()).toEqual(
      Object.values(EDITOR_STORES).toSorted(),
    );
    expect(
      [...database.transaction(EDITOR_STORES.collaborationOperations).store.indexNames].toSorted(),
    ).toEqual(['mapId']);
    expect(
      [...database.transaction(EDITOR_STORES.detachedMaps).store.indexNames].toSorted(),
    ).toEqual(['createdAt', 'originalMapId']);
  });

  it('round-trips each independently owned persistence record through idb', async () => {
    const document = createStarterDocument();
    const text = serializeMap(document);
    const source = rebaseMapSource(document, text);

    const recovery = new IndexedDbDocumentRecoveryStorage();
    await recovery.save({
      version: 1,
      snapshotId: 'recovery-1',
      documentKey: 'map-1',
      fileName: 'one.map',
      document,
      source,
      savedDocumentRevision: -1,
      updatedAt: 10,
      label: 'Recovery',
      protected: false,
    });
    expect((await recovery.load('map-1'))?.snapshotId).toBe('recovery-1');
    expect(await recovery.list('map-1')).toHaveLength(1);

    const projects = new IndexedDbProjectLocalStateStorage();
    const handle = { kind: 'directory', name: 'maps' } as EditorDirectoryHandle;
    await projects.save({
      version: 2,
      workspaceId: 'workspace',
      projectKey: 'project',
      displayName: 'Maps',
      handle,
      buildBindings: {},
      updatedAt: 20,
    });
    expect((await projects.load('project'))?.displayName).toBe('Maps');

    const mounts = new IndexedDbAssetMountStorage();
    await mounts.put({
      id: 'mount',
      scopeId: 'map-1',
      kind: 'builtin',
      label: 'Built in',
      priority: 0,
      profile: 'quake',
    });
    expect(await mounts.list('map-1')).toHaveLength(1);

    const builds = new IndexedDbMapBuildHistoryStorage();
    await builds.save({
      version: 1,
      buildId: 'build-1',
      mapKey: 'map-1',
      createdAt: 30,
      result: compileResult('build-1'),
    });
    expect((await builds.list('map-1'))[0]?.buildId).toBe('build-1');
  });

  it('aborts a live readwrite transaction when its signal is cancelled', async () => {
    const database = await openEditorDatabase();
    const transaction = database.transaction(EDITOR_STORES.localProjects, 'readwrite');
    const controller = new AbortController();
    const completion = completeEditorTransaction(
      transaction,
      transaction.store.put({ projectKey: 'must-not-commit' }),
      controller.signal,
    );

    controller.abort();

    await expect(completion).rejects.toMatchObject({ name: 'AbortError' });
    expect(await database.get(EDITOR_STORES.localProjects, 'must-not-commit')).toBeUndefined();
  });
});
