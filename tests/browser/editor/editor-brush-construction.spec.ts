import { expect, test } from '@playwright/test';
import {
  brushesInDocument,
  brushVertices,
  deriveBrush,
} from '../../../packages/worldview-editor/src/core/index.js';
import {
  adjacentBrushSource,
  subtractionBrushSource,
  offGridBrushSource,
} from './support/editor-fixtures.js';
import {
  openEditor,
  readEditorDocument,
  perspectivePoint,
  perspectiveWorldPoint,
  topWorldPoint,
  chooseSelectOption,
  setCheckbox,
} from './support/editor-browser-helpers.js';

test.describe('Editor brush construction tools', () => {
  test('Hull tool captures a reference polygon, duplicates it, and creates one convex brush', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Hull', exact: true }).click();
    const start = await perspectiveWorldPoint(page, [0, 0, 48]);
    const end = await perspectiveWorldPoint(page, [0, 0, 128]);

    await page.mouse.dblclick(start.x, start.y);
    await expect(page.locator('#hull-point-count')).toHaveText('4 points');
    await expect(page.getByRole('button', { name: 'Create hull' })).toBeDisabled();

    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect(page.locator('#hull-point-count')).toHaveText('8 points');
    await expect(page.getByRole('button', { name: 'Create hull' })).toBeEnabled();
    await page.keyboard.press('Enter');
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#status-message')).toContainText('Create hull brush');
    await expect(page.locator('#hull-point-count')).toHaveText('0 points');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
  });

  test('Hull tool places single and rectangular face points and cancels the whole set', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Hull', exact: true }).click();
    const single = await perspectivePoint(page, 0.5, 0.58);
    const rectangleStart = await perspectivePoint(page, 0.45, 0.57);
    const rectangleEnd = await perspectivePoint(page, 0.56, 0.5);

    await page.mouse.click(single.x, single.y);
    await expect(page.locator('#hull-point-count')).toHaveText('1 point');
    await page.mouse.move(rectangleStart.x, rectangleStart.y);
    await page.mouse.down();
    await page.mouse.move(rectangleEnd.x, rectangleEnd.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#hull-point-count')).toContainText('points');
    await expect(page.locator('#hull-point-count')).not.toHaveText('1 point');

    await page.keyboard.press('Escape');
    await expect(page.locator('#hull-point-count')).toHaveText('0 points');
    await expect(page.getByRole('button', { name: 'Hull', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#status-message')).toContainText('Discarded all hull points');
  });

  test('Simple Shape tool creates hollow cylinders and spheroids through live batch previews', async ({
    page,
  }) => {
    await openEditor(page);
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#simple-shape-tool-section')).toBeVisible();
    await chooseSelectOption(page, 'Shape', 'Cylinder');
    await page.locator('#simple-shape-sides').fill('8');
    await setCheckbox(page, 'Hollow', true);
    await page.locator('#simple-shape-thickness').fill('8');
    const start = await topWorldPoint(page, -64, -64);
    const end = await topWorldPoint(page, 64, 64);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('cylinder preview');
    await expect(page.locator('#simple-shape-result')).toHaveText('8 brushes');
    await page.mouse.up();

    await expect(page.locator('#brush-count')).toHaveText('11');
    await expect(page.locator('#selection-kind')).toHaveText('8 Brushes');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');

    await chooseSelectOption(page, 'Shape', 'Spheroid (UV)');
    await page.locator('#simple-shape-sides').fill('8');
    await page.locator('#simple-shape-rings').fill('4');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('UV spheroid preview');
    await page.mouse.up();
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#brush-faces')).toHaveText('40');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
  });

  test('default tool selects on click and draws shapes only with an empty selection', async ({
    page,
  }) => {
    await openEditor(page);
    await expect(page.getByRole('button', { name: 'Brush', exact: true })).toHaveCount(0);
    await expect(page.locator('#simple-shape-tool-section')).toBeVisible();

    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#simple-shape-tool-section')).toBeHidden();

    const start = await topWorldPoint(page, 256, 256);
    const end = await topWorldPoint(page, 384, 384);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#brush-count')).toHaveText('3');

    await page.mouse.click(start.x, start.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await expect(page.locator('#simple-shape-tool-section')).toBeVisible();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
  });

  test('Radiant grid keys drive snapped brush creation in orthographic views', async ({ page }) => {
    await openEditor(page);
    await page.locator('.source-canvas').nth(1).focus();
    await page.keyboard.press('Digit6');
    await expect(page.locator('#grid-size')).toContainText('32');
    await page.keyboard.press('BracketRight');
    await expect(page.locator('#grid-size')).toContainText('64');
    await page.keyboard.press('BracketLeft');
    await expect(page.locator('#grid-size')).toContainText('32');

    const start = await topWorldPoint(page, 269, 275);
    const end = await topWorldPoint(page, 371, 389);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();

    const created = brushesInDocument(await readEditorDocument(page)).at(-1)!;
    const bounds = deriveBrush(created).bounds!;
    expect([...bounds.min, ...bounds.max].every((value) => value % 32 === 0)).toBe(true);
  });

  test('snaps selected brush vertices to the active grid and undoes the edit', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(offGridBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await page.locator('.source-canvas').nth(1).focus();
    await page.keyboard.press('Digit4');
    await expect(page.locator('#grid-size')).toContainText('8');
    const brushPoint = await topWorldPoint(page, 15, 17);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.getByRole('button', { name: 'Snap to grid', exact: true }).click();

    let brush = brushesInDocument(await readEditorDocument(page))[0]!;
    expect(brushVertices(brush).every((point) => point.every((value) => value % 8 === 0))).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    brush = brushesInDocument(await readEditorDocument(page))[0]!;
    expect(deriveBrush(brush).bounds).toEqual({ min: [3, 5, 7], max: [27, 29, 31] });
  });

  test('Simple Shape 3D drawing supports square, cube, and height-only modifiers', async ({
    page,
  }) => {
    await openEditor(page);
    const start = await perspectiveWorldPoint(page, [-64, -64, 0]);
    const end = await perspectiveWorldPoint(page, [64, 32, 0]);
    await page.keyboard.down('Shift');
    await page.keyboard.down('Alt');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('(cube)');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Shift');

    let created = brushesInDocument(await readEditorDocument(page)).at(-1)!;
    let bounds = deriveBrush(created).bounds!;
    const spans = bounds.max.map((component, axis) => component - bounds.min[axis]!);
    expect(spans[0]).toBeCloseTo(spans[1]!);
    expect(spans[1]).toBeCloseTo(spans[2]!);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();

    const topStart = await topWorldPoint(page, -96, -32);
    const topEnd = await topWorldPoint(page, -32, 64);
    await page.keyboard.down('Shift');
    await page.mouse.move(topStart.x, topStart.y);
    await page.mouse.down();
    await page.mouse.move(topEnd.x, topEnd.y, { steps: 8 });
    await expect(page.locator('#status-message')).toContainText('(square)');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    created = brushesInDocument(await readEditorDocument(page)).at(-1)!;
    bounds = deriveBrush(created).bounds!;
    expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(bounds.max[1] - bounds.min[1]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await page.keyboard.down('Alt');
    await page.mouse.move(end.x, end.y - 96, { steps: 8 });
    await expect(page.locator('#status-message')).toContainText('(height)');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    created = brushesInDocument(await readEditorDocument(page)).at(-1)!;
    bounds = deriveBrush(created).bounds!;
    expect(bounds.max[2] - bounds.min[2]).toBeGreaterThan(16);
    expect(deriveBrush(created).valid).toBe(true);
  });

  test('runs convex merge and empty intersection from the contextual CSG controls', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(adjacentBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const left = await topWorldPoint(page, -16, 0);
    const right = await topWorldPoint(page, 16, 0);
    await page.mouse.click(left.x, left.y);
    await page.keyboard.down('Control');
    await page.mouse.click(right.x, right.y);
    await page.keyboard.up('Control');

    await expect(page.locator('#csg-section')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Convex merge' })).toBeEnabled();
    await page.getByRole('button', { name: 'Convex merge' }).click();
    await expect(page.locator('#brush-count')).toHaveText('1');
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 0 to 32 32 32');
    await expect(page.locator('#status-message')).toContainText('CSG merge');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('2');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await page.getByRole('button', { name: 'Intersect', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('0');
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('2');
  });

  test('subtracts the selected cutter and hollows with current grid thickness', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(subtractionBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const center = await topWorldPoint(page, 0, 0);
    await page.mouse.click(center.x, center.y);
    await page.getByRole('button', { name: 'Subtract', exact: true }).click();

    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('4 Brushes');
    await expect(page.locator('#status-message')).toContainText('CSG subtract');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('2');

    await chooseSelectOption(page, 'Grid size', '8');
    await page.mouse.click(center.x, center.y);
    await page.getByRole('button', { name: 'Hollow', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('7');
    await expect(page.locator('#selection-kind')).toHaveText('6 Brushes');
    await expect(page.locator('#status-message')).toContainText('8-unit walls');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('2');
  });
});
