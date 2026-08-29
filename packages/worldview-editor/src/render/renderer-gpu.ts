import tgpu, { type TgpuRenderPipeline, type TgpuRoot } from 'typegpu';
import { lineFragment, lineVertex, solidFragment, solidVertex } from './gpu-shaders.js';
import { lineVertexLayout, solidVertexLayout } from './gpu-schemas.js';

export interface EditorPipelines {
  readonly solid: TgpuRenderPipeline;
  readonly lines: TgpuRenderPipeline;
}

export interface RendererGpuRuntime {
  readonly root: TgpuRoot;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly pipelines: EditorPipelines;
  readonly materialSampler: ReturnType<TgpuRoot['createSampler']>;
}

export async function createRendererGpuRuntime(): Promise<RendererGpuRuntime> {
  if (!navigator.gpu) throw new Error('This browser does not expose WebGPU');
  const root = await tgpu.init({ adapter: { powerPreference: 'high-performance' } });
  const device = root.device;
  const format = navigator.gpu.getPreferredCanvasFormat();
  const materialSampler = root.createSampler({
    addressModeU: 'repeat',
    addressModeV: 'repeat',
    magFilter: 'nearest',
    minFilter: 'nearest',
    mipmapFilter: 'nearest',
  });
  const solid = root.createRenderPipeline({
    vertex: solidVertex,
    fragment: solidFragment,
    attribs: {
      position: solidVertexLayout.attrib.position,
      color: solidVertexLayout.attrib.color,
      uv: solidVertexLayout.attrib.uv,
    },
    targets: { format },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  const lines = root.createRenderPipeline({
    vertex: lineVertex,
    fragment: lineFragment,
    attribs: {
      position: lineVertexLayout.attrib.position,
      color: lineVertexLayout.attrib.color,
    },
    targets: { format },
    primitive: { topology: 'line-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' },
  });
  await Promise.all([solid.initAsync(), lines.initAsync()]);
  return {
    root,
    device,
    format,
    pipelines: { solid, lines },
    materialSampler,
  };
}
