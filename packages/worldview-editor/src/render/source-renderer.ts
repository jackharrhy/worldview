import {
  brushVertices,
  deriveBrush,
  editorGroupForObject,
  findBrush,
  intersectBrushRay,
  intersectPointEntityRay,
  selectedBrushIds,
  selectedFaceReferences,
  selectedPointEntityIds,
  selectionForEditorGroup,
  type Bounds,
  type EditorObjectViewState,
  type EditorSelection,
  type EditorMaterial,
  type EntityLinkMode,
  type MapDocument,
  type Vec3,
} from '../core/index.js';
import type {
  EditorSourceRendererOptions,
  EditorSpriteMaterial,
  EditorDiagnosticOverlay,
  EditorReferenceScene,
  EditorTool,
  EditorTopologyKind,
  EditorTransformDragEvent,
  EditorViewportCameraState,
  EditorViewportKind,
} from './types.js';
import { buildSceneBuffers, objectSelectionBounds, type SceneBuffers } from './scene-buffers.js';
import { buildEditorObjectSpatialIndex, type IndexedEditorObject } from './object-spatial-index.js';
import type { BoundsSpatialIndex } from '../core/index.js';
import {
  createMaterialResource,
  destroyMaterialResource,
  type MaterialResource,
} from './material-resources.js';
import {
  addScaled,
  dedupeHullPoints,
  dot,
  encodedTopologyPoint,
  inferClipPlane,
  isTransformTool,
  normalize,
  topologyHandleBounds,
  topologyHandleKey,
  topologyHandleVertices,
  transformTopologyPoint,
  translatedTopologyHandle,
  type FaceHandle,
  type MovementTrace,
  type TopologyHandle,
} from './viewport-geometry.js';

import {
  type EditorObjectRayHit,
  type Pipelines,
  type ViewportInteraction,
} from './viewport-common.js';
import { createRendererGpuRuntime } from './renderer-gpu.js';
import { Viewport } from './viewport.js';
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
  private diagnosticOverlays: readonly EditorDiagnosticOverlay[];
  private sprites: readonly EditorSpriteMaterial[];
  private materials: readonly EditorMaterial[];
  private entityLinkMode: EntityLinkMode;
  private entityDefinitions: EditorSourceRendererOptions['entityDefinitions'];
  private objectSpatialIndex: BoundsSpatialIndex<IndexedEditorObject>;
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
    this.diagnosticOverlays = options.diagnosticOverlays ?? [];
    this.sprites = options.sprites ?? [];
    this.materials = options.materials ?? [];
    this.entityLinkMode = options.entityLinkMode ?? 'direct';
    this.entityDefinitions = options.entityDefinitions;
    this.objectSpatialIndex = buildEditorObjectSpatialIndex(this.document, this.entityDefinitions);
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
      this.entityDefinitions,
      this.diagnosticOverlays,
      this.sprites,
    );
    this.fallbackMaterial = createMaterialResource(
      device,
      this.materialBindGroupLayout,
      this.materialSampler,
    );
    this.rebuildMaterialResources();
    const hitTests = (origin: Vec3, direction: Vec3): readonly EditorObjectRayHit[] =>
      this.objectSpatialIndex
        .queryRay(origin, direction)
        .flatMap<EditorObjectRayHit>(({ value }) => {
          if (value.kind === 'brush') {
            const brush = value.brush;
            if (
              this.objectViewState.hiddenBrushIds.includes(brush.id) ||
              this.objectViewState.lockedBrushIds.includes(brush.id)
            ) {
              return [];
            }
            const hit = intersectBrushRay(brush, origin, direction);
            return hit ? [hit] : [];
          }
          const entity = value.entity;
          if (
            this.objectViewState.hiddenEntityIds.includes(entity.id) ||
            this.objectViewState.lockedEntityIds.includes(entity.id)
          ) {
            return [];
          }
          const hit = intersectPointEntityRay(entity, origin, direction, this.entityDefinitions);
          return hit ? [hit] : [];
        })
        .toSorted((left, right) => left.distance - right.distance);
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
    const { device, format, pipelines, bindGroupLayout, materialBindGroupLayout, materialSampler } =
      await createRendererGpuRuntime();
    return new EditorSourceRenderer(
      device,
      format,
      pipelines,
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
    const documentChanged = document !== this.document;
    this.document = document;
    if (documentChanged)
      this.objectSpatialIndex = buildEditorObjectSpatialIndex(document, this.entityDefinitions);
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
    const started = performance.now();
    const previous = this.scene;
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
      this.entityDefinitions,
      this.diagnosticOverlays,
      this.sprites,
      previous.solids,
    );
    const retainedBuffers = new Set(this.scene.solids.map(({ buffer }) => buffer));
    for (const batch of previous.solids) {
      if (!retainedBuffers.has(batch.buffer)) batch.buffer.destroy();
    }
    this.sceneVersion += 1;
    performance.measure('worldview.editor.scene-rebuild', {
      start: started,
      end: performance.now(),
    });
  }

  public setMaterials(materials: readonly EditorMaterial[]): void {
    if (this.disposed) return;
    this.materials = materials;
    this.rebuildMaterialResources();
  }

  private rebuildMaterialResources(): void {
    for (const resource of this.materialResources.values()) destroyMaterialResource(resource);
    this.materialResources.clear();
    const spriteMaterials = this.sprites.map((sprite) => sprite.material);
    for (const material of [...this.materials, ...spriteMaterials]) {
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

  public setSprites(sprites: readonly EditorSpriteMaterial[]): void {
    if (this.disposed) return;
    this.sprites = sprites;
    this.rebuildMaterialResources();
    this.rebuildScene();
  }

  public setEntityDefinitions(
    entityDefinitions: EditorSourceRendererOptions['entityDefinitions'],
  ): void {
    if (this.entityDefinitions === entityDefinitions) return;
    this.entityDefinitions = entityDefinitions;
    this.objectSpatialIndex = buildEditorObjectSpatialIndex(this.document, entityDefinitions);
    this.rebuildScene();
  }

  public setDiagnosticOverlays(overlays: readonly EditorDiagnosticOverlay[]): void {
    if (this.disposed) return;
    this.diagnosticOverlays = overlays;
    this.rebuildScene();
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
