import { createHash } from 'node:crypto';
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
  /^(?:textures\/.+\.(?:wal|png|jpe?g|tga)|env\/.+\.(?:png|jpe?g|tga)|pics\/colormap\.pcx|gfx\/palette\.lmp)$/iu;
const NON_FIXTURE_DIRECTORIES = new Set(['steam-installs']);
const STEAM_CORPUS_SAMPLE_SIZE = 3;

interface SteamCorpusGame {
  readonly name: string;
  readonly slug: string;
  readonly anchor?: string;
  readonly contentRoots?: readonly string[];
}

interface SteamCorpusLevel {
  readonly filename: string;
  readonly relativePath: string;
  readonly mapPath: string;
  readonly game: SteamCorpusGame;
}

const steamGames: Readonly<Record<string, SteamCorpusGame>> = {
  '10': { name: 'Counter-Strike', slug: 'counter-strike', contentRoots: ['cstrike'] },
  '20': {
    name: 'Team Fortress Classic',
    slug: 'team-fortress-classic',
    contentRoots: ['tfc'],
  },
  '30': { name: 'Day of Defeat', slug: 'day-of-defeat', contentRoots: ['dod'] },
  '40': {
    name: 'Deathmatch Classic',
    slug: 'deathmatch-classic',
    contentRoots: ['dmc'],
  },
  '50': {
    name: 'Half-Life: Opposing Force',
    slug: 'opposing-force',
    contentRoots: ['gearbox'],
  },
  '60': { name: 'Ricochet', slug: 'ricochet', contentRoots: ['ricochet'] },
  '70': { name: 'Half-Life', slug: 'half-life', contentRoots: ['valve'] },
  '80': {
    name: 'Counter-Strike: Condition Zero',
    slug: 'condition-zero',
    contentRoots: ['czero'],
  },
  '130': { name: 'Half-Life: Blue Shift', slug: 'blue-shift', contentRoots: ['bshift'] },
  '2310': { name: 'Quake', slug: 'quake' },
  '2320': { name: 'Quake II', slug: 'quake-ii' },
  '225840': {
    name: 'Sven Co-op',
    slug: 'sven-co-op',
    contentRoots: ['svencoop', 'svencoop_event_april'],
  },
  '1000410': { name: 'WRATH: Aeon of Ruin', slug: 'wrath' },
  '3191050': {
    name: 'BRAZILIAN DRUG DEALER 3',
    slug: 'brazilian-drug-dealer-3',
    contentRoots: ['id1'],
  },
  '4484420': {
    name: 'FLESHCANCER',
    slug: 'fleshcancer',
    anchor: 'dm1',
    contentRoots: ['id1'],
  },
};

const thirtyFlights: SteamCorpusGame = {
  name: 'Thirty Flights of Loving',
  slug: 'thirty-flights-of-loving',
  anchor: 'bar1',
};
const gravityBone: SteamCorpusGame = {
  name: 'Gravity Bone',
  slug: 'gravity-bone',
  anchor: 'hof1',
};

function corpusGame(appId: string, relativePath: string): SteamCorpusGame {
  if (appId === '214700') {
    if (relativePath.includes('/pak0.pk3/')) return thirtyFlights;
    if (relativePath.includes('/pak1.pk3/')) return gravityBone;
  }
  return steamGames[appId] ?? { name: `Steam ${appId}`, slug: `steam-${appId}` };
}

function steamCorpusLevel(fixtureRoot: string, filename: string): SteamCorpusLevel | null {
  const relativePath = slashPath(path.relative(fixtureRoot, filename));
  const parts = relativePath.split('/');
  const appId = parts[0];
  if (!appId) return null;
  const mapsIndex = parts.lastIndexOf('maps');
  if (mapsIndex < 0 || mapsIndex === parts.length - 1) return null;
  const mapPath = parts
    .slice(mapsIndex + 1)
    .join('/')
    .replace(/\.bsp$/iu, '');
  const basename = path.posix.basename(mapPath);
  if (!mapPath || basename.startsWith('b_')) return null;
  const game = corpusGame(appId, relativePath);
  const contentRoots = game.contentRoots;
  if (contentRoots && !parts.slice(1, mapsIndex).some((part) => contentRoots.includes(part))) {
    return null;
  }
  if (game.slug === 'fleshcancer' && !relativePath.includes('/loose/')) return null;
  return { filename, relativePath, mapPath, game };
}

