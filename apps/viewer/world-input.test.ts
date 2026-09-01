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

function skyboxSet(name: string): readonly File[] {
  return ['rt', 'bk', 'lf', 'ft', 'up', 'dn'].map(
    (suffix) => new File([new Uint8Array([1])], `${name}${suffix}.tga`),
  );
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

  it('does not invent a game path for an uncontained replacement image', async () => {
    const bsp = new File([new Uint8Array(8)], 'sample.bsp');
    const image = new File([new Uint8Array([1])], 'wall.jpg');

    const source = await sourceFromFiles(fileList([bsp, image]));

    expect(source?.gameAssets).toBeUndefined();
  });

  it('preserves file-list precedence after concurrent WAL header reads', async () => {
    const bsp = new File([new Uint8Array(8)], 'sample.bsp');
    const first = new File([wal('e1u1/metal')], 'first.wal');
    const second = new File([wal('e1u1/metal')], 'second.wal');

    const source = await sourceFromFiles(fileList([bsp, first, second]));

    expect(source?.gameAssets?.['textures/e1u1/metal.wal']).toBe(second);
  });

  it('only creates an explicit skybox from one complete, consistently named set', async () => {
    const bsp = new File([new Uint8Array(8)], 'sample.bsp');

    const source = await sourceFromFiles(fileList([bsp, ...skyboxSet('dusk')]));
    expect(source?.skybox?.rt).toHaveProperty('name', 'duskrt.tga');

    const ambiguous = await sourceFromFiles(
      fileList([bsp, ...skyboxSet('dusk'), ...skyboxSet('space')]),
    );
    expect(ambiguous?.skybox).toBeUndefined();
  });
});
