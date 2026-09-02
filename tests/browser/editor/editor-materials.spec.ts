import { expect, test } from '@playwright/test';
import {
  type MapDocument,
  brushesInDocument,
  createStarterDocument,
  serializeMap,
} from '../../../packages/worldview-editor/src/core/index.js';
import { largeMaterialWad, materialUsageSource } from './support/editor-fixtures.js';
import {
  openEditor,
  chooseMaterialAction,
  readEditorDocument,
  perspectivePoint,
  perspectiveWorldPoint,
  topWorldPoint,
} from './support/editor-browser-helpers.js';

test.describe('Editor face materials', () => {
  test('material browser reports usage, selects consumers, and replaces globally or in selection', async ({
    page,
  }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:5174',
    });
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(materialUsageSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await page.getByRole('tab', { name: 'Face', exact: true }).click();

    await expect(page.locator('#material-count')).toHaveText('4 loaded · 2 in use');
    await expect(page.locator('#material-coverage')).toBeHidden();
    await expect(page.locator('.material-tile.in-use')).toHaveCount(2);
    await page.getByRole('button', { name: /Sort materials/ }).click();
    await page.getByRole('option', { name: 'Usage', exact: true }).click();
    await expect(page.locator('.material-tile').first().locator('span')).toHaveText('DEV_FLOOR');
    await page.getByRole('checkbox', { name: 'Used', exact: true }).press('Space');
    await expect(page.locator('.material-tile')).toHaveCount(2);
    await page.getByRole('button', { name: 'DEV_FLOOR', exact: true }).click();

    await chooseMaterialAction(page, 'Copy material name');
    await expect(page.locator('#status-message')).toContainText('Copied material name DEV_FLOOR');

    await chooseMaterialAction(page, 'Select using faces');
    await expect(page.locator('#selection-kind')).toHaveText('10 Faces');
    await expect(page.getByRole('button', { name: 'Face', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await chooseMaterialAction(page, 'Select using brushes');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.keyboard.press('Escape');
    await chooseMaterialAction(page, 'Replace material uses…');
    await expect(page.locator('#material-replace-scope')).toContainText('whole map');
    await page.locator('#material-replace-source').fill('DEV_FLOOR');
    await page.locator('#material-replace-target').fill('REPLACED');
    await page.locator('[data-action="replace-material"]').click();
    await expect(page.locator('#selection-kind')).toHaveText('10 Faces');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#material-coverage')).toContainText(
      'Missing 1 of 2 map materials: REPLACED',
    );
    await expect(page.locator('#status-message')).toContainText('on 10 faces');
    let document = await readEditorDocument(page);
    expect(
      brushesInDocument(document).flatMap((brush) =>
        brush.faces.filter((face) => face.material === 'REPLACED'),
      ),
    ).toHaveLength(10);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('tab', { name: 'Face', exact: true }).click();
    await page.getByRole('button', { name: 'DEV_FLOOR', exact: true }).click();
    await chooseMaterialAction(page, 'Select using brushes');
    const first = await topWorldPoint(page, -64, 0);
    await page.mouse.click(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await chooseMaterialAction(page, 'Replace material uses…');
    await expect(page.locator('#material-replace-scope')).toContainText('1 selected brush');
    await page.locator('#material-replace-source').fill('DEV_FLOOR');
    await page.locator('#material-replace-target').fill('SCOPED');
    await page.locator('[data-action="replace-material"]').click();
    await expect(page.locator('#selection-kind')).toHaveText('4 Faces');
    await expect(page.locator('#status-message')).toContainText('on 4 faces');
    document = await readEditorDocument(page);
    expect(
      brushesInDocument(document).flatMap((brush) =>
        brush.faces.filter((face) => face.material === 'SCOPED'),
      ),
    ).toHaveLength(4);
  });

  test('material browser virtualizes large catalogs without recycling the focused tile', async ({
    page,
  }) => {
    await openEditor(page);
    const resources = largeMaterialWad(150);
    await page.locator('#palette-file').setInputFiles({
      name: 'palette.lmp',
      mimeType: 'application/octet-stream',
      buffer: resources.palette,
    });
    await page.locator('#wad-files').setInputFiles({
      name: 'large-test.wad',
      mimeType: 'application/octet-stream',
      buffer: resources.wad,
    });
    await page.getByRole('tab', { name: 'Face', exact: true }).click();

    await expect(page.locator('#material-count')).toHaveText('154 loaded · 2 in use');
    const tiles = page.locator('.material-tile');
    expect(await tiles.count()).toBeLessThan(40);
    const first = page.getByRole('button', { name: 'DEV_FLOOR', exact: true });
    await first.focus();
    await expect(first).toBeFocused();
    await page.locator('#material-grid').evaluate((grid) => {
      grid.scrollTop = grid.scrollHeight;
      grid.dispatchEvent(new Event('scroll'));
    });
    await expect(page.getByRole('button', { name: 'MAT_149', exact: true })).toBeVisible();
    await expect(first).toBeFocused();
    expect(await tiles.count()).toBeLessThan(45);
  });

  test('Face tool lassos projected handles in orthographic and perspective views', async ({
    page,
  }) => {
    await openEditor(page);
    const ground = await topWorldPoint(page, 64, -96);
    await page.mouse.click(ground.x, ground.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.getByRole('button', { name: 'Face' }).click();

    const rightStart = await topWorldPoint(page, 160, 32);
    const rightEnd = await topWorldPoint(page, 96, -32);
    await page.mouse.move(rightStart.x, rightStart.y);
    await page.mouse.down();
    await page.mouse.move(rightEnd.x, rightEnd.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    const leftStart = await topWorldPoint(page, -160, 32);
    const leftEnd = await topWorldPoint(page, -96, -32);
    await page.keyboard.down('Shift');
    await page.mouse.move(leftStart.x, leftStart.y);
    await page.mouse.down();
    await page.mouse.move(leftEnd.x, leftEnd.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('2 Faces');

    await page.mouse.move(rightStart.x, rightStart.y);
    await page.mouse.down();
    await page.mouse.move(rightEnd.x, rightEnd.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    const perspectiveStart = await perspectivePoint(page, 0.05, 0.05);
    const perspectiveEnd = await perspectivePoint(page, 0.95, 0.95);
    await page.keyboard.down('Shift');
    await page.mouse.move(perspectiveStart.x, perspectiveStart.y);
    await page.mouse.down();
    await page.mouse.move(perspectiveEnd.x, perspectiveEnd.y, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('6 Faces');
    await expect(page.locator('#status-message')).toContainText('Lasso selected 6 faces');
  });

  test('Face tool paint-selects visible faces across multiple brushes', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const firstPillar = await topWorldPoint(page, -64, 0);
    const secondPillar = await topWorldPoint(page, 64, 0);
    await page.mouse.click(firstPillar.x, firstPillar.y);
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.mouse.move(firstPillar.x, firstPillar.y);
    await page.mouse.down();
    await page.mouse.move(secondPillar.x, secondPillar.y, { steps: 24 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');

    await expect(page.locator('#selection-kind')).toHaveText('3 Faces');
    await expect(page.locator('#status-message')).toContainText('Paint selected 3 faces');
    await page.getByRole('tab', { name: 'Face' }).click();
    await page.locator('#material-name').fill('PAINTED_PATH');
    await page.locator('[data-action="apply-material"]').click();
    await expect(page.locator('#face-material')).toHaveText('PAINTED_PATH');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#document-revision')).toHaveText('2');
  });

  test('Perspective face painting accumulates frontmost brush surfaces', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const firstPillar = await perspectiveWorldPoint(page, [-64, 0, 96]);
    const secondPillar = await perspectiveWorldPoint(page, [64, 0, 160]);
    await page.mouse.click(firstPillar.x, firstPillar.y);
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    await page.keyboard.down('Meta');
    await page.keyboard.down('Shift');
    await page.mouse.move(firstPillar.x, firstPillar.y);
    await page.mouse.down();
    await page.mouse.move(secondPillar.x, secondPillar.y, { steps: 32 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.keyboard.up('Meta');

    await expect(page.locator('#selection-kind')).toHaveText(/^[2-9] Faces$/);
    await expect(page.locator('#status-message')).toContainText('Paint selected');
    await expect(page.locator('#pointer-context')).toContainText('PERSPECTIVE / face paint');
  });

  test('Alt transfers projected, material-only, and whole-brush face attributes in 3D', async ({
    page,
  }) => {
    await openEditor(page);
    const sourcePoint = await perspectivePoint(page, 0.5, 0.58);
    const targetPoint = await perspectiveWorldPoint(page, [64, 0, 160]);
    await page.keyboard.down('Shift');
    await page.mouse.click(sourcePoint.x, sourcePoint.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    await page.getByRole('tab', { name: 'Face' }).click();
    await page.locator('#material-name').fill('TRANSFER_SOURCE');
    await page.locator('[data-action="apply-material"]').click();
    await page.locator('#texture-shift-u').fill('37');
    await page.locator('#texture-shift-v').fill('-11');
    await page.locator('#texture-scale-u').fill('0.5');
    await page.locator('#texture-scale-v').fill('2');
    await page.locator('#texture-rotation').fill('30');
    await page.locator('#texture-rotation').press('Enter');
    await expect(page.locator('#document-revision')).toHaveText('6');

    await page.keyboard.down('Alt');
    await page.mouse.click(targetPoint.x, targetPoint.y);
    await page.keyboard.up('Alt');
    await expect(page.locator('#document-revision')).toHaveText('7');
    let document = await readEditorDocument(page);
    let brushes = brushesInDocument(document);
    const sourceFace = brushes[0]!.faces.find((face) => face.material === 'TRANSFER_SOURCE')!;
    let targetFaces = brushes[2]!.faces.filter((face) => face.material === 'TRANSFER_SOURCE');
    expect(targetFaces).toHaveLength(1);
    expect(targetFaces[0]!.projection).toEqual(sourceFace.projection);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#document-revision')).toHaveText('8');
    await page.keyboard.down('Alt');
    await page.keyboard.down('Control');
    await page.mouse.click(targetPoint.x, targetPoint.y);
    await page.keyboard.up('Control');
    await page.keyboard.up('Alt');
    await expect(page.locator('#document-revision')).toHaveText('9');
    document = await readEditorDocument(page);
    brushes = brushesInDocument(document);
    targetFaces = brushes[2]!.faces.filter((face) => face.material === 'TRANSFER_SOURCE');
    expect(targetFaces).toHaveLength(1);
    expect(targetFaces[0]!.projection).not.toEqual(sourceFace.projection);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#document-revision')).toHaveText('10');
    await page.keyboard.down('Alt');
    await page.mouse.dblclick(targetPoint.x, targetPoint.y);
    await page.keyboard.up('Alt');
    await expect(page.locator('#document-revision')).toHaveText('11');
    document = await readEditorDocument(page);
    brushes = brushesInDocument(document);
    expect(brushes[2]!.faces.every((face) => face.material === 'TRANSFER_SOURCE')).toBe(true);
  });

  test('edits Quake II surface flags without discarding unknown bits', async ({ page }) => {
    await page.goto('http://127.0.0.1:5174/');
    await page.getByRole('button', { name: 'New map', exact: true }).click();
    await page.getByLabel('Game').selectOption('quake2');
    await page.getByRole('button', { name: 'Create map', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');

    const starter = createStarterDocument();
    const attributed: MapDocument = {
      ...starter,
      faceSyntax: 'quake',
      entities: starter.entities.map((entity) =>
        Object.assign({}, entity, {
          primitives: entity.primitives.map((primitive) =>
            primitive.kind === 'brush'
              ? Object.assign({}, primitive, {
                  faces: primitive.faces.map((face) =>
                    Object.assign({}, face, { surface: { flags: 0x100, value: 300 } }),
                  ),
                })
              : primitive,
          ),
        }),
      ),
    };
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(serializeMap(attributed));
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const point = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await page.getByRole('tab', { name: 'Face', exact: true }).click();
    await page.getByText('Quake II surface', { exact: true }).click();
    await expect(page.getByText('Unknown bits: 0x100')).toBeVisible();

    await page.getByRole('checkbox', { name: 'Sky', exact: true }).press('Space');
    expect(
      brushesInDocument(await readEditorDocument(page)).some((brush) =>
        brush.faces.some(({ surface }) => surface.flags === 0x104),
      ),
    ).toBe(true);
    await page.keyboard.press('Control+z');
    expect(
      brushesInDocument(await readEditorDocument(page)).every((brush) =>
        brush.faces.every(({ surface }) => surface.flags === 0x100),
      ),
    ).toBe(true);

    const surfaceValue = page.getByRole('textbox', { name: /value$/i });
    await surfaceValue.fill('512');
    await surfaceValue.press('Enter');
    expect(
      brushesInDocument(await readEditorDocument(page)).some((brush) =>
        brush.faces.some(({ surface }) => surface.value === 512),
      ),
    ).toBe(true);
  });

  test('Alt-drag paints a chained attribute path as one undoable 3D transaction', async ({
    page,
  }) => {
    await openEditor(page);
    const sourcePoint = await perspectiveWorldPoint(page, [-64, 0, 96]);
    const pathStart = await perspectivePoint(page, 0.5, 0.58);
    const pathEnd = await perspectiveWorldPoint(page, [64, 0, 160]);
    await page.keyboard.down('Shift');
    await page.mouse.click(sourcePoint.x, sourcePoint.y);
    await page.keyboard.up('Shift');
    await page.getByRole('tab', { name: 'Face' }).click();
    await page.locator('#material-name').fill('CHAIN_SOURCE');
    await page.locator('[data-action="apply-material"]').click();

    await page.keyboard.down('Alt');
    await page.mouse.move(pathStart.x, pathStart.y);
    await page.mouse.down();
    await page.mouse.move(pathEnd.x, pathEnd.y, { steps: 32 });
    await page.mouse.up();
    await page.keyboard.up('Alt');

    await expect(page.locator('#document-revision')).toHaveText('2');
    await expect(page.locator('#pointer-context')).toContainText('PERSPECTIVE / transfer');
    let document = await readEditorDocument(page);
    expect(
      brushesInDocument(document)
        .flatMap((brush) => brush.faces)
        .filter((face) => face.material === 'CHAIN_SOURCE').length,
    ).toBeGreaterThanOrEqual(3);
    await page.getByRole('button', { name: 'Undo' }).click();
    document = await readEditorDocument(page);
    expect(
      brushesInDocument(document)
        .flatMap((brush) => brush.faces)
        .filter((face) => face.material === 'CHAIN_SOURCE'),
    ).toHaveLength(1);
  });

  test('Copy and Paste transfer standalone face attributes onto a 3D target selection', async ({
    page,
  }) => {
    await openEditor(page);
    const sourcePoint = await perspectivePoint(page, 0.5, 0.58);
    const targetPoint = await perspectiveWorldPoint(page, [64, 0, 160]);
    await page.keyboard.down('Shift');
    await page.mouse.click(sourcePoint.x, sourcePoint.y);
    await page.keyboard.up('Shift');
    await page.getByRole('tab', { name: 'Face' }).click();
    await page.locator('#material-name').fill('CLIPBOARD_SOURCE');
    await page.locator('[data-action="apply-material"]').click();
    await page.locator('#texture-shift-u').fill('29');
    await page.locator('#texture-shift-v').fill('-17');
    await page.locator('#texture-scale-u').fill('0.5');
    await page.locator('#texture-scale-v').fill('1.5');
    await page.locator('#texture-rotation').fill('45');
    await page.locator('#texture-rotation').press('Enter');

    const copy = page.getByRole('button', { name: 'Copy', exact: true });
    await expect(copy).toBeEnabled();
    await copy.click();
    await expect(page.locator('#status-message')).toContainText(
      'Copied face material and attributes',
    );

    await page.mouse.click(targetPoint.x, targetPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.keyboard.down('Shift');
    await page.mouse.click(targetPoint.x, targetPoint.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await page.getByRole('button', { name: 'Paste', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText(
      'Pasted CLIPBOARD_SOURCE and its attributes onto 1 face',
    );
    await expect(page.locator('#document-revision')).toHaveText('7');

    let document = await readEditorDocument(page);
    const source = brushesInDocument(document)[0]!.faces.find(
      (face) => face.material === 'CLIPBOARD_SOURCE',
    )!;
    const targets = brushesInDocument(document)[2]!.faces.filter(
      (face) => face.material === 'CLIPBOARD_SOURCE',
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]!.projection).toEqual(source.projection);

    await page.getByRole('button', { name: 'Undo' }).click();
    document = await readEditorDocument(page);
    expect(
      brushesInDocument(document)[2]!.faces.some((face) => face.material === 'CLIPBOARD_SOURCE'),
    ).toBe(false);

    await page.mouse.click(targetPoint.x, targetPoint.y, { button: 'right' });
    const menu = page.locator('#viewport-context-menu');
    await expect(menu.getByRole('menuitem', { name: 'Copy face attributes' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Paste face attributes here' })).toBeVisible();
  });
});
