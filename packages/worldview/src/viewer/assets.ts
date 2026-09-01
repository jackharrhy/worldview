/*
 * Asset orchestration is adapted from noclip.website's GoldSrc and Quake scene loaders.
 * See docs/plan.md and THIRD_PARTY_NOTICES.md for pinned source references.
 */

import {
  decodeMipTexture,
  decodeQuakeSky,
  decodeTga,
  findMipTexture,
  isQuakePaletteFormat,
  parseBsp,
  parseWad,
  readPcxPalette,
  WorldviewError,
  type ParsedWad,
  type ParsedWorld,
} from '../core/index.js';
import type {
  LoadedMaterialTexture,
  LoadedSkybox,
  RenderWorldAssets,
  SkyboxSuffix,
} from '../render/assets.js';
import {
  abortIfNeeded,
  readBinarySource,
  resolveWorldSource,
  skyboxUrl,
  sourceBelow,
  wadUrl,
  type LoadAssetContext,
} from './asset-source.js';
import { loadSoundAssets, type LoadedMusicAsset, type LoadedSoundAsset } from './sound-assets.js';
import { loadSpriteAssets } from './sprite-assets.js';
import { GameAssetLoader } from './game-asset-source.js';
import {
  loadQuake2MaterialTextures,
  loadQuake2Palette,
  loadQuake2Skybox,
} from './quake2-assets.js';
import type { BinarySource, ProgressDetail, WarningDetail, WorldSource } from './types.js';

export { readBinarySource, resolveWorldSource, type LoadAssetContext } from './asset-source.js';
export type { LoadedSkybox, LoadedSpriteEntity, SkyboxSuffix } from '../render/assets.js';
export type { LoadedMusicAsset, LoadedSoundAsset } from './sound-assets.js';

export interface LoadedWorld extends RenderWorldAssets {
  /** Decoded palette retained for diagnostics and non-render consumers. */
  readonly palette?: Uint8Array;
  readonly missingTextures: readonly string[];
  readonly missingSprites: readonly string[];
  readonly sounds: ReadonlyMap<string, LoadedSoundAsset>;
  readonly music: ReadonlyMap<string, LoadedMusicAsset>;
  readonly playerSounds: ReadonlyMap<string, LoadedSoundAsset>;
  readonly missingSounds: readonly string[];
  readonly missingMusic: readonly string[];
  readonly warnings: readonly WarningDetail[];
}

const skyboxSuffixes: readonly SkyboxSuffix[] = ['rt', 'bk', 'lf', 'ft', 'up', 'dn'];

interface AssetStage<T> {
  readonly value: T;
  readonly warnings: readonly WarningDetail[];
}

interface WadProgressTracker {
  completed: number;
  total?: number;
}

function withWadProgress(detail: ProgressDetail, progress: WadProgressTracker): ProgressDetail {
  return progress.total === undefined
    ? detail
    : {
        ...detail,
        phaseProgress: { completed: progress.completed, total: progress.total },
      };
}

function parsePalette(bytes: ArrayBuffer): Uint8Array {
  const palette = new Uint8Array(bytes);
  if (palette[0] === 0x0a) return readPcxPalette(palette);
  if (palette.byteLength < 768) {
    throw new WorldviewError('missing-palette', 'Quake palette must contain at least 768 bytes');
  }
  return palette.slice(0, 768);
}

async function loadPaletteSource(
  paletteSource: BinarySource,
  context: LoadAssetContext,
): Promise<Uint8Array> {
  return parsePalette(await readBinarySource(paletteSource, 'palette', 'Quake palette', context));
}

async function loadDerivedPalette(
  world: ParsedWorld,
  source: WorldSource,
  gameAssets: GameAssetLoader,
  context: LoadAssetContext,
): Promise<Uint8Array | undefined> {
  if (world.format === 'quake2-bsp38') return loadQuake2Palette(gameAssets);
  if (!isQuakePaletteFormat(world.format)) return undefined;
  if (!source.gameBaseUrl) {
    throw new WorldviewError(
      'missing-palette',
      'Quake BSP maps require an external 768-byte palette',
    );
  }
  return loadPaletteSource(sourceBelow(source.gameBaseUrl, 'gfx/palette.lmp'), context);
}

