import { expect, test } from '@playwright/test';
import {
  brushesInDocument,
  deriveBrush,
} from '../../../packages/worldview-editor/src/core/index.js';
import { adjacentBrushSource } from './support/editor-fixtures.js';
import {
  openEditor,
  readEditorDocument,
  perspectivePoint,
  perspectiveWorldPoint,
  topWorldPoint,
  frontWorldPoint,
} from './support/editor-browser-helpers.js';

test.describe('Editor face geometry tools', () => {
  test('Face tool drags a plane along its normal as one undoable extrusion', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const start = await perspectivePoint(page, 0.5, 0.58);
    const end = await perspectivePoint(page, 0.5, 0.38);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#brush-bounds')).not.toHaveText('-128 -128 -32 to 128 128 0');
    await expect(page.locator('#status-message')).toContainText('Extrude face');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 128 0');
  });

  test('Alt-drag moves face vertices on perspective and orthographic viewport planes', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const perspectiveStart = await perspectivePoint(page, 0.5, 0.58);
    const perspectiveEnd = await perspectivePoint(page, 0.58, 0.48);

    await page.keyboard.down('Alt');
    await page.mouse.move(perspectiveStart.x, perspectiveStart.y);
    await page.mouse.down();
    await page.mouse.move(perspectiveEnd.x, perspectiveEnd.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');

    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Move face');
    await expect(page.locator('#brush-bounds')).not.toHaveText('-128 -128 -32 to 128 128 0');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 128 0');

    const topStart = await topWorldPoint(page, -64, 0);
    const topEnd = await topWorldPoint(page, -32, 32);
    await page.keyboard.down('Alt');
    await page.mouse.move(topStart.x, topStart.y);
    await page.mouse.down();
    await page.mouse.move(topEnd.x, topEnd.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');

    await expect(page.locator('#document-revision')).toHaveText('3');
    await expect(page.locator('#status-message')).toContainText('Move face');
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -32 0 to 0 64 96');
  });

  test('Face handles accept viewport-aware keyboard nudges and staged Escape cancellation', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const face = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(face.x, face.y);
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    const topPointer = await topWorldPoint(page, 0, 0);
    await page.mouse.move(topPointer.x, topPointer.y);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#status-message')).toContainText('Nudge face');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 144 128 0');
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await expect(page.locator('#face-material')).toHaveText('DEV_FLOOR');

    const frontPointer = await frontWorldPoint(page, 0, 48);
    await page.mouse.move(frontPointer.x, frontPointer.y);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 144 128 16');
    await expect(page.locator('#document-revision')).toHaveText('2');
    await expect(page.locator('#geometry-state')).toHaveText('valid');

    await page.keyboard.press('Escape');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.getByRole('button', { name: 'Face', exact: true })).toHaveAttribute(
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

  test('Ctrl+Alt-drag stamps an independent face prism and the inspector repeats it exactly', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const start = await perspectiveWorldPoint(page, [0, 0, 0]);
    const end = await perspectiveWorldPoint(page, [0, 0, 96]);
    await page.mouse.click(start.x, start.y);
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');

    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Stamp face');
    const stampedDocument = await readEditorDocument(page);
    const stampedBounds = brushesInDocument(stampedDocument).map(
      (brush) => deriveBrush(brush).bounds,
    );
    expect(stampedBounds).toContainEqual({ min: [-128, -128, -32], max: [128, 128, 0] });
    expect(
      stampedBounds.some(
        (bounds) =>
          bounds?.min[0] === -128 &&
          bounds.min[1] === -128 &&
          bounds.min[2] === 0 &&
          bounds.max[0] === 128 &&
          bounds.max[1] === 128 &&
          bounds.max[2] > 0,
      ),
    ).toBe(true);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await page.locator('#face-extrude-distance').fill('16');
    await page.getByRole('button', { name: 'Stamp', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#document-revision')).toHaveText('3');
    await expect(page.locator('#status-message')).toContainText('Stamp face');
  });

  for (const cancellation of ['lostpointercapture', 'pointercancel']) {
    test(`${cancellation} cancels a face preview and leaves the next drag usable`, async ({
      page,
    }) => {
      await openEditor(page);
      const start = await perspectiveWorldPoint(page, [0, 0, 0]);
      const end = await perspectiveWorldPoint(page, [0, 0, 96]);
      await page.mouse.click(start.x, start.y);
      const viewportCanvas = page.locator('[data-viewport="perspective"] .source-canvas');
      await viewportCanvas.evaluate((canvas) => {
        canvas.addEventListener(
          'pointerdown',
          (event) => {
            if (event instanceof PointerEvent)
              canvas.dataset.testPointerId = String(event.pointerId);
          },
          { once: true },
        );
      });
      await page.keyboard.down('Shift');
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 4 });
      await expect(viewportCanvas).toHaveAttribute('data-viewport-interaction', 'extruding');
      // Events from another pointer must not commit or cancel the current preview.
      await viewportCanvas.evaluate((canvas) => {
        for (const type of ['pointerup', 'pointercancel']) {
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: Number(canvas.dataset.testPointerId) + 1,
            }),
          );
        }
      });
      await expect(viewportCanvas).toHaveAttribute('data-viewport-interaction', 'extruding');
      await expect(page.locator('#document-revision')).toHaveText('0');
      await viewportCanvas.evaluate((canvas, type) => {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: Number(canvas.dataset.testPointerId),
          }),
        );
      }, cancellation);
      await expect(viewportCanvas).not.toHaveAttribute('data-viewport-interaction');
      await page.mouse.up();
      await page.keyboard.up('Shift');

      await expect(page.locator('#document-revision')).toHaveText('0');
      await page.keyboard.down('Shift');
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 4 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
      await expect(page.locator('#document-revision')).toHaveText('1');
    });
  }

  test('Ctrl-drag split-extrudes a face into two undoable brushes', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const start = await perspectivePoint(page, 0.5, 0.58);
    const end = await perspectivePoint(page, 0.5, 0.38);

    await page.keyboard.down('Control');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Control');

    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Split-extrude face');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(page.locator('#document-revision')).toHaveText('2');

    await page.mouse.click(start.x, start.y);
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await page.locator('#face-extrude-distance').fill('-16');
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#document-revision')).toHaveText('3');
    await expect(page.locator('#status-message')).toContainText('Split-extrude face');
  });

  test('Face tool extrudes an opposing shared boundary across adjacent brushes', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(adjacentBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('2');

    const leftCenter = await topWorldPoint(page, -16, 0);
    const rightCenter = await topWorldPoint(page, 16, 0);
    await page.mouse.click(leftCenter.x, leftCenter.y);
    await page.keyboard.down('Control');
    await page.mouse.click(rightCenter.x, rightCenter.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');

    await page.getByRole('button', { name: 'Face' }).click();
    const sharedFace = await topWorldPoint(page, 0, 0);
    const movedFace = await topWorldPoint(page, 16, 0);
    await page.mouse.move(sharedFace.x, sharedFace.y);
    await page.mouse.down();
    await page.mouse.move(movedFace.x, movedFace.y, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('#selection-kind')).toHaveText('2 Faces');
    await expect(page.locator('#face-extrude-section')).toBeVisible();
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 0 to 16 32 32');
    await expect(page.locator('#status-message')).toContainText('Extrude shared faces');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 0 to 0 32 32');
    await expect(page.locator('#document-revision')).toHaveText('2');
  });

  test('Face tool toggles faces and double-click selects every face on a brush', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const point = await perspectivePoint(page, 0.5, 0.58);

    await page.mouse.click(point.x, point.y);
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('None');

    await page.mouse.dblclick(point.x, point.y);
    await expect(page.locator('#selection-kind')).toHaveText('6 Faces');
    await expect(page.locator('#face-extrude-section')).toBeHidden();
    await expect(page.locator('[data-action="duplicate"]')).toBeDisabled();
    await expect(page.locator('[data-action="delete"]')).toBeDisabled();

    await page.getByRole('tab', { name: 'Face' }).click();
    await page.locator('#material-name').fill('FACE_SET');
    await page.locator('[data-action="apply-material"]').click();
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#face-material')).toHaveText('FACE_SET');
    await expect(page.locator('#status-message')).toContainText('Apply material');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#face-material')).toHaveText('DEV_FLOOR');

    const empty = await perspectivePoint(page, 0.05, 0.05);
    await page.mouse.click(empty.x, empty.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await page.keyboard.down('Alt');
    await page.mouse.dblclick(point.x, point.y);
    await page.keyboard.up('Alt');
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await expect(page.locator('#status-message')).toContainText('Select coplanar faces');
  });
});
