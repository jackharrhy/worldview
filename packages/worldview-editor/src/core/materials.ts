import {
  decodeMipTexture,
  decodeWalTexture,
  parseWad,
  readMipTextureHeader,
  WAD2_MIPTEX,
  WAD3_MIPTEX,
} from '@jackharrhy/worldview/core';

export interface EditorMaterial {
  readonly name: string;
  readonly sourceName: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly alphaTest: boolean;
  /** Texture-coordinate dimensions when a replacement image has different pixel dimensions. */
  readonly logicalWidth?: number;
  readonly logicalHeight?: number;
}

export interface MaterialImportDiagnostic {
  readonly severity: 'warning' | 'error';
  readonly sourceName: string;
  readonly materialName?: string;
  readonly message: string;
}

export interface MaterialImportResult {
  readonly sourceName: string;
  readonly wadVersion: 2 | 3;
  readonly added: number;
  readonly replaced: number;
  readonly skipped: number;
  readonly diagnostics: readonly MaterialImportDiagnostic[];
}

export interface WalMaterialImportResult {
  readonly sourceName: string;
  readonly materialName?: string;
  readonly animationName?: string;
  readonly surface?: { readonly contents: number; readonly flags: number; readonly value: number };
  readonly added: number;
  readonly replaced: number;
  readonly skipped: number;
  readonly diagnostics: readonly MaterialImportDiagnostic[];
}

const MAX_EDITOR_TEXTURE_DIMENSION = 4096;
const MAX_EDITOR_TEXTURE_PIXELS = 16_777_216;
const MIP_LEVEL_COUNT = 4;

function materialKey(name: string): string {
  return name.trim().toLowerCase();
}

function writeAscii(target: Uint8Array, offset: number, length: number, value: string): void {
  for (let index = 0; index < Math.min(length, value.length); index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x21 || code > 0x7e) throw new Error(`WAD name ${value} is not printable ASCII`);
    target[offset + index] = code;
  }
}

function mipRgba(source: Uint8Array, width: number, height: number): Uint8Array {
  const nextWidth = Math.max(1, width >> 1);
  const nextHeight = Math.max(1, height >> 1);
  const result = new Uint8Array(nextWidth * nextHeight * 4);
  for (let y = 0; y < nextHeight; y += 1) {
    for (let x = 0; x < nextWidth; x += 1) {
      const destination = (y * nextWidth + x) * 4;
      let samples = 0;
      for (let channel = 0; channel < 4; channel += 1) {
        let total = 0;
        samples = 0;
        for (let offsetY = 0; offsetY < 2; offsetY += 1) {
          for (let offsetX = 0; offsetX < 2; offsetX += 1) {
            const sourceX = Math.min(width - 1, x * 2 + offsetX);
            const sourceY = Math.min(height - 1, y * 2 + offsetY);
            total += source[(sourceY * width + sourceX) * 4 + channel] ?? 0;
            samples += 1;
          }
        }
        result[destination + channel] = Math.round(total / samples);
      }
    }
  }
  return result;
}

