import { expect, test } from '@playwright/test';
import { makeBsp, makeMipTexture, makePalette } from '../../packages/worldview/test/fixtures.js';

const lightingModes = [
  'gradient',
  'dark',
  'unlit',
  'flat',
  'fullbright',
  'fullbright-dark',
] as const;
type LightingMode = (typeof lightingModes)[number];

function lightingFixture(version: 29 | 30, mode: LightingMode): Uint8Array {
  const texture = makeMipTexture(version);
  texture.fill(100, 40, 380);
  if (mode.startsWith('fullbright')) {
    const textureView = new DataView(texture.buffer);
    for (let mip = 0; mip < 4; mip += 1) {
      const size = 16 >> mip;
      const start = textureView.getUint32(24 + mip * 4, true);
      for (let y = 0; y < size; y += 1)
        for (let x = 0; x < size; x += 1)
          texture[start + y * size + x] = [223, 224, 246, 255][Math.floor((x / size) * 4)]!;
    }
  }
  const bsp = makeBsp({ version, textureRecords: [texture] });
  const view = new DataView(bsp.buffer, bsp.byteOffset, bsp.byteLength);
  const surfedgeOffset = view.getUint32(4 + 13 * 8, true);
  [3, 2, 1, 0].forEach((edge, index) => view.setInt32(surfedgeOffset + index * 4, edge, true));
  const faceOffset = view.getUint32(4 + 7 * 8, true);
  if (mode === 'dark' || mode === 'unlit' || mode === 'fullbright-dark') {
    bsp.fill(255, faceOffset + 12, faceOffset + 16);
    view.setInt32(faceOffset + 16, -1, true);
  }
  if (mode === 'unlit') view.setUint32(8 + 8 * 8, 0, true);
  const lightingOffset = view.getUint32(4 + 8 * 8, true);
  const channels = version === 29 ? 1 : 3;
  for (let texel = 0; texel < 4; texel += 1) {
    bsp.fill(
      mode === 'gradient' ? (texel % 2 === 0 ? 0 : 96) : 32,
      lightingOffset + texel * channels,
      lightingOffset + (texel + 1) * channels,
    );
  }
  return bsp;
}

for (const version of [29, 30] as const) {
  test(`BSP${version} uses its own lighting and palette rules with smooth lightmaps`, async ({
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
          const result: Record<string, number[][]> = {};
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
            const values = new Map<string, number[]>();
            for (let y = 8; y < 56; y += 1)
              for (let x = 8; x < 56; x += 1) {
                const offset = (y * 64 + x) * 4;
                if (rgba[offset + 3] !== 255) throw new Error('Expected opaque rendered surface');
                const rgb = Array.from(rgba.subarray(offset, offset + 3));
                values.set(rgb.join(','), rgb);
              }
            result[mode] = [...values.values()];
          }
          return result;
        } finally {
          viewer.dispose();
        }
      },
      {
        version,
        fixtures: Object.fromEntries(
          lightingModes.map((mode) => [mode, [...lightingFixture(version, mode)]]),
        ),
        palette: [...makePalette()],
        entrypoint: `/@fs${process.cwd()}/packages/worldview/dist/index.js`,
      },
    );
    expect(samples.dark).toEqual([[0, 0, 0]]);
    expect(samples.unlit).toEqual([[100, 155, 188]]);
    expect(samples.flat).toEqual([version === 29 ? [26, 40, 48] : [25, 39, 47]]);
    expect(samples.gradient!.length).toBeGreaterThan(20);
    const palette = makePalette();
    const expectedColors = [223, 224, 246, 255].map((index) => {
      const scale = version === 29 && index >= 224 ? 1 : version === 29 ? 33 / 128 : 64 / 255;
      return Array.from(palette.subarray(index * 3, index * 3 + 3), (value) =>
        Math.round(value * scale),
      );
    });
    expect(samples.fullbright).toHaveLength(expectedColors.length);
    expect(samples.fullbright).toEqual(expect.arrayContaining(expectedColors));
    const shadowColors = version === 29 ? [[0, 0, 0], ...expectedColors.slice(1)] : [[0, 0, 0]];
    expect(samples['fullbright-dark']).toHaveLength(shadowColors.length);
    expect(samples['fullbright-dark']).toEqual(expect.arrayContaining(shadowColors));
    expect(errors).toEqual([]);
  });
}
