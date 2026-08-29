import { describe, expect, it } from 'vitest';

import { creationBounds } from '../src/render/viewport-geometry.js';

describe('orthographic creation grid alignment', () => {
  it.each([
    ['xy', 2],
    ['xz', 1],
    ['yz', 0],
  ] as const)('snaps visible and implicit depth axes in %s', (viewport, hiddenAxis) => {
    const bounds = creationBounds(
      [13, 19, 23],
      [91, 117, 149],
      viewport,
      32,
      { min: [3, 5, 7], max: [27, 29, 31] },
      false,
      false,
    );

    expect(bounds).not.toBeNull();
    expect([...bounds!.min, ...bounds!.max].every((value) => value % 32 === 0)).toBe(true);
    expect(bounds!.max[hiddenAxis] - bounds!.min[hiddenAxis]).toBeGreaterThanOrEqual(32);
  });
});
