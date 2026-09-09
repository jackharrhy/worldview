import { expect, test } from '@playwright/test';
import { makeBsp, makeMipTexture, makePalette } from '../../packages/worldview/test/fixtures.js';

function lightingFixture(version: 29 | 30, mode: 'gradient' | 'dark' | 'unlit'): Uint8Array {
  const texture = makeMipTexture(version);
  texture.fill(100, 40, 380);
  const bsp = makeBsp({ version, textureRecords: [texture] });
  const view = new DataView(bsp.buffer, bsp.byteOffset, bsp.byteLength);
  const surfedgeOffset = view.getUint32(4 + 13 * 8, true);
  [3, 2, 1, 0].forEach((edge, index) => view.setInt32(surfedgeOffset + index * 4, edge, true));
  const faceOffset = view.getUint32(4 + 7 * 8, true);
  if (mode !== 'gradient') {
    bsp.fill(255, faceOffset + 12, faceOffset + 16);
    view.setInt32(faceOffset + 16, -1, true);
  }
  if (mode === 'unlit') view.setUint32(8 + 8 * 8, 0, true);
  const lightingOffset = view.getUint32(4 + 8 * 8, true);
  const channels = version === 29 ? 1 : 3;
  for (let texel = 0; texel < 4; texel += 1) {
    bsp.fill(
      texel % 2 === 0 ? 0 : 96,
      lightingOffset + texel * channels,
      lightingOffset + (texel + 1) * channels,
    );
  }
  return bsp;
}

for (const version of [29, 30] as const) {
  test(`BSP${version} keeps unlit faces dark and smooths lightmaps with nearest textures`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/__lighting.html', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<canvas width="64" height="64"></canvas>' }),
    );
    await page.goto('/__lighting.html');
    const samples = await page.evaluate(
      async ({ fixtures, palette, entrypoint, version: bspVersion }) => {
        const { createWorldview } = (await import(
          entrypoint
        )) as typeof import('@jackharrhy/worldview');
        const viewer = await createWorldview({
          canvas: document.querySelector('canvas')!,
          controls: 'none',
          audio: false,
          autoStart: false,
          textureFiltering: 'nearest',
        });
        try {
          const result: Record<string, number[]> = {};
          for (const [mode, bytes] of Object.entries(fixtures)) {
            await viewer.load({
              bsp: new Uint8Array(bytes).buffer,
              ...(bspVersion === 29 ? { palette: new Uint8Array(palette) } : {}),
            });
            const capture = await viewer.captureOverview({
              width: 64,
              height: 64,
              rotation: 0,
              padding: 0,
              cutaway: 'none',
              lighting: 'lightmapped',
            });
            const bitmap = await createImageBitmap(capture.image);
            const canvas = new OffscreenCanvas(64, 64);
            const context = canvas.getContext('2d')!;
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            const rgba = context.getImageData(0, 0, 64, 64).data;
            const values: number[] = [];
            for (let y = 8; y < 56; y += 1)
              for (let x = 8; x < 56; x += 1) {
                const offset = (y * 64 + x) * 4;
                if (rgba[offset + 3] !== 255) throw new Error('Expected opaque rendered surface');
                values.push(rgba[offset + 1]!);
              }
            result[mode] = [...new Set(values)];
          }
          return result;
        } finally {
          viewer.dispose();
        }
      },
      {
        version,
        fixtures: Object.fromEntries(
          ['gradient', 'dark', 'unlit'].map((mode) => [
            mode,
            [...lightingFixture(version, mode as 'gradient' | 'dark' | 'unlit')],
          ]),
        ),
        palette: [...makePalette()],
        entrypoint: `/@fs${process.cwd()}/packages/worldview/dist/index.js`,
      },
    );
    expect(samples.dark).toEqual([0]);
    expect(Math.min(...samples.unlit!)).toBeGreaterThan(100);
    expect(samples.gradient!.length).toBeGreaterThan(20);
    expect(errors).toEqual([]);
  });
}
