import {
  decodeTga,
  decodeWalTexture,
  readPcxPalette,
  readWalTextureHeader,
  validateTextureDimensions,
  type DecodedMipTexture,
  type ParsedWorld,
} from '../core/index.js';
import type { LoadedMaterialTexture, LoadedSkybox, SkyboxSuffix } from '../render/assets.js';
import { abortIfNeeded, type LoadAssetContext } from './asset-source.js';
import { GameAssetLoader } from './game-asset-source.js';
import type { WarningDetail } from './types.js';

interface Quake2MaterialStage {
  readonly value: {
    readonly materialTextures: ReadonlyMap<number, LoadedMaterialTexture>;
    readonly missingTextures: readonly string[];
  };
  readonly warnings: readonly WarningDetail[];
}

interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

const replacementExtensions = ['png', 'tga', 'jpg', 'jpeg'] as const;
const skyboxSuffixes: readonly SkyboxSuffix[] = ['rt', 'bk', 'lf', 'ft', 'up', 'dn'];
const MAX_CONCURRENT_TEXTURE_LOADS = 8;

function imageMediaType(extension: (typeof replacementExtensions)[number]): string {
  if (extension === 'png') return 'image/png';
  if (extension === 'tga') return 'image/x-tga';
  return 'image/jpeg';
}

async function decodeBrowserImage(
  bytes: ArrayBuffer,
  mediaType: string,
  context: LoadAssetContext,
): Promise<DecodedImage> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error(`${mediaType} texture decoding requires createImageBitmap`);
  }
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mediaType }));
  abortIfNeeded(context.signal);
  try {
    validateTextureDimensions(bitmap.width, bitmap.height, `${mediaType} texture`);
    const canvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(bitmap.width, bitmap.height)
        : Object.assign(document.createElement('canvas'), {
            width: bitmap.width,
            height: bitmap.height,
          });
    const drawing = canvas.getContext('2d', { willReadFrequently: true });
    if (!drawing) throw new Error(`could not create a canvas for ${mediaType} texture decoding`);
    drawing.drawImage(bitmap, 0, 0);
    const pixels = drawing.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      width: bitmap.width,
      height: bitmap.height,
      rgba: new Uint8Array(pixels.data.buffer.slice(0)),
    };
  } finally {
    bitmap.close();
  }
}

export async function decodeQuake2Image(
  bytes: ArrayBuffer,
  extension: (typeof replacementExtensions)[number],
  context: LoadAssetContext,
): Promise<DecodedImage> {
  if (extension === 'tga') return decodeTga(bytes);
  return decodeBrowserImage(bytes, imageMediaType(extension), context);
}

export async function loadQuake2Palette(loader: GameAssetLoader): Promise<Uint8Array | undefined> {
  const bytes = await loader.read('pics/colormap.pcx', 'palette');
  return bytes ? readPcxPalette(bytes) : undefined;
}

export async function loadQuake2Skybox(
  skyName: string,
  loader: GameAssetLoader,
  context: LoadAssetContext,
): Promise<LoadedSkybox | undefined> {
  const normalizedName = skyName.replace(/\.[^/.]+$/u, '');
  const entries = await Promise.all(
    skyboxSuffixes.map(async (suffix) => {
      for (const extension of replacementExtensions) {
        const bytes = await loader.read(`env/${normalizedName}${suffix}.${extension}`, 'skybox');
        if (bytes) return [suffix, await decodeQuake2Image(bytes, extension, context)] as const;
      }
      return null;
    }),
  );
  if (entries.some((entry) => entry === null)) return undefined;
  const decoded = new Map(entries.filter((entry) => entry !== null));
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
    throw new Error(`Quake II skybox ${skyName} faces do not have matching dimensions`);
  }
  return { name: skyName, sides };
}

