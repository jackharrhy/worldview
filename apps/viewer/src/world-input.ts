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
  const sprites = Object.fromEntries(
    list
      .filter((file) => file.name.toLowerCase().endsWith('.spr'))
      .map((file) => [file.name.toLowerCase(), file]),
  );
  const sounds = Object.fromEntries(
    list
      .filter((file) => /\.(wav|mp3|ogg)$/i.test(file.name))
      .map((file) => [file.name.toLowerCase(), file]),
  );
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
