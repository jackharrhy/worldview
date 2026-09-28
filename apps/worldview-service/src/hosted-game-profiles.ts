import type { HostedGame } from '@worldview/protocol';
import type { MapFaceSyntax } from '@jackharrhy/worldview-editor/core';

export type HostedBuildProfile =
  | {
      readonly resourceLayout: 'wad';
      readonly wadGame: 'quake' | 'goldsrc';
      readonly bspVersions: readonly (number | 'BSP2')[];
      readonly buildTimeoutMilliseconds: number;
    }
  | {
      readonly resourceLayout: 'game-tree';
      readonly bspVersions: readonly (number | 'BSP2')[];
      readonly buildTimeoutMilliseconds: number;
      readonly faceSyntax: MapFaceSyntax;
      readonly imageExtensions: readonly ('png' | 'tga')[];
      readonly materialMetadataExtension: 'wal_json';
      readonly skyProperty: string;
      readonly skyExtension: 'tga';
      readonly packageExtension: string;
    };

const PROFILES: Record<HostedGame, HostedBuildProfile> = {
  quake: {
    resourceLayout: 'wad',
    wadGame: 'quake',
    bspVersions: [29, 'BSP2'],
    buildTimeoutMilliseconds: 190_000,
  },
  goldsrc: {
    resourceLayout: 'wad',
    wadGame: 'goldsrc',
    bspVersions: [30],
    buildTimeoutMilliseconds: 190_000,
  },
  gower: {
    resourceLayout: 'game-tree',
    bspVersions: [38],
    buildTimeoutMilliseconds: 60 * 60_000,
    faceSyntax: 'valve-220',
    imageExtensions: ['png', 'tga'],
    materialMetadataExtension: 'wal_json',
    skyProperty: 'sky',
    skyExtension: 'tga',
    packageExtension: 'gpk',
  },
};

export function hostedBuildProfile(game: HostedGame): HostedBuildProfile {
  return PROFILES[game];
}
