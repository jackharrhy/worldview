import type { WorldSource } from '@jackharrhy/worldview';
import { readWalTextureHeader } from '@jackharrhy/worldview/core';

export function sourceName(source: WorldSource): string {
  if (typeof source.bsp === 'string') return source.bsp.split('/').at(-1) || 'Remote map';
  if (source.bsp instanceof URL) return source.bsp.pathname.split('/').at(-1) || 'Remote map';
  if (source.bsp instanceof File) return source.bsp.name;
  return 'Buffer map';
}

function containedGamePath(file: File): string | null {
  const relativePath = (file.webkitRelativePath ?? '').replaceAll('\\', '/').toLowerCase();
  const parts = relativePath.split('/');
  const root = parts.findIndex((part) => part === 'textures' || part === 'env' || part === 'pics');
  return root >= 0 ? parts.slice(root).join('/') : null;
}

export async function sourceFromFiles(files: Iterable<File>): Promise<WorldSource | undefined> {
  const list = [...files];
  const bsp = list.find((file) => file.name.toLowerCase().endsWith('.bsp'));
  if (!bsp) return undefined;
  const palette = list.find((file) => {
    const lowerName = file.name.toLowerCase();
    return /\.(lmp|pal)$/u.test(lowerName) || lowerName === 'colormap.pcx';
  });
  const wads = list.filter((file) => file.name.toLowerCase().endsWith('.wad'));
  const sprites: Record<string, File> = {};
  const sounds: Record<string, File> = {};
  const gameAssets: Record<string, File> = {};
  for (const file of list) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.spr')) sprites[lowerName] = file;
    if (/\.(wav|mp3|ogg)$/u.test(lowerName)) sounds[lowerName] = file;
  }
  const gameAssetEntries = await Promise.all(
    list.map(async (file) => {
      const lowerName = file.name.toLowerCase();
      const contained = containedGamePath(file);
      if (contained) return [contained, file] as const;
      if (lowerName.endsWith('.wal')) {
        try {
          const header = readWalTextureHeader(await file.arrayBuffer());
          return [`textures/${header.name.toLowerCase()}.wal`, file] as const;
        } catch {
          return [`textures/${lowerName}`, file] as const;
        }
      }
      return lowerName === 'colormap.pcx' ? (['pics/colormap.pcx', file] as const) : null;
    }),
  );
  for (const entry of gameAssetEntries) {
    if (entry) gameAssets[entry[0]] = entry[1];
  }

  const skyboxSuffixes = ['rt', 'bk', 'lf', 'ft', 'up', 'dn'] as const;
  type SkyboxSuffix = (typeof skyboxSuffixes)[number];
  type PartialSkybox = Partial<Record<SkyboxSuffix, File>>;
  const skyboxGroups = new Map<string, PartialSkybox>();
  for (const file of list) {
    const match = /^(.*?)(rt|bk|lf|ft|up|dn)\.tga$/iu.exec(file.name);
    const name = match?.[1]?.toLowerCase();
    const suffix = match?.[2]?.toLowerCase() as SkyboxSuffix | undefined;
    if (!name || !suffix) continue;
    const group = skyboxGroups.get(name) ?? {};
    group[suffix] = file;
    skyboxGroups.set(name, group);
  }
  const isCompleteSkybox = (group: PartialSkybox): group is Record<SkyboxSuffix, File> =>
    skyboxSuffixes.every((suffix) => group[suffix] !== undefined);
  const completeSkyboxes = [...skyboxGroups.values()].filter(isCompleteSkybox);
  const completeSkybox = completeSkyboxes.length === 1 ? completeSkyboxes[0] : undefined;
  const skybox = completeSkybox
    ? {
        rt: completeSkybox.rt,
        bk: completeSkybox.bk,
        lf: completeSkybox.lf,
        ft: completeSkybox.ft,
        up: completeSkybox.up,
        dn: completeSkybox.dn,
      }
    : undefined;
  return {
    bsp,
    ...(palette ? { palette } : {}),
    ...(wads.length > 0 ? { wads } : {}),
    ...(Object.keys(sprites).length > 0 ? { sprites } : {}),
    ...(Object.keys(sounds).length > 0 ? { sounds } : {}),
    ...(Object.keys(gameAssets).length > 0 ? { gameAssets } : {}),
    ...(skybox ? { skybox } : {}),
  };
}
