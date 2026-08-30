import { createStarterDocument, parseMapSource } from '@jackharrhy/worldview-editor/core';
import { describe, expect, it } from 'vitest';

import { StoredAssetMountSchema } from '../src/asset-mount-state.js';
import { MapBuildHistoryRecordSchema } from '../src/build-history.js';
import { DocumentRecoverySnapshotSchema } from '../src/document-recovery.js';
import { LocalProjectStateSchema } from '../src/project-local-state.js';
import { readNewMapLaunch } from '../src/routes/editor-navigation-state.js';
import { EmptyInputSchema, defineWebMcpTool } from '../src/webmcp-contract.js';

describe('browser-owned runtime schemas', () => {
  it('rejects shallow recovery and build records with malformed nested state', () => {
    const document = createStarterDocument();
    const source = parseMapSource('{\n"classname" "worldspawn"\n}\n').source;
    const snapshot = {
      version: 1,
      snapshotId: 'snapshot-1',
      documentKey: 'map-1',
      fileName: 'map.map',
      document,
      source,
      savedDocumentRevision: 0,
      updatedAt: 1,
      label: 'Autosave',
      protected: false,
    };
    expect(DocumentRecoverySnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      DocumentRecoverySnapshotSchema.safeParse({ ...snapshot, document: { id: 'only-an-id' } })
        .success,
    ).toBe(false);
    expect(
      MapBuildHistoryRecordSchema.safeParse({
        version: 1,
        buildId: 'build-1',
        mapKey: 'map-1',
        createdAt: 1,
        result: {},
      }).success,
    ).toBe(false);
  });

  it('validates local handles and binary mount records without accepting extra fields', () => {
    const handle = { kind: 'directory', name: 'maps' };
    expect(
      LocalProjectStateSchema.safeParse({
        version: 2,
        workspaceId: 'workspace-1',
        projectKey: 'project-1',
        displayName: 'Project',
        handle,
        buildBindings: {},
        updatedAt: 1,
      }).success,
    ).toBe(true);
    expect(
      StoredAssetMountSchema.safeParse({
        id: 'mount-1',
        scopeId: 'project-1',
        kind: 'browser-wad',
        label: 'base.wad',
        sourceName: 'base.wad',
        priority: 1,
        profile: 'quake',
        contentFingerprint: 'abc',
        data: new ArrayBuffer(4),
        legacy: true,
      }).success,
    ).toBe(false);
  });

  it('derives WebMCP JSON Schema and runtime rejection from one strict contract', async () => {
    const tool = defineWebMcpTool(EmptyInputSchema, {
      name: 'test',
      description: 'test',
      execute: () => ({ ok: true }),
    });
    expect(tool.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    await expect(Promise.resolve().then(() => tool.execute({ extra: true }))).rejects.toThrow(
      /Tool input is invalid/,
    );
  });

  it('accepts only the current strict new-map navigation shape', () => {
    expect(
      readNewMapLaunch({
        newMap: { name: ' test.map ', profile: 'quake', format: 'valve-220' },
      }),
    ).toEqual({ name: 'test.map', profile: 'quake', format: 'valve-220' });
    expect(
      readNewMapLaunch({
        newMap: { name: 'test.map', profile: 'quake', format: 'valve-220', legacy: true },
      }),
    ).toBeNull();
    expect(
      readNewMapLaunch({
        newMap: { name: 'test.map', profile: 'quake', format: 'quake2' },
      }),
    ).toBeNull();
  });
});
