import { expect, test } from '@playwright/test';

import {
  openEditor,
  openToolbarMenu,
  installSiteToolRegistry,
  executeSiteTool,
  perspectiveCamera,
  viewportCamera,
  controlContrast,
  chooseSelectOption,
} from './support/editor-browser-helpers.js';

test.describe('WebMCP site authoring', () => {
  test('keeps button contrast legible across themes and interaction states', async ({ page }) => {
    await page.goto('http://127.0.0.1:5174/');
    const primary = page.getByRole('button', { name: 'New map', exact: true });
    const neutral = page.getByRole('button', { name: 'Open project folder', exact: true });
    for (const theme of ['dark', 'light'] as const) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      expect(await controlContrast(primary)).toBeGreaterThanOrEqual(4.5);
      expect(await controlContrast(neutral)).toBeGreaterThanOrEqual(4.5);
      await primary.hover();
      expect(await controlContrast(primary)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.down();
      expect(await controlContrast(primary)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.move(0, 0);
      await page.mouse.up();
      await neutral.hover();
      expect(await controlContrast(neutral)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.down();
      expect(await controlContrast(neutral)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.move(0, 0);
      await page.mouse.up();
    }
    await page.getByRole('button', { name: 'New map', exact: true }).click();
    const create = page.getByRole('button', { name: 'Create map', exact: true });
    await create.evaluate((button: HTMLButtonElement) => {
      button.disabled = true;
      button.dataset.pending = 'true';
    });
    for (const theme of ['dark', 'light'] as const) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      expect(await controlContrast(create)).toBeGreaterThanOrEqual(4.5);
      await expect(create).toHaveCSS('cursor', 'progress');
    }
  });

  test('keeps visible editor controls above non-text contrast minimums', async ({ page }) => {
    await openEditor(page, { empty: true });
    for (const theme of ['dark', 'light'] as const) {
      await chooseSelectOption(page, 'Editor theme', theme === 'dark' ? 'Dark' : 'Light');
      const buttons = page.locator('button:visible:not(:disabled)');
      const failures: string[] = [];
      for (let index = 0; index < (await buttons.count()); index += 1) {
        const button = buttons.nth(index);
        const ratio = await controlContrast(button);
        if (ratio < 3) {
          failures.push(
            `${(await button.getAttribute('title')) ?? (await button.getAttribute('aria-label')) ?? (await button.innerText())}: ${ratio.toFixed(2)}`,
          );
        }
      }
      expect(failures, `${theme} editor controls below 3:1: ${failures.join(', ')}`).toEqual([]);
      for (const control of [
        page.getByRole('button', { name: 'Home', exact: true }),
        page.getByRole('button', { name: 'Source', exact: true }),
        page.locator('#issue-status'),
      ]) {
        await control.hover();
        expect(await controlContrast(control)).toBeGreaterThanOrEqual(3);
        await page.mouse.down();
        expect(await controlContrast(control)).toBeGreaterThanOrEqual(3);
        await page.mouse.move(0, 0);
        await page.mouse.up();
      }
    }
  });

  test('uses a dedicated history-aware new-map page @ci-smoke', async ({ page }) => {
    const loadedScripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') loadedScripts.push(request.url());
    });
    await page.goto('http://127.0.0.1:5174/');
    await expect(page.locator('#status-message')).toHaveCount(0);
    expect(loadedScripts.some((url) => url.includes('/routes/editor-route.'))).toBe(false);
    await page.getByRole('button', { name: 'New map', exact: true }).click();
    await expect(page).toHaveURL(/\/new-map$/);
    await expect(page.getByRole('heading', { name: 'New map', exact: true })).toBeVisible();
    await expect(page.locator('dialog#new-map-dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'New map', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Worldview Editor' })).toBeVisible();
    await page.goForward();
    await page.getByLabel('Game').selectOption('quake2');
    await expect(page.getByLabel('Map format').locator('option')).toHaveText(['Classic Quake']);
    await page.getByLabel('Game').selectOption('goldsrc');
    await expect(page.getByLabel('Map format').locator('option')).toHaveCount(1);
    await page.getByRole('button', { name: 'Create map', exact: true }).click();
    await expect(page).toHaveURL('http://127.0.0.1:5174/editor');
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
    await page.reload();
    await expect(page).toHaveURL('http://127.0.0.1:5174/editor');
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
    expect(loadedScripts.some((url) => url.includes('/routes/editor-route.'))).toBe(true);
  });

  test('exposes the shared interface specimens in both themes @ci-smoke', async ({ page }) => {
    await page.goto('http://127.0.0.1:5174/design');
    await expect(page.getByRole('heading', { name: 'Interface system' })).toBeVisible();
    await expect(page.locator('.design-theme[data-preview-theme="dark"]')).toBeVisible();
    await expect(page.locator('.design-theme[data-preview-theme="light"]')).toBeVisible();
    for (const theme of ['dark', 'light']) {
      const specimen = page.locator(`.design-theme[data-preview-theme="${theme}"]`);
      await expect(specimen.locator('.wv-button')).toHaveCount(7);
      await expect(specimen.locator('.wv-field')).toHaveCount(5);
      await expect(specimen.locator('.wv-select')).toHaveCount(1);
      await expect(specimen.locator('.wv-checkbox-field')).toHaveCount(2);
      await expect(specimen.getByRole('tab', { name: 'Entity' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(specimen.getByRole('menu')).toBeVisible();
      await expect(specimen.getByRole('menuitemradio', { name: 'Snap to grid' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await expect(specimen.getByText('Use a contained project path.')).toBeVisible();
    }
    await page.getByRole('button', { name: 'Open dialog' }).click();
    await expect(page.getByRole('dialog', { name: 'Dialog specimen' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Dialog specimen' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Editor chrome' })).toBeVisible();
    await expect(page.locator('main [style]:not([style*="clip: rect"])')).toHaveCount(0);
  });

  test('keeps anonymous local maps offline when collaboration is opened @ci-smoke', async ({
    page,
  }) => {
    const roomRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/sync/maps/'))
        roomRequests.push(request.url());
    });
    await openEditor(page, { empty: true });
    await page.locator('#collaboration-toggle').click();
    await expect(page.locator('#collaboration-dialog')).toBeVisible();
    await expect(page.locator('#collaboration-description')).toContainText(
      'requires a hosted project and a 4orm account',
    );
    await expect(page.getByRole('button', { name: 'Open hosted projects' })).toBeVisible();
    expect(roomRequests).toEqual([]);
  });

  test('switches and persists the editor theme', async ({ page }) => {
    await openEditor(page, { empty: true });
    const selector = page.getByRole('button', { name: /Editor theme$/ });
    await chooseSelectOption(page, 'Editor theme', 'Light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('worldview.editor.theme')))
      .toBe('light');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      'light',
    );
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--renderer-background'),
      ),
    ).toContain('96.5%');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
    await expect(selector).toContainText('Light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await chooseSelectOption(page, 'Editor theme', 'Dark');
  });

  test('uses keyboard-navigable React Aria inspector tabs', async ({ page }) => {
    await openEditor(page, { empty: true });
    const entityTab = page.getByRole('tab', { name: 'Entity' });
    await expect(entityTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-inspector-panel="object"]')).toBeVisible();

    await entityTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Face' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-inspector-panel="textures"]')).toBeVisible();
    await expect(page.locator('[data-inspector-panel="object"]')).toBeHidden();
  });

  test('uses a resizable TrenchBroom-style four-pane workspace', async ({ page }) => {
    await openEditor(page, { empty: true });
    const perspective = page.locator('[data-viewport="perspective"]');
    const top = page.locator('[data-viewport="xy"]');
    const perspectiveBounds = await perspective.boundingBox();
    const topBounds = await top.boundingBox();
    if (!perspectiveBounds || !topBounds) throw new Error('Viewport layout has no bounds');
    expect(perspectiveBounds.x).toBeLessThan(topBounds.x);
    expect(Math.abs(perspectiveBounds.y - topBounds.y)).toBeLessThan(2);
    expect(Math.abs(perspectiveBounds.width - topBounds.width)).toBeLessThan(2);
    expect(Math.abs(perspectiveBounds.height - topBounds.height)).toBeLessThan(2);

    const columnHandle = page.locator('[data-resize="viewport-column"]');
    const beforeColumn = Number(await columnHandle.getAttribute('aria-valuenow'));
    await columnHandle.press('ArrowRight');
    expect(Number(await columnHandle.getAttribute('aria-valuenow'))).toBeGreaterThan(beforeColumn);

    const rowHandle = page.locator('[data-resize="viewport-top"]');
    const beforeRow = Number(await rowHandle.getAttribute('aria-valuenow'));
    await rowHandle.press('ArrowDown');
    expect(Number(await rowHandle.getAttribute('aria-valuenow'))).toBeGreaterThan(beforeRow);

    const crossHandle = page.locator('[data-resize="viewport-cross"]');
    const beforeCrossColumn = Number(await columnHandle.getAttribute('aria-valuenow'));
    const beforeCrossRow = Number(await rowHandle.getAttribute('aria-valuenow'));
    const beforeCrossPerspective = await perspective.boundingBox();
    const crossBounds = await crossHandle.boundingBox();
    if (!beforeCrossPerspective || !crossBounds)
      throw new Error('Viewport junction resize target has no bounds');
    await page.mouse.move(
      crossBounds.x + crossBounds.width / 2,
      crossBounds.y + crossBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(crossBounds.x + 48, crossBounds.y + 38, { steps: 4 });
    await page.mouse.up();
    expect(Number(await columnHandle.getAttribute('aria-valuenow'))).toBeGreaterThan(
      beforeCrossColumn,
    );
    expect(Number(await rowHandle.getAttribute('aria-valuenow'))).toBeGreaterThan(beforeCrossRow);
    const afterCrossPerspective = await perspective.boundingBox();
    if (!afterCrossPerspective) throw new Error('Resized Perspective viewport has no bounds');
    expect(afterCrossPerspective.width).toBeGreaterThan(beforeCrossPerspective.width);
    expect(afterCrossPerspective.height).toBeGreaterThan(beforeCrossPerspective.height);
    await expect(crossHandle).toHaveAttribute('aria-valuetext', /Column \d+%, row \d+%/);
    await expect(crossHandle).not.toHaveClass(/dragging/);
    await expect(crossHandle).not.toBeFocused();
    await expect(page.locator('[data-resize]')).toHaveCount(4);

    const inspectorHandle = page.locator('[data-resize="inspector"]');
    const beforeInspector = Number(await inspectorHandle.getAttribute('aria-valuenow'));
    const handleBounds = await inspectorHandle.boundingBox();
    if (!handleBounds) throw new Error('Inspector resize handle has no bounds');
    await page.mouse.move(handleBounds.x + handleBounds.width / 2, handleBounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(handleBounds.x - 48, handleBounds.y + 100, { steps: 4 });
    await page.mouse.up();
    expect(Number(await inspectorHandle.getAttribute('aria-valuenow'))).toBeGreaterThan(
      beforeInspector,
    );
    await expect(inspectorHandle).not.toHaveClass(/dragging/);
    await expect(inspectorHandle).not.toBeFocused();
  });

  test('restores the per-map viewport workspace after reload', async ({ page }) => {
    await openEditor(page, { empty: true });
    const columnHandle = page.locator('[data-resize="viewport-column"]');
    const rowHandle = page.locator('[data-resize="viewport-top"]');
    const inspectorHandle = page.locator('[data-resize="inspector"]');
    await columnHandle.press('ArrowRight');
    await rowHandle.press('ArrowUp');
    await inspectorHandle.press('ArrowLeft');

    const perspective = page.getByLabel('Perspective map viewport');
    const perspectiveBounds = await perspective.boundingBox();
    const top = page.getByLabel('Top XY map viewport');
    const topBounds = await top.boundingBox();
    if (!perspectiveBounds || !topBounds) throw new Error('Viewport camera targets have no bounds');
    await page.mouse.move(
      perspectiveBounds.x + perspectiveBounds.width * 0.5,
      perspectiveBounds.y + perspectiveBounds.height * 0.65,
    );
    await page.mouse.wheel(0, -240);
    await page.mouse.move(
      topBounds.x + topBounds.width * 0.7,
      topBounds.y + topBounds.height * 0.4,
    );
    await page.mouse.wheel(0, -180);

    const perspectiveBefore = await perspectiveCamera(page);
    const topBefore = await viewportCamera(page, 'xy');
    const layoutBefore = {
      column: await columnHandle.getAttribute('aria-valuenow'),
      row: await rowHandle.getAttribute('aria-valuenow'),
      inspector: await inspectorHandle.getAttribute('aria-valuenow'),
    };
    await page.getByRole('button', { name: 'Show Perspective only' }).click();
    await expect(page.locator('.viewport-grid')).toHaveClass(/perspective-only/);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
    await expect(page.locator('.viewport-error')).toBeHidden();
    await expect(page.locator('.viewport-grid')).toHaveClass(/perspective-only/);
    await expect(page.getByRole('button', { name: 'Restore four viewports' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await perspectiveCamera(page)).toEqual(perspectiveBefore);
    expect(await viewportCamera(page, 'xy')).toEqual(topBefore);
    await expect(columnHandle).toHaveAttribute('aria-valuenow', layoutBefore.column!);
    await expect(rowHandle).toHaveAttribute('aria-valuenow', layoutBefore.row!);
    await expect(inspectorHandle).toHaveAttribute('aria-valuenow', layoutBefore.inspector!);
  });

  test('shows Perspective alone without rendering hidden orthographic panes', async ({ page }) => {
    await openEditor(page, { empty: true });
    const grid = page.locator('.viewport-grid');
    const perspective = page.locator('[data-viewport="perspective"]');
    const orthographicPanes = page.locator(
      '[data-viewport="xy"], [data-viewport="xz"], [data-viewport="yz"]',
    );
    const toggle = page.getByRole('button', { name: 'Show Perspective only' });

    await toggle.click();
    await expect(grid).toHaveClass(/perspective-only/);
    const restore = page.getByRole('button', { name: 'Restore four viewports' });
    await expect(restore).toHaveAttribute('aria-pressed', 'true');
    for (const pane of await orthographicPanes.all()) await expect(pane).toBeHidden();
    for (const resizer of await page.locator('.viewport-resizer').all()) {
      await expect(resizer).toBeHidden();
    }
    await expect(page.locator('.source-canvas[data-rendering="false"]')).toHaveCount(3);

    const gridBounds = await grid.boundingBox();
    const perspectiveBounds = await perspective.boundingBox();
    expect(perspectiveBounds).toEqual(gridBounds);

    await restore.click();
    await expect(grid).not.toHaveClass(/perspective-only/);
    for (const pane of await orthographicPanes.all()) await expect(pane).toBeVisible();
    await expect(page.locator('.source-canvas[data-rendering="true"]')).toHaveCount(4);
  });

  test('keeps the normal editor available when the browser has no site-tool API', async ({
    page,
  }) => {
    await openEditor(page);
    await expect(page.locator('html')).toHaveAttribute('data-worldview-site-tools', 'unsupported');
    await expect(page.locator('html')).toHaveAttribute('data-worldview-site-tool-count', '0');
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeEnabled();
    const compile = page.locator('[data-action="compile"]');
    const repeat = page.locator('[data-action="repeat-commands"]');
    await expect(compile.locator('.ph')).toHaveCount(1);
    await expect(repeat.locator('.ph')).toHaveCount(1);
    expect(
      await compile.evaluate((button) => ({
        width: button.getBoundingClientRect().width,
        overflow: getComputedStyle(button).overflow,
      })),
    ).toEqual({ width: 30, overflow: 'hidden' });
    await expect(
      page.getByRole('button', { name: 'More document actions', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Versions', exact: true })).toBeHidden();
    await openToolbarMenu(page, 'More document actions');
    await expect(page.getByRole('menuitem', { name: 'Versions', exact: true })).toBeVisible();
  });

  test('registers first-class live tools with revision guards, visible edits, and undo @ci-smoke', async ({
    page,
  }) => {
    await installSiteToolRegistry(page);
    await openEditor(page, { empty: true });
    await expect(page.locator('html')).toHaveAttribute('data-worldview-site-tools', 'ready');
    await expect(page.locator('html')).toHaveAttribute('data-worldview-site-tool-count', '21');

    const names = await page.evaluate(() => [
      ...(
        window as unknown as { worldviewSiteTools: Map<string, unknown> }
      ).worldviewSiteTools.keys(),
    ]);
    expect(names).toEqual(
      expect.arrayContaining([
        'worldview_inspect_editor',
        'worldview_list_objects',
        'worldview_select',
        'worldview_translate_selection',
        'worldview_create_box',
        'worldview_history',
        'worldview_replace_map_source',
        'worldview_open_project_map',
      ]),
    );

    const inspection = await executeSiteTool(page, 'worldview_inspect_editor');
    expect(inspection.revision).toBe(0);
    expect(inspection.counts).toMatchObject({ entities: 1, primitives: 0, faces: 0 });
    const documentId = inspection.documentId as string;
    const initialBox = await executeSiteTool(page, 'worldview_create_box', {
      expectedDocumentId: documentId,
      expectedRevision: 0,
      min: [-64, -64, 0],
      max: [64, 64, 64],
      material: 'DEV_FLOOR',
    });
    expect(initialBox.revision).toBe(1);
    const listed = await executeSiteTool(page, 'worldview_list_objects', {
      kind: 'brush',
      limit: 10,
    });
    const objects = listed.objects as Array<{
      id: string;
      bounds: unknown;
    }>;
    const firstBrush = objects[0]!;

    await executeSiteTool(page, 'worldview_select', {
      expectedDocumentId: documentId,
      expectedRevision: 1,
      mode: 'objects',
      brushIds: [firstBrush.id],
    });
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#status-message')).toContainText('Site tool: updated');

    await executeSiteTool(page, 'worldview_frame_view', { target: 'selection' });
    await expect(page.locator('#status-message')).toContainText('Site tool: framed');
    await executeSiteTool(page, 'worldview_set_tool', { tool: 'face' });
    await expect(page.getByRole('button', { name: 'Face', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await executeSiteTool(page, 'worldview_set_tool', { tool: 'select' });

    const translated = await executeSiteTool(page, 'worldview_translate_selection', {
      expectedDocumentId: documentId,
      expectedRevision: 1,
      delta: [16, 0, 0],
      textureLock: true,
    });
    expect(translated.revision).toBe(2);
    await expect(page.locator('#document-revision')).toHaveText('2');
    await expect(page.locator('#status-message')).toContainText('Site tool: translated');

    await expect(
      executeSiteTool(page, 'worldview_translate_selection', {
        expectedDocumentId: documentId,
        expectedRevision: 0,
        delta: [16, 0, 0],
      }),
    ).rejects.toThrow('Stale document revision');
    await expect(page.locator('#document-revision')).toHaveText('2');

    const undone = await executeSiteTool(page, 'worldview_history', {
      expectedDocumentId: documentId,
      expectedRevision: 2,
      action: 'undo',
    });
    const undoRevision = undone.revision as number;
    expect(undoRevision).toBeGreaterThan(1);
    await expect(page.locator('#status-message')).toContainText('Site tool: undo completed');
    const afterUndo = await executeSiteTool(page, 'worldview_list_objects', {
      kind: 'brush',
      query: firstBrush.id,
    });
    expect((afterUndo.objects as Array<{ bounds: unknown }>)[0]?.bounds).toEqual(firstBrush.bounds);

    const created = await executeSiteTool(page, 'worldview_create_box', {
      expectedDocumentId: documentId,
      expectedRevision: undoRevision,
      min: [192, 192, 0],
      max: [256, 256, 64],
      material: 'DEV_FLOOR',
    });
    expect(created.revision).toBeGreaterThan(undoRevision);
    expect(created.brushId).toEqual(expect.any(String));
    await expect(page.locator('#status-message')).toContainText('Site tool: created brush');

    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(page).toHaveURL(/\/new-map$/);
    await page.getByRole('button', { name: 'Create map', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-worldview-site-tool-count', '21');
    const blank = await executeSiteTool(page, 'worldview_inspect_editor');
    expect(blank.revision).toBe(0);
    expect(blank.counts).toMatchObject({ entities: 1, primitives: 0, faces: 0 });
  });
});
