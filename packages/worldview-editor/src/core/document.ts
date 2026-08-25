import { brushVertices, deriveBrush, textureCoordinates } from './geometry.js';
import {
  add,
  cross,
  distanceSquared,
  dot,
  GEOMETRY_EPSILON,
  normalize,
  planeFromPoints,
  rotateAroundAxis,
  scale,
  subtract,
  type Plane,
} from './math.js';
import type {
  BrushId,
  EntityId,
  FaceId,
  IdFactory,
  MapBrush,
  MapDocument,
  MapEntity,
  MapFace,
  TextureProjection,
  Vec2,
  Vec3,
} from './types.js';
import { createSequentialIdFactory } from './types.js';

export interface BrushInsertion {
  readonly entityId: EntityId;
  readonly insertionIndex: number;
  readonly brush: MapBrush;
}

export interface BrushSequenceReplacement {
  readonly entityId: EntityId;
  readonly insertionIndex: number;
  readonly expectedBrushIds: readonly BrushId[];
  readonly replacements: readonly MapBrush[];
}

export function insertEntity(
  document: MapDocument,
  entity: MapEntity,
  index?: number,
): MapDocument {
  if (document.entities.some((candidate) => candidate.id === entity.id)) {
    throw new Error(`Entity ${entity.id} already exists`);
  }
  const insertionIndex = index ?? document.entities.length;
  if (
    !Number.isInteger(insertionIndex) ||
    insertionIndex < 1 ||
    insertionIndex > document.entities.length
  ) {
    throw new Error(`Invalid entity insertion index ${insertionIndex}`);
  }
  return {
    ...document,
    revision: document.revision + 1,
    entities: [
      ...document.entities.slice(0, insertionIndex),
      entity,
      ...document.entities.slice(insertionIndex),
    ],
  };
}

export function replaceEntities(
  document: MapDocument,
  replacements: readonly MapEntity[],
): MapDocument {
  if (replacements.length === 0) return document;
  const byId = new Map(replacements.map((entity) => [entity.id, entity] as const));
  if (byId.size !== replacements.length) throw new Error('Entity replacements must be unique');
  const found = new Set<EntityId>();
  const entities = document.entities.map((entity) => {
    const replacement = byId.get(entity.id);
    if (!replacement) return entity;
    found.add(entity.id);
    return replacement;
  });
  for (const entityId of byId.keys()) {
    if (!found.has(entityId)) throw new Error(`Unknown entity ${entityId}`);
  }
  return { ...document, revision: document.revision + 1, entities };
}

export function removeEntities(document: MapDocument, entityIds: readonly EntityId[]): MapDocument {
  const ids = new Set(entityIds);
  if (ids.size === 0) return document;
  if (ids.size !== entityIds.length) throw new Error('Entity ids must be unique');
  const worldspawn = document.entities[0];
  if (worldspawn && ids.has(worldspawn.id)) throw new Error('Worldspawn cannot be removed');
  for (const entityId of ids) {
    if (!document.entities.some((entity) => entity.id === entityId)) {
      throw new Error(`Unknown entity ${entityId}`);
    }
  }
  return {
    ...document,
    revision: document.revision + 1,
    entities: document.entities.filter((entity) => !ids.has(entity.id)),
  };
}

export function moveBrushesToEntity(
  document: MapDocument,
  brushIds: readonly BrushId[],
  targetEntityId: EntityId,
  clearContents = false,
): MapDocument {
  const selected = new Set(brushIds);
  if (selected.size === 0) return document;
  if (selected.size !== brushIds.length) throw new Error('Brush ids must be unique');
  const target = document.entities.find((entity) => entity.id === targetEntityId);
  if (!target) throw new Error(`Unknown entity ${targetEntityId}`);
  const moved = document.entities.flatMap((entity) =>
    entity.brushes.filter((brush) => selected.has(brush.id)),
  );
  if (moved.length !== selected.size)
    throw new Error('The brush selection contains an unknown brush');
  const normalizedMoved = clearContents
    ? moved.map<MapBrush>((brush) => ({
        ...brush,
        revision: brush.revision + 1,
        faces: brush.faces.map((face) => {
          const surface = { ...face.surface };
          delete surface.contents;
          return { ...face, surface };
        }),
      }))
    : moved;
  const entities = document.entities
    .map<MapEntity>((entity) => ({
      ...entity,
      brushes: [
        ...entity.brushes.filter((brush) => !selected.has(brush.id)),
        ...(entity.id === targetEntityId ? normalizedMoved : []),
      ],
    }))
    .filter(
      (entity, index) => index === 0 || entity.brushes.length > 0 || 'origin' in entity.properties,
    );
  return { ...document, revision: document.revision + 1, entities };
}

export function createBrushEntity(
  document: MapDocument,
  brushIds: readonly BrushId[],
  entity: MapEntity,
): MapDocument {
  if (entity.brushes.length > 0) throw new Error('A new brush entity must not contain brushes yet');
  if (!entity.properties.classname?.trim()) throw new Error('A brush entity requires a classname');
  const inserted = insertEntity(document, entity);
  return {
    ...moveBrushesToEntity(inserted, brushIds, entity.id),
    revision: document.revision + 1,
  };
}

function facePoints(point: Vec3, normal: Vec3, size: number): readonly [Vec3, Vec3, Vec3] {
  const helper: Vec3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const firstAxis = normalize(cross(helper, normal)) ?? [1, 0, 0];
  const secondAxis = cross(firstAxis, normal);
  return [
    point,
    [
      point[0] + firstAxis[0] * size,
      point[1] + firstAxis[1] * size,
      point[2] + firstAxis[2] * size,
    ],
    [
      point[0] + secondAxis[0] * size,
      point[1] + secondAxis[1] * size,
      point[2] + secondAxis[2] * size,
    ],
  ];
}

export function defaultTextureProjection(normal: Vec3): TextureProjection {
  if (Math.abs(normal[2]) >= Math.max(Math.abs(normal[0]), Math.abs(normal[1]))) {
    return {
      uAxis: [1, 0, 0],
      vAxis: [0, -1, 0],
      offset: [0, 0],
      rotationDegrees: 0,
      scale: [1, 1],
    };
  }
  if (Math.abs(normal[0]) >= Math.abs(normal[1])) {
    return {
      uAxis: [0, 1, 0],
      vAxis: [0, 0, -1],
      offset: [0, 0],
      rotationDegrees: 0,
      scale: [1, 1],
    };
  }
  return { uAxis: [1, 0, 0], vAxis: [0, 0, -1], offset: [0, 0], rotationDegrees: 0, scale: [1, 1] };
}

export function createBoxBrush(
  minimum: Vec3,
  maximum: Vec3,
  material = 'DEV/GRID',
  ids: IdFactory = createSequentialIdFactory('box'),
): MapBrush {
  const size = Math.max(
    maximum[0] - minimum[0],
    maximum[1] - minimum[1],
    maximum[2] - minimum[2],
    1,
  );
  const definitions: readonly { point: Vec3; normal: Vec3 }[] = [
    { point: [maximum[0], minimum[1], minimum[2]], normal: [1, 0, 0] },
    { point: [minimum[0], minimum[1], minimum[2]], normal: [-1, 0, 0] },
    { point: [minimum[0], maximum[1], minimum[2]], normal: [0, 1, 0] },
    { point: [minimum[0], minimum[1], minimum[2]], normal: [0, -1, 0] },
    { point: [minimum[0], minimum[1], maximum[2]], normal: [0, 0, 1] },
    { point: [minimum[0], minimum[1], minimum[2]], normal: [0, 0, -1] },
  ];
  return {
    id: ids.brush(),
    revision: 0,
    faces: definitions.map<MapFace>(({ point, normal }) => ({
      id: ids.face(),
      planePoints: facePoints(point, normal, size),
      material,
      projection: defaultTextureProjection(normal),
      surface: {},
    })),
  };
}

export function cloneBrush(
  source: MapBrush,
  ids: IdFactory,
  delta: Vec3 = [0, 0, 0],
  textureLock = true,
): MapBrush {
  const clone: MapBrush = {
    ...source,
    id: ids.brush(),
    revision: 0,
    faces: source.faces.map((face) => ({
      ...face,
      id: ids.face(),
      planePoints: face.planePoints.map((point) => [...point] as Vec3) as unknown as readonly [
        Vec3,
        Vec3,
        Vec3,
      ],
      projection: {
        ...face.projection,
        uAxis: [...face.projection.uAxis] as Vec3,
        vAxis: [...face.projection.vAxis] as Vec3,
        offset: [...face.projection.offset] as readonly [number, number],
        scale: [...face.projection.scale] as readonly [number, number],
      },
      surface: { ...face.surface },
    })),
  };
  if (delta.every((component) => Math.abs(component) <= Number.EPSILON)) return clone;
  return { ...translateBrush(clone, delta, textureLock), revision: 0 };
}

