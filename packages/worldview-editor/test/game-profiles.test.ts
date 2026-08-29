import { describe, expect, it } from 'vitest';
import { orderAssetMounts, worldviewGameProfile } from '../src/core/index.js';

describe('game profiles and asset mounts', () => {
  it('constrains GoldSrc to Valve 220 while Quake retains classic syntax', () => {
    expect(worldviewGameProfile('goldsrc').supportedFaceSyntaxes).toEqual(['valve-220']);
    expect(worldviewGameProfile('quake').supportedFaceSyntaxes).toContain('quake');
  });

  it('orders mounts deterministically by priority then identity', () => {
    const mounts = orderAssetMounts([
      {
        id: 'z',
        kind: 'browser-wad',
        label: 'Z',
        priority: 2,
        profile: 'quake',
        sourceName: 'z.wad',
        contentFingerprint: 'test-z',
      },
      { id: 'b', kind: 'builtin', label: 'B', priority: 1, profile: 'quake' },
      { id: 'a', kind: 'builtin', label: 'A', priority: 1, profile: 'quake' },
    ]);
    expect(mounts.map(({ id }) => id)).toEqual(['a', 'b', 'z']);
  });
});
