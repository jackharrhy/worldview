import { expect, test } from '@playwright/test';
import {
  openEditor,
  perspectivePoint,
  chooseSelectOption,
} from './support/editor-browser-helpers.js';

test('keeps tools across the top and file operations in the Worldview menu', async ({ page }) => {
  await openEditor(page, { empty: true });
  await expect(page.locator('.toolrail')).toHaveCount(0);
  const toolbar = await page.locator('.topbar').boundingBox();
  const workspace = await page.locator('.workspace').boundingBox();
  expect(workspace!.x).toBe(0);
  const select = await page.getByRole('button', { name: 'Select', exact: true }).boundingBox();
  expect(select!.y).toBeLessThan(toolbar!.y + toolbar!.height);
  await page.getByRole('button', { name: 'Worldview document menu', exact: true }).click();
  for (const name of ['New', 'Open', 'Project', 'Save', 'Export normalized', 'Versions']) {
    await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
  }
  const popover = await page.locator('.document-menu-popover').boundingBox();
  expect(popover!.x).toBe(toolbar!.x);
  expect(popover!.y).toBe(toolbar!.y + toolbar!.height);
  await expect(page.locator('.document-menu-popover .wv-menu-section-heading')).toHaveCount(0);
  const saveLabel = page
    .getByRole('menuitem', { name: 'Save', exact: true })
    .locator('.wv-menu-item-text');
  const appearanceLabel = page
    .getByRole('menuitem', { name: 'Appearance', exact: true })
    .locator('.wv-menu-item-text');
  await expect(saveLabel).toHaveCSS('text-align', 'left');
  await expect(appearanceLabel).toHaveCSS('text-align', 'left');
  expect((await saveLabel.boundingBox())!.x).toBe((await appearanceLabel.boundingBox())!.x);
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Save', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.map$/);
  await chooseSelectOption(page, 'Grid size', '32');
  await expect(page.locator('#grid-size')).toContainText('32');
});

test('selection switches the open inspector tab without stealing canvas focus', async ({
  page,
}) => {
  await openEditor(page);
  const point = await perspectivePoint(page, 0.5, 0.58);
  await page.keyboard.down('Shift');
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up('Shift');
  await expect(page.getByRole('tab', { name: 'Face', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('[data-inspector-panel="textures"]')).toBeVisible();
  await expect(page.getByLabel('Perspective map viewport', { exact: true })).toBeFocused();
  // A deliberate tab choice remains until another selection, not a pointer hover.
  await page.getByRole('tab', { name: 'Map', exact: true }).click();
  await page.mouse.move(point.x + 10, point.y);
  await expect(page.getByRole('tab', { name: 'Map', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('tab', { name: 'Entity', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('keeps the document menu fixed while tools remain reachable on a narrow window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 720 });
  await openEditor(page, { empty: true });
  const documentMenu = page.getByRole('button', { name: 'Worldview document menu', exact: true });
  const before = await documentMenu.boundingBox();
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.locator('#map-source')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await documentMenu.boundingBox()).toEqual(before);
  expect(await page.locator('.topbar').evaluate((bar) => bar.getBoundingClientRect().height)).toBe(
    48,
  );
  await documentMenu.click();
  await expect(page.getByRole('menuitem', { name: 'Save', exact: true })).toBeVisible();
});

test('adjusts FOV, resets lens changes, and remembers a chosen default', async ({ page }) => {
  await openEditor(page, { empty: true });
  const button = page.getByRole('button', { name: 'Field of view', exact: true });
  await expect(button).toHaveText('FOV 60°');
  await button.click();
  const field = page.getByRole('textbox', { name: 'Vertical FOV (degrees)', exact: true });
  await field.fill('80');
  await field.press('Tab');
  await expect(button).toHaveAttribute('data-modified', 'true');
  await page.getByRole('button', { name: 'Reset to default', exact: true }).click();
  await expect(field).toHaveValue('60');
  await field.fill('75');
  await field.press('Tab');
  await page.getByRole('button', { name: 'Use current as default', exact: true }).click();
  await expect(button).toHaveAttribute('data-modified', 'false');
  await expect
    .poll(() => page.evaluate(() => Number(localStorage.getItem('worldview.editor.default-fov'))))
    .toBeCloseTo(75);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
  await expect(button).toContainText('75°');
  await button.click();
  await page.getByRole('button', { name: 'Restore 60° default', exact: true }).click();
  await expect(button).toHaveText('FOV 60°');
  await page.keyboard.press('Escape');
  const viewport = page.getByLabel('Perspective map viewport', { exact: true });
  await viewport.hover();
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Shift');
  await expect(button).toHaveAttribute('data-modified', 'true');
  await button.click();
  await page.getByRole('button', { name: 'Reset to default', exact: true }).click();
  await expect(button).toHaveText('FOV 60°');
  const camera = JSON.parse((await viewport.getAttribute('data-camera'))!);
  expect(camera.fieldOfViewDegrees).toBeCloseTo(60);
});

test('face and object selection leave a closed inspector closed', async ({ page }) => {
  await openEditor(page);
  const toggle = page.getByRole('button', { name: 'Inspector', exact: true });
  await page.getByRole('tab', { name: 'Map', exact: true }).click();
  await toggle.click();
  const point = await perspectivePoint(page, 0.5, 0.58);
  await page.keyboard.down('Shift');
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up('Shift');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.workspace')).toHaveClass(/inspector-closed/);
  await page.mouse.click(point.x, point.y);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.getByRole('tab', { name: 'Map', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('tooltips show registered keyboard shortcuts in brackets', async ({ page }) => {
  await openEditor(page, { empty: true });
  await page.getByRole('button', { name: 'Hull', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Build convex hull [B]');
  await page.getByRole('button', { name: 'Rotate', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Rotate selection [R]');
});
