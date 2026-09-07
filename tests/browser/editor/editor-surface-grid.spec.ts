import { expect, test } from '@playwright/test';
import {
  openEditor,
  chooseSelectOption,
  readEditorDocument,
} from './support/editor-browser-helpers.js';

test('passive surface grid follows grid spacing on unselected brushes in both themes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openEditor(page);
  const document = await readEditorDocument(page);
  await expect(page.locator('#selection-kind')).toHaveText('None');
  for (const theme of ['Dark', 'Light']) {
    await chooseSelectOption(page, 'Editor theme', theme);
    for (const spacing of ['16', '32']) {
      await chooseSelectOption(page, 'Grid size', spacing);
      await expect(page.locator('.viewport-error')).toBeHidden();
      await page.screenshot({
        path: `artifacts/verification/surface-grid/${theme}-${spacing}.png`,
      });
      expect(await readEditorDocument(page)).toEqual(document);
    }
  }
  expect(errors).toEqual([]);
});

test('distant textured faces and the ground grid remain filtered across zoom levels', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /GPU|shader|pipeline|WGSL/i.test(message.text()))
      errors.push(message.text());
  });
  await openEditor(page);
  await chooseSelectOption(page, 'Editor theme', 'Dark');
  const canvas = page.getByLabel('Perspective map viewport');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Missing perspective viewport');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  for (const distance of [0, 12000, 20000]) {
    if (distance) await page.mouse.wheel(0, distance);
    await expect(page.locator('.viewport-error')).toBeHidden();
    // Wait for the camera update and its GPU submission before capturing the frame.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const screenshot = await canvas.screenshot({
      path: `artifacts/verification/surface-grid/distant-${distance}.png`,
    });
    if (distance) {
      const axes = await page.evaluate(async (bytes) => {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
        );
        const sample = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = sample.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
        let red = 0;
        let blue = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (
            pixels[offset]! > pixels[offset + 1]! + 40 &&
            pixels[offset]! > pixels[offset + 2]! + 40
          )
            red++;
          if (
            pixels[offset + 2]! > pixels[offset]! + 40 &&
            pixels[offset + 2]! > pixels[offset + 1]! + 20
          )
            blue++;
        }
        return { red, blue };
      }, Array.from(screenshot));
      // Long clipped axes must remain visible; an empty frame must not pass visual checks.
      expect(axes.red).toBeGreaterThan(100);
      expect(axes.blue).toBeGreaterThan(100);
    }
  }
  expect(errors).toEqual([]);
});