async function loadSkybox(
  world: ParsedWorld,
  source: WorldSource,
  gameAssets: GameAssetLoader,
  context: LoadAssetContext,
): Promise<AssetStage<LoadedSkybox | undefined>> {
  if (!world.skyName) {
    return { value: undefined, warnings: [] };
  }
  if (world.format === 'quake2-bsp38' && !source.skybox) {
    try {
      const value = await loadQuake2Skybox(world.skyName, gameAssets, context);
      return value
        ? { value, warnings: [] }
        : {
            value: undefined,
            warnings: [
              {
                code: 'missing-skybox',
                message: `Quake II skybox ${world.skyName} could not be resolved from the game assets`,
              },
            ],
          };
    } catch (error) {
      if (context.signal.aborted) throw error;
      return {
        value: undefined,
        warnings: [
          {
            code: 'missing-skybox',
            message: `Quake II skybox ${world.skyName} could not be loaded: ${errorMessage(error)}`,
          },
        ],
      };
    }
  }
  if (world.version !== 30 || (!source.skybox && !source.skyboxBaseUrl)) {
    return { value: undefined, warnings: [] };
  }
  try {
    const entries = await Promise.all(
      skyboxSuffixes.map(async (suffix) => {
        const binary =
          source.skybox?.[suffix] ?? skyboxUrl(source.skyboxBaseUrl!, world.skyName!, suffix);
        const bytes = await readBinarySource(
          binary,
          'skybox',
          `${world.skyName}${suffix}.tga`,
          context,
        );
        return [suffix, decodeTga(bytes)] as const;
      }),
    );
    const decoded = new Map(entries);
    const sides: LoadedSkybox['sides'] = {
      rt: decoded.get('rt')!,
      bk: decoded.get('bk')!,
      lf: decoded.get('lf')!,
      ft: decoded.get('ft')!,
      up: decoded.get('up')!,
      dn: decoded.get('dn')!,
    };
    const first = sides.rt;
    if (
      !skyboxSuffixes.every(
        (suffix) => sides[suffix].width === first.width && sides[suffix].height === first.height,
      )
    ) {
      throw new WorldviewError('invalid-data', 'skybox faces must have matching dimensions');
    }
    return { value: { name: world.skyName, sides }, warnings: [] };
  } catch (error) {
    if (context.signal.aborted) throw error;
    return {
      value: undefined,
      warnings: [
        {
          code: 'missing-skybox',
          message: `skybox ${world.skyName} could not be loaded: ${errorMessage(error)}`,
        },
      ],
    };
  }
}

interface WadCandidate {
  readonly source: BinarySource;
  readonly label: string;
}

function explicitWadCandidates(source: WorldSource): readonly WadCandidate[] {
  return (source.wads ?? []).map((wad, index) => ({
    source: wad,
    label: `explicit WAD ${index + 1}`,
  }));
}

async function referencedWadCandidates(
  world: ParsedWorld,
  source: WorldSource,
  context: LoadAssetContext,
): Promise<AssetStage<readonly WadCandidate[]>> {
  const resolved = await Promise.all(
    world.wadReferences.map(async (reference) => {
      let resolverSource: BinarySource | undefined;
      let warning: WarningDetail | undefined;
      if (source.resolveWad) {
        try {
          resolverSource = (await source.resolveWad(reference)) ?? undefined;
        } catch (error) {
          if (context.signal.aborted) throw error;
          warning = {
            code: 'missing-wad',
            message: `resolver failed for ${reference.basename}: ${errorMessage(error)}`,
          };
        }
      }
      const candidates: WadCandidate[] = [];
      if (resolverSource) {
        candidates.push({ source: resolverSource, label: `resolved ${reference.basename}` });
      }
      if (source.wadBaseUrl) {
        candidates.push({
          source: wadUrl(source.wadBaseUrl, reference),
          label: reference.basename,
        });
      }
      return { candidates, warning };
    }),
  );
  return {
    value: resolved.flatMap((result) => result.candidates),
    warnings: resolved.flatMap((result) => (result.warning ? [result.warning] : [])),
  };
}

