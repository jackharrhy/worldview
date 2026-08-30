import {
  gameProfileSupportsFaceSyntax,
  worldviewGameProfile,
} from '@jackharrhy/worldview-editor/core';
import { z } from 'zod';

const EditorNavigationStateSchema = z.strictObject({
  newMap: z.strictObject({
    name: z.string().max(4_096),
    profile: z.enum(['quake', 'goldsrc', 'quake2']),
    format: z.enum(['valve-220', 'quake']),
  }),
});
export type EditorNavigationState = z.infer<typeof EditorNavigationStateSchema>;
export type NewMapLaunch = EditorNavigationState['newMap'];

export function readNewMapLaunch(state: unknown): NewMapLaunch | null {
  const result = EditorNavigationStateSchema.safeParse(state);
  if (!result.success) return null;
  const { name, profile, format } = result.data.newMap;
  if (!gameProfileSupportsFaceSyntax(worldviewGameProfile(profile), format)) return null;
  return { name: name.trim() || 'untitled.map', profile, format };
}