export function createStarterDocument(): MapDocument {
  const ids = createSequentialIdFactory('starter');
  const worldspawn: MapEntity = {
    id: ids.entity(),
    properties: { classname: 'worldspawn', message: 'Worldview editor starter', light: '96' },
    brushes: [
      createBoxBrush([-128, -128, -32], [128, 128, 0], 'DEV_FLOOR', ids),
      createBoxBrush([-96, -32, 0], [-32, 32, 96], 'DEV_PILLAR', ids),
      createBoxBrush([32, -32, 0], [96, 32, 160], 'DEV_PILLAR', ids),
    ],
  };
  const playerStart: MapEntity = {
    id: ids.entity(),
    properties: {
      classname: 'info_player_start',
      origin: '0 -96 24',
      angle: '90',
    },
    brushes: [],
  };
  const light: MapEntity = {
    id: ids.entity(),
    properties: {
      classname: 'light',
      origin: '0 -48 144',
      light: '400',
    },
    brushes: [],
  };
  return {
    id: ids.document(),
    revision: 0,
    format: 'valve-220',
    entities: [worldspawn, playerStart, light],
  };
}

export function replaceBrush(document: MapDocument, replacement: MapBrush): MapDocument {
  let found = false;
  const entities = document.entities.map((entity) => {
    if (!entity.brushes.some((brush) => brush.id === replacement.id)) return entity;
    found = true;
    return {
      ...entity,
      brushes: entity.brushes.map((brush) => (brush.id === replacement.id ? replacement : brush)),
    };
  });
  if (!found) throw new Error(`Unknown brush ${replacement.id}`);
  return { ...document, revision: document.revision + 1, entities };
}

export function replaceBrushes(
  document: MapDocument,
  replacements: readonly MapBrush[],
): MapDocument {
  if (replacements.length === 0) return document;
  const byId = new Map(replacements.map((brush) => [brush.id, brush] as const));
  const found = new Set<BrushId>();
  const entities = document.entities.map((entity) => ({
    ...entity,
    brushes: entity.brushes.map((brush) => {
      const replacement = byId.get(brush.id);
      if (!replacement) return brush;
      found.add(brush.id);
      return replacement;
    }),
  }));
  for (const brushId of byId.keys()) {
    if (!found.has(brushId)) throw new Error(`Unknown brush ${brushId}`);
  }
  return { ...document, revision: document.revision + 1, entities };
}

export function replaceBrushSequence(
  document: MapDocument,
  entityId: EntityId,
  insertionIndex: number,
  expectedBrushIds: readonly BrushId[],
  replacements: readonly MapBrush[],
): MapDocument {
  return replaceBrushSequences(document, [
    { entityId, insertionIndex, expectedBrushIds, replacements },
  ]);
}

export function replaceBrushSequences(
  document: MapDocument,
  sequences: readonly BrushSequenceReplacement[],
): MapDocument {
  if (sequences.length === 0) return document;
  const byEntity = new Map<EntityId, BrushSequenceReplacement[]>();
  const removedIds = new Set<BrushId>();
  for (const sequence of sequences) {
    const entity = document.entities.find((candidate) => candidate.id === sequence.entityId);
    if (!entity) throw new Error(`Unknown entity ${sequence.entityId}`);
    if (!Number.isInteger(sequence.insertionIndex) || sequence.insertionIndex < 0) {
      throw new Error(`Invalid brush insertion index ${sequence.insertionIndex}`);
    }
    const actual = entity.brushes
      .slice(sequence.insertionIndex, sequence.insertionIndex + sequence.expectedBrushIds.length)
      .map((brush) => brush.id);
    if (
      actual.length !== sequence.expectedBrushIds.length ||
      actual.some((brushId, index) => brushId !== sequence.expectedBrushIds[index])
    ) {
      throw new Error('The brush sequence changed before it could be replaced');
    }
    for (const brushId of sequence.expectedBrushIds) {
      if (removedIds.has(brushId)) throw new Error(`Brush ${brushId} is replaced more than once`);
      removedIds.add(brushId);
    }
    const entitySequences = byEntity.get(sequence.entityId) ?? [];
    entitySequences.push(sequence);
    byEntity.set(sequence.entityId, entitySequences);
  }
  for (const entitySequences of byEntity.values()) {
    const ordered = entitySequences.toSorted(
      (left, right) => left.insertionIndex - right.insertionIndex,
    );
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      if (current.insertionIndex < previous.insertionIndex + previous.expectedBrushIds.length) {
        throw new Error('Brush replacement sequences cannot overlap');
      }
    }
  }
  const retainedIds = new Set(
    document.entities.flatMap((entity) =>
      entity.brushes.filter((brush) => !removedIds.has(brush.id)).map((brush) => brush.id),
    ),
  );
  const replacementIds = new Set<BrushId>();
  for (const replacement of sequences.flatMap((sequence) => sequence.replacements)) {
    if (retainedIds.has(replacement.id) || replacementIds.has(replacement.id)) {
      throw new Error(`Brush ${replacement.id} already exists`);
    }
    replacementIds.add(replacement.id);
  }
  return {
    ...document,
    revision: document.revision + 1,
    entities: document.entities.map((entity) => {
      const entitySequences = byEntity.get(entity.id);
      if (!entitySequences) return entity;
      const brushes = [...entity.brushes];
      for (const sequence of entitySequences.toSorted(
        (left, right) => right.insertionIndex - left.insertionIndex,
      )) {
        brushes.splice(
          sequence.insertionIndex,
          sequence.expectedBrushIds.length,
          ...sequence.replacements,
        );
      }
      return { ...entity, brushes };
    }),
  };
}

export function insertBrush(
  document: MapDocument,
  entityId: EntityId,
  brush: MapBrush,
  index?: number,
): MapDocument {
  if (document.entities.some((entity) => entity.brushes.some((entry) => entry.id === brush.id))) {
    throw new Error(`Brush ${brush.id} already exists`);
  }
  const target = document.entities.find((entity) => entity.id === entityId);
  if (!target) throw new Error(`Unknown entity ${entityId}`);
  const insertionIndex = index ?? target.brushes.length;
  if (
    !Number.isInteger(insertionIndex) ||
    insertionIndex < 0 ||
    insertionIndex > target.brushes.length
  ) {
    throw new Error(`Invalid brush insertion index ${insertionIndex}`);
  }
  return {
    ...document,
    revision: document.revision + 1,
    entities: document.entities.map((entity) =>
      entity.id === entityId
        ? {
            ...entity,
            brushes: [
              ...entity.brushes.slice(0, insertionIndex),
              brush,
              ...entity.brushes.slice(insertionIndex),
            ],
          }
        : entity,
    ),
  };
}

export function insertBrushes(
  document: MapDocument,
  insertions: readonly BrushInsertion[],
): MapDocument {
  if (insertions.length === 0) return document;
  const existingIds = new Set(
    document.entities.flatMap((entity) => entity.brushes.map((brush) => brush.id)),
  );
  const insertedIds = new Set<BrushId>();
  const byEntity = new Map<EntityId, BrushInsertion[]>();
  for (const insertion of insertions) {
    if (existingIds.has(insertion.brush.id) || insertedIds.has(insertion.brush.id)) {
      throw new Error(`Brush ${insertion.brush.id} already exists`);
    }
    if (!Number.isInteger(insertion.insertionIndex) || insertion.insertionIndex < 0) {
      throw new Error(`Invalid brush insertion index ${insertion.insertionIndex}`);
    }
    if (!document.entities.some((entity) => entity.id === insertion.entityId)) {
      throw new Error(`Unknown entity ${insertion.entityId}`);
    }
    insertedIds.add(insertion.brush.id);
    const entityInsertions = byEntity.get(insertion.entityId) ?? [];
    entityInsertions.push(insertion);
    byEntity.set(insertion.entityId, entityInsertions);
  }
  return {
    ...document,
    revision: document.revision + 1,
    entities: document.entities.map((entity) => {
      const entityInsertions = byEntity.get(entity.id);
      if (!entityInsertions) return entity;
      const brushes = [...entity.brushes];
      for (const insertion of entityInsertions.toSorted(
        (left, right) => left.insertionIndex - right.insertionIndex,
      )) {
        if (insertion.insertionIndex > brushes.length) {
          throw new Error(`Invalid brush insertion index ${insertion.insertionIndex}`);
        }
        brushes.splice(insertion.insertionIndex, 0, insertion.brush);
      }
      return { ...entity, brushes };
    }),
  };
}

export function removeBrush(document: MapDocument, brushId: BrushId): MapDocument {
  if (!document.entities.some((entity) => entity.brushes.some((brush) => brush.id === brushId))) {
    throw new Error(`Unknown brush ${brushId}`);
  }
  return {
    ...document,
    revision: document.revision + 1,
    entities: document.entities.map((entity) => ({
      ...entity,
      brushes: entity.brushes.filter((brush) => brush.id !== brushId),
    })),
  };
}

export function removeBrushes(document: MapDocument, brushIds: readonly BrushId[]): MapDocument {
  if (brushIds.length === 0) return document;
  const uniqueIds = new Set(brushIds);
  if (uniqueIds.size !== brushIds.length) throw new Error('Brush ids must be unique');
  const existingIds = new Set(
    document.entities.flatMap((entity) => entity.brushes.map((brush) => brush.id)),
  );
  for (const brushId of uniqueIds) {
    if (!existingIds.has(brushId)) throw new Error(`Unknown brush ${brushId}`);
  }
  return {
    ...document,
    revision: document.revision + 1,
    entities: document.entities.map((entity) => ({
      ...entity,
      brushes: entity.brushes.filter((brush) => !uniqueIds.has(brush.id)),
    })),
  };
}

