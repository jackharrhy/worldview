import { mat4 } from 'wgpu-matrix';

import {
  brushVertices,
  brushesInDocument,
  deriveBrush,
  editorGroupForObject,
  findBrush,
  isBrushSelected,
  isFaceSelected,
  isPointEntitySelected,
  intersectBrushRay,
  intersectPointEntityRay,
  pointEntitiesInDocument,
  selectedBrushIds,
  selectedFaceReferences,
  selectedPointEntityIds,
  selectionForEditorGroup,
  type BrushId,
  type BrushRayHit,
  type Bounds,
  type BrushSelection,
  type EditorObjectViewState,
  type EditorSelection,
  type EditorMaterial,
  type EntityLinkMode,
  type EntityId,
  type FaceAttributeTransferMode,
  type FaceSelection,
  type MapDocument,
  type PointEntityRayHit,
  type TransformAxis,
  type Vec3,
} from '../core/index.js';
import type {
  EditorSourceRendererOptions,
  EditorBrushDragEvent,
  EditorBrushCreateEvent,
  EditorCameraNavigationMode,
  EditorReferenceScene,
  EditorSweepDragEvent,
  EditorFaceDragEvent,
  EditorFaceTransferEvent,
  EditorHullCreateEvent,
  EditorPickIntent,
  EditorPointEntityPlaceEvent,
  EditorPointerPositionEvent,
  EditorTool,
  EditorTopologyDragEvent,
  EditorTopologyKind,
  EditorTransformDragEvent,
  EditorTransformPivotDragEvent,
  EditorViewportCameraState,
  EditorViewportContextMenuEvent,
  EditorViewportKind,
} from './types.js';
import {
  boundsCenter,
  buildSceneBuffers,
  createMaterialResource,
  destroyMaterialResource,
  gridVertices,
  objectSelectionBounds,
  scaleHandles,
  scaleOverlayVertices,
  scalePivot,
  snappedScaleFactor,
  sweepCapsBounds,
  sweepScaleHandle,
  upload,
  type MaterialResource,
  type SceneBuffers,
} from './scene-buffers.js';
import {
  addScaled,
  constructionPlane,
  creationBounds,
  cross,
  dedupeHullPoints,
  dominantAxis,
  dot,
  encodedTopologyPoint,
  inferClipPlane,
  isTransformTool,
  normalize,
  pointSegmentDistance,
  pointsFormPolygonOnPlane,
  rayPlaneIntersection,
  rectangleOnPlane,
  snapPointToPlane,
  snappedDelta,
  topologyHandleBounds,
  topologyHandleBrushIds,
  topologyHandleKey,
  topologyHandleVertices,
  transformTopologyPoint,
  translatedTopologyHandle,
  type FaceHandle,
  type MovementTrace,
  type ScaleHandle,
  type TopologyHandle,
} from './viewport-geometry.js';

type EditorObjectRayHit = BrushRayHit | PointEntityRayHit;

function isBrushRayHit(hit: EditorObjectRayHit): hit is BrushRayHit {
  return 'brushId' in hit;
}

function selectionForHit(hit: EditorObjectRayHit): EditorSelection {
  return isBrushRayHit(hit) ? { brushId: hit.brushId } : { entityId: hit.entityId };
}

function selectionContainsHit(selection: EditorSelection | null, hit: EditorObjectRayHit): boolean {
  return isBrushRayHit(hit)
    ? isBrushSelected(selection, hit.brushId)
    : isPointEntitySelected(selection, hit.entityId);
}

const FACE_HANDLE_HIT_RADIUS = 8;

const SOLID_SHADER = /* wgsl */ `
struct Scene {
  projectionView: mat4x4f,
};

@group(0) @binding(0) var<uniform> scene: Scene;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) color: vec3f,
  @location(2) uv: vec2f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) uv: vec2f,
};

struct MaterialSettings {
  useTexture: f32,
  alphaTest: f32,
};

@group(1) @binding(0) var materialSampler: sampler;
@group(1) @binding(1) var materialTexture: texture_2d<f32>;
@group(1) @binding(2) var<uniform> material: MaterialSettings;

@vertex fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = scene.projectionView * vec4f(input.position, 1.0);
  output.color = input.color;
  output.uv = input.uv;
  return output;
}

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let dimensions = vec2f(textureDimensions(materialTexture));
  let sampled = textureSample(materialTexture, materialSampler, input.uv / dimensions);
  if (material.alphaTest > 0.5 && sampled.a < 0.5) {
    discard;
  }
  return vec4f(mix(input.color, sampled.rgb, material.useTexture), 1.0);
}
`;

const LINE_SHADER = /* wgsl */ `
struct Scene {
  projectionView: mat4x4f,
};

@group(0) @binding(0) var<uniform> scene: Scene;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) color: vec3f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
};

@vertex fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = scene.projectionView * vec4f(input.position, 1.0);
  output.color = input.color;
  return output;
}

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(input.color, 1.0);
}
`;

interface ViewportState {
  center: [number, number, number];
  yaw: number;
  pitch: number;
  distance: number;
  orthographicSpan: number;
  fieldOfViewRadians: number;
  flySpeed: number;
}

interface Pipelines {
  readonly solid: GPURenderPipeline;
  readonly lines: GPURenderPipeline;
}

interface ViewportInteraction {
  currentTool(): EditorTool;
  hitTest(origin: Vec3, direction: Vec3): EditorObjectRayHit | null;
  hitTests(origin: Vec3, direction: Vec3): readonly EditorObjectRayHit[];
  currentSelection(): EditorSelection | null;
  brushCenter(selection: EditorSelection): Vec3 | null;
  brushBounds(selection: EditorSelection): Bounds | null;
  transformPivot(): Vec3 | null;
  faceHandle(selection: BrushSelection): { readonly center: Vec3; readonly normal: Vec3 } | null;
  faceHandles(): readonly FaceHandle[];
  snapClipHit(hit: BrushRayHit, gridSize: number): Vec3 | null;
  clipPoints(): readonly Vec3[];
  addClipPoints(points: readonly Vec3[], viewport: EditorViewportKind, viewDirection: Vec3): void;
  moveClipPoint(
    index: number,
    point: Vec3,
    viewport: EditorViewportKind,
    viewDirection: Vec3,
    axisRestriction: TransformAxis | null,
    phase: 'preview' | 'commit' | 'cancel',
  ): void;
  matchClipFace(hit: BrushRayHit, viewport: EditorViewportKind): void;
  pick(
    selection: EditorSelection | null,
    viewport: EditorViewportKind,
    intent?: EditorPickIntent,
  ): void;
  hover(selection: EditorSelection | null): void;
  drag(event: EditorBrushDragEvent, tracePoints: readonly Vec3[]): void;
  placePointEntity(event: EditorPointEntityPlaceEvent): void;
  pointerPosition(event: EditorPointerPositionEvent): void;
  contextMenu(event: EditorViewportContextMenuEvent): void;
  entityPlacementBounds(): Bounds;
  brushFaceNormal(hit: BrushRayHit): Vec3 | null;
  create(event: EditorBrushCreateEvent): void;
  hull(event: EditorHullCreateEvent): void;
  hullPoints(): readonly Vec3[];
  previewHullPoints(points: readonly Vec3[]): void;
  addHullPoints(points: readonly Vec3[], viewport: 'perspective'): void;
  addHullFace(face: FaceSelection, viewport: 'perspective', clickedPoint?: Vec3): void;
  clearHullPreview(): void;
  brushFaceSelections(brushId: BrushId): readonly FaceSelection[];
  transfer(event: EditorFaceTransferEvent): void;
  face(event: EditorFaceDragEvent): void;
  selectFaceLasso(
    handles: readonly FaceHandle[],
    ensureSelected: boolean,
    viewport: EditorViewportKind,
  ): void;
  topologyHandles(kind: EditorTopologyKind): readonly TopologyHandle[];
  selectedTopologyHandles(): readonly TopologyHandle[];
  selectTopology(handle: TopologyHandle | null, additive: boolean): readonly TopologyHandle[];
  selectTopologyLasso(handles: readonly TopologyHandle[], additive: boolean): void;
  hoverTopology(handle: TopologyHandle | null): void;
  topology(event: EditorTopologyDragEvent, originalHandles: readonly TopologyHandle[]): void;
  transform(event: EditorTransformDragEvent): void;
  hoverTransformPivot(hovered: boolean): void;
  moveTransformPivot(event: EditorTransformPivotDragEvent): void;
  cameraChanged(
    viewport: EditorViewportKind,
    mode: EditorCameraNavigationMode,
    camera: EditorViewportCameraState,
  ): void;
  sweepCaps(): readonly (readonly Vec3[])[];
  sweep(event: EditorSweepDragEvent): void;
}

type TransformGesture =
  | {
      readonly tool: 'pivot';
      readonly pivot: Vec3;
    }
  | {
      readonly tool: 'rotate';
      readonly selection: EditorSelection;
      readonly pivot: Vec3;
      readonly axis: 0 | 1 | 2;
      readonly startVector: Vec3;
    }
  | {
      readonly tool: 'scale';
      readonly selection: EditorSelection;
      readonly bounds: Bounds;
      readonly handle: ScaleHandle;
    }
  | {
      readonly tool: 'shear';
      readonly selection: EditorSelection;
      readonly pivot: Vec3;
      readonly sourceAxis: 0 | 1 | 2;
      readonly targetAxis: 0 | 1 | 2;
      readonly sourceSpan: number;
    };

type SweepGesture =
  | {
      readonly mode: 'translate';
      readonly pivot: Vec3;
    }
  | {
      readonly mode: 'rotate';
      readonly pivot: Vec3;
      readonly axis: TransformAxis;
      readonly startVector: Vec3;
    }
  | {
      readonly mode: 'scale';
      readonly pivot: Vec3;
      readonly handle: Vec3;
    };

interface PointerDrag {
  readonly button: number;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly hit: EditorSelection | null;
  readonly moveSelection: EditorSelection | null;
  readonly duplicating: boolean;
  readonly objectPainting: boolean;
  readonly paintedBrushIds: Set<BrushId>;
  readonly paintedEntityIds: Set<EntityId>;
  readonly faceSelection: EditorFaceDragEvent['selection'] | null;
  readonly facePainting: boolean;
  readonly faceSplitting: boolean;
  readonly faceStamping: boolean;
  readonly faceTranslating: boolean;
  readonly faceLassoEligible: boolean;
  readonly faceLassoEnsureSelected: boolean;
  readonly paintedFaceKeys: Set<string>;
  readonly faceScreenDirection: readonly [number, number] | null;
  readonly facePixelsPerWorld: number;
  readonly anchor: Vec3 | null;
  readonly planePoint: Vec3 | null;
  readonly planeNormal: Vec3;
  readonly creating: boolean;
  readonly placingEntity: boolean;
  readonly creationReferenceBounds: Bounds | null;
  readonly hullBuilding: boolean;
  readonly hullPoint: Vec3 | null;
  readonly hullFace: FaceSelection | null;
  readonly hullDuplicating: boolean;
  readonly faceTransferMode: FaceAttributeTransferMode | null;
  readonly faceTransferSource: FaceSelection | null;
  readonly faceTransferTargets: FaceSelection[];
  readonly clipping: boolean;
  readonly clipPoint: Vec3 | null;
  readonly clipPointIndex: number | null;
  readonly transform: TransformGesture | null;
  readonly sweep: SweepGesture | null;
  readonly topologyKind: EditorTopologyKind | null;
  readonly topologyHandle: TopologyHandle | null;
  readonly topologyHandles: readonly TopologyHandle[];
  readonly topologySnapTarget: TopologyHandle | null;
  readonly topologySelection: BrushSelection | null;
  readonly topologyOperation: EditorTopologyDragEvent['operation'];
  readonly topologyLassoAdditive: boolean;
  readonly cameraMode: 'look' | 'orbit' | 'pan' | null;
  readonly cameraEye: Vec3 | null;
  x: number;
  y: number;
  moved: number;
  moving: boolean;
  faceMoving: boolean;
  faceLasso: boolean;
  transformMoving: boolean;
  pivotMoving: boolean;
  sweepMoving: boolean;
  topologyMoving: boolean;
  topologyLasso: boolean;
  clipMoving: boolean;
  hullMoving: boolean;
  faceTransferMoving: boolean;
  lastTopologySnapMode: 'relative' | 'absolute';
  lastMovementPlane: 'viewport' | 'xy' | 'z';
  lastAxisRestriction: TransformAxis | null;
  lastDelta: Vec3;
  lastFaceDistance: number;
  lastBounds: Bounds | null;
  lastCreationConstraint: EditorBrushCreateEvent['constraint'];
  lastClipPoint: Vec3 | null;
  lastHullPoints: readonly Vec3[];
  lastTransform: EditorTransformDragEvent | null;
  lastPivot: EditorTransformPivotDragEvent | null;
  lastSweep: EditorSweepDragEvent | null;
}

function initialState(kind: EditorViewportKind): ViewportState {
  return {
    center: kind === 'perspective' ? [0, 0, 48] : [0, 0, 48],
    yaw: Math.PI * 0.72,
    pitch: -0.43,
    distance: 620,
    orthographicSpan: 640,
    fieldOfViewRadians: Math.PI / 3,
    flySpeed: 320,
  };
}

