import {
  brushVertices,
  brushesInDocument,
  deriveBrush,
  deriveEditorGroups,
  deriveEntityLinks,
  findBrush,
  isBrushSelected,
  isFaceSelected,
  isPointEntitySelected,
  linkedGroupCenter,
  pointEntitiesInDocument,
  pointEntityBounds,
  pointEntityYawDegrees,
  projectedFaceGridSegments,
  selectedBrushIds,
  selectedEntityIdsForLinks,
  selectedEditorGroup,
  selectedFaceReferences,
  selectedPointEntityIds,
  visibleEntityLinks,
  type Bounds,
  type DerivedFace,
  type EditorObjectViewState,
  type EditorSelection,
  type EntityId,
  type EntityDefinitionCatalog,
  type EntityLinkMode,
  type MapDocument,
  type TransformAxis,
  type Vec3,
} from '../core/index.js';
import type {
  EditorDiagnosticOverlay,
  EditorReferenceScene,
  EditorSpriteMaterial,
  EditorTool,
  EditorViewportKind,
} from './types.js';
import {
  cross,
  isTransformTool,
  normalize,
  topologyHandleBounds,
  topologyHandleKey,
  type MovementTrace,
  type ScaleHandle,
  type ScaleSide,
  type TopologyHandle,
} from './viewport-geometry.js';
import { brushSolidSignature, SolidBatchBuilder, type SolidBatch } from './scene-solid-batches.js';
import { DEFAULT_EDITOR_RENDER_THEME, type EditorRenderTheme } from './theme.js';

export interface SceneBuffers {
  readonly solids: readonly SolidBatch[];
  readonly lines: GPUBuffer;
  readonly lineCount: number;
  readonly perspectiveGrid: GPUBuffer;
  readonly perspectiveGridCount: number;
  readonly scaleBounds: Bounds | null;
}

