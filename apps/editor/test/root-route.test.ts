import { describe, expect, it } from 'vitest';
import { routeErrorPresentation } from '../src/routes/root-route.js';

function routeError(status: number, data: unknown = null): unknown {
  return { status, statusText: '', internal: true, data };
}

describe('routeErrorPresentation', () => {
  it.each([
    [401, 'Sign in to continue', 'login'],
    [403, 'This project is private', 'home'],
    [404, 'This page does not exist', 'home'],
  ] as const)('presents a safe %i recovery state', (status, title, recovery) => {
    expect(routeErrorPresentation(routeError(status, 'private server detail'))).toEqual(
      expect.objectContaining({ status, title, recovery }),
    );
  });

  it('does not expose unexpected exception details', () => {
    const presentation = routeErrorPresentation(new Error('database password leaked'));
    expect(presentation).toEqual({
      status: 500,
      title: 'Worldview could not load this page',
      description: 'Try loading it again. If the problem continues, return to your projects.',
      recovery: 'retry',
    });
    expect(JSON.stringify(presentation)).not.toContain('database password');
  });

  it('keeps an unexpected HTTP status without exposing its response body', () => {
    const presentation = routeErrorPresentation(routeError(418, 'private upstream response'));
    expect(presentation).toEqual({
      status: 418,
      title: 'Worldview could not load this page',
      description: 'Try loading it again. If the problem continues, return to your projects.',
      recovery: 'retry',
    });
    expect(JSON.stringify(presentation)).not.toContain('private upstream response');
  });
});
