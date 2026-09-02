import { expect, test } from '@playwright/test';
import {
  brushesInDocument,
  createBoxBrush,
  createSequentialIdFactory,
  createStarterDocument,
  insertBrush,
  rebaseMapSource,
  serializeMap,
} from '../../../packages/worldview-editor/src/core/index.js';

import { installSiteToolRegistry, executeSiteTool } from './support/editor-browser-helpers.js';

test.describe('Editor local persistence', () => {
  test('reopens a durable detached hosted map without contacting its room', async ({ page }) => {
    const roomRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/sync/maps/')) {
        roomRequests.push(request.url());
      }
    });
    await installSiteToolRegistry(page);
    await page.goto('http://127.0.0.1:5174/');
    await expect(page.getByRole('button', { name: 'New map', exact: true })).toBeVisible();
    const detachedDocument = createStarterDocument();
    const document = insertBrush(
      detachedDocument,
      detachedDocument.entities[0]!.id,
      createBoxBrush(
        [0, 0, 0],
        [64, 64, 64],
        '__TB_empty',
        createSequentialIdFactory('recovered-local'),
      ),
    );
    const detachedSource = rebaseMapSource(detachedDocument, serializeMap(detachedDocument));
    const source = rebaseMapSource(document, serializeMap(document));
    const copy = {
      version: 1 as const,
      id: 'browser-detached-copy',
      originalMapId: 'hosted-map',
      documentKey: 'detached-hosted:browser-detached-copy',
      fileName: 'offline-recovered.map',
      profile: 'quake' as const,
      document: detachedDocument,
      source: detachedSource,
      originalMapVersion: 7,
      createdAt: Date.now(),
      reason: 'Offline edit limit reached.',
      operationCount: 2,
      encodedBytes: 512,
    };
    await page.evaluate(
      ({ record, recoveredDocument, recoveredSource }) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('worldview-editor');
          request.addEventListener('error', () => reject(request.error), { once: true });
          request.addEventListener(
            'success',
            () => {
              const database = request.result;
              const transaction = database.transaction(
                ['detached-maps', 'recovery-latest'],
                'readwrite',
              );
              transaction.objectStore('detached-maps').put(record);
              transaction.objectStore('recovery-latest').put({
                version: 1,
                snapshotId: `${record.documentKey}:revision:${recoveredDocument.revision}`,
                documentKey: record.documentKey,
                fileName: record.fileName,
                document: recoveredDocument,
                source: recoveredSource,
                savedDocumentRevision: -1,
                updatedAt: record.createdAt + 1,
                label: 'Recovered local edit',
                protected: false,
              });
              transaction.addEventListener(
                'complete',
                () => {
                  database.close();
                  resolve();
                },
                { once: true },
              );
              transaction.addEventListener('error', () => reject(transaction.error), {
                once: true,
              });
              transaction.addEventListener('abort', () => reject(transaction.error), {
                once: true,
              });
            },
            { once: true },
          );
        }),
      { record: copy, recoveredDocument: document, recoveredSource: source },
    );

    await page.reload();
    await page.getByRole('button', { name: /offline-recovered\.map/ }).click();

    await expect(page).toHaveURL(/\/local-map\/browser-detached-copy$/);
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
    const inspection = await executeSiteTool(page, 'worldview_inspect_editor');
    expect(inspection).toMatchObject({
      name: 'offline-recovered.map',
      documentId: document.id,
      revision: document.revision,
      dirty: true,
      counts: { primitives: brushesInDocument(document).length },
    });
    await expect(page.locator('#status-message')).toContainText('independent local copy');
    expect(roomRequests).toEqual([]);
  });
});
