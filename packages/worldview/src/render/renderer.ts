/*
 * Draw organization and surface resource behavior are adapted from noclip.website's
 * Common/IdTech2 renderer. See docs/plan.md and THIRD_PARTY_NOTICES.md.
 */

import type { TgpuBindGroup, TgpuRoot, TgpuTexture } from 'typegpu';

import {
  buildLightmapPage,
  decodeMipTexture,
  decodeQuakeSky,
  findBspLeaf,
  LightstyleState,
  type DecodedMipTexture,
  type DrawBatch,
  type ParsedWorld,
  visibleWorldFaceMask,
} from '../core/index.js';
import {
  WALKABILITY_CUTAWAY_EMPTY,
  type WalkabilityCutawayGrid,
  type WalkabilityMap,
} from '../walkability/index.js';
import { TypeGpuWalkabilityRenderer } from '../walkability/renderer.js';
import type { RenderWorldAssets } from './assets.js';
import type { CameraState, TextureFiltering } from './types.js';
import {
  additiveFragment,
  alphaFragment,
  opaqueFragment,
  quakeSkyFragment,
  skyboxVertex,
  translucentColorFragment,
  translucentTextureFragment,
  unlitAlphaFragment,
  unlitFragment,
  unlitSkyFragment,
  waterFragment,
  worldVertex,
} from './shaders.js';
import {
  MaterialUniform,
  materialLayout,
  SceneUniform,
  sceneLayout,
  worldVertexLayout,
} from './schemas.js';
import { TypeGpuSpriteRenderer } from './sprite-renderer.js';

const SAMPLE_COUNT = 4;

interface UploadedTexture {
  readonly texture: TgpuTexture;
  readonly view: GPUTextureView;
  readonly width: number;
  readonly height: number;
}

interface UploadedMaterial {
  readonly diffuse: UploadedTexture;
  readonly skyAlpha: UploadedTexture;
}

interface MaterialBinding {
  readonly group: TgpuBindGroup;
}

interface RenderTarget {
  readonly destination: GPUTextureView;
  readonly msaa: GPUTextureView;
  readonly depth: GPUTextureView;
}

interface FrameOptions {
  readonly allFaces: boolean;
  readonly includeSky: boolean;
  readonly includeSprites: boolean;
  readonly fullbright: boolean;
  readonly zMin: number;
  readonly zMax: number;
  readonly clipZ: boolean;
  readonly cutaway: WalkabilityCutawayGrid | null;
  readonly sceneGroup: TgpuBindGroup;
  readonly clearColor: readonly [number, number, number, number];
}

export interface OverviewRenderSettings {
  readonly width: number;
  readonly height: number;
  readonly zMin: number;
  readonly zMax: number;
  readonly fullbright: boolean;
  readonly includeSky: boolean;
  readonly includeSprites: boolean;
  readonly clearColor: readonly [number, number, number, number];
  readonly cutaway: WalkabilityCutawayGrid | null;
}

function createRawBuffer(
  device: GPUDevice,
  data: ArrayBufferView,
  usage: GPUBufferUsageFlags,
): GPUBuffer {
  const size = Math.max(4, (data.byteLength + 3) & ~3);
  const buffer = device.createBuffer({ size, usage, mappedAtCreation: true });
  const destination = new Uint8Array(buffer.getMappedRange());
  destination.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  buffer.unmap();
  return buffer;
}

function encodeCutaway(grid: WalkabilityCutawayGrid): Uint8Array {
  const pixels = new Uint8Array(grid.width * grid.height * 4);
  const minimum = grid.bounds.min[2];
  const range = Math.max(1, grid.bounds.max[2] - minimum);
  for (let index = 0; index < grid.values.length; index += 1) {
    const value = grid.values[index]!;
    if (value === WALKABILITY_CUTAWAY_EMPTY) continue;
    const encoded = Math.round(Math.min(1, Math.max(0, (value - minimum) / range)) * 65_535);
    const offset = index * 4;
    pixels[offset] = encoded >> 8;
    pixels[offset + 1] = encoded & 0xff;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function checkerboard(): DecodedMipTexture {
  const width = 16;
  const height = 16;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const bright = ((x >> 2) + (y >> 2)) % 2 === 0;
      rgba[offset] = bright ? 255 : 24;
      rgba[offset + 1] = bright ? 48 : 8;
      rgba[offset + 2] = bright ? 220 : 28;
      rgba[offset + 3] = 255;
    }
  }
  return {
    name: '__missing__',
    width,
    height,
    levels: [{ width, height, rgba }],
    alphaTest: false,
  };
}