async function loadWadCandidates(
  candidates: readonly WadCandidate[],
  context: LoadAssetContext,
  progress: WadProgressTracker,
): Promise<AssetStage<readonly ParsedWad[]>> {
  const results = await Promise.all(
    candidates.map(async (candidate) => {
      let latestProgress: ProgressDetail = {
        phase: 'wad' as const,
        label: candidate.label,
        loaded: 0,
      };
      const candidateContext: LoadAssetContext = {
        ...context,
        progress(detail) {
          latestProgress = detail;
          context.progress(withWadProgress(detail, progress));
        },
      };
      try {
        const bytes = await readBinarySource(
          candidate.source,
          'wad',
          candidate.label,
          candidateContext,
        );
        return { wad: parseWad(bytes) };
      } catch (error) {
        if (context.signal.aborted) throw error;
        return {
          warning: {
            code: 'missing-wad',
            message: `${candidate.label} could not be loaded: ${errorMessage(error)}`,
          } satisfies WarningDetail,
        };
      } finally {
        if (!context.signal.aborted) {
          progress.completed += 1;
          context.progress(withWadProgress(latestProgress, progress));
        }
      }
    }),
  );
  return {
    value: results.flatMap((result) => (result.wad ? [result.wad] : [])),
    warnings: results.flatMap((result) => (result.warning ? [result.warning] : [])),
  };
}

function resolveTextures(
  world: ParsedWorld,
  wads: readonly ParsedWad[],
  palette: Uint8Array | undefined,
  context: LoadAssetContext,
): AssetStage<{
  materialTextures: ReadonlyMap<number, LoadedMaterialTexture>;
  missingTextures: readonly string[];
}> {
  const referencedMaterials = new Set(world.batches.map((batch) => batch.materialIndex));
  const materialTextures = new Map<number, LoadedMaterialTexture>();
  const missingTextures: string[] = [];
  const warnings: WarningDetail[] = [];
  for (const materialIndex of referencedMaterials) {
    abortIfNeeded(context.signal);
    const material = world.materials[materialIndex];
    if (!material) continue;
    let bytes = material.embeddedTexture?.data;
    if (!bytes) {
      for (const wad of wads) {
        bytes = findMipTexture(wad, material.name);
        if (bytes) break;
      }
    }
    if (bytes) {
      const texture = decodeMipTexture(
        bytes,
        isQuakePaletteFormat(world.format) ? palette : undefined,
      );
      materialTextures.set(materialIndex, {
        texture,
        logicalWidth: texture.width,
        logicalHeight: texture.height,
        ...(isQuakePaletteFormat(world.format) && material.kind === 'sky' && palette
          ? { quakeSky: decodeQuakeSky(bytes, palette) }
          : {}),
      });
    } else {
      missingTextures.push(material.name);
      warnings.push({
        code: 'missing-texture',
        message: `texture ${material.name} was not embedded and was not found in the supplied WADs`,
      });
    }
    context.progress({
      phase: 'textures',
      label: material.name,
      loaded: materialTextures.size + missingTextures.length,
      total: referencedMaterials.size,
    });
  }
  return { value: { materialTextures, missingTextures }, warnings };
}