export function replaceEntityProperties(
  document: MapDocument,
  entityId: EntityId,
  properties: Readonly<Record<string, string>>,
): MapDocument {
  if (!document.entities.some((entity) => entity.id === entityId)) {
    throw new Error(`Unknown entity ${entityId}`);
  }
  return {
    ...document,
    revision: document.revision + 1,
    entities: document.entities.map((entity) =>
      entity.id === entityId ? { ...entity, properties: { ...properties } } : entity,
    ),
  };
}

export function translateBrush(brush: MapBrush, delta: Vec3, textureLock = true): MapBrush {
  return {
    ...brush,
    revision: brush.revision + 1,
    faces: brush.faces.map((face) => {
      const scaleU =
        Math.abs(face.projection.scale[0]) <= Number.EPSILON ? 1 : face.projection.scale[0];
      const scaleV =
        Math.abs(face.projection.scale[1]) <= Number.EPSILON ? 1 : face.projection.scale[1];
      const projection = textureLock
        ? {
            ...face.projection,
            offset: [
              face.projection.offset[0] -
                (delta[0] * face.projection.uAxis[0] +
                  delta[1] * face.projection.uAxis[1] +
                  delta[2] * face.projection.uAxis[2]) /
                  scaleU,
              face.projection.offset[1] -
                (delta[0] * face.projection.vAxis[0] +
                  delta[1] * face.projection.vAxis[1] +
                  delta[2] * face.projection.vAxis[2]) /
                  scaleV,
            ] as const,
          }
        : face.projection;
      return {
        ...face,
        projection,
        planePoints: face.planePoints.map(
          (point) => [point[0] + delta[0], point[1] + delta[1], point[2] + delta[2]] as Vec3,
        ) as unknown as readonly [Vec3, Vec3, Vec3],
      };
    }),
  };
}

export type TransformAxis = 0 | 1 | 2;
type Matrix3 = readonly [Vec3, Vec3, Vec3];

function multiplyMatrixVector(matrix: Matrix3, vector: Vec3): Vec3 {
  return [dot(matrix[0], vector), dot(matrix[1], vector), dot(matrix[2], vector)];
}

function determinant(matrix: Matrix3): number {
  return (
    matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]) -
    matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0]) +
    matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0])
  );
}

function inverseTranspose(matrix: Matrix3): Matrix3 {
  const value = determinant(matrix);
  if (!Number.isFinite(value) || Math.abs(value) <= 1e-9) {
    throw new Error('Brush transform must be invertible');
  }
  const inverse: Matrix3 = [
    [
      (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]) / value,
      (matrix[0][2] * matrix[2][1] - matrix[0][1] * matrix[2][2]) / value,
      (matrix[0][1] * matrix[1][2] - matrix[0][2] * matrix[1][1]) / value,
    ],
    [
      (matrix[1][2] * matrix[2][0] - matrix[1][0] * matrix[2][2]) / value,
      (matrix[0][0] * matrix[2][2] - matrix[0][2] * matrix[2][0]) / value,
      (matrix[0][2] * matrix[1][0] - matrix[0][0] * matrix[1][2]) / value,
    ],
    [
      (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0]) / value,
      (matrix[0][1] * matrix[2][0] - matrix[0][0] * matrix[2][1]) / value,
      (matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0]) / value,
    ],
  ];
  return [
    [inverse[0][0], inverse[1][0], inverse[2][0]],
    [inverse[0][1], inverse[1][1], inverse[2][1]],
    [inverse[0][2], inverse[1][2], inverse[2][2]],
  ];
}

function transformPoint(point: Vec3, matrix: Matrix3, pivot: Vec3): Vec3 {
  const relative: Vec3 = [point[0] - pivot[0], point[1] - pivot[1], point[2] - pivot[2]];
  const transformed = multiplyMatrixVector(matrix, relative);
  return [transformed[0] + pivot[0], transformed[1] + pivot[1], transformed[2] + pivot[2]];
}

function rotationMatrix(axis: TransformAxis, degrees: number): Matrix3 {
  if (!Number.isFinite(degrees)) throw new Error('Rotation angle must be finite');
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return axis === 0
    ? [
        [1, 0, 0],
        [0, cosine, -sine],
        [0, sine, cosine],
      ]
    : axis === 1
      ? [
          [cosine, 0, sine],
          [0, 1, 0],
          [-sine, 0, cosine],
        ]
      : [
          [cosine, -sine, 0],
          [sine, cosine, 0],
          [0, 0, 1],
        ];
}

function scaleMatrix(factors: Vec3): Matrix3 {
  if (!factors.every(Number.isFinite) || factors.some((factor) => Math.abs(factor) <= 1e-6)) {
    throw new Error('Scale factors must be finite and non-zero');
  }
  return [
    [factors[0], 0, 0],
    [0, factors[1], 0],
    [0, 0, factors[2]],
  ];
}

function shearMatrix(
  sourceAxis: TransformAxis,
  targetAxis: TransformAxis,
  factor: number,
): Matrix3 {
  if (sourceAxis === targetAxis) throw new Error('Shear axes must be different');
  if (!Number.isFinite(factor)) throw new Error('Shear factor must be finite');
  const rows: [[number, number, number], [number, number, number], [number, number, number]] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  rows[targetAxis]![sourceAxis] = factor;
  return rows;
}

function transformProjection(
  projection: TextureProjection,
  matrix: Matrix3,
  pivot: Vec3,
): TextureProjection {
  const covectorTransform = inverseTranspose(matrix);
  const transformAxis = (axis: Vec3, textureScale: number) => {
    const safeScale = Math.abs(textureScale) <= 1e-9 ? 1 : textureScale;
    const originalCovector: Vec3 = [axis[0] / safeScale, axis[1] / safeScale, axis[2] / safeScale];
    const transformedCovector = multiplyMatrixVector(covectorTransform, originalCovector);
    const magnitude = Math.hypot(...transformedCovector);
    if (magnitude <= 1e-9) throw new Error('Brush transform collapsed a texture axis');
    const transformedScale = Math.sign(safeScale) / magnitude;
    const transformedAxis: Vec3 = [
      transformedCovector[0] * transformedScale,
      transformedCovector[1] * transformedScale,
      transformedCovector[2] * transformedScale,
    ];
    const offsetDelta = dot(originalCovector, pivot) - dot(transformedCovector, pivot);
    return { axis: transformedAxis, scale: transformedScale, offsetDelta };
  };
  const u = transformAxis(projection.uAxis, projection.scale[0]);
  const v = transformAxis(projection.vAxis, projection.scale[1]);
  return {
    ...projection,
    uAxis: u.axis,
    vAxis: v.axis,
    offset: [projection.offset[0] + u.offsetDelta, projection.offset[1] + v.offsetDelta],
    scale: [u.scale, v.scale],
  };
}

export function transformBrush(
  brush: MapBrush,
  matrix: Matrix3,
  pivot: Vec3,
  textureLock = true,
): MapBrush {
  if (![...matrix.flat(), ...pivot].every(Number.isFinite)) {
    throw new Error('Brush transform values must be finite');
  }
  const matrixDeterminant = determinant(matrix);
  if (Math.abs(matrixDeterminant) <= 1e-9) throw new Error('Brush transform must be invertible');
  return {
    ...brush,
    revision: brush.revision + 1,
    faces: brush.faces.map((face) => {
      const transformed = face.planePoints.map((point) =>
        transformPoint(point, matrix, pivot),
      ) as unknown as readonly [Vec3, Vec3, Vec3];
      const planePoints: readonly [Vec3, Vec3, Vec3] =
        matrixDeterminant < 0 ? [transformed[0], transformed[2], transformed[1]] : transformed;
      return {
        ...face,
        planePoints,
        projection: textureLock
          ? transformProjection(face.projection, matrix, pivot)
          : face.projection,
      };
    }),
  };
}

export function rotateBrush(
  brush: MapBrush,
  pivot: Vec3,
  axis: TransformAxis,
  degrees: number,
  textureLock = true,
): MapBrush {
  return transformBrush(brush, rotationMatrix(axis, degrees), pivot, textureLock);
}

export function scaleBrush(
  brush: MapBrush,
  pivot: Vec3,
  factors: Vec3,
  textureLock = true,
): MapBrush {
  return transformBrush(brush, scaleMatrix(factors), pivot, textureLock);
}

export function flipBrush(
  brush: MapBrush,
  pivot: Vec3,
  axis: TransformAxis,
  textureLock = true,
): MapBrush {
  const factors: [number, number, number] = [1, 1, 1];
  factors[axis] = -1;
  return scaleBrush(brush, pivot, factors, textureLock);
}

export function shearBrush(
  brush: MapBrush,
  pivot: Vec3,
  sourceAxis: TransformAxis,
  targetAxis: TransformAxis,
  factor: number,
  textureLock = true,
): MapBrush {
  return transformBrush(brush, shearMatrix(sourceAxis, targetAxis, factor), pivot, textureLock);
}

interface VertexHullPoint {
  readonly point: Vec3;
  readonly sourcePoints: readonly Vec3[];
}

interface VertexHullPlane {
  readonly normal: Vec3;
  readonly distance: number;
  readonly points: readonly [VertexHullPoint, VertexHullPoint, VertexHullPoint];
  readonly support: readonly VertexHullPoint[];
}

function samePoint(left: Vec3, right: Vec3): boolean {
  return distanceSquared(left, right) <= GEOMETRY_EPSILON * GEOMETRY_EPSILON;
}

