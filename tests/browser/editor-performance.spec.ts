import { expect, test } from '@playwright/test';

import {
  createBoxBrush,
  createSequentialIdFactory,
  createStarterDocument,
  serializeMap,
} from '../../packages/worldview-editor/src/core/index.js';

const enabled = process.env.WORLDVIEW_PERF_GATE === '1';
const brushCount = 8_000;

function scaleMapSource(): string {
  const ids = createSequentialIdFactory('browser-scale');
  const starter = createStarterDocument();
  const brushes = [createBoxBrush([-16, -16, 0], [16, 16, 32], 'BENCHMARK', ids)];
  for (let index = 1; index < brushCount; index += 1) {
    const x = ((index - 1) % 100) * 48 + 96;
    const y = Math.floor((index - 1) / 100) * 48 + 96;
    brushes.push(createBoxBrush([x, y, 0], [x + 32, y + 32, 32], 'BENCHMARK', ids));
  }
  return serializeMap({
    ...starter,
    entities: [{ ...starter.entities[0]!, primitives: brushes }, ...starter.entities.slice(1)],
  });
}

test.describe('recorded dependable-solo performance gate', () => {
  test.skip(!enabled, 'Set WORLDVIEW_PERF_GATE=1 on the reference development Mac');

  test('keeps the 8,000 six-face-brush map inside the fixed interaction envelope', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.addInitScript(() => {
      interface SiteTool {
        readonly name: string;
        execute(input: unknown): unknown | Promise<unknown>;
      }
      const tools = new Map<string, SiteTool>();
      Object.defineProperty(document, 'modelContext', {
        configurable: true,
        value: {
          registerTool(tool: SiteTool) {
            tools.set(tool.name, tool);
          },
        },
      });
      Object.defineProperty(window, 'worldviewPerformanceTools', { value: tools });
    });
    await page.goto('http://127.0.0.1:5174/editor');
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
    await page.evaluate(() => {
      Object.assign(window, { worldviewLoadStarted: performance.now() });
    });
    await page.locator('#map-file').setInputFiles({
      name: 'scale.map',
      mimeType: 'text/plain',
      buffer: Buffer.from(scaleMapSource()),
    });
    await expect(page.locator('#status-message')).toContainText('Opened scale.map');
    const loadMilliseconds = await page.evaluate(
      () =>
        performance.now() -
        (window as typeof window & { worldviewLoadStarted: number }).worldviewLoadStarted,
    );

    const selectionMilliseconds = await page.evaluate(async () => {
      const tools = (
        window as typeof window & {
          worldviewPerformanceTools: Map<
            string,
            { execute(input: unknown): unknown | Promise<unknown> }
          >;
        }
      ).worldviewPerformanceTools;
      const inspection = (await tools.get('worldview_inspect_editor')!.execute({})) as {
        documentId: string;
        revision: number;
      };
      const listing = (await tools.get('worldview_list_objects')!.execute({
        kind: 'brush',
        limit: 1,
      })) as { objects: Array<{ id: string }> };
      const started = performance.now();
      await tools.get('worldview_select')!.execute({
        expectedDocumentId: inspection.documentId,
        expectedRevision: inspection.revision,
        mode: 'objects',
        brushIds: [listing.objects[0]!.id],
      });
      return performance.now() - started;
    });
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    const translateMilliseconds = await page.evaluate(() => {
      const start = performance.now();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      return performance.now() - start;
    });
    await page.getByRole('tab', { name: 'Textures' }).click();
    await page.locator('#material-name').fill('BENCHMARK_CHANGED');
    const materialMilliseconds = await page.evaluate(() => {
      const start = performance.now();
      document.querySelector<HTMLButtonElement>('[data-action="apply-material"]')!.click();
      return performance.now() - start;
    });
    const undoMilliseconds = await page.evaluate(() => {
      const start = performance.now();
      document.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
      return performance.now() - start;
    });

    await page.evaluate(() => {
      const state = { previous: 0, samples: [] as number[] };
      Object.assign(window, { worldviewFrameSamples: state });
      const frame = (time: number) => {
        if (state.previous > 0) state.samples.push(time - state.previous);
        state.previous = time;
        if (state.samples.length < 180) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const perspective = await page
      .locator('[data-viewport="perspective"] .source-canvas')
      .boundingBox();
    if (!perspective) throw new Error('Perspective viewport has no bounds');
    await page.mouse.move(
      perspective.x + perspective.width / 2,
      perspective.y + perspective.height / 2,
    );
    await page.mouse.down({ button: 'right' });
    for (let index = 0; index < 120; index += 1) {
      await page.mouse.move(
        perspective.x + perspective.width / 2 + Math.sin(index / 8) * 80,
        perspective.y + perspective.height / 2 + Math.cos(index / 10) * 45,
      );
      await page.waitForTimeout(8);
    }
    await page.mouse.up({ button: 'right' });
    await page.waitForFunction(
      () =>
        (window as typeof window & { worldviewFrameSamples?: { samples: number[] } })
          .worldviewFrameSamples?.samples.length === 180,
    );
    const frameTimes = await page.evaluate(
      () =>
        (window as typeof window & { worldviewFrameSamples: { samples: number[] } })
          .worldviewFrameSamples.samples,
    );
    const orderedFrames = frameTimes.toSorted((left, right) => left - right);
    const p95FrameMilliseconds = orderedFrames[Math.floor(orderedFrames.length * 0.95)]!;
    const report = {
      brushCount,
      viewport: await page.viewportSize(),
      devicePixelRatio: await page.evaluate(() => devicePixelRatio),
      loadMilliseconds,
      selectionMilliseconds,
      translateMilliseconds,
      materialMilliseconds,
      undoMilliseconds,
      p95FrameMilliseconds,
      sceneRebuildMilliseconds: await page.evaluate(() =>
        performance
          .getEntriesByName('worldview.editor.scene-rebuild')
          .slice(-3)
          .map(({ duration }) => duration),
      ),
      presentationMilliseconds: await page.evaluate(() =>
        performance
          .getEntriesByName('worldview.editor.change-presentation')
          .slice(-3)
          .map(({ duration }) => duration),
      ),
      platform: await page.evaluate(() => navigator.platform),
      userAgent: await page.evaluate(() => navigator.userAgent),
    };
    await testInfo.attach('worldview-performance.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
    const metrics = JSON.stringify(report);

    expect(report.devicePixelRatio, metrics).toBe(1);
    expect(loadMilliseconds, metrics).toBeLessThan(3_000);
    expect(selectionMilliseconds, metrics).toBeLessThan(50);
    expect(translateMilliseconds, metrics).toBeLessThan(100);
    expect(materialMilliseconds, metrics).toBeLessThan(100);
    expect(undoMilliseconds, metrics).toBeLessThan(100);
    expect(p95FrameMilliseconds, metrics).toBeLessThanOrEqual(33);
  });
});
