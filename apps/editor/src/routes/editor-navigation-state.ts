import {
  gameProfileSupportsFaceSyntax,
  isWorldviewGameProfile,
  worldviewGameProfile,
  type MapFaceSyntax,
  type WorldviewGameProfile,
} from '@jackharrhy/worldview-editor/core';

export interface NewMapLaunch {
  readonly name: string;
  readonly profile: WorldviewGameProfile;
  readonly format: MapFaceSyntax;
}

export interface EditorNavigationState {
  readonly newMap: NewMapLaunch;
}

export function readNewMapLaunch(state: unknown): NewMapLaunch | null {
  if (!state || typeof state !== 'object' || !('newMap' in state)) return null;
  const launch = state.newMap;
  if (!launch || typeof launch !== 'object') return null;
  const { name, profile, format } = launch as Record<string, unknown>;
  if (typeof name !== 'string' || !isWorldviewGameProfile(profile)) return null;
  if (!gameProfileSupportsFaceSyntax(worldviewGameProfile(profile), format)) return null;
  return { name: name.trim() || 'untitled.map', profile, format };
}
