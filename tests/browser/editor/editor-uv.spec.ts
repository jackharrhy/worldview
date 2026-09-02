import { expect, test } from '@playwright/test';
import { brushesInDocument } from '../../../packages/worldview-editor/src/core/index.js';
import { mixedProjectionBrushSource } from './support/editor-fixtures.js';
import {
  openEditor,
  readEditorDocument,
  perspectivePoint,
  topWorldPoint,
} from './support/editor-browser-helpers.js';

test.describe('Editor texture alignment and UV tools', () => {
  test('texture alignment controls edit faces and whole object selections reversibly', async ({
    page,
  }) => {
    await openEditor(page);
    const point = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Shift');
    await page.getByRole('tab', { name: 'Face' }).click();

    await page.getByRole('button', { name: 'Flip horizontally' }).click();
    await expect(page.locator('#texture-scale-u')).toHaveValue('-1');
    await expect(page.locator('#status-message')).toContainText('Flip texture horizontally');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#texture-scale-u')).toHaveValue('1');

    await page.locator('[data-texture-operation="rotate-ccw"]').click();
    await expect(page.locator('#texture-rotation')).toHaveValue('90');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#texture-rotation')).toHaveValue('0');

    await page.locator('[data-texture-operation="auto-fit"]').click();
    await expect(page.locator('#texture-scale-u')).toHaveValue('4');
    await expect(page.locator('#texture-scale-v')).toHaveValue('4');
    await expect(page.locator('#texture-shift-u')).toHaveValue('32');
    await expect(page.locator('#texture-shift-v')).toHaveValue('32');
    await page.getByRole('button', { name: 'Undo' }).click();

    await page.locator('[data-texture-operation="justify-u-min"]').click();
    await expect(page.locator('#texture-shift-u')).toHaveValue('128');
    await expect(page.locator('#status-message')).toContainText('Justify texture left');
    await page.getByRole('button', { name: 'Undo' }).click();

    await page.locator('[data-texture-operation="fit-u"]').click();
    await expect(page.locator('#texture-scale-u')).toHaveValue('0.8');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.locator('[data-texture-operation="fit-u"]').click({ modifiers: ['Meta'] });
    await expect(page.locator('#texture-scale-u')).toHaveValue('4');
    await page.locator('[data-texture-operation="fit-u"]').click({ modifiers: ['Meta'] });
    await expect(page.locator('#texture-scale-u')).toHaveValue('8');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();

    await page.locator('[data-texture-operation="align-edge"]').click();
    expect(Number(await page.locator('#texture-rotation').inputValue())).not.toBeCloseTo(0);
    await page.locator('[data-texture-operation="align-edge"]').click({ modifiers: ['Shift'] });
    expect(Number(await page.locator('#texture-rotation').inputValue())).toBeCloseTo(0);

    await page.mouse.click(point.x, point.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.locator('[data-texture-operation="auto-fit"]').click();
    let document = await readEditorDocument(page);
    expect(
      brushesInDocument(document)[0]!.faces.every((face) =>
        face.projection.scale.every((component) => component !== 1),
      ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Flip vertically' }).click();
    document = await readEditorDocument(page);
    expect(
      brushesInDocument(document)[0]!.faces.every((face) => face.projection.scale[1] === -1),
    ).toBe(true);
    await page.getByRole('button', { name: 'Undo' }).click();
  });

  test('mixed face projection fields batch one attribute without flattening the selection', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(mixedProjectionBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await page.getByRole('button', { name: 'Face', exact: true }).click();
    const left = await topWorldPoint(page, -28, 0);
    const right = await topWorldPoint(page, 28, 0);
    await page.mouse.click(left.x, left.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(right.x, right.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('2 Faces');
    await page.getByRole('tab', { name: 'Face', exact: true }).click();

    const offset = page.locator('#texture-shift-u');
    await expect(offset).toHaveAttribute('placeholder', 'Mixed');
    await offset.fill('12');
    await offset.press('Enter');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(offset).toHaveValue('12');
    let document = await readEditorDocument(page);
    expect(
      brushesInDocument(document)
        .flatMap((brush) => brush.faces)
        .filter((face) => face.projection.offset[0] === 12),
    ).toHaveLength(2);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    document = await readEditorDocument(page);
    expect(
      brushesInDocument(document)
        .flatMap((brush) => brush.faces)
        .filter((face) => face.projection.offset[0] === 12),
    ).toHaveLength(0);
    await expect(offset).toHaveAttribute('placeholder', 'Mixed');
  });

  test('graphical UV editor pans, rotates, and scales the selected face with live history', async ({
    page,
  }) => {
    await openEditor(page);
    const face = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(face.x, face.y);
    await page.keyboard.up('Shift');
    await page.getByRole('tab', { name: 'Face', exact: true }).click();

    const editor = page.locator('#uv-editor');
    await expect(editor).toBeVisible();
    await expect(page.locator('#uv-editor-status')).toContainText('DEV_FLOOR · 64×64 · 1 face');
    const bounds = await editor.boundingBox();
    if (!bounds) throw new Error('The UV editor has no bounds');
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const xScale = bounds.width / 320;
    const yScale = bounds.height / 220;

    await page.mouse.move(center.x - 30, center.y - 20);
    await page.mouse.down();
    await page.mouse.move(center.x + 10, center.y - 20, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Pan texture');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#texture-shift-u')).not.toHaveValue('0');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#texture-shift-u')).toHaveValue('0');

    await page.mouse.move(center.x + 72 * xScale, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x, center.y - 72 * yScale, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Rotate texture');
    await expect(page.locator('#texture-rotation')).not.toHaveValue('0');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#texture-rotation')).toHaveValue('0');

    await page.mouse.move(center.x + 52 * xScale, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 82 * xScale, center.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Scale texture');
    await expect(page.locator('#texture-scale-u')).not.toHaveValue('1');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
  });

  test('missing face materials keep an editable, explicit UV fallback', async ({ page }) => {
    await openEditor(page);
    const face = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(face.x, face.y);
    await page.keyboard.up('Shift');
    await page.getByRole('tab', { name: 'Face', exact: true }).click();
    await page.locator('#material-name').fill('NOT_LOADED');
    await page.locator('[data-action="apply-material"]').click();

    await expect(page.locator('#material-coverage')).toContainText('NOT_LOADED');
    await expect(page.locator('.face-summary strong')).toHaveText('NOT_LOADED');
    await expect(page.locator('#uv-material-pattern image')).toHaveCount(0);
    await expect(page.locator('#uv-material-pattern path')).toHaveCount(1);
    await expect(page.locator('#texture-shift-u')).toBeEnabled();
  });

  test('UV camera, tiled material, and grid remain view state while projection previews stay narrow', async ({
    page,
  }) => {
    await openEditor(page);
    const face = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(face.x, face.y);
    await page.keyboard.up('Shift');
    await page.getByRole('tab', { name: 'Face', exact: true }).click();

    const editor = page.locator('#uv-editor');
    const bounds = await editor.boundingBox();
    if (!bounds) throw new Error('The UV editor has no bounds');
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const pattern = editor.locator('#uv-material-pattern');
    await expect(pattern.locator('image')).toHaveCount(1);
    await expect(editor.locator('.uv-background')).toHaveAttribute(
      'fill',
      'url(#uv-material-pattern)',
    );
    const originalPatternX = await pattern.getAttribute('x');
    const originalPatternWidth = await pattern.getAttribute('width');

    await page.mouse.move(center.x - 70, center.y - 50);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(center.x - 25, center.y - 20, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await expect(page.locator('#document-revision')).toHaveText('0');
    expect(await pattern.getAttribute('x')).not.toBe(originalPatternX);

    await page.mouse.move(center.x + 30, center.y + 15);
    await page.mouse.wheel(0, -240);
    await expect(page.locator('#document-revision')).toHaveText('0');
    const zoomedPatternX = await pattern.getAttribute('x');
    const zoomedPatternWidth = await pattern.getAttribute('width');
    expect(zoomedPatternWidth).not.toBe(originalPatternWidth);

    const lineCount = await editor.locator('.uv-grid line').count();
    const gridX = page.locator('#uv-grid-x');
    await gridX.fill('4');
    await gridX.press('Enter');
    expect(await editor.locator('.uv-grid line').count()).toBeGreaterThan(lineCount);
    await expect(page.locator('#document-revision')).toHaveText('0');

    await page.locator('#texture-shift-u').fill('16');
    await page.locator('#texture-shift-u').press('Enter');
    await expect(page.locator('#document-revision')).toHaveText('1');
    expect(await pattern.getAttribute('x')).toBe(zoomedPatternX);
    expect(await pattern.getAttribute('width')).toBe(zoomedPatternWidth);

    await page.evaluate(() => performance.clearMeasures());
    await page.mouse.move(center.x - 25, center.y - 15);
    await page.mouse.down();
    await page.mouse.move(center.x + 45, center.y - 15, { steps: 24 });
    await page.waitForTimeout(32);
    expect(
      await page.evaluate(
        () => performance.getEntriesByName('worldview.editor.material-catalog').length,
      ),
    ).toBe(0);
    await page.mouse.up();
    await expect(page.locator('#document-revision')).toHaveText('2');

    await page.getByRole('button', { name: 'Frame selected face', exact: true }).click();
    await expect(page.locator('#document-revision')).toHaveText('2');
  });

  test('face and material splitter is keyboard operable and persists its local layout', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Face', exact: true }).click();
    const separator = page.getByRole('separator', {
      name: 'Resize face attributes and material browser',
    });
    const initial = Number(await separator.getAttribute('aria-valuenow'));
    await separator.focus();
    await page.keyboard.press('ArrowUp');
    await expect(separator).toHaveAttribute('aria-valuenow', String(initial - 16));
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('worldview.face-inspector.upper-height')),
      )
      .toBe(String(initial - 16));

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
    await page.getByRole('tab', { name: 'Face', exact: true }).click();
    await expect(
      page.getByRole('separator', { name: 'Resize face attributes and material browser' }),
    ).toHaveAttribute('aria-valuenow', String(initial - 16));

    await page.setViewportSize({ width: 1024, height: 650 });
    const compactSeparator = page.getByRole('separator', {
      name: 'Resize face attributes and material browser',
    });
    await expect
      .poll(async () => Number(await compactSeparator.getAttribute('aria-valuenow')))
      .toBeLessThan(initial - 16);
    await expect(page.locator('.material-browser-controls')).toBeInViewport();
  });

  test('UV editor pivot snaps without dirtying the map and Escape cancels a live preview', async ({
    page,
  }) => {
    await openEditor(page);
    const face = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(face.x, face.y);
    await page.keyboard.up('Shift');
    await page.getByRole('tab', { name: 'Face', exact: true }).click();
    const editor = page.locator('#uv-editor');
    const bounds = await editor.boundingBox();
    if (!bounds) throw new Error('The UV editor has no bounds');
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + (66 / 320) * bounds.width,
      bounds.y + (16 / 220) * bounds.height,
      { steps: 10 },
    );
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('UV transform origin moved');
    await expect(page.locator('#document-revision')).toHaveText('0');
    await page.getByRole('button', { name: 'Reset UV origin', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText('origin reset');

    await page.mouse.move(center.x - 30, center.y - 20);
    await page.mouse.down();
    await page.mouse.move(center.x + 15, center.y - 20, { steps: 8 });
    await expect(page.locator('#texture-shift-u')).not.toHaveValue('0');
    await page.mouse.move(center.x - 30, center.y - 20, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#texture-shift-u')).toHaveValue('0');
    await expect(page.locator('#document-revision')).toHaveText('0');

    await page.mouse.move(center.x - 30, center.y - 20);
    await page.mouse.down();
    await page.mouse.move(center.x + 15, center.y - 20, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('Pan texture preview');
    await expect(page.locator('#texture-shift-u')).not.toHaveValue('0');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('UV transform cancelled');
    await expect(page.locator('#texture-shift-u')).toHaveValue('0');
    await expect(page.locator('#document-revision')).toHaveText('0');
  });
});
