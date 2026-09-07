import { expect, test, type Page } from '@playwright/test';
import {
  openEditor,
  perspectiveCamera,
  cameraDistance,
  installSiteToolRegistry,
  executeSiteTool,
  topWorldPoint,
} from './support/editor-browser-helpers.js';

async function observeGraph(page: Page) {
  await page.evaluate(() => {
    const graph = document.querySelector('.performance-panel polyline')!;
    const observation = {
      updates: 0,
      started: performance.now(),
      observer: null as MutationObserver | null,
    };
    observation.observer = new MutationObserver((records) => {
      observation.updates += records.length;
    });
    observation.observer.observe(graph, { attributes: true, attributeFilter: ['points'] });
    Object.assign(window, { cameraPerformanceObservation: observation });
  });
}

async function finishGraphObservation(page: Page) {
  return page.evaluate(() => {
    const result = (
      window as unknown as {
        cameraPerformanceObservation: {
          updates: number;
          started: number;
          observer: MutationObserver;
        };
      }
    ).cameraPerformanceObservation;
    result.observer.disconnect();
    return { updates: result.updates, elapsed: performance.now() - result.started };
  });
}

test('records empty-map flight without updating the diagnostics graph on every camera event', async ({
  page,
}) => {
  await installSiteToolRegistry(page);
  await openEditor(page, { empty: true });
  const documentBefore = await executeSiteTool(page, 'worldview_inspect_editor', {});
  await page.getByRole('button', { name: 'Performance', exact: true }).click();
  await page.getByRole('button', { name: 'Record 30 seconds', exact: true }).click();
  const cameraBefore = await perspectiveCamera(page);
  await page.locator('[aria-label="Perspective map viewport"]').focus();
  await observeGraph(page);
  await page.keyboard.down('w');
  try {
    await page.waitForTimeout(2000);
  } finally {
    await page.keyboard.up('w');
  }
  const observation = await finishGraphObservation(page);
  expect(
    cameraDistance((await perspectiveCamera(page)).position, cameraBefore.position),
  ).toBeGreaterThan(10);
  expect(observation.updates).toBeGreaterThan(0);
  // Allow boundary scheduling, but reject graph reconciliation at camera/input frequency.
  expect(observation.updates).toBeLessThanOrEqual(Math.ceil(observation.elapsed / 250) + 3);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await page.getByRole('button', { name: 'Show capture JSON', exact: true }).click();
  const report = JSON.parse(
    await page.getByRole('textbox', { name: 'Performance capture JSON' }).inputValue(),
  );
  expect(report.summary.renderCalls).toBeGreaterThan(0);
  expect(report.samples.length).toBeGreaterThan(0);
  expect(report.samples.length).toBeLessThanOrEqual(10_000);
  const documentAfter = await executeSiteTool(page, 'worldview_inspect_editor', {});
  expect(documentAfter.revision).toEqual(documentBefore.revision);
  await page.getByRole('button', { name: 'Performance', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Performance diagnostics' })).toBeHidden();
  await expect(page.locator('.viewport-error')).toBeHidden();
});

test('brush preview feedback stays local while a drag is in progress', async ({ page }) => {
  await installSiteToolRegistry(page);
  await openEditor(page, { empty: true });
  const before = await executeSiteTool(page, 'worldview_inspect_editor', {});
  await page.getByRole('button', { name: 'Performance', exact: true }).click();
  const start = await topWorldPoint(page, 0, 0);
  const end = await topWorldPoint(page, 256, 256);
  await observeGraph(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  try {
    await page.mouse.move(end.x, end.y, { steps: 40 });
    await expect(page.locator('#status-message')).toContainText('preview');
    const preview = await executeSiteTool(page, 'worldview_inspect_editor', {});
    expect(preview.revision).toEqual(before.revision);
  } finally {
    await page.mouse.up();
  }
  const observation = await finishGraphObservation(page);
  expect(observation.updates).toBeLessThanOrEqual(Math.ceil(observation.elapsed / 250) + 3);
  await expect(page.locator('#brush-count')).toHaveText('1');
  await expect(page.locator('#selection-kind')).toHaveText('Brush');
  await expect(page.locator('.viewport-error')).toBeHidden();
});
