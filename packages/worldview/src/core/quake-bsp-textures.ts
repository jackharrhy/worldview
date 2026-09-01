import { BinaryView } from './binary.js';
import { invariant, WorldviewError } from './errors.js';
import { classifyMaterial } from './materials.js';
import { readMipTextureHeader, type MipTextureHeader } from './miptex.js';
import type { QuakeBspLayout } from './quake-bsp-layout.js';
import type { BspWarning, ParsedMaterial, ParsedMipTexture } from './types.js';

interface ParsedQuakeTextures {
  readonly materials: readonly ParsedMaterial[];
  readonly warnings: readonly BspWarning[];
}

function texturePayload(
  texture: BinaryView,
  header: MipTextureHeader,
  embeddedPalette: boolean,
): ParsedMipTexture | undefined {
  if (header.offsets[0] === 0) return undefined;
  let end = 40;
  for (let level = 0; level < 4; level += 1) {
    const width = Math.max(1, header.width >> level);
    const height = Math.max(1, header.height >> level);
    const mipOffset = header.offsets[level] ?? 0;
    invariant(mipOffset >= end, `MIPTEX ${header.name} mip ${level} overlaps prior data`);
    const byteLength = width * height;
    texture.require(mipOffset, byteLength, `MIPTEX ${header.name} mip ${level}`);
    end = mipOffset + byteLength;
  }
  if (embeddedPalette) {
    texture.require(end, 2 + 256 * 3, `MIPTEX ${header.name} palette`);
    invariant(texture.u16(end) === 256, `MIPTEX ${header.name} has an invalid palette size`);
    end += 2 + 256 * 3;
  }
  return { name: header.name, data: texture.uint8Array(0, end).slice() };
}

function invalidDataReason(error: unknown): string | null {
  return error instanceof WorldviewError && error.code === 'invalid-data' ? error.message : null;
}

export function parseQuakeTextures(
  textures: BinaryView,
  layout: QuakeBspLayout,
): ParsedQuakeTextures {
  invariant(textures.byteLength >= 4, 'texture lump is truncated');
  const textureCount = textures.u32(0);
  invariant(textureCount <= 1_000_000, 'texture lump has an unreasonable record count');
  textures.require(4, textureCount * 4, 'texture offset table');
  const textureTableEnd = 4 + textureCount * 4;
  const textureOffsets = Array.from({ length: textureCount }, (_, index) =>
    textures.i32(4 + index * 4),
  );
  const sortedTextureOffsets = [
    ...new Set(textureOffsets.filter((offset) => offset >= 0)),
  ].toSorted((left, right) => left - right);
  const textureEndByOffset = new Map(
    sortedTextureOffsets.map((offset, index) => [
      offset,
      sortedTextureOffsets[index + 1] ?? textures.byteLength,
    ]),
  );
  const materials: ParsedMaterial[] = [];
  const warnings: BspWarning[] = [];

  for (let index = 0; index < textureCount; index += 1) {
    const offset = textureOffsets[index]!;
    if (offset < 0) {
      materials.push({ name: `__invalid_${index}__`, kind: 'tool' });
      continue;
    }
    invariant(offset >= textureTableEnd, `MIPTEX ${index} overlaps the texture offset table`);
    textures.require(offset, 40, `MIPTEX ${index}`);
    const recordEnd = textureEndByOffset.get(offset);
    invariant(recordEnd !== undefined, `MIPTEX ${index} has no record boundary`);
    const texture = textures.slice(offset, recordEnd - offset);
    const name = texture.string(0, 16, true);
    const kind = classifyMaterial(name, layout.format);
    try {
      const header = readMipTextureHeader(texture.bytes);
      const { width, height } = header;
      if (width % 16 !== 0 || height % 16 !== 0) {
        warnings.push({
          code: 'noncanonical-miptex-dimensions',
          message: `MIPTEX ${name} has noncanonical dimensions ${width}x${height}; expected 16-unit alignment`,
          textureIndex: index,
          textureName: name,
          width,
          height,
        });
      }
      const embeddedTexture = texturePayload(texture, header, layout.embeddedPalette);
      materials.push(embeddedTexture ? { name, kind, embeddedTexture } : { name, kind });
    } catch (error) {
      const reason = invalidDataReason(error);
      if (!reason) throw error;
      warnings.push({
        code: 'unusable-miptex',
        message: `MIPTEX ${name || index} could not be decoded and will use a fallback material: ${reason}`,
        textureIndex: index,
        textureName: name,
        reason,
      });
      materials.push({ name, kind });
    }
  }

  return { materials, warnings };
}
