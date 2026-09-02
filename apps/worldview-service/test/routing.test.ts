import { describe, expect, it } from 'vitest';

import { createServiceRoutes } from '../src/routes/index.js';
import {
  defineRoute,
  matchRoute,
  pathParameter,
  type ServiceMethod,
} from '../src/service-routing.js';
import { fixture } from './service-fixture.js';

const routeCases: readonly (readonly [ServiceMethod, string, string])[] = [
  ['GET', '/health', 'health'],
  ['GET', '/auth/login', 'oauth-login'],
  ['GET', '/auth/callback', 'oauth-callback'],
  ['POST', '/auth/logout', 'logout'],
  ['GET', '/api/session', 'session'],
  ['GET', '/api/projects', 'list-projects'],
  ['POST', '/api/projects', 'create-project'],
  ['GET', '/api/projects/project-1', 'get-project'],
  ['GET', '/api/projects/project-1/members', 'list-project-members'],
  ['PUT', '/api/projects/project-1/members/user-1', 'set-project-member-role'],
  ['DELETE', '/api/projects/project-1/members/user-1', 'remove-project-member'],
  ['POST', '/api/projects/project-1/maps', 'create-map'],
  ['GET', '/api/assets/search', 'search-assets'],
  ['GET', '/api/projects/project-1/resources', 'list-project-resources'],
  ['POST', '/api/projects/project-1/resources', 'mount-project-resource'],
  ['GET', '/api/projects/project-1/resources/mount-1/content', 'get-project-resource-content'],
  ['GET', '/api/maps/map-1', 'get-map'],
  ['POST', '/api/maps/map-1/checkpoints', 'create-map-checkpoint'],
  ['POST', '/api/maps/map-1/realtime-ticket', 'create-realtime-ticket'],
  ['GET', '/api/maps/map-1/builds', 'list-map-builds'],
  ['POST', '/api/maps/map-1/builds', 'create-map-build'],
  ['GET', `/api/maps/map-1/builds/build-1/artifacts/${'a'.repeat(64)}`, 'get-build-artifact'],
];

describe('hosted service routing', () => {
  it('maps every public method and path to exactly one named handler', async () => {
    const app = await fixture();
    const routes = createServiceRoutes(app.options);
    expect(routes).toHaveLength(routeCases.length);
    expect(new Set(routes.map((route) => route.id)).size).toBe(routes.length);
    for (const [method, pathname, expected] of routeCases) {
      const matches = routes
        .filter((route) => matchRoute(route, method, pathname))
        .map((route) => route.id);
      expect(matches, `${method} ${pathname}`).toEqual([expected]);
    }
  });

  it('does not let path captures consume route separators or suffixes', async () => {
    const app = await fixture();
    const routes = createServiceRoutes(app.options);
    expect(routes.some((route) => matchRoute(route, 'GET', '/api/projects/a/b'))).toBe(false);
    expect(
      routes.some((route) => matchRoute(route, 'GET', '/api/maps/a/builds/b/artifacts/a')),
    ).toBe(false);
  });

  it('decodes matched identifiers at one boundary and rejects malformed encoding', () => {
    const route = defineRoute('encoded', 'GET', /^\/items\/([^/]+)$/, () => undefined);
    const encoded = matchRoute(route, 'GET', '/items/map%2Fone');
    expect(encoded && pathParameter(encoded, 0)).toBe('map/one');

    const malformed = matchRoute(route, 'GET', '/items/%E0%A4%A');
    expect(() => malformed && pathParameter(malformed, 0)).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
  });

  it('rejects stateful matcher definitions before they can make dispatch nondeterministic', () => {
    expect(() => defineRoute('stateful', 'GET', /items/g, () => undefined)).toThrow(
      'cannot use a stateful regular expression',
    );
  });

  it('rejects partial regular-expression matchers before they can shadow another route', () => {
    expect(() => defineRoute('partial', 'GET', /^\/items/, () => undefined)).toThrow(
      'must match the whole path',
    );
  });
});
