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

export async function sourceFromFiles(files: FileList): Promise<WorldSource | undefined> {
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
    if (/\.(wav|mp3|ogg)$/.test(lowerName)) sounds[lowerName] = file;
    const contained = containedGamePath(file);
    if (contained) gameAssets[contained] = file;
    else if (lowerName.endsWith('.wal')) {
      try {
        const header = readWalTextureHeader(await file.arrayBuffer());
        gameAssets[`textures/${header.name.toLowerCase()}.wal`] = file;
      } catch {
        gameAssets[`textures/${lowerName}`] = file;
      }
    } else if (lowerName === 'colormap.pcx') gameAssets['pics/colormap.pcx'] = file;
    else if (/\.(png|jpe?g|tga)$/.test(lowerName)) {
      gameAssets[`textures/${lowerName}`] = file;
      gameAssets[`env/${lowerName}`] = file;
    }
  }
  const skyboxFile = (suffix: string) =>
    list.find((file) => file.name.toLowerCase().endsWith(`${suffix}.tga`));
  const [rt, bk, lf, ft, up, dn] = ['rt', 'bk', 'lf', 'ft', 'up', 'dn'].map(skyboxFile);
  const skybox = rt && bk && lf && ft && up && dn ? { rt, bk, lf, ft, up, dn } : undefined;
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