function textureNames(name: string): readonly string[] {
  const normalized = name
    .replaceAll('\\', '/')
    .replace(/^textures\//iu, '')
    .toLowerCase();
  const rerelease = normalized.replaceAll('+', '_');
  return rerelease === normalized ? [normalized] : [normalized, rerelease];
}

async function firstReplacement(
  names: readonly string[],
  loader: GameAssetLoader,
  context: LoadAssetContext,
  warnings: WarningDetail[],
): Promise<{ readonly image: DecodedImage; readonly path: string } | null> {
  for (const name of names) {
    for (const extension of replacementExtensions) {
      const path = `textures/${name}.${extension}`;
      const bytes = await loader.read(path, 'texture');
      if (!bytes) continue;
      try {
        return { image: await decodeQuake2Image(bytes, extension, context), path };
      } catch (error) {
        abortIfNeeded(context.signal);
        warnings.push({
          code: 'asset-warning',
          message: `${path} could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }
  return null;
}

async function firstWal(
  names: readonly string[],
  loader: GameAssetLoader,
): Promise<{ readonly bytes: ArrayBuffer; readonly path: string } | null> {
  for (const name of names) {
    const path = `textures/${name}.wal`;
    const bytes = await loader.read(path, 'texture');
    if (bytes) return { bytes, path };
  }
  return null;
}

function decodedTexture(name: string, image: DecodedImage): DecodedMipTexture {
  return {
    name,
    width: image.width,
    height: image.height,
    levels: [{ width: image.width, height: image.height, rgba: image.rgba }],
    alphaTest: false,
  };
}

async function loadTexture(
  name: string,
  palette: Uint8Array | undefined,
  loader: GameAssetLoader,
  context: LoadAssetContext,
  warnings: WarningDetail[],
): Promise<LoadedMaterialTexture | null> {
  const names = textureNames(name);
  const [replacement, wal] = await Promise.all([
    firstReplacement(names, loader, context, warnings),
    firstWal(names, loader),
  ]);
  abortIfNeeded(context.signal);
  if (replacement) {
    let logical: { readonly width: number; readonly height: number } = replacement.image;
    if (wal) {
      try {
        logical = readWalTextureHeader(wal.bytes);
      } catch (error) {
        warnings.push({
          code: 'asset-warning',
          message: `${wal.path} could not supply replacement dimensions: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    return {
      texture: decodedTexture(name, replacement.image),
      logicalWidth: logical.width,
      logicalHeight: logical.height,
    };
  }
  if (!wal || !palette) return null;
  try {
    const decoded = decodeWalTexture(wal.bytes, palette);
    return {
      texture: { ...decoded, alphaTest: false },
      logicalWidth: decoded.width,
      logicalHeight: decoded.height,
    };
  } catch (error) {
    warnings.push({
      code: 'asset-warning',
      message: `${wal.path} could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
    });
    return null;
  }
}

function referencedMaterialIndices(world: ParsedWorld): Set<number> {
  const initial = world.batches.map(({ materialIndex }) => materialIndex);
  const referenced = new Set(initial);
  for (const first of initial) {
    let current = first;
    const visited = new Set<number>();
    while (!visited.has(current)) {
      visited.add(current);
      const next = world.materials[current]?.nextMaterialIndex;
      if (next === null || next === undefined) break;
      referenced.add(next);
      current = next;
    }
  }
  return referenced;
}

export async function loadQuake2MaterialTextures(
  world: ParsedWorld,
  palette: Uint8Array | undefined,
  loader: GameAssetLoader,
  context: LoadAssetContext,
): Promise<Quake2MaterialStage> {
  const indices = referencedMaterialIndices(world);
  const groups = new Map<string, { readonly name: string; readonly indices: number[] }>();
  for (const materialIndex of indices) {
    const material = world.materials[materialIndex];
    if (!material) continue;
    const key = material.name.toLowerCase();
    const group = groups.get(key);
    if (group) group.indices.push(materialIndex);
    else groups.set(key, { name: material.name, indices: [materialIndex] });
  }
  const entries = [...groups.values()];
  const materialTextures = new Map<number, LoadedMaterialTexture>();
  const missingTextures = new Set<string>();
  const assetWarnings = new Map<string, readonly WarningDetail[]>();
  let completed = 0;
  let next = 0;

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_TEXTURE_LOADS, entries.length) }, async () => {
      while (next < entries.length) {
        const entry = entries[next++];
        if (!entry) return;
        const entryWarnings: WarningDetail[] = [];
        const texture = await loadTexture(entry.name, palette, loader, context, entryWarnings);
        if (entryWarnings.length > 0) assetWarnings.set(entry.name.toLowerCase(), entryWarnings);
        if (texture) {
          for (const materialIndex of entry.indices) materialTextures.set(materialIndex, texture);
        } else missingTextures.add(entry.name);
        completed += 1;
        context.progress({
          phase: 'textures',
          label: entry.name,
          loaded: completed,
          total: entries.length,
          phaseProgress: { completed, total: entries.length },
        });
      }
    }),
  );

  const missing = [...missingTextures].toSorted();
  return {
    value: { materialTextures, missingTextures: missing },
    warnings: [
      ...[...assetWarnings]
        .toSorted(([left], [right]) => left.localeCompare(right))
        .flatMap(([, warnings]) => warnings),
      ...missing.map((name) => ({
        code: 'missing-texture' as const,
        message: `Quake II texture ${name} was not found as a replacement image or WAL`,
      })),
    ],
  };
}
