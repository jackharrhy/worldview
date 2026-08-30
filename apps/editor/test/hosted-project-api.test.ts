import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticatedApiJson } from '../src/routes/hosted-project-api.js';

describe('authenticatedApiJson', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('redirects an unauthenticated route visit through login and back to the same page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const result = authenticatedApiJson(
      new Request(
        'https://worldview.example/project/0123456789ab-lambda/map/cdefghjkmnpq-test?view=top',
      ),
      'https://worldview.example/api/maps/map-1',
    );

    await expect(result).rejects.toMatchObject({ status: 302 });
    await result.catch((response: Response) => {
      expect(response.headers.get('location')).toBe(
        '/auth/login?returnTo=%2Fproject%2F0123456789ab-lambda%2Fmap%2Fcdefghjkmnpq-test%3Fview%3Dtop',
      );
      expect(response.headers.get('X-Remix-Reload-Document')).toBe('true');
    });
  });

  it('keeps non-authentication API status for the route error boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'Project not found' }, { status: 404 })),
    );

    await expect(
      authenticatedApiJson(
        new Request('https://worldview.example/project/0123456789ab-missing'),
        'https://worldview.example/api/projects/missing',
      ),
    ).rejects.toMatchObject({
      data: 'Project not found',
      init: { status: 404 },
    });
  });
});
