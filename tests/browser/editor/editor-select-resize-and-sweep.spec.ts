import { expect, test } from '@playwright/test';
import {
  brushesInDocument,
  deriveBrush,
} from '../../../packages/worldview-editor/src/core/index.js';
import { coplanarBrushSource } from './support/editor-fixtures.js';
import {
  openEditor,
  readEditorDocument,
  perspectivePoint,
  perspectiveWorldPoint,
  topWorldPoint,
  chooseSelectOption,
} from './support/editor-browser-helpers.js';

test.describe('Editor select resize and sweep tools', () => {
  test('shift-click and double-click select faces without leaving the Select tool', async ({
    page,
  }) => {
    await openEditor(page);
    const point = await perspectivePoint(page, 0.5, 0.58);

    await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Shift');

    await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await expect(page.locator('#face-material')).toHaveText('DEV_FLOOR');
    await expect(page.locator('#face-extrude-section')).toBeVisible();

    await page.keyboard.down('Shift');
    await page.mouse.dblclick(point.x, point.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('6 Faces');
    await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('Shift-drag permanently resizes selected brushes without activating the Face tool', async ({
    page,
  }) => {
    await openEditor(page);
    const start = await perspectiveWorldPoint(page, [0, 0, 0]);
    const end = await perspectiveWorldPoint(page, [0, 0, 96]);
    await page.mouse.click(start.x, start.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');

    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#brush-bounds')).not.toHaveText('-128 -128 -32 to 128 128 0');
    await expect(page.locator('#status-message')).toContainText('Extrude face');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.mouse.click(start.x, start.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');

    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#status-message')).toContainText('Split-extrude face');
  });

  test('Shift-drag resizes coplanar faces across a multi-brush object selection atomically', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(coplanarBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();

    const lowerCenter = await topWorldPoint(page, -16, -40);
    const upperCenter = await topWorldPoint(page, -16, 40);
    await page.mouse.click(lowerCenter.x, lowerCenter.y);
    await page.keyboard.down('Control');
    await page.mouse.click(upperCenter.x, upperCenter.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');

    // Start just beyond the selected silhouette so the Select tool's face-proximity heuristic
    // resolves the +X plane instead of the top face hit by the orthographic ray.
    const grabbedFace = await topWorldPoint(page, 6, -40);
    const movedFace = await topWorldPoint(page, 22, -40);
    await page.keyboard.down('Shift');
    await page.mouse.move(grabbedFace.x, grabbedFace.y);
    await page.mouse.down();
    await page.mouse.move(movedFace.x, movedFace.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Extrude shared faces');
    const moved = await readEditorDocument(page);
    expect(brushesInDocument(moved).map((brush) => deriveBrush(brush).bounds?.max[0])).toEqual([
      16, 16,
    ]);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    const restored = await readEditorDocument(page);
    expect(brushesInDocument(restored).map((brush) => deriveBrush(brush).bounds?.max[0])).toEqual([
      0, 0,
    ]);
  });

  test('Shift-drag acquires a selected brush face just outside its silhouette edge', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');

    const center = await perspectiveWorldPoint(page, [0, 0, 0]);
    const corner = await perspectiveWorldPoint(page, [128, 128, 0]);
    const length = Math.hypot(corner.x - center.x, corner.y - center.y);
    const outward = {
      x: (corner.x - center.x) / length,
      y: (corner.y - center.y) / length,
    };
    const nearEdge = { x: corner.x + outward.x * 6, y: corner.y + outward.y * 6 };
    const end = { x: nearEdge.x + outward.x * 48, y: nearEdge.y + outward.y * 48 };

    await page.keyboard.down('Shift');
    await page.mouse.move(nearEdge.x, nearEdge.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Extrude face');
    await expect(page.locator('#brush-bounds')).not.toHaveText('-128 -128 -32 to 128 128 0');
  });

  test('permanent resize modifiers move a face freely or stamp a new brush from Select', async ({
    page,
  }) => {
    await openEditor(page);
    const start = await perspectivePoint(page, 0.5, 0.58);
    const translateEnd = await perspectivePoint(page, 0.58, 0.48);
    const stampEnd = await perspectivePoint(page, 0.5, 0.38);
    await page.mouse.click(start.x, start.y);

    await page.keyboard.down('Shift');
    await page.keyboard.down('Alt');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(translateEnd.x, translateEnd.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Shift');

    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Move face');
    await expect(page.locator('#geometry-state')).toHaveText('valid');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.down('Alt');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(stampEnd.x, stampEnd.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');

    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#status-message')).toContainText('Stamp face');
  });

  test('Sweep previews path controls and commits all generated brushes as one undoable edit', async ({
    page,
  }) => {
    await openEditor(page);
    const point = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Shift');
    await page.getByRole('button', { name: 'Sweep', exact: true }).click();

    await expect(page.locator('#sweep-tool-section')).toBeVisible();
    await expect(page.locator('#sweep-generated-count')).toHaveText('4 brushes');
    await expect(page.locator('#brush-count')).toHaveText('7');
    await page.locator('#sweep-segments').fill('3');
    await page.locator('#sweep-iterations').fill('2');
    await page.locator('#sweep-rotate-z').fill('30');
    await chooseSelectOption(page, 'Path', 'Arc');
    await page.locator('#sweep-snap').focus();
    await page.keyboard.press('Space');

    await expect(page.locator('#sweep-generated-count')).toHaveText('6 brushes');
    await expect(page.locator('#brush-count')).toHaveText('9');
    await expect(page.locator('#status-message')).toContainText('Sweep preview');
    await page.getByRole('button', { name: 'Apply Sweep', exact: true }).click();

    await expect(page.locator('#selection-kind')).toHaveText('6 Brushes');
    await expect(page.locator('#brush-count')).toHaveText('9');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Created 6 brushes');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('9');
    await expect(page.locator('#selection-kind')).toHaveText('6 Brushes');
  });

  test('Sweep destination supports direct 3D movement, ring rotation, uniform scale, and two-stage Escape', async ({
    page,
  }) => {
    await openEditor(page);
    const face = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(face.x, face.y);
    await page.keyboard.up('Shift');
    await page.getByRole('button', { name: 'Sweep', exact: true }).click();

    const center = await perspectiveWorldPoint(page, [0, 0, 64]);
    const movedCenter = await perspectiveWorldPoint(page, [32, 0, 64]);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(movedCenter.x, movedCenter.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#sweep-translate-x')).toHaveValue('32');
    await expect(page.locator('#status-message')).toContainText('destination translate set');

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    const ringStart = await perspectiveWorldPoint(page, [168, 0, 64]);
    const ringEnd = await perspectiveWorldPoint(page, [0, 168, 64]);
    await page.mouse.move(ringStart.x, ringStart.y);
    await page.mouse.down();
    await page.mouse.move(ringEnd.x, ringEnd.y, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('#sweep-rotate-z')).not.toHaveValue('0');
    await expect(page.locator('#status-message')).toContainText('destination rotate set');

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    const scalePivot = await perspectiveWorldPoint(page, [0, 0, 64]);
    const scaleStart = await perspectiveWorldPoint(page, [128, 128, 64]);
    const scaleEnd = {
      x: scalePivot.x + (scaleStart.x - scalePivot.x) * 1.5,
      y: scalePivot.y + (scaleStart.y - scalePivot.y) * 1.5,
    };
    await page.mouse.move(scaleStart.x, scaleStart.y);
    await page.mouse.down();
    await page.mouse.move(scaleEnd.x, scaleEnd.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#sweep-scale')).toHaveValue('1.5');
    await expect(page.locator('#status-message')).toContainText('destination scale set');

    await page.keyboard.press('Escape');
    await expect(page.locator('#sweep-scale')).toHaveValue('1');
    await expect(page.getByRole('button', { name: 'Sweep', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#brush-count')).toHaveText('3');
  });
});