function skyboxGeometry(): { vertices: Float32Array; indices: Uint32Array } {
  const radius = 30_000;
  const vertices: number[] = [];
  for (const [x, y, z] of [
    [-radius, -radius, -radius],
    [radius, -radius, -radius],
    [radius, radius, -radius],
    [-radius, radius, -radius],
    [-radius, -radius, radius],
    [radius, -radius, radius],
    [radius, radius, radius],
    [-radius, radius, radius],
  ] as const) {
    vertices.push(x, y, z, 0, 0, 0, 0);
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3,
      0, 4, 3, 4, 7,
    ]),
  };
}

function surfacePrimitive(cullMode: GPUCullMode): GPUPrimitiveState {
  return {
    topology: 'triangle-list',
    frontFace: 'cw',
    cullMode,
  };
}

function surfaceDepthStencil(
  depthWriteEnabled: boolean,
  biased: boolean,
  depthCompare: GPUCompareFunction = 'less',
): GPUDepthStencilState {
  return {
    format: 'depth24plus',
    depthWriteEnabled,
    depthCompare,
    ...(biased ? { depthBias: -2, depthBiasSlopeScale: -0.5 } : {}),
  };
}

function createPipelines(root: TgpuRoot, format: GPUTextureFormat) {
  const attribs = {
    position: worldVertexLayout.attrib.position,
    diffuseUv: worldVertexLayout.attrib.diffuseUv,
    lightmapUv: worldVertexLayout.attrib.lightmapUv,
  };
  const alphaBlend: GPUBlendState = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  };
  const additiveBlend: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  };
  const common = {
    attribs,
    vertex: worldVertex,
    multisample: { count: SAMPLE_COUNT },
  };
  const skyboxCommon = { ...common, vertex: skyboxVertex };
  const surface = (
    fragment: typeof opaqueFragment,
    options: {
      readonly brush?: boolean;
      readonly cullMode?: GPUCullMode;
      readonly blend?: GPUBlendState;
      readonly depthWrite?: boolean;
      readonly depthCompare?: GPUCompareFunction;
    } = {},
  ) =>
    root.createRenderPipeline({
      ...common,
      fragment,
      targets: { format, ...(options.blend ? { blend: options.blend } : {}) },
      primitive: surfacePrimitive(options.cullMode ?? 'back'),
      depthStencil: surfaceDepthStencil(
        options.depthWrite ?? true,
        options.brush ?? false,
        options.depthCompare,
      ),
    });
  return {
    opaque: surface(opaqueFragment),
    opaqueBrush: surface(opaqueFragment, { brush: true }),
    unlit: surface(unlitFragment),
    unlitBrush: surface(unlitFragment, { brush: true }),
    alpha: surface(alphaFragment),
    alphaBrush: surface(alphaFragment, { brush: true }),
    unlitAlpha: surface(unlitAlphaFragment),
    unlitAlphaBrush: surface(unlitAlphaFragment, { brush: true }),
    water: surface(waterFragment, { cullMode: 'none' }),
    waterBrush: surface(waterFragment, { brush: true, cullMode: 'none' }),
    translucentTexture: surface(translucentTextureFragment, {
      brush: true,
      blend: alphaBlend,
      depthWrite: false,
    }),
    translucentWater: surface(waterFragment, {
      brush: true,
      cullMode: 'none',
      blend: alphaBlend,
      depthWrite: false,
    }),
    translucentColor: surface(translucentColorFragment, {
      brush: true,
      blend: alphaBlend,
      depthWrite: false,
    }),
    additive: surface(additiveFragment, {
      brush: true,
      blend: additiveBlend,
      depthWrite: false,
    }),
    unlitSky: root.createRenderPipeline({
      ...common,
      fragment: unlitSkyFragment,
      targets: { format },
      primitive: surfacePrimitive('none'),
      depthStencil: surfaceDepthStencil(true, false),
    }),
    unlitSkyBackground: root.createRenderPipeline({
      ...skyboxCommon,
      fragment: unlitSkyFragment,
      targets: { format },
      primitive: surfacePrimitive('none'),
      depthStencil: surfaceDepthStencil(true, false, 'always'),
    }),
    quakeSky: root.createRenderPipeline({
      ...common,
      fragment: quakeSkyFragment,
      targets: { format },
      primitive: surfacePrimitive('none'),
      depthStencil: surfaceDepthStencil(true, false),
    }),
    quakeSkyBackground: root.createRenderPipeline({
      ...skyboxCommon,
      fragment: quakeSkyFragment,
      targets: { format },
      primitive: surfacePrimitive('none'),
      depthStencil: surfaceDepthStencil(true, false, 'always'),
    }),
  };
}