function uniqueHullPoints(points: readonly VertexHullPoint[]): VertexHullPoint[] {
  const result: VertexHullPoint[] = [];
  for (const point of points) {
    const existing = result.find((candidate) => samePoint(candidate.point, point.point));
    if (!existing) {
      result.push(point);
      continue;
    }
    const index = result.indexOf(existing);
    result[index] = {
      point: existing.point,
      sourcePoints: [...existing.sourcePoints, ...point.sourcePoints].filter(
        (source, sourceIndex, all) =>
          all.findIndex((candidate) => samePoint(candidate, source)) === sourceIndex,
      ),
    };
  }
  return result;
}

function convexHullPlanes(points: readonly VertexHullPoint[]): VertexHullPlane[] {
  const planes: VertexHullPlane[] = [];
  for (let first = 0; first < points.length - 2; first += 1) {
    for (let second = first + 1; second < points.length - 1; second += 1) {
      for (let third = second + 1; third < points.length; third += 1) {
        const a = points[first]!;
        let b = points[second]!;
        let c = points[third]!;
        let plane = planeFromPoints([a.point, b.point, c.point]);
        if (!plane) continue;
        const distances = points.map((point) => dot(plane!.normal, point.point) - plane!.distance);
        if (distances.every((distance) => distance >= -GEOMETRY_EPSILON)) {
          [b, c] = [c, b];
          plane = {
            normal: [-plane.normal[0], -plane.normal[1], -plane.normal[2]],
            distance: -plane.distance,
          };
        } else if (!distances.every((distance) => distance <= GEOMETRY_EPSILON)) {
          continue;
        }
        if (
          planes.some(
            (candidate) =>
              dot(candidate.normal, plane.normal) >= 1 - 1e-7 &&
              Math.abs(candidate.distance - plane.distance) <= GEOMETRY_EPSILON * 4,
          )
        ) {
          continue;
        }
        const support = points.filter(
          (point) =>
            Math.abs(dot(plane.normal, point.point) - plane.distance) <= GEOMETRY_EPSILON * 4,
        );
        if (support.length < 3) continue;
        planes.push({ normal: plane.normal, distance: plane.distance, points: [a, b, c], support });
      }
    }
  }
  return planes;
}

function projectionFromLockedVertices(
  source: MapFace,
  normal: Vec3,
  points: readonly [VertexHullPoint, VertexHullPoint, VertexHullPoint],
): TextureProjection {
  const sourcePlane = planeFromPoints(source.planePoints);
  const sourcePoint = (point: VertexHullPoint): Vec3 =>
    point.sourcePoints.toSorted((left, right) => {
      if (!sourcePlane) return 0;
      const leftDistance = Math.abs(dot(sourcePlane.normal, left) - sourcePlane.distance);
      const rightDistance = Math.abs(dot(sourcePlane.normal, right) - sourcePlane.distance);
      return leftDistance - rightDistance;
    })[0] ?? point.point;
  const uv = points.map((point) =>
    textureCoordinates(source, sourcePoint(point)),
  ) as unknown as readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  const edge1 = subtract(points[1].point, points[0].point);
  const edge2 = subtract(points[2].point, points[0].point);
  const firstFirst = dot(edge1, edge1);
  const firstSecond = dot(edge1, edge2);
  const secondSecond = dot(edge2, edge2);
  const gramDeterminant = firstFirst * secondSecond - firstSecond * firstSecond;
  if (Math.abs(gramDeterminant) <= 1e-9) return source.projection;
  const fit = (coordinate: 0 | 1, fallbackAxis: Vec3, fallbackScale: number) => {
    const firstDelta = uv[1][coordinate] - uv[0][coordinate];
    const secondDelta = uv[2][coordinate] - uv[0][coordinate];
    const firstWeight = (firstDelta * secondSecond - secondDelta * firstSecond) / gramDeterminant;
    const secondWeight = (secondDelta * firstFirst - firstDelta * firstSecond) / gramDeterminant;
    const covector: Vec3 = [
      edge1[0] * firstWeight + edge2[0] * secondWeight,
      edge1[1] * firstWeight + edge2[1] * secondWeight,
      edge1[2] * firstWeight + edge2[2] * secondWeight,
    ];
    const tangentCovector: Vec3 = [
      covector[0] - normal[0] * dot(covector, normal),
      covector[1] - normal[1] * dot(covector, normal),
      covector[2] - normal[2] * dot(covector, normal),
    ];
    const magnitude = Math.hypot(...tangentCovector);
    if (magnitude <= 1e-9) {
      const safeScale = Math.abs(fallbackScale) <= 1e-9 ? 1 : fallbackScale;
      const fallbackCovector: Vec3 = [
        fallbackAxis[0] / safeScale,
        fallbackAxis[1] / safeScale,
        fallbackAxis[2] / safeScale,
      ];
      return {
        axis: fallbackAxis,
        scale: safeScale,
        offset: uv[0][coordinate] - dot(fallbackCovector, points[0].point),
      };
    }
    const axis: Vec3 = [
      tangentCovector[0] / magnitude,
      tangentCovector[1] / magnitude,
      tangentCovector[2] / magnitude,
    ];
    return {
      axis,
      scale: 1 / magnitude,
      offset: uv[0][coordinate] - dot(tangentCovector, points[0].point),
    };
  };
  const u = fit(0, source.projection.uAxis, source.projection.scale[0]);
  const v = fit(1, source.projection.vAxis, source.projection.scale[1]);
  return {
    ...source.projection,
    uAxis: u.axis,
    vAxis: v.axis,
    offset: [u.offset, v.offset],
    scale: [u.scale, v.scale],
  };
}

function rebuildBrushFromHullPoints(
  brush: MapBrush,
  points: readonly VertexHullPoint[],
  ids: IdFactory,
  textureLock: boolean,
): MapBrush {
  const hullPoints = uniqueHullPoints(points);
  if (hullPoints.length < 4) throw new Error('Vertex edit would collapse the brush');
  const hull = convexHullPlanes(hullPoints);
  if (hull.length < 4) throw new Error('Vertex edit would collapse the brush');
  const sourceFaces = brush.faces.map((face) => {
    const plane = planeFromPoints(face.planePoints);
    return { face, plane };
  });
  const sourceFor = (hullPlane: VertexHullPlane) =>
    sourceFaces
      .map(({ face, plane }) => {
        const shared = plane
          ? hullPlane.support.filter((point) =>
              point.sourcePoints.some(
                (source) =>
                  Math.abs(dot(plane.normal, source) - plane.distance) <= GEOMETRY_EPSILON * 4,
              ),
            ).length
          : 0;
        const alignment = plane ? dot(hullPlane.normal, plane.normal) : -1;
        const exact =
          plane &&
          alignment >= 1 - 1e-7 &&
          Math.abs(hullPlane.distance - plane.distance) <= GEOMETRY_EPSILON * 4;
        return {
          face,
          exact: Boolean(exact),
          score: (exact ? 10_000 : 0) + shared * 100 + alignment,
        };
      })
      .toSorted((left, right) => right.score - left.score)[0]!;
  const assignments = hull.map((plane) => ({ plane, source: sourceFor(plane) }));
  const usedIds = new Set<FaceId>(
    assignments
      .filter((assignment) => assignment.source.exact)
      .map((assignment) => assignment.source.face.id),
  );
  const faces = assignments.map<MapFace>(({ plane, source }) => {
    const keepSourceId = source.exact || !usedIds.has(source.face.id);
    if (keepSourceId) usedIds.add(source.face.id);
    return Object.assign({}, source.face, {
      id: keepSourceId ? source.face.id : ids.face(),
      planePoints: plane.points.map((point) => point.point) as unknown as readonly [
        Vec3,
        Vec3,
        Vec3,
      ],
      projection: textureLock
        ? projectionFromLockedVertices(source.face, plane.normal, plane.points)
        : source.face.projection,
    });
  });
  return { ...brush, revision: brush.revision + 1, faces };
}

/**
 * Moves derived brush corners and rebuilds their convex hull. Supporting planes are regenerated so
 * an edited corner can split formerly planar faces instead of creating a concave or open brush.
 */
export function moveBrushVertices(
  brush: MapBrush,
  vertices: readonly Vec3[],
  delta: Vec3,
  ids: IdFactory,
  textureLock = true,
): MapBrush {
  if (![...vertices.flat(), ...delta].every(Number.isFinite)) {
    throw new Error('Vertex move values must be finite');
  }
  if (vertices.length === 0) throw new Error('Select at least one brush vertex to move');
  return rebuildBrushFromHullPoints(
    brush,
    brushVertices(brush).map<VertexHullPoint>((point) => ({
      point: vertices.some((selected) => samePoint(selected, point))
        ? [point[0] + delta[0], point[1] + delta[1], point[2] + delta[2]]
        : point,
      sourcePoints: [point],
    })),
    ids,
    textureLock,
  );
}

function transformBrushVertexSelection(
  brush: MapBrush,
  vertices: readonly Vec3[],
  matrix: Matrix3,
  pivot: Vec3,
  ids: IdFactory,
  textureLock: boolean,
): MapBrush {
  if (![...vertices.flat(), ...matrix.flat(), ...pivot].every(Number.isFinite)) {
    throw new Error('Vertex transform values must be finite');
  }
  if (vertices.length === 0) throw new Error('Select at least one brush vertex to transform');
  if (Math.abs(determinant(matrix)) <= 1e-9) throw new Error('Vertex transform must be invertible');
  return rebuildBrushFromHullPoints(
    brush,
    brushVertices(brush).map<VertexHullPoint>((point) => ({
      point: vertices.some((selected) => samePoint(selected, point))
        ? transformPoint(point, matrix, pivot)
        : point,
      sourcePoints: [point],
    })),
    ids,
    textureLock,
  );
}

