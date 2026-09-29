import { expect, test } from '@playwright/test';

const projectId = '8v4qjva5vyxk';
const mapId = 'a1jnagpqeyzq';
const origin = `http://127.0.0.1:${process.env.WORLDVIEW_EDITOR_TEST_PORT ?? 5174}`;

test('opens a matching local project from the hosted Maps page without opening a hosted map', async ({
  page,
}) => {
  await page.route(`**/api/projects/${projectId}`, (route) =>
    route.fulfill({
      json: {
        project: {
          id: projectId,
          slug: 'gower-complex',
          name: 'Gower Complex',
          game: 'gower',
          role: 'owner',
          updatedAt: Date.now(),
          maps: [
            {
              id: mapId,
              slug: 'home',
              name: 'home.map',
              format: 'valve-220',
              updatedAt: Date.now(),
            },
          ],
        },
      },
    }),
  );
  await page.addInitScript(
    (ids) => {
      let picks = 0;
      Object.assign(window, {
        showDirectoryPicker: async () => {
          const root = await navigator.storage.getDirectory();
          const folder = await root.getDirectoryHandle(`gower-project-${++picks}`, {
            create: true,
          });
          const manifest = JSON.stringify({
            schemaVersion: 1,
            name: 'Gower Complex',
            game: 'gower',
            mapRoots: ['.'],
            resources: { wads: [], gameRoots: [], spriteRoots: [], entityDefinitions: [] },
            buildProfiles: [],
            hosted: {
              origin: location.origin,
              projectId: picks === 1 ? 'abcdefghijkl' : ids.projectId,
              maps: [{ path: 'home.map', mapId: ids.mapId }],
            },
          });
          for (const [name, contents] of [
            ['worldview.project.json', manifest],
            ['home.map', '{\n"classname" "worldspawn"\n}\n'],
          ]) {
            const file = await folder.getFileHandle(name!, { create: true });
            const writer = await file.createWritable();
            await writer.write(contents!);
            await writer.close();
          }
          return folder;
        },
      });
    },
    { projectId, mapId },
  );
  await page.goto(`${origin}/project/${projectId}-gower-complex`);
  const open = page.getByRole('button', { name: 'Open local project' });
  await expect(open).toBeVisible();
  await open.click();
  await expect(page.getByRole('alert')).toContainText('linked to a different hosted project');
  await expect(page).toHaveURL(/\/project\//);
  await open.click();
  await expect(page).toHaveURL(`${origin}/editor`);
  await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
  await expect(page.locator('#status-message')).toContainText('Opened Gower Complex: 1 maps');
});
