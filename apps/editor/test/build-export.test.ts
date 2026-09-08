import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { makeBsp, makeWad } from '../../../packages/worldview/test/fixtures.js';
import {
  buildExportEntries,
  packageBuildExport,
  type BuildExportBundle,
} from '../src/build-export-plan.js';
import {
  loadBuildExportSettings,
  saveBuildExportSettings,
  writeBuildExport,
  type ExportDirectory,
} from '../src/build-export-settings.js';
import { deleteEditorDatabase } from '../src/editor-database.js';
import { BuildExportSession } from '../src/build-export-session.js';
import { BuildExportPort } from '../src/build-export-ui-state.js';

afterEach(deleteEditorDatabase);

function bundle(overrides: Partial<BuildExportBundle> = {}): BuildExportBundle {
  return {
    documentKey: 'map',
    documentId: 'document',
    revision: 1,
    name: 'my-map.map',
    bsp: makeBsp({ version: 29 }).buffer as ArrayBuffer,
    source: '{ "classname" "worldspawn" }',
    wads: [{ name: 'fixture.wad', data: makeWad(3, undefined, 'brick').buffer as ArrayBuffer }],
    gameAssets: new Map(),
    ...overrides,
  };
}

describe('build export', () => {
  it('downloads only the exact BSP when textures are embedded, despite leftover WAD references', async () => {
    const input = bundle();
    const file = await packageBuildExport(input, false);
    expect(file.name).toBe('my-map.bsp');
    expect(file.data).toBe(input.bsp);
  });

  it('packages source and captured WAD bytes alongside the BSP at engine-root paths', async () => {
    const input = bundle();
    const file = await packageBuildExport(input, true);
    expect(file.name).toBe('my-map.zip');
    const files = unzipSync(new Uint8Array(file.data));
    expect(Object.keys(files).toSorted()).toEqual([
      'fixture.wad',
      'maps/my-map.bsp',
      'maps/my-map.map',
    ]);
    expect(files['maps/my-map.bsp']).toEqual(new Uint8Array(input.bsp));
    expect(new TextDecoder().decode(files['maps/my-map.map'])).toBe(input.source);
    expect(files['fixture.wad']).toEqual(new Uint8Array(input.wads[0]!.data));
  });

  it('includes external WAD textures and rejects missing references', () => {
    const input = bundle({
      bsp: makeBsp({
        embeddedTexture: false,
        entityText: '{ "classname" "worldspawn" "wad" "fixture.wad" }\0',
      }).buffer as ArrayBuffer,
    });
    expect([...buildExportEntries(input, false).files.keys()]).toEqual([
      'maps/my-map.bsp',
      'fixture.wad',
    ]);
    expect(() => buildExportEntries({ ...input, wads: [] }, false)).toThrow('fixture.wad');
  });

  it('uses canonical sound paths and rejects missing or unsafe resources', () => {
    const bsp = makeBsp({
      entityText:
        '{ "classname" "worldspawn" }\n{ "classname" "ambient_generic" "message" "test.wav" }\0',
    }).buffer as ArrayBuffer;
    expect(() => buildExportEntries(bundle({ bsp }), false)).toThrow('sound/test.wav');
    const input = bundle({ bsp, gameAssets: new Map([['sound/test.wav', new ArrayBuffer(4)]]) });
    expect(buildExportEntries(input, false).files.has('sound/test.wav')).toBe(true);
    expect(() =>
      buildExportEntries(
        bundle({ wads: [{ name: '../bad.wad', data: new ArrayBuffer(0) }] }),
        true,
      ),
    ).toThrow('unsafe');
  });

  it('keeps project preferences isolated', async () => {
    await saveBuildExportSettings({
      scopeId: 'one',
      quality: 'final',
      includeSource: true,
      afterBuild: false,
      directory: null,
    });
    expect((await loadBuildExportSettings('one')).quality).toBe('final');
    expect((await loadBuildExportSettings('two')).includeSource).toBe(false);
  });

  it('refuses an old revision or another document, even when revisions match', async () => {
    let context = { scopeId: 'project', documentKey: 'map', documentId: 'document', revision: 1 };
    const ui = new BuildExportPort();
    const presenter = new BuildExportSession(
      ui,
      () => context,
      () => {},
      async () => {},
      () => {},
      new AbortController().signal,
    );
    presenter.accept(bundle());
    expect(presenter.isCurrent()).toBe(true);
    context = { ...context, revision: 2 };
    await expect(presenter.exportLatest()).rejects.toThrow('map has changed');
    context = { ...context, revision: 1, documentKey: 'other' };
    await expect(presenter.exportLatest()).rejects.toThrow('map has changed');
  });

  it('writes exact bytes and commits once; aborts incomplete writes and never prompts in the background', async () => {
    const events: string[] = [];
    let written: Blob | string | null = null;
    let fail = false;
    let permission: PermissionState = 'granted';
    const directory: ExportDirectory = {
      name: 'maps',
      kind: 'directory',
      queryPermission: async () => permission,
      getFileHandle: async (name) => ({
        name,
        getFile: async () => new File([], name),
        createWritable: async () => ({
          write: async (data) => {
            written = data;
            events.push('write');
            if (fail) throw new Error('disk full');
          },
          close: async () => {
            events.push('close');
          },
          abort: async () => {
            events.push('abort');
          },
        }),
      }),
    };
    const file = await packageBuildExport(bundle(), false);
    await writeBuildExport(directory, file);
    expect(events).toEqual(['write', 'close']);
    expect(await (written as unknown as Blob).arrayBuffer()).toEqual(file.data);
    fail = true;
    await expect(writeBuildExport(directory, file)).rejects.toThrow('disk full');
    expect(events.slice(-2)).toEqual(['write', 'abort']);
    permission = 'prompt';
    await expect(writeBuildExport(directory, file)).rejects.toThrow('permission expired');
    expect(events).toHaveLength(4);
  });
});
