import { expect, test } from '@playwright/test';

const editorOrigin = 'http://127.0.0.1:5174';

test.describe('Application routing', () => {
  test('isolates home and prewarms the editor without initializing it @ci-smoke', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const state = { requestAdapterCalls: 0 };
      Object.defineProperty(window, 'worldviewRouteProbe', { value: state });
      const gpu = navigator.gpu;
      if (!gpu) return;
      const prototype = Object.getPrototypeOf(gpu) as object;
      const original = Reflect.get(prototype, 'requestAdapter') as
        | ((...arguments_: unknown[]) => unknown)
        | undefined;
      if (!original) return;
      Reflect.set(prototype, 'requestAdapter', function (this: object, ...arguments_: unknown[]) {
        state.requestAdapterCalls += 1;
        return Reflect.apply(original, this, arguments_);
      });
    });

    const requestedModules: string[] = [];
    page.on('request', (request) => requestedModules.push(new URL(request.url()).pathname));
    await page.goto(editorOrigin);
    await expect(page.getByRole('heading', { name: 'Worldview Editor' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(requestedModules.some((pathname) => pathname.includes('/editor-route'))).toBe(false);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-worldview-editor-ready', 'true');

    const editorPreload = page.waitForRequest((request) =>
      new URL(request.url()).pathname.includes('/editor-route'),
    );
    await page.getByRole('button', { name: 'New map' }).click();
    await expect(page).toHaveURL(`${editorOrigin}/new-map`);
    await editorPreload;

    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-worldview-editor-ready', 'true');
    expect(
      await page.evaluate(
        () =>
          (
            window as typeof window & {
              worldviewRouteProbe: { requestAdapterCalls: number };
            }
          ).worldviewRouteProbe.requestAdapterCalls,
      ),
    ).toBe(0);
  });

  test('renders a designed root error boundary for unknown routes @ci-smoke', async ({ page }) => {
    await page.goto(`${editorOrigin}/not-a-worldview-route`);

    const boundary = page.locator('[data-error-status="404"]');
    await expect(boundary).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This page does not exist' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to projects' })).toHaveAttribute('href', '/');
    await expect(page.getByText('Unexpected Application Error!')).toHaveCount(0);
    await expect(page.getByText('Hey developer')).toHaveCount(0);
    await expect(boundary.locator('[style]')).toHaveCount(0);
  });

  test('uses a document navigation for the 4orm login handoff @ci-smoke', async ({ page }) => {
    const hostedPath =
      '/project/evj76hs3vw2r-test-project/map/t2y883mjwq4m-test?viewport=perspective';
    let loginWasDocumentNavigation = false;

    await page.route('**/api/maps/**', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"error":"Unauthorized"}',
      }),
    );
    await page.route('**/auth/login?**', (route) => {
      loginWasDocumentNavigation = route.request().isNavigationRequest();
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html data-oauth-handoff="true"><body>4orm login handoff</body></html>',
      });
    });

    await page.goto(`${editorOrigin}${hostedPath}`);

    await expect(page.locator('html')).toHaveAttribute('data-oauth-handoff', 'true');
    expect(loginWasDocumentNavigation).toBe(true);
    const loginUrl = new URL(page.url());
    expect(loginUrl.pathname).toBe('/auth/login');
    expect(loginUrl.searchParams.get('returnTo')).toBe(hostedPath);
  });

  test('keeps hosted authorization status and server details out of the page @ci-smoke', async ({
    page,
  }) => {
    await page.route('**/api/maps/**', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"error":"private membership lookup detail"}',
      }),
    );

    await page.goto(`${editorOrigin}/project/evj76hs3vw2r-private/map/t2y883mjwq4m-private`);

    await expect(page.locator('[data-error-status="403"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This project is private' })).toBeVisible();
    await expect(page.getByText('private membership lookup detail')).toHaveCount(0);
  });
});
