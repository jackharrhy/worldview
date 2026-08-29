import { mat4 } from 'wgpu-matrix';
import { perspectiveForward as forwardFromAngles } from '@jackharrhy/worldview/core';

import {
  isBrushSelected,
  type Bounds,
  type FaceSelection,
  type TransformAxis,
  type Vec3,
} from '../core/index.js';
import type {
  EditorCameraNavigationMode,
  EditorTopologyKind,
  EditorViewportCameraState,
  EditorViewportKind,
} from './types.js';
import { scaleOverlayVertices, type SceneBuffers } from './scene-buffers.js';
import { uploadFloatBuffer } from './gpu-buffer.js';
import { adaptiveGridSpacing, gridVertices } from './scene-grid.js';
import { boundsVisible } from './scene-visibility.js';
import {
  addScaled,
  cross,
  dot,
  encodedTopologyPoint,
  normalize,
  topologyHandleKey,
  type FaceHandle,
  type TopologyHandle,
} from './viewport-geometry.js';

import {
  isBrushRayHit,
  selectionForHit,
  FACE_HANDLE_HIT_RADIUS,
  type EditorObjectRayHit,
  type ViewportState,
  type Pipelines,
  type ViewportInteraction,
  type PointerDrag,
  initialState,
} from './viewport-common.js';
import { ViewportGestureRouter } from './gesture-controller.js';
import {
  createPointerGestureControllers,
  type PointerGestureTracker,
} from './viewport-gesture-controllers.js';
import { FlyCameraController } from './viewport/fly-camera-controller.js';
import type { EditorRenderTheme } from './theme.js';
import { d, type TgpuBindGroup, type TgpuRoot, type TgpuUniform } from 'typegpu';
import { editorSceneLayout, SceneUniform } from './gpu-schemas.js';
import { EDITOR_SAMPLE_COUNT } from './renderer-gpu.js';
export abstract class ViewportBase {
  protected abstract connectInput(): void;
  protected abstract cancelDrag(): void;
  protected readonly context: GPUCanvasContext;
  protected readonly uniform: TgpuUniform<typeof SceneUniform>;
  protected readonly bindGroup: TgpuBindGroup;
  protected readonly gridUniform: TgpuUniform<typeof SceneUniform>;
  protected readonly gridBindGroup: TgpuBindGroup;
  protected readonly overlayUniform: TgpuUniform<typeof SceneUniform>;
  protected readonly overlayBindGroup: TgpuBindGroup;
  protected grid: GPUBuffer;
  protected gridCount: number;
  protected readonly state: ViewportState;
  protected depth: GPUTexture | null = null;
  protected color: GPUTexture | null = null;
  protected width = 0;
  protected height = 0;
  protected scaleOverlayScene: SceneBuffers | null = null;
  protected scaleOverlay: GPUBuffer | null = null;
  protected scaleOverlayCount = 0;
  protected disposed = false;
  protected readonly gestures = new ViewportGestureRouter<
    PointerDrag,
    PointerEvent,
    PointerEvent,
    PointerGestureTracker
  >(createPointerGestureControllers());
  protected pendingFaceTransferClick: number | null = null;
  protected faceTransferSequenceSource: FaceSelection | null | undefined;
  protected faceTransferSequenceReset: number | null = null;
  protected lassoElement: HTMLDivElement | null = null;
  protected transformReadout: HTMLDivElement | null = null;
  protected transformReadoutPivot: Vec3 | null = null;
  private readonly flyCamera: FlyCameraController;
  private renderRequested = true;
  private lastRenderedVersion = -1;
  private readonly resizeObserver: ResizeObserver;

  protected get dragState(): PointerDrag | null {
    return this.gestures.activeTracker?.drag ?? null;
  }

