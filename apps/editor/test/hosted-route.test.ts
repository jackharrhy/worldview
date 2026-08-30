import { describe, expect, it } from 'vitest';
import {
  hostedIdFromRouteReference,
  hostedMapPath,
  hostedProjectPath,
} from '../src/routes/hosted-route.js';

describe('hosted route references', () => {
  const project = { id: '0123456789ab', slug: 'lambda-complex' };
  const map = { id: 'cdefghjkmnpq', slug: 'test-chamber' };

  it('builds readable paths with authoritative IDs and decorative names', () => {
    expect(hostedProjectPath(project)).toBe('/project/0123456789ab-lambda-complex');
    expect(hostedMapPath(project, map)).toBe(
      '/project/0123456789ab-lambda-complex/map/cdefghjkmnpq-test-chamber',
    );
  });

  it('resolves missing and stale decorative names from the fixed ID prefix', () => {
    expect(hostedIdFromRouteReference(project.id)).toBe(project.id);
    expect(hostedIdFromRouteReference(`${project.id}-old-project-name`)).toBe(project.id);
  });

  it('rejects malformed or legacy identifiers', () => {
    expect(hostedIdFromRouteReference('0123456789abmissing-delimiter')).toBeNull();
    expect(hostedIdFromRouteReference('9ae4a5d7-3ea0-4cdf-9164-757063c8815a')).toBeNull();
  });
});
