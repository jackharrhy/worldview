import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openEditor, topWorldPoint, readEditorDocument } from './support/editor-browser-helpers.js';
import {
  brushesInDocument,
  deriveBrush,
  parseMap,
  insertBrush,
  createBoxBrush,
  createSequentialIdFactory,
  serializeMap,
} from '../../../packages/worldview-editor/src/core/index.js';
test('face magnet attracts, lets a continuing drag escape, and commits the off-grid target', async ({
  page,
}) => {
  await openEditor(page, { empty: true });
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const fixture = parseMap(await readFile('tests/browser/editor/support/face-magnet.map', 'utf8'));
  const multipleTargets = insertBrush(
    fixture,
    fixture.entities[0]!.id,
    createBoxBrush(
      [75, 48, 0],
      [107, 96, 64],
      'DEV_FLOOR',
      createSequentialIdFactory('second-contact'),
    ),
  );
  await page.locator('#map-source').fill(serializeMap(multipleTargets));
  await page.getByRole('button', { name: 'Apply source', exact: true }).click();
  const center = await topWorldPoint(page, -32, 0);
  await page.mouse.click(center.x, center.y);
  const start = await topWorldPoint(page, 5, 0);
  const near = await topWorldPoint(page, 80, 0);
  const far = await topWorldPoint(page, 140, 0);
  const platformEdge = await topWorldPoint(page, 229, 0);
  const canvas = page.locator('[data-viewport="xy"] .source-canvas');
  await page.keyboard.down('Shift');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(near.x, near.y, { steps: 6 });
  await expect(canvas).toHaveAttribute('data-face-magnet', '75');
  await expect(page.locator('.transform-readout[data-runtime-visible="true"]')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-face-alignment-count', '2');
  await page.keyboard.down('Control');
  await page.mouse.move(near.x + 1, near.y);
  await expect(canvas).toHaveAttribute('data-face-magnet', '');
  await expect(canvas).toHaveAttribute('data-face-alignment-count', '2');
  await page.keyboard.up('Control');
  await page.mouse.move(near.x, near.y);
  await page.screenshot({ path: 'artifacts/verification/face-magnet/snapped.png' });
  await page.mouse.move(far.x, far.y, { steps: 6 });
  await expect(canvas).toHaveAttribute('data-face-magnet', '');
  await expect(canvas).toHaveAttribute('data-face-alignment-count', '0');
  await page.mouse.move(platformEdge.x, platformEdge.y, { steps: 6 });
  await expect(canvas).toHaveAttribute('data-face-magnet', '224');
  await page.screenshot({ path: 'artifacts/verification/face-magnet/platform-edge.png' });
  await page.mouse.move(near.x, near.y, { steps: 6 });
  await expect(canvas).toHaveAttribute('data-face-magnet', '75');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-face-alignment', '');
  await page.keyboard.down('Shift');
  await expect(canvas).toHaveAttribute('data-face-alignment-count', '2');
  await page.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-face-alignment', '');
  expect(deriveBrush(brushesInDocument(await readEditorDocument(page))[0]!).bounds?.max[0]).toBe(
    75,
  );
  // A new gesture starts on an already aligned face. Returning exactly to the pointer-down
  // position must update both geometry and cyan feedback even below the drag-start threshold.
  await page.keyboard.down('Shift');
  await page.mouse.move(near.x, near.y);
  await expect(canvas).toHaveAttribute('data-face-alignment-count', '2');
  await page.mouse.down();
  await page.mouse.move(far.x, far.y, { steps: 6 });
  await page.mouse.move(near.x, near.y, { steps: 6 });
  await expect(canvas).toHaveAttribute('data-face-magnet', '0');
  await expect(canvas).toHaveAttribute('data-face-alignment-count', '2');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect(deriveBrush(brushesInDocument(await readEditorDocument(page))[0]!).bounds?.max[0]).toBe(
    75,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-face-alignment', '');
  expect(deriveBrush(brushesInDocument(await readEditorDocument(page))[0]!).bounds?.max[0]).toBe(0);
});