function nearestPaletteIndex(
  red: number,
  green: number,
  blue: number,
  palette: Uint8Array,
  maximumIndex: number,
): number {
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= maximumIndex; index += 1) {
    const paletteOffset = index * 3;
    const deltaRed = red - (palette[paletteOffset] ?? 0);
    const deltaGreen = green - (palette[paletteOffset + 1] ?? 0);
    const deltaBlue = blue - (palette[paletteOffset + 2] ?? 0);
    const distance = deltaRed * deltaRed + deltaGreen * deltaGreen + deltaBlue * deltaBlue;
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function encodeMipTexture(material: EditorMaterial, palette: Uint8Array): Uint8Array {
  if (!/^[A-Za-z0-9_+{}!-]{1,15}$/.test(material.name)) {
    throw new Error(`Quake WAD2 material ${material.name} must be a 1-15 character texture token`);
  }
  if (material.width % 8 !== 0 || material.height % 8 !== 0) {
    throw new Error(`Quake WAD2 material ${material.name} dimensions must be divisible by 8`);
  }
  const levels: Uint8Array[] = [];
  let rgba = material.rgba;
  let width = material.width;
  let height = material.height;
  const colorCache = new Map<number, number>();
  for (let level = 0; level < MIP_LEVEL_COUNT; level += 1) {
    const indexed = new Uint8Array(width * height);
    for (let pixel = 0; pixel < indexed.length; pixel += 1) {
      const source = pixel * 4;
      if (material.alphaTest && (rgba[source + 3] ?? 255) < 128) {
        indexed[pixel] = 255;
        continue;
      }
      const red = rgba[source] ?? 0;
      const green = rgba[source + 1] ?? 0;
      const blue = rgba[source + 2] ?? 0;
      const key = red | (green << 8) | (blue << 16);
      let paletteIndex = colorCache.get(key);
      if (paletteIndex === undefined) {
        paletteIndex = nearestPaletteIndex(
          red,
          green,
          blue,
          palette,
          material.alphaTest ? 254 : 255,
        );
        colorCache.set(key, paletteIndex);
      }
      indexed[pixel] = paletteIndex;
    }
    levels.push(indexed);
    if (level < MIP_LEVEL_COUNT - 1) {
      rgba = mipRgba(rgba, width, height);
      width = Math.max(1, width >> 1);
      height = Math.max(1, height >> 1);
    }
  }
  const byteLength = 40 + levels.reduce((sum, level) => sum + level.byteLength, 0);
  const result = new Uint8Array(byteLength);
  const view = new DataView(result.buffer);
  writeAscii(result, 0, 16, material.name);
  view.setUint32(16, material.width, true);
  view.setUint32(20, material.height, true);
  let offset = 40;
  for (let level = 0; level < MIP_LEVEL_COUNT; level += 1) {
    view.setUint32(24 + level * 4, offset, true);
    result.set(levels[level]!, offset);
    offset += levels[level]!.byteLength;
  }
  return result;
}

/** Encodes generated editor materials as an in-memory WAD2 for a Quake compile request. */
export function encodeQuakeWad2(
  materials: readonly EditorMaterial[],
  palette: Uint8Array,
): ArrayBuffer {
  if (palette.byteLength < 768) throw new Error('Quake WAD2 export requires a 768-byte palette');
  if (materials.length === 0) throw new Error('Quake WAD2 export requires at least one material');
  const lumps = materials.map((material) => ({
    material,
    data: encodeMipTexture(material, palette),
  }));
  const dataByteLength = lumps.reduce((sum, lump) => sum + lump.data.byteLength, 0);
  const directoryOffset = 12 + dataByteLength;
  const result = new Uint8Array(directoryOffset + lumps.length * 32);
  const view = new DataView(result.buffer);
  writeAscii(result, 0, 4, 'WAD2');
  view.setUint32(4, lumps.length, true);
  view.setUint32(8, directoryOffset, true);
  let dataOffset = 12;
  for (let index = 0; index < lumps.length; index += 1) {
    const lump = lumps[index]!;
    result.set(lump.data, dataOffset);
    const directoryRecord = directoryOffset + index * 32;
    view.setUint32(directoryRecord, dataOffset, true);
    view.setUint32(directoryRecord + 4, lump.data.byteLength, true);
    view.setUint32(directoryRecord + 8, lump.data.byteLength, true);
    result[directoryRecord + 12] = WAD2_MIPTEX;
    writeAscii(result, directoryRecord + 16, 16, lump.material.name);
    dataOffset += lump.data.byteLength;
  }
  return result.buffer;
}

export class EditorMaterialCatalog {
  private readonly entries = new Map<string, EditorMaterial>();

  public get size(): number {
    return this.entries.size;
  }

  public materials(): readonly EditorMaterial[] {
    return [...this.entries.values()].toSorted((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
    );
  }

  public find(name: string): EditorMaterial | null {
    return this.entries.get(materialKey(name)) ?? null;
  }

  public clear(): void {
    this.entries.clear();
  }

  /** Registers a generated or otherwise pre-decoded runtime material. Returns true when replaced. */
  public set(material: EditorMaterial): boolean {
    const key = materialKey(material.name);
    if (!key) throw new Error('Material names cannot be empty');
    if (
      material.width <= 0 ||
      material.height <= 0 ||
      material.width > MAX_EDITOR_TEXTURE_DIMENSION ||
      material.height > MAX_EDITOR_TEXTURE_DIMENSION ||
      material.width * material.height > MAX_EDITOR_TEXTURE_PIXELS
    ) {
      throw new Error(`Material ${material.name} has unsupported dimensions`);
    }
    if (material.rgba.byteLength !== material.width * material.height * 4) {
      throw new Error(`Material ${material.name} has inconsistent RGBA dimensions`);
    }
    const logicalWidth = material.logicalWidth ?? material.width;
    const logicalHeight = material.logicalHeight ?? material.height;
    if (
      logicalWidth <= 0 ||
      logicalHeight <= 0 ||
      !Number.isFinite(logicalWidth) ||
      !Number.isFinite(logicalHeight)
    ) {
      throw new Error(`Material ${material.name} has invalid logical dimensions`);
    }
    const replaced = this.entries.has(key);
    this.entries.set(key, material);
    return replaced;
  }

  public importWad(
    sourceName: string,
    input: ArrayBuffer | ArrayBufferView,
    externalPalette?: Uint8Array,
  ): MaterialImportResult {
    const wad = parseWad(input);
    const expectedType = wad.version === 2 ? WAD2_MIPTEX : WAD3_MIPTEX;
    const candidates = wad.lumps.filter((lump) => lump.type === expectedType);
    const diagnostics: MaterialImportDiagnostic[] = [];
    let added = 0;
    let replaced = 0;
    let skipped = 0;

    if (wad.version === 2 && !externalPalette) {
      return {
        sourceName,
        wadVersion: wad.version,
        added,
        replaced,
        skipped: candidates.length,
        diagnostics: [
          {
            severity: 'error',
            sourceName,
            message: 'WAD2 textures require a 768-byte Quake palette before they can be decoded',
          },
        ],
      };
    }

    for (const lump of candidates) {
      try {
        const header = readMipTextureHeader(lump.data);
        if (
          header.width > MAX_EDITOR_TEXTURE_DIMENSION ||
          header.height > MAX_EDITOR_TEXTURE_DIMENSION ||
          header.width * header.height > MAX_EDITOR_TEXTURE_PIXELS
        ) {
          throw new Error(
            `texture dimensions ${header.width}x${header.height} exceed the editor preview limit`,
          );
        }
        const decoded = decodeMipTexture(lump.data, externalPalette);
        const material: EditorMaterial = {
          name: decoded.name || lump.name,
          sourceName,
          width: decoded.width,
          height: decoded.height,
          rgba: decoded.levels[0]!.rgba,
          alphaTest: decoded.alphaTest,
        };
        if (this.set(material)) replaced += 1;
        else added += 1;
      } catch (error) {
        skipped += 1;
        diagnostics.push({
          severity: 'warning',
          sourceName,
          materialName: lump.name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      sourceName,
      wadVersion: wad.version,
      added,
      replaced,
      skipped,
      diagnostics,
    };
  }

  public importWal(
    sourceName: string,
    input: ArrayBuffer | ArrayBufferView,
    palette: Uint8Array,
  ): WalMaterialImportResult {
    try {
      const decoded = decodeWalTexture(input, palette);
      if (
        decoded.width > MAX_EDITOR_TEXTURE_DIMENSION ||
        decoded.height > MAX_EDITOR_TEXTURE_DIMENSION ||
        decoded.width * decoded.height > MAX_EDITOR_TEXTURE_PIXELS
      ) {
        throw new Error(
          `texture dimensions ${decoded.width}x${decoded.height} exceed the editor preview limit`,
        );
      }
      const replaced = this.set({
        name: decoded.name,
        sourceName,
        width: decoded.width,
        height: decoded.height,
        rgba: decoded.levels[0]!.rgba,
        alphaTest: false,
      });
      return {
        sourceName,
        materialName: decoded.name,
        ...(decoded.animationName ? { animationName: decoded.animationName } : {}),
        surface: {
          contents: decoded.contents,
          flags: decoded.flags,
          value: decoded.value,
        },
        added: replaced ? 0 : 1,
        replaced: replaced ? 1 : 0,
        skipped: 0,
        diagnostics: [],
      };
    } catch (error) {
      return {
        sourceName,
        added: 0,
        replaced: 0,
        skipped: 1,
        diagnostics: [
          {
            severity: 'warning',
            sourceName,
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }
}
