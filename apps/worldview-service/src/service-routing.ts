import { ServiceHttpError, type ServiceRequestContext } from './service-http.js';

export type ServiceMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface ServiceRouteMatch {
  readonly captures: readonly string[];
}

export interface ServiceRoute {
  readonly id: string;
  readonly method: ServiceMethod;
  readonly pattern: string | RegExp;
  readonly handle: (
    context: ServiceRequestContext,
    match: ServiceRouteMatch,
  ) => void | Promise<void>;
}

export function defineRoute(
  id: string,
  method: ServiceMethod,
  pattern: string | RegExp,
  handle: ServiceRoute['handle'],
): ServiceRoute {
  if (pattern instanceof RegExp && (pattern.global || pattern.sticky)) {
    throw new Error(`Route ${id} cannot use a stateful regular expression`);
  }
  if (
    pattern instanceof RegExp &&
    (!pattern.source.startsWith('^') || !pattern.source.endsWith('$'))
  ) {
    throw new Error(`Route ${id} regular expression must match the whole path`);
  }
  return { id, method, pattern, handle };
}

export function matchRoute(
  route: ServiceRoute,
  method: string | undefined,
  pathname: string,
): ServiceRouteMatch | null {
  if (method !== route.method) return null;
  if (typeof route.pattern === 'string') {
    return pathname === route.pattern ? { captures: [] } : null;
  }
  const matched = route.pattern.exec(pathname);
  return matched ? { captures: matched.slice(1) } : null;
}

export async function dispatchRoutes(
  routes: readonly ServiceRoute[],
  context: ServiceRequestContext,
): Promise<boolean> {
  for (const route of routes) {
    const match = matchRoute(route, context.request.method, context.url.pathname);
    if (!match) continue;
    await route.handle(context, match);
    return true;
  }
  return false;
}

export function pathParameter(match: ServiceRouteMatch, index: number): string {
  const encoded = match.captures[index];
  if (encoded === undefined) throw new Error(`Route capture ${index} is missing`);
  try {
    return decodeURIComponent(encoded);
  } catch {
    throw new ServiceHttpError(400, 'Request path contains invalid encoding');
  }
}
