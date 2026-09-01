import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { FixtureCameraDefinition, LocalFixtureDefinition } from './src/fixture-types.js';

interface FixtureMetadata {
  readonly label?: unknown;
  readonly aliases?: unknown;
  readonly camera?: unknown;
}

function slashPath(value: string): string {
  return value.split(path.sep).join('/');
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
  const sidecar = filename.replace(/\.bsp$/i, '.worldview.json');
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
  const pending: Promise<string[]>[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const filename = path.join(directory, entry.name);
    pending.push(
      entry.isDirectory()
        ? bspFiles(filename)
        : Promise.resolve(
            entry.isFile() && entry.name.toLowerCase().endsWith('.bsp') ? [filename] : [],
          ),
    );
  }
  const nested = await Promise.all(pending);
  return nested.flat();
}

const GAME_ASSET_PATH =
  /^(?:textures\/.+\.(?:wal|png|jpe?g|tga)|env\/.+\.(?:png|jpe?g|tga)|pics\/colormap\.pcx)$/iu;

async function gameAssetFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const pending: Promise<string[]>[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const logicalPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const filename = path.join(directory, entry.name);
    pending.push(
      entry.isDirectory()
        ? gameAssetFiles(filename, logicalPath)
        : Promise.resolve(entry.isFile() && GAME_ASSET_PATH.test(logicalPath) ? [logicalPath] : []),
    );
  }
  return (await Promise.all(pending)).flat();
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

export async function discoverLocalFixtures(localRoot: string): Promise<LocalFixtureDefinition[]> {
  let directories;
  try {
    directories = (await readdir(localRoot, { withFileTypes: true })).filter(
      (entry) => entry.isDirectory() && !entry.name.startsWith('.'),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const discovered = await Promise.all(
    directories.map(async (directory) => {
      const fixtureRoot = path.join(localRoot, directory.name);
      const files = (await bspFiles(fixtureRoot)).toSorted((left, right) =>
        left.localeCompare(right),
      );
      const assetsByApp = new Map<string, Promise<Readonly<Record<string, string>>>>();
      return Promise.all(
        files.map(async (filename) => {
          const relativeBsp = slashPath(path.relative(fixtureRoot, filename));
          const metadataFilename = filename.replace(/\.bsp$/i, '.worldview.json');
          const metadata = await metadataForBsp(filename);
          const stem = path.basename(filename, path.extname(filename));
          const id =
            files.length === 1 ? directory.name : `${directory.name}/${relativeBsp.slice(0, -4)}`;
          const label = metadata.label === undefined ? `${stem}.bsp (local)` : metadata.label;
          if (typeof label !== 'string' || !label.trim()) {
            throw new Error(`${metadataFilename}: label must be a non-empty string`);
          }
          const firstSegment = relativeBsp.split('/')[0] ?? '';
          const appGameRoot = path.join(fixtureRoot, firstSegment, 'game');
          const hasAppGameRoot = /^\d+$/u.test(firstSegment) && (await existingFile(appGameRoot));
          const publicFixtureRoot = `/local/${encodeURIComponent(directory.name)}/`;
          let gameAssets: Readonly<Record<string, string>> | undefined;
          if (hasAppGameRoot) {
            let pending = assetsByApp.get(firstSegment);
            if (!pending) {
              const publicGameRoot = `${publicFixtureRoot}${encodeURIComponent(firstSegment)}/game/`;
              pending = gameAssetFiles(appGameRoot).then((assets) =>
                Object.fromEntries(
                  assets
                    .toSorted((left, right) => left.localeCompare(right))
                    .map((asset) => [
                      asset.toLowerCase(),
                      `${publicGameRoot}${asset.split('/').map(encodeURIComponent).join('/')}`,
                    ]),
                ),
              );
              assetsByApp.set(firstSegment, pending);
            }
            gameAssets = await pending;
          }
          const fixture = {
            id,
            label: label.trim(),
            bsp: hasAppGameRoot
              ? `${publicFixtureRoot}${relativeBsp.split('/').map(encodeURIComponent).join('/')}`
              : relativeBsp,
            gameBaseUrl: hasAppGameRoot
              ? `${publicFixtureRoot}${encodeURIComponent(firstSegment)}/game/`
              : publicFixtureRoot,
            ...(gameAssets ? { gameAssets } : {}),
            aliases: stringAliases(metadata.aliases, metadataFilename),
          } satisfies LocalFixtureDefinition;
          const camera = cameraDefinition(metadata.camera, metadataFilename);
          const walkabilityFilename = filename.replace(/\.bsp$/i, '.worldview-walkability.json');
          const walkability = (await existingFile(walkabilityFilename))
            ? `/local/${encodeURIComponent(directory.name)}/${slashPath(
                path.relative(fixtureRoot, walkabilityFilename),
              )
                .split('/')
                .map(encodeURIComponent)
                .join('/')}`
            : undefined;
          return Object.assign(fixture, {
            ...(camera ? { camera } : {}),
            ...(walkability ? { walkability } : {}),
          });
        }),
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
