import { expect, test } from '@playwright/test';
import {
  brushesInDocument,
  deriveBrush,
} from '../../../packages/worldview-editor/src/core/index.js';

import {
  openEditor,
  readEditorDocument,
  perspectivePoint,
  perspectiveWorldPoint,
  viewportPoint,
  topWorldPoint,
  frontWorldPoint,
  chooseSelectOption,
} from './support/editor-browser-helpers.js';

test.describe('Editor topology tools', () => {
  test('Vertex and Edge tools expose and reshape handles across an object selection set', async ({
    page,
  }) => {
    await openEditor(page);
    const left = await topWorldPoint(page, -64, 0);
    const right = await topWorldPoint(page, 64, 0);
    await page.mouse.click(left.x, left.y);
    await page.keyboard.down('Control');
    await page.mouse.click(right.x, right.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');

    await page.getByRole('button', { name: 'Vertex' }).click();
    await expect(page.locator('#topology-tool-section')).toBeVisible();
    await expect(page.locator('#topology-tool-title')).toHaveText('Vertex editing');
    const vertexStart = await topWorldPoint(page, -96, -32);
    const vertexEnd = await topWorldPoint(page, -112, -48);
    await page.mouse.move(vertexStart.x, vertexStart.y);
    await page.mouse.down();
    await page.mouse.move(vertexEnd.x, vertexEnd.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Move vertices');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#brush-bounds')).toHaveText('-112 -48 0 to 96 32 160');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -32 0 to 96 32 160');

    await page.getByRole('button', { name: 'Edge' }).click();
    await expect(page.locator('#topology-tool-section')).toBeVisible();
    await expect(page.locator('#topology-tool-title')).toHaveText('Edge editing');
  });

  test('exact rotate, scale, and shear controls each commit one reversible transform', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    const originalBounds = '-128 -128 -32 to 128 128 0';

    await page.getByRole('button', { name: 'Rotate' }).click();
    await expect(page.locator('#transform-tool-title')).toHaveText('Rotate brush');
    await page.locator('#rotate-angle').fill('45');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Rotate brush');
    await expect(page.locator('#brush-bounds')).not.toHaveText(originalBounds);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);

    await page.getByRole('button', { name: 'Scale' }).click();
    await page.locator('#scale-x').fill('0.5');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Scale brush');
    await expect(page.locator('#brush-bounds')).toHaveText('-64 -128 -32 to 64 128 0');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);

    await page.getByRole('button', { name: 'Shear' }).click();
    await page.locator('#shear-offset').fill('16');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Shear brush');
    await expect(page.locator('#brush-bounds')).not.toHaveText(originalBounds);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);
  });

  test('Rotate handle drag previews and commits a snapped viewport rotation', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Rotate' }).click();
    const radius = 256 * 0.62 + 10;
    const pivot = [0, 0, -16] as const;
    const startRadians = Math.PI / 4;
    const endRadians = startRadians + Math.PI / 6;
    const start = await perspectiveWorldPoint(page, [
      pivot[0],
      Math.cos(startRadians) * radius,
      pivot[2] + Math.sin(startRadians) * radius,
    ]);
    const end = await perspectiveWorldPoint(page, [
      pivot[0],
      Math.cos(endRadians) * radius,
      pivot[2] + Math.sin(endRadians) * radius,
    ]);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('#status-message')).toContainText('Rotate brush');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  test('Perspective rotation rings choose a world axis instead of forcing Z', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Rotate' }).click();

    const radius = 256 * 0.62 + 10;
    const pivot = [0, 0, -16] as const;
    const startRadians = Math.PI / 4;
    const endRadians = startRadians + Math.PI / 6;
    const start = await perspectiveWorldPoint(page, [
      pivot[0],
      Math.cos(startRadians) * radius,
      pivot[2] + Math.sin(startRadians) * radius,
    ]);
    const end = await perspectiveWorldPoint(page, [
      pivot[0],
      Math.cos(endRadians) * radius,
      pivot[2] + Math.sin(endRadians) * radius,
    ]);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('#status-message')).toContainText('Rotate brush');
    const document = await readEditorDocument(page);
    const floor = brushesInDocument(document).find((brush) =>
      brush.faces.some((face) => face.material === 'DEV_FLOOR'),
    )!;
    const bounds = deriveBrush(floor).bounds!;
    expect(bounds.min[0]).toBeCloseTo(-128, 4);
    expect(bounds.max[0]).toBeCloseTo(128, 4);
    expect(bounds.min[2]).toBeLessThan(-80);
    expect(bounds.max[2]).toBeGreaterThan(45);
  });

  test('A manually entered rotate pivot also drives direct viewport gestures', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Rotate' }).click();
    await page.locator('#transform-pivot-x').fill('64');
    await page.locator('#transform-pivot-y').fill('0');
    await page.locator('#transform-pivot-z').fill('-16');

    const start = await topWorldPoint(page, 192, 0);
    const end = await topWorldPoint(page, 64, 128);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('#status-message')).toContainText('Rotate brush');
    await expect(page.locator('#brush-bounds')).toHaveText('-64 -192 -32 to 192 64 0');
  });

  test('The rotate center is a snapped, constrained, cancellable viewport handle', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Rotate' }).click();
    await expect(page.locator('#document-revision')).toHaveText('0');

    const initial = await topWorldPoint(page, 0, 0);
    const first = await topWorldPoint(page, 64, 32);
    await page.mouse.move(initial.x, initial.y);
    await expect(
      page.locator('.viewport-pane[data-viewport="xy"] .transform-readout'),
    ).toContainText('0  0  -16');
    await page.mouse.down();
    await page.mouse.move(first.x, first.y, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('#transform-pivot-x')).toHaveValue('64');
    await expect(page.locator('#transform-pivot-y')).toHaveValue('32');
    await expect(page.locator('#transform-pivot-z')).toHaveValue('-16');
    await expect(page.locator('#status-message')).toContainText('Rotate pivot moved');
    await expect(page.locator('#document-revision')).toHaveText('0');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

    const constrained = await topWorldPoint(page, 128, 96);
    await page.keyboard.down('Shift');
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await page.mouse.move(constrained.x, constrained.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#transform-pivot-x')).toHaveValue('128');
    await expect(page.locator('#transform-pivot-y')).toHaveValue('32');
    await expect(page.locator('#status-message')).toContainText('X locked');

    const constrainedPivot = await topWorldPoint(page, 128, 32);
    const cancelled = await topWorldPoint(page, 192, 96);
    await page.mouse.move(constrainedPivot.x, constrainedPivot.y);
    await page.mouse.down();
    await page.mouse.move(cancelled.x, cancelled.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('pivot preview');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('#transform-pivot-x')).toHaveValue('128');
    await expect(page.locator('#transform-pivot-y')).toHaveValue('32');
    await expect(page.locator('#status-message')).toContainText('pivot move cancelled');
    await expect(page.locator('#document-revision')).toHaveText('0');
  });

  test('Scale and shear handles commit live orthographic transforms', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    const originalBounds = '-128 -128 -32 to 128 128 0';

    await page.getByRole('button', { name: 'Scale' }).click();
    const scaleStart = await topWorldPoint(page, 128, 0);
    const scaleEnd = await topWorldPoint(page, 192, 0);
    await page.mouse.move(scaleStart.x, scaleStart.y);
    await page.mouse.down();
    await page.mouse.move(scaleEnd.x, scaleEnd.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Scale brush');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 192 128 0');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);

    await page.keyboard.down('Shift');
    await page.mouse.move(scaleStart.x, scaleStart.y);
    await page.mouse.down();
    await page.mouse.move(scaleEnd.x, scaleEnd.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#status-message')).toContainText('Scale brush');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -160 -32 to 192 160 0');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);

    await page.getByRole('button', { name: 'Shear' }).click();
    const shearStart = await viewportPoint(page, 0, 0.5, 0.5);
    const shearEnd = await viewportPoint(page, 0, 0.68, 0.5);
    await page.mouse.move(shearStart.x, shearStart.y);
    await page.mouse.down();
    await page.mouse.move(shearEnd.x, shearEnd.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Shear brush');
    await expect(page.locator('#brush-bounds')).not.toHaveText(originalBounds);
  });

  test('Perspective corner scaling keeps the opposite 3D corner anchored', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Scale' }).click();
    const anchor = await perspectiveWorldPoint(page, [-128, -128, -32]);
    const handle = await perspectiveWorldPoint(page, [128, 128, 0]);
    const end = {
      x: anchor.x + (handle.x - anchor.x) * 1.25,
      y: anchor.y + (handle.y - anchor.y) * 1.25,
    };

    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('#status-message')).toContainText('Scale brush');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 192 192 8');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
  });

  test('selected vertices survive tool changes and accept direct and exact transforms', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Vertex' }).click();

    const lassoStart = await topWorldPoint(page, -150, 150);
    const lassoEnd = await topWorldPoint(page, 150, 100);
    await page.mouse.move(lassoStart.x, lassoStart.y);
    await page.mouse.down();
    await page.mouse.move(lassoEnd.x, lassoEnd.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#topology-selection-count')).toHaveText('4');

    await page.getByRole('button', { name: 'Scale' }).click();
    await expect(page.locator('#transform-tool-title')).toHaveText('Scale selected vertices');
    await expect(page.locator('#topology-selection-count')).toHaveText('4');
    const scaleStart = await topWorldPoint(page, 128, 128);
    const scaleEnd = await topWorldPoint(page, 160, 128);
    await page.mouse.move(scaleStart.x, scaleStart.y);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(scaleEnd.x, scaleEnd.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(page.locator('#status-message')).toContainText('Scale components');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#brush-bounds')).toHaveText('-160 -128 -32 to 160 128 0');
    await expect(page.locator('#topology-selection-count')).toHaveText('4');

    await page.getByRole('button', { name: 'Vertex' }).click();
    await expect(page.locator('#topology-selection-count')).toHaveText('4');
    await page.getByRole('button', { name: 'Rotate' }).click();
    await expect(page.locator('#transform-tool-title')).toHaveText('Rotate selected vertices');
    await page.locator('#rotate-angle').fill('15');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Rotate components');
    await expect(page.locator('#document-revision')).toHaveText('2');
    await expect(page.locator('#brush-bounds')).not.toHaveText('-160 -128 -32 to 160 128 0');
    await page.getByRole('button', { name: 'Vertex' }).click();
    await expect(page.locator('#topology-selection-count')).toHaveText('4');
    await expect(page.locator('#geometry-state')).toHaveText('valid');

    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 128 0');
    await page.getByRole('button', { name: 'Edge' }).click();
    const edge = await topWorldPoint(page, 0, 128);
    await page.mouse.click(edge.x, edge.y);
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.getByRole('button', { name: 'Shear' }).click();
    await expect(page.locator('#transform-tool-title')).toHaveText('Shear selected edges');
    await chooseSelectOption(page, 'Plane axis', 'X');
    await chooseSelectOption(page, 'Move axis', 'Y');
    await page.locator('#shear-offset').fill('16');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Shear components');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await page.getByRole('button', { name: 'Edge' }).click();
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
  });

  test('Vertex and Edge handles reshape a brush through valid undoable hull edits', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    const originalBounds = '-128 -128 -32 to 128 128 0';

    await page.getByRole('button', { name: 'Vertex' }).click();
    await expect(page.locator('#topology-tool-title')).toHaveText('Vertex editing');
    const firstVertex = await topWorldPoint(page, 128, 128);
    const vertexStart = await topWorldPoint(page, -128, -128);
    const vertexEnd = await topWorldPoint(page, -96, -96);
    await page.mouse.click(firstVertex.x, firstVertex.y);
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.keyboard.down('Control');
    await page.mouse.click(vertexStart.x, vertexStart.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#topology-selection-count')).toHaveText('2');
    await page.mouse.move(vertexStart.x, vertexStart.y);
    await page.mouse.down();
    await page.mouse.move(vertexEnd.x, vertexEnd.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Move vertices');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-bounds')).not.toHaveText(originalBounds);
    await expect(page.locator('#brush-bounds')).toContainText('to 160 160');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);

    await page.getByRole('button', { name: 'Edge' }).click();
    await expect(page.locator('#topology-tool-title')).toHaveText('Edge editing');
    const edgeStart = await topWorldPoint(page, 0, 128);
    const edgeEnd = await topWorldPoint(page, 32, 160);
    await page.mouse.move(edgeStart.x, edgeStart.y);
    await page.mouse.down();
    await page.mouse.move(edgeEnd.x, edgeEnd.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Move vertices');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-bounds')).not.toHaveText(originalBounds);
  });

  test('Vertex handles drag directly in the perspective authoring view', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    const originalBounds = '-128 -128 -32 to 128 128 0';
    await page.getByRole('button', { name: 'Vertex' }).click();
    const start = await perspectiveWorldPoint(page, [128, 128, 0]);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 48, start.y - 28, { steps: 12 });
    await expect(page.locator('#status-message')).toContainText('XY plane');
    await page.mouse.up();

    await expect(page.locator('#status-message')).toContainText('Move vertices');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-bounds')).not.toHaveText(originalBounds);
    await expect(page.locator('#brush-bounds')).toHaveText(/-32 to .* 0$/);
    await expect(page.locator('#document-revision')).toHaveText('1');

    await page.getByRole('button', { name: 'Undo' }).click();
    const verticalEnd = await perspectiveWorldPoint(page, [128, 128, 64]);
    await page.mouse.move(start.x, start.y);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(verticalEnd.x, verticalEnd.y, { steps: 12 });
    await expect(page.locator('#status-message')).toContainText('vertical Z');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 128 64');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
  });

  test('Vertex lassos toggle or add handles and deletion refuses collapsed hulls', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Vertex' }).click();

    const topLeft = await topWorldPoint(page, -150, 150);
    const topRight = await topWorldPoint(page, 150, 100);
    await page.mouse.move(topLeft.x, topLeft.y);
    await page.mouse.down();
    await page.mouse.move(topRight.x, topRight.y, { steps: 8 });
    const lasso = page.locator('[data-viewport="xy"] .handle-lasso');
    await expect(lasso).toBeVisible();
    await page.mouse.up();
    await expect(lasso).toBeHidden();
    await expect(page.locator('#topology-selection-count')).toHaveText('4');

    const bottomLeft = await topWorldPoint(page, -150, -100);
    const bottomRight = await topWorldPoint(page, 150, -150);
    await page.keyboard.down('Control');
    await page.mouse.move(bottomLeft.x, bottomLeft.y);
    await page.mouse.down();
    await page.mouse.move(bottomRight.x, bottomRight.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    await expect(page.locator('#topology-selection-count')).toHaveText('8');

    await page.mouse.move(topLeft.x, topLeft.y);
    await page.mouse.down();
    await page.mouse.move(topRight.x, topRight.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#topology-selection-count')).toHaveText('4');

    const empty = await topWorldPoint(page, 0, 0);
    await page.mouse.click(empty.x, empty.y);
    await expect(page.locator('#topology-selection-count')).toHaveText('0');
    const corner = await topWorldPoint(page, 128, 128);
    await page.mouse.click(corner.x, corner.y);
    await page.keyboard.press('Delete');
    await expect(page.locator('#status-message')).toContainText('Delete vertices');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-faces')).not.toHaveText('6');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-faces')).toHaveText('6');

    const wholeStart = await topWorldPoint(page, -160, 160);
    const wholeEnd = await topWorldPoint(page, 160, -160);
    await page.mouse.move(wholeStart.x, wholeStart.y);
    await page.mouse.down();
    await page.mouse.move(wholeEnd.x, wholeEnd.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#topology-selection-count')).toHaveText('8');
    const revisionBeforeRejectedDelete = await page.locator('#document-revision').textContent();
    await page.keyboard.press('Delete');
    await expect(page.locator('#status-message')).toContainText('collapse');
    await expect(page.locator('#document-revision')).toHaveText(revisionBeforeRejectedDelete ?? '');
    await expect(page.locator('#geometry-state')).toHaveText('valid');

    await page.getByRole('button', { name: 'Edge' }).click();
    const topEdge = await topWorldPoint(page, 0, 128);
    await page.mouse.click(topEdge.x, topEdge.y);
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.keyboard.press('Delete');
    await expect(page.locator('#status-message')).toContainText('Delete vertices');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-faces')).not.toHaveText('6');
  });

  test('Ctrl switches vertex dragging from relative to absolute grid snapping', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await chooseSelectOption(page, 'Grid size', '64');
    await page.getByRole('button', { name: 'Vertex' }).click();
    const start = await frontWorldPoint(page, 128, -32);
    const end = await frontWorldPoint(page, 148, -16);

    await page.mouse.move(start.x, start.y);
    await page.keyboard.down('Control');
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('absolute snap');
    await page.mouse.up();
    await page.keyboard.up('Control');

    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  test('Shift+Alt-click quick-snaps a selected vertex onto an existing corner', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Vertex' }).click();
    const source = await topWorldPoint(page, 128, 128);
    const target = await topWorldPoint(page, 128, -128);

    await page.mouse.click(source.x, source.y);
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.keyboard.down('Shift');
    await page.keyboard.down('Alt');
    await page.mouse.click(target.x, target.y);
    await page.keyboard.up('Alt');
    await page.keyboard.up('Shift');

    await expect(page.locator('#status-message')).toContainText('Snap vertices');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-faces')).not.toHaveText('6');
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-faces')).toHaveText('6');
  });

  test('Arrow keys nudge selected vertex and edge handles on the active viewport axes', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Vertex' }).click();
    const corner = await topWorldPoint(page, 128, 128);
    await page.mouse.click(corner.x, corner.y);

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#status-message')).toContainText('Nudge vertices');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 144 128 0');
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 144 144 0');
    await expect(page.locator('#document-revision')).toHaveText('2');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 128 0');

    await page.getByRole('button', { name: 'Edge' }).click();
    const edge = await topWorldPoint(page, 0, 128);
    await page.mouse.click(edge.x, edge.y);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#status-message')).toContainText('Nudge edges');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 144 0');
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await page.getByRole('button', { name: 'Undo' }).click();

    await page.getByRole('button', { name: 'Vertex' }).click();
    const frontCorner = await frontWorldPoint(page, 128, 0);
    await page.mouse.click(frontCorner.x, frontCorner.y);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 128 16');
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
  });

  test('Escape clears topology handles before leaving the component tool', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Vertex' }).click();
    const corner = await topWorldPoint(page, 128, 128);
    await page.mouse.click(corner.x, corner.y);
    await expect(page.locator('#topology-selection-count')).toHaveText('1');

    await page.keyboard.press('Escape');
    await expect(page.locator('#topology-selection-count')).toHaveText('0');
    await expect(page.getByRole('button', { name: 'Vertex', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#status-message')).toContainText('Press Escape again');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.keyboard.press('Escape');
    await expect(page.locator('#selection-kind')).toHaveText('None');
  });

  test('Shift-drag adds a snapped surface vertex and splits the convex hull', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Vertex' }).click();
    const start = await topWorldPoint(page, 128, 0);
    const end = await topWorldPoint(page, 160, 0);

    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('Vertex insertion preview');
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect(page.locator('#status-message')).toContainText('Add vertex');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-faces')).not.toHaveText('6');
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-faces')).toHaveText('6');
  });
});
