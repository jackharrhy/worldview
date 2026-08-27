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
import { scaleOverlayVertices, upload, type SceneBuffers } from './scene-buffers.js';
import { gridVertices } from './scene-grid.js';
import { boundsVisible } from './scene-visibility.js';
import {
  addScaled,
  cross,
  normalize,
  topologyHandleKey,
  type FaceHandle,
  type TopologyHandle,
} from './viewport-geometry.js';

import {
  isBrushRayHit,
  FACE_HANDLE_HIT_RADIUS,
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
export abstract class ViewportBase {
  protected abstract connectInput(): void;
  protected abstract cancelDrag(): void;
  protected readonly context: GPUCanvasContext;
  protected readonly uniform: GPUBuffer;
  protected readonly bindGroup: GPUBindGroup;
  protected grid: GPUBuffer;
  protected gridCount: number;
  protected readonly state: ViewportState;
  protected depth: GPUTexture | null = null;
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
    private readonly device: GPUDevice,
    private readonly format: GPUTextureFormat,
    private readonly pipelines: Pipelines,
    public readonly kind: EditorViewportKind,
    public readonly canvas: HTMLCanvasElement,
    bindGroupLayout: GPUBindGroupLayout,
    protected readonly interaction: ViewportInteraction,
    protected gridSize: number,
    private readonly requestRender: () => void,
    private readonly theme: EditorRenderTheme,
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
    const grid = gridVertices(kind, gridSize, theme);
    this.grid = upload(device, grid, GPUBufferUsage.VERTEX);
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
    this.grid = upload(this.device, grid, GPUBufferUsage.VERTEX);
    this.gridCount = grid.length / 6;
    this.renderRequested = true;
  }

  public render(
    scene: SceneBuffers,
    materialBindGroup: (name: string) => GPUBindGroup,
    clearColor: readonly [number, number, number, number],
    renderVersion: number,
  ): void {
    if (this.disposed) return;
    this.flyCamera.update();
    this.resize();
    this.positionTransformReadout();
    if (!this.depth || this.width === 0 || this.height === 0) return;
    if (!this.renderRequested && this.lastRenderedVersion === renderVersion) return;
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
    // Match the source-editor convention: textured faces belong to 3D, while orthographic views
    // remain uncluttered projected wireframes.
    if (this.kind === 'perspective' && scene.solids.length > 0) {
      pass.setPipeline(this.pipelines.solid);
      for (const batch of scene.solids) {
        if (!boundsVisible(matrix, batch.bounds)) continue;
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
    this.renderRequested = false;
    this.lastRenderedVersion = renderVersion;
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
    this.scaleOverlay = upload(this.device, vertices, GPUBufferUsage.VERTEX);
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
    this.depth = this.device.createTexture({
      size: [width, height],
      format: 'depth24plus',
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

  protected faceHandleAt(clientX: number, clientY: number): FaceHandle | null {
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
