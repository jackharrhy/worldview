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
        bsp: 'maps/alpha.bsp',
        gameBaseUrl: '/local/mod_a/',
        id: 'mod_a',
        label: 'alpha.bsp (local)',
      },
      {
        aliases: [],
        bsp: 'beta.bsp',
        gameBaseUrl: '/local/mod_b/',
        id: 'mod_b',
        label: 'beta.bsp (local)',
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
        camera: { position: [1, 2, 3], yawDegrees: 90, pitchDegrees: -5, fieldOfView: 80 },
      }),
    );
    await writeFile(path.join(mapDirectory, 'sample.worldview-walkability.json'), '{}');

    await expect(discoverLocalFixtures(root)).resolves.toEqual([
      {
        aliases: ['sample'],
        bsp: 'maps/sample.bsp',
        camera: {
          fieldOfView: 80,
          pitchDegrees: -5,
          position: [1, 2, 3],
          yawDegrees: 90,
        },
        gameBaseUrl: '/local/mod/',
        id: 'mod',
        label: 'Sample room',
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
    await mkdir(path.join(fixtureRoot, '214700', 'game', 'pics'), { recursive: true });
    await writeFile(path.join(mapDirectory, 'bar1.bsp'), '');
    await writeFile(path.join(fixtureRoot, '214700', 'game', 'textures', 'e1u1', 'wall.jpg'), '');
    await writeFile(path.join(fixtureRoot, '214700', 'game', 'pics', 'colormap.pcx'), '');

    await expect(discoverLocalFixtures(root)).resolves.toEqual([
      {
        aliases: [],
        bsp: '/local/steam-corpus/214700/archives/baseq2/pak0.pk3/maps/bar1.bsp',
        gameBaseUrl: '/local/steam-corpus/214700/game/',
        gameAssets: {
          'pics/colormap.pcx': '/local/steam-corpus/214700/game/pics/colormap.pcx',
          'textures/e1u1/wall.jpg': '/local/steam-corpus/214700/game/textures/e1u1/wall.jpg',
        },
        id: 'steam-corpus',
        label: 'bar1.bsp (local)',
      },
    ]);
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
      writeFile(path.join(installRoot, 'duplicate.bsp'), ''),
    ]);

    await expect(discoverLocalFixtures(root)).resolves.toEqual([
      {
        aliases: [],
        bsp: '/local/steam-corpus/4484420/loose/id1/maps/dm1.bsp',
        gameBaseUrl: '/local/steam-corpus/4484420/game/',
        gameAssets: {
          'gfx/palette.lmp': '/local/steam-corpus/4484420/game/gfx/palette.lmp',
        },
        id: 'steam-corpus',
        label: 'dm1.bsp (local)',
      },
    ]);
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
