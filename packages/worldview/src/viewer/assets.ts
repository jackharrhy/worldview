/*
 * Asset orchestration is adapted from noclip.website's GoldSrc and Quake scene loaders.
 * See docs/plan.md and THIRD_PARTY_NOTICES.md for pinned source references.
 */

import {
  decodeTga,
  findMipTexture,
  parseBsp,
  parseWad,
  WorldviewError,
  type ParsedWad,
  type ParsedWorld,
} from '../core/index.js';
import type { LoadedSkybox, RenderWorldAssets, SkyboxSuffix } from '../render/assets.js';
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
import type { BinarySource, WarningDetail, WorldSource } from './types.js';

export { readBinarySource, resolveWorldSource, type LoadAssetContext } from './asset-source.js';
export type { LoadedSkybox, LoadedSpriteEntity, SkyboxSuffix } from '../render/assets.js';
export type { LoadedMusicAsset, LoadedSoundAsset } from './sound-assets.js';

export interface LoadedWorld extends RenderWorldAssets {
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

async function loadPalette(
  world: ParsedWorld,
  source: WorldSource,
  context: LoadAssetContext,
): Promise<Uint8Array | undefined> {
  const paletteSource =
    source.palette ??
    (world.version === 29 && source.gameBaseUrl
      ? sourceBelow(source.gameBaseUrl, 'gfx/palette.lmp')
      : undefined);
  if (!paletteSource) {
    if (world.version === 29) {
      throw new WorldviewError(
        'missing-palette',
        'BSP29 maps require an external 768-byte Quake palette',
      );
    }
    return undefined;
  }
  const palette = new Uint8Array(
    await readBinarySource(paletteSource, 'palette', 'Quake palette', context),
  );
  if (palette.byteLength < 768) {
    throw new WorldviewError('missing-palette', 'Quake palette must contain at least 768 bytes');
  }
  return palette.slice(0, 768);
}

async function loadSkybox(
  world: ParsedWorld,
  source: WorldSource,
  context: LoadAssetContext,
): Promise<AssetStage<LoadedSkybox | undefined>> {
  if (world.version !== 30 || !world.skyName || (!source.skybox && !source.skyboxBaseUrl)) {
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

async function wadCandidates(
  world: ParsedWorld,
  source: WorldSource,
  context: LoadAssetContext,
): Promise<AssetStage<readonly WadCandidate[]>> {
  const explicit = (source.wads ?? []).map((wad, index) => ({
    source: wad,
    label: `explicit WAD ${index + 1}`,
  }));
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
    value: [...explicit, ...resolved.flatMap((result) => result.candidates)],
    warnings: resolved.flatMap((result) => (result.warning ? [result.warning] : [])),
  };
}

async function loadWads(
  world: ParsedWorld,
  source: WorldSource,
  context: LoadAssetContext,
): Promise<AssetStage<readonly ParsedWad[]>> {
  const candidates = await wadCandidates(world, source, context);
  const results = await Promise.all(
    candidates.value.map(async (candidate) => {
      try {
        const bytes = await readBinarySource(candidate.source, 'wad', candidate.label, context);
        return { wad: parseWad(bytes) };
      } catch (error) {
        if (context.signal.aborted) throw error;
        return {
          warning: {
            code: 'missing-wad',
            message: `${candidate.label} could not be loaded: ${errorMessage(error)}`,
          } satisfies WarningDetail,
        };
      }
    }),
  );
  return {
    value: results.flatMap((result) => (result.wad ? [result.wad] : [])),
    warnings: [
      ...candidates.warnings,
      ...results.flatMap((result) => (result.warning ? [result.warning] : [])),
    ],
  };
}

function resolveTextures(
  world: ParsedWorld,
  wads: readonly ParsedWad[],
  context: LoadAssetContext,
): AssetStage<{
  textureData: ReadonlyMap<number, Uint8Array>;
  missingTextures: readonly string[];
}> {
  const referencedMaterials = new Set(world.batches.map((batch) => batch.materialIndex));
  const textureData = new Map<number, Uint8Array>();
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
    if (bytes) textureData.set(materialIndex, bytes);
    else {
      missingTextures.push(material.name);
      warnings.push({
        code: 'missing-texture',
        message: `texture ${material.name} was not embedded and was not found in the supplied WADs`,
      });
    }
    context.progress({
      phase: 'textures',
      label: material.name,
      loaded: textureData.size + missingTextures.length,
      total: referencedMaterials.size,
    });
  }
  return { value: { textureData, missingTextures }, warnings };
}

export async function loadWorldAssets(
  source: WorldSource,
  context: LoadAssetContext,
): Promise<LoadedWorld> {
  const resolvedSource = resolveWorldSource(source);
  const bspBytes = await readBinarySource(resolvedSource.bsp, 'bsp', 'BSP', context);
  context.progress({ phase: 'parse', label: 'BSP', loaded: 0, total: bspBytes.byteLength });
  const world = parseBsp(bspBytes);
  context.progress({
    phase: 'parse',
    label: 'BSP',
    loaded: bspBytes.byteLength,
    total: bspBytes.byteLength,
  });
  const palette = await loadPalette(world, resolvedSource, context);
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

  const [spriteAssets, soundAssets, skybox, wads] = await Promise.all([
    loadSpriteAssets(world, resolvedSource, context),
    loadSoundAssets(world, resolvedSource, context),
    loadSkybox(world, resolvedSource, context),
    loadWads(world, resolvedSource, context),
  ]);
  const textures = resolveTextures(world, wads.value, context);
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
    textureData: textures.value.textureData,
    missingTextures: textures.value.missingTextures,
    warnings: [
      ...baseWarnings,
      ...spriteAssets.warnings,
      ...soundAssets.warnings,
      ...skybox.warnings,
      ...wads.warnings,
      ...textures.warnings,
    ],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
