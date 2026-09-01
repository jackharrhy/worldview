import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { FixtureCameraDefinition, LocalFixtureDefinition } from './src/fixture-types.js';
import { discoverSteamCorpusFixtures, type SteamCorpusLevel } from './steam-corpus-fixtures.js';

interface FixtureMetadata {
  readonly label?: unknown;
  readonly aliases?: unknown;
  readonly camera?: unknown;
}

const NON_FIXTURE_DIRECTORIES = new Set(['steam-installs']);

function slashPath(value: string): string {
  return value.split(path.sep).join('/');
}

function publicPath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

function isFiniteTuple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => typeof component === 'number' && Number.isFinite(component))
  );
}

function cameraDefinition(value: unknown, filename: string): FixtureCameraDefinition | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') throw new Error(`${filename}: camera must be an object`);
  const camera = value as Record<string, unknown>;
  if (!isFiniteTuple(camera.position)) {
    throw new Error(`${filename}: camera.position must contain three finite numbers`);
  }
  const yawDegrees = camera.yawDegrees ?? 0;
  const pitchDegrees = camera.pitchDegrees ?? 0;
  const fieldOfView = camera.fieldOfView;
  if (typeof yawDegrees !== 'number' || !Number.isFinite(yawDegrees)) {
    throw new Error(`${filename}: camera.yawDegrees must be a finite number`);
  }
  if (typeof pitchDegrees !== 'number' || !Number.isFinite(pitchDegrees)) {
    throw new Error(`${filename}: camera.pitchDegrees must be a finite number`);
  }
  if (
    fieldOfView !== undefined &&
    (typeof fieldOfView !== 'number' || !Number.isFinite(fieldOfView))
  ) {
    throw new Error(`${filename}: camera.fieldOfView must be a finite number`);
  }
  return {
    position: camera.position,
    yawDegrees,
    pitchDegrees,
    ...(fieldOfView === undefined ? {} : { fieldOfView }),
  };
}

async function metadataForBsp(filename: string): Promise<FixtureMetadata> {
  const sidecar = filename.replace(/\.bsp$/iu, '.worldview.json');
  try {
    const parsed: unknown = JSON.parse(await readFile(sidecar, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('metadata must be an object');
    return parsed as FixtureMetadata;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${sidecar}: ${message}`, { cause: error });
  }
}

async function bspFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) return bspFiles(filename);
        return Promise.resolve(
          entry.isFile() && entry.name.toLowerCase().endsWith('.bsp') ? [filename] : [],
        );
      }),
  );
  return nested.flat();
}

async function existingFile(filename: string): Promise<boolean> {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

function stringAliases(value: unknown, filename: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((alias) => typeof alias !== 'string' || !alias.trim())) {
    throw new Error(`${filename}: aliases must be an array of non-empty strings`);
  }
  return [...new Set(value.map((alias) => alias.trim()))];
}

function steamGameAssets(
  publicGameRoot: string,
  logicalPaths: readonly string[],
): Readonly<Record<string, string>> | undefined {
  if (logicalPaths.length === 0) return undefined;
  return Object.fromEntries(
    logicalPaths.map((logicalPath) => [logicalPath, `${publicGameRoot}${publicPath(logicalPath)}`]),
  );
}

async function fixtureDefinition(
  directoryName: string,
  fixtureRoot: string,
  files: readonly string[],
  filename: string,
  steamLevel: SteamCorpusLevel | undefined,
  steamAssets: ReadonlyMap<string, readonly string[]> | undefined,
): Promise<LocalFixtureDefinition> {
  if (!(await existingFile(filename))) {
    throw new Error(`${filename}: fixture is listed but does not exist`);
  }
  const relativeBsp = slashPath(path.relative(fixtureRoot, filename));
  const metadataFilename = filename.replace(/\.bsp$/iu, '.worldview.json');
  const metadata = await metadataForBsp(filename);
  const stem = path.basename(filename, path.extname(filename));
  const id = steamLevel
    ? `${directoryName}/${steamLevel.game.slug}/${steamLevel.mapPath}`
    : files.length === 1
      ? directoryName
      : `${directoryName}/${relativeBsp.slice(0, -4)}`;
  const label =
    metadata.label === undefined
      ? steamLevel
        ? `${stem}.bsp`
        : `${stem}.bsp (local)`
      : metadata.label;
  if (typeof label !== 'string' || !label.trim()) {
    throw new Error(`${metadataFilename}: label must be a non-empty string`);
  }

  const publicFixtureRoot = `/local/${encodeURIComponent(directoryName)}/`;
  const publicGameRoot = steamLevel
    ? `${publicFixtureRoot}${encodeURIComponent(steamLevel.appId)}/game/`
    : publicFixtureRoot;
  const gameAssets = steamLevel
    ? steamGameAssets(publicGameRoot, steamAssets?.get(steamLevel.appId) ?? [])
    : undefined;
  const authoredCamera = cameraDefinition(metadata.camera, metadataFilename);
  const anchorCamera =
    steamLevel && path.posix.basename(steamLevel.mapPath) === steamLevel.game.anchor
      ? steamLevel.game.anchorCamera
      : undefined;
  const camera = authoredCamera ?? anchorCamera;
  const walkabilityFilename = filename.replace(/\.bsp$/iu, '.worldview-walkability.json');
  const walkability = (await existingFile(walkabilityFilename))
    ? `${publicFixtureRoot}${publicPath(slashPath(path.relative(fixtureRoot, walkabilityFilename)))}`
    : undefined;

  return {
    id,
    label: label.trim(),
    source: {
      bsp: steamLevel ? `${publicFixtureRoot}${publicPath(relativeBsp)}` : relativeBsp,
      gameBaseUrl: publicGameRoot,
      ...(gameAssets ? { gameAssets } : {}),
      ...(gameAssets?.['gfx/palette.lmp'] ? { palette: gameAssets['gfx/palette.lmp'] } : {}),
    },
    aliases: stringAliases(metadata.aliases, metadataFilename),
    ...(steamLevel ? { namespace: steamLevel.game.name } : {}),
    ...(camera ? { camera } : {}),
    ...(walkability ? { walkability } : {}),
  };
}

export async function discoverLocalFixtures(localRoot: string): Promise<LocalFixtureDefinition[]> {
  let directories;
  try {
    directories = (await readdir(localRoot, { withFileTypes: true })).filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !NON_FIXTURE_DIRECTORIES.has(entry.name),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const discovered = await Promise.all(
    directories.map(async (directory) => {
      const fixtureRoot = path.join(localRoot, directory.name);
      const steamCorpus =
        directory.name === 'steam-corpus'
          ? await discoverSteamCorpusFixtures(fixtureRoot)
          : undefined;
      const steamLevelByFilename = new Map(
        steamCorpus?.levels.map((level) => [level.filename, level] as const) ?? [],
      );
      const files = steamCorpus
        ? steamCorpus.levels.map(({ filename }) => filename)
        : (await bspFiles(fixtureRoot)).toSorted((left, right) => left.localeCompare(right));
      return Promise.all(
        files.map((filename) =>
          fixtureDefinition(
            directory.name,
            fixtureRoot,
            files,
            filename,
            steamLevelByFilename.get(filename),
            steamCorpus?.assetsByApp,
          ),
        ),
      );
    }),
  );

  const fixtures = discovered
    .flat()
    .toSorted((left, right) => left.label.localeCompare(right.label));
  const ids = new Set<string>();
  for (const fixture of fixtures) {
    if (ids.has(fixture.id)) throw new Error(`duplicate local fixture id ${fixture.id}`);
    ids.add(fixture.id);
  }
  return fixtures;
}