class Viewport {
  private readonly context: GPUCanvasContext;
  private readonly uniform: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;
  private grid: GPUBuffer;
  private gridCount: number;
  private readonly state: ViewportState;
  private depth: GPUTexture | null = null;
  private width = 0;
  private height = 0;
  private scaleOverlayScene: SceneBuffers | null = null;
  private scaleOverlay: GPUBuffer | null = null;
  private scaleOverlayCount = 0;
  private disposed = false;
  private dragState: PointerDrag | null = null;
  private pendingFaceTransferClick: number | null = null;
  private faceTransferSequenceSource: FaceSelection | null | undefined;
  private faceTransferSequenceReset: number | null = null;
  private lassoElement: HTMLDivElement | null = null;
  private transformReadout: HTMLDivElement | null = null;
  private transformReadoutPivot: Vec3 | null = null;
  private readonly flyKeys = new Set<string>();
  private lastRenderTime = performance.now();
  private readonly cancelOnEscape = (event: KeyboardEvent) => {
    if (
      event.key !== 'Escape' ||
      (!this.dragState?.moving &&
        !this.dragState?.faceMoving &&
        !this.dragState?.facePainting &&
        !this.dragState?.faceLasso &&
        !this.dragState?.topologyMoving &&
        !this.dragState?.topologyLasso &&
        !this.dragState?.clipMoving &&
        !this.dragState?.faceTransferMoving &&
        !this.dragState?.transformMoving &&
        !this.dragState?.pivotMoving &&
        !this.dragState?.lastBounds)
    )
      return;
    event.preventDefault();
    this.cancelDrag();
  };
  private readonly clearInsertionOnModifierRelease = (event: KeyboardEvent) => {
    if (event.key === 'Shift' && !this.dragState) this.interaction.hoverTopology(null);
  };
  private readonly cameraKeyDown = (event: KeyboardEvent) => {
    if (this.kind !== 'perspective') return;
    const key = event.key.toLowerCase();
    if (!['w', 's', 'a', 'd', 'q', 'x'].includes(key)) return;
    event.preventDefault();
    event.stopPropagation();
    this.flyKeys.add(key);
  };
  private readonly cameraKeyUp = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!this.flyKeys.has(key)) return;
    event.preventDefault();
    event.stopPropagation();
    this.flyKeys.delete(key);
  };
  private readonly cameraBlur = () => {
    this.flyKeys.clear();
    this.canvas.closest('.viewport-pane')?.classList.remove('camera-focused');
  };
  private readonly cameraFocus = () => {
    this.canvas.closest('.viewport-pane')?.classList.add('camera-focused');
  };

  public constructor(
    private readonly device: GPUDevice,
    private readonly format: GPUTextureFormat,
    private readonly pipelines: Pipelines,
    public readonly kind: EditorViewportKind,
    public readonly canvas: HTMLCanvasElement,
    bindGroupLayout: GPUBindGroupLayout,
    private readonly interaction: ViewportInteraction,
    private gridSize: number,
  ) {
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU canvas context is unavailable');
    canvas.tabIndex = 0;
    this.context = context;
    this.context.configure({ device, format, alphaMode: 'opaque' });
    this.uniform = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniform } }],
    });
    const grid = gridVertices(kind, gridSize);
    this.grid = upload(device, grid, GPUBufferUsage.VERTEX);
    this.gridCount = grid.length / 6;
    this.state = initialState(kind);
    this.connectInput();
    this.canvas.addEventListener('keydown', this.cameraKeyDown);
    this.canvas.addEventListener('keyup', this.cameraKeyUp);
    this.canvas.addEventListener('blur', this.cameraBlur);
    this.canvas.addEventListener('focus', this.cameraFocus);
    window.addEventListener('keydown', this.cancelOnEscape);
    window.addEventListener('keyup', this.clearInsertionOnModifierRelease);
  }

  private perspectiveForward(): Vec3 {
    return normalize([
      Math.cos(this.state.yaw) * Math.cos(this.state.pitch),
      Math.sin(this.state.yaw) * Math.cos(this.state.pitch),
      Math.sin(this.state.pitch),
    ]);
  }

  private perspectiveEye(): Vec3 {
    return addScaled(this.state.center, this.perspectiveForward(), -this.state.distance);
  }

  private translatePerspectiveCamera(delta: Vec3): void {
    this.state.center = [
      this.state.center[0] + delta[0],
      this.state.center[1] + delta[1],
      this.state.center[2] + delta[2],
    ];
  }

  private notifyCamera(mode: EditorCameraNavigationMode): void {
    this.interaction.cameraChanged(this.kind, mode, this.camera);
  }

  private updateFlyCamera(): void {
    const now = performance.now();
    const seconds = Math.min(0.05, Math.max(0, (now - this.lastRenderTime) / 1000));
    this.lastRenderTime = now;
    if (this.kind !== 'perspective' || this.flyKeys.size === 0 || seconds === 0) return;
    const forward = this.perspectiveForward();
    const right = normalize(cross(forward, [0, 0, 1]));
    const movement: [number, number, number] = [0, 0, 0];
    const accumulate = (direction: Vec3, amount: number) => {
      movement[0] += direction[0] * amount;
      movement[1] += direction[1] * amount;
      movement[2] += direction[2] * amount;
    };
    if (this.flyKeys.has('w')) accumulate(forward, 1);
    if (this.flyKeys.has('s')) accumulate(forward, -1);
    if (this.flyKeys.has('d')) accumulate(right, 1);
    if (this.flyKeys.has('a')) accumulate(right, -1);
    if (this.flyKeys.has('q')) accumulate([0, 0, 1], 1);
    if (this.flyKeys.has('x')) accumulate([0, 0, 1], -1);
    if (Math.hypot(...movement) <= Number.EPSILON) return;
    const direction = normalize(movement);
    const distance = this.state.flySpeed * seconds;
    this.translatePerspectiveCamera([
      direction[0] * distance,
      direction[1] * distance,
      direction[2] * distance,
    ]);
    this.notifyCamera('fly');
  }

  public get camera(): EditorViewportCameraState {
    const position = this.kind === 'perspective' ? this.perspectiveEye() : this.state.center;
    return {
      center: [...this.state.center] as Vec3,
      position: [...position] as Vec3,
      yaw: this.state.yaw,
      pitch: this.state.pitch,
      distance: this.state.distance,
      orthographicSpan: this.state.orthographicSpan,
      fieldOfViewDegrees: (this.state.fieldOfViewRadians * 180) / Math.PI,
      flySpeed: this.state.flySpeed,
    };
  }

  public focusBounds(bounds: Bounds): void {
    const center: [number, number, number] = [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
    this.state.center = center;
    const aspect = Math.max(0.01, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
    if (this.kind === 'perspective') {
      const radius =
        Math.hypot(
          bounds.max[0] - bounds.min[0],
          bounds.max[1] - bounds.min[1],
          bounds.max[2] - bounds.min[2],
        ) / 2;
      const verticalHalfAngle = this.state.fieldOfViewRadians / 2;
      const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * aspect);
      this.state.distance = Math.max(
        24,
        (Math.max(radius, 8) / Math.sin(Math.min(verticalHalfAngle, horizontalHalfAngle))) * 1.18,
      );
    } else {
      const [rightAxis, upAxis]: readonly [TransformAxis, TransformAxis] =
        this.kind === 'xy' ? [0, 1] : this.kind === 'xz' ? [0, 2] : [1, 2];
      const width = bounds.max[rightAxis] - bounds.min[rightAxis];
      const height = bounds.max[upAxis] - bounds.min[upAxis];
      this.state.orthographicSpan = Math.max(32, Math.max(height, width / aspect) * 1.25);
    }
    this.notifyCamera('focus');
  }

  public setGridSize(gridSize: number): void {
    const next = Math.max(1, gridSize);
    if (next === this.gridSize) return;
    this.gridSize = next;
    this.grid.destroy();
    const grid = gridVertices(this.kind, next);
    this.grid = upload(this.device, grid, GPUBufferUsage.VERTEX);
    this.gridCount = grid.length / 6;
  }

  public render(
    scene: SceneBuffers,
    materialBindGroup: (name: string) => GPUBindGroup,
    clearColor: readonly [number, number, number, number],
  ): void {
    if (this.disposed) return;
    this.updateFlyCamera();
    this.resize();
    this.positionTransformReadout();
    if (!this.depth || this.width === 0 || this.height === 0) return;
    this.updateScaleOverlay(scene);
    const matrix = this.projectionView();
    this.device.queue.writeBuffer(
      this.uniform,
      0,
      matrix.buffer,
      matrix.byteOffset,
      matrix.byteLength,
    );
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] },
        },
      ],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 1,
      },
    });
    pass.setBindGroup(0, this.bindGroup);
    if (scene.solids.length > 0) {
      pass.setPipeline(this.pipelines.solid);
      for (const batch of scene.solids) {
        pass.setBindGroup(1, materialBindGroup(batch.materialName));
        pass.setVertexBuffer(0, batch.buffer);
        pass.draw(batch.count);
      }
    }
    pass.setPipeline(this.pipelines.lines);
    pass.setVertexBuffer(0, this.grid);
    pass.draw(this.gridCount);
    if (this.kind === 'perspective' && scene.perspectiveGridCount > 0) {
      pass.setVertexBuffer(0, scene.perspectiveGrid);
      pass.draw(scene.perspectiveGridCount);
    }
    if (scene.lineCount > 0) {
      pass.setVertexBuffer(0, scene.lines);
      pass.draw(scene.lineCount);
    }
    if (this.scaleOverlay && this.scaleOverlayCount > 0) {
      pass.setVertexBuffer(0, this.scaleOverlay);
      pass.draw(this.scaleOverlayCount);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeHandleLasso();
    this.hideTransformReadout();
    this.depth?.destroy();
    this.scaleOverlay?.destroy();
    this.uniform.destroy();
    this.grid.destroy();
    if (this.pendingFaceTransferClick !== null) window.clearTimeout(this.pendingFaceTransferClick);
    if (this.faceTransferSequenceReset !== null)
      window.clearTimeout(this.faceTransferSequenceReset);
    this.canvas.removeEventListener('keydown', this.cameraKeyDown);
    this.canvas.removeEventListener('keyup', this.cameraKeyUp);
    this.canvas.removeEventListener('blur', this.cameraBlur);
    this.canvas.removeEventListener('focus', this.cameraFocus);
    window.removeEventListener('keydown', this.cancelOnEscape);
    window.removeEventListener('keyup', this.clearInsertionOnModifierRelease);
  }

  public cancelInteraction(): void {
    if (this.pendingFaceTransferClick !== null) {
      window.clearTimeout(this.pendingFaceTransferClick);
      this.pendingFaceTransferClick = null;
    }
    if (this.faceTransferSequenceReset !== null) {
      window.clearTimeout(this.faceTransferSequenceReset);
      this.faceTransferSequenceReset = null;
    }
    this.faceTransferSequenceSource = undefined;
    this.cancelDrag();
  }

  private updateScaleOverlay(scene: SceneBuffers): void {
    if (scene === this.scaleOverlayScene) return;
    this.scaleOverlayScene = scene;
    this.scaleOverlay?.destroy();
    this.scaleOverlay = null;
    this.scaleOverlayCount = 0;
    if (!scene.scaleBounds) return;
    const vertices = scaleOverlayVertices(scene.scaleBounds, this.kind);
    if (vertices.length === 0) return;
    this.scaleOverlay = upload(this.device, vertices, GPUBufferUsage.VERTEX);
    this.scaleOverlayCount = vertices.length / 6;
  }

  private resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.depth?.destroy();
    this.depth = this.device.createTexture({
      size: [width, height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  private projectionView(): Float32Array {
    const aspect = Math.max(0.01, this.width / this.height);
    let eye: Vec3;
    let target: Vec3;
    let up: Vec3;
    let projection: Float32Array;
    if (this.kind === 'perspective') {
      const forward: Vec3 = [
        Math.cos(this.state.yaw) * Math.cos(this.state.pitch),
        Math.sin(this.state.yaw) * Math.cos(this.state.pitch),
        Math.sin(this.state.pitch),
      ];
      target = this.state.center;
      eye = addScaled(target, forward, -this.state.distance);
      up = [0, 0, 1];
      projection = mat4.perspective(this.state.fieldOfViewRadians, aspect, 1, 131_072);
    } else {
      const halfHeight = this.state.orthographicSpan / 2;
      const halfWidth = halfHeight * aspect;
      projection = mat4.ortho(-halfWidth, halfWidth, -halfHeight, halfHeight, 1, 131_072);
      if (this.kind === 'xy') {
        eye = [this.state.center[0], this.state.center[1], 65_536];
        target = [this.state.center[0], this.state.center[1], 0];
        up = [0, 1, 0];
      } else if (this.kind === 'xz') {
        eye = [this.state.center[0], -65_536, this.state.center[2]];
        target = [this.state.center[0], 0, this.state.center[2]];
        up = [0, 0, 1];
      } else {
        eye = [65_536, this.state.center[1], this.state.center[2]];
        target = [0, this.state.center[1], this.state.center[2]];
        up = [0, 0, 1];
      }
    }
    const view = mat4.lookAt(eye, target, up);
    return mat4.multiply(projection, view);
  }

  private viewDirection(): Vec3 {
    if (this.kind === 'perspective') return this.perspectiveForward();
    if (this.kind === 'xy') return [0, 0, -1];
    if (this.kind === 'xz') return [0, 1, 0];
    return [-1, 0, 0];
  }

  private rayAt(
    clientX: number,
    clientY: number,
  ): { readonly origin: Vec3; readonly direction: Vec3 } {
    const bounds = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    const ndcY = 1 - ((clientY - bounds.top) / bounds.height) * 2;
    const aspect = Math.max(0.01, bounds.width / bounds.height);
    if (this.kind === 'perspective') {
      const forward = this.perspectiveForward();
      const origin = this.perspectiveEye();
      const right = normalize(cross(forward, [0, 0, 1]));
      const up = normalize(cross(right, forward));
      const halfHeight = Math.tan(this.state.fieldOfViewRadians / 2);
      const direction = normalize(
        addScaled(addScaled(forward, right, ndcX * halfHeight * aspect), up, ndcY * halfHeight),
      );
      return { origin, direction };
    }
    const halfHeight = this.state.orthographicSpan / 2;
    const halfWidth = halfHeight * aspect;
    if (this.kind === 'xy') {
      return {
        origin: [
          this.state.center[0] + ndcX * halfWidth,
          this.state.center[1] + ndcY * halfHeight,
          65_536,
        ],
        direction: [0, 0, -1],
      };
    }
    if (this.kind === 'xz') {
      return {
        origin: [
          this.state.center[0] + ndcX * halfWidth,
          -65_536,
          this.state.center[2] + ndcY * halfHeight,
        ],
        direction: [0, 1, 0],
      };
    }
    return {
      origin: [
        65_536,
        this.state.center[1] + ndcX * halfWidth,
        this.state.center[2] + ndcY * halfHeight,
      ],
      direction: [-1, 0, 0],
    };
  }

  private projectToCanvas(point: Vec3): readonly [number, number] | null {
    const matrix = this.projectionView();
    const x = point[0];
    const y = point[1];
    const z = point[2];
    const clipX = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!;
    const clipY = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!;
    const clipW = matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!;
    if (!Number.isFinite(clipW) || Math.abs(clipW) <= 1e-6) return null;
    const bounds = this.canvas.getBoundingClientRect();
    return [((clipX / clipW + 1) * bounds.width) / 2, ((1 - clipY / clipW) * bounds.height) / 2];
  }

  private topologyHandleAt(
    kind: EditorTopologyKind,
    clientX: number,
    clientY: number,
  ): TopologyHandle | null {
    const bounds = this.canvas.getBoundingClientRect();
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    let nearest: { readonly handle: TopologyHandle; readonly distance: number } | null = null;
    for (const handle of this.interaction.topologyHandles(kind)) {
      const projected = this.projectToCanvas(handle.center);
      if (!projected) continue;
      const distance = Math.hypot(projected[0] - localX, projected[1] - localY);
      if (distance <= 14 && (!nearest || distance < nearest.distance)) {
        nearest = { handle, distance };
      }
    }
    return nearest?.handle ?? null;
  }

  private faceHandleAt(clientX: number, clientY: number): FaceHandle | null {
    const bounds = this.canvas.getBoundingClientRect();
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    const selection = this.interaction.currentSelection();
    let nearest: { readonly handle: FaceHandle; readonly score: number } | null = null;
    for (const handle of this.interaction.faceHandles()) {
      const projected = this.projectToCanvas(handle.center);
      if (!projected) continue;
      const distance = Math.hypot(projected[0] - localX, projected[1] - localY);
      const primary =
        selection?.brushId === handle.selection.brushId &&
        selection?.faceId === handle.selection.faceId;
      const score = distance - (primary ? 4 : 0);
      if (distance <= FACE_HANDLE_HIT_RADIUS && (!nearest || score < nearest.score)) {
        nearest = { handle, score };
      }
    }
    return nearest?.handle ?? null;
  }

  private prospectiveVertexHandleAt(clientX: number, clientY: number): TopologyHandle | null {
    const selection = this.interaction.currentSelection();
    if (!selection || selection.faceId) return null;
    const ray = this.rayAt(clientX, clientY);
    const hit = this.interaction.hitTests(ray.origin, ray.direction).find(isBrushRayHit);
    if (!hit || !isBrushSelected(selection, hit.brushId)) return null;
    const point = this.interaction.snapClipHit(hit, this.gridSize);
    if (!point) return null;
    const key = topologyHandleKey('vertex', [point]);
    if (this.interaction.topologyHandles('vertex').some((handle) => handle.key === key))
      return null;
    return {
      kind: 'vertex',
      center: point,
      vertices: [point],
      key,
      brushIds: [hit.brushId],
      insertion: true,
    };
  }

  private topologyHandlesInRectangle(
    kind: EditorTopologyKind,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): readonly TopologyHandle[] {
    const bounds = this.canvas.getBoundingClientRect();
    const minimumX = Math.min(startX, endX) - bounds.left;
    const maximumX = Math.max(startX, endX) - bounds.left;
    const minimumY = Math.min(startY, endY) - bounds.top;
    const maximumY = Math.max(startY, endY) - bounds.top;
    return this.interaction.topologyHandles(kind).filter((handle) => {
      const projected = this.projectToCanvas(handle.center);
      return (
        projected &&
        projected[0] >= minimumX &&
        projected[0] <= maximumX &&
        projected[1] >= minimumY &&
        projected[1] <= maximumY
      );
    });
  }

  private faceHandlesInRectangle(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): readonly FaceHandle[] {
    const bounds = this.canvas.getBoundingClientRect();
    const minimumX = Math.min(startX, endX) - bounds.left;
    const maximumX = Math.max(startX, endX) - bounds.left;
    const minimumY = Math.min(startY, endY) - bounds.top;
    const maximumY = Math.max(startY, endY) - bounds.top;
    return this.interaction.faceHandles().filter((handle) => {
      const projected = this.projectToCanvas(handle.center);
      return (
        projected &&
        projected[0] >= minimumX &&
        projected[0] <= maximumX &&
        projected[1] >= minimumY &&
        projected[1] <= maximumY
      );
    });
  }

  private updateHandleLasso(startX: number, startY: number, endX: number, endY: number): void {
    const pane = this.canvas.closest<HTMLElement>('.viewport-pane');
    if (!pane) return;
    const paneBounds = pane.getBoundingClientRect();
    const minimumX = Math.min(startX, endX) - paneBounds.left;
    const maximumX = Math.max(startX, endX) - paneBounds.left;
    const minimumY = Math.min(startY, endY) - paneBounds.top;
    const maximumY = Math.max(startY, endY) - paneBounds.top;
    if (!this.lassoElement) {
      this.lassoElement = document.createElement('div');
      this.lassoElement.className = 'handle-lasso';
      pane.append(this.lassoElement);
    }
    Object.assign(this.lassoElement.style, {
      left: `${minimumX}px`,
      top: `${minimumY}px`,
      width: `${maximumX - minimumX}px`,
      height: `${maximumY - minimumY}px`,
    });
  }

  private removeHandleLasso(): void {
    this.lassoElement?.remove();
    this.lassoElement = null;
  }

  private showTransformReadout(text: string, pivot: Vec3): void {
    const pane = this.canvas.closest<HTMLElement>('.viewport-pane');
    if (!pane) return;
    if (!this.transformReadout) {
      this.transformReadout = document.createElement('div');
      this.transformReadout.className = 'transform-readout';
      pane.append(this.transformReadout);
    }
    this.transformReadout.textContent = text;
    this.transformReadoutPivot = [...pivot] as Vec3;
    this.positionTransformReadout();
  }

  private showPivotCoordinates(pivot: Vec3): void {
    const label = pivot
      .map((component) =>
        Number.isInteger(component)
          ? String(component)
          : component.toFixed(3).replace(/\.?0+$/, ''),
      )
      .join('  ');
    this.showTransformReadout(label, pivot);
  }

  private positionTransformReadout(): void {
    if (!this.transformReadout || !this.transformReadoutPivot) return;
    const pane = this.canvas.closest<HTMLElement>('.viewport-pane');
    const projected = this.projectToCanvas(this.transformReadoutPivot);
    if (!pane || !projected) {
      this.transformReadout.hidden = true;
      return;
    }
    const paneBounds = pane.getBoundingClientRect();
    const canvasBounds = this.canvas.getBoundingClientRect();
    this.transformReadout.hidden = false;
    this.transformReadout.style.left = `${canvasBounds.left - paneBounds.left + projected[0]}px`;
    this.transformReadout.style.top = `${canvasBounds.top - paneBounds.top + projected[1]}px`;
  }

  private hideTransformReadout(): void {
    this.transformReadout?.remove();
    this.transformReadout = null;
    this.transformReadoutPivot = null;
  }

  private absoluteTopologyDelta(
    handle: TopologyHandle,
    relativeDelta: Vec3,
    axes: readonly TransformAxis[],
  ): Vec3 {
    const delta: [number, number, number] = [0, 0, 0];
    for (const axis of axes) {
      delta[axis] =
        Math.round((handle.center[axis] + relativeDelta[axis]) / this.gridSize) * this.gridSize -
        handle.center[axis];
    }
    return delta;
  }

  private pointerMovementDelta(
    drag: PointerDrag,
    event: PointerEvent,
    restrictAxis: boolean,
  ): {
    readonly delta: Vec3;
    readonly axes: readonly TransformAxis[];
    readonly movementPlane: 'viewport' | 'xy' | 'z';
    readonly axisRestriction: TransformAxis | null;
  } | null {
    if (!drag.planePoint || !drag.anchor) return null;
    const viewportAxes = this.viewportAxes();
    const vertical = this.kind === 'perspective' && event.altKey;
    const movementPlane = vertical ? 'z' : this.kind === 'perspective' ? 'xy' : 'viewport';
    const axes: readonly TransformAxis[] = vertical
      ? [2]
      : this.kind === 'perspective'
        ? [0, 1]
        : [viewportAxes.right, viewportAxes.up];
    let delta: Vec3;
    if (vertical) {
      const mapping = this.faceDragMapping(drag.planePoint, [0, 0, 1]);
      const totalX = event.clientX - drag.startX;
      const totalY = event.clientY - drag.startY;
      const projectedPixels = totalX * mapping.direction[0] + totalY * mapping.direction[1];
      const distance =
        Math.round(projectedPixels / mapping.pixelsPerWorld / this.gridSize) * this.gridSize;
      delta = [0, 0, distance];
    } else {
      const ray = this.rayAt(event.clientX, event.clientY);
      const normal: Vec3 = this.kind === 'perspective' ? [0, 0, 1] : this.viewDirection();
      const point = rayPlaneIntersection(ray.origin, ray.direction, drag.planePoint, normal);
      if (!point) return null;
      delta = snappedDelta(drag.anchor, point, this.gridSize);
    }
    if (!restrictAxis || !event.shiftKey || axes.length < 2) {
      return { delta, axes, movementPlane, axisRestriction: null };
    }
    const axisRestriction = axes.reduce((best, axis) =>
      Math.abs(delta[axis]) > Math.abs(delta[best]) ? axis : best,
    );
    const restricted: [number, number, number] = [0, 0, 0];
    restricted[axisRestriction] = delta[axisRestriction];
    return { delta: restricted, axes: [axisRestriction], movementPlane, axisRestriction };
  }

  private faceDragMapping(
    center: Vec3,
    normal: Vec3,
  ): { readonly direction: readonly [number, number]; readonly pixelsPerWorld: number } {
    const referenceDistance = Math.max(this.gridSize * 4, 64);
    const start = this.projectToCanvas(center);
    const end = this.projectToCanvas(addScaled(center, normal, referenceDistance));
    if (start && end) {
      const deltaX = end[0] - start[0];
      const deltaY = end[1] - start[1];
      const magnitude = Math.hypot(deltaX, deltaY);
      if (magnitude >= 2) {
        return {
          direction: [deltaX / magnitude, deltaY / magnitude],
          pixelsPerWorld: magnitude / referenceDistance,
        };
      }
    }
    const bounds = this.canvas.getBoundingClientRect();
    const visibleWorldHeight =
      this.kind === 'perspective'
        ? 2 * this.state.distance * Math.tan(this.state.fieldOfViewRadians / 2)
        : this.state.orthographicSpan;
    return {
      direction: [0, -1],
      pixelsPerWorld: Math.max(0.01, bounds.height / visibleWorldHeight),
    };
  }

  private clipPointIndexAt(clientX: number, clientY: number): number | null {
    const canvasBounds = this.canvas.getBoundingClientRect();
    const localX = clientX - canvasBounds.left;
    const localY = clientY - canvasBounds.top;
    let nearest: { readonly index: number; readonly distance: number } | null = null;
    for (const [index, point] of this.interaction.clipPoints().entries()) {
      const projected = this.projectToCanvas(point);
      if (!projected) continue;
      const distance = Math.hypot(projected[0] - localX, projected[1] - localY);
      if (distance <= 12 && (!nearest || distance < nearest.distance)) {
        nearest = { index, distance };
      }
    }
    return nearest?.index ?? null;
  }

  private clipPointAt(clientX: number, clientY: number, depthPoint?: Vec3): Vec3 | null {
    const ray = this.rayAt(clientX, clientY);
    if (this.kind === 'perspective') {
      const hit = this.interaction.hitTests(ray.origin, ray.direction).find(isBrushRayHit);
      return hit ? this.interaction.snapClipHit(hit, this.gridSize) : null;
    }
    const selection = this.interaction.currentSelection();
    const center =
      depthPoint ?? (selection ? this.interaction.brushCenter(selection) : this.state.center);
    if (!center) return null;
    const point = rayPlaneIntersection(ray.origin, ray.direction, center, this.viewDirection());
    if (!point) return null;
    const snapped = [...point] as [number, number, number];
    const visibleAxes =
      this.kind === 'xy'
        ? ([0, 1] as const)
        : this.kind === 'xz'
          ? ([0, 2] as const)
          : ([1, 2] as const);
    for (const axis of visibleAxes) {
      snapped[axis] = Math.round(snapped[axis] / this.gridSize) * this.gridSize;
    }
    const depthAxis = this.kind === 'xy' ? 2 : this.kind === 'xz' ? 1 : 0;
    snapped[depthAxis] = center[depthAxis];
    return snapped;
  }

  private pointEntityOriginAt(clientX: number, clientY: number): Vec3 | null {
    const ray = this.rayAt(clientX, clientY);
    const relativeBounds = this.interaction.entityPlacementBounds();
    const currentSelection = this.interaction.currentSelection();
    const selectionBounds = currentSelection
      ? this.interaction.brushBounds(currentSelection)
      : null;
    if (this.kind === 'perspective') {
      const hit = this.interaction.hitTests(ray.origin, ray.direction).find(isBrushRayHit);
      let point: Vec3 | null = hit?.point ?? null;
      let normal: Vec3 = [0, 0, 1];
      if (hit) {
        normal = this.interaction.brushFaceNormal(hit) ?? normal;
      } else {
        const height = selectionBounds?.max[2] ?? 0;
        point = rayPlaneIntersection(ray.origin, ray.direction, [0, 0, height], [0, 0, 1]);
      }
      if (!point) return null;
      const origin = point.map(
        (component) => Math.round(component / this.gridSize) * this.gridSize,
      ) as [number, number, number];
      const axis = dominantAxis(normal);
      const relativeSide = normal[axis] >= 0 ? relativeBounds.min[axis] : relativeBounds.max[axis];
      origin[axis] = Math.round((point[axis] - relativeSide) / this.gridSize) * this.gridSize;
      return origin;
    }
    const center = selectionBounds
      ? ([
          (selectionBounds.min[0] + selectionBounds.max[0]) / 2,
          (selectionBounds.min[1] + selectionBounds.max[1]) / 2,
          (selectionBounds.min[2] + selectionBounds.max[2]) / 2,
        ] as [number, number, number])
      : this.state.center;
    const viewDirection = this.viewDirection();
    if (selectionBounds) {
      const depthAxis = this.kind === 'xy' ? 2 : this.kind === 'xz' ? 1 : 0;
      center[depthAxis] =
        viewDirection[depthAxis] >= 0
          ? selectionBounds.max[depthAxis]
          : selectionBounds.min[depthAxis];
    }
    const point = rayPlaneIntersection(ray.origin, ray.direction, center, viewDirection);
    if (!point) return null;
    const origin = [...center] as [number, number, number];
    const visibleAxes =
      this.kind === 'xy'
        ? ([0, 1] as const)
        : this.kind === 'xz'
          ? ([0, 2] as const)
          : ([1, 2] as const);
    for (const axis of visibleAxes) {
      origin[axis] = Math.round(point[axis] / this.gridSize) * this.gridSize;
    }
    return origin;
  }

  private pointerPositionAt(clientX: number, clientY: number): EditorPointerPositionEvent | null {
    const ray = this.rayAt(clientX, clientY);
    const selection = this.interaction.currentSelection();
    const selectionBounds = selection ? this.interaction.brushBounds(selection) : null;
    if (this.kind === 'perspective') {
      const hit = this.interaction.hitTests(ray.origin, ray.direction).find(isBrushRayHit);
      if (hit) {
        const point = this.interaction.snapClipHit(hit, this.gridSize);
        if (!point) return null;
        return {
          viewport: this.kind,
          point,
          surfaceNormal: this.interaction.brushFaceNormal(hit),
        };
      }
      const height = selectionBounds?.max[2] ?? 0;
      const point = rayPlaneIntersection(ray.origin, ray.direction, [0, 0, height], [0, 0, 1]);
      if (!point) return null;
      return {
        viewport: this.kind,
        point: point.map((component) => Math.round(component / this.gridSize) * this.gridSize) as [
          number,
          number,
          number,
        ],
        surfaceNormal: [0, 0, 1],
      };
    }
    const center = selectionBounds
      ? ([
          (selectionBounds.min[0] + selectionBounds.max[0]) / 2,
          (selectionBounds.min[1] + selectionBounds.max[1]) / 2,
          (selectionBounds.min[2] + selectionBounds.max[2]) / 2,
        ] as [number, number, number])
      : this.state.center;
    const viewDirection = this.viewDirection();
    if (selectionBounds) {
      const depthAxis = this.kind === 'xy' ? 2 : this.kind === 'xz' ? 1 : 0;
      center[depthAxis] =
        viewDirection[depthAxis] >= 0
          ? selectionBounds.max[depthAxis]
          : selectionBounds.min[depthAxis];
    }
    const point = rayPlaneIntersection(ray.origin, ray.direction, center, viewDirection);
    if (!point) return null;
    const snapped = [...center] as [number, number, number];
    const visibleAxes =
      this.kind === 'xy'
        ? ([0, 1] as const)
        : this.kind === 'xz'
          ? ([0, 2] as const)
          : ([1, 2] as const);
    for (const axis of visibleAxes) {
      snapped[axis] = Math.round(point[axis] / this.gridSize) * this.gridSize;
    }
    return {
      viewport: this.kind,
      point: snapped,
      surfaceNormal: selectionBounds ? viewDirection : null,
    };
  }

  private viewportAxes(): {
    readonly right: 0 | 1 | 2;
    readonly up: 0 | 1 | 2;
    readonly normal: 0 | 1 | 2;
  } {
    if (this.kind === 'xz') return { right: 0, up: 2, normal: 1 };
    if (this.kind === 'yz') return { right: 1, up: 2, normal: 0 };
    return { right: 0, up: 1, normal: 2 };
  }

  private worldPerPixel(): number {
    const visibleWorldHeight =
      this.kind === 'perspective'
        ? 2 * this.state.distance * Math.tan(this.state.fieldOfViewRadians / 2)
        : this.state.orthographicSpan;
    return visibleWorldHeight / Math.max(1, this.canvas.clientHeight);
  }

  private scaleHandleAt(bounds: Bounds, clientX: number, clientY: number): ScaleHandle | null {
    const viewportAxes = this.viewportAxes();
    const activeAxes: readonly TransformAxis[] =
      this.kind === 'perspective' ? [0, 1, 2] : [viewportAxes.right, viewportAxes.up];
    const canvasBounds = this.canvas.getBoundingClientRect();
    const localX = clientX - canvasBounds.left;
    const localY = clientY - canvasBounds.top;
    let nearest: { readonly handle: ScaleHandle; readonly distance: number } | null = null;
    for (const handle of scaleHandles(bounds, activeAxes)) {
      const projected = this.projectToCanvas(handle.point);
      if (!projected) continue;
      const distance = Math.hypot(projected[0] - localX, projected[1] - localY);
      if (distance <= 14 && (!nearest || distance < nearest.distance)) {
        nearest = { handle, distance };
      }
    }
    return nearest?.handle ?? null;
  }

  private transformPivotHandleAt(pivot: Vec3, clientX: number, clientY: number): boolean {
    const projected = this.projectToCanvas(pivot);
    if (!projected) return false;
    const bounds = this.canvas.getBoundingClientRect();
    return (
      Math.hypot(projected[0] - (clientX - bounds.left), projected[1] - (clientY - bounds.top)) <=
      14
    );
  }

  private rotationAxisAt(
    bounds: Bounds,
    pivot: Vec3,
    clientX: number,
    clientY: number,
  ): TransformAxis | null {
    if (this.kind !== 'perspective') return this.viewportAxes().normal;
    const size: Vec3 = [
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
    ];
    const radius = Math.max(...size) * 0.62 + Math.max(3, Math.min(10, Math.max(...size) * 0.04));
    const rings = [
      { axis: 0 as const, first: 1 as const, second: 2 as const },
      { axis: 1 as const, first: 0 as const, second: 2 as const },
      { axis: 2 as const, first: 0 as const, second: 1 as const },
    ];
    const canvasBounds = this.canvas.getBoundingClientRect();
    const local: readonly [number, number] = [
      clientX - canvasBounds.left,
      clientY - canvasBounds.top,
    ];
    let nearest: { readonly axis: TransformAxis; readonly distance: number } | null = null;
    for (const ring of rings) {
      let previous: readonly [number, number] | null = null;
      for (let segment = 0; segment <= 48; segment += 1) {
        const radians = (segment / 48) * Math.PI * 2;
        const point = [...pivot] as [number, number, number];
        point[ring.first] += Math.cos(radians) * radius;
        point[ring.second] += Math.sin(radians) * radius;
        const projected = this.projectToCanvas(point);
        if (previous && projected) {
          const distance = pointSegmentDistance(local, previous, projected);
          if (distance <= 10 && (!nearest || distance < nearest.distance)) {
            nearest = { axis: ring.axis, distance };
          }
        }
        previous = projected;
      }
    }
    return nearest?.axis ?? null;
  }

  private sweepGestureAt(clientX: number, clientY: number): SweepGesture | null {
    if (this.kind !== 'perspective') return null;
    const caps = this.interaction.sweepCaps();
    const bounds = sweepCapsBounds(caps);
    if (!bounds) return null;
    const pivot = boundsCenter(bounds);
    const handle = sweepScaleHandle(bounds);
    const canvasBounds = this.canvas.getBoundingClientRect();
    const local: readonly [number, number] = [
      clientX - canvasBounds.left,
      clientY - canvasBounds.top,
    ];
    const projectedHandle = this.projectToCanvas(handle);
    if (
      projectedHandle &&
      Math.hypot(projectedHandle[0] - local[0], projectedHandle[1] - local[1]) <= 14
    ) {
      return { mode: 'scale', pivot, handle };
    }
    const projectedPivot = this.projectToCanvas(pivot);
    if (
      projectedPivot &&
      Math.hypot(projectedPivot[0] - local[0], projectedPivot[1] - local[1]) <= 14
    ) {
      return { mode: 'translate', pivot };
    }

    const size: Vec3 = [
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
    ];
    const radius = Math.max(
      12,
      Math.max(...size) * 0.62 + Math.max(3, Math.min(10, Math.max(...size) * 0.04)),
    );
    const ringAxes = [
      { axis: 0 as const, first: 1 as const, second: 2 as const },
      { axis: 1 as const, first: 0 as const, second: 2 as const },
      { axis: 2 as const, first: 0 as const, second: 1 as const },
    ];
    let nearest: { readonly axis: TransformAxis; readonly distance: number } | null = null;
    for (const ring of ringAxes) {
      let previous: readonly [number, number] | null = null;
      for (let segment = 0; segment <= 48; segment += 1) {
        const radians = (segment / 48) * Math.PI * 2;
        const point = [...pivot] as [number, number, number];
        point[ring.first] += Math.cos(radians) * radius;
        point[ring.second] += Math.sin(radians) * radius;
        const projected = this.projectToCanvas(point);
        if (previous && projected) {
          const distance = pointSegmentDistance(local, previous, projected);
          if (distance <= 10 && (!nearest || distance < nearest.distance)) {
            nearest = { axis: ring.axis, distance };
          }
        }
        previous = projected;
      }
    }
    if (!nearest) return null;
    const normal: Vec3 =
      nearest.axis === 0 ? [1, 0, 0] : nearest.axis === 1 ? [0, 1, 0] : [0, 0, 1];
    const ray = this.rayAt(clientX, clientY);
    const point = rayPlaneIntersection(ray.origin, ray.direction, pivot, normal);
    if (!point) return null;
    const startVector: Vec3 = [point[0] - pivot[0], point[1] - pivot[1], point[2] - pivot[2]];
    return Math.hypot(...startVector) <= 1e-4
      ? null
      : { mode: 'rotate', pivot, axis: nearest.axis, startVector };
  }

  private sweepDragEvent(
    gesture: SweepGesture,
    drag: PointerDrag,
    event: PointerEvent,
  ): EditorSweepDragEvent | null {
    if (this.kind !== 'perspective') return null;
    if (gesture.mode === 'translate') {
      const movement = this.pointerMovementDelta(drag, event, true);
      if (!movement || movement.movementPlane === 'viewport') return null;
      return {
        phase: 'preview',
        viewport: 'perspective',
        mode: 'translate',
        delta: movement.delta,
        movementPlane: movement.movementPlane,
        axisRestriction: movement.axisRestriction,
      };
    }
    if (gesture.mode === 'rotate') {
      const normal: Vec3 =
        gesture.axis === 0 ? [1, 0, 0] : gesture.axis === 1 ? [0, 1, 0] : [0, 0, 1];
      const ray = this.rayAt(event.clientX, event.clientY);
      const point = rayPlaneIntersection(ray.origin, ray.direction, gesture.pivot, normal);
      if (!point) return null;
      const current: Vec3 = [
        point[0] - gesture.pivot[0],
        point[1] - gesture.pivot[1],
        point[2] - gesture.pivot[2],
      ];
      if (Math.hypot(...current) <= 1e-4) return null;
      const radians = Math.atan2(
        dot(normal, cross(gesture.startVector, current)),
        dot(gesture.startVector, current),
      );
      const snap = event.shiftKey ? 5 : 15;
      return {
        phase: 'preview',
        viewport: 'perspective',
        mode: 'rotate',
        axis: gesture.axis,
        angleDegrees: Math.round((radians * 180) / Math.PI / snap) * snap,
      };
    }
    const projectedPivot = this.projectToCanvas(gesture.pivot);
    const projectedHandle = this.projectToCanvas(gesture.handle);
    if (!projectedPivot || !projectedHandle) return null;
    const canvasBounds = this.canvas.getBoundingClientRect();
    const startX = projectedHandle[0] - projectedPivot[0];
    const startY = projectedHandle[1] - projectedPivot[1];
    const denominator = startX * startX + startY * startY;
    if (denominator <= 1e-6) return null;
    const currentX = event.clientX - canvasBounds.left - projectedPivot[0];
    const currentY = event.clientY - canvasBounds.top - projectedPivot[1];
    return {
      phase: 'preview',
      viewport: 'perspective',
      mode: 'scale',
      factor: snappedScaleFactor((currentX * startX + currentY * startY) / denominator),
    };
  }

  private createTransformGesture(
    tool: 'rotate' | 'scale' | 'shear',
    selection: EditorSelection,
    bounds: Bounds,
    clientX: number,
    clientY: number,
  ): TransformGesture | null {
    const boundsPivot: Vec3 = [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
    const pivot =
      tool === 'rotate' ? (this.interaction.transformPivot() ?? boundsPivot) : boundsPivot;
    const axes = this.viewportAxes();
    if (tool === 'rotate') {
      if (this.transformPivotHandleAt(pivot, clientX, clientY)) {
        return { tool: 'pivot', pivot };
      }
      const axis = this.rotationAxisAt(bounds, pivot, clientX, clientY);
      if (axis === null) return null;
      const normal: Vec3 = axis === 0 ? [1, 0, 0] : axis === 1 ? [0, 1, 0] : [0, 0, 1];
      const ray = this.rayAt(clientX, clientY);
      const point = rayPlaneIntersection(ray.origin, ray.direction, pivot, normal);
      if (!point) return null;
      const startVector: Vec3 = [point[0] - pivot[0], point[1] - pivot[1], point[2] - pivot[2]];
      if (Math.hypot(...startVector) <= 1e-4) return null;
      return { tool, selection, pivot, axis, startVector };
    }
    if (tool === 'scale') {
      const handle = this.scaleHandleAt(bounds, clientX, clientY);
      return handle ? { tool, selection, bounds, handle } : null;
    }
    const sourceAxis = this.kind === 'perspective' ? 2 : axes.up;
    const targetAxis = this.kind === 'perspective' ? 0 : axes.right;
    const sourceSpan = bounds.max[sourceAxis] - bounds.min[sourceAxis];
    if (sourceSpan <= 1e-6) return null;
    const shearPivot = [...pivot] as [number, number, number];
    shearPivot[sourceAxis] = bounds.min[sourceAxis];
    return { tool, selection, pivot: shearPivot, sourceAxis, targetAxis, sourceSpan };
  }

  private transformDragEvent(
    gesture: TransformGesture,
    event: PointerEvent,
    startX: number,
  ): EditorTransformDragEvent | null {
    if (gesture.tool === 'pivot') return null;
    if (gesture.tool === 'rotate') {
      const normal: Vec3 =
        gesture.axis === 0 ? [1, 0, 0] : gesture.axis === 1 ? [0, 1, 0] : [0, 0, 1];
      const ray = this.rayAt(event.clientX, event.clientY);
      const point = rayPlaneIntersection(ray.origin, ray.direction, gesture.pivot, normal);
      if (!point) return null;
      const current: Vec3 = [
        point[0] - gesture.pivot[0],
        point[1] - gesture.pivot[1],
        point[2] - gesture.pivot[2],
      ];
      if (Math.hypot(...current) <= 1e-4) return null;
      const radians = Math.atan2(
        dot(normal, cross(gesture.startVector, current)),
        dot(gesture.startVector, current),
      );
      const snap = event.shiftKey ? 5 : 15;
      const angleDegrees = Math.round((radians * 180) / Math.PI / snap) * snap;
      return {
        phase: 'preview',
        viewport: this.kind,
        tool: 'rotate',
        selection: gesture.selection,
        pivot: gesture.pivot,
        axis: gesture.axis,
        angleDegrees,
      };
    }
    if (gesture.tool === 'scale') {
      const pivot = scalePivot(gesture.bounds, gesture.handle, event.altKey);
      const viewportAxes = this.viewportAxes();
      const proportionalAxes: readonly TransformAxis[] =
        this.kind === 'perspective' ? [0, 1, 2] : [viewportAxes.right, viewportAxes.up];
      const transformedAxes = event.shiftKey ? proportionalAxes : gesture.handle.axes;
      const factors: [number, number, number] = [1, 1, 1];

      if (this.kind === 'perspective' || event.shiftKey) {
        const projectedPivot = this.projectToCanvas(pivot);
        const projectedHandle = this.projectToCanvas(gesture.handle.point);
        if (!projectedPivot || !projectedHandle) return null;
        const canvasBounds = this.canvas.getBoundingClientRect();
        const projectedStartX = projectedHandle[0] - projectedPivot[0];
        const projectedStartY = projectedHandle[1] - projectedPivot[1];
        const denominator = projectedStartX * projectedStartX + projectedStartY * projectedStartY;
        if (denominator <= 1e-6) return null;
        const currentX = event.clientX - canvasBounds.left - projectedPivot[0];
        const currentY = event.clientY - canvasBounds.top - projectedPivot[1];
        const factor = snappedScaleFactor(
          (currentX * projectedStartX + currentY * projectedStartY) / denominator,
        );
        for (const axis of transformedAxes) factors[axis] = factor;
      } else {
        const ray = this.rayAt(event.clientX, event.clientY);
        const point = rayPlaneIntersection(
          ray.origin,
          ray.direction,
          gesture.handle.point,
          this.viewDirection(),
        );
        if (!point) return null;
        for (const axis of transformedAxes) {
          const start = gesture.handle.point[axis] - pivot[axis];
          if (Math.abs(start) <= 1e-6) continue;
          factors[axis] = snappedScaleFactor((point[axis] - pivot[axis]) / start);
        }
      }
      return {
        phase: 'preview',
        viewport: this.kind,
        tool: 'scale',
        selection: gesture.selection,
        pivot,
        factors,
      };
    }
    const offset =
      Math.round(((event.clientX - startX) * this.worldPerPixel()) / this.gridSize) * this.gridSize;
    return {
      phase: 'preview',
      viewport: this.kind,
      tool: 'shear',
      selection: gesture.selection,
      pivot: gesture.pivot,
      sourceAxis: gesture.sourceAxis,
      targetAxis: gesture.targetAxis,
      factor: offset / gesture.sourceSpan,
      offset,
    };
  }

  private connectInput(): void {
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('pointerdown', (event) => {
      this.canvas.focus({ preventScroll: true });
      this.canvas.setPointerCapture(event.pointerId);
      const pointerPosition = this.pointerPositionAt(event.clientX, event.clientY);
      if (pointerPosition) this.interaction.pointerPosition(pointerPosition);
      const ray = this.rayAt(event.clientX, event.clientY);
      const cameraMode: PointerDrag['cameraMode'] =
        event.button === 1
          ? 'pan'
          : event.button === 2
            ? this.kind === 'perspective'
              ? event.altKey
                ? 'orbit'
                : 'look'
              : 'pan'
            : null;
      const cameraEye = this.kind === 'perspective' ? this.perspectiveEye() : null;
      if (cameraMode === 'orbit' && cameraEye) {
        const orbitPoint = this.interaction.hitTest(ray.origin, ray.direction)?.point;
        if (orbitPoint) {
          const direction: Vec3 = [
            orbitPoint[0] - cameraEye[0],
            orbitPoint[1] - cameraEye[1],
            orbitPoint[2] - cameraEye[2],
          ];
          const distance = Math.hypot(...direction);
          if (distance > 1) {
            const forward = normalize(direction);
            this.state.center = [...orbitPoint] as [number, number, number];
            this.state.distance = distance;
            this.state.yaw = Math.atan2(forward[1], forward[0]);
            this.state.pitch = Math.asin(Math.max(-1, Math.min(1, forward[2])));
          }
        }
      }
      const tool = this.interaction.currentTool();
      const creating = event.button === 0 && tool === 'create';
      const placingEntity = event.button === 0 && tool === 'entity';
      const hullBuilding = event.button === 0 && tool === 'hull';
      const sweep =
        event.button === 0 && tool === 'sweep' && this.kind === 'perspective'
          ? this.sweepGestureAt(event.clientX, event.clientY)
          : null;
      const clipping = event.button === 0 && tool === 'clip';
      const clipPointIndex = clipping ? this.clipPointIndexAt(event.clientX, event.clientY) : null;
      const topologyKind = tool === 'vertex' || tool === 'edge' ? tool : null;
      const existingTopologyHandle =
        event.button === 0 && topologyKind
          ? this.topologyHandleAt(topologyKind, event.clientX, event.clientY)
          : null;
      const insertionTopologyHandle =
        event.button === 0 && topologyKind === 'vertex' && event.shiftKey && !existingTopologyHandle
          ? this.prospectiveVertexHandleAt(event.clientX, event.clientY)
          : null;
      const selectedTopologyHandles = this.interaction.selectedTopologyHandles();
      const topologySnapTarget =
        event.button === 0 &&
        topologyKind === 'vertex' &&
        event.shiftKey &&
        event.altKey &&
        existingTopologyHandle &&
        selectedTopologyHandles.length > 0 &&
        !selectedTopologyHandles.some((handle) => handle.key === existingTopologyHandle.key)
          ? existingTopologyHandle
          : null;
      const hitTopologyHandle = existingTopologyHandle ?? insertionTopologyHandle;
      const topologyHandles =
        event.button === 0 && topologyKind
          ? topologySnapTarget
            ? selectedTopologyHandles
            : insertionTopologyHandle
              ? [insertionTopologyHandle]
              : existingTopologyHandle
                ? this.interaction.selectTopology(
                    existingTopologyHandle,
                    event.ctrlKey || event.metaKey,
                  )
                : this.interaction.selectedTopologyHandles()
          : [];
      const topologyHandle =
        topologySnapTarget ??
        (hitTopologyHandle && topologyHandles.some((handle) => handle.key === hitTopologyHandle.key)
          ? hitTopologyHandle
          : null);
      const facePainting =
        event.button === 0 &&
        tool === 'face' &&
        !event.altKey &&
        event.shiftKey &&
        (event.ctrlKey || event.metaKey);
      const hitFaceHandle =
        event.button === 0 && tool === 'face' && !facePainting
          ? this.faceHandleAt(event.clientX, event.clientY)
          : null;
      const stampRequested = Boolean(
        hitFaceHandle &&
        event.altKey &&
        (event.ctrlKey || event.metaKey) &&
        this.kind === 'perspective',
      );
      const creationSurfaceHit =
        creating && this.kind === 'perspective'
          ? this.interaction.hitTests(ray.origin, ray.direction).find(isBrushRayHit)
          : null;
      const currentSelection = this.interaction.currentSelection();
      const needsBrushHit =
        tool !== 'select' ||
        event.shiftKey ||
        Boolean(this.kind === 'perspective' && event.altKey && currentSelection?.faceId);
      const hit =
        event.button === 0 && !creating && !placingEntity && !topologyHandle && !sweep
          ? needsBrushHit
            ? (this.interaction.hitTests(ray.origin, ray.direction).find(isBrushRayHit) ?? null)
            : this.interaction.hitTest(ray.origin, ray.direction)
          : null;
      const creationReferenceBounds =
        creating && currentSelection ? this.interaction.brushBounds(currentSelection) : null;
      const supportsFaceTransfer =
        event.button === 0 &&
        this.kind === 'perspective' &&
        event.altKey &&
        !stampRequested &&
        (tool === 'select' || tool === 'face');
      if (!supportsFaceTransfer) {
        if (this.faceTransferSequenceReset !== null) {
          window.clearTimeout(this.faceTransferSequenceReset);
          this.faceTransferSequenceReset = null;
        }
        this.faceTransferSequenceSource = undefined;
      } else {
        if (this.faceTransferSequenceReset === null) {
          this.faceTransferSequenceSource = currentSelection?.faceId
            ? { brushId: currentSelection.brushId, faceId: currentSelection.faceId }
            : null;
        } else {
          window.clearTimeout(this.faceTransferSequenceReset);
        }
        this.faceTransferSequenceReset = window.setTimeout(() => {
          this.faceTransferSequenceReset = null;
          this.faceTransferSequenceSource = undefined;
        }, 350);
      }
      const visibleFaceSelection =
        hit && isBrushRayHit(hit) ? { brushId: hit.brushId, faceId: hit.faceId } : null;
      const togglingSelectedVisibleFace =
        event.shiftKey &&
        visibleFaceSelection &&
        isFaceSelected(currentSelection, visibleFaceSelection.brushId, visibleFaceSelection.faceId);
      const rawFaceSelection: EditorFaceDragEvent['selection'] | null = togglingSelectedVisibleFace
        ? visibleFaceSelection
        : (hitFaceHandle?.selection ?? visibleFaceSelection);
      const faceTransferMode: FaceAttributeTransferMode | null =
        supportsFaceTransfer && this.faceTransferSequenceSource
          ? event.ctrlKey || event.metaKey
            ? 'material'
            : event.shiftKey
              ? 'rotate'
              : 'project'
          : null;
      const faceTransferSource =
        faceTransferMode && this.faceTransferSequenceSource
          ? this.faceTransferSequenceSource
          : null;
      const hitSelection: EditorSelection | null = rawFaceSelection
        ? tool === 'clip' || tool === 'hull' || tool === 'sweep' || faceTransferMode
          ? null
          : tool === 'face' || event.shiftKey
            ? rawFaceSelection
            : { brushId: rawFaceSelection.brushId }
        : hit && tool === 'select'
          ? selectionForHit(hit)
          : null;
      const permanentFaceSelection =
        event.button === 0 &&
        tool === 'select' &&
        event.shiftKey &&
        rawFaceSelection &&
        hit &&
        currentSelection &&
        !currentSelection.faceId &&
        selectionContainsHit(currentSelection, hit)
          ? rawFaceSelection
          : null;
      const moveSelection =
        tool === 'select' &&
        !permanentFaceSelection &&
        hit &&
        hitSelection &&
        !currentSelection?.faceId &&
        selectionContainsHit(currentSelection, hit)
          ? currentSelection
          : null;
      const duplicating = Boolean(
        event.button === 0 && moveSelection && (event.ctrlKey || event.metaKey),
      );
      const objectPainting = Boolean(
        event.button === 0 &&
        tool === 'select' &&
        hitSelection &&
        !hitSelection.faceId &&
        !moveSelection &&
        (event.ctrlKey || event.metaKey),
      );
      const transformTool = tool === 'rotate' || tool === 'scale' || tool === 'shear' ? tool : null;
      const transformBounds =
        transformTool && currentSelection && !currentSelection.faceId
          ? this.interaction.brushBounds(currentSelection)
          : null;
      const transform =
        transformTool &&
        currentSelection &&
        !currentSelection.faceId &&
        (transformTool === 'rotate' || currentSelection.brushId) &&
        transformBounds
          ? this.createTransformGesture(
              transformTool,
              currentSelection,
              transformBounds,
              event.clientX,
              event.clientY,
            )
          : null;
      const paintedFaceKeys = new Set<string>();
      if (facePainting && rawFaceSelection) {
        paintedFaceKeys.add(`${rawFaceSelection.brushId}\u0000${rawFaceSelection.faceId}`);
        if (!isFaceSelected(currentSelection, rawFaceSelection.brushId, rawFaceSelection.faceId)) {
          this.interaction.pick(rawFaceSelection, this.kind, {
            additive: true,
            expansion: 'single',
            paint: true,
          });
        }
      }
      const faceSelection =
        !facePainting && !faceTransferMode
          ? tool === 'face'
            ? rawFaceSelection
            : permanentFaceSelection
          : null;
      const faceSplitting = Boolean(
        faceSelection && !event.altKey && (event.ctrlKey || event.metaKey),
      );
      const faceStamping = Boolean(
        faceSelection &&
        event.altKey &&
        (event.ctrlKey || event.metaKey) &&
        this.kind === 'perspective',
      );
      const faceTranslating = Boolean(faceSelection && event.altKey && !faceStamping);
      const faceLassoEligible =
        event.button === 0 && tool === 'face' && !facePainting && !rawFaceSelection;
      const faceHandle = faceSelection ? this.interaction.faceHandle(faceSelection) : null;
      const hullFace = hullBuilding && this.kind === 'perspective' ? rawFaceSelection : null;
      const hullFaceHandle = hullFace ? this.interaction.faceHandle(hullFace) : null;
      const hullPoint =
        hullBuilding && this.kind === 'perspective' && hit && isBrushRayHit(hit)
          ? this.interaction.snapClipHit(hit, this.gridSize)
          : null;
      const hullDuplicating = Boolean(
        event.shiftKey &&
        hullFaceHandle &&
        pointsFormPolygonOnPlane(
          this.interaction.hullPoints(),
          hullFaceHandle.center,
          hullFaceHandle.normal,
        ),
      );
      const hullMapping =
        hullDuplicating && hullFaceHandle
          ? this.faceDragMapping(hullFaceHandle.center, hullFaceHandle.normal)
          : null;
      const faceMapping =
        faceHandle && !faceTranslating
          ? this.faceDragMapping(faceHandle.center, faceHandle.normal)
          : null;
      const clipPoint = clipping
        ? clipPointIndex === null
          ? this.clipPointAt(event.clientX, event.clientY)
          : (this.interaction.clipPoints()[clipPointIndex] ?? null)
        : null;
      if (
        faceSelection &&
        !event.shiftKey &&
        !isFaceSelected(currentSelection, faceSelection.brushId, faceSelection.faceId)
      ) {
        this.interaction.pick(faceSelection, this.kind, {
          additive: false,
          expansion: 'single',
        });
      }
      const creationCoordinate =
        this.kind === 'perspective'
          ? Math.round(
              (creationSurfaceHit?.point[2] ?? creationReferenceBounds?.max[2] ?? 0) /
                this.gridSize,
            ) * this.gridSize
          : 0;
      const createPlane = creating ? constructionPlane(this.kind, creationCoordinate) : null;
      const planePoint =
        createPlane?.point ??
        (sweep?.mode === 'translate' ? sweep.pivot : null) ??
        (transform?.tool === 'pivot' ? transform.pivot : null) ??
        hullFaceHandle?.center ??
        topologyHandle?.center ??
        (faceTranslating ? faceHandle?.center : null) ??
        (moveSelection ? this.interaction.brushCenter(moveSelection) : null);
      const planeNormal =
        createPlane?.normal ??
        hullFaceHandle?.normal ??
        (this.kind === 'perspective' &&
        (topologyHandle ||
          moveSelection ||
          sweep?.mode === 'translate' ||
          transform?.tool === 'pivot') &&
        !faceTranslating
          ? ([0, 0, 1] as const)
          : this.viewDirection());
      this.dragState = {
        button: event.button,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        moved: 0,
        hit: transform || sweep ? null : hitSelection,
        moveSelection,
        duplicating,
        objectPainting,
        paintedBrushIds: new Set<BrushId>(),
        paintedEntityIds: new Set<EntityId>(),
        faceSelection,
        facePainting,
        faceSplitting,
        faceStamping,
        faceTranslating,
        faceLassoEligible,
        faceLassoEnsureSelected: event.shiftKey,
        paintedFaceKeys,
        faceScreenDirection: faceMapping?.direction ?? hullMapping?.direction ?? null,
        facePixelsPerWorld: faceMapping?.pixelsPerWorld ?? hullMapping?.pixelsPerWorld ?? 1,
        planePoint,
        planeNormal,
        creating,
        placingEntity,
        creationReferenceBounds,
        hullBuilding,
        hullPoint,
        hullFace,
        hullDuplicating,
        faceTransferMode,
        faceTransferSource,
        faceTransferTargets:
          faceTransferSource &&
          rawFaceSelection &&
          (faceTransferSource.brushId !== rawFaceSelection.brushId ||
            faceTransferSource.faceId !== rawFaceSelection.faceId)
            ? [rawFaceSelection]
            : [],
        clipping,
        clipPoint,
        clipPointIndex,
        transform,
        sweep,
        topologyKind,
        topologyHandle,
        topologyHandles,
        topologySnapTarget,
        topologySelection:
          topologyHandle && currentSelection?.brushId && !currentSelection.faceId
            ? currentSelection
            : null,
        topologyOperation: topologySnapTarget
          ? 'snap'
          : insertionTopologyHandle
            ? 'insert'
            : 'move',
        topologyLassoAdditive: (event.ctrlKey || event.metaKey) && !insertionTopologyHandle,
        cameraMode,
        cameraEye,
        anchor: planePoint
          ? rayPlaneIntersection(ray.origin, ray.direction, planePoint, planeNormal)
          : null,
        moving: false,
        faceMoving: false,
        faceLasso: false,
        transformMoving: false,
        pivotMoving: false,
        sweepMoving: false,
        topologyMoving: false,
        topologyLasso: false,
        clipMoving: false,
        hullMoving: false,
        faceTransferMoving: false,
        lastTopologySnapMode: 'relative',
        lastMovementPlane: this.kind === 'perspective' ? 'xy' : 'viewport',
        lastAxisRestriction: null,
        lastDelta: [0, 0, 0],
        lastFaceDistance: 0,
        lastBounds: null,
        lastCreationConstraint: 'none',
        lastClipPoint: null,
        lastHullPoints: [],
        lastTransform: null,
        lastPivot: null,
        lastSweep: null,
      };
    });
    this.canvas.addEventListener('pointermove', (event) => {
      const pointerPosition = this.pointerPositionAt(event.clientX, event.clientY);
      if (pointerPosition) this.interaction.pointerPosition(pointerPosition);
      const drag = this.dragState;
      if (!drag) {
        const tool = this.interaction.currentTool();
        if (tool === 'rotate') {
          const selection = this.interaction.currentSelection();
          const bounds =
            selection && !selection.faceId ? this.interaction.brushBounds(selection) : null;
          const pivot = bounds ? (this.interaction.transformPivot() ?? boundsCenter(bounds)) : null;
          const hovered = Boolean(
            pivot && this.transformPivotHandleAt(pivot, event.clientX, event.clientY),
          );
          this.interaction.hoverTransformPivot(hovered);
          if (hovered && pivot) this.showPivotCoordinates(pivot);
          else this.hideTransformReadout();
          this.interaction.hover(null);
          this.interaction.hoverTopology(null);
        } else if (tool === 'vertex' || tool === 'edge') {
          this.interaction.hoverTransformPivot(false);
          this.hideTransformReadout();
          const handle = this.topologyHandleAt(tool, event.clientX, event.clientY);
          const insertion =
            tool === 'vertex' && event.shiftKey && !handle
              ? this.prospectiveVertexHandleAt(event.clientX, event.clientY)
              : null;
          this.interaction.hoverTopology(handle ?? insertion);
          this.interaction.hover(null);
        } else if (tool === 'face') {
          this.interaction.hoverTransformPivot(false);
          this.hideTransformReadout();
          const handle = this.faceHandleAt(event.clientX, event.clientY);
          if (handle) this.interaction.hover(handle.selection);
          else {
            const ray = this.rayAt(event.clientX, event.clientY);
            const hit = this.interaction.hitTests(ray.origin, ray.direction).find(isBrushRayHit);
            this.interaction.hover(hit ? { brushId: hit.brushId, faceId: hit.faceId } : null);
          }
        } else if (tool === 'select') {
          this.interaction.hoverTransformPivot(false);
          this.hideTransformReadout();
          const ray = this.rayAt(event.clientX, event.clientY);
          const hit = event.shiftKey
            ? (this.interaction.hitTests(ray.origin, ray.direction).find(isBrushRayHit) ?? null)
            : this.interaction.hitTest(ray.origin, ray.direction);
          const selection = this.interaction.currentSelection();
          this.interaction.hover(
            hit &&
              event.shiftKey &&
              isBrushRayHit(hit) &&
              selection &&
              !selection.faceId &&
              selectionContainsHit(selection, hit)
              ? { brushId: hit.brushId, faceId: hit.faceId }
              : hit
                ? selectionForHit(hit)
                : null,
          );
          this.interaction.hoverTopology(null);
        } else {
          this.interaction.hoverTransformPivot(false);
          this.hideTransformReadout();
          this.interaction.hover(null);
          this.interaction.hoverTopology(null);
        }
        return;
      }
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (drag.cameraMode === 'look' && drag.cameraEye && drag.moved >= 5) {
        this.state.yaw -= deltaX * 0.006;
        this.state.pitch = Math.max(-1.45, Math.min(1.45, this.state.pitch + deltaY * 0.006));
        const center = addScaled(drag.cameraEye, this.perspectiveForward(), this.state.distance);
        this.state.center = [center[0], center[1], center[2]];
        this.canvas.closest('.viewport-pane')?.classList.add('camera-looking');
        this.notifyCamera('look');
      } else if (drag.cameraMode === 'orbit' && drag.moved >= 5) {
        this.state.yaw -= deltaX * 0.006;
        this.state.pitch = Math.max(-1.45, Math.min(1.45, this.state.pitch + deltaY * 0.006));
        this.canvas.closest('.viewport-pane')?.classList.add('camera-orbiting');
        this.notifyCamera('orbit');
      } else if (drag.cameraMode === 'pan' && (drag.button === 1 || drag.moved >= 5)) {
        if (this.kind === 'perspective') {
          const forward = this.perspectiveForward();
          const right = normalize(cross(forward, [0, 0, 1]));
          const up = normalize(cross(right, forward));
          const worldPerPixel = this.worldPerPixel();
          this.translatePerspectiveCamera(
            addScaled(
              [
                right[0] * -deltaX * worldPerPixel,
                right[1] * -deltaX * worldPerPixel,
                right[2] * -deltaX * worldPerPixel,
              ],
              up,
              deltaY * worldPerPixel,
            ),
          );
        } else {
          const worldPerPixel = this.state.orthographicSpan / Math.max(1, this.canvas.clientHeight);
          if (this.kind === 'xy') {
            this.state.center[0] -= deltaX * worldPerPixel;
            this.state.center[1] += deltaY * worldPerPixel;
          } else if (this.kind === 'xz') {
            this.state.center[0] -= deltaX * worldPerPixel;
            this.state.center[2] += deltaY * worldPerPixel;
          } else if (this.kind === 'yz') {
            this.state.center[1] -= deltaX * worldPerPixel;
            this.state.center[2] += deltaY * worldPerPixel;
          }
        }
        this.canvas.closest('.viewport-pane')?.classList.add('camera-panning');
        this.notifyCamera('pan');
      } else if (drag.button === 0 && drag.moved >= 5 && drag.objectPainting) {
        const ray = this.rayAt(event.clientX, event.clientY);
        const hit = this.interaction.hitTest(ray.origin, ray.direction);
        const candidates = [drag.hit, hit ? selectionForHit(hit) : null];
        for (const candidate of candidates) {
          if (candidate?.brushId) {
            if (drag.paintedBrushIds.has(candidate.brushId)) continue;
            drag.paintedBrushIds.add(candidate.brushId);
            if (isBrushSelected(this.interaction.currentSelection(), candidate.brushId)) continue;
          } else if (candidate?.entityId) {
            if (drag.paintedEntityIds.has(candidate.entityId)) continue;
            drag.paintedEntityIds.add(candidate.entityId);
            if (isPointEntitySelected(this.interaction.currentSelection(), candidate.entityId)) {
              continue;
            }
          } else {
            continue;
          }
          this.interaction.pick(candidate, this.kind, {
            additive: false,
            objectAdditive: true,
            expansion: 'single',
            objectExpansion: 'single',
            paint: true,
          });
        }
        this.canvas.closest('.viewport-pane')?.classList.add('painting');
      } else if (drag.button === 0 && drag.moved >= 5 && drag.sweep) {
        const sweepEvent = this.sweepDragEvent(drag.sweep, drag, event);
        if (!sweepEvent) return;
        const changed =
          sweepEvent.mode === 'translate'
            ? sweepEvent.delta.some((component) => Math.abs(component) > Number.EPSILON)
            : sweepEvent.mode === 'rotate'
              ? Math.abs(sweepEvent.angleDegrees) > Number.EPSILON
              : Math.abs(sweepEvent.factor - 1) > Number.EPSILON;
        if (!changed) return;
        drag.sweepMoving = true;
        drag.lastSweep = sweepEvent;
        this.canvas.closest('.viewport-pane')?.classList.add('transforming');
        this.interaction.sweep(sweepEvent);
      } else if (
        drag.button === 0 &&
        drag.moved >= 5 &&
        drag.clipping &&
        drag.clipPointIndex !== null &&
        drag.clipPoint
      ) {
        const candidate = this.clipPointAt(event.clientX, event.clientY, drag.clipPoint);
        if (!candidate) return;
        let point = candidate;
        let axisRestriction: TransformAxis | null = null;
        if (this.kind !== 'perspective' && event.shiftKey) {
          const viewportAxes = this.viewportAxes();
          const axes = [viewportAxes.right, viewportAxes.up] as const;
          const delta: Vec3 = [
            candidate[0] - drag.clipPoint[0],
            candidate[1] - drag.clipPoint[1],
            candidate[2] - drag.clipPoint[2],
          ];
          axisRestriction = axes.reduce((best, axis) =>
            Math.abs(delta[axis]) > Math.abs(delta[best]) ? axis : best,
          );
          const restricted = [...drag.clipPoint] as [number, number, number];
          restricted[axisRestriction] += delta[axisRestriction];
          point = restricted;
        }
        if (
          drag.clipMoving &&
          drag.lastClipPoint?.every((component, axis) => component === point[axis]) &&
          drag.lastAxisRestriction === axisRestriction
        )
          return;
        drag.clipMoving = true;
        drag.lastClipPoint = point;
        drag.lastAxisRestriction = axisRestriction;
        this.canvas.closest('.viewport-pane')?.classList.add('reshaping');
        this.interaction.moveClipPoint(
          drag.clipPointIndex,
          point,
          this.kind,
          this.viewDirection(),
          axisRestriction,
          'preview',
        );
      } else if (
        drag.button === 0 &&
        drag.faceTransferMode &&
        drag.faceTransferSource &&
        drag.moved >= 5
      ) {
        const ray = this.rayAt(event.clientX, event.clientY);
        const hit = this.interaction.hitTests(ray.origin, ray.direction).find(isBrushRayHit);
        if (!hit) return;
        const target = { brushId: hit.brushId, faceId: hit.faceId } as const;
        if (
          target.brushId === drag.faceTransferSource.brushId &&
          target.faceId === drag.faceTransferSource.faceId
        )
          return;
        const key = `${target.brushId}\u0000${target.faceId}`;
        if (
          drag.faceTransferTargets.some(
            (candidate) => `${candidate.brushId}\u0000${candidate.faceId}` === key,
          )
        )
          return;
        drag.faceTransferTargets.push(target);
        drag.faceTransferMoving = true;
        this.canvas.closest('.viewport-pane')?.classList.add('painting');
        this.interaction.transfer({
          phase: 'preview',
          viewport: this.kind,
          mode: drag.faceTransferMode,
          source: drag.faceTransferSource,
          targets: drag.faceTransferTargets,
        });
      } else if (
        drag.button === 0 &&
        drag.moved >= 5 &&
        drag.hullBuilding &&
        drag.hullPoint &&
        drag.planePoint
      ) {
        let preview: readonly Vec3[] = [];
        if (drag.hullDuplicating && drag.faceScreenDirection) {
          const totalX = event.clientX - drag.startX;
          const totalY = event.clientY - drag.startY;
          const projectedPixels =
            totalX * drag.faceScreenDirection[0] + totalY * drag.faceScreenDirection[1];
          const distance =
            Math.round(projectedPixels / drag.facePixelsPerWorld / this.gridSize) * this.gridSize;
          preview = this.interaction
            .hullPoints()
            .map((point) => addScaled(point, drag.planeNormal, distance));
        } else {
          const ray = this.rayAt(event.clientX, event.clientY);
          const point = rayPlaneIntersection(
            ray.origin,
            ray.direction,
            drag.planePoint,
            drag.planeNormal,
          );
          if (!point) return;
          preview = rectangleOnPlane(
            drag.hullPoint,
            snapPointToPlane(point, drag.planePoint, drag.planeNormal, this.gridSize),
            drag.planeNormal,
          );
        }
        preview = dedupeHullPoints(preview);
        if (
          drag.hullMoving &&
          preview.length === drag.lastHullPoints.length &&
          preview.every(
            (point, index) =>
              encodedTopologyPoint(point) === encodedTopologyPoint(drag.lastHullPoints[index]!),
          )
        )
          return;
        drag.hullMoving = true;
        drag.lastHullPoints = preview;
        this.canvas.closest('.viewport-pane')?.classList.add('creating');
        this.interaction.previewHullPoints(preview);
      } else if (drag.button === 0 && drag.facePainting) {
        const ray = this.rayAt(event.clientX, event.clientY);
        const hit = this.interaction.hitTests(ray.origin, ray.direction).find(isBrushRayHit);
        if (!hit) return;
        const key = `${hit.brushId}\u0000${hit.faceId}`;
        if (drag.paintedFaceKeys.has(key)) return;
        drag.paintedFaceKeys.add(key);
        if (isFaceSelected(this.interaction.currentSelection(), hit.brushId, hit.faceId)) return;
        this.canvas.closest('.viewport-pane')?.classList.add('painting');
        this.interaction.pick({ brushId: hit.brushId, faceId: hit.faceId }, this.kind, {
          additive: true,
          expansion: 'single',
          paint: true,
        });
      } else if (drag.button === 0 && drag.moved >= 5 && drag.faceLassoEligible) {
        drag.faceLasso = true;
        this.updateHandleLasso(drag.startX, drag.startY, event.clientX, event.clientY);
      } else if (
        drag.button === 0 &&
        drag.moved >= 5 &&
        drag.topologyKind &&
        !drag.topologyHandle
      ) {
        drag.topologyLasso = true;
        this.updateHandleLasso(drag.startX, drag.startY, event.clientX, event.clientY);
      } else if (
        drag.button === 0 &&
        drag.moved >= 5 &&
        drag.transform?.tool === 'pivot' &&
        drag.anchor &&
        drag.planePoint
      ) {
        const movement = this.pointerMovementDelta(drag, event, true);
        if (!movement) return;
        if (
          !drag.pivotMoving &&
          movement.delta.every((component) => Math.abs(component) <= Number.EPSILON)
        ) {
          return;
        }
        const pivot: Vec3 = [
          drag.transform.pivot[0] + movement.delta[0],
          drag.transform.pivot[1] + movement.delta[1],
          drag.transform.pivot[2] + movement.delta[2],
        ];
        if (
          drag.lastPivot &&
          drag.lastPivot.pivot.every((component, axis) => component === pivot[axis]) &&
          drag.lastPivot.axisRestriction === movement.axisRestriction &&
          drag.lastPivot.movementPlane === movement.movementPlane
        ) {
          return;
        }
        const pivotEvent: EditorTransformPivotDragEvent = {
          phase: 'preview',
          viewport: this.kind,
          startPivot: drag.transform.pivot,
          pivot,
          delta: movement.delta,
          movementPlane: movement.movementPlane,
          axisRestriction: movement.axisRestriction,
        };
        drag.pivotMoving = true;
        drag.lastPivot = pivotEvent;
        drag.lastDelta = movement.delta;
        drag.lastMovementPlane = movement.movementPlane;
        drag.lastAxisRestriction = movement.axisRestriction;
        this.canvas.closest('.viewport-pane')?.classList.add('transforming');
        this.showPivotCoordinates(pivot);
        this.interaction.moveTransformPivot(pivotEvent);
      } else if (
        drag.button === 0 &&
        drag.moved >= 5 &&
        drag.transform &&
        drag.transform.tool !== 'pivot'
      ) {
        const transformEvent = this.transformDragEvent(drag.transform, event, drag.startX);
        if (!transformEvent) return;
        const changed =
          transformEvent.tool === 'rotate'
            ? Math.abs(transformEvent.angleDegrees) > Number.EPSILON
            : transformEvent.tool === 'scale'
              ? transformEvent.factors.some((factor) => Math.abs(factor - 1) > Number.EPSILON)
              : Math.abs(transformEvent.factor) > Number.EPSILON;
        if (!changed) return;
        drag.transformMoving = true;
        drag.lastTransform = transformEvent;
        this.canvas.closest('.viewport-pane')?.classList.add('transforming');
        if (transformEvent.tool === 'rotate') {
          this.showTransformReadout(`${transformEvent.angleDegrees}\u00b0`, transformEvent.pivot);
        }
        this.interaction.transform(transformEvent);
      } else if (
        drag.button === 0 &&
        drag.moved >= 5 &&
        drag.topologyKind &&
        drag.topologyHandle &&
        !drag.topologySnapTarget &&
        drag.topologySelection &&
        drag.anchor &&
        drag.planePoint
      ) {
        const movement = this.pointerMovementDelta(drag, event, drag.topologyOperation === 'move');
        if (!movement) return;
        const snapMode =
          drag.topologyKind === 'vertex' && (event.ctrlKey || event.metaKey)
            ? 'absolute'
            : 'relative';
        const delta =
          snapMode === 'absolute'
            ? this.absoluteTopologyDelta(drag.topologyHandle, movement.delta, movement.axes)
            : movement.delta;
        if (
          drag.topologyMoving &&
          delta.every((component, axis) => component === drag.lastDelta[axis])
        )
          return;
        drag.topologyMoving = true;
        drag.lastDelta = delta;
        drag.lastTopologySnapMode = snapMode;
        drag.lastMovementPlane = movement.movementPlane;
        drag.lastAxisRestriction = movement.axisRestriction;
        this.canvas.closest('.viewport-pane')?.classList.add('reshaping');
        this.interaction.topology(
          {
            phase: 'preview',
            viewport: this.kind,
            kind: drag.topologyKind,
            operation: drag.topologyOperation,
            selection: drag.topologySelection,
            brushIds: topologyHandleBrushIds(drag.topologyHandles),
            vertices: topologyHandleVertices(drag.topologyHandles),
            delta,
            snapMode,
            movementPlane: movement.movementPlane,
            axisRestriction: movement.axisRestriction,
          },
          drag.topologyHandles,
        );
      } else if (
        drag.button === 0 &&
        drag.moved >= 5 &&
        drag.faceTranslating &&
        drag.faceSelection &&
        drag.anchor &&
        drag.planePoint
      ) {
        const ray = this.rayAt(event.clientX, event.clientY);
        const point = rayPlaneIntersection(
          ray.origin,
          ray.direction,
          drag.planePoint,
          drag.planeNormal,
        );
        if (!point) return;
        const delta = snappedDelta(drag.anchor, point, this.gridSize);
        if (drag.faceMoving && delta.every((component, axis) => component === drag.lastDelta[axis]))
          return;
        drag.faceMoving = true;
        drag.lastDelta = delta;
        this.canvas.closest('.viewport-pane')?.classList.add('reshaping');
        this.interaction.face({
          phase: 'preview',
          viewport: this.kind,
          selection: drag.faceSelection,
          mode: 'translate',
          delta,
          split: false,
          stamp: false,
        });
      } else if (
        drag.button === 0 &&
        drag.moved >= 5 &&
        drag.faceSelection &&
        drag.faceScreenDirection
      ) {
        const totalX = event.clientX - drag.startX;
        const totalY = event.clientY - drag.startY;
        const projectedPixels =
          totalX * drag.faceScreenDirection[0] + totalY * drag.faceScreenDirection[1];
        const rawDistance = projectedPixels / drag.facePixelsPerWorld;
        const distance = Math.round(rawDistance / this.gridSize) * this.gridSize;
        if (drag.faceMoving && distance === drag.lastFaceDistance) return;
        drag.faceMoving = true;
        drag.lastFaceDistance = distance;
        this.canvas.closest('.viewport-pane')?.classList.add('extruding');
        this.interaction.face({
          phase: 'preview',
          viewport: this.kind,
          selection: drag.faceSelection,
          mode: 'normal',
          distance,
          split: drag.faceSplitting,
          stamp: drag.faceStamping,
        });
      } else if (
        drag.button === 0 &&
        drag.moved >= 5 &&
        drag.creating &&
        drag.anchor &&
        drag.planePoint
      ) {
        const ray = this.rayAt(event.clientX, event.clientY);
        const point = rayPlaneIntersection(
          ray.origin,
          ray.direction,
          drag.planePoint,
          drag.planeNormal,
        );
        if (!point) return;
        const heightOnly = this.kind === 'perspective' && event.altKey && !event.shiftKey;
        const cube = this.kind === 'perspective' && event.altKey && event.shiftKey;
        const square = event.shiftKey && !cube;
        let nextBounds = creationBounds(
          drag.anchor,
          point,
          this.kind,
          this.gridSize,
          drag.creationReferenceBounds,
          square || cube,
          cube,
        );
        if (heightOnly && drag.lastBounds) {
          const height = Math.max(
            this.gridSize,
            Math.round(
              (Math.abs(event.clientY - drag.startY) * this.worldPerPixel()) / this.gridSize,
            ) * this.gridSize,
          );
          nextBounds = {
            min: [drag.lastBounds.min[0], drag.lastBounds.min[1], drag.planePoint[2]],
            max: [drag.lastBounds.max[0], drag.lastBounds.max[1], drag.planePoint[2] + height],
          };
        }
        drag.lastBounds = nextBounds;
        if (!drag.lastBounds) return;
        drag.lastCreationConstraint = heightOnly
          ? 'height'
          : cube
            ? 'cube'
            : square
              ? 'square'
              : 'none';
        drag.moving = true;
        this.canvas.closest('.viewport-pane')?.classList.add('creating');
        this.interaction.create({
          phase: 'preview',
          viewport: this.kind,
          bounds: drag.lastBounds,
          constraint: drag.lastCreationConstraint,
        });
      } else if (
        drag.button === 0 &&
        drag.moved >= 5 &&
        drag.moveSelection &&
        drag.anchor &&
        drag.planePoint
      ) {
        const movement = this.pointerMovementDelta(drag, event, true);
        if (!movement) return;
        drag.moving = true;
        drag.lastDelta = movement.delta;
        drag.lastMovementPlane = movement.movementPlane;
        drag.lastAxisRestriction = movement.axisRestriction;
        this.canvas.closest('.viewport-pane')?.classList.add('moving');
        this.interaction.drag(
          {
            phase: 'preview',
            viewport: this.kind,
            selection: drag.moveSelection,
            delta: drag.lastDelta,
            movementPlane: movement.movementPlane,
            axisRestriction: movement.axisRestriction,
            duplicate: drag.duplicating,
          },
          [drag.planePoint],
        );
      }
    });
    this.canvas.addEventListener('pointerup', (event) => {
      const drag = this.dragState;
      if (!drag) return;
      if (drag.button === 2 && drag.moved < 5 && drag.cameraMode !== 'orbit') {
        const pointer = this.pointerPositionAt(event.clientX, event.clientY);
        if (pointer) {
          const ray = this.rayAt(event.clientX, event.clientY);
          const hit = this.interaction.hitTest(ray.origin, ray.direction);
          this.interaction.contextMenu({
            viewport: this.kind,
            clientX: event.clientX,
            clientY: event.clientY,
            pointer,
            hit: hit
              ? isBrushRayHit(hit)
                ? { brushId: hit.brushId, faceId: hit.faceId }
                : { entityId: hit.entityId }
              : null,
            pointEntityOrigin: this.pointEntityOriginAt(event.clientX, event.clientY),
          });
        }
      } else if (drag.button === 0 && drag.clipping) {
        if (drag.clipMoving && drag.clipPointIndex !== null && drag.lastClipPoint) {
          this.interaction.moveClipPoint(
            drag.clipPointIndex,
            drag.lastClipPoint,
            this.kind,
            this.viewDirection(),
            drag.lastAxisRestriction,
            'commit',
          );
        } else if (drag.clipPointIndex === null && drag.clipPoint) {
          const end = this.clipPointAt(event.clientX, event.clientY);
          const points = drag.moved >= 5 && end ? [drag.clipPoint, end] : [drag.clipPoint];
          this.interaction.addClipPoints(points, this.kind, this.viewDirection());
        }
      } else if (drag.button === 0 && drag.hullBuilding) {
        if (this.kind === 'perspective') {
          if (drag.hullMoving && drag.lastHullPoints.length > 0) {
            this.interaction.addHullPoints(drag.lastHullPoints, 'perspective');
          } else if (drag.moved < 5 && drag.hullPoint) {
            this.interaction.addHullPoints([drag.hullPoint], 'perspective');
          } else {
            this.interaction.clearHullPreview();
          }
        }
      } else if (drag.button === 0 && drag.faceTransferMode && drag.faceTransferSource) {
        if (drag.faceTransferTargets.length > 0) {
          const transfer = () =>
            this.interaction.transfer({
              phase: 'commit',
              viewport: this.kind,
              mode: drag.faceTransferMode!,
              source: drag.faceTransferSource!,
              targets: drag.faceTransferTargets,
            });
          if (drag.faceTransferMoving || drag.moved >= 5) {
            transfer();
          } else {
            if (this.pendingFaceTransferClick !== null) {
              window.clearTimeout(this.pendingFaceTransferClick);
            }
            this.pendingFaceTransferClick = window.setTimeout(() => {
              this.pendingFaceTransferClick = null;
              transfer();
            }, 220);
          }
        }
      } else if (drag.button === 0 && drag.facePainting) {
        this.canvas.closest('.viewport-pane')?.classList.remove('painting');
      } else if (drag.button === 0 && drag.sweepMoving && drag.lastSweep) {
        this.interaction.sweep({
          ...drag.lastSweep,
          phase: 'commit',
        } as EditorSweepDragEvent);
      } else if (drag.button === 0 && drag.pivotMoving && drag.lastPivot) {
        this.interaction.moveTransformPivot({
          ...drag.lastPivot,
          phase: 'commit',
        });
      } else if (drag.button === 0 && drag.transformMoving && drag.lastTransform) {
        this.interaction.transform({
          ...drag.lastTransform,
          phase: 'commit',
        } as EditorTransformDragEvent);
      } else if (drag.button === 0 && drag.faceLasso) {
        this.interaction.selectFaceLasso(
          this.faceHandlesInRectangle(drag.startX, drag.startY, event.clientX, event.clientY),
          drag.faceLassoEnsureSelected || event.shiftKey,
          this.kind,
        );
      } else if (drag.button === 0 && drag.topologyLasso && drag.topologyKind) {
        this.interaction.selectTopologyLasso(
          this.topologyHandlesInRectangle(
            drag.topologyKind,
            drag.startX,
            drag.startY,
            event.clientX,
            event.clientY,
          ),
          drag.topologyLassoAdditive || event.ctrlKey || event.metaKey,
        );
      } else if (
        drag.button === 0 &&
        drag.moved < 5 &&
        drag.topologyKind === 'vertex' &&
        drag.topologySnapTarget &&
        drag.topologySelection &&
        drag.topologyHandles.length > 0
      ) {
        const target = drag.topologySnapTarget.center;
        const anchor = drag.topologyHandles.reduce((closest, handle) => {
          const distance = Math.hypot(
            handle.center[0] - target[0],
            handle.center[1] - target[1],
            handle.center[2] - target[2],
          );
          const closestDistance = Math.hypot(
            closest.center[0] - target[0],
            closest.center[1] - target[1],
            closest.center[2] - target[2],
          );
          return distance < closestDistance ? handle : closest;
        });
        const delta: Vec3 = [
          target[0] - anchor.center[0],
          target[1] - anchor.center[1],
          target[2] - anchor.center[2],
        ];
        this.interaction.topology(
          {
            phase: 'commit',
            viewport: this.kind,
            kind: 'vertex',
            operation: 'snap',
            selection: drag.topologySelection,
            brushIds: topologyHandleBrushIds(drag.topologyHandles),
            vertices: topologyHandleVertices(drag.topologyHandles),
            delta,
            anchor: anchor.center,
            target,
            snapMode: 'absolute',
            movementPlane: 'viewport',
            axisRestriction: null,
          },
          drag.topologyHandles,
        );
      } else if (
        drag.button === 0 &&
        drag.topologyMoving &&
        drag.topologyKind &&
        drag.topologySelection
      ) {
        this.interaction.topology(
          {
            phase: drag.lastDelta.some((component) => Math.abs(component) > Number.EPSILON)
              ? 'commit'
              : 'cancel',
            viewport: this.kind,
            kind: drag.topologyKind,
            operation: drag.topologyOperation,
            selection: drag.topologySelection,
            brushIds: topologyHandleBrushIds(drag.topologyHandles),
            vertices: topologyHandleVertices(drag.topologyHandles),
            delta: drag.lastDelta,
            snapMode: drag.lastTopologySnapMode,
            movementPlane: drag.lastMovementPlane,
            axisRestriction: drag.lastAxisRestriction,
          },
          drag.topologyHandles,
        );
      } else if (
        drag.button === 0 &&
        drag.faceMoving &&
        drag.faceTranslating &&
        drag.faceSelection
      ) {
        this.interaction.face({
          phase: drag.lastDelta.some((component) => Math.abs(component) > Number.EPSILON)
            ? 'commit'
            : 'cancel',
          viewport: this.kind,
          selection: drag.faceSelection,
          mode: 'translate',
          delta: drag.lastDelta,
          split: false,
          stamp: false,
        });
      } else if (drag.button === 0 && drag.faceMoving && drag.faceSelection) {
        this.interaction.face({
          phase: Math.abs(drag.lastFaceDistance) > Number.EPSILON ? 'commit' : 'cancel',
          viewport: this.kind,
          selection: drag.faceSelection,
          mode: 'normal',
          distance: drag.lastFaceDistance,
          split: drag.faceSplitting,
          stamp: drag.faceStamping,
        });
      } else if (drag.button === 0 && drag.creating && drag.lastBounds) {
        this.interaction.create({
          phase: 'commit',
          viewport: this.kind,
          bounds: drag.lastBounds,
          constraint: drag.lastCreationConstraint,
        });
      } else if (drag.button === 0 && drag.placingEntity && drag.moved < 5) {
        const origin = this.pointEntityOriginAt(event.clientX, event.clientY);
        if (origin) this.interaction.placePointEntity({ viewport: this.kind, origin });
      } else if (drag.button === 0 && drag.moving && drag.moveSelection) {
        this.interaction.drag(
          {
            phase: 'commit',
            viewport: this.kind,
            selection: drag.moveSelection,
            delta: drag.lastDelta,
            movementPlane: drag.lastMovementPlane,
            axisRestriction: drag.lastAxisRestriction,
            duplicate: drag.duplicating,
          },
          drag.planePoint ? [drag.planePoint] : [],
        );
      } else if (
        drag.button === 0 &&
        drag.moved < 5 &&
        this.interaction.currentTool() !== 'sweep' &&
        !drag.placingEntity &&
        !drag.transform &&
        !drag.topologyHandle &&
        !drag.topologyKind
      ) {
        const currentSelection = this.interaction.currentSelection();
        this.interaction.pick(drag.hit, this.kind, {
          additive: Boolean(event.shiftKey && currentSelection?.faceId),
          objectAdditive: Boolean(
            drag.hit &&
            !drag.hit.faceId &&
            !currentSelection?.faceId &&
            (event.ctrlKey || event.metaKey),
          ),
          expansion: 'single',
        });
      } else if (drag.button === 0 && drag.moved < 5 && drag.topologyKind && !drag.topologyHandle) {
        this.interaction.selectTopology(null, event.ctrlKey || event.metaKey);
      }
      this.removeHandleLasso();
      this.canvas.closest('.viewport-pane')?.classList.remove('moving');
      this.canvas.closest('.viewport-pane')?.classList.remove('creating');
      this.canvas.closest('.viewport-pane')?.classList.remove('extruding');
      this.canvas.closest('.viewport-pane')?.classList.remove('transforming');
      this.canvas.closest('.viewport-pane')?.classList.remove('reshaping');
      this.canvas.closest('.viewport-pane')?.classList.remove('painting');
      this.canvas.closest('.viewport-pane')?.classList.remove('camera-looking');
      this.canvas.closest('.viewport-pane')?.classList.remove('camera-orbiting');
      this.canvas.closest('.viewport-pane')?.classList.remove('camera-panning');
      if (!drag.pivotMoving) this.hideTransformReadout();
      this.dragState = null;
    });
    this.canvas.addEventListener('dblclick', (event) => {
      if (event.button !== 0) return;
      const ray = this.rayAt(event.clientX, event.clientY);
      const tool = this.interaction.currentTool();
      const hit =
        tool === 'select' && !event.shiftKey && !event.altKey
          ? this.interaction.hitTest(ray.origin, ray.direction)
          : (this.interaction.hitTests(ray.origin, ray.direction).find(isBrushRayHit) ?? null);
      if (!hit) {
        if (tool === 'select' && !event.shiftKey && !event.altKey) {
          this.interaction.pick(null, this.kind, {
            additive: false,
            expansion: 'single',
            objectExpansion: 'activate',
          });
        }
        return;
      }
      if (this.interaction.currentTool() === 'clip') {
        if (isBrushRayHit(hit)) this.interaction.matchClipFace(hit, this.kind);
        return;
      }
      const sequenceSource = this.faceTransferSequenceSource;
      if (this.kind === 'perspective' && event.altKey) {
        if (this.pendingFaceTransferClick !== null) {
          window.clearTimeout(this.pendingFaceTransferClick);
          this.pendingFaceTransferClick = null;
        }
        if (this.faceTransferSequenceReset !== null) {
          window.clearTimeout(this.faceTransferSequenceReset);
          this.faceTransferSequenceReset = null;
        }
        this.faceTransferSequenceSource = undefined;
      }
      if (
        isBrushRayHit(hit) &&
        this.kind === 'perspective' &&
        event.altKey &&
        sequenceSource &&
        (this.interaction.currentTool() === 'select' || this.interaction.currentTool() === 'face')
      ) {
        this.interaction.transfer({
          phase: 'commit',
          viewport: this.kind,
          mode: event.ctrlKey || event.metaKey ? 'material' : event.shiftKey ? 'rotate' : 'project',
          source: sequenceSource,
          targets: this.interaction
            .brushFaceSelections(hit.brushId)
            .filter(
              (target) =>
                target.brushId !== sequenceSource.brushId ||
                target.faceId !== sequenceSource.faceId,
            ),
        });
        return;
      }
      if (
        isBrushRayHit(hit) &&
        this.interaction.currentTool() === 'hull' &&
        this.kind === 'perspective'
      ) {
        this.interaction.addHullFace(
          { brushId: hit.brushId, faceId: hit.faceId },
          'perspective',
          this.interaction.snapClipHit(hit, this.gridSize) ?? undefined,
        );
        return;
      }
      if (this.interaction.currentTool() === 'select' && !event.shiftKey && !event.altKey) {
        this.interaction.pick(selectionForHit(hit), this.kind, {
          additive: false,
          objectAdditive: event.ctrlKey || event.metaKey,
          expansion: 'single',
          objectExpansion: 'activate',
        });
        return;
      }
      if (!isBrushRayHit(hit)) return;
      if (
        this.interaction.currentTool() !== 'face' &&
        !(this.interaction.currentTool() === 'select' && event.shiftKey)
      )
        return;
      this.interaction.pick({ brushId: hit.brushId, faceId: hit.faceId }, this.kind, {
        additive:
          this.interaction.currentTool() === 'face'
            ? event.shiftKey
            : event.ctrlKey || event.metaKey,
        expansion: event.altKey ? 'coplanar' : 'brush',
      });
    });
    this.canvas.addEventListener('pointercancel', () => {
      this.cancelDrag();
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.dragState) {
        this.interaction.hover(null);
        this.interaction.hoverTopology(null);
        this.interaction.hoverTransformPivot(false);
        this.hideTransformReadout();
      }
    });
    this.canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        if (
          this.kind === 'perspective' &&
          this.interaction.currentTool() === 'select' &&
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey
        ) {
          const selection = this.interaction.currentSelection();
          if (!selection || selection.faceId || event.deltaY === 0) return;
          const ray = this.rayAt(event.clientX, event.clientY);
          const hits = this.interaction.hitTests(ray.origin, ray.direction);
          const selectedIndex = hits.findIndex((hit) =>
            isBrushRayHit(hit)
              ? hit.brushId === selection.brushId
              : hit.entityId === selection.entityId,
          );
          if (selectedIndex < 0) return;
          const direction = event.deltaY < 0 ? 'farther' : 'nearer';
          const next = hits[selectedIndex + (direction === 'farther' ? 1 : -1)];
          if (!next) return;
          this.interaction.pick(selectionForHit(next), this.kind, {
            additive: false,
            expansion: 'single',
            objectExpansion: 'single',
            drill: direction,
          });
          return;
        }
        const factor = Math.exp(event.deltaY * 0.001);
        if (this.kind === 'perspective') {
          if (this.dragState?.cameraMode === 'orbit') {
            this.dragState.moved = Math.max(5, this.dragState.moved);
            this.state.distance = Math.max(8, Math.min(65_536, this.state.distance * factor));
            this.notifyCamera('orbit');
            return;
          }
          if (this.dragState?.cameraMode === 'look') {
            this.dragState.moved = Math.max(5, this.dragState.moved);
            this.state.flySpeed = Math.max(
              32,
              Math.min(4096, this.state.flySpeed * Math.exp(event.deltaY * -0.001)),
            );
            this.notifyCamera('fly');
            return;
          }
          if (event.shiftKey) {
            this.state.fieldOfViewRadians = Math.max(
              Math.PI / 9,
              Math.min((Math.PI * 2) / 3, this.state.fieldOfViewRadians * factor),
            );
            this.notifyCamera('zoom');
            return;
          }
          const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1;
          const amount = -event.deltaY * deltaScale * Math.max(0.08, this.state.distance / 1600);
          const forward = this.perspectiveForward();
          this.translatePerspectiveCamera([
            forward[0] * amount,
            forward[1] * amount,
            forward[2] * amount,
          ]);
          this.notifyCamera('dolly');
        } else {
          const before = this.rayAt(event.clientX, event.clientY).origin;
          this.state.orthographicSpan = Math.max(
            32,
            Math.min(32_768, this.state.orthographicSpan * factor),
          );
          const after = this.rayAt(event.clientX, event.clientY).origin;
          const axes = this.viewportAxes();
          this.state.center[axes.right] += before[axes.right] - after[axes.right];
          this.state.center[axes.up] += before[axes.up] - after[axes.up];
          this.notifyCamera('zoom');
        }
      },
      { passive: false },
    );
  }

  private cancelDrag(): void {
    const drag = this.dragState;
    if (!drag) return;
    if (drag.clipMoving && drag.clipPointIndex !== null && drag.clipPoint) {
      this.interaction.moveClipPoint(
        drag.clipPointIndex,
        drag.clipPoint,
        this.kind,
        this.viewDirection(),
        null,
        'cancel',
      );
    } else if (drag.hullMoving) {
      this.interaction.clearHullPreview();
    } else if (drag.faceTransferMoving && drag.faceTransferMode && drag.faceTransferSource) {
      this.interaction.transfer({
        phase: 'cancel',
        viewport: this.kind,
        mode: drag.faceTransferMode,
        source: drag.faceTransferSource,
        targets: drag.faceTransferTargets,
      });
    } else if (drag.sweepMoving && drag.lastSweep) {
      this.interaction.sweep({
        ...drag.lastSweep,
        phase: 'cancel',
      } as EditorSweepDragEvent);
    } else if (drag.pivotMoving && drag.lastPivot) {
      this.interaction.moveTransformPivot({
        ...drag.lastPivot,
        phase: 'cancel',
        pivot: drag.lastPivot.startPivot,
        delta: [0, 0, 0],
        axisRestriction: null,
      });
    } else if (drag.transformMoving && drag.lastTransform) {
      this.interaction.transform({
        ...drag.lastTransform,
        phase: 'cancel',
      } as EditorTransformDragEvent);
    } else if (drag.topologyMoving && drag.topologyKind && drag.topologySelection) {
      this.interaction.topology(
        {
          phase: 'cancel',
          viewport: this.kind,
          kind: drag.topologyKind,
          operation: drag.topologyOperation,
          selection: drag.topologySelection,
          brushIds: topologyHandleBrushIds(drag.topologyHandles),
          vertices: topologyHandleVertices(drag.topologyHandles),
          delta: drag.lastDelta,
          snapMode: drag.lastTopologySnapMode,
          movementPlane: drag.lastMovementPlane,
          axisRestriction: drag.lastAxisRestriction,
        },
        drag.topologyHandles,
      );
    } else if (drag.creating && drag.lastBounds) {
      this.interaction.create({
        phase: 'cancel',
        viewport: this.kind,
        bounds: null,
        constraint: drag.lastCreationConstraint,
      });
    } else if (drag.faceMoving && drag.faceSelection) {
      this.interaction.face(
        drag.faceTranslating
          ? {
              phase: 'cancel',
              viewport: this.kind,
              selection: drag.faceSelection,
              mode: 'translate',
              delta: drag.lastDelta,
              split: false,
              stamp: false,
            }
          : {
              phase: 'cancel',
              viewport: this.kind,
              selection: drag.faceSelection,
              mode: 'normal',
              distance: drag.lastFaceDistance,
              split: drag.faceSplitting,
              stamp: drag.faceStamping,
            },
      );
    } else if (drag.moving && drag.moveSelection) {
      this.interaction.drag(
        {
          phase: 'cancel',
          viewport: this.kind,
          selection: drag.moveSelection,
          delta: drag.lastDelta,
          movementPlane: drag.lastMovementPlane,
          axisRestriction: drag.lastAxisRestriction,
          duplicate: drag.duplicating,
        },
        drag.planePoint ? [drag.planePoint] : [],
      );
    }
    if (this.canvas.hasPointerCapture(drag.pointerId)) {
      this.canvas.releasePointerCapture(drag.pointerId);
    }
    this.canvas.closest('.viewport-pane')?.classList.remove('moving');
    this.canvas.closest('.viewport-pane')?.classList.remove('creating');
    this.canvas.closest('.viewport-pane')?.classList.remove('extruding');
    this.canvas.closest('.viewport-pane')?.classList.remove('transforming');
    this.canvas.closest('.viewport-pane')?.classList.remove('reshaping');
    this.canvas.closest('.viewport-pane')?.classList.remove('painting');
    this.canvas.closest('.viewport-pane')?.classList.remove('camera-looking');
    this.canvas.closest('.viewport-pane')?.classList.remove('camera-orbiting');
    this.canvas.closest('.viewport-pane')?.classList.remove('camera-panning');
    this.hideTransformReadout();
    this.removeHandleLasso();
    this.dragState = null;
  }
}

