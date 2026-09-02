import { expect, test } from '@playwright/test';

import {
  createBoxBrush,
  createSequentialIdFactory,
  createStarterDocument,
  serializeMap,
} from '../../packages/worldview-editor/src/core/index.js';

const enabled = process.env.WORLDVIEW_PERF_GATE === '1';
const brushCount = 8_000;
const performanceEnvelope = {
  loadMilliseconds: 5_000,
  selectionMilliseconds: 350,
  translateMilliseconds: 100,
  materialMilliseconds: 250,
  undoMilliseconds: 200,
  p95FrameMilliseconds: 400,
} as const;

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
  test.skip(!enabled, 'Set WORLDVIEW_PERF_GATE=1 on a capable development host');

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
          registerTool(tool: SiteTool, options?: { readonly signal?: AbortSignal }) {
            if (options?.signal?.aborted) return;
            tools.set(tool.name, tool);
            options?.signal?.addEventListener(
              'abort',
              () => {
                if (tools.get(tool.name) === tool) tools.delete(tool.name);
              },
              { once: true },
            );
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

    const perspective = await page
      .locator('[data-viewport="perspective"] .source-canvas')
      .boundingBox();
    if (!perspective) throw new Error('Perspective viewport has no bounds');
    await page.evaluate(() => {
      for (const entry of performance.getEntriesByType('measure')) {
        if (
          entry.name.startsWith('worldview.editor.scene-contribution.') ||
          entry.name.startsWith('worldview.editor.inspector.')
        ) {
          performance.clearMeasures(entry.name);
        }
      }
    });
    await page.mouse.move(
      perspective.x + perspective.width / 2,
      perspective.y + perspective.height / 2,
    );
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      for (const entry of performance.getEntriesByType('measure')) {
        if (entry.name.startsWith('worldview.editor.scene-contribution.')) {
          performance.clearMeasures(entry.name);
        }
      }
    });
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(50);
    const cameraContributionRebuilds = await page.evaluate(() =>
      performance
        .getEntriesByType('measure')
        .filter((entry) => entry.name.startsWith('worldview.editor.scene-contribution.'))
        .map((entry) => entry.name),
    );
    const selectionResult = await page.evaluate(async () => {
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
      for (const entry of performance.getEntriesByType('measure')) {
        if (
          entry.name.startsWith('worldview.editor.scene-contribution.') ||
          entry.name.startsWith('worldview.editor.inspector.')
        ) {
          performance.clearMeasures(entry.name);
        }
      }
      const started = performance.now();
      await tools.get('worldview_select')!.execute({
        expectedDocumentId: inspection.documentId,
        expectedRevision: inspection.revision,
        mode: 'objects',
        brushIds: [listing.objects[0]!.id],
      });
      const contributionMeasures = performance
        .getEntriesByType('measure')
        .filter((entry) => entry.name.startsWith('worldview.editor.scene-contribution.'));
      const inspectorMeasures = performance
        .getEntriesByType('measure')
        .filter((entry) => entry.name.startsWith('worldview.editor.inspector.'));
      return {
        milliseconds: performance.now() - started,
        contributions: contributionMeasures.map((entry) =>
          entry.name.replace('worldview.editor.scene-contribution.', ''),
        ),
        contributionMilliseconds: Object.fromEntries(
          contributionMeasures.map((entry) => [
            entry.name.replace('worldview.editor.scene-contribution.', ''),
            entry.duration,
          ]),
        ),
        inspectorMilliseconds: Object.fromEntries(
          inspectorMeasures.map((entry) => [
            entry.name.replace('worldview.editor.inspector.', ''),
            entry.duration,
          ]),
        ),
      };
    });
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    const translateMilliseconds = await page.evaluate(() => {
      const start = performance.now();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      return performance.now() - start;
    });
    await page.getByRole('tab', { name: 'Face' }).click();
    await page.locator('#material-name').fill('BENCHMARK_CHANGED');
    const materialResult = await page.evaluate(() => {
      for (const entry of performance.getEntriesByType('measure')) {
        if (entry.name.startsWith('worldview.editor.scene-contribution.')) {
          performance.clearMeasures(entry.name);
        }
      }
      const start = performance.now();
      document.querySelector<HTMLButtonElement>('[data-action="apply-material"]')!.click();
      const contributionMeasures = performance
        .getEntriesByType('measure')
        .filter((entry) => entry.name.startsWith('worldview.editor.scene-contribution.'));
      return {
        milliseconds: performance.now() - start,
        contributionMilliseconds: Object.fromEntries(
          contributionMeasures.map((entry) => [
            entry.name.replace('worldview.editor.scene-contribution.', ''),
            entry.duration,
          ]),
        ),
      };
    });
    const undoResult = await page.evaluate(() => {
      for (const entry of performance.getEntriesByType('measure')) {
        if (entry.name.startsWith('worldview.editor.scene-contribution.')) {
          performance.clearMeasures(entry.name);
        }
      }
      const start = performance.now();
      document.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
      const contributionMeasures = performance
        .getEntriesByType('measure')
        .filter((entry) => entry.name.startsWith('worldview.editor.scene-contribution.'));
      return {
        milliseconds: performance.now() - start,
        contributionMilliseconds: Object.fromEntries(
          contributionMeasures.map((entry) => [
            entry.name.replace('worldview.editor.scene-contribution.', ''),
            entry.duration,
          ]),
        ),
      };
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
      performanceEnvelope,
      viewport: await page.viewportSize(),
      devicePixelRatio: await page.evaluate(() => devicePixelRatio),
      loadMilliseconds,
      selectionMilliseconds: selectionResult.milliseconds,
      selectionContributions: selectionResult.contributions,
      selectionContributionMilliseconds: selectionResult.contributionMilliseconds,
      selectionInspectorMilliseconds: selectionResult.inspectorMilliseconds,
      cameraContributionRebuilds,
      translateMilliseconds,
      materialMilliseconds: materialResult.milliseconds,
      materialContributionMilliseconds: materialResult.contributionMilliseconds,
      undoMilliseconds: undoResult.milliseconds,
      undoContributionMilliseconds: undoResult.contributionMilliseconds,
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
    expect(loadMilliseconds, metrics).toBeLessThan(performanceEnvelope.loadMilliseconds);
    expect(selectionResult.milliseconds, metrics).toBeLessThan(
      performanceEnvelope.selectionMilliseconds,
    );
    expect(cameraContributionRebuilds, metrics).toEqual([]);
    expect(selectionResult.contributions, metrics).not.toContain('worldSolids');
    expect(selectionResult.contributions, metrics).not.toContain('objectLines');
    expect(translateMilliseconds, metrics).toBeLessThan(performanceEnvelope.translateMilliseconds);
    expect(materialResult.milliseconds, metrics).toBeLessThan(
      performanceEnvelope.materialMilliseconds,
    );
    expect(undoResult.milliseconds, metrics).toBeLessThan(performanceEnvelope.undoMilliseconds);
    expect(p95FrameMilliseconds, metrics).toBeLessThanOrEqual(
      performanceEnvelope.p95FrameMilliseconds,
    );
  });
});
