import { describe, expect, it } from 'vitest';

import {
  loadProjectEntityDefinitions,
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
  it('opens the manifest and recursively discovers map roots', async () => {
    const workspace = await openWorldviewProject(root);
    expect(workspace.manifest.name).toBe('Fixture');
    expect(workspace.maps.map(({ path }) => path)).toEqual(['maps/nested/two.map', 'maps/one.map']);
    expect(await (await projectFile(root, 'maps/one.map')).text()).toContain('worldspawn');
  });

  it('loads contained FGD includes into one resolved catalog', async () => {
    const workspace = await openWorldviewProject(root);
    const definitions = await loadProjectEntityDefinitions(workspace);
    expect(definitions.diagnostics).toEqual([]);
    expect(definitions.catalog.find('light_test')?.properties).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'targetname' })]),
    );
  });
});