export class EditorSourceRenderer {
  private scene: SceneBuffers;
  private document: MapDocument;
  private selection: EditorSelection | null;
  private objectViewState: EditorObjectViewState;
  private gridSize: number;
  private transformPivot: Vec3 | null;
  private transformPivotHovered = false;
  private transformPivotTrace: MovementTrace | null = null;
  private movementTraces: readonly MovementTrace[] = [];
  private hoverSelection: EditorSelection | null = null;
  private entityPlacementBounds: Bounds;
  private topologySelection: readonly TopologyHandle[] = [];
  private topologyHover: TopologyHandle | null = null;
  private clipPoints: readonly Vec3[] = [];
  private clipPlanePoints: readonly [Vec3, Vec3, Vec3] | null = null;
  private hullPoints: readonly Vec3[] = [];
  private hullPreviewPoints: readonly Vec3[] = [];
  private sweepCaps: readonly (readonly Vec3[])[] = [];
  private lastClipViewport: EditorViewportKind = 'perspective';
  private referenceScenes: readonly EditorReferenceScene[];
  private entityLinkMode: EntityLinkMode;
  private openGroupId: string | null;
  private tool: EditorTool;
  private readonly materialResources = new Map<string, MaterialResource>();
  private readonly fallbackMaterial: MaterialResource;
  private readonly viewports: readonly Viewport[];
  private readonly onClipPlaneChange: EditorSourceRendererOptions['onClipPlaneChange'];
  private readonly onHullCreate: EditorSourceRendererOptions['onHullCreate'];
  private readonly onTopologySelectionChange: EditorSourceRendererOptions['onTopologySelectionChange'];
  private sceneVersion = 0;
  private disposed = false;

