import type { MapFaceSyntax } from './types.js';
import { QUAKE2_SURFACE_SEMANTICS, type SurfaceSemantics } from './surface-semantics.js';
export type WorldviewGameProfile = 'quake' | 'goldsrc' | 'quake2';
export type WorldviewMaterialFormat = 'wad2' | 'wad3' | 'wal';

export interface WorldviewGameProfileDefinition {
  readonly id: WorldviewGameProfile;
  readonly version: 1;
  readonly label: string;
  readonly description: string;
  readonly supportedFaceSyntaxes: readonly MapFaceSyntax[];
  readonly defaultFaceSyntax: MapFaceSyntax;
  readonly materialFormat: WorldviewMaterialFormat;
  readonly worldspawnWadProperty?: 'wad';
  readonly wadVersions: readonly (2 | 3)[];
  readonly entityDefinitionFormats: readonly ('fgd' | 'def' | 'ent')[];
  readonly surfaceSemantics?: SurfaceSemantics;
}

export const WORLDVIEW_GAME_PROFILES: readonly WorldviewGameProfileDefinition[] = [
  {
    id: 'quake',
    version: 1,
    label: 'Quake',
    description: 'Quake source maps with WAD2 materials and DEF or ENT entity definitions.',
    supportedFaceSyntaxes: ['valve-220', 'quake'],
    defaultFaceSyntax: 'valve-220',
    materialFormat: 'wad2',
    wadVersions: [2],
    entityDefinitionFormats: ['def', 'ent'],
  },
  {
    id: 'goldsrc',
    version: 1,
    label: 'GoldSrc',
    description: 'GoldSrc source maps with Valve 220 faces, WAD3 materials, and FGDs.',
    supportedFaceSyntaxes: ['valve-220'],
    defaultFaceSyntax: 'valve-220',
    materialFormat: 'wad3',
    worldspawnWadProperty: 'wad',
    wadVersions: [3],
    entityDefinitionFormats: ['fgd'],
  },
  {
    id: 'quake2',
    version: 1,
    label: 'Quake II',
    description: 'Quake II source maps with classic faces, WAL materials, and surface metadata.',
    supportedFaceSyntaxes: ['quake'],
    defaultFaceSyntax: 'quake',
    materialFormat: 'wal',
    wadVersions: [],
    entityDefinitionFormats: ['def', 'ent'],
    surfaceSemantics: QUAKE2_SURFACE_SEMANTICS,
  },
] as const;

const WORLDVIEW_GAME_PROFILE_IDS = new Set<WorldviewGameProfile>(
  WORLDVIEW_GAME_PROFILES.map(({ id }) => id),
);

export function isWorldviewGameProfile(value: unknown): value is WorldviewGameProfile {
  return typeof value === 'string' && WORLDVIEW_GAME_PROFILE_IDS.has(value as WorldviewGameProfile);
}

export function worldviewGameProfile(id: WorldviewGameProfile): WorldviewGameProfileDefinition {
  const profile = WORLDVIEW_GAME_PROFILES.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`Unknown Worldview game profile ${id}`);
  return profile;
}

export function gameProfileSupportsFaceSyntax(
  profile: WorldviewGameProfileDefinition,
  format: unknown,
): format is MapFaceSyntax {
  return profile.supportedFaceSyntaxes.some((candidate) => candidate === format);
}
