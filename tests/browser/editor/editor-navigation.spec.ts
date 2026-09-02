import { expect, test } from '@playwright/test';
import {
  brushesInDocument,
  createBoxBrush,
  createSequentialIdFactory,
  createStarterDocument,
  deriveBrush,
  serializeMap,
} from '../../../packages/worldview-editor/src/core/index.js';
import {
  selectionPaintSource,
  drillSelectionSource,
  orthographicDrillSelectionSource,
  brushEntitySiblingSource,
} from './support/editor-fixtures.js';
import {
  openEditor,
  openToolbarMenu,
  installSiteToolRegistry,
  executeSiteTool,
  readEditorDocument,
  perspectivePoint,
  perspectiveGridBandThickness,
  perspectiveWorldPoint,
  viewportPoint,
  topWorldPoint,
  perspectiveCamera,
  viewportCamera,
  cameraDistance,
  expectPerspectiveTranslation,
  chooseSelectOption,
} from './support/editor-browser-helpers.js';

test.describe('Editor navigation and contextual actions', () => {
  test('navigates the perspective camera without changing the active tool or map', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.getByRole('button', { name: 'Focus', exact: true })).toBeEnabled();

    const beforeStationaryOrbit = await perspectiveCamera(page);
    await page.keyboard.down('Alt');
    await page.mouse.move(brushPoint.x, brushPoint.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(brushPoint.x + 2, brushPoint.y + 2);
    await page.mouse.up({ button: 'right' });
    await page.keyboard.up('Alt');
    const afterStationaryOrbit = await perspectiveCamera(page);
    expect(afterStationaryOrbit).toEqual(beforeStationaryOrbit);

    const beforeOrbit = await perspectiveCamera(page);
    await page.keyboard.down('Alt');
    await page.mouse.move(brushPoint.x, brushPoint.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(brushPoint.x + 64, brushPoint.y + 24, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await page.keyboard.up('Alt');
    const afterOrbit = await perspectiveCamera(page);
    expect(cameraDistance(afterOrbit.position, beforeOrbit.position)).toBeGreaterThan(1);
    await expect(page.locator('#perspective-mode')).toContainText('ORBIT');

    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText('Framed the selection');
    await expect(page.locator('#perspective-mode')).toContainText('FOCUS');

    const lookStart = await perspectiveCamera(page);
    const lookPoint = await perspectivePoint(page, 0.72, 0.32);
    await page.mouse.move(lookPoint.x, lookPoint.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(lookPoint.x + 72, lookPoint.y + 32, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    const lookEnd = await perspectiveCamera(page);
    expect(cameraDistance(lookEnd.position, lookStart.position)).toBeLessThan(0.001);
    expect(Math.abs(lookEnd.yaw - lookStart.yaw)).toBeGreaterThan(0.1);
    expect(lookEnd.pitch).toBeLessThan(lookStart.pitch);
    await expect(page.locator('#perspective-mode')).toContainText('LOOK');

    // Looking and keyboard flight must compose. The look gesture used to retain the eye from
    // pointer-down and snap back to it after WASD translated the camera.
    await page.mouse.move(lookPoint.x, lookPoint.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(lookPoint.x + 12, lookPoint.y + 6);
    const combinedFlyStart = (await perspectiveCamera(page)).position;
    await page.keyboard.down('w');
    try {
      await expectPerspectiveTranslation(page, combinedFlyStart);
    } finally {
      await page.keyboard.up('w');
    }
    const combinedFlyEnd = await perspectiveCamera(page);
    await page.mouse.move(lookPoint.x + 36, lookPoint.y + 18);
    const combinedLookEnd = await perspectiveCamera(page);
    await page.mouse.up({ button: 'right' });
    expect(cameraDistance(combinedLookEnd.position, combinedFlyEnd.position)).toBeLessThan(0.001);

    const panStart = await perspectiveCamera(page);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(lookPoint.x - 48, lookPoint.y + 40, { steps: 8 });
    await page.mouse.up({ button: 'middle' });
    const panEnd = await perspectiveCamera(page);
    expect(cameraDistance(panEnd.position, panStart.position)).toBeGreaterThan(1);
    await expect(page.locator('#perspective-mode')).toContainText('PAN');

    await chooseSelectOption(page, 'Grid size', '32');
    await page.locator('.source-canvas').nth(0).focus();
    const flyStart = await perspectiveCamera(page);
    await page.keyboard.down('w');
    try {
      await expectPerspectiveTranslation(page, flyStart.position);
    } finally {
      await page.keyboard.up('w');
    }
    const flyEnd = await perspectiveCamera(page);
    expect(cameraDistance(flyEnd.position, flyStart.position)).toBeGreaterThan(4);
    await expect(page.locator('#perspective-mode')).toContainText('FLY');
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.mouse.move(lookPoint.x, lookPoint.y);
    await page.mouse.down({ button: 'right' });
    const speedStart = await perspectiveCamera(page);
    await page.mouse.wheel(0, -180);
    const speedEnd = await perspectiveCamera(page);
    await page.mouse.up({ button: 'right' });
    expect(speedEnd.flySpeed).toBeGreaterThan(speedStart.flySpeed);
    await expect(page.locator('#viewport-context-menu')).toBeHidden();

    const zoomStart = await perspectiveCamera(page);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Shift');
    const zoomEnd = await perspectiveCamera(page);
    expect(zoomEnd.fieldOfViewDegrees).toBeLessThan(zoomStart.fieldOfViewDegrees);
    await expect(page.locator('#perspective-mode')).toContainText('ZOOM');

    const dollyStart = await perspectiveCamera(page);
    await page.mouse.wheel(0, -160);
    const dollyEnd = await perspectiveCamera(page);
    expect(cameraDistance(dollyEnd.position, dollyStart.position)).toBeGreaterThan(1);
    await expect(page.locator('#perspective-mode')).toContainText('DOLLY');

    await page.keyboard.press('Home');
    await expect(page.locator('#status-message')).toContainText('Framed the selection');
    await expect(page.locator('#perspective-mode')).toContainText('FOCUS');
    await expect(page.locator('#document-revision')).toHaveText('0');
  });

  test('keeps perspective grid lines fine when they cross the near plane', async ({ page }) => {
    await openEditor(page, { empty: true });
    const canvas = page.getByLabel('Perspective map viewport');
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Perspective viewport bounds are unavailable');
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.65);

    for (let index = 0; index < 3; index += 1) await page.mouse.wheel(0, -600);
    await expect.poll(() => perspectiveGridBandThickness(page)).toBeLessThanOrEqual(4);
  });

  test('draws selection bounds guides only in perspective while the selection is hovered', async ({
    page,
  }) => {
    await installSiteToolRegistry(page);
    await openEditor(page, { empty: true });
    const inspection = await executeSiteTool(page, 'worldview_inspect_editor');
    const created = await executeSiteTool(page, 'worldview_create_box', {
      expectedDocumentId: inspection.documentId,
      expectedRevision: inspection.revision,
      min: [-64, -64, 0],
      max: [64, 64, 64],
      material: 'DEV_FLOOR',
    });
    await executeSiteTool(page, 'worldview_select', {
      expectedDocumentId: inspection.documentId,
      expectedRevision: created.revision,
      mode: 'objects',
      brushIds: [created.brushId],
    });
    await executeSiteTool(page, 'worldview_frame_view', { target: 'selection' });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const perspective = page.getByLabel('Perspective map viewport');
    const bounds = await perspective.boundingBox();
    if (!bounds) throw new Error('Perspective viewport bounds are unavailable');
    await perspective.focus();
    const emptyPerspective = { x: 4, y: 4 };
    await perspective.hover({ position: emptyPerspective });
    await expect(perspective).toHaveAttribute('data-selection-guide', 'false');

    await perspective.hover({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
    await expect(perspective).toHaveAttribute('data-selection-guide', 'true');
    for (const viewport of ['xy', 'xz', 'yz']) {
      await expect(page.locator(`[data-viewport="${viewport}"] .source-canvas`)).toHaveAttribute(
        'data-selection-guide',
        'false',
      );
    }

    const top = page.locator('[data-viewport="xy"] .source-canvas');
    const topBounds = await top.boundingBox();
    if (!topBounds) throw new Error('Top viewport bounds are unavailable');
    await top.hover({ position: { x: topBounds.width / 2, y: topBounds.height / 2 } });
    await expect(top).toBeFocused();
    await expect(perspective).toHaveAttribute('data-selection-guide', 'true');
    await expect(top).toHaveAttribute('data-selection-guide', 'false');

    await perspective.hover({ position: emptyPerspective });
    await expect(perspective).toBeFocused();
    await expect(perspective).toHaveAttribute('data-selection-guide', 'false');
  });

  test('links orthographic navigation and follows viewport focus under the pointer', async ({
    page,
  }) => {
    await openEditor(page);
    const xyCanvas = page.locator('[data-viewport="xy"] .source-canvas');
    const xzCanvas = page.locator('[data-viewport="xz"] .source-canvas');
    const xyBounds = await xyCanvas.boundingBox();
    const xzBounds = await xzCanvas.boundingBox();
    if (!xyBounds || !xzBounds) throw new Error('Orthographic viewport bounds are unavailable');

    await xyCanvas.focus();
    await page.mouse.move(xzBounds.x + xzBounds.width / 2, xzBounds.y + xzBounds.height / 2);
    await expect(xzCanvas).toBeFocused();

    const beforeXy = await viewportCamera(page, 'xy');
    const beforeXz = await viewportCamera(page, 'xz');
    const beforeYz = await viewportCamera(page, 'yz');
    await page.mouse.move(xyBounds.x + xyBounds.width * 0.65, xyBounds.y + xyBounds.height * 0.4);
    await page.mouse.wheel(0, -160);
    const afterXy = await viewportCamera(page, 'xy');
    const afterXz = await viewportCamera(page, 'xz');
    const afterYz = await viewportCamera(page, 'yz');
    expect(afterXy.orthographicSpan).toBeLessThan(beforeXy.orthographicSpan);
    expect(afterXz.orthographicSpan).toBeCloseTo(afterXy.orthographicSpan);
    expect(afterYz.orthographicSpan).toBeCloseTo(afterXy.orthographicSpan);
    expect(afterXz.center[0]).not.toBe(beforeXz.center[0]);
    expect(afterYz.center[1]).not.toBe(beforeYz.center[1]);
  });

  test('frames a newly opened map instead of leaving distant geometry off-screen', async ({
    page,
  }) => {
    await openEditor(page);
    const ids = createSequentialIdFactory('browser-open-focus');
    const starter = createStarterDocument();
    const distantBrush = createBoxBrush([4800, 6800, 1200], [5200, 7200, 1600], 'DEV_FLOOR', ids);
    const source = serializeMap({
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [distantBrush] }],
    });
    await page.locator('#map-file').setInputFiles({
      name: 'distant.map',
      mimeType: 'text/plain',
      buffer: Buffer.from(source),
    });
    await expect(page.locator('#status-message')).toContainText('Opened distant.map');
    const camera = await perspectiveCamera(page);
    expect(camera.center[0]).toBeCloseTo(5000);
    expect(camera.center[1]).toBeCloseTo(7000);
    expect(camera.center[2]).toBeCloseTo(1400);
    const top = await page.locator('.source-canvas').first().boundingBox();
    if (!top) throw new Error('Top viewport has no bounds');
    await page.mouse.click(top.x + top.width / 2, top.y + top.height / 2);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
  });

  test('stationary right-click opens contextual 3D face, object, material, and entity actions', async ({
    page,
  }) => {
    await openEditor(page);
    const point = await perspectivePoint(page, 0.5, 0.58);
    const menu = page.locator('#viewport-context-menu');

    await page.mouse.click(point.x, point.y, { button: 'right' });
    await expect(menu).toBeVisible();
    expect(
      await page.evaluate(() => {
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
        });
        document.body.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      'a Windows-style contextmenu event retargeted after the popover opens',
    ).toBe(true);
    await expect(menu.locator('.viewport-context-heading')).toContainText('3D view');
    await expect(page.locator(':focus')).toHaveAttribute('role', 'menuitem');
    await page.keyboard.press('End');
    await expect(page.locator(':focus')).not.toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Home');
    await expect(page.locator(':focus')).toHaveAccessibleName('Select object');
    await expect(menu.getByRole('menuitem', { name: 'Select face', exact: true })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Select face', exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(page.getByLabel('Perspective map viewport')).toBeFocused();
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await expect(page.locator('#document-revision')).toHaveText('0');

    await page.mouse.click(point.x, point.y, { button: 'right' });
    await menu.getByRole('menuitem', { name: 'Reveal DEV_FLOOR', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Face', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('#material-filter')).toHaveValue('DEV_FLOOR');
    await expect(page.getByRole('button', { name: 'DEV_FLOOR', exact: true })).toHaveClass(
      /active/,
    );

    await page.mouse.click(point.x, point.y, { button: 'right' });
    await menu.getByRole('menuitem', { name: 'Select object', exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await menu.getByRole('menuitem', { name: 'Focus selection', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText(
      'Framed the selection in every viewport.',
    );
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await menu.getByRole('menuitem', { name: 'Hide selection', exact: true }).click();
    await expect(page.locator('#hidden-object-count')).toHaveText('1');
    await expect(page.locator('#selection-kind')).toHaveText('None');
    let mapDocument = await readEditorDocument(page);
    expect(mapDocument.revision).toBe(0);
    await openToolbarMenu(page, 'Visibility and locking');
    await page.getByRole('menuitem', { name: 'Show all', exact: true }).click();

    await page.mouse.click(point.x, point.y, { button: 'right' });
    await menu.getByRole('menuitem', { name: 'Create point entity', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Deathmatch start', exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
    await expect(page.locator('#document-revision')).toHaveText('1');
    mapDocument = await readEditorDocument(page);
    expect(
      mapDocument.entities.filter(
        (entity) => entity.properties.classname === 'info_player_deathmatch',
      ),
    ).toHaveLength(1);

    await page.mouse.click(point.x, point.y, { button: 'right' });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByLabel('Perspective map viewport')).toBeFocused();
    expect(
      await page.getByLabel('Perspective map viewport').evaluate((canvas) => {
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
        });
        canvas.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ).toBe(true);
    expect(
      await page.locator('#material-filter').evaluate((input) => {
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
        });
        input.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      'native context menus outside the viewport remain available',
    ).toBe(false);

    const beforeLook = await perspectiveCamera(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(point.x + 64, point.y + 24, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await expect(menu).toBeHidden();
    const afterLook = await perspectiveCamera(page);
    expect(Math.abs(afterLook.yaw - beforeLook.yaw)).toBeGreaterThan(0.1);
  });

  test('ordinary Paste uses the viewport cursor while Paste at original position preserves coordinates', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(selectionPaintSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const first = await topWorldPoint(page, -128, 0);
    await page.mouse.click(first.x, first.y);

    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText('Copied selected objects');

    const destination = await perspectiveWorldPoint(page, [0, 0, 64]);
    await page.mouse.move(destination.x, destination.y);
    await expect(page.getByRole('button', { name: 'Paste', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Paste', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 64 to 32 32 128');
    await expect(page.locator('#status-message')).toContainText('PERSPECTIVE pointer');
    expect(brushesInDocument(await readEditorDocument(page))).toHaveLength(4);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await page.getByRole('button', { name: 'Paste at original position', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#brush-bounds')).toHaveText('-160 -32 0 to -96 32 64');
    await expect(page.locator('#status-message')).toContainText('original position');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    const topDestination = await topWorldPoint(page, 128, 128);
    await page.mouse.move(topDestination.x, topDestination.y);
    await page.keyboard.press('Control+v');
    await expect(page.locator('#brush-bounds')).toHaveText('96 96 -64 to 160 160 0');
    await expect(page.locator('#status-message')).toContainText('XY pointer');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.keyboard.press('Control+Alt+v');
    await expect(page.locator('#brush-bounds')).toHaveText('-160 -32 0 to -96 32 64');
    await expect(page.locator('#status-message')).toContainText('original position');
  });

  test('ordinary 3D Paste uses the camera default distance when the cursor points into empty space', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(selectionPaintSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const source = await topWorldPoint(page, -128, 0);
    await page.mouse.click(source.x, source.y);
    await page.getByRole('button', { name: 'Copy', exact: true }).click();

    const empty = await viewportPoint(page, 0, 0.08, 0.08);
    await page.mouse.move(empty.x, empty.y);
    const camera = await perspectiveCamera(page);
    await page.getByRole('button', { name: 'Paste', exact: true }).click();

    const document = await readEditorDocument(page);
    const pasted = brushesInDocument(document).at(-1)!;
    const bounds = deriveBrush(pasted).bounds!;
    const center = bounds.min.map((minimum, axis) => (minimum + bounds.max[axis]!) / 2);
    const distanceFromEye = Math.hypot(
      center[0]! - camera.position[0]!,
      center[1]! - camera.position[1]!,
      center[2]! - camera.position[2]!,
    );
    expect(distanceFromEye).toBeGreaterThan(180);
    expect(distanceFromEye).toBeLessThan(340);
    await expect(page.locator('#status-message')).toContainText('PERSPECTIVE pointer');
  });

  test('Ctrl-wheel drills the 3D selection through occluding brushes in both directions', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(drillSelectionSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const center = await perspectivePoint(page, 0.5, 0.5);

    await page.mouse.click(center.x, center.y);
    await expect(page.locator('#brush-bounds')).toHaveText('72 -136 88 to 120 -88 136');
    await page.keyboard.down('Control');
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await expect(page.locator('#brush-bounds')).toHaveText('16 -72 48 to 64 -24 96');
    await expect(page.locator('#status-message')).toContainText(
      'Drilled object selection farther in the PERSPECTIVE view',
    );

    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 120);
    await page.keyboard.up('Control');
    await expect(page.locator('#brush-bounds')).toHaveText('72 -136 88 to 120 -88 136');
    await expect(page.locator('#status-message')).toContainText(
      'Drilled object selection nearer in the PERSPECTIVE view',
    );
  });

  test('wheel drilling reaches overlapping objects and faces in an orthographic view', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(orthographicDrillSelectionSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const center = await topWorldPoint(page, 0, 0);

    await page.mouse.click(center.x, center.y);
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 128 to 32 32 192');

    await page.keyboard.down('Control');
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -96 0 to 96 96 64');
    await expect(page.locator('#status-message')).toContainText(
      'Drilled object selection farther in the XY view',
    );

    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 128 to 32 32 192');

    await page.keyboard.down('Shift');
    await page.mouse.click(center.x, center.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -96 0 to 96 96 64');
    await expect(page.locator('#status-message')).toContainText(
      'Drilled face selection farther in the XY view',
    );

    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 120);
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 128 to 32 32 192');
  });

  test('double-click selects every brush owned by one brush entity', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(brushEntitySiblingSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const first = await topWorldPoint(page, 0, 0);

    await page.mouse.dblclick(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#status-message')).toContainText('Selected 2 sibling brushes');
  });
});
