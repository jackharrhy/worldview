import { createHash } from 'node:crypto';
import {
  createDevelopmentMaterials,
  createCompilerToolMaterials,
  createDiagnosticQuakePalette,
  encodeQuakeWad2,
  parseMap,
  serializeMapForCompile,
} from '@jackharrhy/worldview-editor/core';
import type { HostedResourceMount } from '@worldview/protocol';
import type { BlobStore } from './blob-store.js';

const developmentWad = new Uint8Array(
  encodeQuakeWad2(
    [...createDevelopmentMaterials(), ...createCompilerToolMaterials()],
    createDiagnosticQuakePalette(),
  ),
);

/** Resolves pinned project bytes, never browser-provided files or remote mutable content. */
export async function prepareHostedBuildResources(
  source: string,
  game: 'quake' | 'goldsrc',
  mounts: readonly HostedResourceMount[],
  blobs: BlobStore,
) {
  const assets: { name: string; mediaType: string; bytes: Uint8Array }[] = [
    { name: 'worldview_dev.wad', mediaType: 'application/x-wad', bytes: developmentWad },
  ];
  let totalBytes = developmentWad.byteLength;
  let palette: Uint8Array | undefined;
  for (const mount of mounts) {
    if (
      mount.kind !== 'palette' &&
      mount.kind !== 'wad' &&
      !mount.displayName.toLowerCase().endsWith('.wad')
    )
      continue;
    const bytes = await blobs.get(mount.expectedSha256);
    if (!bytes)
      throw new Error(
        `Texture pack ${mount.displayName} is unavailable. Restore the pinned project resource before building.`,
      );
    if (createHash('sha256').update(bytes).digest('hex') !== mount.expectedSha256) {
      throw new Error(`Texture pack ${mount.displayName} does not match its pinned content.`);
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > 24 * 1024 * 1024)
      throw new Error('Build texture packs exceed the 24 MiB limit.');
    if (mount.kind === 'palette') {
      if (bytes.byteLength !== 768)
        throw new Error(`Palette ${mount.displayName} must contain 768 bytes.`);
      palette = bytes;
      continue;
    }
    if (assets.length >= 16) throw new Error('Builds support at most 15 project texture packs.');
    assets.push({ name: `project_${assets.length}.wad`, mediaType: 'application/x-wad', bytes });
  }
  if (palette)
    assets[0] = {
      name: 'worldview_dev.wad',
      mediaType: 'application/x-wad',
      bytes: new Uint8Array(
        encodeQuakeWad2(
          [...createDevelopmentMaterials(), ...createCompilerToolMaterials()],
          palette,
        ),
      ),
    };
  const mapText = serializeMapForCompile(
    parseMap(source),
    assets.map(({ name, bytes }) => ({ name, data: bytes })),
    game,
  );
  if (
    assets.reduce((sum, asset) => sum + Math.ceil(asset.bytes.byteLength / 3) * 4, 0) >
    32 * 1024 * 1024
  ) {
    throw new Error('Encoded build texture packs exceed the compiler input limit.');
  }
  return { mapText, assets };
}