export async function loadWorldAssets(
  source: WorldSource,
  context: LoadAssetContext,
): Promise<LoadedWorld> {
  const resolvedSource = resolveWorldSource(source);
  const operation = new AbortController();
  const loadContext: LoadAssetContext = {
    ...context,
    signal: AbortSignal.any([context.signal, operation.signal]),
  };
  const explicitWadSources = explicitWadCandidates(resolvedSource);
  const hasReferencedWadSource = Boolean(resolvedSource.resolveWad || resolvedSource.wadBaseUrl);
  const wadProgress: WadProgressTracker = {
    completed: 0,
    ...(hasReferencedWadSource ? {} : { total: explicitWadSources.length }),
  };
  const bspPromise = readBinarySource(resolvedSource.bsp, 'bsp', 'BSP', loadContext);
  const explicitWadsPromise = loadWadCandidates(explicitWadSources, loadContext, wadProgress);
  void explicitWadsPromise.catch(() => undefined);
  const explicitPalettePromise = resolvedSource.palette
    ? loadPaletteSource(resolvedSource.palette, loadContext)
    : null;
  void explicitPalettePromise?.catch((error: unknown) => operation.abort(error));

  try {
    const bspBytes = await bspPromise;
    loadContext.progress({
      phase: 'parse',
      label: 'BSP',
      loaded: 0,
      total: bspBytes.byteLength,
    });
    const world = parseBsp(bspBytes);
    loadContext.progress({
      phase: 'parse',
      label: 'BSP',
      loaded: bspBytes.byteLength,
      total: bspBytes.byteLength,
    });
    const gameAssets = new GameAssetLoader(resolvedSource, loadContext);
    const referencedWadsPromise = referencedWadCandidates(world, resolvedSource, loadContext).then(
      async (candidates) => {
        wadProgress.total = explicitWadSources.length + candidates.value.length;
        loadContext.progress({
          phase: 'wad',
          label: 'WAD files',
          loaded: wadProgress.completed,
          total: wadProgress.total,
          phaseProgress: { completed: wadProgress.completed, total: wadProgress.total },
        });
        const loaded = await loadWadCandidates(candidates.value, loadContext, wadProgress);
        return {
          value: loaded.value,
          warnings: [...candidates.warnings, ...loaded.warnings],
        } satisfies AssetStage<readonly ParsedWad[]>;
      },
    );
    const palettePromise =
      explicitPalettePromise ?? loadDerivedPalette(world, resolvedSource, gameAssets, loadContext);
    const [palette, spriteAssets, soundAssets, skybox, explicitWads, referencedWads] =
      await Promise.all([
        palettePromise,
        loadSpriteAssets(world, resolvedSource, loadContext),
        loadSoundAssets(world, resolvedSource, loadContext),
        loadSkybox(world, resolvedSource, gameAssets, loadContext),
        explicitWadsPromise,
        referencedWadsPromise,
      ]);
    const wads: AssetStage<readonly ParsedWad[]> = {
      value: [...explicitWads.value, ...referencedWads.value],
      warnings: [...explicitWads.warnings, ...referencedWads.warnings],
    };
    const textures =
      world.format === 'quake2-bsp38'
        ? await loadQuake2MaterialTextures(world, palette, gameAssets, loadContext)
        : resolveTextures(world, wads.value, palette, loadContext);
    const baseWarnings: WarningDetail[] =
      world.envSounds.length > 0 && !world.trace
        ? [
            {
              code: 'audio-warning',
              message:
                'env_sound entities will use range-only selection because this BSP has no trace tree',
            },
          ]
        : [];
    return {
      world,
      ...(palette ? { palette } : {}),
      ...(skybox.value ? { skybox: skybox.value } : {}),
      sprites: spriteAssets.sprites,
      missingSprites: spriteAssets.missingSprites,
      sounds: soundAssets.sounds,
      music: soundAssets.music,
      playerSounds: soundAssets.playerSounds,
      missingSounds: soundAssets.missingSounds,
      missingMusic: soundAssets.missingMusic,
      materialTextures: textures.value.materialTextures,
      missingTextures: textures.value.missingTextures,
      warnings: [
        ...world.warnings,
        ...baseWarnings,
        ...spriteAssets.warnings,
        ...soundAssets.warnings,
        ...skybox.warnings,
        ...wads.warnings,
        ...textures.warnings,
      ],
    };
  } catch (error) {
    operation.abort(error);
    throw error;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
