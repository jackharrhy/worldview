import {
  entityValue,
  normalizeGameAssetPath,
  parseBsp,
  parseWad,
  planWorldAssets,
} from '@jackharrhy/worldview/core';
import type { CompileAssetEntry } from './editor-application-contracts.js';

/** Immutable inputs captured when a successful build was requested. */
export interface BuildExportBundle {
  readonly documentKey: string;
  readonly documentId: string;
  readonly revision: number;
  readonly name: string;
  readonly bsp: ArrayBuffer;
  readonly source: string;
  readonly wads: readonly CompileAssetEntry[];
  readonly gameAssets: ReadonlyMap<string, ArrayBuffer>;
}

export interface BuildExportFile {
  readonly name: string;
  readonly data: ArrayBuffer;
  readonly mediaType: string;
}

function safePath(path: string): string {
  const normalized = normalizeGameAssetPath(path);
  if (normalized.includes(':') || [...normalized].some((character) => character.charCodeAt(0) < 32))
    throw new Error(`Unsafe export path: ${path}`);
  return normalized;
}

/** Engine-root paths; WADs are only needed at runtime for external BSP textures. */
export function buildExportEntries(bundle: BuildExportBundle, includeSource: boolean) {
  const world = parseBsp(bundle.bsp);
  const plan = planWorldAssets(world, { includeViewerDefaults: false });
  const stem =
    bundle.name
      .replace(/\.map$/iu, '')
      .replace(/[^a-zA-Z0-9_-]/gu, '_')
      .toLowerCase() || 'map';
  const files = new Map<string, ArrayBuffer>([[`maps/${stem}.bsp`, bundle.bsp]]);
  const add = (path: string, data: ArrayBuffer) => {
    const name = safePath(path);
    if (files.has(name)) throw new Error(`Duplicate export path: ${name}`);
    files.set(name, data);
  };
  const assets = new Map([...bundle.gameAssets].map(([path, data]) => [safePath(path), data]));
  const requireAsset = (path: string) => {
    const name = safePath(path);
    if (files.has(name)) return;
    const data = assets.get(name);
    if (!data)
      throw new Error(`Export needs ${name}. Include it in the project's resources first.`);
    add(name, data);
  };
  const requireCandidate = (candidates: readonly string[]) => {
    const path = candidates.find((candidate) => assets.has(safePath(candidate))) ?? candidates[0];
    if (path) requireAsset(path);
  };
  // Animation frames may be referenced by the texture table without a direct draw batch.
  const external = world.materials.filter(
    (material) => material.kind !== 'tool' && !material.embeddedTexture,
  );
  if (external.length) {
    if (world.version === 38) {
      for (const texture of plan.textures) requireCandidate(texture.walCandidates);
    } else {
      if (world.version !== 30)
        throw new Error('The Quake BSP has missing textures. Rebuild with its WADs included.');
      const requiredWads = world.wadReferences.map((reference) => {
        const wad = bundle.wads.find(({ name }) => name.toLowerCase() === reference.basename);
        if (!wad)
          throw new Error(`Export needs ${reference.basename}. Rebuild with its WAD included.`);
        return wad;
      });
      const textures = new Set(
        requiredWads.flatMap(({ data }) =>
          parseWad(data).lumps.flatMap((lump) =>
            lump.mipTexture ? [lump.mipTexture.name.toLowerCase()] : [],
          ),
        ),
      );
      for (const material of external) {
        if (!textures.has(material.name.toLowerCase()))
          throw new Error(`Export needs texture ${material.name}. Rebuild with its WAD included.`);
      }
      for (const wad of requiredWads) add(wad.name, wad.data);
      if (!world.wadReferences.length)
        throw new Error('The BSP has external textures but no WAD references.');
    }
  }
  for (const asset of [...plan.sounds, ...plan.sprites, ...(plan.skybox?.faces ?? [])])
    requireCandidate(asset.candidates);
  for (const entity of world.entities) {
    for (const key of ['model', 'noise', 'noise1', 'noise2', 'noise3']) {
      const value = entityValue(entity, key);
      if (!value || value.startsWith('*') || !/\.(mdl|md2|spr|sp2|wav|ogg|mp3)$/iu.test(value))
        continue;
      if (/\.(mdl|md2|sp2)$/iu.test(value))
        throw new Error(
          `Automatic export cannot yet resolve model dependencies for ${value}. Download the raw BSP from Build results instead.`,
        );
      requireAsset(
        /\.(wav|ogg|mp3)$/iu.test(value) && !value.startsWith('sound/') ? `sound/${value}` : value,
      );
    }
  }
  if (includeSource) {
    add(`maps/${stem}.map`, new TextEncoder().encode(bundle.source).buffer);
    for (const wad of bundle.wads) if (!files.has(safePath(wad.name))) add(wad.name, wad.data);
  }
  return { stem, files };
}

export async function packageBuildExport(
  bundle: BuildExportBundle,
  includeSource: boolean,
): Promise<BuildExportFile> {
  const { stem, files } = buildExportEntries(bundle, includeSource);
  if (files.size === 1)
    return { name: `${stem}.bsp`, data: bundle.bsp, mediaType: 'application/x-quake-bsp' };
  const { zip } = await import('fflate');
  const data = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    zip(
      Object.fromEntries([...files].map(([path, bytes]) => [path, new Uint8Array(bytes)])),
      { level: 0 },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
  });
  return { name: `${stem}.zip`, data: data.buffer, mediaType: 'application/zip' };
}
