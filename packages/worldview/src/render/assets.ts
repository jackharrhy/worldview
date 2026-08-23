import type {
  DecodedTga,
  ParsedGoldSrcSprite,
  ParsedWorld,
  SpriteReference,
  Vec3Tuple,
} from '../core/index.js';

export interface LoadedSpriteEntity {
  readonly entityIndex: number;
  readonly reference: SpriteReference;
  readonly sprite: ParsedGoldSrcSprite;
  readonly origin: Vec3Tuple;
  readonly angles: Vec3Tuple;
  readonly scale: number;
  readonly renderMode: number;
  readonly renderAmount: number;
  readonly renderColor: readonly [number, number, number];
  readonly frame: number;
  readonly frameRate: number;
  readonly receivesLight: boolean;
  readonly lightColor: readonly [number, number, number];
}

export type SkyboxSuffix = 'rt' | 'bk' | 'lf' | 'ft' | 'up' | 'dn';

export interface LoadedSkybox {
  readonly name: string;
  readonly sides: Readonly<Record<SkyboxSuffix, DecodedTga>>;
}

/** GPU resources required to render a loaded world, separate from fetching and Web Audio. */
export interface RenderWorldAssets {
  readonly world: ParsedWorld;
  readonly palette?: Uint8Array;
  readonly textureData: ReadonlyMap<number, Uint8Array>;
  readonly skybox?: LoadedSkybox;
  readonly sprites: readonly LoadedSpriteEntity[];
}
