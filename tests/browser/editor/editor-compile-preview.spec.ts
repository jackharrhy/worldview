import { expect, test } from '@playwright/test';

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
  }) => {
    const bsp = makeBsp({ version: 29 });
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
    await expect(page.locator('.compile-state')).toHaveText('COMPILER READY');

    const canvas = page.getByLabel('Perspective map viewport');
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Perspective viewport has no bounds');
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(center.x, center.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(center.x + 90, center.y - 45, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    const compileCamera = await perspectiveCamera(page);

    await page.getByRole('button', { name: 'Compile', exact: true }).click();
    await compileStarted;
    await expect(page.locator('.compile-state')).toHaveText('COMPILING PREVIEW');

    await page.mouse.move(center.x, center.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(center.x - 70, center.y + 30, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    const cameraWhileCompiling = await perspectiveCamera(page);
    expect(cameraWhileCompiling.yaw).not.toBe(compileCamera.yaw);

    releaseCompile();
    await expect(page.getByLabel('Compiled BSP preview')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.compile-state')).toHaveText('COMPILED R0');
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
  });

  test('preserves the requested view through the configured native compiler', async ({ page }) => {
    test.skip(
      process.env.WORLDVIEW_LIVE_COMPILER !== '1',
      'Requires a configured compiler service on 127.0.0.1:8788',
    );
    await installSiteToolRegistry(page);
    await openEditor(page);
    await expect(page.locator('.compile-state')).toHaveText('COMPILER READY');

    const sourceCanvas = page.getByLabel('Perspective map viewport');
    const bounds = await sourceCanvas.boundingBox();
    if (!bounds) throw new Error('Perspective viewport has no bounds');
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(center.x, center.y);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, -80);
    await page.keyboard.up('Shift');
    const requestedCamera = await perspectiveCamera(page);

    await page.getByRole('button', { name: 'Compile', exact: true }).click();
    const compiledCanvas = page.getByLabel('Compiled BSP preview');
    await expect(compiledCanvas).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.compile-state')).toHaveText('COMPILED R0');
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
  });
});
