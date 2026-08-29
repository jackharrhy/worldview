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
  selectedBrushIds,
  selectedEntityIdsForLinks,
  selectedEditorGroup,
  selectedFaceReferences,
  selectedPointEntityIds,
  visibleEntityLinks,
  type Bounds,
  type EditorObjectViewState,
  type EditorSelection,
  type EntityId,
  type EntityDefinitionCatalog,
  type EntityLinkMode,
  type MapDocument,
  type Vec3,
} from '../core/index.js';
import type {
  EditorDiagnosticOverlay,
  EditorRemotePresenceOverlay,
  EditorReferenceScene,
  EditorSpriteMaterial,
  EditorTool,
} from './types.js';
import {
  cross,
  isTransformTool,
  normalize,
  topologyHandleBounds,
  topologyHandleKey,
  type MovementTrace,
  type TopologyHandle,
} from './viewport-geometry.js';
export { boundsCenter, scaleHandles, scalePivot, snappedScaleFactor } from './transform-handles.js';
import { appendTransformOverlay } from './transform-overlay.js';
import {
  appendMovementTrace,
  appendPointEntityHeading,
  appendProjectedFaceGrid,
  appendSweepOverlay,
  appendTopologyMarker,
} from './scene-tool-overlays.js';
export { sweepCapsBounds, sweepScaleHandle } from './scene-tool-overlays.js';
export { scaleOverlayVertices } from './transform-overlay.js';
import { brushSolidSignature, SolidBatchBuilder, type SolidBatch } from './scene-solid-batches.js';
import { LineBatchBuilder } from './scene-line-batches.js';
import { DEFAULT_EDITOR_RENDER_THEME, type EditorRenderTheme } from './theme.js';
import { buildRemotePresenceBuffer } from './remote-presence-buffers.js';
import { buildSelectionOverlayBuffers } from './selection-overlay-buffers.js';
import { uploadFloatBuffer } from './gpu-buffer.js';
import type { SceneBuffers } from './scene-types.js';
import { appendNonBrushPrimitives } from './scene-nonbrush-primitives.js';
export type { SceneBuffers } from './scene-types.js';

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
  solid: { push(...vertices: number[]): number },
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
  remotePresence: readonly EditorRemotePresenceOverlay[] = [],
  sprites: readonly EditorSpriteMaterial[] = [],
  theme: EditorRenderTheme = DEFAULT_EDITOR_RENDER_THEME,
  previousSolids: readonly SolidBatch[] = [],
  previousScene?: SceneBuffers,
  reuseWorldBuffers = false,
): SceneBuffers {
  const reuseWorld = reuseWorldBuffers && previousScene !== undefined;
  const solidBatches = reuseWorld ? null : new SolidBatchBuilder(previousSolids);
  const lineBatches = reuseWorld
    ? null
    : new LineBatchBuilder(device, previousScene?.lineBatches ?? []);
  const lines: number[] = [];
  const overlayLines: number[] = [];
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
  const appendDocument = (
    source: MapDocument,
    offset: Vec3,
    reference: boolean,
    sourcePrefix: string,
  ) => {
    for (const brush of brushesInDocument(source)) {
      if (!reference && hiddenBrushIds.has(brush.id)) continue;
      const locked = !reference && lockedBrushIds.has(brush.id);
      const primaryBrush = !reference && selection?.brushId === brush.id;
      const selectedObject = !reference && isBrushSelected(selection, brush.id);
      const hoveredObject =
        !reference && !hoverSelection?.faceId && isBrushSelected(hoverSelection, brush.id);
      if (reuseWorld && denseDocument && !selectedObject && !hoveredObject) continue;
      const derived = deriveBrush(brush);
      if (!derived.valid) continue;
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
        const solid = solidBatches?.vertices(materialName, derived.bounds!, offset, solidSignature);
        const base = reference ? theme.reference : locked ? theme.edgeLocked : theme.material;
        for (let index = 1; index < face.vertices.length - 1; index += 1) {
          for (const vertexIndex of [0, index, index + 1]) {
            const point = face.vertices[vertexIndex]!;
            const texture = face.textureCoordinates[vertexIndex]!;
            solid?.push(
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
          : hoveredObject
            ? theme.edgeHover
            : theme.edge;
      if (!reuseWorld && derived.bounds) {
        const baseColor = reference ? theme.referenceEdge : locked ? theme.edgeLocked : theme.edge;
        lineBatches?.add(
          `${sourcePrefix}:${brush.id}`,
          `${solidSignature}:${baseColor.join(',')}`,
          derived.bounds,
          offset,
          () => {
            const vertices: number[] = [];
            for (const edge of derived.edges) {
              vertices.push(
                edge.start[0] + offset[0],
                edge.start[1] + offset[1],
                edge.start[2] + offset[2],
                ...baseColor,
                edge.end[0] + offset[0],
                edge.end[1] + offset[1],
                edge.end[2] + offset[2],
                ...baseColor,
              );
            }
            return vertices;
          },
        );
      }
      if (hoveredObject && !selectedObject)
        for (const edge of derived.edges) {
          overlayLines.push(
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
      overlayLines.push(...faceOverlayLines);
      if (primaryBrush && selectedBounds && isTransformTool(tool) && tool !== 'scale') {
        appendTransformOverlay(
          overlayLines,
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
          appendTopologyMarker(
            overlayLines,
            handle.center,
            color,
            selectedKeys.has(handle.key) ? 6 : 4,
          );
        }
      }
    }
    if (!reuseWorld) {
      appendNonBrushPrimitives({ source, offset, lines, solidBatches, theme });
    }
    for (const entity of pointEntitiesInDocument(source, entityDefinitions)) {
      if (!reference && hiddenEntityIds.has(entity.id)) continue;
      const bounds = pointEntityBounds(entity, entityDefinitions);
      if (!bounds) continue;
      const selected = !reference && isPointEntitySelected(selection, entity.id);
      const hovered = !reference && isPointEntitySelected(hoverSelection, entity.id);
      if (reuseWorld && denseDocument && !selected && !hovered) continue;
      const classname = entity.properties.classname?.toLowerCase() ?? '';
      const definitionColor = entityDefinitions
        ?.find(classname)
        ?.color?.map((component) => component / 255) as
        | readonly [number, number, number]
        | undefined;
      const locked = !reference && lockedEntityIds.has(entity.id);
      const baseColor = reference
        ? theme.referenceEdge
        : locked
          ? theme.axisZ
          : classname === 'light'
            ? theme.accent
            : classname.startsWith('info_player')
              ? theme.info
              : (definitionColor ?? theme.special);
      const color = selected ? theme.edgeHover : hovered ? theme.faceSelected : baseColor;
      if (!reuseWorld) appendBoundsWireframe(lines, bounds, baseColor, offset);
      if (selected || hovered) appendBoundsWireframe(overlayLines, bounds, color, offset);
      const center: Vec3 = [
        (bounds.min[0] + bounds.max[0]) / 2 + offset[0],
        (bounds.min[1] + bounds.max[1]) / 2 + offset[1],
        (bounds.min[2] + bounds.max[2]) / 2 + offset[2],
      ];
      if (!reuseWorld) appendTopologyMarker(lines, center, baseColor, 5);
      if (selected || hovered) appendTopologyMarker(overlayLines, center, color, 5);
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
        const solid = solidBatches?.vertices(
          sprite.material.name,
          bounds,
          offset,
          `${entity.id}:${JSON.stringify(entity.properties)}:${sprite.path}:${sprite.material.width}x${sprite.material.height}:${offset.join(',')}`,
        );
        if (solid)
          appendSpritePlane(
            solid,
            center,
            sprite.material.width * scale,
            sprite.material.height * scale,
            0,
          );
        if (solid)
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
        if (!reuseWorld)
          appendPointEntityHeading(lines, center, yaw, baseColor, Math.max(18, width * 0.75));
        if (selected || hovered)
          appendPointEntityHeading(overlayLines, center, yaw, color, Math.max(18, width * 0.75));
      }
      if (
        !reference &&
        selection?.entityId === entity.id &&
        selectedBounds &&
        isTransformTool(tool) &&
        tool !== 'scale'
      ) {
        appendTransformOverlay(
          overlayLines,
          selectedBounds,
          tool,
          transformPivot,
          transformPivotHovered,
          theme,
        );
      }
    }
  };
  appendDocument(document, [0, 0, 0], false, 'document');
  for (const [index, reference] of referenceScenes.entries()) {
    if (reference.visible) {
      appendDocument(reference.document, reference.offset, true, `reference:${index}`);
    }
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
    appendBoundsWireframe(overlayLines, group.bounds, color);
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
      if (end) appendEntityLinkArrow(overlayLines, linkedArrowStart, end, theme.special);
    }
  }
  const selectedLinkEntities = selectedEntityIdsForLinks(document, selection);
  const selectedLinkEntitySet = new Set(selectedLinkEntities);
  const entityById = new Map(document.entities.map((entity) => [entity.id, entity] as const));
  const entityIsVisible = (entityId: EntityId) => {
    const entity = entityById.get(entityId);
    if (!entity || hiddenEntityIds.has(entityId)) return false;
    return (
      entity.primitives.length === 0 ||
      entity.primitives.some((brush) => !hiddenBrushIds.has(brush.id))
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
      overlayLines,
      link.sourceAnchor,
      link.targetAnchor,
      selected ? theme.danger : theme.success,
    );
  }
  if (tool === 'rotate' && transformPivotTrace) {
    appendMovementTrace(overlayLines, transformPivotTrace, theme);
  }
  for (const trace of movementTraces) appendMovementTrace(overlayLines, trace, theme);
  if (isTransformTool(tool)) {
    for (const handle of topologySelection) {
      appendTopologyMarker(overlayLines, handle.center, theme.danger, 6);
    }
  }
  if (tool === 'vertex' && topologyHover?.insertion) {
    appendTopologyMarker(overlayLines, topologyHover.center, theme.success, 6);
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
        overlayLines.push(...start, ...color, ...end, ...color);
      }
    }
    for (let index = 1; index < clipPoints.length; index += 1) {
      overlayLines.push(...clipPoints[index - 1]!, ...color, ...clipPoints[index]!, ...color);
    }
    if (clipPoints.length === 3) {
      overlayLines.push(...clipPoints[2]!, ...color, ...clipPoints[0]!, ...color);
    }
  }
  if (tool === 'hull') {
    const committedColor = theme.success;
    const previewColor = theme.info;
    for (const point of hullPoints) appendTopologyMarker(overlayLines, point, committedColor, 5);
    for (const point of hullPreviewPoints)
      appendTopologyMarker(overlayLines, point, previewColor, 5);
    if (hullPreviewPoints.length >= 3) {
      for (let index = 0; index < hullPreviewPoints.length; index += 1) {
        const start = hullPreviewPoints[index]!;
        const end = hullPreviewPoints[(index + 1) % hullPreviewPoints.length]!;
        overlayLines.push(...start, ...previewColor, ...end, ...previewColor);
      }
    }
    if (hullPreviewPoints.length === hullPoints.length) {
      for (let index = 0; index < hullPoints.length; index += 1) {
        overlayLines.push(
          ...hullPoints[index]!,
          ...previewColor,
          ...hullPreviewPoints[index]!,
          ...previewColor,
        );
      }
    }
  }
  if (tool === 'sweep') appendSweepOverlay(overlayLines, sweepCaps, theme);
  for (const overlay of diagnosticOverlays) {
    const color = overlay.kind === 'leak-path' ? theme.danger : theme.info;
    for (let index = 1; index < overlay.points.length; index += 1) {
      overlayLines.push(
        ...overlay.points[index - 1]!,
        ...color,
        ...overlay.points[index]!,
        ...color,
      );
    }
    if (overlay.kind === 'portal' && overlay.points.length > 2) {
      overlayLines.push(...overlay.points.at(-1)!, ...color, ...overlay.points[0]!, ...color);
    }
  }
  const remote = reuseWorld
    ? {
        lines: previousScene.remoteLines,
        lineCount: previousScene.remoteLineCount,
        solids: previousScene.remoteSolids,
      }
    : buildRemotePresenceBuffer(device, remotePresence, entityDefinitions);
  const localSelection = buildSelectionOverlayBuffers(
    device,
    selection
      ? [
          {
            key: 'local',
            color: theme.edgeSelected,
            document,
            objectIds: [...selectedBrushIds(selection), ...selectedPointEntityIds(selection)],
          },
        ]
      : [],
    entityDefinitions,
  );
  const solids = solidBatches?.finish(device) ?? previousScene!.solids;
  return {
    solids,
    lineBatches: lineBatches?.finish() ?? previousScene!.lineBatches,
    lines: reuseWorld
      ? previousScene.lines
      : uploadFloatBuffer(device, new Float32Array(lines), GPUBufferUsage.VERTEX, 'World edges'),
    lineCount: reuseWorld ? previousScene.lineCount : lines.length / 6,
    overlayLines: uploadFloatBuffer(
      device,
      new Float32Array(overlayLines),
      GPUBufferUsage.VERTEX,
      'Worldview overlays',
    ),
    overlayLineCount: overlayLines.length / 6,
    selectionLines: localSelection.lines,
    selectionLineCount: localSelection.lineCount,
    selectionSolids: localSelection.solids,
    remoteLines: remote.lines,
    remoteLineCount: remote.lineCount,
    remoteSolids: remote.solids,
    perspectiveGrid: uploadFloatBuffer(
      device,
      new Float32Array(perspectiveGridLines),
      GPUBufferUsage.VERTEX,
    ),
    perspectiveGridCount: perspectiveGridLines.length / 6,
    scaleBounds: tool === 'scale' ? selectedBounds : null,
  };
}
