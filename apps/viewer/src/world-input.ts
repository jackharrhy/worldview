import type { WorldSource } from '@jackharrhy/worldview';

export function sourceName(source: WorldSource): string {
  if (typeof source.bsp === 'string') return source.bsp.split('/').at(-1) || 'Remote map';
  if (source.bsp instanceof URL) return source.bsp.pathname.split('/').at(-1) || 'Remote map';
  if (source.bsp instanceof File) return source.bsp.name;
  return 'Buffer map';
}

export function sourceFromFiles(files: FileList): WorldSource | undefined {
  const list = [...files];
  const bsp = list.find((file) => file.name.toLowerCase().endsWith('.bsp'));
  if (!bsp) return undefined;
  const palette = list.find((file) => /\.(lmp|pal)$/i.test(file.name));
  const wads = list.filter((file) => file.name.toLowerCase().endsWith('.wad'));
  const sprites: Record<string, File> = {};
  const sounds: Record<string, File> = {};
  for (const file of list) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.spr')) sprites[lowerName] = file;
    if (/\.(wav|mp3|ogg)$/.test(lowerName)) sounds[lowerName] = file;
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
    ...(skybox ? { skybox } : {}),
  };
}
