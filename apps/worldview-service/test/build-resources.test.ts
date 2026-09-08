import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
  createDeveloperMaterial,
  createDevelopmentMaterials,
  createCompilerToolMaterials,
  createDiagnosticQuakePalette,
  createStarterDocument,
  encodeQuakeWad2,
  parseMap,
  serializeMap,
} from '@jackharrhy/worldview-editor/core';
import type { HostedResourceMount } from '@worldview/protocol';
import { prepareHostedBuildResources } from '../src/build-resources.js';

const source = serializeMap(createStarterDocument());
const palette = createDiagnosticQuakePalette();
function pack(name: string, bytes: Uint8Array): HostedResourceMount {
  return {
    id: 'pack',
    ordinal: 0,
    provider: 'artbin',
    providerAssetId: 'asset',
    expectedSha256: createHash('sha256').update(bytes).digest('hex'),
    kind: 'wad',
    displayName: name,
    createdAt: 0,
  };
}
function store(bytes: Uint8Array | null) {
  return {
    get: async () => bytes,
    put: async () => {
      throw new Error('Builds must not mutate resources');
    },
  };
}

describe('hosted build textures', () => {
  test('uses a pinned palette for generated development textures', async () => {
    const customPalette = new Uint8Array(768).fill(120);
    const result = await prepareHostedBuildResources(
      source,
      'quake',
      [{ ...pack('palette.lmp', customPalette), kind: 'palette' }],
      store(customPalette),
    );
    const expected = encodeQuakeWad2(
      [...createDevelopmentMaterials(), ...createCompilerToolMaterials()],
      customPalette,
    );
    expect(result.assets[0]?.bytes).toEqual(new Uint8Array(expected));
  });
  test('includes the shared development pack without changing canonical source', async () => {
    const result = await prepareHostedBuildResources(source, 'quake', [], store(null));
    expect(result.assets.map(({ name }) => name)).toEqual(['worldview_dev.wad']);
    const document = parseMap(result.mapText);
    expect(document.entities[0]?.properties.wad).toBe('worldview_dev.wad');
    expect(result.mapText).toContain('DEV_FLOOR');
    expect(parseMap(source).entities[0]?.properties.wad).toBeUndefined();
  });

  test('delivers pinned WAD bytes in the native compiler last-pack-wins order', async () => {
    const bytes = new Uint8Array(
      encodeQuakeWad2(
        [
          createDeveloperMaterial('CUSTOM', [80, 40, 20]),
          createDeveloperMaterial('DEV_FLOOR', [30, 50, 70]),
        ],
        palette,
      ),
    );
    const result = await prepareHostedBuildResources(
      source.replaceAll('DEV_FLOOR', 'CUSTOM'),
      'quake',
      [pack('../custom pack.wad', bytes)],
      store(bytes),
    );
    expect(result.assets[1]?.bytes).toEqual(bytes);
    expect(parseMap(result.mapText).entities[0]?.properties.wad).toBe(
      'worldview_dev.wad;project_1.wad',
    );
  });

  test('rejects missing or changed pinned bytes before compiling', async () => {
    const bytes = new Uint8Array(
      encodeQuakeWad2([createDeveloperMaterial('CUSTOM', [80, 40, 20])], palette),
    );
    const mounts = [pack('custom.wad', bytes)];
    await expect(prepareHostedBuildResources(source, 'quake', mounts, store(null))).rejects.toThrow(
      'custom.wad is unavailable',
    );
    await expect(
      prepareHostedBuildResources(source, 'quake', mounts, store(new Uint8Array([1]))),
    ).rejects.toThrow('does not match its pinned content');
  });

  test('names unresolved map textures and does not require artwork for skip faces', async () => {
    await expect(
      prepareHostedBuildResources(
        source.replaceAll('DEV_FLOOR', 'MISSING'),
        'quake',
        [],
        store(null),
      ),
    ).rejects.toThrow('Missing build textures: MISSING');
    await expect(
      prepareHostedBuildResources(source.replaceAll('DEV_FLOOR', 'skip'), 'quake', [], store(null)),
    ).resolves.toHaveProperty('assets');
  });
});
