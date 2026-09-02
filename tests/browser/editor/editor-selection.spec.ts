import { expect, test } from '@playwright/test';
import {
  brushesInDocument,
  deriveBrush,
  findBrush,
  deriveEditorGroups,
  deriveEditorLayers,
  serializeMap,
} from '../../../packages/worldview-editor/src/core/index.js';
import {
  adjacentBrushSource,
  selectionPaintSource,
  selectionBrushSource,
  regularGroupSource,
  issueBrowserSource,
  viewFilterSource,
  orthographicPickPrioritySource,
} from './support/editor-fixtures.js';
import {
  openEditor,
  openToolbarMenu,
  readEditorDocument,
  viewportPoint,
  topWorldPoint,
  setCheckbox,
} from './support/editor-browser-helpers.js';

test.describe('Editor selection and organization', () => {
  test('orthographic views prefer the smallest visible face over the frontmost brush', async ({
    page,
  }) => {
    await openEditor(page, { empty: true });
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(orthographicPickPrioritySource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('2');

    const overlaps = [
      await viewportPoint(page, 1, 0.5, 0.5),
      await viewportPoint(page, 2, 0.5, 0.5625),
      await viewportPoint(page, 3, 0.5, 0.5625),
    ];
    for (const overlap of overlaps) {
      await page.mouse.click(overlap.x, overlap.y);
      await expect(page.locator('#selection-kind')).toHaveText('Brush');
      await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 0 to 32 32 16');
      await page.keyboard.press('Escape');
    }
  });

  test('browses live issues, locates objects, filters findings, and quick-fixes with undo', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(issueBrowserSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();

    const issueStatus = page.locator('#issue-status');
    await expect(issueStatus).toHaveText('Issues 3');
    await expect(issueStatus).toHaveAttribute('data-state', 'error');
    await issueStatus.click();
    await expect(page.locator('#issue-browser')).toBeVisible();
    await expect(page.locator('#issue-summary')).toHaveText('2 errors · 1 warning');

    const invalid = page.locator('[data-issue-type="invalid-brush"]');
    await expect(invalid).toHaveCount(1);
    await invalid.locator('.issue-description').click();
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await invalid.locator('.issue-fix').click();
    await expect(page.locator('[data-issue-type="invalid-brush"]')).toHaveCount(0);
    await expect(page.locator('#document-revision')).toHaveText('1');
    const undo = page.getByRole('button', { name: 'Undo' });
    await undo.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Undo Delete invalid brush');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('[data-issue-type="invalid-brush"]')).toHaveCount(1);

    const invalidOrigin = page.locator('[data-issue-type="invalid-origin"]');
    await invalidOrigin.locator('.issue-description').click();
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
    await invalidOrigin.locator('.issue-fix').click();
    await expect(page.locator('[data-issue-type="invalid-origin"]')).toHaveCount(0);

    const unresolved = page.locator('[data-issue-type="unresolved-target"]');
    await unresolved.getByRole('button', { name: 'Hide', exact: true }).click();
    await expect(page.locator('[data-issue-type="unresolved-target"]')).toHaveCount(0);
    await setCheckbox(page, 'Show hidden', true);
    await expect(page.locator('[data-issue-type="unresolved-target"]')).toHaveClass(/hidden-issue/);
    await page
      .locator('[data-issue-type="unresolved-target"]')
      .getByRole('button', { name: 'Show', exact: true })
      .click();

    await page.getByText('Filter types', { exact: true }).click();
    await setCheckbox(page, 'Empty brush entities', false);
    await expect(page.locator('[data-issue-type="empty-brush-entity"]')).toHaveCount(0);
  });

  test('filters entity definitions and special brushes without changing map source or history', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(viewFilterSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const sourceBefore = serializeMap(await readEditorDocument(page));

    const viewButton = page.locator('[data-action="toggle-view-filters"]');
    await viewButton.click();
    await expect(page.locator('#view-filter-popover')).toBeVisible();
    await expect(page.locator('#entity-class-filter-summary')).toHaveText('5 classes');
    await expect(page.locator('#entity-class-filter-list').getByRole('checkbox')).toHaveCount(5);

    await setCheckbox(page, /^light\b/, false);
    await expect(page.locator('#view-filter-count')).toHaveText('1');
    await expect(page.locator('#hidden-object-count')).toHaveText('1');
    await setCheckbox(page, /^Trigger brushes\b/, false);
    await expect(page.locator('#view-filter-count')).toHaveText('2');
    await setCheckbox(page, /^World brushes\b/, false);
    await expect(page.locator('#view-filter-count')).toHaveText('3');
    await expect(page.locator('#view-filter-status')).toHaveText(
      '3 objects filtered · map source unchanged',
    );
    await expect(page.locator('#document-revision')).toHaveText('0');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('3 Objects');
    expect(serializeMap(await readEditorDocument(page))).toBe(sourceBefore);

    await viewButton.click();
    await page.getByRole('searchbox', { name: 'Filter entity classnames' }).fill('monster');
    await expect(page.locator('#entity-class-filter-list').getByRole('checkbox')).toHaveCount(1);
    await expect(page.getByRole('checkbox', { name: /^monster_army\b/ })).toBeVisible();
    await page
      .locator('#view-filter-popover')
      .getByRole('button', { name: 'All', exact: true })
      .click();
    await setCheckbox(page, /^World brushes\b/, true);
    await setCheckbox(page, /^Trigger brushes\b/, true);
    await expect(page.locator('#view-filter-count')).toBeHidden();
    await expect(page.locator('#hidden-object-count')).toHaveText('0');
  });

  test('repeats a duplicate, move, and rotate sequence as one editor transaction', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(adjacentBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const repeatButton = page.locator('[data-action="repeat-commands"]');
    await expect(repeatButton).toBeDisabled();

    const left = await topWorldPoint(page, -16, 0);
    await page.mouse.click(left.x, left.y);
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(repeatButton).toHaveAttribute('aria-label', 'Repeat 1');
    await page.getByRole('button', { name: 'Nudge Z positive' }).click();
    await expect(repeatButton).toHaveAttribute('aria-label', 'Repeat 2');

    await page.getByRole('button', { name: 'Rotate', exact: true }).click();
    await page.locator('#transform-pivot-x').fill('0');
    await page.locator('#transform-pivot-y').fill('0');
    await page.locator('#transform-pivot-z').fill('0');
    await page.locator('#rotate-angle').fill('90');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(repeatButton).toHaveAttribute('aria-label', 'Repeat 3');
    await repeatButton.hover();
    await expect(page.getByRole('tooltip')).toHaveText(
      'Repeat Duplicate → Move → Rotate (Ctrl/Command+Shift+R)',
    );
    await openToolbarMenu(page, 'More edit actions');
    await expect(page.getByRole('menuitem', { name: 'Clear repeat', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+Shift+R');
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#document-revision')).toHaveText('4');
    await expect(page.locator('#status-message')).toContainText('Repeat 3 commands');
    await expect(repeatButton).toHaveAttribute('aria-label', 'Repeat 3');
    const document = await readEditorDocument(page);
    expect(
      brushesInDocument(document).some((brush) => {
        const bounds = deriveBrush(brush).bounds;
        return (
          bounds?.min[0] === -32 &&
          bounds.min[1] === -32 &&
          bounds.min[2] === 32 &&
          bounds.max[0] === 0 &&
          bounds.max[1] === 32 &&
          bounds.max[2] === 64
        );
      }),
    ).toBe(true);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(repeatButton).toHaveAttribute('aria-label', 'Repeat');
    await expect(repeatButton).toBeDisabled();
  });

  test('manages active TrenchBroom layers, visibility, locking, ordering, and removal', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(adjacentBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await page.getByRole('tab', { name: 'Map', exact: true }).click();

    await expect(page.locator('.layer-row')).toHaveCount(1);
    await expect(page.locator('#active-layer-name')).toHaveText('Default Layer active');
    await page.locator('#layer-name').fill('Architecture');
    await page.getByRole('button', { name: 'Add layer', exact: true }).click();
    await expect(page.locator('.layer-row')).toHaveCount(2);
    await expect(page.locator('#active-layer-name')).toHaveText('Architecture active');

    const left = await topWorldPoint(page, -16, 0);
    await page.mouse.click(left.x, left.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.getByRole('button', { name: 'Move selection', exact: true }).click();
    let document = await readEditorDocument(page);
    let architecture = deriveEditorLayers(document).find((layer) => layer.name === 'Architecture')!;
    expect(architecture.brushIds).toHaveLength(1);
    expect(
      brushesInDocument(document).find((brush) => brush.id === architecture.brushIds[0])!.faces[0]
        ?.material,
    ).toBe('LEFT');

    await page.getByRole('button', { name: 'Hide Architecture', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await expect(page.locator('#hidden-object-count')).toHaveText('1');
    await page.mouse.click(left.x, left.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await page.getByRole('button', { name: 'Show Architecture', exact: true }).click();
    await page.getByRole('button', { name: 'Lock Architecture', exact: true }).click();
    await expect(page.locator('#locked-object-count')).toHaveText('1');
    await page.mouse.click(left.x, left.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await page.getByRole('button', { name: 'Unlock Architecture', exact: true }).click();
    await page.getByRole('button', { name: 'Select contents', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page
      .getByRole('button', { name: 'Omit Architecture in compile export', exact: true })
      .click();

    await page.locator('#layer-name').fill('Gameplay');
    await page.getByRole('button', { name: 'Add layer', exact: true }).click();
    const gameplayName = page.getByRole('textbox', { name: 'Rename Gameplay', exact: true });
    await page.getByRole('option').filter({ has: gameplayName }).click();
    await page.getByRole('button', { name: 'Move selected layer up' }).click();
    await gameplayName.fill('Logic');
    await gameplayName.press('Enter');
    document = await readEditorDocument(page);
    expect(deriveEditorLayers(document).map((layer) => layer.name)).toEqual([
      'Default Layer',
      'Logic',
      'Architecture',
    ]);
    architecture = deriveEditorLayers(document).find((layer) => layer.name === 'Architecture')!;
    expect(architecture.omitFromExport).toBe(true);

    await page.getByRole('textbox', { name: 'Rename Architecture', exact: true }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    document = await readEditorDocument(page);
    expect(deriveEditorLayers(document).map((layer) => layer.name)).toEqual([
      'Default Layer',
      'Logic',
    ]);
    expect(
      deriveEditorLayers(document)[0]!
        .brushIds.map((brushId) =>
          brushesInDocument(document).find((brush) => brush.id === brushId),
        )
        .some((brush) => brush?.faces[0]?.material === 'LEFT'),
    ).toBe(true);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    document = await readEditorDocument(page);
    expect(deriveEditorLayers(document).map((layer) => layer.name)).toEqual([
      'Default Layer',
      'Logic',
      'Architecture',
    ]);
  });

  test('selection brushes consume their volumes and select touching, enclosed, or projected objects', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(selectionBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const selector = await topWorldPoint(page, 80, 80);
    await page.mouse.click(selector.x, selector.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#selection-brush-section')).toBeVisible();
    await expect(page.locator('#selection-brush-count')).toHaveText('1 volume');

    await page.getByRole('button', { name: 'Enclosed', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('2 Objects');
    await expect(page.locator('#status-message')).toContainText('selected 2 enclosed objects');
    let queried = await readEditorDocument(page);
    expect(brushesInDocument(queried).map((brush) => brush.faces[0]?.material)).not.toContain(
      'SELECTOR',
    );

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.getByRole('button', { name: 'Touching', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('3 Objects');
    await expect(page.locator('#status-message')).toContainText('selected 3 touching objects');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.mouse.move(selector.x, selector.y);
    await page.getByRole('button', { name: 'Enclosed in 2D', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('3 Objects');
    await expect(page.locator('#status-message')).toContainText('selected 3 xy enclosed objects');
    queried = await readEditorDocument(page);
    expect(brushesInDocument(queried)).toHaveLength(4);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
    await expect(page.locator('#selection-kind')).toHaveText('7 Objects');
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+Shift+A`);
    await expect(page.locator('#selection-kind')).toHaveText('None');
  });

  test('Ctrl-drag paint-selects objects and duplicate-moves a selected set atomically', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(selectionPaintSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();

    const first = await topWorldPoint(page, -128, 0);
    const second = await topWorldPoint(page, 0, 0);
    const third = await topWorldPoint(page, 128, 0);
    await page.mouse.click(first.x, first.y);
    await page.keyboard.down('Control');
    await page.mouse.move(second.x, second.y);
    await page.mouse.down();
    await page.mouse.move(third.x, third.y, { steps: 16 });
    await page.mouse.up();
    await page.keyboard.up('Control');

    await expect(page.locator('#selection-kind')).toHaveText('3 Brushes');
    await expect(page.locator('#status-message')).toContainText('Paint selected 3 brushes');

    const duplicateEnd = await topWorldPoint(page, 0, 128);
    await page.keyboard.down('Control');
    await page.mouse.move(second.x, second.y);
    await page.mouse.down();
    await page.mouse.move(duplicateEnd.x, duplicateEnd.y, { steps: 16 });
    await page.mouse.up();
    await page.keyboard.up('Control');

    await expect(page.locator('#brush-count')).toHaveText('6');
    await expect(page.locator('#selection-kind')).toHaveText('3 Brushes');
    await expect(page.locator('#status-message')).toContainText('Duplicate and move brushes');
    const duplicated = await readEditorDocument(page);
    expect(brushesInDocument(duplicated)).toHaveLength(6);
    expect(
      brushesInDocument(duplicated).filter((brush) => deriveBrush(brush).bounds?.min[1] === 96),
    ).toHaveLength(3);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(page.locator('#selection-kind')).toHaveText('3 Brushes');
  });

  test('hides, isolates, and locks objects without dirtying map source', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(selectionPaintSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const first = await topWorldPoint(page, -128, 0);
    const second = await topWorldPoint(page, 0, 0);

    await page.mouse.click(first.x, first.y);
    await openToolbarMenu(page, 'Visibility and locking');
    await page.getByRole('menuitem', { name: 'Hide', exact: true }).click();
    await expect(page.locator('#hidden-object-count')).toHaveText('1');
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await expect(page.locator('#document-revision')).toHaveText('0');
    await page.mouse.click(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#hidden-object-count')).toHaveText('0');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');

    await page.mouse.click(second.x, second.y);
    await openToolbarMenu(page, 'Visibility and locking');
    await page.getByRole('menuitem', { name: 'Isolate', exact: true }).click();
    await expect(page.locator('#hidden-object-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.mouse.click(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await openToolbarMenu(page, 'Visibility and locking');
    await page.getByRole('menuitem', { name: 'Show all', exact: true }).click();
    await expect(page.locator('#hidden-object-count')).toHaveText('0');

    await page.mouse.click(first.x, first.y);
    await openToolbarMenu(page, 'Visibility and locking');
    await page.getByRole('menuitem', { name: 'Lock', exact: true }).click();
    await expect(page.locator('#locked-object-count')).toHaveText('1');
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await page.mouse.click(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await openToolbarMenu(page, 'Visibility and locking');
    await page.getByRole('menuitem', { name: 'Unlock all', exact: true }).click();
    await expect(page.locator('#locked-object-count')).toHaveText('0');
    await page.mouse.click(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#document-revision')).toHaveText('0');
    expect(brushesInDocument(await readEditorDocument(page))).toHaveLength(3);
  });

  test('groups mixed viewport selections, opens members for editing, renames, and ungroups', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(selectionPaintSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const first = await topWorldPoint(page, -128, 0);
    const second = await topWorldPoint(page, 0, 0);
    await page.mouse.click(first.x, first.y);
    await page.keyboard.down('Control');
    await page.mouse.click(second.x, second.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');

    await page.locator('#group-name').fill('West hall');
    await page.getByRole('button', { name: 'Group selection', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Group');
    await expect(page.locator('#group-count')).toHaveText('1');
    await expect(page.locator('#group-state')).toHaveText('2 objects');
    await expect(page.locator('#document-revision')).toHaveText('1');
    let grouped = await readEditorDocument(page);
    const groupEntity = grouped.entities.find(
      (entity) => entity.properties['_tb_type'] === '_tb_group',
    );
    expect(groupEntity?.properties).toMatchObject({
      classname: 'func_group',
      _tb_name: 'West hall',
      _tb_id: '1',
    });
    expect(groupEntity?.primitives).toHaveLength(2);

    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#group-state')).toHaveText('Editing West hall');
    await expect(page.locator('#locked-object-count')).toHaveText('3');
    await page.getByRole('button', { name: 'Nudge X positive' }).click();
    await expect(page.locator('#document-revision')).toHaveText('2');
    await page.keyboard.press('Escape');
    await expect(page.locator('#selection-kind')).toHaveText('Group');
    await expect(page.locator('#locked-object-count')).toHaveText('0');

    await page.locator('#group-name').fill('West architecture');
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.locator('#document-revision')).toHaveText('3');
    await expect(page.locator('#group-name')).toHaveValue('West architecture');
    await page.getByRole('button', { name: 'Ungroup', exact: true }).click();
    await expect(page.locator('#group-count')).toHaveText('0');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#document-revision')).toHaveText('4');
    grouped = await readEditorDocument(page);
    expect(grouped.entities.some((entity) => entity.properties['_tb_type'] === '_tb_group')).toBe(
      false,
    );
    expect(brushesInDocument(grouped)).toHaveLength(3);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Group');
    await expect(page.locator('#group-count')).toHaveText('1');
    await expect(page.locator('#group-name')).toHaveValue('West architecture');

    await page.mouse.dblclick(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#group-state')).toHaveText('Editing West architecture');
    const empty = await viewportPoint(page, 0, 0.08, 0.08);
    await page.mouse.dblclick(empty.x, empty.y);
    await expect(page.locator('#selection-kind')).toHaveText('Group');
    await expect(page.locator('#locked-object-count')).toHaveText('0');
  });

  test('linked groups synchronize transformed contents and preserve per-copy entity properties', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(regularGroupSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const originalBrush = await topWorldPoint(page, 0, 0);
    await page.mouse.click(originalBrush.x, originalBrush.y);
    await expect(page.locator('#selection-kind')).toHaveText('Group');

    await page.getByRole('button', { name: 'Linked duplicate', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Linked Group');
    await expect(page.locator('#group-count')).toHaveText('2');
    await expect(page.locator('#group-state')).toHaveText('Linked · 2 copies');
    await expect(page.getByRole('button', { name: 'Unlink', exact: true })).toBeVisible();
    let linked = await readEditorDocument(page);
    let linkedGroups = deriveEditorGroups(linked);
    expect(new Set(linkedGroups.map((group) => group.linkedGroupId)).size).toBe(1);
    expect(linkedGroups.every((group) => group.transformation)).toBe(true);

    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.locator('#group-state')).toHaveText('Editing linked · 2 copies');
    const copiedMarker = await topWorldPoint(page, 16, 112);
    await page.mouse.click(copiedMarker.x, copiedMarker.y);
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
    const protectAngle = page.getByRole('checkbox', {
      name: 'Keep angle independent in this linked copy',
    });
    await expect(protectAngle).toBeVisible();
    await setCheckbox(page, 'Keep angle independent in this linked copy', true);
    const angle = page.getByRole('textbox', { name: 'angle value' });
    await angle.fill('180');
    await angle.press('Tab');

    const copiedBrush = await topWorldPoint(page, 16, 16);
    await page.mouse.click(copiedBrush.x, copiedBrush.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.getByRole('button', { name: 'Nudge Z positive' }).click();
    linked = await readEditorDocument(page);
    linkedGroups = deriveEditorGroups(linked);
    expect(
      linkedGroups
        .map((group) => deriveBrush(findBrush(linked, group.brushIds[0]!)!).bounds?.min[2])
        .toSorted(),
    ).toEqual([16, 16]);
    const linkedAngles = linkedGroups
      .map((group) => {
        const entity = linked.entities.find(
          (candidate) => candidate.id === group.pointEntityIds[0],
        )!;
        return {
          angle: entity.properties.angle,
          protected: entity.properties['_tb_protected_properties'] ?? '',
        };
      })
      .toSorted((left, right) => Number(left.angle) - Number(right.angle));
    expect(linkedAngles).toEqual([
      { angle: '90', protected: '' },
      { angle: '180', protected: 'angle' },
    ]);

    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Unlink', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Group');
    linked = await readEditorDocument(page);
    expect(deriveEditorGroups(linked).every((group) => group.linkedGroupId === null)).toBe(true);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Linked Group');
  });
});
