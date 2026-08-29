import { findBrush, isMapBrush } from './types.js';
import { deriveBrush } from './geometry.js';
import { deriveEditorGroups, isEditorGroupEntity } from './groups.js';
import { isEditorLayerEntity } from './layers.js';
import { pointEntityBounds } from './point-entities.js';
import { selectedBrushIds, selectedPointEntityIds } from './selection.js';
import { serializeMap } from './map-serializer.js';
import type {
  Bounds,
  EditorSelection,
  MapDocument,
  MapEntity,
  SurfaceAttributes,
  TextureProjection,
  Vec3,
} from './types.js';

export const FACE_ATTRIBUTE_CLIPBOARD_HEADER = '// Worldview face attributes v1';

/** A portable, ID-free snapshot of one authored face's material and mapping attributes. */
export interface FaceAttributeClipboard {
  readonly type: 'worldview-face-attributes';
  readonly version: 1;
  readonly material: string;
  /** Retained so a future rotated-paste mode has the source plane available. */
  readonly planePoints: readonly [Vec3, Vec3, Vec3];
  readonly projection: TextureProjection;
  /** Contents stay with the destination brush and are deliberately omitted. */
  readonly surface: Omit<SurfaceAttributes, 'contents'>;
}

function clonedVec3(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]];
}

function finiteTuple(candidate: unknown, length: number, label: string): readonly number[] {
  if (
    !Array.isArray(candidate) ||
    candidate.length !== length ||
    !candidate.every((component) => typeof component === 'number' && Number.isFinite(component))
  ) {
    throw new Error(`${label} must contain ${length} finite numbers`);
  }
  return [...candidate];
}

function finiteVec2(candidate: unknown, label: string): readonly [number, number] {
  const values = finiteTuple(candidate, 2, label);
  return [values[0]!, values[1]!];
}

function finiteVec3(candidate: unknown, label: string): Vec3 {
  const values = finiteTuple(candidate, 3, label);
  return [values[0]!, values[1]!, values[2]!];
}

function faceAttributeClipboardFromUnknown(value: unknown): FaceAttributeClipboard {
  if (!value || typeof value !== 'object')
    throw new Error('Face attribute payload must be an object');
  const record = value as Record<string, unknown>;
  if (record.type !== 'worldview-face-attributes' || record.version !== 1) {
    throw new Error('Unsupported face attribute clipboard payload');
  }
  if (typeof record.material !== 'string' || record.material.trim().length === 0) {
    throw new Error('Face attribute material must be a non-empty string');
  }
  if (!Array.isArray(record.planePoints) || record.planePoints.length !== 3) {
    throw new Error('Face attribute plane must contain three points');
  }
  const planePoints: readonly [Vec3, Vec3, Vec3] = [
    finiteVec3(record.planePoints[0], 'Face attribute plane point 1'),
    finiteVec3(record.planePoints[1], 'Face attribute plane point 2'),
    finiteVec3(record.planePoints[2], 'Face attribute plane point 3'),
  ];
  if (!record.projection || typeof record.projection !== 'object') {
    throw new Error('Face attribute projection must be an object');
  }
  const projectionRecord = record.projection as Record<string, unknown>;
  const uAxis = finiteVec3(projectionRecord.uAxis, 'Face attribute U axis');
  const vAxis = finiteVec3(projectionRecord.vAxis, 'Face attribute V axis');
  const offset = finiteVec2(projectionRecord.offset, 'Face attribute offset');
  const scale = finiteVec2(projectionRecord.scale, 'Face attribute scale');
  if (scale.some((component) => Math.abs(component) <= Number.EPSILON)) {
    throw new Error('Face attribute scale must be non-zero');
  }
  if (
    typeof projectionRecord.rotationDegrees !== 'number' ||
    !Number.isFinite(projectionRecord.rotationDegrees)
  ) {
    throw new Error('Face attribute rotation must be finite');
  }
  const surfaceRecord =
    record.surface && typeof record.surface === 'object'
      ? (record.surface as Record<string, unknown>)
      : {};
  const surface: { flags?: number; value?: number } = {};
  for (const key of ['flags', 'value'] as const) {
    const component = surfaceRecord[key];
    if (component === undefined) continue;
    if (typeof component !== 'number' || !Number.isFinite(component)) {
      throw new Error(`Face attribute ${key} must be finite`);
    }
    surface[key] = component;
  }
  return {
    type: 'worldview-face-attributes',
    version: 1,
    material: record.material,
    planePoints,
    projection: {
      kind: 'valve-220',
      uAxis,
      vAxis,
      offset,
      rotationDegrees: projectionRecord.rotationDegrees,
      scale,
    },
    surface,
  };
}

