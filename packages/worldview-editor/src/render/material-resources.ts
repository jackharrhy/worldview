import type { EditorMaterial } from '../core/index.js';

export interface MaterialResource {
  readonly texture: GPUTexture;
  readonly settings: GPUBuffer;
  readonly bindGroup: GPUBindGroup;
}

export function createMaterialResource(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  sampler: GPUSampler,
  material?: EditorMaterial,
): MaterialResource {
  const width = material?.width ?? 1;
  const height = material?.height ?? 1;
  const rgba = material?.rgba ?? new Uint8Array([255, 255, 255, 255]);
  if (rgba.byteLength !== width * height * 4) {
    throw new Error(`Material ${material?.name ?? 'fallback'} has inconsistent RGBA dimensions`);
  }
  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
  const uploadData = new Uint8Array(bytesPerRow * height);
  for (let row = 0; row < height; row += 1) {
    uploadData.set(rgba.subarray(row * width * 4, (row + 1) * width * 4), row * bytesPerRow);
  }
  const texture = device.createTexture({
    label: material?.name ?? 'Missing editor material',
    size: [width, height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    uploadData,
    { bytesPerRow, rowsPerImage: height },
    { width, height },
  );
  const settings = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    settings,
    0,
    new Float32Array([material ? 1 : 0, material?.alphaTest ? 1 : 0, 0, 0]),
  );
  return {
    texture,
    settings,
    bindGroup: device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: { buffer: settings } },
      ],
    }),
  };
}

export function destroyMaterialResource(resource: MaterialResource): void {
  resource.texture.destroy();
  resource.settings.destroy();
}