export function rotateBrushVertices(
  brush: MapBrush,
  vertices: readonly Vec3[],
  pivot: Vec3,
  axis: TransformAxis,
  degrees: number,
  ids: IdFactory,
  textureLock = true,
): MapBrush {
  return transformBrushVertexSelection(
    brush,
    vertices,
    rotationMatrix(axis, degrees),
    pivot,
    ids,
    textureLock,
  );
}

export function scaleBrushVertices(
  brush: MapBrush,
  vertices: readonly Vec3[],
  pivot: Vec3,
  factors: Vec3,
  ids: IdFactory,
  textureLock = true,
): MapBrush {
  return transformBrushVertexSelection(
    brush,
    vertices,
    scaleMatrix(factors),
    pivot,
    ids,
    textureLock,
  );
}

export function shearBrushVertices(
  brush: MapBrush,
  vertices: readonly Vec3[],
  pivot: Vec3,
  sourceAxis: TransformAxis,
  targetAxis: TransformAxis,
  factor: number,
  ids: IdFactory,
  textureLock = true,
): MapBrush {
  return transformBrushVertexSelection(
    brush,
    vertices,
    shearMatrix(sourceAxis, targetAxis, factor),
    pivot,
    ids,
    textureLock,
  );
}

/** Adds one derived corner and rebuilds the brush as the convex hull containing it. */
export function addBrushVertex(
  brush: MapBrush,
  vertex: Vec3,
  sourcePoint: Vec3,
  ids: IdFactory,
  textureLock = true,
): MapBrush {
  if (![...vertex, ...sourcePoint].every(Number.isFinite)) {
    throw new Error('Vertex insertion values must be finite');
  }
  const sourceVertices = brushVertices(brush);
  if (sourceVertices.some((point) => samePoint(point, vertex))) {
    throw new Error('The new vertex coincides with an existing brush vertex');
  }
  const rebuilt = rebuildBrushFromHullPoints(
    brush,
    [
      ...sourceVertices.map<VertexHullPoint>((point) => ({ point, sourcePoints: [point] })),
      { point: vertex, sourcePoints: [sourcePoint] },
    ],
    ids,
    textureLock,
  );
  if (!brushVertices(rebuilt).some((point) => samePoint(point, vertex))) {
    throw new Error('The new vertex must extend the brush hull');
  }
  return rebuilt;
}

/** Removes derived corners and rebuilds the remaining points as one validated convex hull. */
export function deleteBrushVertices(
  brush: MapBrush,
  vertices: readonly Vec3[],
  ids: IdFactory,
  textureLock = true,
): MapBrush {
  if (!vertices.flat().every(Number.isFinite)) throw new Error('Vertex positions must be finite');
  if (vertices.length === 0) throw new Error('Select at least one brush vertex to delete');
  const sourceVertices = brushVertices(brush);
  const remaining = sourceVertices.filter(
    (point) => !vertices.some((selected) => samePoint(selected, point)),
  );
  if (remaining.length === sourceVertices.length) {
    throw new Error('The selected vertices do not belong to this brush');
  }
  return rebuildBrushFromHullPoints(
    brush,
    remaining.map((point) => ({ point, sourcePoints: [point] })),
    ids,
    textureLock,
  );
}

export function moveBrushFace(brush: MapBrush, faceId: FaceId, distance: number): MapBrush {
  if (!Number.isFinite(distance)) throw new Error('Face extrusion distance must be finite');
  const target = brush.faces.find((face) => face.id === faceId);
  if (!target) throw new Error(`Unknown face ${faceId} on brush ${brush.id}`);
  const plane = planeFromPoints(target.planePoints);
  if (!plane) throw new Error(`Cannot move the degenerate face ${faceId}`);
  const delta: Vec3 = [
    plane.normal[0] * distance,
    plane.normal[1] * distance,
    plane.normal[2] * distance,
  ];
  return {
    ...brush,
    revision: brush.revision + 1,
    faces: brush.faces.map((face) =>
      face.id === faceId
        ? {
            ...face,
            planePoints: face.planePoints.map(
              (point) => [point[0] + delta[0], point[1] + delta[1], point[2] + delta[2]] as Vec3,
            ) as unknown as readonly [Vec3, Vec3, Vec3],
          }
        : face,
    ),
  };
}

function copyFaceAttributes(brush: MapBrush, faceId: FaceId, source: MapFace): MapBrush {
  return {
    ...brush,
    faces: brush.faces.map((face) =>
      face.id === faceId
        ? {
            ...face,
            material: source.material,
            projection: source.projection,
            surface: source.surface,
          }
        : face,
    ),
  };
}

/**
 * Splits a face drag into two adjacent convex brushes. Outward movement adds a slab to the original
 * volume; inward movement partitions the original volume at the destination plane.
 */
export function splitBrushFace(
  brush: MapBrush,
  faceId: FaceId,
  distance: number,
  ids: IdFactory,
): readonly [MapBrush, MapBrush] {
  if (!Number.isFinite(distance) || Math.abs(distance) <= Number.EPSILON) {
    throw new Error('Face split distance must be finite and non-zero');
  }
  const sourceFace = brush.faces.find((face) => face.id === faceId);
  if (!sourceFace) throw new Error(`Unknown face ${faceId} on brush ${brush.id}`);
  const moved = moveBrushFace(brush, faceId, distance);
  const movedFace = moved.faces.find((face) => face.id === faceId)!;
  const volume = distance > 0 ? moved : brush;
  const splitPlane = distance > 0 ? sourceFace.planePoints : movedFace.planePoints;
  const backFaceId = ids.face();
  const back = clipBrush(volume, splitPlane, 'back', backFaceId, sourceFace.material);
  const frontSource = cloneBrush(volume, ids);
  const frontFaceId = ids.face();
  const front = clipBrush(frontSource, splitPlane, 'front', frontFaceId, sourceFace.material);
  if (!back || !front || back === volume || front === frontSource) {
    throw new Error('Face split did not produce two three-dimensional brushes');
  }
  const attributedBack = copyFaceAttributes(back, backFaceId, sourceFace);
  const attributedFront = copyFaceAttributes(front, frontFaceId, sourceFace);
  for (const piece of [attributedBack, attributedFront]) {
    const derived = deriveBrush(piece);
    if (!derived.valid) {
      throw new Error(
        `Face split would create an invalid brush: ${derived.diagnostics
          .map((diagnostic) => diagnostic.message)
          .join('; ')}`,
      );
    }
  }
  return [attributedBack, attributedFront];
}

export type BrushClipSide = 'front' | 'back';

/** Adds an oriented plane and prunes source planes that no longer bound the clipped convex hull. */
export function clipBrush(
  brush: MapBrush,
  planePoints: readonly [Vec3, Vec3, Vec3],
  side: BrushClipSide,
  faceId: FaceId,
  material = brush.faces[0]?.material ?? 'DEV/CLIP',
): MapBrush | null {
  const orientedPoints: readonly [Vec3, Vec3, Vec3] =
    side === 'back' ? planePoints : [planePoints[0], planePoints[2], planePoints[1]];
  const plane = planeFromPoints(orientedPoints);
  if (!plane) throw new Error('Clip points do not define a plane');
  const duplicate = brush.faces.some((face) => {
    const candidate = planeFromPoints(face.planePoints);
    return (
      candidate &&
      candidate.normal.every((value, axis) => Math.abs(value - plane.normal[axis]!) <= 1e-6) &&
      Math.abs(candidate.distance - plane.distance) <= 0.001
    );
  });
  if (duplicate) return brush;
  const clipFace: MapFace = {
    id: faceId,
    planePoints: orientedPoints,
    material,
    projection: defaultTextureProjection(plane.normal),
    surface: {},
  };
  let result: MapBrush = {
    ...brush,
    revision: brush.revision + 1,
    faces: [...brush.faces, clipFace],
  };
  let derived = deriveBrush(result);
  if (derived.diagnostics.some((diagnostic) => diagnostic.code === 'empty-brush')) return null;
  const unused = new Set(
    derived.diagnostics
      .filter((diagnostic) => diagnostic.code === 'open-face' && diagnostic.faceId)
      .map((diagnostic) => diagnostic.faceId!),
  );
  if (unused.has(faceId)) return brush;
  if (unused.size > 0) {
    result = { ...result, faces: result.faces.filter((face) => !unused.has(face.id)) };
    derived = deriveBrush(result);
  }
  if (!derived.valid) {
    throw new Error(
      `Clip plane would create an invalid brush: ${derived.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join('; ')}`,
    );
  }
  return result;
}

function sameGeometricPlane(left: Plane, right: Plane): boolean {
  const alignment = dot(left.normal, right.normal);
  return alignment >= 1 - 1e-7
    ? Math.abs(left.distance - right.distance) <= GEOMETRY_EPSILON * 4
    : alignment <= -1 + 1e-7
      ? Math.abs(left.distance + right.distance) <= GEOMETRY_EPSILON * 4
      : false;
}