  protected selectionHitsAt(clientX: number, clientY: number): readonly EditorObjectRayHit[] {
    const ray = this.rayAt(clientX, clientY);
    const hits = this.interaction.hitTests(ray.origin, ray.direction);
    if (this.kind === 'perspective' || hits.length < 2) return hits;

    const axes: readonly [number, number] =
      this.kind === 'xy' ? [0, 1] : this.kind === 'xz' ? [0, 2] : [1, 2];
    const projectedFaceArea = (hit: EditorObjectRayHit): number => {
      if (isBrushRayHit(hit)) {
        const face = this.interaction.faceHandle({
          brushId: hit.brushId,
          faceId: hit.faceId,
        });
        if (face && face.vertices.length >= 3) {
          let twiceArea = 0;
          for (let index = 0; index < face.vertices.length; index += 1) {
            const current = face.vertices[index]!;
            const next = face.vertices[(index + 1) % face.vertices.length]!;
            twiceArea += current[axes[0]]! * next[axes[1]]! - next[axes[0]]! * current[axes[1]]!;
          }
          const area = Math.abs(twiceArea) / 2;
          if (area > Number.EPSILON) return area;
        }
      }
      const bounds = this.interaction.brushBounds(selectionForHit(hit));
      return bounds
        ? Math.max(Number.EPSILON, bounds.max[axes[0]]! - bounds.min[axes[0]]!) *
            Math.max(Number.EPSILON, bounds.max[axes[1]]! - bounds.min[axes[1]]!)
        : Number.POSITIVE_INFINITY;
    };

    return hits.toSorted((left, right) => {
      const areaDifference = projectedFaceArea(left) - projectedFaceArea(right);
      return areaDifference !== 0 ? areaDifference : left.distance - right.distance;
    });
  }

