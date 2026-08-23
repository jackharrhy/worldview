import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function requireWebGpu(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => Boolean(navigator.gpu)),
    'Playwright Chromium must expose navigator.gpu; browser coverage may not silently skip',
  ).toBe(true);
}

test('public viewer app renders the generated BSP and survives repeated loads', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/?fixture=synthetic');
  await requireWebGpu(page);
  await expect(page.locator('[data-status]')).toContainText('Ready', { timeout: 15_000 });
  await expect(page.locator('[data-status]')).toHaveAttribute('data-ready-sequence', '1');
  await expect(page.locator('[data-format]')).toContainText('goldsrc-bsp30');
  await expect(page.locator('[data-metrics]')).toContainText('2');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('[data-control-dock]')).toBeVisible();
  await expect(page.locator('[data-viewer-shell]')).toHaveAttribute('data-movement-mode', 'walk');

  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.locator('[data-max-speed]')).toHaveValue('320');
  await expect(page.locator('[data-mouse-acceleration]')).toHaveValue('0.000');

  await page.locator('canvas').focus();
  await page.keyboard.press('v');
  await expect(page.locator('[data-viewer-shell]')).toHaveAttribute('data-movement-mode', 'fly');
  await page.keyboard.press('v');
  await expect(page.locator('[data-viewer-shell]')).toHaveAttribute('data-movement-mode', 'walk');

  expect(
    await page.locator('canvas').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return [rect.width, rect.height];
    }),
  ).toEqual(await page.evaluate(() => [window.innerWidth, window.innerHeight]));

  const firstSize = await page.locator('canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return [canvas.width, canvas.height];
  });
  expect(firstSize[0]).toBeGreaterThan(0);
  expect(firstSize[1]).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.locator('[data-control-dock] select').first().selectOption({ label: 'Water' });
  await page.locator('[data-fixture]').click();
  await expect(page.locator('[data-status]')).toHaveAttribute('data-ready-sequence', '2');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('canvas')).toBeVisible();
  expect(
    await page.locator('canvas').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return [rect.width, rect.height];
    }),
  ).toEqual([390, 844]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});

test('public viewer exports a deterministic orthographic overview', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/?fixture=synthetic');
  await requireWebGpu(page);
  await expect(page.locator('[data-status]')).toContainText('Ready', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.locator('[data-overview-status]')).toHaveValue('Ready · height slice');
  await expect(page.locator('[data-overview-z-min]')).toHaveValue('0');
  await expect(page.locator('[data-overview-z-max]')).toHaveValue('0');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-overview-download]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Buffer-map-overview.png');
  const path = await download.path();
  expect(path).not.toBeNull();
  const png = await readFile(path!);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.byteLength).toBeGreaterThan(1000);
  await expect(page.locator('[data-overview-status]')).toHaveValue('1024 × 1024, 0°');
  expect(errors).toEqual([]);
});

test('development viewer generates, visualizes, and persists walkability', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/?fixture=synthetic');
  await requireWebGpu(page);
  await expect(page.locator('[data-status]')).toContainText('Ready', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.getByRole('button', { name: 'Walkability', exact: true }).click();
  await page.locator('[data-walkability-generate]').click();
  await expect(page.locator('[data-walkability-nodes]')).not.toHaveValue('0', {
    timeout: 15_000,
  });
  await expect(page.locator('[data-walkability-status]')).toHaveValue(/nodes/);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-walkability-download]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Buffer-map.worldview-walkability.json');
  const path = await download.path();
  expect(path).not.toBeNull();
  const saved = JSON.parse(await readFile(path!, 'utf8')) as { format: string; nodes: unknown[] };
  expect(saved.format).toBe('worldview-walkability');
  expect(saved.nodes.length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  const overviewDownloadPromise = page.waitForEvent('download');
  await page.locator('[data-overview-download]').click();
  await overviewDownloadPromise;
  await expect(page.locator('[data-overview-status]')).toHaveValue(/cutaway/);
  expect(errors).toEqual([]);
});

