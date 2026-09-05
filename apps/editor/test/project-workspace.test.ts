import { describe, expect, it } from 'vitest';

import { loadWorkspaceResources } from '../src/project-resource-loader.js';

import {
  ensureProjectDirectoryPermission,
  loadProjectEntityDefinitions,
  loadProjectSprites,
  loadProjectGameAssets,
  openWorldviewProject,
  projectFile,
  type EditorDirectoryHandle,
} from '../src/project-workspace.js';

type Entry = string | Uint8Array<ArrayBuffer> | { [name: string]: Entry };

function isFileEntry(value: Entry | undefined): value is string | Uint8Array<ArrayBuffer> {
  return typeof value === 'string' || value instanceof Uint8Array;
}

function directory(name: string, entries: Record<string, Entry>): EditorDirectoryHandle {
  const child = (entryName: string, value: Entry) =>
    isFileEntry(value)
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
      if (!isFileEntry(value)) throw new Error(`Missing file ${entryName}`);
      return child(entryName, value) as { getFile(): Promise<File> };
    },
    getDirectoryHandle: async (entryName) => {
      const value = entries[entryName];
      if (!value || isFileEntry(value)) throw new Error(`Missing directory ${entryName}`);
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

function quake2PalettePcx(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(128 + 1 + 768);
  bytes[0] = 0x0a;
  bytes[2] = 1;
  bytes[3] = 8;
  bytes[65] = 1;
  bytes[128] = 0x0c;
  for (let index = 0; index < 768; index += 1) bytes[129 + index] = index & 0xff;
  return bytes;
}

function quake2Wal(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(440);
  const view = new DataView(bytes.buffer);
  new TextEncoder().encodeInto('unit/wall', bytes.subarray(0, 32));
  view.setUint32(32, 16, true);
  view.setUint32(36, 16, true);
  [100, 356, 420, 436].forEach((offset, index) => view.setUint32(40 + index * 4, offset, true));
  bytes.fill(7, 100);
  return bytes;
}

function onePixelTga(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(21);
  bytes[2] = 2;
  bytes[12] = 1;
  bytes[14] = 1;
  bytes[16] = 24;
  bytes[17] = 0x20;
  bytes.set([30, 20, 10], 18);
  return bytes;
}

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
    const maps: EditorDirectoryHandle = {
      kind: 'directory' as const,
      name: 'maps',
      getFileHandle: () => Promise.resolve(mapHandle),
      getDirectoryHandle: () => Promise.reject(new Error('unused')),
      async *entries() {
        yield ['large.map', mapHandle];
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

  it('loads Quake II QUAKED definitions through the shared catalog', async () => {
    const quake2Root = directory('quake2', {
      'worldview.project.json': JSON.stringify({
        schemaVersion: 1,
        name: 'Quake II definitions',
        game: 'quake2',
        mapRoots: ['maps'],
        resources: {
          wads: [],
          spriteRoots: [],
          entityDefinitions: [{ path: 'entities/quake2.def', format: 'def' }],
        },
        buildProfiles: [],
      }),
      maps: {},
      entities: {
        'quake2.def': `/*QUAKED info_player_start (1 0 0) (-16 -16 -24) (16 16 32)
Synthetic Quake II player start.
*/
/*QUAKED func_areaportal (0.5 0.5 0.5) ? START_OPEN
Synthetic Quake II area portal.
*/`,
      },
    });

    const definitions = await loadProjectEntityDefinitions(await openWorldviewProject(quake2Root));

    expect(definitions.diagnostics).toEqual([]);
    expect(definitions.catalog.find('info_player_start')).toMatchObject({
      kind: 'point',
      bounds: { min: [-16, -16, -24], max: [16, 16, 32] },
    });
    expect(definitions.catalog.find('func_areaportal')).toMatchObject({
      kind: 'brush',
      properties: [
        {
          key: 'spawnflags',
          choices: [{ value: '1', label: 'START_OPEN' }],
        },
      ],
    });
  });

  it('discovers Quake II assets recursively in game-root precedence order', async () => {
    const materialRoot = directory('materials', {
      'worldview.project.json': JSON.stringify({
        schemaVersion: 1,
        name: 'Quake II materials',
        game: 'quake2',
        mapRoots: ['maps'],
        resources: {
          wads: [],
          gameRoots: ['base', 'override'],
          spriteRoots: [],
          entityDefinitions: [],
        },
        buildProfiles: [],
      }),
      maps: {},
      base: {
        textures: { 'metal.wal': 'base', 'ignore.txt': '' },
        pics: { 'colormap.pcx': 'palette' },
      },
      override: {
        textures: { 'metal.wal': 'override', 'wall.wal': 'wall', 'wall.jpg': 'replacement' },
        env: { 'spaceup.tga': 'sky' },
      },
    });
    const workspace = await openWorldviewProject(materialRoot);
    const files = await loadProjectGameAssets(workspace);

    expect(files.map(({ path }) => path)).toEqual([
      'base/pics/colormap.pcx',
      'base/textures/metal.wal',
      'override/env/spaceup.tga',
      'override/textures/metal.wal',
      'override/textures/wall.jpg',
      'override/textures/wall.wal',
    ]);
    expect(files.map(({ logicalPath }) => logicalPath)).toEqual([
      'pics/colormap.pcx',
      'textures/metal.wal',
      'env/spaceup.tga',
      'textures/metal.wal',
      'textures/wall.jpg',
      'textures/wall.wal',
    ]);
  });

  it('stages Quake II PCX, WAL, and replacement assets for source and compiled preview', async () => {
    const resourceRoot = directory('quake2-resources', {
      'worldview.project.json': JSON.stringify({
        schemaVersion: 1,
        name: 'Quake II resources',
        game: 'quake2',
        mapRoots: ['maps'],
        resources: {
          wads: [],
          gameRoots: ['baseq2'],
          spriteRoots: [],
          entityDefinitions: [],
        },
        buildProfiles: [],
      }),
      maps: {},
      baseq2: {
        pics: { 'colormap.pcx': quake2PalettePcx() },
        textures: {
          unit: { 'wall.wal': quake2Wal(), 'wall.tga': onePixelTga() },
        },
      },
    });
    const resources = await loadWorkspaceResources(
      await openWorldviewProject(resourceRoot),
      [],
      new AbortController().signal,
    );

    expect(resources.palette).toHaveLength(768);
    expect([...resources.gameAssets.keys()]).toEqual([
      'pics/colormap.pcx',
      'textures/unit/wall.tga',
      'textures/unit/wall.wal',
    ]);
    expect(resources.catalog.find('unit/wall')).toMatchObject({
      width: 1,
      height: 1,
      logicalWidth: 16,
      logicalHeight: 16,
      rgba: new Uint8Array([10, 20, 30, 255]),
    });
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
