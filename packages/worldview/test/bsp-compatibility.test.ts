import { describe, expect, it } from 'vitest';

import { decodeMipTexture, parseBsp, visibleWorldFaceMask } from '../src/core/index.js';
import { makeBsp, makeBsp2, makeMipTexture, makePalette } from './fixtures.js';

describe('Quake-family BSP compatibility', () => {
  it('decodes bounded noncanonical mip dimensions', () => {
    const decoded = decodeMipTexture(makeMipTexture(29, 'porta72', 93, 207), makePalette());
    expect(decoded).toMatchObject({ name: 'porta72', width: 93, height: 207 });
    expect(decoded.levels.map(({ width, height }) => [width, height])).toEqual([
      [93, 207],
      [46, 103],
      [23, 51],
      [11, 25],
    ]);
  });

  it('parses sanitized BSP2 with widened geometry, visibility, and collision records', () => {
    const world = parseBsp(makeBsp2({ visibility: true, collision: true }));
    expect(world).toMatchObject({
      format: 'quake-bsp2',
      version: 'BSP2',
      warnings: [],
      lightmapBytesPerTexel: 1,
    });
    expect(world.indices).toEqual(new Uint32Array([0, 1, 2, 0, 2, 3]));
    expect(world.trace).not.toBeNull();
    expect(world.visibility?.markSurfaces).toEqual(new Uint32Array([0]));
    expect(world.collision?.clipnodes).toEqual(new Int32Array([1, -1, -2]));
  });

  it('distinguishes the unsupported early 2PSB layout from sanitized BSP2', () => {
    const bytes = makeBsp2();
    new TextEncoder().encodeInto('2PSB', bytes.subarray(0, 4));
    expect(() => parseBsp(bytes)).toThrow(/earlier 2PSB layout/);
  });

  it('rejects invalid widened BSP2 face ranges', () => {
    const bytes = makeBsp2();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const faceOffset = view.getUint32(4 + 7 * 8, true);
    view.setInt32(faceOffset + 8, 2_147_483_647, true);
    expect(() => parseBsp(bytes)).toThrow(/face 0 surfedge range is invalid/);
  });

  it('warns but retains a strictly bounded noncanonical embedded MIPTEX', () => {
    const world = parseBsp(
      makeBsp({
        version: 29,
        textureName: 'porta72',
        textureWidth: 93,
        textureHeight: 207,
      }),
    );
    expect(world.materials[0]?.embeddedTexture).toBeDefined();
    expect(world.warnings).toEqual([
      {
        code: 'noncanonical-miptex-dimensions',
        message: 'MIPTEX porta72 has noncanonical dimensions 93x207; expected 16-unit alignment',
        textureIndex: 0,
        textureName: 'porta72',
        width: 93,
        height: 207,
      },
    ]);
  });

  it('substitutes a missing material for an unusable MIPTEX record', () => {
    const bytes = makeBsp({ version: 29, textureName: 'somemissingtext' });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const textureLumpOffset = view.getUint32(4 + 2 * 8, true);
    const textureOffset = textureLumpOffset + view.getInt32(textureLumpOffset + 4, true);
    view.setUint32(textureOffset + 16, 0, true);
    view.setUint32(textureOffset + 20, 0, true);

    const world = parseBsp(bytes);

    expect(world.materials[0]).toEqual({ name: 'somemissingtext', kind: 'opaque' });
    expect(world.warnings).toEqual([
      {
        code: 'unusable-miptex',
        message:
          'MIPTEX somemissingtext could not be decoded and will use a fallback material: MIPTEX somemissingtext has zero dimensions',
        textureIndex: 0,
        textureName: 'somemissingtext',
        reason: 'MIPTEX somemissingtext has zero dimensions',
      },
    ]);
  });

  it('bounds each MIPTEX to its own record before applying a fallback', () => {
    const broken = makeMipTexture(29, 'broken');
    new DataView(broken.buffer, broken.byteOffset, broken.byteLength).setUint32(
      24,
      broken.length,
      true,
    );
    const world = parseBsp(
      makeBsp({
        version: 29,
        textureRecords: [broken, makeMipTexture(29, 'sound')],
      }),
    );

    expect(world.materials[0]).toEqual({ name: 'broken', kind: 'opaque' });
    expect(world.materials[1]?.embeddedTexture?.name).toBe('sound');
    expect(world.warnings).toContainEqual(
      expect.objectContaining({ code: 'unusable-miptex', textureName: 'broken' }),
    );
  });

  it('clips overlong visibility zero runs and reports the compatibility repair', () => {
    const bytes = makeBsp({ visibility: true });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const visibilityLumpOffset = view.getUint32(4 + 4 * 8, true);
    view.setUint32(8 + 4 * 8, 2, true);
    bytes.set([0, 2], visibilityLumpOffset);

    const world = parseBsp(bytes);

    expect(visibleWorldFaceMask(world.trace, world.visibility, [12, 0, 0])).toEqual(
      new Uint8Array([0]),
    );
    expect(world.warnings).toContainEqual({
      code: 'noncanonical-visibility-run',
      message: 'BSP visibility contains a zero run longer than its row; the run was safely clipped',
    });
  });

  it('accepts the full byte range of extended light-style indices', () => {
    const bytes = makeBsp({ version: 29 });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const faceLumpOffset = view.getUint32(4 + 7 * 8, true);
    view.setUint8(faceLumpOffset + 12, 200);
    expect(parseBsp(bytes).faces[0]?.lightmap.styles).toEqual([200]);
  });

  it('normalizes a one-past-end collision headnode to an empty hull', () => {
    const bytes = makeBsp({ collision: true });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const modelLumpOffset = view.getUint32(4 + 14 * 8, true);
    view.setInt32(modelLumpOffset + 40, 1, true);

    const world = parseBsp(bytes);

    expect(world.models[0]?.headnodes[1]).toBe(-1);
    expect(world.warnings).toContainEqual({
      code: 'noncanonical-collision-headnode',
      message:
        'model 0 collision hull 1 uses one-past-end headnode 1; the empty hull sentinel was substituted',
      modelIndex: 0,
      hullIndex: 1,
      headNode: 1,
    });
  });

  it('omits isolated degenerate faces without losing source face identity', () => {
    const world = parseBsp(makeBsp({ faceEdgeCounts: [2, 4] }));
    expect(world.faces.map(({ sourceIndex }) => sourceIndex)).toEqual([1]);
    expect(world.batches.map(({ faceIndices }) => faceIndices)).toEqual([[1]]);
    expect(world.models[0]?.faceIndices).toEqual([0, 1]);
    expect(world.warnings).toEqual([
      {
        code: 'degenerate-face',
        message: 'face 0 has 2 edges and was omitted from render geometry',
        faceIndex: 0,
        modelIndex: 0,
        edgeCount: 2,
      },
    ]);
  });
});