function csgFaceForPlane(
  plane: Plane,
  sources: readonly MapBrush[],
  ids: IdFactory,
  planePoints: readonly [Vec3, Vec3, Vec3],
  currentMaterial: string,
): MapFace {
  const source = sources
    .flatMap((brush) => brush.faces)
    .find((face) => {
      const candidate = planeFromPoints(face.planePoints);
      return candidate ? sameGeometricPlane(plane, candidate) : false;
    });
  return source
    ? {
        ...source,
        id: ids.face(),
        planePoints,
        projection: {
          ...source.projection,
          uAxis: [...source.projection.uAxis] as Vec3,
          vAxis: [...source.projection.vAxis] as Vec3,
          offset: [...source.projection.offset] as readonly [number, number],
          scale: [...source.projection.scale] as readonly [number, number],
        },
        surface: { ...source.surface },
      }
    : {
        id: ids.face(),
        planePoints,
        material: currentMaterial,
        projection: defaultTextureProjection(plane.normal),
        surface: {},
      };
}

function assertCsgBrush(brush: MapBrush, operation: string): MapBrush {
  const derived = deriveBrush(brush);
  if (!derived.valid) {
    throw new Error(
      `${operation} would create an invalid brush: ${derived.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join('; ')}`,
    );
  }
  return brush;
}

/** Computes the smallest convex brush containing every input brush vertex. */
export function convexMergeBrushes(
  brushes: readonly MapBrush[],
  ids: IdFactory,
  currentMaterial = brushes[0]?.faces[0]?.material ?? 'DEV/CSG',
): MapBrush {
  if (brushes.length < 2) throw new Error('Convex merge requires at least two brushes');
  const points = uniqueHullPoints(
    brushes.flatMap((brush) =>
      brushVertices(brush).map<VertexHullPoint>((point) => ({ point, sourcePoints: [point] })),
    ),
  );
  const hull = convexHullPlanes(points);
  if (hull.length < 4) throw new Error('Convex merge requires a three-dimensional hull');
  return assertCsgBrush(
    {
      id: ids.brush(),
      revision: 0,
      faces: hull.map((candidate) =>
        csgFaceForPlane(
          { normal: candidate.normal, distance: candidate.distance },
          brushes,
          ids,
          candidate.points.map((point) => point.point) as unknown as readonly [Vec3, Vec3, Vec3],
          currentMaterial,
        ),
      ),
    },
    'Convex merge',
  );
}

/** Creates a new convex brush from an arbitrary point cloud using one current material. */
export function createConvexHullBrush(
  points: readonly Vec3[],
  material: string,
  ids: IdFactory = createSequentialIdFactory('hull'),
): MapBrush {
  if (!points.flat().every(Number.isFinite)) throw new Error('Hull points must be finite');
  const normalizedMaterial = material.trim();
  if (!normalizedMaterial) throw new Error('Hull brushes require a material');
  const hullPoints = uniqueHullPoints(
    points.map<VertexHullPoint>((point) => ({ point, sourcePoints: [point] })),
  );
  if (hullPoints.length < 4) throw new Error('A hull brush requires at least four unique points');
  const hull = convexHullPlanes(hullPoints);
  if (hull.length < 4) throw new Error('Hull points must enclose a three-dimensional volume');
  return assertCsgBrush(
    {
      id: ids.brush(),
      revision: 0,
      faces: hull.map<MapFace>((candidate) => ({
        id: ids.face(),
        planePoints: candidate.points.map((point) => point.point) as unknown as readonly [
          Vec3,
          Vec3,
          Vec3,
        ],
        material: normalizedMaterial,
        projection: defaultTextureProjection(candidate.normal),
        surface: {},
      })),
    },
    'Hull creation',
  );
}

function clipBrushByFace(
  brush: MapBrush,
  sourceFace: MapFace,
  side: BrushClipSide,
  ids: IdFactory,
): MapBrush | null {
  const faceId = ids.face();
  const clipped = clipBrush(brush, sourceFace.planePoints, side, faceId, sourceFace.material);
  return clipped && clipped !== brush ? copyFaceAttributes(clipped, faceId, sourceFace) : clipped;
}

/** Computes the common convex volume of all inputs, or null when it has no solid volume. */
export function intersectBrushes(brushes: readonly MapBrush[], ids: IdFactory): MapBrush | null {
  if (brushes.length < 2) throw new Error('CSG intersection requires at least two brushes');
  let result: MapBrush | null = cloneBrush(brushes[0]!, ids);
  for (const brush of brushes.slice(1)) {
    for (const face of brush.faces) {
      if (!result) return null;
      const plane = planeFromPoints(face.planePoints);
      if (!plane) throw new Error(`Cannot intersect degenerate face ${face.id}`);
      const distances = brushVertices(result).map(
        (point) => dot(plane.normal, point) - plane.distance,
      );
      if (distances.every((distance) => distance >= -GEOMETRY_EPSILON)) return null;
      if (distances.every((distance) => distance <= GEOMETRY_EPSILON)) continue;
      try {
        result = clipBrushByFace(result, face, 'back', ids);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Clip plane would create')) {
          return null;
        }
        throw error;
      }
      if (!result) return null;
    }
  }
  return assertCsgBrush({ ...result, revision: 0 }, 'CSG intersection');
}

/**
 * Subtracts one convex brush from another. Concave results are represented as a non-overlapping
 * sequence of convex fragments cut by the subtrahend's face planes. The original brush is returned
 * unchanged when the two solid volumes do not overlap.
 */
export function subtractBrush(
  minuend: MapBrush,
  subtrahend: MapBrush,
  ids: IdFactory,
): readonly MapBrush[] {
  if (!intersectBrushes([minuend, subtrahend], ids)) return [minuend];
  let remainder: MapBrush | null = cloneBrush(minuend, ids);
  const fragments: MapBrush[] = [];
  for (const face of subtrahend.faces) {
    if (!remainder) break;
    const outsideSource = cloneBrush(remainder, ids);
    const outside = clipBrushByFace(outsideSource, face, 'front', ids);
    const inside = clipBrushByFace(remainder, face, 'back', ids);
    if (outside && outside !== outsideSource) {
      fragments.push(assertCsgBrush({ ...outside, revision: 0 }, 'CSG subtraction'));
    }
    remainder = inside;
  }
  return fragments;
}

/** Hollows a convex brush by subtracting an inward offset copy from it. */
export function hollowBrush(
  brush: MapBrush,
  thickness: number,
  ids: IdFactory,
): readonly MapBrush[] {
  if (!Number.isFinite(thickness) || thickness <= 0) {
    throw new Error('Hollow wall thickness must be a positive finite number');
  }
  const inner: MapBrush = {
    id: ids.brush(),
    revision: 0,
    faces: brush.faces.map((face) => {
      const plane = planeFromPoints(face.planePoints);
      if (!plane) throw new Error(`Cannot hollow degenerate face ${face.id}`);
      const delta = scale(plane.normal, -thickness);
      return {
        ...face,
        id: ids.face(),
        planePoints: face.planePoints.map((point) => add(point, delta)) as unknown as readonly [
          Vec3,
          Vec3,
          Vec3,
        ],
      };
    }),
  };
  assertCsgBrush(inner, 'CSG hollow');
  return subtractBrush(brush, inner, ids);
}

export function setBrushMaterial(brush: MapBrush, material: string, faceId?: FaceId): MapBrush {
  return setBrushFaceMaterials(brush, material, faceId ? [faceId] : undefined);
}

export function setBrushFaceMaterials(
  brush: MapBrush,
  material: string,
  faceIds?: readonly FaceId[],
): MapBrush {
  const normalized = material.trim();
  if (normalized.length === 0 || /\s/.test(normalized)) {
    throw new Error('A map material name must be a non-empty token without whitespace');
  }
  const selected = faceIds ? new Set(faceIds) : null;
  for (const faceId of selected ?? []) {
    if (!brush.faces.some((face) => face.id === faceId)) {
      throw new Error(`Unknown face ${faceId} on brush ${brush.id}`);
    }
  }
  return {
    ...brush,
    revision: brush.revision + 1,
    faces: brush.faces.map((face) =>
      !selected || selected.has(face.id) ? { ...face, material: normalized } : face,
    ),
  };
}

export interface FaceTextureTransform {
  readonly offset: readonly [number, number];
  readonly rotationDegrees: number;
  readonly scale: readonly [number, number];
}

export interface FaceTextureTransformDelta {
  /** Relative translation in texture-space texels. */
  readonly offset: readonly [number, number];
  /** Relative in-plane rotation around the supplied world-space pivot. */
  readonly rotationDegrees: number;
  /** Multipliers applied to the existing Valve 220 U and V scales. */
  readonly scale: readonly [number, number];
}

export function setFaceTextureTransform(
  brush: MapBrush,
  faceId: FaceId,
  transform: FaceTextureTransform,
): MapBrush {
  const face = brush.faces.find((candidate) => candidate.id === faceId);
  if (!face) throw new Error(`Unknown face ${faceId} on brush ${brush.id}`);
  const values = [...transform.offset, transform.rotationDegrees, ...transform.scale];
  if (!values.every(Number.isFinite)) throw new Error('Texture transform values must be finite');
  if (transform.scale.some((value) => Math.abs(value) <= 1e-6)) {
    throw new Error('Texture scale cannot be zero');
  }
  const plane = planeFromPoints(face.planePoints);
  if (!plane) throw new Error(`Cannot transform the degenerate face ${faceId}`);
  const rotationDelta =
    ((transform.rotationDegrees - face.projection.rotationDegrees) * Math.PI) / 180;
  return {
    ...brush,
    revision: brush.revision + 1,
    faces: brush.faces.map((candidate) =>
      candidate.id === faceId
        ? {
            ...candidate,
            projection: {
              ...candidate.projection,
              uAxis: rotateAroundAxis(candidate.projection.uAxis, plane.normal, rotationDelta),
              vAxis: rotateAroundAxis(candidate.projection.vAxis, plane.normal, rotationDelta),
              offset: transform.offset,
              rotationDegrees: transform.rotationDegrees,
              scale: transform.scale,
            },
          }
        : candidate,
    ),
  };
}

