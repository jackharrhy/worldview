import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createLocalFixtureResolver } from './local-file-server.js';

const temporaryDirectories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldview-local-server-'));
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

describe('local fixture file resolution', () => {
  it('decodes reserved filename characters inside the fixture root', async () => {
    const root = await temporaryRoot();
    const filename = path.join(root, 'textures', '#teleport.wal');
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, 'wal');

    await expect(
      createLocalFixtureResolver(root)('/local/textures/%23teleport.wal?cache=1'),
    ).resolves.toEqual({ filename, size: 3 });
  });

  it('rejects lexical and symlink traversal', async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, 'local');
    const outside = path.join(parent, 'secret.wal');
    await mkdir(root);
    await writeFile(outside, 'secret');
    await symlink(outside, path.join(root, 'linked.wal'));
    const resolveFixture = createLocalFixtureResolver(root);

    await expect(resolveFixture('/local/%2e%2e/secret.wal')).resolves.toBeNull();
    await expect(resolveFixture('/local/linked.wal')).resolves.toBeNull();
  });
});