export function boundsCenter(bounds: Bounds): Vec3 {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

export function scaleHandles(
  bounds: Bounds,
  activeAxes: readonly TransformAxis[],
): readonly ScaleHandle[] {
  const center = boundsCenter(bounds);
  const active = new Set(activeAxes);
  const choicesFor = (axis: TransformAxis): readonly ScaleSide[] =>
    active.has(axis) && bounds.max[axis] - bounds.min[axis] > 1e-6 ? [-1, 0, 1] : [0];
  const xChoices = choicesFor(0);
  const yChoices = choicesFor(1);
  const zChoices = choicesFor(2);
  const handles: ScaleHandle[] = [];
  for (const x of xChoices) {
    for (const y of yChoices) {
      for (const z of zChoices) {
        const sides = [x, y, z] as const;
        const axes = sides.flatMap((side, axis) => (side === 0 ? [] : [axis as TransformAxis]));
        if (axes.length === 0) continue;
        handles.push({
          point: sides.map((side, axis) =>
            side < 0 ? bounds.min[axis]! : side > 0 ? bounds.max[axis]! : center[axis]!,
          ) as [number, number, number],
          axes,
          sides,
        });
      }
    }
  }
  return handles;
}

export function scalePivot(bounds: Bounds, handle: ScaleHandle, centered: boolean): Vec3 {
  const pivot = [...boundsCenter(bounds)] as [number, number, number];
  if (centered) return pivot;
  for (const axis of handle.axes) {
    pivot[axis] = handle.sides[axis] < 0 ? bounds.max[axis] : bounds.min[axis];
  }
  return pivot;
}

export function snappedScaleFactor(value: number): number {
  return Math.max(0.05, Math.min(20, Math.round(value * 20) / 20));
}

function appendTransformMarker(
  lines: number[],
  point: Vec3,
  color: readonly [number, number, number],
  radius: number,
): void {
  for (let axis = 0; axis < 3; axis += 1) {
    const start = [...point] as [number, number, number];
    const end = [...point] as [number, number, number];
    start[axis] = start[axis]! - radius;
    end[axis] = end[axis]! + radius;
    lines.push(...start, ...color, ...end, ...color);
  }
}

export function scaleOverlayVertices(
  bounds: Bounds,
  kind: EditorViewportKind,
  theme: EditorRenderTheme = DEFAULT_EDITOR_RENDER_THEME,
): Float32Array {
  const size = bounds.max.map((component, axis) => component - bounds.min[axis]!) as [
    number,
    number,
    number,
  ];
  const markerRadius = Math.max(3, Math.min(10, Math.max(...size) * 0.04));
  const activeAxes: readonly TransformAxis[] =
    kind === 'perspective' || kind === 'xy'
      ? kind === 'perspective'
        ? [0, 1, 2]
        : [0, 1]
      : kind === 'xz'
        ? [0, 2]
        : [1, 2];
  const lines: number[] = [];
  for (const handle of scaleHandles(bounds, activeAxes)) {
    const color =
      handle.axes.length === 1
        ? theme.faceHandle
        : handle.axes.length === 2
          ? theme.accent
          : theme.faceHover;
    appendTransformMarker(lines, handle.point, color, markerRadius);
  }
  return new Float32Array(lines);
}

function appendTransformOverlay(
  lines: number[],
  bounds: Bounds,
  tool: EditorTool,
  transformPivot: Vec3 | null = null,
  transformPivotHovered = false,
  theme: EditorRenderTheme = DEFAULT_EDITOR_RENDER_THEME,
): void {
  const center = tool === 'rotate' && transformPivot ? transformPivot : boundsCenter(bounds);
  const size: Vec3 = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const markerRadius = Math.max(3, Math.min(10, Math.max(...size) * 0.04));
  if (tool === 'rotate') {
    const radius = Math.max(...size) * 0.62 + markerRadius;
    const axes = [
      { first: 1, second: 2, color: theme.axisX },
      { first: 0, second: 2, color: theme.axisY },
      { first: 0, second: 1, color: theme.axisZ },
    ] as const;
    for (const { first, second, color } of axes) {
      let previous: Vec3 | null = null;
      for (let segment = 0; segment <= 32; segment += 1) {
        const radians = (segment / 32) * Math.PI * 2;
        const point = [...center] as [number, number, number];
        point[first] += Math.cos(radians) * radius;
        point[second] += Math.sin(radians) * radius;
        if (previous) lines.push(...previous, ...color, ...point, ...color);
        previous = point;
      }
    }
    if (transformPivotHovered) {
      appendTransformMarker(lines, center, theme.danger, markerRadius * 1.65);
    }
    appendTransformMarker(lines, center, theme.accent, markerRadius);
    return;
  }
  if (tool === 'shear') {
    for (let axis = 0; axis < 3; axis += 1) {
      for (const side of [bounds.min[axis], bounds.max[axis]]) {
        const point = [...center] as [number, number, number];
        point[axis] = side!;
        appendTransformMarker(lines, point, theme.special, markerRadius);
      }
    }
  }
}

function appendMovementTrace(
  lines: number[],
  trace: MovementTrace,
  theme: EditorRenderTheme,
): void {
  const color = theme.accent;
  lines.push(...trace.start, ...color, ...trace.end, ...color);
  appendTransformMarker(lines, trace.start, color, 2.5);
  appendTransformMarker(lines, trace.end, theme.danger, 3.5);
  if (trace.axisRestriction === null) return;
  for (const axis of [0, 1, 2] as const) {
    if (axis === trace.axisRestriction) continue;
    for (const offset of [-0.8, 0.8]) {
      const start = [...trace.start] as [number, number, number];
      const end = [...trace.end] as [number, number, number];
      start[axis] += offset;
      end[axis] += offset;
      lines.push(...start, ...color, ...end, ...color);
    }
  }
}

function appendProjectedFaceGrid(
  lines: number[],
  face: DerivedFace,
  gridSize: number,
  emphasized: boolean,
  theme: EditorRenderTheme,
): void {
  const offset = 0.035;
  for (const segment of projectedFaceGridSegments(face, gridSize)) {
    const color = emphasized
      ? segment.major
        ? theme.accent
        : theme.faceHandle
      : segment.major
        ? theme.gridMajor
        : theme.gridMinor;
    const start: Vec3 = [
      segment.start[0] + face.normal[0] * offset,
      segment.start[1] + face.normal[1] * offset,
      segment.start[2] + face.normal[2] * offset,
    ];
    const end: Vec3 = [
      segment.end[0] + face.normal[0] * offset,
      segment.end[1] + face.normal[1] * offset,
      segment.end[2] + face.normal[2] * offset,
    ];
    lines.push(...start, ...color, ...end, ...color);
  }
}

export function sweepCapsBounds(caps: readonly (readonly Vec3[])[]): Bounds | null {
  const points = caps.flat();
  if (points.length === 0) return null;
  return {
    min: [
      Math.min(...points.map((point) => point[0])),
      Math.min(...points.map((point) => point[1])),
      Math.min(...points.map((point) => point[2])),
    ],
    max: [
      Math.max(...points.map((point) => point[0])),
      Math.max(...points.map((point) => point[1])),
      Math.max(...points.map((point) => point[2])),
    ],
  };
}

export function sweepScaleHandle(bounds: Bounds): Vec3 {
  const center = boundsCenter(bounds);
  const size: Vec3 = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const largestAxis = size.reduce<TransformAxis>(
    (best, value, axis) => (value > size[best] ? (axis as TransformAxis) : best),
    0,
  );
  const handle = [...bounds.max] as [number, number, number];
  if (Math.abs(handle[largestAxis] - center[largestAxis]) <= 1e-6) {
    handle[largestAxis] += Math.max(8, Math.max(...size) * 0.5);
  }
  return handle;
}

function appendSweepOverlay(
  lines: number[],
  caps: readonly (readonly Vec3[])[],
  theme: EditorRenderTheme,
): void {
  const bounds = sweepCapsBounds(caps);
  if (!bounds) return;
  const capColor = theme.success;
  const center = boundsCenter(bounds);
  const size: Vec3 = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const markerRadius = Math.max(3, Math.min(10, Math.max(...size) * 0.04));
  for (const cap of caps) {
    for (let index = 0; index < cap.length; index += 1) {
      lines.push(...cap[index]!, ...capColor, ...cap[(index + 1) % cap.length]!, ...capColor);
    }
  }
  appendTransformMarker(lines, center, theme.accent, markerRadius);

  const radius = Math.max(12, Math.max(...size) * 0.62 + markerRadius);
  const rings = [
    { first: 1, second: 2, color: theme.axisX },
    { first: 0, second: 2, color: theme.axisY },
    { first: 0, second: 1, color: theme.axisZ },
  ] as const;
  for (const { first, second, color } of rings) {
    let previous: Vec3 | null = null;
    for (let segment = 0; segment <= 32; segment += 1) {
      const radians = (segment / 32) * Math.PI * 2;
      const point = [...center] as [number, number, number];
      point[first] += Math.cos(radians) * radius;
      point[second] += Math.sin(radians) * radius;
      if (previous) lines.push(...previous, ...color, ...point, ...color);
      previous = point;
    }
  }
  const scaleHandle = sweepScaleHandle(bounds);
  lines.push(...center, ...capColor, ...scaleHandle, ...capColor);
  appendTransformMarker(lines, scaleHandle, theme.success, markerRadius * 1.35);
}

function appendTopologyMarker(
  lines: number[],
  point: Vec3,
  color: readonly [number, number, number],
  radius = 4,
): void {
  for (let axis = 0; axis < 3; axis += 1) {
    const start = [...point] as [number, number, number];
    const end = [...point] as [number, number, number];
    start[axis] = start[axis]! - radius;
    end[axis] = end[axis]! + radius;
    lines.push(...start, ...color, ...end, ...color);
  }
}

function appendPointEntityHeading(
  lines: number[],
  center: Vec3,
  yawDegrees: number,
  color: readonly [number, number, number],
  length: number,
): void {
  const radians = (yawDegrees * Math.PI) / 180;
  const direction: Vec3 = [Math.cos(radians), Math.sin(radians), 0];
  const end: Vec3 = [
    center[0] + direction[0] * length,
    center[1] + direction[1] * length,
    center[2],
  ];
  lines.push(...center, ...color, ...end, ...color);
  const wingLength = Math.max(4, length * 0.28);
  for (const wingAngle of [yawDegrees + 150, yawDegrees - 150]) {
    const wingRadians = (wingAngle * Math.PI) / 180;
    const wing: Vec3 = [
      end[0] + Math.cos(wingRadians) * wingLength,
      end[1] + Math.sin(wingRadians) * wingLength,
      end[2],
    ];
    lines.push(...end, ...color, ...wing, ...color);
  }
}

export function objectSelectionBounds(
  document: MapDocument,
  selection: EditorSelection | null,
): Bounds | null {
  const brushBounds = selectedBrushIds(selection).flatMap((brushId) => {
    const brush = findBrush(document, brushId);
    const derived = brush ? deriveBrush(brush) : null;
    return derived?.bounds ? [derived.bounds] : [];
  });
  const entityIds = new Set(selectedPointEntityIds(selection));
  const bounds = [
    ...brushBounds,
    ...pointEntitiesInDocument(document).flatMap((entity) => {
      if (!entityIds.has(entity.id)) return [];
      const entityBounds = pointEntityBounds(entity);
      return entityBounds ? [entityBounds] : [];
    }),
  ];
  if (bounds.length === 0) return null;
  return {
    min: [
      Math.min(...bounds.map((entry) => entry.min[0])),
      Math.min(...bounds.map((entry) => entry.min[1])),
      Math.min(...bounds.map((entry) => entry.min[2])),
    ],
    max: [
      Math.max(...bounds.map((entry) => entry.max[0])),
      Math.max(...bounds.map((entry) => entry.max[1])),
      Math.max(...bounds.map((entry) => entry.max[2])),
    ],
  };
}

export function upload(
  device: GPUDevice,
  data: Float32Array,
  usage: GPUBufferUsageFlags,
): GPUBuffer {
  const buffer = device.createBuffer({
    size: Math.max(4, (data.byteLength + 3) & ~3),
    usage,
    mappedAtCreation: data.byteLength > 0,
  });
  if (data.byteLength > 0) {
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
  }
  return buffer;
}

function appendBoundsWireframe(
  lines: number[],
  bounds: Bounds,
  color: readonly [number, number, number],
  offset: Vec3 = [0, 0, 0],
): void {
  const corners: Vec3[] = [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]],
  ];
  for (const [startIndex, endIndex] of [
    [0, 1],
    [0, 2],
    [0, 4],
    [1, 3],
    [1, 5],
    [2, 3],
    [2, 6],
    [3, 7],
    [4, 5],
    [4, 6],
    [5, 7],
    [6, 7],
  ] as const) {
    const start = corners[startIndex]!;
    const end = corners[endIndex]!;
    lines.push(
      start[0] + offset[0],
      start[1] + offset[1],
      start[2] + offset[2],
      ...color,
      end[0] + offset[0],
      end[1] + offset[1],
      end[2] + offset[2],
      ...color,
    );
  }
}