  protected selectionHitAt(clientX: number, clientY: number): EditorObjectRayHit | null {
    return this.selectionHitsAt(clientX, clientY)[0] ?? null;
  }
  protected readonly cancelOnEscape = (event: KeyboardEvent) => {
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
  protected readonly clearInsertionOnModifierRelease = (event: KeyboardEvent) => {
    if (event.key === 'Shift' && !this.dragState) this.interaction.hoverTopology(null);
  };
  public constructor(
    private readonly root: TgpuRoot,
    private readonly format: GPUTextureFormat,
    private readonly pipelines: Pipelines,
    public readonly kind: EditorViewportKind,
    public readonly canvas: HTMLCanvasElement,
    protected readonly interaction: ViewportInteraction,
    protected gridSize: number,
    private readonly requestRender: () => void,
    private theme: EditorRenderTheme,
  ) {
    const context = root.configureContext({
      canvas,
      format,
      alphaMode: 'opaque',
    });
    canvas.tabIndex = 0;
    this.context = context;
    this.uniform = root.createUniform(SceneUniform, {
      projectionView: new Float32Array(16),
      viewport: d.vec4f(1, 1, 1, 0),
      grid: d.vec4f(0, 0, 1, gridSize),
      gridMinor: d.vec4f(...theme.gridMinor, 0.62),
      gridMajor: d.vec4f(...theme.gridMajor, 0.88),
    });
    this.bindGroup = root.createBindGroup(editorSceneLayout, {
      scene: this.uniform,
    });
    this.gridUniform = root.createUniform(SceneUniform, {
      projectionView: new Float32Array(16),
      viewport: d.vec4f(1, 1, 0.32, 0),
      grid: d.vec4f(0, 0, 1, gridSize),
      gridMinor: d.vec4f(...theme.gridMinor, 0.62),
      gridMajor: d.vec4f(...theme.gridMajor, 0.88),
    });
    this.gridBindGroup = root.createBindGroup(editorSceneLayout, {
      scene: this.gridUniform,
    });
    this.overlayUniform = root.createUniform(SceneUniform, {
      projectionView: new Float32Array(16),
      viewport: d.vec4f(1, 1, 0.9, 0),
      grid: d.vec4f(0, 0, 1, gridSize),
      gridMinor: d.vec4f(...theme.gridMinor, 0.62),
      gridMajor: d.vec4f(...theme.gridMajor, 0.88),
    });
    this.overlayBindGroup = root.createBindGroup(editorSceneLayout, {
      scene: this.overlayUniform,
    });
    const grid = gridVertices(kind, gridSize, theme);
    this.grid = uploadFloatBuffer(root.device, grid, GPUBufferUsage.VERTEX);
    this.gridCount = grid.length / 6;
    this.state = initialState(kind);
    this.flyCamera = new FlyCameraController({
      kind,
      canvas,
      forward: () => this.perspectiveForward(),
      speed: () => this.state.flySpeed,
      translate: (delta) => this.translatePerspectiveCamera(delta),
      changed: () => this.notifyCamera('fly'),
      requestFrame: () => this.requestRender(),
    });
    this.connectInput();
    this.canvas.addEventListener('pointerenter', this.followFocusedViewport);
    window.addEventListener('keydown', this.cancelOnEscape);
    window.addEventListener('keyup', this.clearInsertionOnModifierRelease);
    this.resizeObserver = new ResizeObserver(() => this.requestRender());
    this.resizeObserver.observe(this.canvas);
  }

  public get requiresContinuousRender(): boolean {
    return !this.disposed && this.flyCamera.active;
  }

  protected perspectiveForward(): Vec3 {
    return forwardFromAngles(this.state.yaw, this.state.pitch);
  }

  protected perspectiveEye(): Vec3 {
    return addScaled(this.state.center, this.perspectiveForward(), -this.state.distance);
  }

  protected translatePerspectiveCamera(delta: Vec3): void {
    this.state.center = [
      this.state.center[0] + delta[0],
      this.state.center[1] + delta[1],
      this.state.center[2] + delta[2],
    ];
  }

  protected notifyCamera(mode: EditorCameraNavigationMode): void {
    this.renderRequested = true;
    this.requestRender();
    this.interaction.cameraChanged(this.kind, mode, this.camera);
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

  public synchronizeOrthographicCamera(
    source: EditorViewportKind,
    camera: EditorViewportCameraState,
    synchronizeZoom: boolean,
  ): void {
    if (this.kind === 'perspective' || this.kind === source) return;
    const sharedAxes: readonly TransformAxis[] =
      source === 'xy' ? [0, 1] : source === 'xz' ? [0, 2] : source === 'yz' ? [1, 2] : [];
    for (const axis of sharedAxes) this.state.center[axis] = camera.center[axis];
    if (synchronizeZoom) this.state.orthographicSpan = camera.orthographicSpan;
    this.renderRequested = true;
    this.requestRender();
    this.interaction.cameraChanged(this.kind, 'linked', this.camera);
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
    const grid = gridVertices(this.kind, next, this.theme);
    this.grid = uploadFloatBuffer(this.root.device, grid, GPUBufferUsage.VERTEX);
    this.gridCount = grid.length / 6;
    this.renderRequested = true;
  }

  public setTheme(theme: EditorRenderTheme): void {
    this.theme = theme;
    this.grid.destroy();
    const grid = gridVertices(this.kind, this.gridSize, theme);
    this.grid = uploadFloatBuffer(this.root.device, grid, GPUBufferUsage.VERTEX);
    this.gridCount = grid.length / 6;
    this.renderRequested = true;
  }

  public render(
    scene: SceneBuffers,
    materialBindGroup: (name: string) => TgpuBindGroup,
    clearColor: readonly [number, number, number, number],
    renderVersion: number,
    encoder: GPUCommandEncoder,
  ): boolean {
    if (this.disposed) return false;
    this.flyCamera.update();
    this.resize();
    this.positionTransformReadout();
    if (!this.depth || !this.color || this.width === 0 || this.height === 0) return false;
    if (!this.renderRequested && this.lastRenderedVersion === renderVersion) return false;
    this.updateScaleOverlay(scene);
    const matrix = this.projectionView();
    const unitsPerPixel = this.state.orthographicSpan / this.height;
    const visibleGridSpacing = adaptiveGridSpacing(this.gridSize, unitsPerPixel);
    const gridCenter: readonly [number, number] =
      this.kind === 'xy'
        ? [this.state.center[0], this.state.center[1]]
        : this.kind === 'xz'
          ? [this.state.center[0], this.state.center[2]]
          : [this.state.center[1], this.state.center[2]];
    const uniformValue = {
      projectionView: matrix,
      grid: d.vec4f(gridCenter[0], gridCenter[1], unitsPerPixel, visibleGridSpacing),
      gridMinor: d.vec4f(...this.theme.gridMinor, 0.62),
      gridMajor: d.vec4f(...this.theme.gridMajor, 0.88),
    };
    this.uniform.write({ ...uniformValue, viewport: d.vec4f(this.width, this.height, 0.55, 0) });
    this.gridUniform.write({
      ...uniformValue,
      viewport: d.vec4f(this.width, this.height, 0.32, 0),
    });
    this.overlayUniform.write({
      ...uniformValue,
      viewport: d.vec4f(this.width, this.height, 0.9, 0),
    });
    const swapchainView = this.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      label: `Worldview ${this.kind} viewport`,
      colorAttachments: [
        {
          view: this.color.createView(),
          resolveTarget: swapchainView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: {
            r: clearColor[0],
            g: clearColor[1],
            b: clearColor[2],
            a: clearColor[3],
          },
        },
      ],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 1,
      },
    });
    if (this.kind !== 'perspective') {
      pass.setBindGroup(0, this.root.unwrap(this.gridBindGroup));
      pass.setPipeline(this.root.unwrap(this.pipelines.grid));
      pass.draw(3);
    }
    pass.setBindGroup(0, this.root.unwrap(this.bindGroup));
    let activeMaterial: string | null = null;
    const bindMaterial = (name: string) => {
      const key = name.trim().toLowerCase();
      if (key === activeMaterial) return;
      pass.setBindGroup(1, this.root.unwrap(materialBindGroup(name)));
      activeMaterial = key;
    };
    // Match the source-editor convention: textured faces belong to 3D, while orthographic views
    // remain uncluttered projected wireframes.
    if (this.kind === 'perspective' && scene.solids.length > 0) {
      pass.setPipeline(this.root.unwrap(this.pipelines.solid));
      for (const batch of scene.solids) {
        if (!boundsVisible(matrix, batch.bounds)) continue;
        bindMaterial(batch.materialName);
        pass.setVertexBuffer(0, batch.buffer);
        pass.draw(batch.count);
      }
    }
    if (this.kind === 'perspective' && scene.remoteSolids.length > 0) {
      pass.setPipeline(this.root.unwrap(this.pipelines.solid));
      for (const batch of scene.remoteSolids) {
        if (!boundsVisible(matrix, batch.bounds)) continue;
        bindMaterial(batch.materialName);
        pass.setVertexBuffer(0, batch.buffer);
        pass.draw(batch.count);
      }
    }
    pass.setPipeline(this.root.unwrap(this.pipelines.lines));
    if (this.kind === 'perspective') {
      pass.setBindGroup(0, this.root.unwrap(this.gridBindGroup));
      pass.setVertexBuffer(0, this.grid);
      pass.draw(6, this.gridCount / 2);
    }
    if (this.kind === 'perspective' && scene.perspectiveGridCount > 0) {
      pass.setBindGroup(0, this.root.unwrap(this.gridBindGroup));
      pass.setVertexBuffer(0, scene.perspectiveGrid);
      pass.draw(6, scene.perspectiveGridCount / 2);
    }
    pass.setBindGroup(0, this.root.unwrap(this.bindGroup));
    for (const batch of scene.lineBatches) {
      if (!boundsVisible(matrix, batch.bounds)) continue;
      pass.setVertexBuffer(0, batch.buffer);
      pass.draw(6, batch.count / 2);
    }
    if (scene.lineCount > 0) {
      pass.setVertexBuffer(0, scene.lines);
      pass.draw(6, scene.lineCount / 2);
    }
    if (scene.remoteLineCount > 0) {
      pass.setVertexBuffer(0, scene.remoteLines);
      pass.draw(6, scene.remoteLineCount / 2);
    }
    if (scene.overlayLineCount > 0) {
      pass.setBindGroup(0, this.root.unwrap(this.overlayBindGroup));
      pass.setVertexBuffer(0, scene.overlayLines);
      pass.draw(6, scene.overlayLineCount / 2);
    }
    if (this.scaleOverlay && this.scaleOverlayCount > 0) {
      pass.setBindGroup(0, this.root.unwrap(this.overlayBindGroup));
      pass.setVertexBuffer(0, this.scaleOverlay);
      pass.draw(6, this.scaleOverlayCount / 2);
    }
    pass.end();
    this.renderRequested = false;
    this.lastRenderedVersion = renderVersion;
    return true;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeHandleLasso();
    this.hideTransformReadout();
    this.depth?.destroy();
    this.color?.destroy();
    this.scaleOverlay?.destroy();
    this.uniform.buffer.destroy();
    this.gridUniform.buffer.destroy();
    this.overlayUniform.buffer.destroy();
    this.grid.destroy();
    if (this.pendingFaceTransferClick !== null) window.clearTimeout(this.pendingFaceTransferClick);
    if (this.faceTransferSequenceReset !== null)
      window.clearTimeout(this.faceTransferSequenceReset);
    this.flyCamera.dispose();
    this.canvas.removeEventListener('pointerenter', this.followFocusedViewport);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.cancelOnEscape);
    window.removeEventListener('keyup', this.clearInsertionOnModifierRelease);
  }

  private readonly followFocusedViewport = () => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLCanvasElement) || !focused.classList.contains('source-canvas')) {
      return;
    }
    this.canvas.focus({ preventScroll: true });
  };

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

  protected updateScaleOverlay(scene: SceneBuffers): void {
    if (scene === this.scaleOverlayScene) return;
    this.scaleOverlayScene = scene;
    this.scaleOverlay?.destroy();
    this.scaleOverlay = null;
    this.scaleOverlayCount = 0;
    if (!scene.scaleBounds) return;
    const vertices = scaleOverlayVertices(scene.scaleBounds, this.kind, this.theme);
    if (vertices.length === 0) return;
    this.scaleOverlay = uploadFloatBuffer(this.root.device, vertices, GPUBufferUsage.VERTEX);
    this.scaleOverlayCount = vertices.length / 6;
  }

  protected resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (width === this.width && height === this.height) return;
    this.renderRequested = true;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.depth?.destroy();
    this.color?.destroy();
    this.depth = this.root.device.createTexture({
      size: [width, height],
      format: 'depth24plus',
      sampleCount: EDITOR_SAMPLE_COUNT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.color = this.root.device.createTexture({
      size: [width, height],
      format: this.format,
      sampleCount: EDITOR_SAMPLE_COUNT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  protected projectionView(): Float32Array {
    const aspect = Math.max(0.01, this.width / this.height);
    let eye: Vec3;
    let target: Vec3;
    let up: Vec3;
    let projection: Float32Array;
    if (this.kind === 'perspective') {
      const forward = forwardFromAngles(this.state.yaw, this.state.pitch);
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

  protected viewDirection(): Vec3 {
    if (this.kind === 'perspective') return this.perspectiveForward();
    if (this.kind === 'xy') return [0, 0, -1];
    if (this.kind === 'xz') return [0, 1, 0];
    return [-1, 0, 0];
  }

  protected rayAt(
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

  protected projectToCanvas(point: Vec3): readonly [number, number] | null {
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

  protected topologyHandleAt(
    kind: EditorTopologyKind,
    clientX: number,
    clientY: number,
  ): TopologyHandle | null {
    const bounds = this.canvas.getBoundingClientRect();
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    let nearest: {
      readonly handle: TopologyHandle;
      readonly distance: number;
    } | null = null;
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

  protected faceHandleAt(clientX: number, clientY: number): FaceHandle | null {
    const bounds = this.canvas.getBoundingClientRect();
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    const selection = this.interaction.currentSelection();
    let nearest: {
      readonly handle: FaceHandle;
      readonly score: number;
    } | null = null;
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

  protected proximateSelectedFaceAt(clientX: number, clientY: number): FaceHandle | null {
    const selection = this.interaction.currentSelection();
    if (!selection || selection.faceId) return null;
    const selectedBrushes = new Set(
      'brushIds' in selection ? selection.brushIds : selection.brushId ? [selection.brushId] : [],
    );
    if (selectedBrushes.size === 0) return null;

    const edges = new Map<
      string,
      {
        readonly start: Vec3;
        readonly end: Vec3;
        readonly faces: FaceHandle[];
      }
    >();
    for (const face of this.interaction
      .faceHandles()
      .filter((handle) => selectedBrushes.has(handle.selection.brushId))) {
      for (let index = 0; index < face.vertices.length; index += 1) {
        const start = face.vertices[index]!;
        const end = face.vertices[(index + 1) % face.vertices.length]!;
        const points = [encodedTopologyPoint(start), encodedTopologyPoint(end)].toSorted();
        const key = `${face.selection.brushId}:${points.join('|')}`;
        const existing = edges.get(key);
        if (existing) existing.faces.push(face);
        else edges.set(key, { start, end, faces: [face] });
      }
    }

    const canvasBounds = this.canvas.getBoundingClientRect();
    const pointerX = clientX - canvasBounds.left;
    const pointerY = clientY - canvasBounds.top;
    const viewDirection = this.viewDirection();
    let nearest: {
      readonly face: FaceHandle;
      readonly distance: number;
    } | null = null;
    for (const edge of edges.values()) {
      if (edge.faces.length !== 2) continue;
      const firstDot = dot(edge.faces[0]!.normal, viewDirection);
      const secondDot = dot(edge.faces[1]!.normal, viewDirection);
      if (firstDot < -1e-6 === secondDot < -1e-6) continue;
      const start = this.projectToCanvas(edge.start);
      const end = this.projectToCanvas(edge.end);
      if (!start || !end) continue;
      const deltaX = end[0] - start[0];
      const deltaY = end[1] - start[1];
      const denominator = deltaX * deltaX + deltaY * deltaY;
      const amount =
        denominator <= Number.EPSILON
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((pointerX - start[0]) * deltaX + (pointerY - start[1]) * deltaY) / denominator,
              ),
            );
      const distance = Math.hypot(
        start[0] + deltaX * amount - pointerX,
        start[1] + deltaY * amount - pointerY,
      );
      if (distance > 10 || (nearest && distance >= nearest.distance)) continue;
      nearest = {
        face: firstDot > secondDot ? edge.faces[0]! : edge.faces[1]!,
        distance,
      };
    }
    return nearest?.face ?? null;
  }

  protected prospectiveVertexHandleAt(clientX: number, clientY: number): TopologyHandle | null {
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

  protected topologyHandlesInRectangle(
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

  protected faceHandlesInRectangle(
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

  protected updateHandleLasso(startX: number, startY: number, endX: number, endY: number): void {
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

  protected removeHandleLasso(): void {
    this.lassoElement?.remove();
    this.lassoElement = null;
  }

  protected showTransformReadout(text: string, pivot: Vec3): void {
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

  protected showPivotCoordinates(pivot: Vec3): void {
    const label = pivot
      .map((component) =>
        Number.isInteger(component)
          ? String(component)
          : component.toFixed(3).replace(/\.?0+$/, ''),
      )
      .join('  ');
    this.showTransformReadout(label, pivot);
  }

  protected positionTransformReadout(): void {
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

  protected hideTransformReadout(): void {
    this.transformReadout?.remove();
    this.transformReadout = null;
    this.transformReadoutPivot = null;
  }
}