/** Applies a relative Valve 220 transform while preserving the pivot's UV coordinates. */
export function transformFaceTexture(
  brush: MapBrush,
  faceId: FaceId,
  transform: FaceTextureTransformDelta,
  pivot: Vec3,
): MapBrush {
  const face = brush.faces.find((candidate) => candidate.id === faceId);
  if (!face) throw new Error(`Unknown face ${faceId} on brush ${brush.id}`);
  const values = [...transform.offset, transform.rotationDegrees, ...transform.scale, ...pivot];
  if (!values.every(Number.isFinite)) throw new Error('Texture transform values must be finite');
  if (transform.scale.some((value) => Math.abs(value) <= 1e-6)) {
    throw new Error('Texture scale multiplier cannot be zero');
  }
  const plane = planeFromPoints(face.planePoints);
  if (!plane) throw new Error(`Cannot transform the degenerate face ${faceId}`);
  const angle = (transform.rotationDegrees * Math.PI) / 180;
  const uAxis = rotateAroundAxis(face.projection.uAxis, plane.normal, angle);
  const vAxis = rotateAroundAxis(face.projection.vAxis, plane.normal, angle);
  const scaleU = face.projection.scale[0] * transform.scale[0];
  const scaleV = face.projection.scale[1] * transform.scale[1];
  if (Math.abs(scaleU) <= 1e-6 || Math.abs(scaleV) <= 1e-6) {
    throw new Error('Texture scale cannot be zero');
  }
  const pivotCoordinates = textureCoordinates(face, pivot);
  const projection: TextureProjection = {
    ...face.projection,
    uAxis,
    vAxis,
    offset: [
      pivotCoordinates[0] + transform.offset[0] - dot(pivot, uAxis) / scaleU,
      pivotCoordinates[1] + transform.offset[1] - dot(pivot, vAxis) / scaleV,
    ],
    rotationDegrees: face.projection.rotationDegrees + transform.rotationDegrees,
    scale: [scaleU, scaleV],
  };
  return {
    ...brush,
    revision: brush.revision + 1,
    faces: brush.faces.map((candidate) =>
      candidate.id === faceId ? { ...candidate, projection } : candidate,
    ),
  };
}

export type FaceTextureAlignmentOperation =
  | 'reset'
  | 'world'
  | 'flip-u'
  | 'flip-v'
  | 'rotate-ccw'
  | 'rotate-cw'
  | 'align-edge'
  | 'justify-u-min'
  | 'justify-u-max'
  | 'justify-v-min'
  | 'justify-v-max'
  | 'fit-u'
  | 'fit-v'
  | 'auto-fit';

export type FaceTextureFitMode = 'repeat' | 'subdivide';

export interface FaceTextureAlignmentOptions {
  /** Texture dimensions in texels; required by justify and fit operations. */
  readonly textureSize?: Vec2;
  /** Per-material dimensions for selections containing several materials. */
  readonly textureSizeForMaterial?: (material: string) => Vec2 | null;
  /** Reverses edge, atlas slot, repeat, or subdivision cycling. */
  readonly direction?: 1 | -1;
  /** Ctrl/Command-style fit mode showing 1/n of a texture instead of n repeats. */
  readonly fitMode?: FaceTextureFitMode;
}

function parallelTextureProjection(normal: Vec3): TextureProjection {
  const fallback = defaultTextureProjection(normal);
  const projectedU: Vec3 = [
    fallback.uAxis[0] - normal[0] * dot(fallback.uAxis, normal),
    fallback.uAxis[1] - normal[1] * dot(fallback.uAxis, normal),
    fallback.uAxis[2] - normal[2] * dot(fallback.uAxis, normal),
  ];
  const uAxis = normalize(projectedU) ?? normalize(cross([0, 0, 1], normal)) ?? [1, 0, 0];
  let vAxis = normalize(cross(normal, uAxis)) ?? [0, 1, 0];
  if (dot(vAxis, fallback.vAxis) < 0) vAxis = [-vAxis[0], -vAxis[1], -vAxis[2]];
  return { uAxis, vAxis, offset: [0, 0], rotationDegrees: 0, scale: [1, 1] };
}

interface TextureBounds {
  readonly min: Vec2;
  readonly max: Vec2;
}

function textureBounds(
  face: MapFace,
  vertices: readonly Vec3[],
  projection: TextureProjection,
): TextureBounds {
  const projectedFace = { ...face, projection };
  const coordinates = vertices.map((vertex) => textureCoordinates(projectedFace, vertex));
  return {
    min: [
      Math.min(...coordinates.map((coordinate) => coordinate[0])),
      Math.min(...coordinates.map((coordinate) => coordinate[1])),
    ],
    max: [
      Math.max(...coordinates.map((coordinate) => coordinate[0])),
      Math.max(...coordinates.map((coordinate) => coordinate[1])),
    ],
  };
}

function faceCenter(vertices: readonly Vec3[]): Vec3 {
  return scale(
    vertices.reduce<Vec3>((sum, vertex) => add(sum, vertex), [0, 0, 0]),
    1 / vertices.length,
  );
}

function rotateProjectionOnFace(
  face: MapFace,
  vertices: readonly Vec3[],
  normal: Vec3,
  projection: TextureProjection,
  angle: number,
): TextureProjection {
  const center = faceCenter(vertices);
  const centerCoordinates = textureCoordinates({ ...face, projection }, center);
  const uAxis = rotateAroundAxis(projection.uAxis, normal, angle);
  const vAxis = rotateAroundAxis(projection.vAxis, normal, angle);
  const scaleU = Math.abs(projection.scale[0]) <= Number.EPSILON ? 1 : projection.scale[0];
  const scaleV = Math.abs(projection.scale[1]) <= Number.EPSILON ? 1 : projection.scale[1];
  return {
    ...projection,
    uAxis,
    vAxis,
    offset: [
      centerCoordinates[0] - dot(center, uAxis) / scaleU,
      centerCoordinates[1] - dot(center, vAxis) / scaleV,
    ],
    rotationDegrees: projection.rotationDegrees + (angle * 180) / Math.PI,
  };
}

function edgeAlignmentAngle(
  vertices: readonly Vec3[],
  normal: Vec3,
  projection: TextureProjection,
  direction: 1 | -1,
  cycle: boolean,
): number {
  const projectedU = subtract(projection.uAxis, scale(normal, dot(projection.uAxis, normal)));
  const current = normalize(projectedU);
  if (!current) throw new Error('Cannot align a degenerate texture axis');
  const angles: number[] = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const edge = normalize(subtract(vertices[(index + 1) % vertices.length]!, vertices[index]!));
    if (!edge) continue;
    const raw = Math.atan2(dot(normal, cross(current, edge)), dot(current, edge));
    if (!angles.some((candidate) => Math.abs(candidate - raw) <= 1e-6)) angles.push(raw);
  }
  if (angles.length === 0) throw new Error('Cannot align a face without edges');
  if (!cycle) return angles.toSorted((left, right) => Math.abs(left) - Math.abs(right))[0]!;
  const directed = angles.map((angle) => {
    if (direction > 0) return angle > 1e-6 ? angle : angle + Math.PI * 2;
    return angle < -1e-6 ? angle : angle - Math.PI * 2;
  });
  return directed.toSorted((left, right) => Math.abs(left) - Math.abs(right))[0]!;
}

function requireTextureSize(face: MapFace, options: FaceTextureAlignmentOptions): Vec2 {
  const size = options.textureSize ?? options.textureSizeForMaterial?.(face.material);
  if (!size || size.some((component) => !Number.isFinite(component) || component <= 0)) {
    throw new Error(`Texture dimensions for ${face.material} are required for this operation`);
  }
  return size;
}

function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}

function justifyProjection(
  face: MapFace,
  vertices: readonly Vec3[],
  projection: TextureProjection,
  axis: 0 | 1,
  side: 'min' | 'max',
  textureDimension: number,
  direction: 1 | -1,
): TextureProjection {
  const bounds = textureBounds(face, vertices, projection);
  const span = bounds.max[axis] - bounds.min[axis];
  const current = bounds[side][axis];
  let target = side === 'min' ? 0 : textureDimension;
  const slotCount = Math.max(1, Math.round(textureDimension / span));
  if (
    slotCount > 1 &&
    Number.isFinite(span) &&
    span > Number.EPSILON &&
    Math.abs(slotCount * span - textureDimension) <= 1e-5
  ) {
    const targets = Array.from({ length: slotCount }, (_, index) =>
      side === 'min' ? index * span : textureDimension - index * span,
    );
    const currentIndex = targets.findIndex((candidate) => Math.abs(candidate - current) <= 1e-5);
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : targets.length - 1
        : wrapIndex(currentIndex + direction, targets.length);
    target = targets[nextIndex]!;
  }
  const offset = [...projection.offset] as [number, number];
  offset[axis] += target - current;
  return { ...projection, offset };
}