function appendSpritePlane(
  solid: number[],
  center: Vec3,
  width: number,
  height: number,
  axis: 0 | 1,
): void {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const point = (horizontal: number, vertical: number): Vec3 => {
    const result = [...center] as [number, number, number];
    result[axis] += horizontal;
    result[2] += vertical;
    return result;
  };
  const corners = [
    { point: point(-halfWidth, -halfHeight), texture: [0, height] },
    { point: point(halfWidth, -halfHeight), texture: [width, height] },
    { point: point(halfWidth, halfHeight), texture: [width, 0] },
    { point: point(-halfWidth, halfHeight), texture: [0, 0] },
  ] as const;
  for (const index of [0, 1, 2, 0, 2, 3]) {
    const vertex = corners[index]!;
    solid.push(...vertex.point, 1, 1, 1, ...vertex.texture);
  }
}

function appendEntityLinkArrow(
  lines: number[],
  start: Vec3,
  end: Vec3,
  color: readonly [number, number, number],
): void {
  const delta: Vec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const length = Math.hypot(...delta);
  if (length <= 1e-6) return;
  const direction: Vec3 = [delta[0] / length, delta[1] / length, delta[2] / length];
  const helper: Vec3 = Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const side = normalize(cross(direction, helper));
  const up = normalize(cross(side, direction));
  const headLength = Math.min(16, length * 0.3);
  const headWidth = Math.min(7, headLength * 0.5);
  const base: Vec3 = [
    end[0] - direction[0] * headLength,
    end[1] - direction[1] * headLength,
    end[2] - direction[2] * headLength,
  ];
  lines.push(...start, ...color, ...end, ...color);
  for (const normal of [side, up]) {
    const first: Vec3 = [
      base[0] + normal[0] * headWidth,
      base[1] + normal[1] * headWidth,
      base[2] + normal[2] * headWidth,
    ];
    const second: Vec3 = [
      base[0] - normal[0] * headWidth,
      base[1] - normal[1] * headWidth,
      base[2] - normal[2] * headWidth,
    ];
    lines.push(...first, ...color, ...end, ...color, ...second, ...color, ...end, ...color);
  }
}

