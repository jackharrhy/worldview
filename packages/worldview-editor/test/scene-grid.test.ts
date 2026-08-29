import { describe, expect, it } from 'vitest';

import { adaptiveGridSpacing } from '../src/render/scene-grid.js';

describe('adaptive editor grid', () => {
  it('keeps the selected spacing when it is readable', () => {
    expect(adaptiveGridSpacing(16, 1)).toBe(16);
  });

  it('promotes by powers of two until lines are at least eight pixels apart', () => {
    expect(adaptiveGridSpacing(1, 4)).toBe(32);
    expect(adaptiveGridSpacing(16, 4)).toBe(32);
  });

  it('never renders a sub-unit grid', () => {
    expect(adaptiveGridSpacing(0.25, 0.25)).toBe(2);
  });
});