test('walking produces player audio and exposes independent footstep volume', async ({ page }) => {
  await page.addInitScript(() => {
    const originalCreateBuffer = AudioContext.prototype.createBuffer;
    (window as unknown as { worldviewShortAudioBuffers: number }).worldviewShortAudioBuffers = 0;
    AudioContext.prototype.createBuffer = function (channels, length, sampleRate) {
      if (length / sampleRate < 0.25) {
        (window as unknown as { worldviewShortAudioBuffers: number }).worldviewShortAudioBuffers +=
          1;
      }
      return originalCreateBuffer.call(this, channels, length, sampleRate);
    };
  });

  await page.goto('/?fixture=synthetic');
  await requireWebGpu(page);
  await expect(page.locator('[data-status]')).toContainText('Ready', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.locator('[data-player-volume]')).toHaveValue('1.00');
  await page.getByRole('button', { name: 'Audio', exact: true }).click();
  await page.locator('[data-enable-audio]').click();
  const beforeWalking = await page.evaluate(
    () => (window as unknown as { worldviewShortAudioBuffers: number }).worldviewShortAudioBuffers,
  );
  await page.locator('canvas').focus();
  await page.keyboard.down('w');
  await page.waitForTimeout(650);
  await page.keyboard.up('w');

  expect(
    await page.evaluate(
      () =>
        (window as unknown as { worldviewShortAudioBuffers: number }).worldviewShortAudioBuffers,
    ),
  ).toBeGreaterThan(beforeWalking);
});

test('alpha-test, water, and sky fixtures submit without GPU errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  for (const fixture of ['alpha', 'water', 'goldsrc-sky', 'quake']) {
    await page.goto(`/?fixture=${fixture}`);
    await requireWebGpu(page);
    await expect(page.locator('[data-status]')).toContainText('Ready', { timeout: 15_000 });
    await expect(page.locator('[data-status]')).toHaveAttribute('data-ready-sequence', '1');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  }
  await expect(page.locator('[data-format]')).toContainText('quake-bsp29');
  expect(errors).toEqual([]);
});

test('GoldSrc sprite entities compile and render through the public asset API', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/?fixture=sprite');
  await requireWebGpu(page);
  await expect(page.locator('[data-status]')).toContainText('Ready', { timeout: 15_000 });
  await expect(page.locator('[data-metrics]')).toContainText('1 sprites');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(errors).toEqual([]);
});