type Pipelines = ReturnType<typeof createPipelines>;

export function goldSrcBrushPipeline(
  renderMode: number,
  surfaceKind: DrawBatch['kind'],
): 'translucentColor' | 'translucentTexture' | 'translucentWater' | 'additive' | null {
  if (renderMode === 1) return 'translucentColor';
  if (renderMode === 2) return surfaceKind === 'water' ? 'translucentWater' : 'translucentTexture';
  // Glow sprites have their own depth behavior; brush models use the translucent surface path.
  if (renderMode === 3) return 'translucentTexture';
  if (renderMode === 5) return 'additive';
  return null;
}

function selectedPipeline(
  pipelines: Pipelines,
  world: ParsedWorld,
  batch: DrawBatch,
): Pipelines[keyof Pipelines] {
  if (batch.kind === 'sky') return world.version === 29 ? pipelines.quakeSky : pipelines.unlitSky;
  const model = world.models[batch.modelIndex];
  const brush = batch.modelIndex > 0;
  if (world.version === 30 && brush) {
    const renderPipeline = goldSrcBrushPipeline(model?.renderMode ?? 0, batch.kind);
    if (renderPipeline) return pipelines[renderPipeline];
  }
  if (batch.kind === 'water') return brush ? pipelines.waterBrush : pipelines.water;
  const alpha = batch.kind === 'alpha-test' || (world.version === 30 && model?.renderMode === 4);
  const lightmapped = batch.lightmapPage >= 0;
  if (alpha) {
    if (lightmapped) return brush ? pipelines.alphaBrush : pipelines.alpha;
    return brush ? pipelines.unlitAlphaBrush : pipelines.unlitAlpha;
  }
  if (lightmapped) return brush ? pipelines.opaqueBrush : pipelines.opaque;
  return brush ? pipelines.unlitBrush : pipelines.unlit;
}

function isTranslucent(world: ParsedWorld, batch: DrawBatch): boolean {
  if (world.version !== 30 || batch.modelIndex === 0) return false;
  const mode = world.models[batch.modelIndex]?.renderMode;
  return mode === 1 || mode === 2 || mode === 3 || mode === 5;
}

function translucentRank(world: ParsedWorld, batch: DrawBatch): number {
  const mode = world.models[batch.modelIndex]?.renderMode;
  if (mode === 2) return 1;
  if (mode === 5) return 2;
  if (mode === 3) return 3;
  return 0;
}

export class TypeGpuWorldRenderer {
  private readonly device: GPUDevice;
  private readonly pipelines: Pipelines;
  private readonly vertexBuffer: GPUBuffer;
  private readonly indexBuffer: GPUBuffer;
  private readonly skyboxVertexBuffer: GPUBuffer;
  private readonly skyboxIndexBuffer: GPUBuffer;
  private readonly sceneUniform;
  private readonly sceneGroup: TgpuBindGroup;
  private readonly sampler;
  private readonly skyboxSampler;
  private readonly buffers: Array<{ destroy(): void }> = [];
  private readonly textures: TgpuTexture[] = [];
  private readonly uploadedMaterials = new Map<number, UploadedMaterial>();
  private readonly lightmapTextures = new Map<number, UploadedTexture>();
  private readonly materialBindings = new Map<string, MaterialBinding>();
  private readonly lightstyles = new LightstyleState();
  private readonly spriteRenderer: TypeGpuSpriteRenderer;
  private readonly walkabilityRenderer: TypeGpuWalkabilityRenderer;
  private readonly animatedPages = new Set<number>();
  private lastLightstyleFrame = -1;
  private msaaTexture: TgpuTexture | null = null;
  private depthTexture: TgpuTexture | null = null;
  private msaaView: GPUTextureView | null = null;
  private depthView: GPUTextureView | null = null;
  private width = 0;
  private height = 0;
  private visibilityLeaf: number | null | undefined;
  private worldFaceVisibility: Uint8Array | null = null;
  private disposed = false;

