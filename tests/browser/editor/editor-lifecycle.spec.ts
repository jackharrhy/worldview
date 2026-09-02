import { expect, test } from '@playwright/test';
import {
  createStarterDocument,
  serializeMap,
} from '../../../packages/worldview-editor/src/core/index.js';

test.describe('Editor application lifetime', () => {
  test('owns one event and renderer lifetime across repeated route mounts @ci-smoke', async ({
    page,
  }) => {
    const gpuErrors: string[] = [];
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        /WebGPU|Invalid TextureView|cannot be used with \[Device\]/i.test(message.text())
      ) {
        gpuErrors.push(message.text());
      }
    });
    await page.goto('http://127.0.0.1:5174/new-map');

    for (let cycle = 0; cycle < 2; cycle += 1) {
      await page.getByRole('button', { name: 'Create map', exact: true }).click();
      await expect(page).toHaveURL('http://127.0.0.1:5174/editor');
      await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
      await page.evaluate(() => performance.clearMeasures('worldview.editor.change-presentation'));
      await page.getByRole('button', { name: 'Source', exact: true }).click();
      await page.locator('#map-source').fill(serializeMap(createStarterDocument()));
      await page.getByRole('button', { name: 'Apply source', exact: true }).click();
      await expect(page.locator('#status-message')).toContainText('Apply map source');
      expect(
        await page.evaluate(
          () => performance.getEntriesByName('worldview.editor.change-presentation').length,
        ),
      ).toBe(1);

      await page.getByRole('button', { name: 'New', exact: true }).click();
      await expect(page).toHaveURL(/\/new-map$/);
      await expect(page.locator('html')).not.toHaveAttribute('data-worldview-editor-ready', 'true');
      await expect(page.locator('html')).not.toHaveAttribute('data-worldview-site-tools', /.+/);
    }
    expect(gpuErrors).toEqual([]);
  });

  test('cannot publish readiness after the route leaves during startup @ci-smoke', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.addInitScript(() => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const state = { registered: 0, resolved: 0, unregistered: 0 };
      Object.defineProperty(window, 'worldviewLifecycleTest', {
        configurable: true,
        value: {
          state,
          release,
        },
      });
      Object.defineProperty(document, 'modelContext', {
        configurable: true,
        value: {
          registerTool(tool: unknown, options?: { readonly signal?: AbortSignal }) {
            void tool;
            state.registered += 1;
            options?.signal?.addEventListener(
              'abort',
              () => {
                state.unregistered += 1;
              },
              { once: true },
            );
            return gate.then(() => {
              state.resolved += 1;
            });
          },
        },
      });
    });

    await page.goto('http://127.0.0.1:5174/new-map');
    await page.getByRole('button', { name: 'Create map', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-worldview-site-tool-owner', /.+/);
    await expect(page.locator('html')).not.toHaveAttribute('data-worldview-editor-ready', 'true');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    await page.goBack();
    await expect(page).toHaveURL(/\/new-map$/);
    await expect(page.locator('html')).not.toHaveAttribute('data-worldview-site-tool-owner', /.+/);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { state } = (
            window as unknown as {
              worldviewLifecycleTest: {
                state: { registered: number; unregistered: number };
              };
            }
          ).worldviewLifecycleTest;
          return state.unregistered === state.registered;
        }),
      )
      .toBe(true);

    await page.evaluate(() => {
      const lifecycle = (
        window as unknown as {
          worldviewLifecycleTest: { release(): void };
        }
      ).worldviewLifecycleTest;
      lifecycle.release();
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { state } = (
            window as unknown as {
              worldviewLifecycleTest: {
                state: { registered: number; resolved: number };
              };
            }
          ).worldviewLifecycleTest;
          return state.resolved === state.registered;
        }),
      )
      .toBe(true);
    await expect(page.locator('html')).not.toHaveAttribute('data-worldview-editor-ready', 'true');
    await expect(page.locator('html')).not.toHaveAttribute('data-worldview-site-tools', /.+/);
    expect(pageErrors).toEqual([]);
  });
});