  private constructor(
    private readonly device: GPUDevice,
    format: GPUTextureFormat,
    pipelines: Pipelines,
    bindGroupLayout: GPUBindGroupLayout,
    private readonly materialBindGroupLayout: GPUBindGroupLayout,
    private readonly materialSampler: GPUSampler,
    options: EditorSourceRendererOptions,
    private readonly clearColor: readonly [number, number, number, number],
  ) {
    this.document = options.document;
    this.selection = options.selection ?? null;
    this.objectViewState = options.objectViewState ?? {
      hiddenBrushIds: [],
      hiddenEntityIds: [],
      lockedBrushIds: [],
      lockedEntityIds: [],
    };
    this.gridSize = Math.max(1, options.gridSize ?? 16);
    this.transformPivot = options.transformPivot ?? null;
    this.entityPlacementBounds = options.entityPlacementBounds ?? {
      min: [-8, -8, -8],
      max: [8, 8, 8],
    };
    this.referenceScenes = options.referenceScenes ?? [];
    this.entityLinkMode = options.entityLinkMode ?? 'direct';
    this.openGroupId = options.openGroupId ?? null;
    this.tool = options.tool ?? 'select';
    this.onClipPlaneChange = options.onClipPlaneChange;
    this.onHullCreate = options.onHullCreate;
    this.onTopologySelectionChange = options.onTopologySelectionChange;
    this.scene = buildSceneBuffers(
      device,
      this.document,
      this.selection,
      this.hoverSelection,
      this.objectViewState,
      this.referenceScenes,
      this.tool,
      this.gridSize,
      this.transformPivot,
      this.transformPivotHovered,
      this.transformPivotTrace,
      this.movementTraces,
      this.clipPoints,
      this.hullPoints,
      this.hullPreviewPoints,
      this.sweepCaps,
      this.topologySelection,
      this.topologyHover,
      this.entityLinkMode,
      this.openGroupId,
    );
    this.fallbackMaterial = createMaterialResource(
      device,
      this.materialBindGroupLayout,
      this.materialSampler,
    );
    this.setMaterials(options.materials ?? []);
    const hitTests = (origin: Vec3, direction: Vec3): readonly EditorObjectRayHit[] =>
      [
        ...brushesInDocument(this.document).flatMap((brush) => {
          if (
            this.objectViewState.hiddenBrushIds.includes(brush.id) ||
            this.objectViewState.lockedBrushIds.includes(brush.id)
          ) {
            return [];
          }
          const hit = intersectBrushRay(brush, origin, direction);
          return hit ? [hit] : [];
        }),
        ...pointEntitiesInDocument(this.document).flatMap((entity) => {
          if (
            this.objectViewState.hiddenEntityIds.includes(entity.id) ||
            this.objectViewState.lockedEntityIds.includes(entity.id)
          ) {
            return [];
          }
          const hit = intersectPointEntityRay(entity, origin, direction);
          return hit ? [hit] : [];
        }),
      ].toSorted((left, right) => left.distance - right.distance);
    const hitTest = (origin: Vec3, direction: Vec3): EditorObjectRayHit | null =>
      hitTests(origin, direction)[0] ?? null;
    const interaction: ViewportInteraction = {
      currentTool: () => this.tool,
      hitTest,
      hitTests,
      entityPlacementBounds: () => this.entityPlacementBounds,
      brushFaceNormal: (hit) => {
        const brush = findBrush(this.document, hit.brushId);
        return (
          (brush
            ? deriveBrush(brush).faces.find((face) => face.faceId === hit.faceId)?.normal
            : null) ?? null
        );
      },
      currentSelection: () => this.selection,
      transformPivot: () => this.transformPivot,
      brushCenter: (selection) => {
        const bounds = objectSelectionBounds(this.document, selection);
        return bounds
          ? [
              (bounds.min[0] + bounds.max[0]) / 2,
              (bounds.min[1] + bounds.max[1]) / 2,
              (bounds.min[2] + bounds.max[2]) / 2,
            ]
          : null;
      },
      brushBounds: (selection) => {
        if (isTransformTool(this.tool) && this.topologySelection.length > 0) {
          return topologyHandleBounds(this.topologySelection);
        }
        if (selection.faceId) {
          const brush = findBrush(this.document, selection.brushId);
          return brush ? deriveBrush(brush).bounds : null;
        }
        return objectSelectionBounds(this.document, selection);
      },
      faceHandle: (selection) => {
        if (!selection.faceId) return null;
        const brush = findBrush(this.document, selection.brushId);
        const face = brush
          ? deriveBrush(brush).faces.find((candidate) => candidate.faceId === selection.faceId)
          : null;
        if (!face || face.vertices.length === 0) return null;
        const center = face.vertices
          .reduce<[number, number, number]>(
            (sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]],
            [0, 0, 0],
          )
          .map((component) => component / face.vertices.length) as [number, number, number];
        return { center, normal: face.normal };
      },
      faceHandles: () => this.availableFaceHandles(),
      snapClipHit: (hit, gridSize) => {
        const brush = findBrush(this.document, hit.brushId);
        const face = brush
          ? deriveBrush(brush).faces.find((candidate) => candidate.faceId === hit.faceId)
          : null;
        if (!face) return null;
        const snapped = hit.point.map(
          (component) => Math.round(component / gridSize) * gridSize,
        ) as [number, number, number];
        const correction = face.distance - dot(face.normal, snapped);
        return addScaled(snapped, face.normal, correction);
      },
      clipPoints: () => this.clipPoints,
      addClipPoints: (points, viewport, viewDirection) => {
        const base = this.clipPoints.length >= 3 ? [] : this.clipPoints;
        this.clipPoints = [...base, ...points].slice(0, 3);
        this.clipPlanePoints = inferClipPlane(this.clipPoints, viewDirection);
        this.lastClipViewport = viewport;
        this.rebuildScene();
        this.onClipPlaneChange?.({
          viewport,
          points: this.clipPoints,
          planePoints: this.clipPlanePoints,
        });
      },
      moveClipPoint: (index, point, viewport, viewDirection, axisRestriction, phase) => {
        if (!this.clipPoints[index]) return;
        this.clipPoints = this.clipPoints.map((existing, pointIndex) =>
          pointIndex === index ? point : existing,
        );
        this.clipPlanePoints = inferClipPlane(this.clipPoints, viewDirection);
        this.lastClipViewport = viewport;
        this.rebuildScene();
        this.onClipPlaneChange?.({
          viewport,
          points: this.clipPoints,
          planePoints: this.clipPlanePoints,
          movingPointIndex: index,
          pointMovePhase: phase,
          axisRestriction,
        });
      },
      matchClipFace: (hit, viewport) => {
        const brush = findBrush(this.document, hit.brushId);
        const face = brush?.faces.find((candidate) => candidate.id === hit.faceId);
        if (!face) return;
        this.clipPoints = face.planePoints;
        this.clipPlanePoints = face.planePoints;
        this.lastClipViewport = viewport;
        this.rebuildScene();
        this.onClipPlaneChange?.({
          viewport,
          points: this.clipPoints,
          planePoints: this.clipPlanePoints,
        });
      },
      pick: (selection, viewport, intent) =>
        options.onPick?.(selection, viewport, intent ?? { additive: false, expansion: 'single' }),
      hover: (selection) => {
        const containingGroup =
          selection && !selection.faceId
            ? editorGroupForObject(this.document, selection, this.openGroupId)
            : null;
        const effectiveSelection = containingGroup
          ? selectionForEditorGroup(
              containingGroup,
              selection?.brushId
                ? { kind: 'brush', brushId: selection.brushId }
                : selection?.entityId
                  ? { kind: 'entity', entityId: selection.entityId }
                  : null,
            )
          : selection;
        if (
          this.hoverSelection?.brushId === effectiveSelection?.brushId &&
          this.hoverSelection?.faceId === effectiveSelection?.faceId &&
          this.hoverSelection?.entityId === effectiveSelection?.entityId &&
          selectedBrushIds(this.hoverSelection).join('\u0000') ===
            selectedBrushIds(effectiveSelection).join('\u0000') &&
          selectedPointEntityIds(this.hoverSelection).join('\u0000') ===
            selectedPointEntityIds(effectiveSelection).join('\u0000')
        )
          return;
        this.hoverSelection = effectiveSelection;
        this.rebuildScene();
      },
      drag: (event, tracePoints) => {
        const version = this.sceneVersion;
        this.movementTraces =
          event.phase === 'preview'
            ? tracePoints.map((point) => ({
                start: [...point] as Vec3,
                end: [
                  point[0] + event.delta[0],
                  point[1] + event.delta[1],
                  point[2] + event.delta[2],
                ] as Vec3,
                axisRestriction: event.axisRestriction,
              }))
            : [];
        options.onBrushDrag?.(event);
        if (this.sceneVersion === version) this.rebuildScene();
      },
      placePointEntity: (event) => options.onPointEntityPlace?.(event),
      pointerPosition: (event) => options.onPointerPosition?.(event),
      contextMenu: (event) => options.onContextMenu?.(event),
      create: (event) => options.onBrushCreate?.(event),
      hull: (event) => this.onHullCreate?.(event),
      hullPoints: () => this.hullPoints,
      previewHullPoints: (points) => {
        this.hullPreviewPoints = dedupeHullPoints(points);
        this.rebuildScene();
      },
      addHullPoints: (points, viewport) => {
        this.hullPoints = dedupeHullPoints([...this.hullPoints, ...points]);
        this.hullPreviewPoints = [];
        this.rebuildScene();
        this.onHullCreate?.({ phase: 'preview', viewport, points: this.hullPoints });
      },
      addHullFace: (face, viewport, clickedPoint) => {
        const brush = findBrush(this.document, face.brushId);
        const derivedFace = brush
          ? deriveBrush(brush).faces.find((candidate) => candidate.faceId === face.faceId)
          : null;
        if (!derivedFace) return;
        const clickedKey = clickedPoint ? encodedTopologyPoint(clickedPoint) : null;
        this.hullPoints = dedupeHullPoints([
          ...this.hullPoints.filter((point) => encodedTopologyPoint(point) !== clickedKey),
          ...derivedFace.vertices,
        ]);
        this.hullPreviewPoints = [];
        this.rebuildScene();
        this.onHullCreate?.({ phase: 'preview', viewport, points: this.hullPoints });
      },
      clearHullPreview: () => {
        if (this.hullPreviewPoints.length === 0) return;
        this.hullPreviewPoints = [];
        this.rebuildScene();
      },
      brushFaceSelections: (brushId) => {
        const brush = findBrush(this.document, brushId);
        return brush?.faces.map((face) => ({ brushId, faceId: face.id })) ?? [];
      },
      transfer: (event) => options.onFaceTransfer?.(event),
      face: (event) => options.onFaceDrag?.(event),
      selectFaceLasso: (handles, ensureSelected, viewport) =>
        options.onFaceLasso?.(
          handles.map((handle) => handle.selection),
          viewport,
          ensureSelected,
        ),
      topologyHandles: (kind) => this.availableTopologyHandles(kind),
      selectedTopologyHandles: () => this.topologySelection,
      selectTopology: (handle, additive) => {
        if (!handle) {
          if (!additive && this.topologySelection.length > 0) {
            this.topologySelection = [];
            options.onTopologySelectionChange?.(this.tool as EditorTopologyKind, 0, []);
            this.rebuildScene();
          }
          return this.topologySelection;
        }
        const compatible = this.topologySelection.filter(
          (candidate) => candidate.kind === handle.kind,
        );
        const selected = compatible.some((candidate) => candidate.key === handle.key);
        this.topologySelection = additive
          ? selected
            ? compatible.filter((candidate) => candidate.key !== handle.key)
            : [...compatible, handle]
          : selected
            ? compatible
            : [handle];
        options.onTopologySelectionChange?.(
          handle.kind,
          this.topologySelection.length,
          topologyHandleVertices(this.topologySelection),
        );
        this.rebuildScene();
        return this.topologySelection;
      },
      selectTopologyLasso: (handles, additive) => {
        const kind = handles[0]?.kind ?? (this.tool as EditorTopologyKind);
        const selected = new Map(
          this.topologySelection
            .filter((handle) => handle.kind === kind)
            .map((handle) => [handle.key, handle] as const),
        );
        for (const handle of handles) {
          if (additive) selected.set(handle.key, handle);
          else if (selected.has(handle.key)) selected.delete(handle.key);
          else selected.set(handle.key, handle);
        }
        this.topologySelection = [...selected.values()];
        options.onTopologySelectionChange?.(
          kind,
          this.topologySelection.length,
          topologyHandleVertices(this.topologySelection),
        );
        this.rebuildScene();
      },
      hoverTopology: (handle) => {
        if (this.topologyHover?.key === handle?.key) return;
        this.topologyHover = handle;
        this.rebuildScene();
      },
      topology: (event, originalHandles) => {
        const version = this.sceneVersion;
        this.movementTraces =
          event.phase === 'preview'
            ? originalHandles.map((handle) => ({
                start: [...handle.center] as Vec3,
                end: [
                  handle.center[0] + event.delta[0],
                  handle.center[1] + event.delta[1],
                  handle.center[2] + event.delta[2],
                ] as Vec3,
                axisRestriction: event.axisRestriction,
              }))
            : [];
        this.topologySelection =
          event.phase === 'cancel'
            ? originalHandles
            : originalHandles.map((handle) => translatedTopologyHandle(handle, event.delta));
        this.topologyHover = null;
        options.onTopologySelectionChange?.(
          event.kind,
          this.topologySelection.length,
          topologyHandleVertices(this.topologySelection),
        );
        options.onTopologyDrag?.(event);
        if (this.sceneVersion === version) this.rebuildScene();
      },
      transform: (event) => options.onTransformDrag?.(event),
      hoverTransformPivot: (hovered) => {
        if (this.transformPivotHovered === hovered) return;
        this.transformPivotHovered = hovered;
        this.rebuildScene();
      },
      moveTransformPivot: (event) => {
        this.transformPivot = [...event.pivot] as Vec3;
        this.transformPivotHovered = true;
        this.transformPivotTrace =
          event.phase === 'preview'
            ? {
                start: [...event.startPivot] as Vec3,
                end: [...event.pivot] as Vec3,
                axisRestriction: event.axisRestriction,
              }
            : null;
        options.onTransformPivotDrag?.(event);
        this.rebuildScene();
      },
      cameraChanged: (viewport, mode, camera) =>
        options.onCameraChange?.({ viewport, mode, camera }),
      sweepCaps: () => this.sweepCaps,
      sweep: (event) => options.onSweepDrag?.(event),
    };
    this.viewports = (
      Object.entries(options.canvases) as [EditorViewportKind, HTMLCanvasElement][]
    ).map(
      ([kind, canvas]) =>
        new Viewport(
          device,
          format,
          pipelines,
          kind,
          canvas,
          bindGroupLayout,
          interaction,
          this.gridSize,
        ),
    );
    for (const viewport of this.viewports) {
      options.onCameraChange?.({
        viewport: viewport.kind,
        mode: 'initial',
        camera: viewport.camera,
      });
    }
  }

  public static async create(options: EditorSourceRendererOptions): Promise<EditorSourceRenderer> {
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
    return new EditorSourceRenderer(
      device,
      format,
      { solid, lines },
      bindGroupLayout,
      materialBindGroupLayout,
      materialSampler,
      options,
      options.clearColor ?? [0.105, 0.12, 0.145, 1],
    );
  }

  private availableTopologyHandles(kind: EditorTopologyKind): readonly TopologyHandle[] {
    if (!this.selection || this.selection.faceId) return [];
    const handles = new Map<string, TopologyHandle>();
    for (const brushId of selectedBrushIds(this.selection)) {
      const brush = findBrush(this.document, brushId);
      if (!brush) continue;
      const brushHandles: readonly TopologyHandle[] =
        kind === 'vertex'
          ? brushVertices(brush).map((point) => ({
              kind,
              center: point,
              vertices: [point],
              key: topologyHandleKey(kind, [point]),
              brushIds: [brush.id],
            }))
          : deriveBrush(brush).edges.map((edge) => {
              const vertices = [edge.start, edge.end] as const;
              return {
                kind,
                center: [
                  (edge.start[0] + edge.end[0]) / 2,
                  (edge.start[1] + edge.end[1]) / 2,
                  (edge.start[2] + edge.end[2]) / 2,
                ],
                vertices,
                key: topologyHandleKey(kind, vertices),
                brushIds: [brush.id],
              };
            });
      for (const handle of brushHandles) {
        const existing = handles.get(handle.key);
        handles.set(
          handle.key,
          existing
            ? { ...existing, brushIds: [...new Set([...existing.brushIds, brush.id])] }
            : handle,
        );
      }
    }
    return [...handles.values()];
  }

  private availableFaceHandles(): readonly FaceHandle[] {
    if (!this.selection) return [];
    const brushIds = this.selection.faceId
      ? [...new Set(selectedFaceReferences(this.selection).map((face) => face.brushId))]
      : selectedBrushIds(this.selection);
    return brushIds.flatMap((brushId) => {
      const brush = findBrush(this.document, brushId);
      if (!brush) return [];
      return deriveBrush(brush).faces.map<FaceHandle>((face) => {
        const sum = face.vertices.reduce<[number, number, number]>(
          (total, point) => [total[0] + point[0], total[1] + point[1], total[2] + point[2]],
          [0, 0, 0],
        );
        return {
          selection: { brushId, faceId: face.faceId },
          center: [
            sum[0] / face.vertices.length,
            sum[1] / face.vertices.length,
            sum[2] / face.vertices.length,
          ],
          normal: face.normal,
        };
      });
    });
  }

  public setDocument(
    document: MapDocument,
    selection: EditorSelection | null = this.selection,
    objectViewState: EditorObjectViewState = this.objectViewState,
  ): void {
    if (this.disposed) return;
    this.document = document;
    this.selection = selection;
    this.objectViewState = objectViewState;
    const topologyKind = this.tool === 'vertex' || this.tool === 'edge' ? this.tool : null;
    if (topologyKind) {
      const previousCount = this.topologySelection.length;
      const available = new Map(
        this.availableTopologyHandles(topologyKind).map((handle) => [handle.key, handle] as const),
      );
      this.topologySelection = this.topologySelection.flatMap((handle) => {
        const replacement = available.get(handle.key);
        return replacement ? [replacement] : [];
      });
      if (this.topologySelection.length === 0) {
        this.topologyHover = null;
      }
      if (previousCount !== this.topologySelection.length) {
        this.onTopologySelectionChange?.(
          topologyKind,
          this.topologySelection.length,
          topologyHandleVertices(this.topologySelection),
        );
      }
    }
    this.rebuildScene();
  }

  public setReferenceScenes(referenceScenes: readonly EditorReferenceScene[]): void {
    if (this.disposed) return;
    this.referenceScenes = referenceScenes;
    this.rebuildScene();
  }

  public setEntityLinkMode(mode: EntityLinkMode): void {
    if (this.disposed || mode === this.entityLinkMode) return;
    this.entityLinkMode = mode;
    this.rebuildScene();
  }

  public setOpenGroupId(groupId: string | null): void {
    if (this.disposed || groupId === this.openGroupId) return;
    this.openGroupId = groupId;
    this.rebuildScene();
  }

  public setObjectViewState(state: EditorObjectViewState): void {
    if (this.disposed) return;
    this.objectViewState = {
      hiddenBrushIds: [...state.hiddenBrushIds],
      hiddenEntityIds: [...state.hiddenEntityIds],
      lockedBrushIds: [...state.lockedBrushIds],
      lockedEntityIds: [...state.lockedEntityIds],
    };
    this.hoverSelection = null;
    this.topologySelection = [];
    this.topologyHover = null;
    this.rebuildScene();
  }

  public setTransformPivot(pivot: Vec3 | null): void {
    if (this.disposed) return;
    if (pivot && !pivot.every(Number.isFinite)) throw new Error('Transform pivot must be finite');
    if (
      this.transformPivot === pivot ||
      (this.transformPivot &&
        pivot &&
        this.transformPivot.every((component, axis) => component === pivot[axis]))
    ) {
      return;
    }
    this.transformPivot = pivot ? ([...pivot] as Vec3) : null;
    this.rebuildScene();
  }

  private rebuildScene(): void {
    for (const batch of this.scene.solids) batch.buffer.destroy();
    this.scene.lines.destroy();
    this.scene.perspectiveGrid.destroy();
    this.scene = buildSceneBuffers(
      this.device,
      this.document,
      this.selection,
      this.hoverSelection,
      this.objectViewState,
      this.referenceScenes,
      this.tool,
      this.gridSize,
      this.transformPivot,
      this.transformPivotHovered,
      this.transformPivotTrace,
      this.movementTraces,
      this.clipPoints,
      this.hullPoints,
      this.hullPreviewPoints,
      this.sweepCaps,
      this.topologySelection,
      this.topologyHover,
      this.entityLinkMode,
      this.openGroupId,
    );
    this.sceneVersion += 1;
  }

  public setMaterials(materials: readonly EditorMaterial[]): void {
    if (this.disposed) return;
    for (const resource of this.materialResources.values()) destroyMaterialResource(resource);
    this.materialResources.clear();
    for (const material of materials) {
      const key = material.name.trim().toLowerCase();
      const previous = this.materialResources.get(key);
      if (previous) destroyMaterialResource(previous);
      this.materialResources.set(
        key,
        createMaterialResource(
          this.device,
          this.materialBindGroupLayout,
          this.materialSampler,
          material,
        ),
      );
    }
  }

  public setSelection(selection: EditorSelection | null): void {
    this.setDocument(this.document, selection);
  }

  public setEntityPlacementBounds(bounds: Bounds): void {
    this.entityPlacementBounds = bounds;
  }

  public clearTopologySelection(): void {
    if (this.topologySelection.length === 0) return;
    const kind = this.topologySelection[0]!.kind;
    this.topologySelection = [];
    this.topologyHover = null;
    this.onTopologySelectionChange?.(kind, 0, []);
    this.rebuildScene();
  }

  /** Prepares selected component handles for an immediately following translated document commit. */
  public translateTopologySelection(delta: Vec3): void {
    if (!delta.every(Number.isFinite)) throw new Error('Topology translation must be finite');
    const kind = this.topologySelection[0]?.kind;
    if (!kind) return;
    this.topologySelection = this.topologySelection.map((handle) =>
      translatedTopologyHandle(handle, delta),
    );
    this.topologyHover = null;
    this.onTopologySelectionChange?.(
      kind,
      this.topologySelection.length,
      topologyHandleVertices(this.topologySelection),
    );
  }

  public remapTopologySelection(event: EditorTransformDragEvent): void {
    const kind = this.topologySelection[0]?.kind;
    if (!kind) return;
    const desiredKeys = new Set(
      this.topologySelection.map((handle) =>
        topologyHandleKey(
          kind,
          handle.vertices.map((point) => transformTopologyPoint(point, event)),
        ),
      ),
    );
    this.topologySelection = this.availableTopologyHandles(kind).filter((handle) =>
      desiredKeys.has(handle.key),
    );
    this.topologyHover = null;
    this.onTopologySelectionChange?.(
      kind,
      this.topologySelection.length,
      topologyHandleVertices(this.topologySelection),
    );
    this.rebuildScene();
  }

  public setSweepCaps(caps: readonly (readonly Vec3[])[]): void {
    if (this.disposed) return;
    this.sweepCaps = caps;
    this.rebuildScene();
  }

  public setTool(tool: EditorTool): void {
    if (this.disposed || tool === this.tool) return;
    for (const viewport of this.viewports) viewport.cancelInteraction();
    this.hoverSelection = null;
    if (tool !== 'rotate') {
      this.transformPivotHovered = false;
      this.transformPivotTrace = null;
    }
    if (this.tool === 'clip' && tool !== 'clip') this.clearClipPlane();
    if (this.tool === 'hull' && tool !== 'hull') this.clearHullPoints();
    if (this.tool === 'sweep' && tool !== 'sweep') this.sweepCaps = [];
    const selectedTopologyKind = this.topologySelection[0]?.kind ?? null;
    const preserveTopology =
      isTransformTool(tool) || (selectedTopologyKind !== null && tool === selectedTopologyKind);
    if (tool !== this.tool && this.topologySelection.length > 0 && !preserveTopology) {
      const previousTopologyTool: EditorTopologyKind | null =
        selectedTopologyKind ?? (this.tool === 'vertex' || this.tool === 'edge' ? this.tool : null);
      this.topologySelection = [];
      this.topologyHover = null;
      if (previousTopologyTool) this.onTopologySelectionChange?.(previousTopologyTool, 0, []);
    }
    this.tool = tool;
    this.rebuildScene();
  }

  public clearClipPlane(): void {
    if (this.clipPoints.length === 0 && !this.clipPlanePoints) return;
    this.clipPoints = [];
    this.clipPlanePoints = null;
    this.rebuildScene();
    this.notifyClipPlaneChange();
  }

  public commitHullBrush(): boolean {
    if (this.tool !== 'hull' || this.hullPoints.length === 0) return false;
    const points = this.hullPoints;
    this.onHullCreate?.({ phase: 'commit', viewport: 'perspective', points });
    this.hullPoints = [];
    this.hullPreviewPoints = [];
    this.rebuildScene();
    return true;
  }

  public clearHullPoints(): boolean {
    if (this.hullPoints.length === 0 && this.hullPreviewPoints.length === 0) return false;
    this.hullPoints = [];
    this.hullPreviewPoints = [];
    this.rebuildScene();
    this.onHullCreate?.({ phase: 'cancel', viewport: 'perspective', points: [] });
    return true;
  }

  public removeLastClipPoint(): boolean {
    if (this.clipPoints.length === 0) return false;
    this.clipPoints = this.clipPoints.slice(0, -1);
    const viewport = this.viewports.find((candidate) => candidate.kind === this.lastClipViewport);
    const direction =
      this.lastClipViewport === 'xy'
        ? ([0, 0, -1] as const)
        : this.lastClipViewport === 'xz'
          ? ([0, 1, 0] as const)
          : this.lastClipViewport === 'yz'
            ? ([-1, 0, 0] as const)
            : viewport?.camera
              ? normalize([
                  Math.cos(viewport.camera.yaw) * Math.cos(viewport.camera.pitch),
                  Math.sin(viewport.camera.yaw) * Math.cos(viewport.camera.pitch),
                  Math.sin(viewport.camera.pitch),
                ])
              : ([0, 1, 0] as const);
    this.clipPlanePoints = inferClipPlane(this.clipPoints, direction);
    this.rebuildScene();
    this.notifyClipPlaneChange();
    return true;
  }

  private notifyClipPlaneChange(): void {
    this.onClipPlaneChange?.({
      viewport: this.lastClipViewport,
      points: this.clipPoints,
      planePoints: this.clipPlanePoints,
    });
  }

  public setGridSize(gridSize: number): void {
    if (this.disposed) return;
    const next = Math.max(1, gridSize);
    if (next === this.gridSize) return;
    this.gridSize = next;
    for (const viewport of this.viewports) viewport.setGridSize(next);
    this.rebuildScene();
  }

  public render(): void {
    if (this.disposed) return;
    const materialBindGroup = (name: string) =>
      this.materialResources.get(name.trim().toLowerCase())?.bindGroup ??
      this.fallbackMaterial.bindGroup;
    for (const viewport of this.viewports) {
      viewport.render(this.scene, materialBindGroup, this.clearColor);
    }
  }

  public viewportCamera(kind: EditorViewportKind): EditorViewportCameraState | null {
    return this.viewports.find((viewport) => viewport.kind === kind)?.camera ?? null;
  }

  public focusSelection(): boolean {
    if (this.disposed) return false;
    const bounds =
      this.topologySelection.length > 0
        ? topologyHandleBounds(this.topologySelection)
        : objectSelectionBounds(this.document, this.selection);
    if (!bounds) return false;
    for (const viewport of this.viewports) viewport.focusBounds(bounds);
    return true;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const batch of this.scene.solids) batch.buffer.destroy();
    this.scene.lines.destroy();
    this.scene.perspectiveGrid.destroy();
    for (const resource of this.materialResources.values()) destroyMaterialResource(resource);
    this.materialResources.clear();
    destroyMaterialResource(this.fallbackMaterial);
    for (const viewport of this.viewports) viewport.dispose();
    this.device.destroy();
  }
}
