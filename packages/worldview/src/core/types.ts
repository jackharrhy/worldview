import type { ParsedAmbientSound, ParsedEnvSound, ParsedMusicTrack } from './audio.js';
import type { ParsedBspCollision } from './collision.js';
import type { BspEntity, WadReference } from './entities.js';
import type { ParsedBspTrace } from './trace.js';
import type { ParsedBspVisibility } from './visibility.js';

export type Vec3Tuple = readonly [number, number, number];
export type BspFormat = 'quake-bsp29' | 'goldsrc-bsp30';
export type MaterialKind = 'opaque' | 'alpha-test' | 'water' | 'sky' | 'tool';
export type GoldSrcRenderMode = 0 | 1 | 2 | 3 | 4 | 5;

export interface Bounds {
  readonly min: Vec3Tuple;
  readonly max: Vec3Tuple;
}

export interface ParsedMipTexture {
  readonly name: string;
  readonly data: Uint8Array;
}

export interface DecodedMipLevel {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface DecodedMipTexture {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly levels: readonly DecodedMipLevel[];
  readonly alphaTest: boolean;
}

export interface DecodedQuakeSky {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly solid: Uint8Array;
  readonly alpha: Uint8Array;
}

export interface ParsedMaterial {
  readonly name: string;
  readonly kind: MaterialKind;
  readonly embeddedTexture?: ParsedMipTexture;
}

export interface ParsedLightmap {
  readonly faceIndex: number;
  readonly width: number;
  readonly height: number;
  readonly styles: readonly number[];
  readonly samples: Uint8Array | null;
  readonly pageIndex: number;
  readonly pageX: number;
  readonly pageY: number;
}

export interface LightmapPage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly lightmaps: readonly ParsedLightmap[];
}

export interface ParsedFace {
  readonly sourceIndex: number;
  readonly modelIndex: number;
  readonly materialIndex: number;
  readonly kind: MaterialKind;
  readonly firstIndex: number;
  readonly indexCount: number;
  readonly lightmap: ParsedLightmap;
}

export interface DrawBatch {
  readonly modelIndex: number;
  readonly materialIndex: number;
  readonly kind: Exclude<MaterialKind, 'tool'>;
  readonly lightmapPage: number;
  readonly firstIndex: number;
  readonly indexCount: number;
  readonly faceIndices: readonly number[];
}

export interface ParsedModel {
  readonly bounds: Bounds;
  readonly headnodes: readonly number[];
  readonly faceIndices: readonly number[];
  readonly visible: boolean;
  readonly entityIndex: number | null;
  readonly classname: string;
  /** True for the world and supported, non-moving solid brush entities. */
  readonly collidable: boolean;
  readonly renderMode: GoldSrcRenderMode;
  readonly renderAmount: number;
  readonly renderColor: Vec3Tuple;
}

export interface ParsedWorld {
  readonly format: BspFormat;
  readonly version: 29 | 30;
  readonly bounds: Bounds;
  readonly entities: readonly BspEntity[];
  readonly skyName: string | null;
  readonly wadReferences: readonly WadReference[];
  readonly ambientSounds: readonly ParsedAmbientSound[];
  readonly envSounds: readonly ParsedEnvSound[];
  readonly musicTracks: readonly ParsedMusicTrack[];
  readonly trace: ParsedBspTrace | null;
  readonly visibility: ParsedBspVisibility | null;
  readonly collision: ParsedBspCollision | null;
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  readonly materials: readonly ParsedMaterial[];
  readonly faces: readonly ParsedFace[];
  readonly batches: readonly DrawBatch[];
  readonly models: readonly ParsedModel[];
  readonly lightmapPages: readonly LightmapPage[];
  readonly lightmapBytesPerTexel: 1 | 3;
  readonly hasAnimatedLightmaps: boolean;
}
