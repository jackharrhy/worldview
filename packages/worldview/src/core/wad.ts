/*
 * WAD directory behavior adapted from noclip.website's Common/IdTech2/WAD.ts.
 * See THIRD_PARTY_NOTICES.md and docs/plan.md for provenance.
 */

import { BinaryView } from './binary.js';
import { invalidData, invariant } from './errors.js';

export const WAD2_MIPTEX = 0x44;
export const WAD3_MIPTEX = 0x43;

export interface WadLump {
  readonly name: string;
  readonly type: number;
  readonly data: Uint8Array;
}

export interface ParsedWad {
  readonly version: 2 | 3;
  readonly lumps: readonly WadLump[];
}

export function parseWad(input: ArrayBuffer | ArrayBufferView): ParsedWad {
  const source = new BinaryView(input);
  invariant(source.byteLength >= 12, 'WAD header is truncated');
  const magic = source.string(0, 4);
  if (magic !== 'WAD2' && magic !== 'WAD3')
    invalidData(`unsupported WAD magic ${JSON.stringify(magic)}`);

  const version = magic === 'WAD2' ? 2 : 3;
  const count = source.u32(4);
  const directoryOffset = source.u32(8);
  invariant(count <= 1_000_000, 'WAD directory has an unreasonable record count');
  source.require(directoryOffset, count * 32, 'WAD directory');

  const lumps: WadLump[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = directoryOffset + index * 32;
    const fileOffset = source.u32(offset);
    const diskSize = source.u32(offset + 4);
    const size = source.u32(offset + 8);
    const type = source.u8(offset + 12);
    const compression = source.u8(offset + 13);
    invariant(compression === 0, `compressed WAD lump ${index} is not supported`);
    invariant(size === diskSize, `WAD lump ${index} has inconsistent compressed size`);
    source.require(fileOffset, diskSize, `WAD lump ${index}`);
    const name = source.string(offset + 16, 16, true);
    lumps.push({ name, type, data: source.uint8Array(fileOffset, diskSize).slice() });
  }

  return { version, lumps };
}

export function findMipTexture(wad: ParsedWad, name: string): Uint8Array | undefined {
  const expectedType = wad.version === 2 ? WAD2_MIPTEX : WAD3_MIPTEX;
  const lower = name.toLowerCase();
  return wad.lumps.find((lump) => lump.type === expectedType && lump.name.toLowerCase() === lower)
    ?.data;
}
