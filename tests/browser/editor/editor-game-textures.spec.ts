import { expect, test, type Page } from '@playwright/test';
import { createQuakePalette } from '@jackharrhy/worldview/core';
import {
  createDevelopmentMaterials,
  encodeGoldSrcWad3,
  encodeQuakeWad2,
} from '../../../packages/worldview-editor/src/core/index.js';
import { openEditor } from './support/editor-browser-helpers.js';

async function materialPixel(page: Page, name = 'DEV_FLOOR'): Promise<number[]> {
  await page.getByRole('tab', { name: 'Face', exact: true }).click();
  return page.locator(`[data-material-name="${name}"] canvas`).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return [
      ...canvas.getContext('2d')!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data,
    ];
  });
}

test('Quake previews its included palette and restores a custom replacement after reload', async ({
  page,
}) => {
  await openEditor(page, { empty: true, palette: false });
  await expect(page.locator('#material-count')).toContainText('4 loaded');
  await expect(page.locator('#resource-settings')).toContainText('Standard Quake palette included');
  await expect.poll(() => materialPixel(page)).toEqual([175, 103, 35, 255]);
  const custom = { ...createDevelopmentMaterials()[0]!, name: 'CUSTOM' };
  await page.locator('#wad-files').setInputFiles({
    name: 'custom.wad',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(encodeQuakeWad2([custom], createQuakePalette())),
  });
  await expect(page.locator('#material-count')).toContainText('5 loaded');
  for (const green of [20, 180]) {
    const palette = new Uint8Array(768);
    for (let index = 0; index < 256; index++) palette.set([120, green, 30], index * 3);
    await page.locator('#palette-file').setInputFiles({
      name: 'game-palette.lmp',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(palette),
    });
    await expect.poll(() => materialPixel(page)).toEqual([120, green, 30, 255]);
    await expect.poll(() => materialPixel(page, 'CUSTOM')).toEqual([120, green, 30, 255]);
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
  await expect.poll(() => materialPixel(page)).toEqual([120, 180, 30, 255]);
  await expect.poll(() => materialPixel(page, 'CUSTOM')).toEqual([120, 180, 30, 255]);
  await expect(page.locator('.viewport-error')).toBeHidden();
});

test('GoldSrc preserves orange and rejects wrong-format or malformed packs without partial imports', async ({
  page,
}) => {
  await openEditor(page, { empty: true, game: 'goldsrc' });
  await expect.poll(() => materialPixel(page)).toEqual([205, 82, 13, 255]);
  const material = createDevelopmentMaterials()[0]!;
  await page.locator('#wad-files').setInputFiles({
    name: 'quake.wad',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(encodeQuakeWad2([material], createQuakePalette())),
  });
  await expect(page.locator('#resource-settings')).toContainText('quake.wad is WAD2');
  await expect(page.locator('#material-count')).toContainText('4 loaded');
  const brokenWad = encodeGoldSrcWad3([
    { ...material, name: 'GOOD' },
    { ...material, name: 'BAD' },
  ]);
  const view = new DataView(brokenWad);
  const directory = view.getUint32(8, true);
  const badTexture = view.getUint32(directory + 32, true);
  view.setUint32(badTexture + 16, 0, true);
  await page.locator('#wad-files').setInputFiles({
    name: 'broken.wad',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(brokenWad),
  });
  await expect(page.locator('#resource-settings')).toContainText('Texture pack broken.wad');
  await expect(page.locator('#material-count')).toContainText('4 loaded');
  await expect(page.locator('[data-material-name="GOOD"]')).toHaveCount(0);
  await expect(page.locator('.viewport-error')).toBeHidden();
});
