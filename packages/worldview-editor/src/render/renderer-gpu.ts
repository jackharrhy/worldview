import tgpu, { type TgpuRenderPipeline, type TgpuRoot } from 'typegpu';
import {
  gridFragment,
  gridVertex,
  lineFragment,
  lineVertex,
  solidFragment,
  solidVertex,
} from './gpu-shaders.js';
import { lineSegmentLayout, solidVertexLayout } from './gpu-schemas.js';

export const EDITOR_SAMPLE_COUNT = 4;

export interface EditorPipelines {
  readonly solid: TgpuRenderPipeline;
  readonly lines: TgpuRenderPipeline;
  readonly grid: TgpuRenderPipeline;
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
  const root = await tgpu.init({
    adapter: { powerPreference: 'high-performance' },
  });
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
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
    multisample: { count: EDITOR_SAMPLE_COUNT },
  });
  const lines = root.createRenderPipeline({
    vertex: lineVertex,
    fragment: lineFragment,
    attribs: {
      start: lineSegmentLayout.attrib.start,
      startColor: lineSegmentLayout.attrib.startColor,
      end: lineSegmentLayout.attrib.end,
      endColor: lineSegmentLayout.attrib.endColor,
    },
    targets: { format },
    primitive: { topology: 'triangle-list' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: false,
      depthCompare: 'less-equal',
    },
    multisample: { count: EDITOR_SAMPLE_COUNT },
  });
  const grid = root.createRenderPipeline({
    vertex: gridVertex,
    fragment: gridFragment,
    targets: {
      format,
      blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      },
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: false,
      depthCompare: 'always',
    },
    multisample: { count: EDITOR_SAMPLE_COUNT },
  });
  await Promise.all([solid.initAsync(), lines.initAsync(), grid.initAsync()]);
  return {
    root,
    device,
    format,
    pipelines: { solid, lines, grid },
    materialSampler,
  };
}
