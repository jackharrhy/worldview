import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createStarterDocument,
  parseMapSource,
  serializeMap,
} from '../../../packages/worldview-editor/src/core/index.js';

const projectId = 'abcdefghijkl';
const mapId = 'mnopqrstuvwx';
const hash = (source: string) => createHash('sha256').update(source).digest('hex');

test('reviews and pulls hosted source into a linked local map, then pushes a disk edit', async ({
  page,
}) => {
  const localSource = serializeMap(createStarterDocument());
  let hostedSource = `${localSource}\n// hosted edit\n`;
  let mapVersion = 1;
  const origin = 'http://127.0.0.1:5174';
  await page.route(`**/api/projects/${projectId}`, (route) =>
    route.fulfill({
      json: {
        project: {
          id: projectId,
          slug: 'linked',
          name: 'Linked',
          game: 'quake',
          role: 'owner',
          updatedAt: Date.now(),
          maps: [
            { id: mapId, slug: 'one', name: 'one.map', format: 'valve-220', updatedAt: Date.now() },
          ],
        },
      },
    }),
  );
  await page.route(`**/api/maps/${mapId}`, (route) =>
    route.fulfill({
      json: {
        map: {
          id: mapId,
          slug: 'one',
          projectId,
          projectSlug: 'linked',
          projectName: 'Linked',
          game: 'quake',
          name: 'one.map',
          format: 'valve-220',
          role: 'owner',
          actorId: projectId,
          displayName: 'Mapper',
          mapId,
          mapVersion,
          document: parseMapSource(hostedSource).document,
          source: hostedSource,
          sourceSha256: hash(hostedSource),
        },
      },
    }),
  );
  await page.route(`**/api/projects/${projectId}/maps/${mapId}/source`, async (route) => {
    const input = route.request().postDataJSON() as {
      expectedMapVersion: number;
      expectedSourceSha256: string;
      source: string;
    };
    if (
      input.expectedMapVersion !== mapVersion ||
      input.expectedSourceSha256 !== hash(hostedSource)
    ) {
      await route.fulfill({
        status: 409,
        json: { status: 'conflict', mapVersion, sourceSha256: hash(hostedSource) },
      });
      return;
    }
    hostedSource = input.source;
    mapVersion++;
    await route.fulfill({
      json: {
        status: 'replaced',
        map: {
          mapId,
          mapVersion,
          document: parseMapSource(hostedSource).document,
          source: hostedSource,
          sourceSha256: hash(hostedSource),
        },
      },
    });
  });
  await page.addInitScript(
    ({ source, manifest }) => {
      Object.assign(window, {
        showDirectoryPicker: async () => {
          const root = await navigator.storage.getDirectory();
          const folder = await root.getDirectoryHandle('linked-project', { create: true });
          for (const [name, content] of [
            ['worldview.project.json', manifest],
            ['one.map', source],
          ]) {
            const handle = await folder.getFileHandle(name!, { create: true });
            const writer = await handle.createWritable();
            await writer.write(content!);
            await writer.close();
          }
          return folder;
        },
      });
    },
    {
      source: localSource,
      manifest: JSON.stringify({
        schemaVersion: 1,
        name: 'Linked',
        game: 'quake',
        mapRoots: ['.'],
        resources: { wads: [] },
        buildProfiles: [],
      }),
    },
  );
  await page.goto(origin);
  await page.getByRole('button', { name: 'Open project folder', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
  await expect(page.locator('.viewport-error')).toBeHidden();
  await expect(page.locator('#status-message')).toContainText('Opened Linked: 1 maps');
  await page.getByRole('button', { name: 'Worldview document menu' }).click();
  await page.getByRole('menuitem', { name: 'Project sync…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Project sync' });
  await expect(dialog).toContainText('Link a hosted project');
  await dialog.getByRole('textbox', { name: 'Hosted project ID' }).fill(projectId);
  await dialog.getByRole('button', { name: 'Load maps' }).click();
  await dialog.getByRole('combobox', { name: 'Hosted map for one.map' }).selectOption(mapId);
  await dialog.getByRole('button', { name: 'Save project links' }).click();
  await expect(dialog).toContainText('No common sync point');
  const savedManifest = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle('linked-project');
    return (await (await folder.getFileHandle('worldview.project.json')).getFile()).text();
  });
  expect(JSON.parse(savedManifest).hosted).toEqual({
    origin,
    projectId,
    maps: [{ path: 'one.map', mapId }],
  });
  await expect(dialog.locator('.project-sync-diff')).toContainText('hosted edit');
  await dialog.getByRole('button', { name: 'Pull hosted to disk' }).click();
  await expect(dialog).toContainText('In sync');
  const afterPull = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle('linked-project');
    return (await (await folder.getFileHandle('one.map')).getFile()).text();
  });
  expect(afterPull).toBe(hostedSource);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle('linked-project');
    const file = await folder.getFileHandle('one.map');
    const writer = await file.createWritable();
    await writer.write((await (await file.getFile()).text()) + '// local edit\n');
    await writer.close();
  });
  await dialog.getByRole('button', { name: 'one.map' }).click();
  await expect(dialog).toContainText('Local changed');
  await dialog.getByRole('button', { name: 'Push disk to hosted' }).click();
  await expect(dialog).toContainText('In sync');
  expect(hostedSource).toContain('local edit');
  hostedSource += '// concurrent hosted edit\n';
  mapVersion++;
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle('linked-project');
    const file = await folder.getFileHandle('one.map');
    const writer = await file.createWritable();
    await writer.write((await (await file.getFile()).text()) + '// concurrent local edit\n');
    await writer.close();
  });
  await dialog.getByRole('button', { name: 'one.map' }).click();
  await expect(dialog).toContainText('Both changed');
  await expect(dialog.locator('.project-sync-diff')).toContainText('concurrent hosted edit');
  await expect(dialog.locator('.project-sync-diff')).toContainText('concurrent local edit');
});
