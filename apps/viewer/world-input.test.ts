import { describe, expect, it } from 'vitest';

import { sourceFromFiles } from './src/world-input.js';

function fileList(files: readonly File[]): FileList {
  return Object.assign([...files], {
    item: (index: number) => files[index] ?? null,
  }) as unknown as FileList;
}

function wal(name: string): Uint8Array {
  const bytes = new Uint8Array(100);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < name.length; index += 1) bytes[index] = name.charCodeAt(index);
  view.setUint32(32, 16, true);
  view.setUint32(36, 16, true);
  view.setUint32(40, 100, true);
  return bytes;
}

describe('viewer local file source', () => {
  it('maps Quake II assets through their game paths and WAL headers', async () => {
    const bsp = new File([new Uint8Array(8)], 'sample.bsp');
    const namedWal = new File([wal('e1u1/metal')], 'metal.wal');
    const replacement = new File([new Uint8Array([1])], 'wall.jpg');
    Object.defineProperty(replacement, 'webkitRelativePath', {
      value: 'baseq2/textures/e1u1/wall.jpg',
    });
    const palette = new File([new Uint8Array([0x0a])], 'colormap.pcx');

    const source = await sourceFromFiles(fileList([bsp, namedWal, replacement, palette]));

    expect(source?.bsp).toBe(bsp);
    expect(source?.palette).toBe(palette);
    expect(source?.gameAssets).toEqual({
      'pics/colormap.pcx': palette,
      'textures/e1u1/metal.wal': namedWal,
      'textures/e1u1/wall.jpg': replacement,
    });
  });
});
