import { LINE_SHADER, SOLID_SHADER, type Pipelines } from './viewport-common.js';

export interface RendererGpuRuntime {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly pipelines: Pipelines;
  readonly bindGroupLayout: GPUBindGroupLayout;
  readonly materialBindGroupLayout: GPUBindGroupLayout;
  readonly materialSampler: GPUSampler;
}

export async function createRendererGpuRuntime(): Promise<RendererGpuRuntime> {
  if (!navigator.gpu) throw new Error('This browser does not expose WebGPU');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter is available');
  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const materialSampler = device.createSampler({
    addressModeU: 'repeat',
    addressModeV: 'repeat',
    magFilter: 'nearest',
    minFilter: 'nearest',
    mipmapFilter: 'nearest',
  });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout, materialBindGroupLayout],
  });
  const solidModule = device.createShaderModule({ code: SOLID_SHADER });
  const lineModule = device.createShaderModule({ code: LINE_SHADER });
  const solid = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: solidModule,
      entryPoint: 'vertexMain',
      buffers: [
        {
          arrayStride: 32,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x2' },
          ],
        },
      ],
    },
    fragment: { module: solidModule, entryPoint: 'fragmentMain', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  const lines = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: lineModule,
      entryPoint: 'vertexMain',
      buffers: [
        {
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        },
      ],
    },
    fragment: { module: lineModule, entryPoint: 'fragmentMain', targets: [{ format }] },
    primitive: { topology: 'line-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' },
  });
  return {
    device,
    format,
    pipelines: { solid, lines },
    bindGroupLayout,
    materialBindGroupLayout,
    materialSampler,
  };
}
