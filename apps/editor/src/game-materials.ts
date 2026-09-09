import {
  developmentTexturePack,
  worldviewGameProfile,
  EditorMaterialCatalog,
  type WorldviewGameProfile,
} from '@jackharrhy/worldview-editor/core';
import { parseWad } from '@jackharrhy/worldview/core';

export function installDevelopmentMaterials(
  catalog: EditorMaterialCatalog,
  game: WorldviewGameProfile,
  palette?: Uint8Array,
): void {
  const pack = developmentTexturePack(game, palette);
  for (const material of pack?.materials ?? []) {
    const existing = catalog.find(material.name);
    if (!existing || existing.sourceName === material.sourceName) catalog.set(material);
  }
}

export function importGameWad(
  catalog: EditorMaterialCatalog,
  game: WorldviewGameProfile,
  name: string,
  bytes: ArrayBuffer,
  palette?: Uint8Array,
) {
  const { version, warnings } = parseWad(bytes);
  const profile = worldviewGameProfile(game);
  if (!profile.wadVersions.includes(version))
    throw new Error(
      `${name} is WAD${version}. ${profile.label} uses ${profile.materialFormat.toUpperCase()} textures.`,
    );
  if (warnings[0]) throw new Error(`Texture pack ${name}: ${warnings[0].message}`);
  const decoded = new EditorMaterialCatalog();
  const result = decoded.importWad(name, bytes, palette);
  const error = result.diagnostics[0];
  if (error) throw new Error(`Texture pack ${name}: ${error.message}`);
  let replaced = 0;
  for (const material of decoded.materials()) {
    if (catalog.set(material)) replaced++;
  }
  return { added: decoded.size - replaced, replaced };
}