export function buildSceneBuffers(
  device: GPUDevice,
  document: MapDocument,
  selection: EditorSelection | null,
  hoverSelection: EditorSelection | null,
  objectViewState: EditorObjectViewState,
  referenceScenes: readonly EditorReferenceScene[],
  tool: EditorTool,
  gridSize: number,
  transformPivot: Vec3 | null,
  transformPivotHovered: boolean,
  transformPivotTrace: MovementTrace | null,
  movementTraces: readonly MovementTrace[],
  clipPoints: readonly Vec3[],
  hullPoints: readonly Vec3[],
  hullPreviewPoints: readonly Vec3[],
  sweepCaps: readonly (readonly Vec3[])[],
  topologySelection: readonly TopologyHandle[],
  topologyHover: TopologyHandle | null,
  entityLinkMode: EntityLinkMode,
  openGroupId: string | null,
  entityDefinitions?: EntityDefinitionCatalog,
  diagnosticOverlays: readonly EditorDiagnosticOverlay[] = [],
  sprites: readonly EditorSpriteMaterial[] = [],
  theme: EditorRenderTheme = DEFAULT_EDITOR_RENDER_THEME,
  previousSolids: readonly SolidBatch[] = [],
): SceneBuffers {
  const solidBatches = new SolidBatchBuilder(previousSolids);
  const lines: number[] = [];
  const perspectiveGridLines: number[] = [];
  const renderedTopologyKeys = new Set<string>();
  const spriteByPath = new Map<string, EditorSpriteMaterial>();
  for (const sprite of sprites) {
    const path = sprite.path.trim().replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
    spriteByPath.set(path, sprite);
    const basename = path.split('/').at(-1);
    if (basename && !spriteByPath.has(basename)) spriteByPath.set(basename, sprite);
  }
  const hiddenBrushIds = new Set(objectViewState.hiddenBrushIds);
  const hiddenEntityIds = new Set(objectViewState.hiddenEntityIds);
  const lockedBrushIds = new Set(objectViewState.lockedBrushIds);
  const lockedEntityIds = new Set(objectViewState.lockedEntityIds);
  const denseDocument = brushesInDocument(document).length > 2_000;
  const selectedBounds =
    isTransformTool(tool) && topologySelection.length > 0
      ? topologyHandleBounds(topologySelection)
      : objectSelectionBounds(document, selection);
  const faceToolBrushIds = new Set(
    selection?.faceId
      ? selectedFaceReferences(selection).map((face) => face.brushId)
      : selectedBrushIds(selection),
  );
  const appendDocument = (source: MapDocument, offset: Vec3, reference: boolean) => {
    for (const brush of brushesInDocument(source)) {
      if (!reference && hiddenBrushIds.has(brush.id)) continue;
      const derived = deriveBrush(brush);
      if (!derived.valid) continue;
      const locked = !reference && lockedBrushIds.has(brush.id);
      const primaryBrush = !reference && selection?.brushId === brush.id;
      const selectedObject = !reference && isBrushSelected(selection, brush.id);
      const hoveredObject =
        !reference && !hoverSelection?.faceId && isBrushSelected(hoverSelection, brush.id);
      const solidSignature = brushSolidSignature(brush, offset);
      const faceOverlayLines: number[] = [];
      for (const face of derived.faces) {
        const selectedFace = !reference && isFaceSelected(selection, brush.id, face.faceId);
        const hoveredFace =
          !reference &&
          hoverSelection?.brushId === brush.id &&
          hoverSelection.faceId === face.faceId;
        const activeFace = hoveredFace && selectedObject && !selection?.faceId;
        const materialName = reference
          ? '__worldview_reference__'
          : locked
            ? '__worldview_locked__'
            : face.material;
        const solid = solidBatches.vertices(materialName, derived.bounds!, offset, solidSignature);
        const base = reference ? theme.reference : locked ? theme.edgeLocked : theme.material;
        for (let index = 1; index < face.vertices.length - 1; index += 1) {
          for (const vertexIndex of [0, index, index + 1]) {
            const point = face.vertices[vertexIndex]!;
            const texture = face.textureCoordinates[vertexIndex]!;
            solid.push(
              point[0] + offset[0],
              point[1] + offset[1],
              point[2] + offset[2],
              base[0],
              base[1],
              base[2],
              texture[0],
              texture[1],
            );
          }
        }
        const showFaceHandle = !reference && tool === 'face' && faceToolBrushIds.has(brush.id);
        if (
          !reference &&
          (!denseDocument || selectedFace || hoveredFace) &&
          perspectiveGridLines.length / 12 < 100_000
        ) {
          appendProjectedFaceGrid(
            perspectiveGridLines,
            face,
            gridSize,
            selectedFace || (hoveredFace && !activeFace),
            theme,
          );
        }
        if (showFaceHandle || selectedFace || hoveredFace) {
          const color = selectedFace
            ? theme.faceSelected
            : hoveredFace
              ? theme.faceHover
              : theme.faceHandle;
          for (let index = 0; index < face.vertices.length; index += 1) {
            const start = face.vertices[index]!;
            const end = face.vertices[(index + 1) % face.vertices.length]!;
            faceOverlayLines.push(...start, ...color, ...end, ...color);
          }
          if (showFaceHandle) {
            const center = face.vertices
              .reduce<[number, number, number]>(
                (sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]],
                [0, 0, 0],
              )
              .map((component) => component / face.vertices.length) as [number, number, number];
            const radius = 4;
            for (let axis = 0; axis < 3; axis += 1) {
              const start = [...center] as [number, number, number];
              const end = [...center] as [number, number, number];
              start[axis] = start[axis]! - radius;
              end[axis] = end[axis]! + radius;
              faceOverlayLines.push(...start, ...color, ...end, ...color);
            }
          }
        }
      }
      // Follow TrenchBroom's dark-theme hierarchy: ordinary edges must remain the brightest
      // wireframe element, with red selection and blue locking carrying object state.
      const edgeColor = reference
        ? theme.referenceEdge
        : locked
          ? theme.edgeLocked
          : selectedObject && tool === 'edge'
            ? theme.edgeSelected
            : selectedObject && tool !== 'face'
              ? theme.edgeSelected
              : hoveredObject
                ? theme.edgeHover
                : theme.edge;
      for (const edge of derived.edges) {
        lines.push(
          edge.start[0] + offset[0],
          edge.start[1] + offset[1],
          edge.start[2] + offset[2],
          ...edgeColor,
          edge.end[0] + offset[0],
          edge.end[1] + offset[1],
          edge.end[2] + offset[2],
          ...edgeColor,
        );
      }
      // Face targeting is an overlay. The selected brush stays red, then the prospective face's
      // coincident perimeter is drawn amber on top.
      lines.push(...faceOverlayLines);
      if (primaryBrush && selectedBounds && isTransformTool(tool) && tool !== 'scale') {
        appendTransformOverlay(
          lines,
          selectedBounds,
          tool,
          transformPivot,
          transformPivotHovered,
          theme,
        );
      }
      if (
        !reference &&
        selectedObject &&
        !selection?.faceId &&
        (tool === 'vertex' || tool === 'edge')
      ) {
        const handles: readonly TopologyHandle[] =
          tool === 'vertex'
            ? brushVertices(brush).map((point) => ({
                kind: 'vertex',
                center: point,
                vertices: [point],
                key: topologyHandleKey('vertex', [point]),
                brushIds: [brush.id],
              }))
            : derived.edges.map((edge) => {
                const vertices = [edge.start, edge.end] as const;
                return {
                  kind: 'edge',
                  center: [
                    (edge.start[0] + edge.end[0]) / 2,
                    (edge.start[1] + edge.end[1]) / 2,
                    (edge.start[2] + edge.end[2]) / 2,
                  ],
                  vertices,
                  key: topologyHandleKey('edge', vertices),
                  brushIds: [brush.id],
                };
              });
        const selectedKeys = new Set(topologySelection.map((handle) => handle.key));
        for (const handle of handles) {
          if (renderedTopologyKeys.has(handle.key)) continue;
          renderedTopologyKeys.add(handle.key);
          const color = selectedKeys.has(handle.key)
            ? theme.danger
            : topologyHover?.key === handle.key
              ? theme.accent
              : theme.faceHandle;
          appendTopologyMarker(lines, handle.center, color, selectedKeys.has(handle.key) ? 6 : 4);
        }
      }
    }
    for (const entity of pointEntitiesInDocument(source, entityDefinitions)) {
      if (!reference && hiddenEntityIds.has(entity.id)) continue;
      const bounds = pointEntityBounds(entity, entityDefinitions);
      if (!bounds) continue;
      const selected = !reference && isPointEntitySelected(selection, entity.id);
      const hovered = !reference && isPointEntitySelected(hoverSelection, entity.id);
      const classname = entity.properties.classname?.toLowerCase() ?? '';
      const definitionColor = entityDefinitions
        ?.find(classname)
        ?.color?.map((component) => component / 255) as
        | readonly [number, number, number]
        | undefined;
      const locked = !reference && lockedEntityIds.has(entity.id);
      const color = reference
        ? theme.referenceEdge
        : locked
          ? theme.axisZ
          : selected
            ? theme.edgeHover
            : hovered
              ? theme.faceSelected
              : classname === 'light'
                ? theme.accent
                : classname.startsWith('info_player')
                  ? theme.info
                  : (definitionColor ?? theme.special);
      appendBoundsWireframe(lines, bounds, color, offset);
      const center: Vec3 = [
        (bounds.min[0] + bounds.max[0]) / 2 + offset[0],
        (bounds.min[1] + bounds.max[1]) / 2 + offset[1],
        (bounds.min[2] + bounds.max[2]) / 2 + offset[2],
      ];
      appendTopologyMarker(lines, center, color, 5);
      const spriteReference =
        entity.properties.model ?? entityDefinitions?.find(classname)?.sprite ?? '';
      const normalizedSprite = spriteReference
        .trim()
        .replaceAll('\\', '/')
        .replace(/^\/+/, '')
        .toLowerCase();
      const sprite =
        spriteByPath.get(normalizedSprite) ??
        spriteByPath.get(normalizedSprite.split('/').at(-1) ?? '');
      if (sprite) {
        const scale = Math.max(0.01, Number(entity.properties.scale ?? 1) || 1);
        const solid = solidBatches.vertices(
          sprite.material.name,
          bounds,
          offset,
          `${entity.id}:${JSON.stringify(entity.properties)}:${sprite.path}:${sprite.material.width}x${sprite.material.height}:${offset.join(',')}`,
        );
        appendSpritePlane(
          solid,
          center,
          sprite.material.width * scale,
          sprite.material.height * scale,
          0,
        );
        appendSpritePlane(
          solid,
          center,
          sprite.material.width * scale,
          sprite.material.height * scale,
          1,
        );
      }
      const yaw = pointEntityYawDegrees(entity);
      if (yaw !== null) {
        const width = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]);
        appendPointEntityHeading(lines, center, yaw, color, Math.max(18, width * 0.75));
      }
      if (
        !reference &&
        selection?.entityId === entity.id &&
        selectedBounds &&
        isTransformTool(tool) &&
        tool !== 'scale'
      ) {
        appendTransformOverlay(
          lines,
          selectedBounds,
          tool,
          transformPivot,
          transformPivotHovered,
          theme,
        );
      }
    }
  };
  appendDocument(document, [0, 0, 0], false);
  for (const reference of referenceScenes) {
    if (reference.visible) appendDocument(reference.document, reference.offset, true);
  }
  const selectedGroupId = selectedEditorGroup(document, selection)?.id ?? null;
  const hoveredGroupId = selectedEditorGroup(document, hoverSelection)?.id ?? null;
  const editorGroups = deriveEditorGroups(document);
  for (const group of editorGroups) {
    if (!group.bounds) continue;
    const visible =
      group.brushIds.some((brushId) => !hiddenBrushIds.has(brushId)) ||
      group.pointEntityIds.some((entityId) => !hiddenEntityIds.has(entityId));
    if (!visible) continue;
    const color =
      group.id === openGroupId
        ? theme.info
        : group.id === selectedGroupId
          ? theme.edgeHover
          : group.id === hoveredGroupId
            ? theme.referenceEdge
            : group.linkedGroupId
              ? theme.special
              : theme.axisZ;
    appendBoundsWireframe(lines, group.bounds, color);
  }
  const linkedArrowSource = editorGroups.find(
    (group) => group.linkedGroupId && (group.id === selectedGroupId || group.id === openGroupId),
  );
  const linkedArrowStart = linkedArrowSource ? linkedGroupCenter(linkedArrowSource) : null;
  if (linkedArrowSource?.linkedGroupId && linkedArrowStart) {
    for (const sibling of editorGroups) {
      if (
        sibling.id === linkedArrowSource.id ||
        sibling.linkedGroupId !== linkedArrowSource.linkedGroupId
      ) {
        continue;
      }
      const end = linkedGroupCenter(sibling);
      if (end) appendEntityLinkArrow(lines, linkedArrowStart, end, theme.special);
    }
  }
  const selectedLinkEntities = selectedEntityIdsForLinks(document, selection);
  const selectedLinkEntitySet = new Set(selectedLinkEntities);
  const entityById = new Map(document.entities.map((entity) => [entity.id, entity] as const));
  const entityIsVisible = (entityId: EntityId) => {
    const entity = entityById.get(entityId);
    if (!entity || hiddenEntityIds.has(entityId)) return false;
    return (
      entity.brushes.length === 0 || entity.brushes.some((brush) => !hiddenBrushIds.has(brush.id))
    );
  };
  for (const link of visibleEntityLinks(
    deriveEntityLinks(document),
    selectedLinkEntities,
    entityLinkMode,
  )) {
    if (!entityIsVisible(link.sourceEntityId) || !entityIsVisible(link.targetEntityId)) continue;
    const selected =
      selectedLinkEntitySet.has(link.sourceEntityId) ||
      selectedLinkEntitySet.has(link.targetEntityId);
    appendEntityLinkArrow(
      lines,
      link.sourceAnchor,
      link.targetAnchor,
      selected ? theme.danger : theme.success,
    );
  }
  if (tool === 'rotate' && transformPivotTrace) {
    appendMovementTrace(lines, transformPivotTrace, theme);
  }
  for (const trace of movementTraces) appendMovementTrace(lines, trace, theme);
  if (isTransformTool(tool)) {
    for (const handle of topologySelection) {
      appendTopologyMarker(lines, handle.center, theme.danger, 6);
    }
  }
  if (tool === 'vertex' && topologyHover?.insertion) {
    appendTopologyMarker(lines, topologyHover.center, theme.success, 6);
  }
  if (tool === 'clip') {
    const color = theme.faceSelected;
    const radius = 5;
    for (const point of clipPoints) {
      for (let axis = 0; axis < 3; axis += 1) {
        const start = [...point] as [number, number, number];
        const end = [...point] as [number, number, number];
        start[axis] = start[axis]! - radius;
        end[axis] = end[axis]! + radius;
        lines.push(...start, ...color, ...end, ...color);
      }
    }
    for (let index = 1; index < clipPoints.length; index += 1) {
      lines.push(...clipPoints[index - 1]!, ...color, ...clipPoints[index]!, ...color);
    }
    if (clipPoints.length === 3) {
      lines.push(...clipPoints[2]!, ...color, ...clipPoints[0]!, ...color);
    }
  }
  if (tool === 'hull') {
    const committedColor = theme.success;
    const previewColor = theme.info;
    for (const point of hullPoints) appendTopologyMarker(lines, point, committedColor, 5);
    for (const point of hullPreviewPoints) appendTopologyMarker(lines, point, previewColor, 5);
    if (hullPreviewPoints.length >= 3) {
      for (let index = 0; index < hullPreviewPoints.length; index += 1) {
        const start = hullPreviewPoints[index]!;
        const end = hullPreviewPoints[(index + 1) % hullPreviewPoints.length]!;
        lines.push(...start, ...previewColor, ...end, ...previewColor);
      }
    }
    if (hullPreviewPoints.length === hullPoints.length) {
      for (let index = 0; index < hullPoints.length; index += 1) {
        lines.push(
          ...hullPoints[index]!,
          ...previewColor,
          ...hullPreviewPoints[index]!,
          ...previewColor,
        );
      }
    }
  }
  if (tool === 'sweep') appendSweepOverlay(lines, sweepCaps, theme);
  for (const overlay of diagnosticOverlays) {
    const color = overlay.kind === 'leak-path' ? theme.danger : theme.info;
    for (let index = 1; index < overlay.points.length; index += 1) {
      lines.push(...overlay.points[index - 1]!, ...color, ...overlay.points[index]!, ...color);
    }
    if (overlay.kind === 'portal' && overlay.points.length > 2) {
      lines.push(...overlay.points.at(-1)!, ...color, ...overlay.points[0]!, ...color);
    }
  }
  return {
    solids: solidBatches.finish(device),
    lines: upload(device, new Float32Array(lines), GPUBufferUsage.VERTEX),
    lineCount: lines.length / 6,
    perspectiveGrid: upload(device, new Float32Array(perspectiveGridLines), GPUBufferUsage.VERTEX),
    perspectiveGridCount: perspectiveGridLines.length / 6,
    scaleBounds: tool === 'scale' ? selectedBounds : null,
  };
}