/** Serializes the primary selected face as a standalone plain-text attribute payload. */
export function serializeFaceAttributeClipboard(
  document: MapDocument,
  selection: EditorSelection | null,
): string | null {
  if (!selection?.brushId || !selection.faceId) return null;
  const face = findBrush(document, selection.brushId)?.faces.find(
    (candidate) => candidate.id === selection.faceId,
  );
  if (!face) throw new Error('The selected clipboard face no longer exists');
  const { contents: _contents, ...surface } = face.surface;
  const payload: FaceAttributeClipboard = {
    type: 'worldview-face-attributes',
    version: 1,
    material: face.material,
    planePoints: [
      clonedVec3(face.planePoints[0]),
      clonedVec3(face.planePoints[1]),
      clonedVec3(face.planePoints[2]),
    ],
    projection: {
      kind: face.projection.kind,
      uAxis: clonedVec3(face.projection.uAxis),
      vAxis: clonedVec3(face.projection.vAxis),
      offset: [face.projection.offset[0], face.projection.offset[1]],
      rotationDegrees: face.projection.rotationDegrees,
      scale: [face.projection.scale[0], face.projection.scale[1]],
    },
    surface: { ...surface },
  };
  return `${FACE_ATTRIBUTE_CLIPBOARD_HEADER}\n${JSON.stringify(payload, null, 2)}`;
}

/** Parses a Worldview face payload, or returns null when the text is ordinary map/object data. */
export function parseFaceAttributeClipboard(text: string): FaceAttributeClipboard | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(FACE_ATTRIBUTE_CLIPBOARD_HEADER)) return null;
  const body = trimmed.slice(FACE_ATTRIBUTE_CLIPBOARD_HEADER.length).trim();
  if (!body) throw new Error('Face attribute clipboard payload is empty');
  try {
    return faceAttributeClipboardFromUnknown(JSON.parse(body));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error('Face attribute clipboard payload is invalid JSON', { cause: error });
    throw error;
  }
}

/** Builds a standalone, parseable map-text document containing only the selected source objects. */
export function createObjectClipboardDocument(
  document: MapDocument,
  selection: EditorSelection | null,
): MapDocument | null {
  if (!selection || selection.faceId) return null;
  const selectedBrushes = new Set(selectedBrushIds(selection));
  const selectedEntities = new Set(selectedPointEntityIds(selection));
  if (selectedBrushes.size + selectedEntities.size === 0) return null;
  const worldspawn = document.entities.find(
    (entity) => entity.properties.classname?.toLowerCase() === 'worldspawn',
  );
  if (!worldspawn) throw new Error('The map has no worldspawn entity');

  const includedGroupIds = new Set(
    deriveEditorGroups(document)
      .filter(
        (group) =>
          group.brushIds.every((brushId) => selectedBrushes.has(brushId)) &&
          group.pointEntityIds.every((entityId) => selectedEntities.has(entityId)) &&
          group.brushIds.length + group.pointEntityIds.length > 0,
      )
      .map((group) => group.id),
  );
  const worldBrushes = [
    ...worldspawn.primitives.filter((brush) => selectedBrushes.has(brush.id)),
    ...document.entities.flatMap((entity) =>
      isEditorLayerEntity(entity) ||
      (isEditorGroupEntity(entity) && !includedGroupIds.has(entity.properties['_tb_id'] ?? ''))
        ? entity.primitives.filter((brush) => selectedBrushes.has(brush.id))
        : [],
    ),
  ];

  const entities: MapEntity[] = [
    {
      id: worldspawn.id,
      properties: { classname: 'worldspawn' },
      primitives: worldBrushes,
    },
  ];
  const foundBrushes = new Set(entities[0]!.primitives.map((brush) => brush.id));
  const foundEntities = new Set<string>();
  for (const entity of document.entities) {
    if (entity.id === worldspawn.id) continue;
    if (isEditorLayerEntity(entity)) continue;
    if (isEditorGroupEntity(entity)) {
      const groupId = entity.properties['_tb_id'] ?? '';
      if (!includedGroupIds.has(groupId)) continue;
      const properties = { ...entity.properties };
      if (!includedGroupIds.has(properties['_tb_group'] ?? '')) delete properties['_tb_group'];
      delete properties['_tb_layer'];
      const brushes = entity.primitives.filter((brush) => selectedBrushes.has(brush.id));
      brushes.forEach((brush) => foundBrushes.add(brush.id));
      entities.push({ ...entity, properties, primitives: brushes });
      continue;
    }
    const brushes = entity.primitives.filter((brush) => selectedBrushes.has(brush.id));
    if (brushes.length > 0) {
      brushes.forEach((brush) => foundBrushes.add(brush.id));
      const properties = { ...entity.properties };
      if (!includedGroupIds.has(properties['_tb_group'] ?? '')) delete properties['_tb_group'];
      delete properties['_tb_layer'];
      entities.push({ ...entity, properties, primitives: brushes });
      continue;
    }
    if (selectedEntities.has(entity.id)) {
      if (entity.primitives.length > 0) {
        throw new Error(`Brush entity ${entity.id} cannot be copied as a point entity`);
      }
      foundEntities.add(entity.id);
      const properties = { ...entity.properties };
      if (!includedGroupIds.has(properties['_tb_group'] ?? '')) delete properties['_tb_group'];
      delete properties['_tb_layer'];
      entities.push({ ...entity, properties, primitives: [] });
    }
  }
  if (foundBrushes.size !== selectedBrushes.size) {
    throw new Error('The clipboard selection contains an unknown brush');
  }
  if (foundEntities.size !== selectedEntities.size) {
    throw new Error('The clipboard selection contains an unknown point entity');
  }
  return { ...document, revision: 0, entities };
}

