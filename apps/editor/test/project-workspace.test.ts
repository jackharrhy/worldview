import { describe, expect, it } from 'vitest';

import {
  ensureProjectDirectoryPermission,
  loadProjectEntityDefinitions,
  loadProjectSprites,
  loadProjectWalFiles,
  openWorldviewProject,
  projectFile,
  type EditorDirectoryHandle,
} from '../src/project-workspace.js';

type Entry = string | Record<string, Entry>;

function directory(name: string, entries: Record<string, Entry>): EditorDirectoryHandle {
  const child = (entryName: string, value: Entry) =>
    typeof value === 'string'
      ? {
          kind: 'file' as const,
          name: entryName,
          getFile: () => Promise.resolve(new File([value], entryName)),
          createWritable: () =>
            Promise.resolve({ write: () => Promise.resolve(), close: () => Promise.resolve() }),
        }
      : directory(entryName, value);
  return {
    kind: 'directory',
    name,
    getFileHandle: async (entryName) => {
      const value = entries[entryName];
      if (typeof value !== 'string') throw new Error(`Missing file ${entryName}`);
      return child(entryName, value) as { getFile(): Promise<File> };
    },
    getDirectoryHandle: async (entryName) => {
      const value = entries[entryName];
      if (!value || typeof value === 'string') throw new Error(`Missing directory ${entryName}`);
      return directory(entryName, value);
    },
    async *entries() {
      for (const [entryName, value] of Object.entries(entries))
        yield [entryName, child(entryName, value)];
    },
  };
}

const root = directory('fixture', {
  'worldview.project.json': JSON.stringify({
    schemaVersion: 1,
    name: 'Fixture',
    game: 'goldsrc',
    mapRoots: ['maps'],
    resources: {
      wads: [],
      spriteRoots: ['sprites'],
      entityDefinitions: [{ path: 'entities/main.fgd', format: 'fgd' }],
    },
    buildProfiles: [],
  }),
  maps: {
    'one.map': '{\n"classname" "worldspawn"\n}\n',
    nested: { 'two.map': '{\n"classname" "worldspawn"\n}\n', 'ignore.txt': '' },
  },
  entities: {
    'main.fgd': '@include "base.fgd"\n@PointClass base(Base) = light_test : "Light" []',
    'base.fgd': '@BaseClass = Base [ targetname(target_source) : "Name" ]',
  },
  sprites: {},
});

