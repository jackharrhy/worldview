import type { NewMapLaunch } from './editor-navigation-state.js';
import {
  gameProfileSupportsFaceSyntax,
  isWorldviewGameProfile,
  worldviewGameProfile,
} from '@jackharrhy/worldview-editor/core';

export async function action({ request }: { readonly request: Request }) {
  const data = await request.formData();
  const name = String(data.get('name') ?? '').trim() || 'untitled.map';
  const profile = String(data.get('profile') ?? 'quake');
  const format = String(data.get('format') ?? 'valve-220');
  if (!isWorldviewGameProfile(profile)) return { error: 'Choose a supported game.' };
  const definition = worldviewGameProfile(profile);
  if (!gameProfileSupportsFaceSyntax(definition, format)) {
    return { error: `${definition.label} does not support that map format.` };
  }
  return { launch: { name, profile, format } as NewMapLaunch };
}
