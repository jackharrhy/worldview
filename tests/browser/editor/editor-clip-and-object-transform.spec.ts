import { expect, test } from '@playwright/test';

import { entityLinkSource } from './support/editor-fixtures.js';
import {
  openEditor,
  installSiteToolRegistry,
  executeSiteTool,
  perspectivePoint,
  perspectiveWorldPoint,
  topWorldPoint,
  chooseSelectOption,
} from './support/editor-browser-helpers.js';

test.describe('Editor clip and object transforms', () => {
  test('Clip tool previews and commits a two-point split as one undoable edit', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');

    await page.getByRole('button', { name: 'Clip' }).click();
    await expect(page.locator('#clip-tool-section')).toBeVisible();
    const first = await perspectiveWorldPoint(page, [96, -16, 64]);
    const second = await perspectiveWorldPoint(page, [0, -128, -16]);
    await page.mouse.click(first.x, first.y);
    await expect(page.locator('#clip-point-count')).toHaveText('1 / 3 points');
    await page.mouse.click(second.x, second.y);
    await expect(page.locator('#clip-point-count')).toHaveText('2 / 3 points');
    await expect(page.locator('#status-message')).toContainText('Clip preview ready');
    await expect(page.locator('#clip-point-positions')).toHaveText('1: 96 -16 64 · 2: 0 -128 -16');

    const firstInTop = await topWorldPoint(page, 96, -16);
    const partialMove = await topWorldPoint(page, 64, 0);
    const movedFirst = await topWorldPoint(page, 32, 16);
    await page.mouse.move(firstInTop.x, firstInTop.y);
    await page.mouse.down();
    await page.mouse.move(partialMove.x, partialMove.y, { steps: 5 });
    await page.keyboard.down('Shift');
    await page.mouse.move(movedFirst.x, movedFirst.y, { steps: 5 });
    await expect(page.locator('#status-message')).toContainText('Clip point 1 preview · X locked');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#status-message')).toContainText('Moved clip point 1 · X locked');
    await expect(page.locator('#clip-point-count')).toHaveText('2 / 3 points');
    await expect(page.locator('#clip-point-positions')).toHaveText('1: 32 -16 64 · 2: 0 -128 -16');

    await page.getByRole('button', { name: 'Split' }).click();
    await expect(page.locator('#status-message')).toContainText('Split preview ready');
    await page.getByRole('button', { name: 'Apply clip' }).click();
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#status-message')).toContainText('Split brush');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
  });

  test('Clip tool applies one plane to an object selection set atomically', async ({ page }) => {
    await openEditor(page);
    const left = await topWorldPoint(page, -64, 0);
    const right = await topWorldPoint(page, 64, 0);
    await page.mouse.click(left.x, left.y);
    await page.keyboard.down('Control');
    await page.mouse.click(right.x, right.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');

    await page.getByRole('button', { name: 'Clip' }).click();
    await expect(page.locator('#clip-tool-section')).toBeVisible();
    const first = await topWorldPoint(page, -128, 0);
    const second = await topWorldPoint(page, 128, 0);
    await page.mouse.click(first.x, first.y);
    await page.mouse.click(second.x, second.y);
    await expect(page.locator('#clip-point-count')).toHaveText('2 / 3 points');
    await page.getByRole('button', { name: 'Split' }).click();
    await expect(page.locator('#status-message')).toContainText('Split preview ready');

    await page.getByRole('button', { name: 'Apply clip' }).click();
    await expect(page.locator('#brush-count')).toHaveText('5');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#status-message')).toContainText('Split brushes');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
  });

  test('resolves entity links and switches all four TrenchBroom visibility modes', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(entityLinkSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await page.getByRole('tab', { name: 'Map', exact: true }).click();

    await expect(page.locator('#entity-link-count')).toHaveText('0 / 4 shown');
    await chooseSelectOption(page, 'Visibility', 'All');
    await expect(page.locator('#entity-link-count')).toHaveText('4 / 4 shown');
    await expect(page.locator('#status-message')).toContainText('Entity links: All');
    await chooseSelectOption(page, 'Visibility', 'None');
    await expect(page.locator('#entity-link-count')).toHaveText('0 / 4 shown');

    await chooseSelectOption(page, 'Visibility', 'Direct selected');
    const trigger = await topWorldPoint(page, -96, 0);
    await page.mouse.click(trigger.x, trigger.y);
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
    await expect(page.locator('#entity-link-count')).toHaveText('2 / 4 shown');
    await chooseSelectOption(page, 'Visibility', 'Transitive selected');
    await expect(page.locator('#entity-link-count')).toHaveText('4 / 4 shown');
    await expect(page.locator('#document-revision')).toHaveText('0');
  });

  test('Perspective clip-point dragging stays glued to the snapped brush surface', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Clip' }).click();
    const first = await perspectiveWorldPoint(page, [0, 0, 0]);
    const second = await topWorldPoint(page, 0, -128);
    await page.mouse.click(first.x, first.y);
    await page.mouse.click(second.x, second.y);
    await expect(page.locator('#clip-point-positions')).toHaveText('1: 0 0 0 · 2: 0 -128 -16');

    const target = await perspectiveWorldPoint(page, [64, -128, -16]);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(target.x, target.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('Clip point 1 preview');
    await expect(page.locator('#status-message')).not.toContainText('locked');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#status-message')).toContainText('Moved clip point 1');

    const movedPositions = await page.locator('#clip-point-positions').textContent();
    const movedPoint = movedPositions?.match(/^1: (-?\d+) (-?\d+) (-?\d+)/);
    expect(movedPoint).not.toBeNull();
    expect(Number(movedPoint?.[1])).toBe(64);
    expect(Number(movedPoint?.[2])).toBe(-128);
    expect(Number(movedPoint?.[3])).toBe(-16);
  });

  test('Ctrl-click builds an object set for atomic movement, transforms, duplicate, and delete', async ({
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
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -32 0 to 96 32 160');
    await page.getByRole('button', { name: 'Nudge Y positive' }).click();
    await expect(page.locator('#status-message')).toContainText('Move brushes');
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -16 0 to 96 48 160');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -32 0 to 96 32 160');

    await page.getByRole('button', { name: 'Rotate' }).click();
    await expect(page.locator('#transform-tool-title')).toHaveText('Rotate brushes');
    await page.locator('#rotate-angle').fill('90');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Rotate brushes');
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -96 0 to 32 96 160');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -32 0 to 96 32 160');

    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.locator('#brush-count')).toHaveText('5');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#status-message')).toContainText('Duplicate brushes');
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await expect(page.locator('#status-message')).toContainText('Delete brushes');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('5');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
  });

  test('brush dragging uses XY, live Shift axis locking, and Alt vertical movement', async ({
    page,
  }) => {
    await installSiteToolRegistry(page);
    await openEditor(page);
    const inspection = await executeSiteTool(page, 'worldview_inspect_editor');
    const listed = await executeSiteTool(page, 'worldview_list_objects', {
      kind: 'brush',
      limit: 1,
    });
    const brush = (listed.objects as readonly { readonly id: string }[])[0]!;
    await executeSiteTool(page, 'worldview_select', {
      expectedDocumentId: inspection.documentId,
      expectedRevision: inspection.revision,
      mode: 'objects',
      brushIds: [brush.id],
      entityIds: [],
    });
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    const originalBounds = '-128 -128 -32 to 128 128 0';

    const start = await topWorldPoint(page, 0, 0);
    const partial = await topWorldPoint(page, 32, 16);
    const end = await topWorldPoint(page, 64, 32);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(partial.x, partial.y, { steps: 5 });
    await page.keyboard.down('Shift');
    await page.mouse.move(end.x, end.y, { steps: 5 });
    await expect(page.locator('#status-message')).toContainText('X locked');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#brush-bounds')).toHaveText('-64 -128 -32 to 192 128 0');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);

    const verticalStart = await perspectiveWorldPoint(page, [0, 0, -16]);
    const verticalEnd = await perspectiveWorldPoint(page, [0, 0, 48]);
    await page.mouse.move(verticalStart.x, verticalStart.y);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(verticalEnd.x, verticalEnd.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('vertical Z');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 32 to 128 128 64');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
  });
});