  public constructor(
    private readonly root: TgpuRoot,
    private readonly context: GPUCanvasContext,
    private readonly format: GPUTextureFormat,
    private readonly loaded: RenderWorldAssets,
    filtering: TextureFiltering,
    private readonly clearColor: readonly [number, number, number, number],
  ) {
    this.device = root.device;
    this.pipelines = createPipelines(root, format);
    this.vertexBuffer = createRawBuffer(this.device, loaded.world.vertices, GPUBufferUsage.VERTEX);
    this.indexBuffer = createRawBuffer(this.device, loaded.world.indices, GPUBufferUsage.INDEX);
    const skybox = skyboxGeometry();
    this.skyboxVertexBuffer = createRawBuffer(this.device, skybox.vertices, GPUBufferUsage.VERTEX);
    this.skyboxIndexBuffer = createRawBuffer(this.device, skybox.indices, GPUBufferUsage.INDEX);
    this.sceneUniform = root.createUniform(SceneUniform, {
      projectionView: new Float32Array(16),
      eyeTime: [0, 0, 0, 0],
      frameOptions: [0, 0, 0, 0],
      cutawayTransform: [0, 0, 0, 0],
      cutawayOptions: [0, 0, 0, 0],
      cutawayHeight: [0, 1, 0, 0],
    });
    this.buffers.push(this.sceneUniform.buffer);
    const emptyCutaway = this.trackTexture(
      root
        .createTexture({ size: [1, 1], format: 'rgba8unorm' })
        .$usage('sampled')
        .$name('__empty_cutaway__'),
    );
    emptyCutaway.write(new Uint8Array([0, 0, 0, 0]));
    this.sceneGroup = root.createBindGroup(sceneLayout, {
      scene: this.sceneUniform,
      cutaway: root.unwrap(emptyCutaway).createView(),
    });
    this.sampler = root.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: filtering,
      minFilter: filtering,
      mipmapFilter: filtering,
    });
    this.skyboxSampler = root.createSampler({
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      magFilter: filtering,
      minFilter: filtering,
    });
    this.spriteRenderer = new TypeGpuSpriteRenderer(root, format, loaded.sprites, filtering);
    this.walkabilityRenderer = new TypeGpuWalkabilityRenderer(root, format);
    try {
      this.uploadMapResources();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public async initialize(): Promise<void> {
    await Promise.all([
      ...Object.values(this.pipelines).map((pipeline) => pipeline.initAsync()),
      this.spriteRenderer.initialize(),
      this.walkabilityRenderer.initialize(),
    ]);
  }

  public setWalkability(map: WalkabilityMap | null): void {
    if (this.disposed) return;
    this.walkabilityRenderer.setMap(map);
  }

  public get continuouslyAnimated(): boolean {
    return (
      this.loaded.world.hasAnimatedLightmaps ||
      this.spriteRenderer.continuouslyAnimated ||
      this.loaded.world.batches.some(
        (batch) =>
          this.loaded.world.models[batch.modelIndex]?.visible &&
          (batch.kind === 'water' || (batch.kind === 'sky' && this.loaded.world.version === 29)),
      )
    );
  }

  public resize(width: number, height: number): void {
    if (this.disposed || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.msaaTexture?.destroy();
    this.depthTexture?.destroy();
    this.msaaTexture = this.root
      .createTexture({ size: [width, height], format: this.format, sampleCount: SAMPLE_COUNT })
      .$usage('render');
    this.depthTexture = this.root
      .createTexture({ size: [width, height], format: 'depth24plus', sampleCount: SAMPLE_COUNT })
      .$usage('render');
    this.msaaView = this.root.unwrap(this.msaaTexture).createView();
    this.depthView = this.root.unwrap(this.depthTexture).createView();
  }

  public render(projectionView: Float32Array, camera: CameraState, timeSeconds: number): void {
    if (this.disposed || !this.msaaView || !this.depthView || this.width <= 0 || this.height <= 0)
      return;
    this.renderFrame(
      projectionView,
      camera,
      timeSeconds,
      {
        destination: this.context.getCurrentTexture().createView(),
        msaa: this.msaaView,
        depth: this.depthView,
      },
      {
        allFaces: false,
        includeSky: true,
        includeSprites: true,
        fullbright: false,
        zMin: 0,
        zMax: 0,
        clipZ: false,
        cutaway: null,
        sceneGroup: this.sceneGroup,
        clearColor: this.clearColor,
      },
    );
  }

  public async captureOverview(
    projectionView: Float32Array,
    camera: CameraState,
    settings: OverviewRenderSettings,
  ): Promise<Uint8ClampedArray> {
    if (this.disposed) throw new Error('Worldview renderer has been disposed');
    const destination = this.device.createTexture({
      label: 'Worldview overview color',
      size: [settings.width, settings.height],
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const msaa = this.device.createTexture({
      label: 'Worldview overview MSAA',
      size: [settings.width, settings.height],
      format: this.format,
      sampleCount: SAMPLE_COUNT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const depth = this.device.createTexture({
      label: 'Worldview overview depth',
      size: [settings.width, settings.height],
      format: 'depth24plus',
      sampleCount: SAMPLE_COUNT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const bytesPerRow = (settings.width * 4 + 255) & ~255;
    const readback = this.device.createBuffer({
      label: 'Worldview overview readback',
      size: bytesPerRow * settings.height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const cutawayTexture = settings.cutaway
      ? this.device.createTexture({
          label: 'Worldview overview cutaway',
          size: [settings.cutaway.width, settings.cutaway.height],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        })
      : null;
    if (cutawayTexture && settings.cutaway) {
      this.device.queue.writeTexture(
        { texture: cutawayTexture },
        encodeCutaway(settings.cutaway),
        { bytesPerRow: settings.cutaway.width * 4, rowsPerImage: settings.cutaway.height },
        { width: settings.cutaway.width, height: settings.cutaway.height },
      );
    }
    const sceneGroup = cutawayTexture
      ? this.root.createBindGroup(sceneLayout, {
          scene: this.sceneUniform,
          cutaway: cutawayTexture.createView(),
        })
      : this.sceneGroup;
    try {
      this.renderFrame(
        projectionView,
        camera,
        0,
        {
          destination: destination.createView(),
          msaa: msaa.createView(),
          depth: depth.createView(),
        },
        {
          allFaces: true,
          includeSky: settings.includeSky,
          includeSprites: settings.includeSprites,
          fullbright: settings.fullbright,
          zMin: settings.zMin,
          zMax: settings.zMax,
          clipZ: true,
          cutaway: settings.cutaway,
          sceneGroup,
          clearColor: settings.clearColor,
        },
      );
      const encoder = this.device.createCommandEncoder({ label: 'Worldview overview copy' });
      encoder.copyTextureToBuffer(
        { texture: destination },
        { buffer: readback, bytesPerRow, rowsPerImage: settings.height },
        { width: settings.width, height: settings.height, depthOrArrayLayers: 1 },
      );
      this.device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(readback.getMappedRange());
      const rgba = new Uint8ClampedArray(settings.width * settings.height * 4);
      const bgra = this.format.startsWith('bgra');
      for (let y = 0; y < settings.height; y += 1) {
        const sourceRow = y * bytesPerRow;
        const destinationRow = y * settings.width * 4;
        for (let x = 0; x < settings.width; x += 1) {
          const source = sourceRow + x * 4;
          const output = destinationRow + x * 4;
          rgba[output] = mapped[source + (bgra ? 2 : 0)] ?? 0;
          rgba[output + 1] = mapped[source + 1] ?? 0;
          rgba[output + 2] = mapped[source + (bgra ? 0 : 2)] ?? 0;
          rgba[output + 3] = mapped[source + 3] ?? 0;
        }
      }
      return rgba;
    } finally {
      if (readback.mapState === 'mapped') readback.unmap();
      readback.destroy();
      destination.destroy();
      msaa.destroy();
      depth.destroy();
      cutawayTexture?.destroy();
    }
  }

  private renderFrame(
    projectionView: Float32Array,
    camera: CameraState,
    timeSeconds: number,
    target: RenderTarget,
    options: FrameOptions,
  ): void {
    this.sceneUniform.write({
      projectionView,
      eyeTime: [camera.position[0], camera.position[1], camera.position[2], timeSeconds],
      frameOptions: [options.zMin, options.zMax, options.fullbright ? 1 : 0, options.clipZ ? 1 : 0],
      cutawayTransform: options.cutaway
        ? [
            options.cutaway.bounds.min[0],
            options.cutaway.bounds.min[1],
            1 / Math.max(1, options.cutaway.bounds.max[0] - options.cutaway.bounds.min[0]),
            1 / Math.max(1, options.cutaway.bounds.max[1] - options.cutaway.bounds.min[1]),
          ]
        : [0, 0, 0, 0],
      cutawayOptions: options.cutaway
        ? [1, options.cutaway.width, options.cutaway.height, 0]
        : [0, 0, 0, 0],
      cutawayHeight: options.cutaway
        ? [
            options.cutaway.bounds.min[2],
            Math.max(1, options.cutaway.bounds.max[2] - options.cutaway.bounds.min[2]),
            0,
            0,
          ]
        : [0, 1, 0, 0],
    });
    this.updateAnimatedLightmaps(timeSeconds);
    if (options.includeSprites) this.spriteRenderer.prepare(camera, timeSeconds);

    if (!options.allFaces) {
      const visibilityLeaf = this.loaded.world.visibility
        ? findBspLeaf(this.loaded.world.trace, camera.position)
        : null;
      if (visibilityLeaf !== this.visibilityLeaf) {
        this.visibilityLeaf = visibilityLeaf;
        this.worldFaceVisibility = visibleWorldFaceMask(
          this.loaded.world.trace,
          this.loaded.world.visibility,
          camera.position,
        );
      }
    }
    const worldFaceVisibility = options.allFaces ? null : this.worldFaceVisibility;
    const visible = this.loaded.world.batches.filter(
      (batch) =>
        this.loaded.world.models[batch.modelIndex]?.visible &&
        (options.includeSky || batch.kind !== 'sky') &&
        (batch.modelIndex !== 0 ||
          !worldFaceVisibility ||
          batch.faceIndices.some((faceIndex) => worldFaceVisibility[faceIndex] !== 0)),
    );
    const sky = visible.filter((batch) => batch.kind === 'sky');
    const main = visible.filter(
      (batch) => batch.kind !== 'sky' && !isTranslucent(this.loaded.world, batch),
    );
    const translucent = visible
      .filter((batch) => batch.kind !== 'sky' && isTranslucent(this.loaded.world, batch))
      .toSorted((left, right) => {
        const distance = (batch: DrawBatch) => {
          const bounds = this.loaded.world.models[batch.modelIndex]?.bounds;
          if (!bounds) return 0;
          const x = (bounds.min[0] + bounds.max[0]) * 0.5 - camera.position[0];
          const y = (bounds.min[1] + bounds.max[1]) * 0.5 - camera.position[1];
          const z = (bounds.min[2] + bounds.max[2]) * 0.5 - camera.position[2];
          return x * x + y * y + z * z;
        };
        return (
          distance(right) - distance(left) ||
          translucentRank(this.loaded.world, left) - translucentRank(this.loaded.world, right)
        );
      });
    const encoder = this.device.createCommandEncoder({ label: 'Worldview frame' });
    const hasSprites = options.includeSprites && this.spriteRenderer.hasSprites;
    const hasWalkability = !options.allFaces && this.walkabilityRenderer.hasContent;
    const pipelines = this.pipelines;

    if (sky.length > 0) {
      const pass = encoder.beginRenderPass({
        label: 'Worldview sky pass',
        colorAttachments: [
          {
            view: target.msaa,
            clearValue: [...options.clearColor],
            loadOp: 'clear',
            storeOp: 'store',
            ...(main.length === 0 && translucent.length === 0 && !hasSprites
              ? { resolveTarget: target.destination }
              : {}),
          },
        ],
        depthStencilAttachment: {
          view: target.depth,
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      if (this.loaded.world.version === 29 || this.loaded.skybox) {
        this.drawSkyboxBackground(pass, sky[0]!, pipelines, options.sceneGroup);
      }
      for (const batch of sky)
        this.draw(pass, batch, worldFaceVisibility, pipelines, options.sceneGroup);
      pass.end();
    }

    if (main.length > 0 || translucent.length > 0 || hasSprites || hasWalkability) {
      const pass = encoder.beginRenderPass({
        label: 'Worldview world pass',
        colorAttachments: [
          {
            view: target.msaa,
            clearValue: [...options.clearColor],
            loadOp: sky.length > 0 ? 'load' : 'clear',
            storeOp: 'store',
            resolveTarget: target.destination,
          },
        ],
        depthStencilAttachment: {
          view: target.depth,
          depthClearValue: 1,
          depthLoadOp: sky.length > 0 ? 'load' : 'clear',
          depthStoreOp: 'discard',
        },
      });
      for (const batch of main)
        this.draw(pass, batch, worldFaceVisibility, pipelines, options.sceneGroup);
      if (hasSprites) this.spriteRenderer.drawOpaque(pass, options.sceneGroup);
      for (const batch of translucent)
        this.draw(pass, batch, worldFaceVisibility, pipelines, options.sceneGroup);
      if (hasSprites) this.spriteRenderer.drawTranslucent(pass, options.sceneGroup, camera);
      if (hasWalkability) this.walkabilityRenderer.draw(pass, options.sceneGroup);
      pass.end();
    }

    if (visible.length === 0 && !hasSprites && !hasWalkability) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: target.msaa,
            resolveTarget: target.destination,
            clearValue: [...options.clearColor],
            loadOp: 'clear',
            storeOp: 'discard',
          },
        ],
      });
      pass.end();
    }
    this.device.queue.submit([encoder.finish()]);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.vertexBuffer.destroy();
    this.indexBuffer.destroy();
    this.skyboxVertexBuffer.destroy();
    this.skyboxIndexBuffer.destroy();
    this.msaaTexture?.destroy();
    this.depthTexture?.destroy();
    this.msaaTexture = null;
    this.depthTexture = null;
    this.spriteRenderer.dispose();
    this.walkabilityRenderer.dispose();
    for (const buffer of this.buffers) buffer.destroy();
    this.buffers.length = 0;
    for (const texture of this.textures) texture.destroy();
    this.textures.length = 0;
  }

  private uploadMapResources(): void {
    const missing = this.uploadDecoded(checkerboard());
    const white = this.uploadRgba('__white__', 1, 1, [new Uint8Array([255, 255, 255, 255])]);
    const skybox = this.uploadSkybox();
    this.lightmapTextures.set(-1, white);
    for (const page of this.loaded.world.lightmapPages) {
      const rgba = buildLightmapPage(page, this.loaded.world.lightmapBytesPerTexel);
      this.lightmapTextures.set(
        page.index,
        this.uploadRgba(`lightmap-${page.index}`, page.width, page.height, [rgba]),
      );
      if (page.lightmaps.some((lightmap) => lightmap.styles.some((style) => style !== 0))) {
        this.animatedPages.add(page.index);
      }
    }

    const materialIndices = new Set(this.loaded.world.batches.map((batch) => batch.materialIndex));
    for (const materialIndex of materialIndices) {
      const material = this.loaded.world.materials[materialIndex];
      const bytes = this.loaded.textureData.get(materialIndex);
      if (!material || !bytes) {
        this.uploadedMaterials.set(materialIndex, { diffuse: missing, skyAlpha: missing });
        continue;
      }
      if (this.loaded.world.version === 29 && material.kind === 'sky' && this.loaded.palette) {
        const decoded = decodeQuakeSky(bytes, this.loaded.palette);
        this.uploadedMaterials.set(materialIndex, {
          diffuse: this.uploadRgba(`${decoded.name}-solid`, decoded.width, decoded.height, [
            decoded.solid,
          ]),
          skyAlpha: this.uploadRgba(`${decoded.name}-alpha`, decoded.width, decoded.height, [
            decoded.alpha,
          ]),
        });
      } else {
        const decoded = decodeMipTexture(
          bytes,
          this.loaded.world.version === 29 ? this.loaded.palette : undefined,
        );
        const diffuse = this.uploadDecoded(decoded);
        this.uploadedMaterials.set(materialIndex, { diffuse, skyAlpha: diffuse });
      }
    }

    for (const batch of this.loaded.world.batches) {
      const key = this.bindingKey(batch);
      if (this.materialBindings.has(key)) continue;
      const model = this.loaded.world.models[batch.modelIndex];
      const material = this.uploadedMaterials.get(batch.materialIndex) ?? {
        diffuse: missing,
        skyAlpha: missing,
      };
      const lightmap = this.lightmapTextures.get(batch.lightmapPage) ?? white;
      const uniform = this.root.createUniform(MaterialUniform, {
        sizes: [material.diffuse.width, material.diffuse.height, lightmap.width, lightmap.height],
        options: [this.loaded.world.version === 29 ? 1 : 0, this.loaded.skybox ? 1 : 0, 0, 0],
        renderColor: [
          (model?.renderColor[0] ?? 255) / 255,
          (model?.renderColor[1] ?? 255) / 255,
          (model?.renderColor[2] ?? 255) / 255,
          (model?.renderAmount ?? 255) / 255,
        ],
      });
      this.buffers.push(uniform.buffer);
      const group = this.root.createBindGroup(materialLayout, {
        material: uniform,
        diffuse: material.diffuse.view,
        lightmap: lightmap.view,
        skyAlpha: material.skyAlpha.view,
        skybox: skybox.view,
        textureSampler: this.sampler,
        skyboxSampler: this.skyboxSampler,
      });
      this.materialBindings.set(key, { group });
    }
  }

  private uploadDecoded(decoded: DecodedMipTexture): UploadedTexture {
    return this.uploadRgba(
      decoded.name,
      decoded.width,
      decoded.height,
      decoded.levels.map((level) => level.rgba),
    );
  }

  private uploadRgba(
    label: string,
    width: number,
    height: number,
    levels: readonly Uint8Array[],
  ): UploadedTexture {
    const texture = this.trackTexture(
      this.root
        .createTexture({
          size: [width, height],
          format: 'rgba8unorm',
          mipLevelCount: levels.length,
        })
        .$usage('sampled')
        .$name(label),
    );
    levels.forEach((rgba, level) => texture.write(rgba, level));
    return { texture, view: this.root.unwrap(texture).createView(), width, height };
  }

  private uploadSkybox(): UploadedTexture {
    const sides = this.loaded.skybox?.sides;
    const width = sides?.rt.width ?? 1;
    const height = sides?.rt.height ?? 1;
    const texture = this.trackTexture(
      this.root
        .createTexture({ size: [width, height, 6], format: 'rgba8unorm' })
        .$usage('sampled')
        .$name(this.loaded.skybox?.name ?? '__empty_skybox__'),
    );
    const raw = this.root.unwrap(texture);
    const layers = sides
      ? [sides.rt, sides.lf, sides.bk, sides.ft, sides.up, sides.dn]
      : Array.from({ length: 6 }, () => ({ rgba: new Uint8Array([0, 0, 0, 255]) }));
    layers.forEach((side, layer) => {
      this.device.queue.writeTexture(
        { texture: raw, origin: { x: 0, y: 0, z: layer } },
        side.rgba,
        { bytesPerRow: width * 4, rowsPerImage: height },
        { width, height, depthOrArrayLayers: 1 },
      );
    });
    return {
      texture,
      view: raw.createView({ dimension: '2d-array', arrayLayerCount: 6 }),
      width,
      height,
    };
  }

  private trackTexture<T extends TgpuTexture>(texture: T): T {
    this.textures.push(texture);
    return texture;
  }

  private updateAnimatedLightmaps(timeSeconds: number): void {
    if (this.animatedPages.size === 0) return;
    const frame = Math.floor(timeSeconds * 10);
    if (frame === this.lastLightstyleFrame) return;
    this.lastLightstyleFrame = frame;
    this.lightstyles.update(timeSeconds);
    for (const pageIndex of this.animatedPages) {
      const page = this.loaded.world.lightmapPages[pageIndex];
      const texture = this.lightmapTextures.get(pageIndex);
      if (!page || !texture) continue;
      texture.texture.write(
        buildLightmapPage(
          page,
          this.loaded.world.lightmapBytesPerTexel,
          this.lightstyles.intensities,
        ),
      );
    }
  }

  private draw(
    pass: GPURenderPassEncoder,
    batch: DrawBatch,
    worldFaceVisibility: Uint8Array | null,
    pipelines: Pipelines,
    sceneGroup: TgpuBindGroup,
  ): void {
    if (batch.modelIndex !== 0 || !worldFaceVisibility) {
      this.drawRange(pass, batch, batch.firstIndex, batch.indexCount, pipelines, sceneGroup);
      return;
    }

    let firstIndex = -1;
    let indexCount = 0;
    const flush = () => {
      if (firstIndex >= 0)
        this.drawRange(pass, batch, firstIndex, indexCount, pipelines, sceneGroup);
      firstIndex = -1;
      indexCount = 0;
    };
    for (const faceIndex of batch.faceIndices) {
      if (worldFaceVisibility[faceIndex] === 0) {
        flush();
        continue;
      }
      const face = this.loaded.world.faces[faceIndex];
      if (!face) continue;
      if (firstIndex >= 0 && firstIndex + indexCount !== face.firstIndex) flush();
      if (firstIndex < 0) firstIndex = face.firstIndex;
      indexCount += face.indexCount;
    }
    flush();
  }

  private drawSkyboxBackground(
    pass: GPURenderPassEncoder,
    batch: DrawBatch,
    pipelines: Pipelines,
    sceneGroup: TgpuBindGroup,
  ): void {
    const binding = this.materialBindings.get(this.bindingKey(batch));
    if (!binding) return;
    const pipeline =
      this.loaded.world.version === 29
        ? pipelines.quakeSkyBackground
        : pipelines.unlitSkyBackground;
    pipeline
      .with(worldVertexLayout, this.skyboxVertexBuffer)
      .withIndexBuffer(this.skyboxIndexBuffer, 'uint32')
      .with(sceneGroup)
      .with(binding.group)
      .with(pass)
      .drawIndexed(36);
  }

  private drawRange(
    pass: GPURenderPassEncoder,
    batch: DrawBatch,
    firstIndex: number,
    indexCount: number,
    pipelines: Pipelines,
    sceneGroup: TgpuBindGroup,
  ): void {
    const binding = this.materialBindings.get(this.bindingKey(batch));
    if (!binding) return;
    selectedPipeline(pipelines, this.loaded.world, batch)
      .with(worldVertexLayout, this.vertexBuffer)
      .withIndexBuffer(this.indexBuffer, 'uint32')
      .with(sceneGroup)
      .with(binding.group)
      .with(pass)
      .drawIndexed(indexCount, 1, firstIndex);
  }

  private bindingKey(batch: DrawBatch): string {
    return `${batch.modelIndex}:${batch.materialIndex}:${batch.lightmapPage}`;
  }
}