function sampleScore(level: SteamCorpusLevel): string {
  return createHash('sha256').update(`${level.game.slug}/${level.relativePath}`).digest('hex');
}

function sampledSteamCorpusLevels(
  fixtureRoot: string,
  files: readonly string[],
  incompatibleFiles: ReadonlySet<string>,
): readonly SteamCorpusLevel[] {
  const byGame = new Map<string, Map<string, SteamCorpusLevel>>();
  for (const filename of files) {
    if (incompatibleFiles.has(slashPath(path.relative(fixtureRoot, filename)))) continue;
    const level = steamCorpusLevel(fixtureRoot, filename);
    if (!level) continue;
    const levels = byGame.get(level.game.slug);
    if (levels) levels.set(level.mapPath, level);
    else byGame.set(level.game.slug, new Map([[level.mapPath, level]]));
  }
  const sampled: SteamCorpusLevel[] = [];
  for (const uniqueLevels of byGame.values()) {
    const levels = [...uniqueLevels.values()];
    const anchor = levels.find(({ game, mapPath }) => path.posix.basename(mapPath) === game.anchor);
    const candidates = levels
      .filter((level) => level !== anchor)
      .toSorted((left, right) => sampleScore(left).localeCompare(sampleScore(right)));
    sampled.push(
      ...(anchor ? [anchor] : []),
      ...candidates.slice(0, STEAM_CORPUS_SAMPLE_SIZE - (anchor ? 1 : 0)),
    );
  }
  return sampled.toSorted(
    (left, right) =>
      left.game.name.localeCompare(right.game.name) || left.mapPath.localeCompare(right.mapPath),
  );
}

interface CompatibilityFailure {
  readonly outputPath?: unknown;
}

async function incompatibleCorpusFiles(fixtureRoot: string): Promise<ReadonlySet<string>> {
  const reportPath = path.join(fixtureRoot, 'compatibility-report.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${reportPath}: ${message}`, { cause: error });
  }
  if (!parsed || typeof parsed !== 'object')
    throw new Error(`${reportPath}: report must be an object`);
  const failures = (parsed as { readonly failures?: unknown }).failures;
  if (!Array.isArray(failures)) throw new Error(`${reportPath}: failures must be an array`);
  const result = new Set<string>();
  for (const failure of failures as CompatibilityFailure[]) {
    if (!failure || typeof failure !== 'object' || typeof failure.outputPath !== 'string') {
      throw new Error(`${reportPath}: every failure must have an outputPath`);
    }
    const relativePath = slashPath(path.relative(fixtureRoot, failure.outputPath));
    if (!relativePath.startsWith('../') && relativePath !== '..') result.add(relativePath);
  }
  return result;
}

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
      const discoveredFiles = (await bspFiles(fixtureRoot)).toSorted((left, right) =>
        left.localeCompare(right),
      );
      const incompatibleFiles =
        directory.name === 'steam-corpus'
          ? await incompatibleCorpusFiles(fixtureRoot)
          : new Set<string>();
      const steamLevels =
        directory.name === 'steam-corpus'
          ? sampledSteamCorpusLevels(fixtureRoot, discoveredFiles, incompatibleFiles)
          : [];
      const steamLevelByFilename = new Map(
        steamLevels.map((level) => [level.filename, level] as const),
      );
      const files =
        directory.name === 'steam-corpus'
          ? steamLevels.map(({ filename }) => filename)
          : discoveredFiles;
      const assetsByApp = new Map<string, Promise<Readonly<Record<string, string>>>>();
      return Promise.all(
        files.map(async (filename) => {
          const relativeBsp = slashPath(path.relative(fixtureRoot, filename));
          const metadataFilename = filename.replace(/\.bsp$/i, '.worldview.json');
          const metadata = await metadataForBsp(filename);
          const stem = path.basename(filename, path.extname(filename));
          const steamLevel = steamLevelByFilename.get(filename);
          const id = steamLevel
            ? `${directory.name}/${steamLevel.game.slug}/${steamLevel.mapPath}`
            : files.length === 1
              ? directory.name
              : `${directory.name}/${relativeBsp.slice(0, -4)}`;
          const label =
            metadata.label === undefined
              ? steamLevel
                ? `${stem}.bsp`
                : `${stem}.bsp (local)`
              : metadata.label;
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
            ...(steamLevel ? { namespace: steamLevel.game.name } : {}),
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
