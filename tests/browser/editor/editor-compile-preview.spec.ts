import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import { makeBsp } from '../../../packages/worldview/test/fixtures.js';
import {
  executeSiteTool,
  installSiteToolRegistry,
  openEditor,
  perspectiveCamera,
} from './support/editor-browser-helpers.js';

const compilerOrigin = 'http://127.0.0.1:8788';
const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

test.describe('Editor compiled preview', () => {
  test('opens a new BSP preview in fly mode at the perspective camera captured for compile', async ({
    page,
  }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const bsp = makeBsp({ version: 29 });
    // A compiler without its WADs writes -1 MIPTEX offsets. A broad floor keeps the
    // fallback visible from the source camera while exercising the real preview handoff.
    const bspView = new DataView(bsp.buffer, bsp.byteOffset, bsp.byteLength);
    const textureOffset = bspView.getUint32(4 + 2 * 8, true);
    bspView.setInt32(textureOffset + 4, -1, true);
    const faceOffset = bspView.getUint32(4 + 7 * 8, true);
    bspView.setInt32(faceOffset + 16, -1, true);
    const vertexOffset = bspView.getUint32(4 + 3 * 8, true);
    [-2048, -2048, 0, -2048, 2048, 0, 2048, 2048, 0, 2048, -2048, 0].forEach((value, index) =>
      bspView.setFloat32(vertexOffset + index * 4, value, true),
    );
    let announceCompileStarted!: () => void;
    let releaseCompile!: () => void;
    const compileStarted = new Promise<void>((resolve) => (announceCompileStarted = resolve));
    const compileReleased = new Promise<void>((resolve) => (releaseCompile = resolve));

    await page.route(`${compilerOrigin}/**`, async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }
      if (new URL(request.url()).pathname === '/capabilities') {
        await route.fulfill({
          headers: corsHeaders,
          json: {
            protocolVersion: 1,
            compileProfiles: [
              {
                id: 'default',
                label: 'Quake preview',
                game: 'quake',
                qualities: ['preview', 'final'],
              },
            ],
            launchProfiles: [],
          },
        });
        return;
      }
      const input = request.postDataJSON() as { readonly expectedDocumentRevision: number };
      announceCompileStarted();
      await compileReleased;
      await route.fulfill({
        headers: corsHeaders,
        json: {
          status: 'succeeded',
          buildId: 'camera-handoff',
          sourceDocumentRevision: input.expectedDocumentRevision,
          diagnostics: [],
          artifacts: [
            {
              name: 'camera-handoff.bsp',
              mediaType: 'application/x-quake-bsp',
              base64: Buffer.from(bsp).toString('base64'),
              kind: 'bsp',
            },
          ],
          elapsedMilliseconds: 12,
          logs: [],
        },
      });
    });
    await installSiteToolRegistry(page);
    await openEditor(page);
    await page.getByRole('button', { name: 'Build menu', exact: true }).click();
    await expect(
      page.getByRole('menuitem', { name: 'Build & preview', exact: true }),
    ).toBeEnabled();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    const canvas = page.getByLabel('Perspective map viewport');
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Perspective viewport has no bounds');
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(center.x, center.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(center.x + 90, center.y - 45, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    const compileCamera = await perspectiveCamera(page);

    await page.getByRole('button', { name: 'Build menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Build & preview', exact: true }).click();
    await compileStarted;

    await page.mouse.move(center.x, center.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(center.x - 70, center.y + 30, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    const cameraWhileCompiling = await perspectiveCamera(page);
    expect(cameraWhileCompiling.yaw).not.toBe(compileCamera.yaw);

    releaseCompile();
    await expect(page.getByLabel('Compiled BSP preview')).toBeVisible({ timeout: 15_000 });
    const inspection = await executeSiteTool(page, 'worldview_inspect_editor');
    expect(inspection.build).toMatchObject({
      compiledCamera: {
        position: compileCamera.position,
        yaw: compileCamera.yaw,
        pitch: compileCamera.pitch,
        fieldOfView: compileCamera.fieldOfViewDegrees,
      },
      compiledMovementMode: 'fly',
      compiledRevision: 0,
      showingCompiled: true,
    });
    const previewImage = await page.getByLabel('Compiled BSP preview').screenshot({
      path: testInfo.outputPath('compiled-preview.png'),
    });
    const fallbackPixels = await page.evaluate(async (base64) => {
      const response = await fetch(`data:image/png;base64,${base64}`);
      const bitmap = await createImageBitmap(await response.blob());
      const sample = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = sample.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (
          pixels[index]! > 100 &&
          pixels[index]! > pixels[index + 1]! * 2 &&
          pixels[index + 2]! > pixels[index + 1]! * 2
        )
          count += 1;
      }
      return count;
    }, previewImage.toString('base64'));
    expect(fallbackPixels).toBeGreaterThan(100);
    await expect(page.locator('.viewport-error')).toBeHidden();
    expect(pageErrors).toEqual([]);

    await page.getByRole('button', { name: 'Build menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Build results…', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download BSP', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('camera-handoff.bsp');
    const path = await download.path();
    expect(path).not.toBeNull();
    expect(await readFile(path!)).toEqual(Buffer.from(bsp));
    await page
      .getByRole('dialog', { name: 'Build results' })
      .getByRole('button', { name: 'Close', exact: true })
      .click();

    await page.getByRole('button', { name: 'Build menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Show source', exact: true }).click();
    await expect(canvas).toBeVisible();
    await canvas.screenshot({ path: testInfo.outputPath('restored-source.png') });
    expect((await executeSiteTool(page, 'worldview_inspect_editor')).build).toMatchObject({
      showingCompiled: false,
    });
    expect(pageErrors).toEqual([]);
  });

  test('preserves the requested view through the configured native compiler', async ({
    page,
  }, testInfo) => {
    test.skip(
      process.env.WORLDVIEW_LIVE_COMPILER !== '1',
      'Requires a configured compiler service on 127.0.0.1:8788',
    );
    await installSiteToolRegistry(page);
    await openEditor(page);
    await page.getByRole('button', { name: 'Build menu', exact: true }).click();
    await expect(
      page.getByRole('menuitem', { name: 'Build & preview', exact: true }),
    ).toBeEnabled();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    const sourceCanvas = page.getByLabel('Perspective map viewport');
    const bounds = await sourceCanvas.boundingBox();
    if (!bounds) throw new Error('Perspective viewport has no bounds');
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(center.x, center.y);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, -80);
    await page.keyboard.up('Shift');
    const requestedCamera = await perspectiveCamera(page);

    await page.getByRole('button', { name: 'Build menu', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/compile') && response.request().method() === 'POST',
    );
    await page.getByRole('menuitem', { name: 'Build & export', exact: true }).click();
    const compiledCanvas = page.getByLabel('Compiled BSP preview');
    await expect(compiledCanvas).toBeVisible({ timeout: 30_000 });
    const inspection = await executeSiteTool(page, 'worldview_inspect_editor');
    expect(inspection.build).toMatchObject({
      compiledCamera: {
        position: requestedCamera.position,
        yaw: requestedCamera.yaw,
        pitch: requestedCamera.pitch,
        fieldOfView: requestedCamera.fieldOfViewDegrees,
      },
      compiledMovementMode: 'fly',
      compiledRevision: 0,
      showingCompiled: true,
    });
    await expect(page.locator('.viewport-error')).toBeHidden();
    const result = await (await responsePromise).json();
    const artifact = result.artifacts.find((entry: { kind: string }) => entry.kind === 'bsp');
    const download = await downloadPromise;
    expect(await readFile((await download.path())!)).toEqual(
      Buffer.from(artifact.base64, 'base64'),
    );
    await page.screenshot({ path: testInfo.outputPath('native-build-export.png') });
  });
});