test('GoldSrc ambient audio resumes from a gesture and applies an env_sound room', async ({
  page,
}) => {
  const errors: string[] = [];
  await page.addInitScript(() => {
    const originalStart = AudioBufferSourceNode.prototype.start;
    (window as unknown as { worldviewAmbientLoops: boolean[] }).worldviewAmbientLoops = [];
    AudioBufferSourceNode.prototype.start = function (...arguments_) {
      (window as unknown as { worldviewAmbientLoops: boolean[] }).worldviewAmbientLoops.push(
        this.loop,
      );
      return originalStart.apply(this, arguments_);
    };
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/?fixture=audio');
  await requireWebGpu(page);
  await expect(page.locator('[data-status]')).toContainText('Ready', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.getByRole('button', { name: 'Audio', exact: true }).click();
  await expect(page.locator('[data-room-type]')).toHaveValue('5');
  await expect(page.locator('[data-audio-state]')).toHaveValue('Click viewport to enable');
  await page.getByRole('button', { name: 'Entity support', exact: true }).click();
  await expect(page.locator('[data-entity-support]')).toHaveValue(
    /ambient_generic × 1 \(partial\)/,
  );
  await page.locator('[data-enable-audio]').click();
  await expect(page.locator('[data-audio-state]')).toHaveValue('Playing');
  expect(
    await page.evaluate(
      () => (window as unknown as { worldviewAmbientLoops: boolean[] }).worldviewAmbientLoops,
    ),
  ).toEqual([true]);
  await expect(page.locator('[data-music-track]')).toHaveValue('tone.wav · fixture_music');
  await expect(page.locator('[data-music-state]')).toHaveValue('Stopped');
  await page.locator('[data-play-music]').click();
  await expect(page.locator('[data-music-state]')).toHaveValue('Playing');
  expect(
    await page.evaluate(
      () => (window as unknown as { worldviewAmbientLoops: boolean[] }).worldviewAmbientLoops,
    ),
  ).toEqual([true, true]);
  await page.locator('[data-stop-music]').click();
  await expect(page.locator('[data-music-state]')).toHaveValue('Stopped');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.locator('[data-control-dock] select').first().selectOption({ label: 'Water' });
  await page.locator('[data-fixture]').click();
  await expect(page.locator('[data-status]')).toHaveAttribute('data-ready-sequence', '2');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.locator('[data-audio-state]')).toHaveValue('Playing');
  await expect(page.locator('[data-room-type]')).toHaveValue('0 - off');
  expect(errors).toEqual([]);
});

test('an unsupported music codec warns without disabling the usable audio graph', async ({
  page,
}) => {
  await page.goto('/?fixture=audio-decode-failure');
  await requireWebGpu(page);
  await expect(page.locator('[data-status]')).toContainText('Ready', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.getByRole('button', { name: 'Audio', exact: true }).click();
  await page.locator('[data-enable-audio]').click();
  await expect(page.locator('[data-audio-state]')).toHaveValue('Playing');
  await page.getByRole('button', { name: 'Display', exact: true }).click();
  await expect(page.locator('[data-warnings]')).toHaveValue(/could not decode music/);
});

test('published subpaths bundle and execute without the TypeGPU consumer plugin', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4173/consumer/');
  await expect(page.locator('body')).toHaveAttribute('data-main', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-overview', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-core', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-element', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-walkability', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-error', 'invalid-data');
});

test('standalone module auto-registers and renders in multiple custom elements', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('http://127.0.0.1:4173/standalone.html');
  await requireWebGpu(page);
  await expect(page.locator('body')).toHaveAttribute('data-ready', '2');
  await expect(page.locator('world-view')).toHaveCount(2);
  await expect(page.locator('world-view').first()).toHaveAttribute('data-triangles', '2');
  await expect(page.locator('world-view').first()).toHaveAttribute('data-audio-volume', '0.35');
  await expect(page.locator('world-view').first()).toHaveAttribute('data-audio-enabled', 'false');
  await expect(page.locator('world-view').first()).toHaveAttribute('data-music-volume', '0.45');
  await expect(page.locator('world-view').last()).toHaveAttribute('data-triangles', '2');
  await expect(page.locator('world-view').first()).toBeVisible();
  expect(
    await page
      .locator('world-view')
      .first()
      .evaluate((element) => Boolean(element.shadowRoot)),
  ).toBe(true);
  expect(
    await page
      .locator('world-view')
      .first()
      .evaluate((element) => {
        const worldView = element as HTMLElement & {
          viewer: { audio: { musicVolume: number } };
        };
        const viewer = worldView.viewer;
        worldView.setAttribute('music-volume', '0.2');
        return worldView.viewer === viewer && viewer.audio.musicVolume === 0.2;
      }),
  ).toBe(true);
  expect(
    await page
      .locator('world-view')
      .first()
      .evaluate(async (element) => {
        const worldView = element as HTMLElement & {
          viewer: {
            captureOverview(options: {
              width: number;
              height: number;
              zMin?: number;
              zMax?: number;
            }): Promise<{ image: Blob; layout: { rotation: number } }>;
          };
        };
        const visible = await worldView.viewer.captureOverview({ width: 64, height: 64 });
        const clipped = await worldView.viewer.captureOverview({
          width: 64,
          height: 64,
          zMin: 1,
          zMax: 2,
        });
        const opaqueCounts: number[] = [];
        for (const capture of [visible, clipped]) {
          const bitmap = await createImageBitmap(capture.image);
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d')!;
          context.drawImage(bitmap, 0, 0);
          const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
          bitmap.close();
          let count = 0;
          for (let index = 3; index < pixels.length; index += 4) {
            if ((pixels[index] ?? 0) > 0) count += 1;
          }
          opaqueCounts.push(count);
        }
        return {
          visible: (opaqueCounts[0] ?? 0) > 1000,
          clipped: (opaqueCounts[1] ?? 0) === 0,
          imageType: visible.image.type,
          rotation: visible.layout.rotation,
        };
      }),
  ).toEqual({ visible: true, clipped: true, imageType: 'image/png', rotation: 0 });
  await page
    .locator('world-view')
    .first()
    .evaluate((element) => element.remove());
  await expect(page.locator('world-view')).toHaveCount(1);
  await expect(page.locator('world-view')).toHaveAttribute('data-triangles', '2');
  expect(errors).toEqual([]);
});
