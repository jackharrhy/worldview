import { describe, expect, it } from 'vitest';

import {
  parseWorldviewProject,
  serializeWorldviewProject,
  WorldviewProjectParseError,
} from '../src/core/index.js';

const PROJECT = {
  schemaVersion: 1,
  name: 'The Slipgate Complex',
  game: 'quake',
  mapRoots: ['maps'],
  resources: {
    wads: ['id1/base.wad', 'mod/override.wad'],
    palette: 'gfx/palette.lmp',
    spriteRoots: ['sprites'],
    entityDefinitions: [{ path: 'entities/quake.def', format: 'def' }],
  },
  buildProfiles: [
    { id: 'preview', label: 'Preview', quality: 'preview' },
    { id: 'final', label: 'Final', quality: 'final' },
  ],
  defaultBuildProfile: 'preview',
} as const;

describe('Worldview project manifests', () => {
  it('round-trips portable folder-level project settings', () => {
    const serialized = serializeWorldviewProject(PROJECT);
    expect(parseWorldviewProject(serialized)).toEqual(PROJECT);
    expect(serialized.endsWith('\n')).toBe(true);
  });

  it('accepts Quake II as a portable project profile without requiring WAD resources', () => {
    const quake2 = {
      ...PROJECT,
      name: 'Quake II project',
      game: 'quake2',
      resources: {
        wads: [],
        materialRoots: ['textures'],
        spriteRoots: [],
        entityDefinitions: [{ path: 'entities/quake2.def', format: 'def' }],
      },
    } as const;

    expect(parseWorldviewProject(serializeWorldviewProject(quake2))).toEqual(quake2);
  });

  it.each(['../outside.wad', '/absolute.wad', 'C:/game/file.wad', 'https://example.test/a.wad'])(
    'rejects non-contained resource path %s',
    (path) => {
      expect(() =>
        parseWorldviewProject(
          JSON.stringify({
            ...PROJECT,
            resources: { ...PROJECT.resources, wads: [path] },
          }),
        ),
      ).toThrow(WorldviewProjectParseError);
    },
  );

  it('rejects duplicate resources and missing default build profiles', () => {
    expect(() =>
      parseWorldviewProject(
        JSON.stringify({
          ...PROJECT,
          resources: { ...PROJECT.resources, wads: ['same.wad', 'same.wad'] },
        }),
      ),
    ).toThrow(/duplicates/);
    expect(() =>
      parseWorldviewProject(JSON.stringify({ ...PROJECT, defaultBuildProfile: 'missing' })),
    ).toThrow(/existing build profile/);
  });
});
