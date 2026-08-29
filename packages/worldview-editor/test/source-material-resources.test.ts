import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EditorMaterial } from '../src/core/index.js';
import { SourceMaterialResources } from '../src/render/materials/source-material-resources.js';

function material(name: string, value: number): EditorMaterial {
  return {
    name,
    sourceName: 'test',
    width: 1,
    height: 1,
    rgba: new Uint8Array([value, value, value, 255]),
    alphaTest: false,
  };
}

describe('source material GPU resources', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retains unchanged textures and replaces only changed normalized names', () => {
    vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 1, COPY_DST: 2 });
    vi.stubGlobal('GPUBufferUsage', { UNIFORM: 4, COPY_DST: 8 });
    const destroyed: string[] = [];
    const createTexture = vi.fn(({ label }: { label: string }) => ({
      createView: () => ({}),
      destroy: () => destroyed.push(label),
    }));
    const device = {
      queue: { writeTexture: vi.fn(), writeBuffer: vi.fn() },
      createTexture,
      createBuffer: () => ({ destroy: vi.fn() }),
      createBindGroup: () => ({}),
    } as unknown as GPUDevice;
    const stone = material('STONE', 32);
    const metal = material('METAL', 96);
    const resources = new SourceMaterialResources(
      device,
      {} as GPUBindGroupLayout,
      {} as GPUSampler,
      [stone],
      [],
    );

    expect(createTexture).toHaveBeenCalledTimes(2); // fallback + stone
    resources.setMaterials([stone, metal]);
    expect(createTexture).toHaveBeenCalledTimes(3);
    expect(destroyed).toEqual([]);

    resources.setMaterials([material('stone', 160)]);
    expect(createTexture).toHaveBeenCalledTimes(4);
    expect(destroyed).toEqual(expect.arrayContaining(['STONE', 'METAL']));
    resources.dispose();
  });
});
