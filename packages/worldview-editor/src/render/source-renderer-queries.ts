import {
  deriveBrush,
  findBrush,
  intersectBrushRay,
  intersectPointEntityRay,
  type Bounds,
  type BoundsSpatialIndex,
  type BrushRayHit,
  type EditorObjectViewState,
  type EditorSelection,
  type EntityDefinitionCatalog,
  type MapDocument,
  type Vec3,
} from '../core/index.js';
import { objectSelectionBounds } from './scene-buffers.js';
import type { IndexedEditorObject } from './object-spatial-index.js';
import type { EditorObjectRayHit } from './viewport-common.js';
import {
  addScaled,
  dot,
  isTransformTool,
  topologyHandleBounds,
  type FaceHandle,
  type TopologyHandle,
} from './viewport-geometry.js';
import type { EditorTool } from './types.js';

export function hitTestEditorObjects(
  spatialIndex: BoundsSpatialIndex<IndexedEditorObject>,
  viewState: EditorObjectViewState,
  definitions: EntityDefinitionCatalog | undefined,
  origin: Vec3,
  direction: Vec3,
): readonly EditorObjectRayHit[] {
  return spatialIndex
    .queryRay(origin, direction)
    .flatMap<EditorObjectRayHit>(({ value }) => {
      if (value.kind === 'brush') {
        if (
          viewState.hiddenBrushIds.includes(value.brush.id) ||
          viewState.lockedBrushIds.includes(value.brush.id)
        ) {
          return [];
        }
        const hit = intersectBrushRay(value.brush, origin, direction);
        return hit ? [hit] : [];
      }
      if (
        viewState.hiddenEntityIds.includes(value.entity.id) ||
        viewState.lockedEntityIds.includes(value.entity.id)
      ) {
        return [];
      }
      const hit = intersectPointEntityRay(value.entity, origin, direction, definitions);
      return hit ? [hit] : [];
    })
    .toSorted((left, right) => left.distance - right.distance);
}

export function brushFaceNormal(document: MapDocument, hit: BrushRayHit): Vec3 | null {
  const brush = findBrush(document, hit.brushId);
  return brush
    ? (deriveBrush(brush).faces.find((face) => face.faceId === hit.faceId)?.normal ?? null)
    : null;
}

export function selectionCenter(document: MapDocument, selection: EditorSelection): Vec3 | null {
  const bounds = objectSelectionBounds(document, selection);
  return bounds
    ? [
        (bounds.min[0] + bounds.max[0]) / 2,
        (bounds.min[1] + bounds.max[1]) / 2,
        (bounds.min[2] + bounds.max[2]) / 2,
      ]
    : null;
}

export function interactionSelectionBounds(
  document: MapDocument,
  selection: EditorSelection,
  tool: EditorTool,
  topologySelection: readonly TopologyHandle[],
): Bounds | null {
  if (isTransformTool(tool) && topologySelection.length > 0) {
    return topologyHandleBounds(topologySelection);
  }
  if (selection.faceId) {
    const brush = findBrush(document, selection.brushId);
    return brush ? deriveBrush(brush).bounds : null;
  }
  return objectSelectionBounds(document, selection);
}

export function selectedFaceHandle(
  document: MapDocument,
  selection: EditorSelection,
): FaceHandle | null {
  if (!selection.faceId) return null;
  const brush = findBrush(document, selection.brushId);
  const face = brush
    ? deriveBrush(brush).faces.find((candidate) => candidate.faceId === selection.faceId)
    : null;
  if (!face || face.vertices.length === 0) return null;
  const sum = face.vertices.reduce<[number, number, number]>(
    (total, point) => [total[0] + point[0], total[1] + point[1], total[2] + point[2]],
    [0, 0, 0],
  );
  const center: Vec3 = [
    sum[0] / face.vertices.length,
    sum[1] / face.vertices.length,
    sum[2] / face.vertices.length,
  ];
  return {
    selection: { brushId: selection.brushId, faceId: selection.faceId },
    center,
    normal: face.normal,
    vertices: face.vertices,
  };
}

export function snapClipHitToGrid(
  document: MapDocument,
  hit: BrushRayHit,
  gridSize: number,
): Vec3 | null {
  const brush = findBrush(document, hit.brushId);
  const face = brush
    ? deriveBrush(brush).faces.find((candidate) => candidate.faceId === hit.faceId)
    : null;
  if (!face) return null;
  const snapped: Vec3 = [
    Math.round(hit.point[0] / gridSize) * gridSize,
    Math.round(hit.point[1] / gridSize) * gridSize,
    Math.round(hit.point[2] / gridSize) * gridSize,
  ];
  const correction = face.distance - dot(face.normal, snapped);
  return addScaled(snapped, face.normal, correction);
}
