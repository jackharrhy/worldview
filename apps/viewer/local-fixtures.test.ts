import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { discoverLocalFixtures } from './local-fixtures.js';

const temporaryDirectories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldview-fixtures-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeSteamManifest(
  fixtureRoot: string,
  records: readonly string[],
  assets: readonly { readonly appId: string; readonly logicalPath: string }[] = [],
): Promise<void> {
  await writeFile(
    path.join(fixtureRoot, 'manifest.json'),
    JSON.stringify({
      records: records.map((outputPath) => ({
        appId: outputPath.split('/')[0],
        outputPath,
      })),
      assets: assets.map(({ appId, logicalPath }) => ({
        appId,
        logicalPath,
        outputPath: `${appId}/game/${logicalPath}`,
      })),
    }),
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('local fixture discovery', () => {
  it('finds BSPs recursively and derives their game roots', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'mod_a', 'maps'), { recursive: true });
    await mkdir(path.join(root, 'mod_b'), { recursive: true });
    await Promise.all([
      writeFile(path.join(root, 'mod_a', 'maps', 'alpha.bsp'), ''),
      writeFile(path.join(root, 'mod_b', 'beta.bsp'), ''),
    ]);

    await expect(discoverLocalFixtures(root)).resolves.toEqual([
      {
        aliases: [],
        id: 'mod_a',
        label: 'alpha.bsp (local)',
        source: {
          bsp: 'maps/alpha.bsp',
          gameBaseUrl: '/local/mod_a/',
        },
      },
      {
        aliases: [],
        id: 'mod_b',
        label: 'beta.bsp (local)',
        source: {
          bsp: 'beta.bsp',
          gameBaseUrl: '/local/mod_b/',
        },
      },
    ]);
  });

  it('loads optional labels, aliases, and camera coordinates from a BSP sidecar', async () => {
    const root = await temporaryRoot();
    const mapDirectory = path.join(root, 'mod', 'maps');
    await mkdir(mapDirectory, { recursive: true });
    await writeFile(path.join(mapDirectory, 'sample.bsp'), '');
    await writeFile(
      path.join(mapDirectory, 'sample.worldview.json'),
      JSON.stringify({
        label: 'Sample room',
        aliases: ['sample'],
        camera: {
          position: [1, 2, 3],
          yawDegrees: 90,
          pitchDegrees: -5,
          fieldOfView: 80,
        },
      }),
    );
    await writeFile(path.join(mapDirectory, 'sample.worldview-walkability.json'), '{}');

    await expect(discoverLocalFixtures(root)).resolves.toEqual([
      {
        aliases: ['sample'],
        camera: {
          fieldOfView: 80,
          pitchDegrees: -5,
          position: [1, 2, 3],
          yawDegrees: 90,
        },
        id: 'mod',
        label: 'Sample room',
        source: {
          bsp: 'maps/sample.bsp',
          gameBaseUrl: '/local/mod/',
        },
        walkability: '/local/mod/maps/sample.worldview-walkability.json',
      },
    ]);
  });

  it('points Steam corpus maps at their app-specific materialized game root', async () => {
    const root = await temporaryRoot();
    const fixtureRoot = path.join(root, 'steam-corpus');
    const mapDirectory = path.join(fixtureRoot, '214700', 'archives', 'baseq2', 'pak0.pk3', 'maps');
    await mkdir(mapDirectory, { recursive: true });
    await mkdir(path.join(fixtureRoot, '214700', 'game'), { recursive: true });
    await mkdir(path.join(fixtureRoot, '214700', 'game', 'textures', 'e1u1'), {
      recursive: true,
    });
    await mkdir(path.join(fixtureRoot, '214700', 'game', 'pics'), {
      recursive: true,
    });
    await writeFile(path.join(mapDirectory, 'bar1.bsp'), '');
    await writeFile(path.join(fixtureRoot, '214700', 'game', 'textures', 'e1u1', 'wall.jpg'), '');
    await writeFile(path.join(fixtureRoot, '214700', 'game', 'pics', 'colormap.pcx'), '');
    await writeFile(path.join(fixtureRoot, '214700', 'game', 'fixture.wad'), '');
    await writeSteamManifest(
      fixtureRoot,
      ['214700/archives/baseq2/pak0.pk3/maps/bar1.bsp'],
      [
        { appId: '214700', logicalPath: 'fixture.wad' },
        { appId: '214700', logicalPath: 'pics/colormap.pcx' },
        { appId: '214700', logicalPath: 'textures/e1u1/wall.jpg' },
      ],
    );

    await expect(discoverLocalFixtures(root)).resolves.toEqual([
      {
        aliases: [],
        id: 'steam-corpus/thirty-flights-of-loving/bar1',
        label: 'bar1.bsp',
        namespace: 'Thirty Flights of Loving',
        source: {
          bsp: '/local/steam-corpus/214700/archives/baseq2/pak0.pk3/maps/bar1.bsp',
          gameAssets: {
            'fixture.wad': '/local/steam-corpus/214700/game/fixture.wad',
            'pics/colormap.pcx': '/local/steam-corpus/214700/game/pics/colormap.pcx',
            'textures/e1u1/wall.jpg': '/local/steam-corpus/214700/game/textures/e1u1/wall.jpg',
          },
          gameBaseUrl: '/local/steam-corpus/214700/game/',
        },
      },
    ]);
  });

  it('gives the Quake II rerelease anchor a useful authored camera', async () => {
    const root = await temporaryRoot();
    const corpusRoot = path.join(root, 'steam-corpus', '2320');
    const mapDirectory = path.join(
      corpusRoot,
      'archives',
      'rerelease',
      'baseq2',
      'pak0.pak',
      'maps',
    );
    await mkdir(mapDirectory, { recursive: true });
    await mkdir(path.join(corpusRoot, 'game', 'pics'), { recursive: true });
    await writeFile(path.join(mapDirectory, 'mgu1m1.bsp'), '');
    await writeFile(path.join(corpusRoot, 'game', 'pics', 'colormap.pcx'), '');
    await writeSteamManifest(
      path.join(root, 'steam-corpus'),
      ['2320/archives/rerelease/baseq2/pak0.pak/maps/mgu1m1.bsp'],
      [{ appId: '2320', logicalPath: 'pics/colormap.pcx' }],
    );

    const fixtures = await discoverLocalFixtures(root);

    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]).toMatchObject({
      camera: {
        fieldOfView: 75,
        pitchDegrees: 0,
        position: [1032, -256, 46],
        yawDegrees: -30,
      },
      id: 'steam-corpus/quake-ii/mgu1m1',
    });
  });

  it('indexes an extracted Quake palette and ignores raw Steam install maps', async () => {
    const root = await temporaryRoot();
    const corpusRoot = path.join(root, 'steam-corpus', '4484420');
    const installRoot = path.join(root, 'steam-installs', '4484420', 'id1', 'maps');
    await Promise.all([
      mkdir(path.join(corpusRoot, 'loose', 'id1', 'maps'), { recursive: true }),
      mkdir(path.join(corpusRoot, 'game', 'gfx'), { recursive: true }),
      mkdir(installRoot, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(corpusRoot, 'loose', 'id1', 'maps', 'dm1.bsp'), ''),
      writeFile(path.join(corpusRoot, 'game', 'gfx', 'palette.lmp'), ''),
      writeFile(path.join(corpusRoot, 'loose', 'id1', 'maps', 'stale.bsp'), ''),
      writeFile(path.join(installRoot, 'duplicate.bsp'), ''),
    ]);
    await writeSteamManifest(
      path.join(root, 'steam-corpus'),
      ['4484420/loose/id1/maps/dm1.bsp'],
      [{ appId: '4484420', logicalPath: 'gfx/palette.lmp' }],
    );

    await expect(discoverLocalFixtures(root)).resolves.toEqual([
      {
        aliases: [],
        id: 'steam-corpus/fleshcancer/dm1',
        label: 'dm1.bsp',
        namespace: 'FLESHCANCER',
        source: {
          bsp: '/local/steam-corpus/4484420/loose/id1/maps/dm1.bsp',
          gameAssets: {
            'gfx/palette.lmp': '/local/steam-corpus/4484420/game/gfx/palette.lmp',
          },
          gameBaseUrl: '/local/steam-corpus/4484420/game/',
          palette: '/local/steam-corpus/4484420/game/gfx/palette.lmp',
        },
      },
    ]);
  });

  it('keeps a deterministic bounded level sample from every Steam corpus game', async () => {
    const root = await temporaryRoot();
    const corpusRoot = path.join(root, 'steam-corpus');
    const files = [
      '214700/archives/baseq2/pak0.pk3/maps/bar1.bsp',
      '214700/archives/baseq2/pak0.pk3/maps/lob1.bsp',
      '214700/archives/baseq2/pak0.pk3/maps/vidroom.bsp',
      '214700/archives/baseq2/pak1.pk3/maps/hof1.bsp',
      '214700/archives/baseq2/pak1.pk3/maps/parlo1.bsp',
      '4484420/loose/id1/maps/dm1.bsp',
      '4484420/loose/id1/maps/dm2.bsp',
      '4484420/loose/id1/maps/e1m1.bsp',
      '4484420/loose/id1/maps/e1m2.bsp',
      '4484420/loose/id1/maps/e1m3.bsp',
      '4484420/archives/id1/pak0.pak/maps/b_shell0.bsp',
      '4484420/archives/id1/pak0.pak/maps/meat.bsp',
      '4484420/archives/id1/pak0.pak/models/ARMOR1.bsp',
    ];
    await Promise.all(
      files.map(async (relativePath) => {
        const filename = path.join(corpusRoot, relativePath);
        await mkdir(path.dirname(filename), { recursive: true });
        await writeFile(filename, '');
      }),
    );
    await writeSteamManifest(corpusRoot, files);

    const first = await discoverLocalFixtures(root);
    const second = await discoverLocalFixtures(root);

    expect(second).toEqual(first);
    expect(first).toHaveLength(8);
    expect(new Set(first.map(({ namespace }) => namespace))).toEqual(
      new Set(['Thirty Flights of Loving', 'Gravity Bone', 'FLESHCANCER']),
    );
    expect(first.filter(({ namespace }) => namespace === 'FLESHCANCER')).toHaveLength(3);
    expect(first.map(({ id }) => id)).toContain('steam-corpus/fleshcancer/dm1');
    expect(first.some(({ source }) => /b_shell|meat|ARMOR/u.test(String(source.bsp)))).toBe(false);
  });

  it('does not sample shared Half-Life maps as maps from another GoldSrc game', async () => {
    const root = await temporaryRoot();
    const corpusRoot = path.join(root, 'steam-corpus', '10', 'loose');
    const counterStrikeMap = path.join(corpusRoot, 'cstrike', 'maps', 'de_dust.bsp');
    const sharedHalfLifeMap = path.join(corpusRoot, 'valve', 'maps', 'c1a0.bsp');
    await Promise.all([
      mkdir(path.dirname(counterStrikeMap), { recursive: true }),
      mkdir(path.dirname(sharedHalfLifeMap), { recursive: true }),
    ]);
    await Promise.all([writeFile(counterStrikeMap, ''), writeFile(sharedHalfLifeMap, '')]);
    await writeSteamManifest(path.join(root, 'steam-corpus'), [
      '10/loose/cstrike/maps/de_dust.bsp',
      '10/loose/valve/maps/c1a0.bsp',
    ]);

    const fixtures = await discoverLocalFixtures(root);

    expect(fixtures.map(({ id }) => id)).toEqual(['steam-corpus/counter-strike/de_dust']);
    expect(fixtures[0]?.namespace).toBe('Counter-Strike');
  });

  it('rejects corpus manifests that escape their fixture root', async () => {
    const root = await temporaryRoot();
    const fixtureRoot = path.join(root, 'steam-corpus');
    await mkdir(fixtureRoot, { recursive: true });
    await writeFile(
      path.join(fixtureRoot, 'manifest.json'),
      JSON.stringify({ records: [{ appId: '60', outputPath: '../outside.bsp' }], assets: [] }),
    );

    await expect(discoverLocalFixtures(root)).rejects.toThrow(/relative POSIX path/u);
  });

  it('does not offer BSPs rejected by the compatibility corpus check', async () => {
    const root = await temporaryRoot();
    const fixtureRoot = path.join(root, 'steam-corpus');
    const mapDirectory = path.join(fixtureRoot, '4484420', 'loose', 'id1', 'maps');
    const incompatibleMap = path.join(mapDirectory, 'dm1.bsp');
    const compatibleMap = path.join(mapDirectory, 'e1m1.bsp');
    await mkdir(mapDirectory, { recursive: true });
    await Promise.all([writeFile(incompatibleMap, ''), writeFile(compatibleMap, '')]);
    await writeSteamManifest(fixtureRoot, [
      '4484420/loose/id1/maps/dm1.bsp',
      '4484420/loose/id1/maps/e1m1.bsp',
    ]);
    await writeFile(
      path.join(fixtureRoot, 'compatibility-report.json'),
      JSON.stringify({ failures: [{ outputPath: '4484420/loose/id1/maps/dm1.bsp' }] }),
    );

    const fixtures = await discoverLocalFixtures(root);

    expect(fixtures.map(({ id }) => id)).toEqual(['steam-corpus/fleshcancer/e1m1']);
  });

  it('rejects malformed sidecars instead of hiding configuration mistakes', async () => {
    const root = await temporaryRoot();
    const fixtureRoot = path.join(root, 'broken');
    await mkdir(fixtureRoot, { recursive: true });
    await writeFile(path.join(fixtureRoot, 'broken.bsp'), '');
    await writeFile(path.join(fixtureRoot, 'broken.worldview.json'), '{');

    await expect(discoverLocalFixtures(root)).rejects.toThrow('broken.worldview.json');
  });
});