describe('project workspaces', () => {
  it('requires an explicit permission grant before reopening a revoked directory handle', async () => {
    let requested = false;
    const remembered = {
      ...root,
      queryPermission: () => Promise.resolve('prompt' as const),
      requestPermission: () => {
        requested = true;
        return Promise.resolve('granted' as const);
      },
    };

    expect(await ensureProjectDirectoryPermission(remembered, false)).toBe(false);
    expect(requested).toBe(false);
    expect(await ensureProjectDirectoryPermission(remembered, true)).toBe(true);
    expect(requested).toBe(true);
    expect(
      await ensureProjectDirectoryPermission(
        { ...root, queryPermission: () => Promise.resolve('denied' as const) },
        true,
      ),
    ).toBe(false);
  });

  it('opens the manifest and recursively discovers map roots', async () => {
    const workspace = await openWorldviewProject(root);
    expect(workspace.manifest.name).toBe('Fixture');
    expect(workspace.maps.map(({ path }) => path)).toEqual(['maps/nested/two.map', 'maps/one.map']);
    expect(await (await projectFile(root, 'maps/one.map')).text()).toContain('worldspawn');
  });

  it('does not read map contents until a discovered map is selected', async () => {
    let mapRead = false;
    const manifest = JSON.stringify({
      schemaVersion: 1,
      name: 'Lazy maps',
      game: 'quake',
      mapRoots: ['maps'],
      resources: { wads: [], spriteRoots: [], entityDefinitions: [] },
      buildProfiles: [],
    });
    const mapHandle = {
      kind: 'file' as const,
      name: 'large.map',
      getFile: () => {
        mapRead = true;
        return Promise.resolve(new File(['large map source'], 'large.map'));
      },
      createWritable: () =>
        Promise.resolve({ write: () => Promise.resolve(), close: () => Promise.resolve() }),
    };
    const maps = {
      kind: 'directory' as const,
      name: 'maps',
      getFileHandle: () => Promise.resolve(mapHandle),
      getDirectoryHandle: () => Promise.reject(new Error('unused')),
      async *entries() {
        yield ['large.map', mapHandle] as const;
      },
    };
    const lazyRoot: EditorDirectoryHandle = {
      kind: 'directory',
      name: 'lazy',
      getFileHandle: async (name) => {
        if (name !== 'worldview.project.json') throw new Error(`Missing file ${name}`);
        return { getFile: () => Promise.resolve(new File([manifest], name)) };
      },
      getDirectoryHandle: async (name) => {
        if (name !== 'maps') throw new Error(`Missing directory ${name}`);
        return maps;
      },
      async *entries() {},
    };

    const workspace = await openWorldviewProject(lazyRoot);

    expect(mapRead).toBe(false);
    expect(workspace.maps.map(({ path }) => path)).toEqual(['maps/large.map']);
    expect(await (await workspace.maps[0]!.handle.getFile()).text()).toBe('large map source');
    expect(mapRead).toBe(true);
  });

  it('loads contained FGD includes into one resolved catalog', async () => {
    const workspace = await openWorldviewProject(root);
    const definitions = await loadProjectEntityDefinitions(workspace);
    expect(definitions.diagnostics).toEqual([]);
    expect(definitions.catalog.find('light_test')?.properties).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'targetname' })]),
    );
  });

  it('applies entity-definition files in manifest order', async () => {
    const orderedRoot = directory('ordered', {
      'worldview.project.json': JSON.stringify({
        schemaVersion: 1,
        name: 'Ordered definitions',
        game: 'quake',
        mapRoots: ['maps'],
        resources: {
          wads: [],
          spriteRoots: [],
          entityDefinitions: [
            { path: 'entities/base.def', format: 'def' },
            { path: 'entities/override.def', format: 'def' },
          ],
        },
        buildProfiles: [],
      }),
      maps: {},
      entities: {
        'base.def': '/*QUAKED light_test (1 0 0) (-8 -8 -8) (8 8 8) First */',
        'override.def': '/*QUAKED light_test (0 1 0) (-16 -16 -16) (16 16 16) Second */',
      },
    });

    const workspace = await openWorldviewProject(orderedRoot);
    const definitions = await loadProjectEntityDefinitions(workspace);

    expect(definitions.catalog.find('light_test')).toMatchObject({
      bounds: { min: [-16, -16, -16], max: [16, 16, 16] },
    });
  });

  it('discovers WAL files recursively in material-root precedence order', async () => {
    const materialRoot = directory('materials', {
      'worldview.project.json': JSON.stringify({
        schemaVersion: 1,
        name: 'Quake II materials',
        game: 'quake2',
        mapRoots: ['maps'],
        resources: {
          wads: [],
          materialRoots: ['base', 'override'],
          spriteRoots: [],
          entityDefinitions: [],
        },
        buildProfiles: [],
      }),
      maps: {},
      base: { z: { 'metal.wal': 'base' }, 'ignore.txt': '' },
      override: { 'metal.wal': 'override', 'wall.wal': 'wall' },
    });
    const workspace = await openWorldviewProject(materialRoot);
    const files = await loadProjectWalFiles(workspace);

    expect(files.map(({ path }) => path)).toEqual([
      'base/z/metal.wal',
      'override/metal.wal',
      'override/wall.wal',
    ]);
  });

  it('reports missing sprite roots and malformed sprite assets without blocking the project', async () => {
    const spriteRoot = directory('sprites', {
      'worldview.project.json': JSON.stringify({
        schemaVersion: 1,
        name: 'Sprite diagnostics',
        game: 'goldsrc',
        mapRoots: ['maps'],
        resources: {
          wads: [],
          spriteRoots: ['sprites', 'missing'],
          entityDefinitions: [],
        },
        buildProfiles: [],
      }),
      maps: {},
      sprites: { 'broken.spr': 'not a GoldSrc sprite' },
    });

    const workspace = await openWorldviewProject(spriteRoot);
    const sprites = await loadProjectSprites(workspace);

    expect(sprites.sprites).toEqual([]);
    expect(sprites.diagnostics).toEqual([
      expect.stringMatching(/sprites\/broken\.spr:/),
      expect.stringMatching(/^missing:/),
    ]);
  });
});
