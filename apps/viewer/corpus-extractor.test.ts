import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Steam BSP corpus extractor', () => {
  it('materializes only bounded Quake II game-root asset classes with provenance', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldview-corpus-'));
    temporaryDirectories.push(root);
    const source = path.join(root, 'source');
    const output = path.join(root, 'output');
    await Promise.all([
      mkdir(path.join(source, 'baseq2', 'maps'), { recursive: true }),
      mkdir(path.join(source, 'baseq2', 'textures', 'unit'), { recursive: true }),
      mkdir(path.join(source, 'baseq2', 'pics'), { recursive: true }),
      mkdir(path.join(source, 'baseq2', 'sound'), { recursive: true }),
      mkdir(path.join(source, 'id1', 'gfx'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(source, 'baseq2', 'maps', 'sample.bsp'), 'bsp'),
      writeFile(path.join(source, 'baseq2', 'textures', 'unit', 'wall.jpg'), 'image'),
      writeFile(path.join(source, 'baseq2', 'pics', 'colormap.pcx'), 'palette'),
      writeFile(path.join(source, 'baseq2', 'sound', 'ignored.wav'), 'sound'),
      writeFile(path.join(source, 'id1', 'gfx', 'palette.lmp'), 'quake palette'),
    ]);

    await execute(
      process.execPath,
      [
        path.join(repositoryRoot, 'scripts', 'extract-bsp-corpus.mjs'),
        '--output',
        output,
        '--source',
        `214700=${source}`,
      ],
      { cwd: repositoryRoot },
    );

    const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8')) as {
      readonly records: readonly { readonly entry: string }[];
      readonly assets: readonly { readonly logicalPath: string; readonly sha256: string }[];
    };
    expect(manifest.records.map(({ entry }) => entry)).toEqual(['baseq2/maps/sample.bsp']);
    expect(manifest.assets.map(({ logicalPath }) => logicalPath)).toEqual([
      'gfx/palette.lmp',
      'pics/colormap.pcx',
      'textures/unit/wall.jpg',
    ]);
    expect(manifest.assets.every(({ sha256 }) => /^[a-f0-9]{64}$/u.test(sha256))).toBe(true);
  });
});