function fitProjectionToSpan(
  face: MapFace,
  vertices: readonly Vec3[],
  projection: TextureProjection,
  axis: 0 | 1,
  targetTexelSpan: number,
  textureDimension: number,
  anchorToMinimum = false,
): TextureProjection {
  const sourceAxis = axis === 0 ? projection.uAxis : projection.vAxis;
  const projected = vertices.map((vertex) => dot(vertex, sourceAxis));
  const worldSpan = Math.max(...projected) - Math.min(...projected);
  if (!Number.isFinite(worldSpan) || worldSpan <= Number.EPSILON) {
    throw new Error('Cannot fit a degenerate face texture axis');
  }
  const oldBounds = textureBounds(face, vertices, projection);
  const sign = projection.scale[axis] < 0 ? -1 : 1;
  const scaleValue = (sign * worldSpan) / targetTexelSpan;
  const nextScale = [...projection.scale] as [number, number];
  nextScale[axis] = scaleValue;
  const scaled: TextureProjection = { ...projection, scale: nextScale };
  const nextBounds = textureBounds(face, vertices, scaled);
  const offset = [...scaled.offset] as [number, number];
  if (anchorToMinimum) {
    offset[axis] -= nextBounds.min[axis];
  } else {
    const minimumAnchor = Math.round(oldBounds.min[axis] / textureDimension) * textureDimension;
    const maximumAnchor = Math.round(oldBounds.max[axis] / textureDimension) * textureDimension;
    const useMinimum =
      Math.abs(oldBounds.min[axis] - minimumAnchor) <=
      Math.abs(oldBounds.max[axis] - maximumAnchor);
    offset[axis] += useMinimum
      ? minimumAnchor - nextBounds.min[axis]
      : maximumAnchor - nextBounds.max[axis];
  }
  return { ...scaled, offset };
}

function fitProjection(
  face: MapFace,
  vertices: readonly Vec3[],
  projection: TextureProjection,
  axis: 0 | 1,
  textureDimension: number,
  options: FaceTextureAlignmentOptions,
): TextureProjection {
  const bounds = textureBounds(face, vertices, projection);
  const ratio = (bounds.max[axis] - bounds.min[axis]) / textureDimension;
  const direction = options.direction ?? 1;
  if (options.fitMode === 'subdivide') {
    const current = ratio > Number.EPSILON && ratio <= 1 + 1e-5 ? Math.round(1 / ratio) : 0;
    const count = Math.max(
      1,
      current > 0 && Math.abs(1 / ratio - current) <= 1e-5 ? current + direction : 1,
    );
    return fitProjectionToSpan(
      face,
      vertices,
      projection,
      axis,
      textureDimension / count,
      textureDimension,
    );
  }
  const current = ratio >= 1 - 1e-5 ? Math.round(ratio) : 0;
  const count = Math.max(
    1,
    current > 0 && Math.abs(ratio - current) <= 1e-5 ? current + direction : 1,
  );
  return fitProjectionToSpan(
    face,
    vertices,
    projection,
    axis,
    textureDimension * count,
    textureDimension,
  );
}

export function alignFaceTexture(
  brush: MapBrush,
  faceId: FaceId,
  operation: FaceTextureAlignmentOperation,
  options: FaceTextureAlignmentOptions = {},
): MapBrush {
  const face = brush.faces.find((candidate) => candidate.id === faceId);
  if (!face) throw new Error(`Unknown face ${faceId} on brush ${brush.id}`);
  const plane = planeFromPoints(face.planePoints);
  if (!plane) throw new Error(`Cannot align the degenerate face ${faceId}`);
  let projection: TextureProjection;
  if (operation === 'reset') projection = parallelTextureProjection(plane.normal);
  else if (operation === 'world') projection = defaultTextureProjection(plane.normal);
  else if (operation === 'flip-u' || operation === 'flip-v') {
    projection = {
      ...face.projection,
      scale:
        operation === 'flip-u'
          ? [-face.projection.scale[0], face.projection.scale[1]]
          : [face.projection.scale[0], -face.projection.scale[1]],
    };
  } else if (operation === 'rotate-ccw' || operation === 'rotate-cw') {
    const delta = operation === 'rotate-ccw' ? Math.PI / 2 : -Math.PI / 2;
    projection = {
      ...face.projection,
      uAxis: rotateAroundAxis(face.projection.uAxis, plane.normal, delta),
      vAxis: rotateAroundAxis(face.projection.vAxis, plane.normal, delta),
      rotationDegrees: face.projection.rotationDegrees + (operation === 'rotate-ccw' ? 90 : -90),
    };
  } else {
    const vertices = deriveBrush(brush).faces.find(
      (candidate) => candidate.faceId === faceId,
    )?.vertices;
    if (!vertices || vertices.length < 3)
      throw new Error(`Cannot align the invalid face ${faceId}`);
    if (operation === 'align-edge') {
      const angle = edgeAlignmentAngle(
        vertices,
        plane.normal,
        face.projection,
        options.direction ?? 1,
        true,
      );
      projection = rotateProjectionOnFace(face, vertices, plane.normal, face.projection, angle);
    } else {
      const textureSize = requireTextureSize(face, options);
      if (operation.startsWith('justify-')) {
        const axis = operation.includes('-u-') ? 0 : 1;
        projection = justifyProjection(
          face,
          vertices,
          face.projection,
          axis,
          operation.endsWith('-min') ? 'min' : 'max',
          textureSize[axis],
          options.direction ?? 1,
        );
      } else if (operation === 'fit-u' || operation === 'fit-v') {
        const axis = operation === 'fit-u' ? 0 : 1;
        projection = fitProjection(
          face,
          vertices,
          face.projection,
          axis,
          textureSize[axis],
          options,
        );
      } else {
        const angle = edgeAlignmentAngle(
          vertices,
          plane.normal,
          face.projection,
          options.direction ?? 1,
          false,
        );
        projection = rotateProjectionOnFace(face, vertices, plane.normal, face.projection, angle);
        projection = fitProjectionToSpan(
          face,
          vertices,
          projection,
          0,
          textureSize[0],
          textureSize[0],
          true,
        );
        projection = fitProjectionToSpan(
          face,
          vertices,
          projection,
          1,
          textureSize[1],
          textureSize[1],
          true,
        );
      }
    }
  }
  return {
    ...brush,
    revision: brush.revision + 1,
    faces: brush.faces.map((candidate) =>
      candidate.id === faceId ? { ...candidate, projection } : candidate,
    ),
  };
}

export type FaceAttributeTransferMode = 'project' | 'rotate' | 'material';

/** The authored face data needed for material and projection transfer; runtime IDs are irrelevant. */
export type FaceAttributeSource = Pick<
  MapFace,
  'planePoints' | 'material' | 'projection' | 'surface'
>;

function rotatedProjectionOntoFace(
  source: FaceAttributeSource,
  target: MapFace,
): TextureProjection {
  const sourcePlane = planeFromPoints(source.planePoints);
  const targetPlane = planeFromPoints(target.planePoints);
  if (!sourcePlane || !targetPlane) throw new Error('Cannot transfer from a degenerate face');
  const alignment = Math.max(-1, Math.min(1, dot(sourcePlane.normal, targetPlane.normal)));
  let axis = normalize(cross(sourcePlane.normal, targetPlane.normal));
  let angle = Math.acos(alignment);
  if (!axis) {
    if (alignment >= 0) {
      axis = source.projection.uAxis;
      angle = 0;
    } else {
      axis = normalize(source.projection.uAxis) ?? [1, 0, 0];
      angle = Math.PI;
    }
  }
  return {
    ...source.projection,
    uAxis: rotateAroundAxis(source.projection.uAxis, axis, angle),
    vAxis: rotateAroundAxis(source.projection.vAxis, axis, angle),
    offset: [...source.projection.offset] as readonly [number, number],
    scale: [...source.projection.scale] as readonly [number, number],
  };
}

/** Transfers material and optional Valve 220 face attributes while preserving target contents. */
export function transferFaceAttributes(
  brush: MapBrush,
  faceId: FaceId,
  source: FaceAttributeSource,
  mode: FaceAttributeTransferMode,
): MapBrush {
  const target = brush.faces.find((face) => face.id === faceId);
  if (!target) throw new Error(`Unknown face ${faceId} on brush ${brush.id}`);
  const { contents: _sourceContents, ...sourceSurface } = source.surface;
  const targetContents =
    target.surface.contents === undefined ? {} : { contents: target.surface.contents };
  const projection =
    mode === 'material'
      ? target.projection
      : mode === 'rotate'
        ? rotatedProjectionOntoFace(source, target)
        : {
            ...source.projection,
            uAxis: [...source.projection.uAxis] as Vec3,
            vAxis: [...source.projection.vAxis] as Vec3,
            offset: [...source.projection.offset] as readonly [number, number],
            scale: [...source.projection.scale] as readonly [number, number],
          };
  return {
    ...brush,
    revision: brush.revision + 1,
    faces: brush.faces.map((face) =>
      face.id === faceId
        ? {
            ...face,
            material: source.material,
            projection,
            surface: mode === 'material' ? face.surface : { ...sourceSurface, ...targetContents },
          }
        : face,
    ),
  };
}

export type { BrushId, FaceId };
