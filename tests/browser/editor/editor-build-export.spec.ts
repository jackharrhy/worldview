import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { makeBsp } from '../../../packages/worldview/test/fixtures.js';
import {
  executeSiteTool,
  installSiteToolRegistry,
  openEditor,
} from './support/editor-browser-helpers.js';

test('exports exact BSP bytes, packages captured source, and writes a selected directory', async ({
  page,
}, testInfo) => {
  const bsp = makeBsp({ version: 29 });
  let source = '';
  const qualities: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://127.0.0.1:8788/**', async (route) => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith('/capabilities'))
      return route.fulfill({
        headers,
        json: {
          protocolVersion: 1,
          compileProfiles: [
            {
              id: 'default',
              label: 'Test compiler',
              game: 'quake',
              qualities: ['preview', 'final'],
            },
          ],
          launchProfiles: [],
        },
      });
    const input = route.request().postDataJSON();
    source = input.mapText;
    qualities.push(input.quality);
    await route.fulfill({
      headers,
      json: {
        status: 'succeeded',
        buildId: `export-${qualities.length}`,
        sourceDocumentRevision: input.expectedDocumentRevision,
        diagnostics: [],
        logs: [],
        elapsedMilliseconds: 1,
        artifacts: [
          {
            name: 'worldview_preview.bsp',
            kind: 'bsp',
            mediaType: 'application/x-quake-bsp',
            base64: Buffer.from(bsp).toString('base64'),
          },
        ],
      },
    });
  });
  await page.addInitScript(() => {
    Object.assign(window, {
      showDirectoryPicker: async () => {
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle('test-exports', { create: true });
      },
    });
  });
  await installSiteToolRegistry(page);
  await openEditor(page);
  const menu = () => page.getByRole('button', { name: 'Build menu', exact: true }).click();
  await menu();
  await expect(
    page.getByRole('menuitem', { name: 'Export latest build', exact: true }),
  ).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Quality: Preview', exact: true }).hover();
  await page.getByRole('menuitemradio', { name: 'Final', exact: true }).click();
  await menu();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Build & export', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('untitled.bsp');
  expect(await readFile((await download.path())!)).toEqual(Buffer.from(bsp));
  expect(qualities).toEqual(['final']);
  await menu();
  await page.getByRole('menuitem', { name: 'Export settings…' }).click();
  const settings = page.getByRole('dialog', { name: 'Export settings', exact: true });
  await settings.getByText('Include map source and WADs', { exact: true }).click();
  await settings.getByRole('button', { name: 'Done', exact: true }).click();
  await menu();
  const zipPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export latest build', exact: true }).click();
  const zip = await zipPromise;
  expect(zip.suggestedFilename()).toBe('untitled.zip');
  const files = unzipSync(await readFile((await zip.path())!));
  expect(new TextDecoder().decode(files['maps/untitled.map'])).toBe(source);
  expect(files['maps/untitled.bsp']).toEqual(bsp);
  expect(files['worldview_dev.wad']!.length).toBeGreaterThan(0);
  await menu();
  await page.getByRole('menuitem', { name: 'Export settings…' }).click();
  await settings.getByText('Include map source and WADs', { exact: true }).click();
  await settings.getByRole('button', { name: 'Choose directory…', exact: true }).click();
  await expect(settings).toContainText('test-exports');
  await settings.getByText('Export after every successful build', { exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('export-settings.png') });
  await settings.getByRole('button', { name: 'Done', exact: true }).click();
  await menu();
  await page.getByRole('menuitem', { name: 'Build & preview', exact: true }).click();
  await expect(page.locator('#status-message')).toContainText('Exported test-exports/untitled.bsp');
  const bytes = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle('test-exports');
    const handle = await directory.getFileHandle('untitled.bsp');
    return [...new Uint8Array(await (await handle.getFile()).arrayBuffer())];
  });
  expect(bytes).toEqual([...bsp]);
  const stored = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('worldview-editor');
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(request.error));
    });
    const records = await new Promise<
      { quality: string; directory: FileSystemDirectoryHandle; afterBuild: boolean }[]
    >((resolve, reject) => {
      const request = database.transaction('build-exports').objectStore('build-exports').getAll();
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(request.error));
    });
    database.close();
    const record = records.find((entry) => entry.directory?.name === 'test-exports');
    if (!record) throw new Error('Export directory was not persisted');
    const file = await (await record.directory.getFileHandle('untitled.bsp')).getFile();
    return { quality: record.quality, afterBuild: record.afterBuild, size: file.size };
  });
  expect(stored).toEqual({ quality: 'final', afterBuild: true, size: bsp.length });

  const inspection = await executeSiteTool(page, 'worldview_inspect_editor');
  await executeSiteTool(page, 'worldview_create_box', {
    expectedDocumentId: inspection.documentId,
    expectedRevision: inspection.revision,
    min: [512, 512, 0],
    max: [576, 576, 64],
    material: 'DEV_FLOOR',
  });
  await menu();
  await expect(
    page.getByRole('menuitem', { name: 'Export latest build (out of date)' }),
  ).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('build-menu.png') });
  expect(errors).toEqual([]);
});