/** Returns editor-compatible map text so object selections can cross documents and editors. */
export function serializeObjectClipboard(
  document: MapDocument,
  selection: EditorSelection | null,
): string | null {
  const clipboard = createObjectClipboardDocument(document, selection);
  return clipboard ? serializeMap(clipboard) : null;
}

/** Computes bounds for every brush and point entity in a clipboard map. */
export function objectClipboardBounds(document: MapDocument): Bounds | null {
  const bounds = [
    ...document.entities.flatMap((entity) =>
      entity.primitives.filter(isMapBrush).flatMap((brush) => {
        const derived = deriveBrush(brush);
        return derived.valid && derived.bounds ? [derived.bounds] : [];
      }),
    ),
    ...document.entities.flatMap((entity) => {
      if (entity.primitives.length > 0) return [];
      const entityBounds = pointEntityBounds(entity);
      return entityBounds ? [entityBounds] : [];
    }),
  ];
  if (bounds.length === 0) return null;
  return bounds.slice(1).reduce<Bounds>(
    (result, current) => ({
      min: [
        Math.min(result.min[0], current.min[0]),
        Math.min(result.min[1], current.min[1]),
        Math.min(result.min[2], current.min[2]),
      ],
      max: [
        Math.max(result.max[0], current.max[0]),
        Math.max(result.max[1], current.max[1]),
        Math.max(result.max[2], current.max[2]),
      ],
    }),
    bounds[0]!,
  );
}

/** Places the clipboard center at a pointer, resting one bounds side on a hit surface when supplied. */
export function objectClipboardPasteOffset(
  document: MapDocument,
  point: Vec3,
  surfaceNormal: Vec3 | null = null,
): Vec3 | null {
  const bounds = objectClipboardBounds(document);
  if (!bounds) return null;
  const center: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const delta: [number, number, number] = [
    point[0] - center[0],
    point[1] - center[1],
    point[2] - center[2],
  ];
  if (surfaceNormal) {
    const support: Vec3 = [
      surfaceNormal[0] >= 0 ? bounds.min[0] : bounds.max[0],
      surfaceNormal[1] >= 0 ? bounds.min[1] : bounds.max[1],
      surfaceNormal[2] >= 0 ? bounds.min[2] : bounds.max[2],
    ];
    const currentSupport: Vec3 = [
      support[0] + delta[0],
      support[1] + delta[1],
      support[2] + delta[2],
    ];
    const normalLengthSquared = surfaceNormal.reduce(
      (sum, component) => sum + component * component,
      0,
    );
    if (normalLengthSquared > Number.EPSILON) {
      const correction =
        surfaceNormal.reduce(
          (sum, component, axis) => sum + component * (point[axis]! - currentSupport[axis]!),
          0,
        ) / normalLengthSquared;
      delta[0] += surfaceNormal[0] * correction;
      delta[1] += surfaceNormal[1] * correction;
      delta[2] += surfaceNormal[2] * correction;
    }
  }
  return delta;
}
