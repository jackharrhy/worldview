import { describe, expect, it } from 'vitest';
import { decodeMipTexture, parseWad } from '@jackharrhy/worldview/core';

import {
  addBrushVertex,
  alignFaceTexture,
  EditorSession,
  EditorMaterialCatalog,
  MapCompileCoordinator,
  RemoteMapCompiler,
  brushesInDocument,
  brushVertices,
  clipBrush,
  convexMergeBrushes,
  createBoxBrush,
  createObjectClipboardDocument,
  createObjectSelection,
  createBrushSelection,
  createFaceSelection,
  createConvexHullBrush,
  createSequentialIdFactory,
  createSimpleShapeBrushes,
  createStarterDocument,
  compiledBspVersion,
  FACE_ATTRIBUTE_CLIPBOARD_HEADER,
  DEFAULT_SIMPLE_SHAPE_OPTIONS,
  deleteBrushVertices,
  deriveBrush,
  deriveEditorIssues,
  deriveEditorGroups,
  deriveEditorLayers,
  deriveEntityLinks,
  documentWithoutOmittedLayers,
  editorGroupForObject,
  encodeQuakeWad2,
  entityClassFiltersInDocument,
  extrudableBrushFaces,
  findBrush,
  hollowBrush,
  intersectBrushes,
  intersectBrushRay,
  isEditorGroupEntity,
  isEditorLayerEntity,
  matchingBrushFaces,
  materialUsageInDocument,
  moveBrushFace,
  moveBrushVertices,
  objectClipboardPasteOffset,
  parseFaceAttributeClipboard,
  parseMap,
  formatEntityOrigin,
  flipPointEntity,
  intersectPointEntityRay,
  parseEntityOrigin,
  pointEntityBounds,
  pointEntityYawDegrees,
  protectedEntityProperties,
  projectedFaceGridSegments,
  querySelectionBrushes,
  rotateBrush,
  rotatePointEntity,
  scaleBrush,
  serializeFaceAttributeClipboard,
  serializeMap,
  serializeObjectClipboard,
  selectMapBuildProfile,
  selectMapLaunchProfile,
  supportsCompiledBspPreview,
  selectedBrushIds,
  selectedEntityIdsForLinks,
  selectedEditorGroup,
  selectedFaceReferences,
  selectedPointEntityIds,
  selectionForEditorGroup,
  setBrushFaceMaterials,
  shearBrush,
  splitBrushFace,
  stampBrushFace,
  subtractBrush,
  sweepBrushFace,
  textureCoordinates,
  transformFaceTexture,
  transferFaceAttributes,
  translateBrush,
  visibleEntityLinks,
  type MapCompileResult,
  type MapCompiler,
  type MapBrush,
  type MapDocument,
  type FaceId,
  type SimpleShapeOptions,
} from '../src/core/index.js';

function simpleShapeOptions(overrides: Partial<SimpleShapeOptions>): SimpleShapeOptions {
  return { ...DEFAULT_SIMPLE_SHAPE_OPTIONS, ...overrides };
}

function withTestFace(
  brush: MapBrush,
  faceId: FaceId,
  replacement: MapBrush['faces'][number],
): MapBrush {
  const faces = [...brush.faces];
  const index = faces.findIndex((face) => face.id === faceId);
  if (index < 0) throw new Error(`Unknown test face ${faceId}`);
  faces[index] = replacement;
  return { ...brush, faces };
}

function selectionQueryFixture() {
  const ids = createSequentialIdFactory('selection-query');
  const starter = createStarterDocument();
  const query = createBoxBrush([-64, -64, -32], [64, 64, 96], 'SELECTOR', ids);
  const inside = createBoxBrush([-16, -16, 0], [16, 16, 32], 'INSIDE', ids);
  const crossing = createBoxBrush([48, -16, 0], [80, 16, 32], 'CROSSING', ids);
  const outside = createBoxBrush([112, -16, 0], [144, 16, 32], 'OUTSIDE', ids);
  const elevated = createBoxBrush([-16, 24, 160], [16, 48, 192], 'ELEVATED', ids);
  const marker = {
    id: ids.entity(),
    properties: { classname: 'info_target', origin: '0 -32 16' },
    primitives: [],
  };
  const remoteMarker = {
    id: ids.entity(),
    properties: { classname: 'info_target', origin: '160 0 16' },
    primitives: [],
  };
  const document: MapDocument = {
    ...starter,
    entities: [
      {
        ...starter.entities[0]!,
        primitives: [query, inside, crossing, outside, elevated],
      },
      marker,
      remoteMarker,
    ],
  };
  return { document, query, inside, crossing, outside, elevated, marker, remoteMarker };
}

function layerFixture() {
  const ids = createSequentialIdFactory('layers');
  const starter = createStarterDocument();
  const defaultBrush = createBoxBrush([-96, -32, 0], [-64, 32, 32], 'DEFAULT', ids);
  const layerBrush = createBoxBrush([-32, -32, 0], [0, 32, 32], 'LAYER', ids);
  const detailBrush = createBoxBrush([32, -32, 0], [64, 32, 32], 'DETAIL', ids);
  const groupBrush = createBoxBrush([80, -32, 0], [112, 32, 32], 'GROUP', ids);
  const nestedBrush = createBoxBrush([128, -32, 0], [160, 32, 32], 'NESTED', ids);
  const layerEntity = {
    id: ids.entity(),
    properties: {
      classname: 'func_group',
      _tb_type: '_tb_layer',
      _tb_name: 'Architecture',
      _tb_id: '7',
      _tb_layer_sort_index: '3',
    },
    primitives: [layerBrush],
  };
  const detail = {
    id: ids.entity(),
    properties: { classname: 'func_detail', _tb_layer: '7' },
    primitives: [detailBrush],
  };
  const marker = {
    id: ids.entity(),
    properties: { classname: 'info_target', origin: '0 96 16', _tb_layer: '7' },
    primitives: [],
  };
  const rootGroup = {
    id: ids.entity(),
    properties: {
      classname: 'func_group',
      _tb_type: '_tb_group',
      _tb_name: 'Assembly',
      _tb_id: '8',
      _tb_layer: '7',
    },
    primitives: [groupBrush],
  };
  const nestedGroup = {
    id: ids.entity(),
    properties: {
      classname: 'func_group',
      _tb_type: '_tb_group',
      _tb_name: 'Nested',
      _tb_id: '9',
      _tb_group: '8',
    },
    primitives: [nestedBrush],
  };
  const groupedMarker = {
    id: ids.entity(),
    properties: { classname: 'light', origin: '144 0 48', _tb_group: '9' },
    primitives: [],
  };
  const document: MapDocument = {
    ...starter,
    entities: [
      { ...starter.entities[0]!, primitives: [defaultBrush] },
      layerEntity,
      detail,
      marker,
      rootGroup,
      nestedGroup,
      groupedMarker,
    ],
  };
  return {
    document,
    ids,
    defaultBrush,
    layerBrush,
    detailBrush,
    groupBrush,
    nestedBrush,
    layerEntity,
    detail,
    marker,
    rootGroup,
    nestedGroup,
    groupedMarker,
  };
}

function repetitionFixture() {
  const ids = createSequentialIdFactory('repeat-source');
  const starter = createStarterDocument();
  const first = createBoxBrush([0, 0, 0], [16, 16, 16], 'STEP', ids);
  const second = createBoxBrush([128, 0, 0], [144, 16, 16], 'OTHER', ids);
  const document: MapDocument = {
    ...starter,
    entities: [
      { ...starter.entities[0]!, primitives: [first, second] },
      ...starter.entities.slice(1),
    ],
  };
  return { document, first, second };
}

function issueFixture() {
  const ids = createSequentialIdFactory('issues');
  const starter = createStarterDocument();
  const valid = createBoxBrush([-64, -32, 0], [-32, 32, 32], 'VALID', ids);
  const sourceInvalid = createBoxBrush([32, -32, 0], [64, 32, 32], 'INVALID', ids);
  const invalid = { ...sourceInvalid, faces: sourceInvalid.faces.slice(0, 3) };
  const invalidOrigin = {
    id: ids.entity(),
    properties: { classname: 'light', origin: 'not a vector' },
    primitives: [],
  };
  const missingOrigin = {
    id: ids.entity(),
    properties: { classname: 'info_target' },
    primitives: [],
  };
  const unresolved = {
    id: ids.entity(),
    properties: { classname: 'trigger_once', origin: '96 0 16', target: 'missing_door' },
    primitives: [],
  };
  const emptyBrushEntity = {
    id: ids.entity(),
    properties: { classname: 'func_door' },
    primitives: [],
  };
  const emptyGroup = {
    id: ids.entity(),
    properties: {
      classname: 'func_group',
      _tb_type: '_tb_group',
      _tb_name: 'Empty Room',
      _tb_id: '7',
    },
    primitives: [],
  };
  const document: MapDocument = {
    ...starter,
    entities: [
      { ...starter.entities[0]!, primitives: [valid, invalid] },
      invalidOrigin,
      missingOrigin,
      unresolved,
      emptyBrushEntity,
      emptyGroup,
    ],
  };
  return { document, invalid, invalidOrigin, missingOrigin, unresolved };
}

function viewFilterFixture() {
  const ids = createSequentialIdFactory('view-filters');
  const starter = createStarterDocument();
  const world = createBoxBrush([-96, -32, 0], [-64, 32, 32], 'STONE', ids);
  const detail = createBoxBrush([-32, -32, 0], [0, 32, 32], 'DETAIL', ids);
  const trigger = createBoxBrush([32, -32, 0], [64, 32, 32], 'TRIGGER', ids);
  const clip = createBoxBrush([96, -32, 0], [128, 32, 32], 'PLAYERCLIP', ids);
  const detailEntity = {
    id: ids.entity(),
    properties: { classname: 'func_detail' },
    primitives: [detail],
  };
  const triggerEntity = {
    id: ids.entity(),
    properties: { classname: 'trigger_once' },
    primitives: [trigger],
  };
  const clipEntity = {
    id: ids.entity(),
    properties: { classname: 'func_wall' },
    primitives: [clip],
  };
  const light = {
    id: ids.entity(),
    properties: { classname: 'light', origin: '0 96 24' },
    primitives: [],
  };
  const monster = {
    id: ids.entity(),
    properties: { classname: 'monster_army', origin: '96 96 24' },
    primitives: [],
  };
  const document: MapDocument = {
    ...starter,
    entities: [
      { ...starter.entities[0]!, primitives: [world] },
      detailEntity,
      triggerEntity,
      clipEntity,
      light,
      monster,
    ],
  };
  return { document, world, detail, trigger, clip, light, monster };
}

function materialUsageFixture() {
  const ids = createSequentialIdFactory('material-usage');
  const starter = createStarterDocument();
  const firstSource = createBoxBrush([-64, -32, 0], [-32, 32, 32], 'BRICK', ids);
  const first = setBrushFaceMaterials(
    firstSource,
    'METAL',
    firstSource.faces.slice(0, 2).map((face) => face.id),
  );
  const second = createBoxBrush([32, -32, 0], [64, 32, 32], 'brick', ids);
  const document: MapDocument = {
    ...starter,
    entities: [{ ...starter.entities[0]!, primitives: [first, second] }],
  };
  return { document, first, second };
}

function makeTestPalette(): Uint8Array {
  const palette = new Uint8Array(768);
  for (let index = 0; index < 256; index += 1) {
    palette[index * 3] = index;
    palette[index * 3 + 1] = 255 - index;
    palette[index * 3 + 2] = (index * 7) & 255;
  }
  return palette;
}

function makeTestWad(version: 2 | 3, name = 'fixture'): Uint8Array {
  const dimensions = [16, 8, 4, 2];
  const offsets: number[] = [];
  let textureLength = 40;
  for (const dimension of dimensions) {
    offsets.push(textureLength);
    textureLength += dimension * dimension;
  }
  const palette = makeTestPalette();
  const texture = new Uint8Array(textureLength + (version === 3 ? 2 + palette.length : 0));
  const textureView = new DataView(texture.buffer);
  new TextEncoder().encodeInto(name, texture.subarray(0, 16));
  textureView.setUint32(16, 16, true);
  textureView.setUint32(20, 16, true);
  offsets.forEach((offset, index) => textureView.setUint32(24 + index * 4, offset, true));
  for (let index = 40; index < textureLength; index += 1) texture[index] = index & 255;
  if (version === 3) {
    textureView.setUint16(textureLength, 256, true);
    texture.set(palette, textureLength + 2);
  }

  const directoryOffset = 12 + texture.length;
  const wad = new Uint8Array(directoryOffset + 32);
  const wadView = new DataView(wad.buffer);
  new TextEncoder().encodeInto(`WAD${version}`, wad.subarray(0, 4));
  wadView.setUint32(4, 1, true);
  wadView.setUint32(8, directoryOffset, true);
  wad.set(texture, 12);
  wadView.setUint32(directoryOffset, 12, true);
  wadView.setUint32(directoryOffset + 4, texture.length, true);
  wadView.setUint32(directoryOffset + 8, texture.length, true);
  wadView.setUint8(directoryOffset + 12, version === 2 ? 0x44 : 0x43);
  new TextEncoder().encodeInto(name, wad.subarray(directoryOffset + 16, directoryOffset + 32));
  return wad;
}

function dotVectors(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, component, index) => sum + component * right[index]!, 0);
}

function normalizeVector(value: readonly number[]): number[] {
  const magnitude = Math.hypot(...value);
  return value.map((component) => component / magnitude);
}

function averagePoints(points: readonly (readonly number[])[]): number[] {
  return points[0]!.map(
    (_, axis) => points.reduce((sum, point) => sum + point[axis]!, 0) / points.length,
  );
}

function faceTextureBounds(brush: MapBrush, faceId: FaceId) {
  const face = brush.faces.find((candidate) => candidate.id === faceId)!;
  const vertices = deriveBrush(brush).faces.find(
    (candidate) => candidate.faceId === faceId,
  )!.vertices;
  const coordinates = vertices.map((vertex) => textureCoordinates(face, vertex));
  return {
    min: [
      Math.min(...coordinates.map((coordinate) => coordinate[0])),
      Math.min(...coordinates.map((coordinate) => coordinate[1])),
    ] as const,
    max: [
      Math.max(...coordinates.map((coordinate) => coordinate[0])),
      Math.max(...coordinates.map((coordinate) => coordinate[1])),
    ] as const,
  };
}

describe('convex brush derivation', () => {
  it('derives a closed box from its six authoritative face planes', () => {
    const brush = createBoxBrush([-64, -32, -16], [64, 32, 80]);
    const derived = deriveBrush(brush);

    expect(derived.diagnostics).toEqual([]);
    expect(derived.valid).toBe(true);
    expect(derived.bounds).toEqual({ min: [-64, -32, -16], max: [64, 32, 80] });
    expect(derived.faces).toHaveLength(6);
    expect(derived.edges).toHaveLength(12);
    expect(derived.vertices).toHaveLength(36 * 8);
    expect(derived.faces.every((face) => face.vertices.length === 4)).toBe(true);
  });

  it('rejects a brush that cannot enclose a convex volume', () => {
    const complete = createBoxBrush([-16, -16, -16], [16, 16, 16]);
    const incomplete = { ...complete, faces: complete.faces.slice(0, 3) };
    const derived = deriveBrush(incomplete);

    expect(derived.valid).toBe(false);
    expect(derived.diagnostics.map((diagnostic) => diagnostic.code)).toContain('too-few-faces');
    expect(derived.diagnostics.map((diagnostic) => diagnostic.code)).toContain('empty-brush');
  });

  it('picks the first crossed source face rather than the derived triangle mesh', () => {
    const brush = createBoxBrush([-16, -16, -16], [16, 16, 16]);
    const hit = intersectBrushRay(brush, [64, 0, 0], [-1, 0, 0]);

    expect(hit?.distance).toBeCloseTo(48);
    expect(hit?.point).toEqual([16, 0, 0]);
    expect(hit?.faceId).toBe(brush.faces[0]?.id);
  });
});

describe('projected construction grids', () => {
  it('clips world-grid lines to an axis-aligned convex face', () => {
    const ids = createSequentialIdFactory('grid-face');
    const brush = createBoxBrush([-32, -32, 0], [32, 32, 32], 'GRID', ids);
    const top = deriveBrush(brush).faces.find((face) => face.normal[2] > 0.99)!;
    const segments = projectedFaceGridSegments(top, 16);

    expect(segments).toHaveLength(6);
    expect(segments.filter((segment) => segment.major)).toHaveLength(2);
    for (const segment of segments) {
      expect(segment.start[2]).toBeCloseTo(32, 8);
      expect(segment.end[2]).toBeCloseTo(32, 8);
      expect(
        [segment.start[0], segment.start[1], segment.end[0], segment.end[1]].some(
          (coordinate) => Math.abs(coordinate / 16 - Math.round(coordinate / 16)) < 1e-8,
        ),
      ).toBe(true);
    }
  });

  it('keeps every generated endpoint on a sloped source plane', () => {
    const inverseRootTwo = 1 / Math.sqrt(2);
    const face = {
      normal: [-inverseRootTwo, 0, inverseRootTwo] as const,
      distance: 0,
      vertices: [
        [-32, -32, -32],
        [32, -32, 32],
        [32, 32, 32],
        [-32, 32, -32],
      ] as const,
    };
    const segments = projectedFaceGridSegments(face, 16);

    expect(segments).toHaveLength(6);
    for (const point of segments.flatMap((segment) => [segment.start, segment.end])) {
      expect(
        point[0] * face.normal[0] + point[1] * face.normal[1] + point[2] * face.normal[2],
      ).toBeCloseTo(face.distance, 8);
    }
    expect(
      segments.some(
        (segment) =>
          Math.abs(segment.start[0] - segment.end[0]) > 1 &&
          Math.abs(segment.start[2] - segment.end[2]) > 1,
      ),
    ).toBe(true);
  });

  it('coarsens extremely large faces to the requested line budget', () => {
    const face = {
      normal: [0, 0, 1] as const,
      distance: 0,
      vertices: [
        [-4096, -4096, 0],
        [4096, -4096, 0],
        [4096, 4096, 0],
        [-4096, 4096, 0],
      ] as const,
    };
    expect(projectedFaceGridSegments(face, 1, 16).length).toBeLessThanOrEqual(34);
  });
});

describe('sweep brush generation', () => {
  it('fills a straight destination-cap move with ordered convex segments and inherited UVs', () => {
    const ids = createSequentialIdFactory('straight-sweep');
    const source = createBoxBrush([-16, -16, -16], [16, 16, 16], 'SWEEP', ids);
    const face = source.faces[0]!;
    const result = sweepBrushFace(
      source,
      face.id,
      { translation: [64, 0, 0], rotationDegrees: [0, 0, 0], scale: 1 },
      {
        path: 'straight',
        segments: 4,
        iterations: 1,
        snapToInteger: false,
        textureLock: true,
      },
      ids,
    );

    expect(result.brushes).toHaveLength(4);
    expect(result.caps).toHaveLength(5);
    expect(result.brushes.map((brush) => deriveBrush(brush).bounds)).toEqual([
      { min: [16, -16, -16], max: [32, 16, 16] },
      { min: [32, -16, -16], max: [48, 16, 16] },
      { min: [48, -16, -16], max: [64, 16, 16] },
      { min: [64, -16, -16], max: [80, 16, 16] },
    ]);
    expect(result.brushes.every((brush) => deriveBrush(brush).valid)).toBe(true);
    expect(
      result.brushes.every((brush) =>
        brush.faces.every(
          (candidate) =>
            candidate.material === face.material &&
            candidate.projection.offset[0] === face.projection.offset[0],
        ),
      ),
    ).toBe(true);
  });

  it('builds repeated arc and S-bend paths and snaps every generated cap when requested', () => {
    const ids = createSequentialIdFactory('curved-sweep');
    const source = createBoxBrush([-16, -16, -16], [16, 16, 16], 'CURVE', ids);
    const face = source.faces[0]!;
    const arc = sweepBrushFace(
      source,
      face.id,
      { translation: [-16, 16, 0], rotationDegrees: [0, 0, 90], scale: 1 },
      { path: 'arc', segments: 4, iterations: 2, snapToInteger: false, textureLock: true },
      ids,
    );
    expect(arc.brushes).toHaveLength(8);
    expect(arc.brushes.every((brush) => deriveBrush(brush).valid)).toBe(true);
    expect(averagePoints(arc.caps.at(-1)!)).toEqual([-16, 0, 0]);

    const sBend = sweepBrushFace(
      source,
      face.id,
      { translation: [95.25, 47.5, 3.75], rotationDegrees: [0, 0, 0], scale: 0.8 },
      { path: 's-bend', segments: 5, iterations: 1, snapToInteger: true, textureLock: false },
      ids,
    );
    expect(sBend.brushes).toHaveLength(5);
    expect(sBend.brushes.every((brush) => deriveBrush(brush).valid)).toBe(true);
    expect(
      sBend.caps.flat().every((point) => point.every((component) => Number.isInteger(component))),
    ).toBe(true);
  });

  it('previews and commits several source faces with one insertion history transaction', () => {
    const ids = createSequentialIdFactory('multi-face-sweep');
    const left = createBoxBrush([-48, -16, -16], [-16, 16, 16], 'LEFT', ids);
    const right = createBoxBrush([16, -16, -16], [48, 16, 16], 'RIGHT', ids);
    const starter = createStarterDocument();
    const document = {
      ...starter,
      entities: [
        { ...starter.entities[0]!, primitives: [left, right] },
        ...starter.entities.slice(1),
      ],
    };
    const faces = [
      { brushId: left.id, faceId: left.faces[4]!.id },
      { brushId: right.id, faceId: right.faces[4]!.id },
    ];
    const session = new EditorSession(document);
    session.selectFaces(faces);
    const candidate = session.createSweepCandidate(
      faces,
      { translation: [0, 0, 32], rotationDegrees: [0, 0, 15], scale: 1 },
      { path: 'straight', segments: 2, iterations: 2, snapToInteger: false, textureLock: true },
      ids,
    )!;

    expect(candidate.insertions).toHaveLength(8);
    expect(candidate.sourceFaces).toEqual(faces);
    expect(candidate.destinationCaps).toHaveLength(2);
    expect(candidate.destinationCaps.every((cap) => cap.length === 4)).toBe(true);
    expect(brushesInDocument(candidate.document)).toHaveLength(10);
    expect(brushesInDocument(session.document)).toHaveLength(2);
    session.commitBatchCreationCandidate(candidate);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Sweep faces');
    expect(brushesInDocument(session.document)).toHaveLength(10);
    expect(selectedBrushIds(session.selection)).toHaveLength(8);

    expect(session.undo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(2);
    expect(selectedFaceReferences(session.selection)).toEqual(faces);
    expect(session.redo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(10);
    expect(selectedBrushIds(session.selection)).toHaveLength(8);
  });
});

describe('simple shape brush generation', () => {
  const bounds = { min: [-64, -48, 0], max: [64, 48, 96] } as const;

  it('creates axis-aligned cylinders, cones, and integer-grid scalable circles', () => {
    const ids = createSequentialIdFactory('round-shapes');
    const cylinder = createSimpleShapeBrushes(
      bounds,
      'CYLINDER',
      simpleShapeOptions({ kind: 'cylinder', sides: 8, axis: 2 }),
      ids,
    );
    const cone = createSimpleShapeBrushes(
      bounds,
      'CONE',
      simpleShapeOptions({ kind: 'cone', sides: 8, axis: 1, circleMode: 'vertex-aligned' }),
      ids,
    );
    const scalable = createSimpleShapeBrushes(
      bounds,
      'SCALABLE',
      simpleShapeOptions({ kind: 'cylinder', sides: 12, circleMode: 'scalable' }),
      ids,
    );

    expect(cylinder).toHaveLength(1);
    expect(deriveBrush(cylinder[0]!).faces).toHaveLength(10);
    expect(cone).toHaveLength(1);
    expect(deriveBrush(cone[0]!).faces).toHaveLength(9);
    expect([cylinder[0]!, cone[0]!, scalable[0]!].every((brush) => deriveBrush(brush).valid)).toBe(
      true,
    );
    expect(
      brushVertices(scalable[0]!).every((point) =>
        point.every((component) => Math.abs(component - Math.round(component)) <= 1e-6),
      ),
    ).toBe(true);
  });

  it('builds hollow cylinders, stairs, and arches as validated brush batches', () => {
    const ids = createSequentialIdFactory('compound-shapes');
    const hollow = createSimpleShapeBrushes(
      bounds,
      'HOLLOW',
      simpleShapeOptions({ kind: 'cylinder', sides: 8, hollow: true, thickness: 12 }),
      ids,
    );
    const stairs = createSimpleShapeBrushes(
      bounds,
      'STAIRS',
      simpleShapeOptions({ kind: 'stairs', stepHeight: 24, stairDirection: 'negative-y' }),
      ids,
    );
    const arch = createSimpleShapeBrushes(
      bounds,
      'ARCH',
      simpleShapeOptions({ kind: 'arch', axis: 1, sides: 8, thickness: 12 }),
      ids,
    );

    expect(hollow).toHaveLength(8);
    expect(stairs).toHaveLength(4);
    expect(arch).toHaveLength(4);
    expect([...hollow, ...stairs, ...arch].every((brush) => deriveBrush(brush).valid)).toBe(true);
    expect(stairs.map((brush) => deriveBrush(brush).bounds?.max[2])).toEqual([24, 48, 72, 96]);
    expect(deriveBrush(stairs[0]!).bounds?.min[1]).toBe(24);
    expect(deriveBrush(stairs.at(-1)!).bounds?.min[1]).toBe(-48);
  });

  it('fits every round shape mode and construction axis inside the authored bounds', () => {
    const ids = createSequentialIdFactory('shape-axis-matrix');
    const cases = ([0, 1, 2] as const).flatMap((axis) =>
      (['edge-aligned', 'vertex-aligned', 'scalable'] as const).flatMap((circleMode) =>
        (['cylinder', 'cone', 'arch'] as const).map((kind) => ({ axis, circleMode, kind })),
      ),
    );

    for (const { axis, circleMode, kind } of cases) {
      const brushes = createSimpleShapeBrushes(
        bounds,
        'MATRIX',
        simpleShapeOptions({
          kind,
          axis,
          circleMode,
          sides: circleMode === 'scalable' ? 12 : 8,
          thickness: 12,
        }),
        ids,
      );
      expect(brushes.length).toBeGreaterThan(0);
      for (const brush of brushes) {
        const derived = deriveBrush(brush);
        expect(derived.valid).toBe(true);
        derived.bounds?.min.forEach((component, componentAxis) =>
          expect(component).toBeGreaterThanOrEqual(bounds.min[componentAxis]! - 1e-6),
        );
        derived.bounds?.max.forEach((component, componentAxis) =>
          expect(component).toBeLessThanOrEqual(bounds.max[componentAxis]! + 1e-6),
        );
      }
    }
  });

  it('creates UV and subdivided icosahedron spheroids inside non-uniform bounds', () => {
    const ids = createSequentialIdFactory('spheroids');
    const uv = createSimpleShapeBrushes(
      bounds,
      'UV_SPHERE',
      simpleShapeOptions({ kind: 'uv-sphere', sides: 8, rings: 4 }),
      ids,
    )[0]!;
    const ico = createSimpleShapeBrushes(
      bounds,
      'ICO_SPHERE',
      simpleShapeOptions({ kind: 'ico-sphere', accuracy: 2 }),
      ids,
    )[0]!;

    expect(deriveBrush(uv).valid).toBe(true);
    expect(deriveBrush(uv).faces).toHaveLength(40);
    expect(deriveBrush(ico).valid).toBe(true);
    expect(deriveBrush(ico).faces).toHaveLength(80);
    deriveBrush(ico).bounds?.min.forEach((component, axis) =>
      expect(component).toBeCloseTo(bounds.min[axis]!),
    );
    deriveBrush(ico).bounds?.max.forEach((component, axis) =>
      expect(component).toBeCloseTo(bounds.max[axis]!),
    );
  });

  it('previews and commits a compound shape as one selection-restoring history entry', () => {
    const ids = createSequentialIdFactory('shape-session');
    const session = new EditorSession(createStarterDocument());
    const original = session.document.entities[0]!.primitives[0]!;
    session.select({ brushId: original.id });
    const brushes = createSimpleShapeBrushes(
      bounds,
      'STAIRS',
      simpleShapeOptions({ kind: 'stairs', stepHeight: 24 }),
      ids,
    );
    const candidate = session.createBrushesCandidate(brushes, 'Create stairs');

    expect(brushesInDocument(candidate.document)).toHaveLength(7);
    expect(brushesInDocument(session.document)).toHaveLength(3);
    session.commitBatchCreationCandidate(candidate);
    expect(selectedBrushIds(session.selection)).toEqual(brushes.map((brush) => brush.id));
    expect(session.undoLabel).toBe('Create stairs');
    expect(session.undo()).toBe(true);
    expect(session.selection).toEqual({ brushId: original.id });
    expect(session.redo()).toBe(true);
    expect(selectedBrushIds(session.selection)).toEqual(brushes.map((brush) => brush.id));
  });

  it('rejects impossible hollowing, unsupported scalable counts, and excessive UV meshes', () => {
    const ids = createSequentialIdFactory('invalid-shapes');
    expect(() =>
      createSimpleShapeBrushes(
        bounds,
        'INVALID',
        simpleShapeOptions({ kind: 'cylinder', hollow: true, thickness: 128 }),
        ids,
      ),
    ).toThrow(/interior/);
    expect(() =>
      createSimpleShapeBrushes(
        bounds,
        'INVALID',
        simpleShapeOptions({ kind: 'cylinder', sides: 16, circleMode: 'scalable' }),
        ids,
      ),
    ).toThrow(/12, 24, 48, or 96/);
    expect(() =>
      createSimpleShapeBrushes(
        bounds,
        'INVALID',
        simpleShapeOptions({ kind: 'uv-sphere', sides: 48, rings: 8 }),
        ids,
      ),
    ).toThrow(/at most 192 faces/);
  });
});

describe('constructive solid geometry', () => {
  it('convex-merges every input vertex and preserves matching source face materials', () => {
    const ids = createSequentialIdFactory('csg-merge-input');
    const left = createBoxBrush([-32, -16, -16], [0, 16, 16], 'LEFT', ids);
    const right = createBoxBrush([0, -16, -16], [32, 16, 16], 'RIGHT', ids);
    const merged = convexMergeBrushes(
      [left, right],
      createSequentialIdFactory('csg-merge-result'),
      'CURRENT',
    );

    expect(deriveBrush(merged).bounds).toEqual({ min: [-32, -16, -16], max: [32, 16, 16] });
    expect(merged.faces).toHaveLength(6);
    expect(merged.faces.map((face) => face.material)).toContain('LEFT');
    expect(merged.faces.map((face) => face.material)).toContain('RIGHT');
  });

  it('intersects convex inputs and removes a disjoint solid result', () => {
    const ids = createSequentialIdFactory('csg-intersection-input');
    const left = createBoxBrush([-16, -16, -16], [16, 16, 16], 'LEFT', ids);
    const right = createBoxBrush([0, -8, -8], [32, 8, 8], 'RIGHT', ids);
    const disjoint = createBoxBrush([64, 64, 64], [80, 80, 80], 'VOID', ids);
    const touching = createBoxBrush([16, -16, -16], [32, 16, 16], 'TOUCHING', ids);
    const intersection = intersectBrushes(
      [left, right],
      createSequentialIdFactory('csg-intersection-result'),
    );

    expect(intersection).not.toBeNull();
    expect(deriveBrush(intersection!).bounds).toEqual({ min: [0, -8, -8], max: [16, 8, 8] });
    expect(
      intersectBrushes([left, disjoint], createSequentialIdFactory('csg-empty-result')),
    ).toBeNull();
    expect(
      intersectBrushes([left, touching], createSequentialIdFactory('csg-touching-result')),
    ).toBeNull();
  });

  it('represents subtraction and hollow as non-overlapping convex wall fragments', () => {
    const ids = createSequentialIdFactory('csg-subtraction-input');
    const outer = createBoxBrush([-32, -32, -32], [32, 32, 32], 'OUTER', ids);
    const inner = createBoxBrush([-16, -16, -16], [16, 16, 16], 'INNER', ids);
    const fragments = subtractBrush(
      outer,
      inner,
      createSequentialIdFactory('csg-subtraction-result'),
    );
    const walls = hollowBrush(outer, 8, createSequentialIdFactory('csg-hollow-result'));

    expect(fragments).toHaveLength(6);
    expect(fragments.every((fragment) => deriveBrush(fragment).valid)).toBe(true);
    expect(fragments.flatMap((fragment) => fragment.faces.map((face) => face.material))).toContain(
      'INNER',
    );
    expect(walls).toHaveLength(6);
    expect(walls.every((wall) => deriveBrush(wall).valid)).toBe(true);
  });

  it('commits merge and subtraction as atomic selection-aware history entries', () => {
    const ids = createSequentialIdFactory('csg-session-input');
    const target = createBoxBrush([-32, -32, -32], [32, 32, 32], 'TARGET', ids);
    const cutter = createBoxBrush([-8, -8, -48], [8, 8, 48], 'CUTTER', ids);
    const side = createBoxBrush([48, -16, -16], [80, 16, 16], 'SIDE', ids);
    const starter = createStarterDocument();
    const document: MapDocument = {
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [target, cutter, side] }],
    };
    const session = new EditorSession(document);
    session.selectBrush(target.id);
    session.selectBrush(side.id, true);

    expect(session.csgConvexMergeSelected(createSequentialIdFactory('csg-session-merge'))).toBe(
      true,
    );
    expect(brushesInDocument(session.document)).toHaveLength(2);
    expect(selectedBrushIds(session.selection)).toHaveLength(1);
    expect(session.undoLabel).toBe('CSG convex merge');
    expect(session.undo()).toBe(true);
    expect(brushesInDocument(session.document).map((brush) => brush.id)).toEqual([
      target.id,
      cutter.id,
      side.id,
    ]);
    expect(session.redo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(2);

    expect(session.undo()).toBe(true);
    session.selectBrush(cutter.id);
    expect(session.csgSubtractSelected(createSequentialIdFactory('csg-session-subtract'))).toBe(
      true,
    );
    expect(findBrush(session.document, cutter.id)).toBeNull();
    expect(brushesInDocument(session.document)).toHaveLength(5);
    expect(session.undo()).toBe(true);
    expect(brushesInDocument(session.document).map((brush) => brush.id)).toEqual([
      target.id,
      cutter.id,
      side.id,
    ]);
  });
});

describe('point-defined convex brush creation', () => {
  it('builds the smallest valid hull, discards interior points, and uses the current material', () => {
    const brush = createConvexHullBrush(
      [
        [-16, -16, 0],
        [16, -16, 0],
        [16, 16, 0],
        [-16, 16, 0],
        [-16, -16, 32],
        [16, -16, 32],
        [16, 16, 32],
        [-16, 16, 32],
        [0, 0, 16],
      ],
      'CURRENT',
      createSequentialIdFactory('point-hull'),
    );

    expect(deriveBrush(brush).bounds).toEqual({ min: [-16, -16, 0], max: [16, 16, 32] });
    expect(brush.faces).toHaveLength(6);
    expect(brush.faces.every((face) => face.material === 'CURRENT')).toBe(true);
    expect(brushVertices(brush)).toHaveLength(8);
  });

  it('rejects a point set that does not enclose three-dimensional volume', () => {
    expect(() =>
      createConvexHullBrush(
        [
          [-16, -16, 0],
          [16, -16, 0],
          [16, 16, 0],
          [-16, 16, 0],
        ],
        'CURRENT',
      ),
    ).toThrow(/three-dimensional volume/);
  });
});

describe('Valve 220 source documents', () => {
  it('round trips normalized source without changing derived geometry or projections', () => {
    const original = createStarterDocument();
    const source = serializeMap(original);
    const parsed = parseMap(source, createSequentialIdFactory('roundtrip'));
    const originalBrushes = brushesInDocument(original);
    const parsedBrushes = brushesInDocument(parsed);

    expect(parsed.format).toBe('quake-map');
    expect(parsed.faceSyntax).toBe('valve-220');
    expect(parsed.entities[0]?.properties).toEqual(original.entities[0]?.properties);
    expect(parsedBrushes).toHaveLength(originalBrushes.length);
    for (let index = 0; index < originalBrushes.length; index += 1) {
      expect(deriveBrush(parsedBrushes[index]!).bounds).toEqual(
        deriveBrush(originalBrushes[index]!).bounds,
      );
      expect(parsedBrushes[index]?.faces.map((face) => face.material)).toEqual(
        originalBrushes[index]?.faces.map((face) => face.material),
      );
      expect(parsedBrushes[index]?.faces.map((face) => face.projection)).toEqual(
        originalBrushes[index]?.faces.map((face) => face.projection),
      );
    }
  });

  it('imports classic Quake projection fields into explicit face axes', () => {
    const valve = createStarterDocument();
    const quake = { ...valve, faceSyntax: 'quake' as const };
    const parsed = parseMap(serializeMap(quake));

    expect(parsed.format).toBe('quake-map');
    expect(parsed.faceSyntax).toBe('quake');
    expect(deriveBrush(brushesInDocument(parsed)[0]!).valid).toBe(true);
  });

  it('preserves texel coordinates when a brush is translated with texture lock', () => {
    const brush = createBoxBrush([-16, -16, -16], [16, 16, 16]);
    const originalFace = brush.faces[0]!;
    const originalPoint = originalFace.planePoints[0];
    const moved = translateBrush(brush, [32, -16, 8], true);
    const movedFace = moved.faces[0]!;
    const movedPoint = movedFace.planePoints[0];

    expect(textureCoordinates(movedFace, movedPoint)[0]).toBeCloseTo(
      textureCoordinates(originalFace, originalPoint)[0],
    );
    expect(textureCoordinates(movedFace, movedPoint)[1]).toBeCloseTo(
      textureCoordinates(originalFace, originalPoint)[1],
    );
  });
});

describe('editor material catalog', () => {
  it('imports WAD3 previews and resolves material names case-insensitively', () => {
    const catalog = new EditorMaterialCatalog();
    const result = catalog.importWad('fixture.wad', makeTestWad(3, 'BRICK'));

    expect(result).toMatchObject({ wadVersion: 3, added: 1, replaced: 0, skipped: 0 });
    expect(catalog.find('brick')).toMatchObject({
      name: 'BRICK',
      sourceName: 'fixture.wad',
      width: 16,
      height: 16,
    });
    expect(catalog.find('brick')?.rgba).toHaveLength(16 * 16 * 4);
  });

  it('reports the missing external palette required by WAD2', () => {
    const catalog = new EditorMaterialCatalog();
    const result = catalog.importWad('quake.wad', makeTestWad(2));

    expect(result).toMatchObject({ wadVersion: 2, added: 0, skipped: 1 });
    expect(result.diagnostics[0]?.message).toMatch(/768-byte Quake palette/);
    expect(catalog.size).toBe(0);
  });

  it('encodes generated materials as compiler-ready WAD2 mip textures', () => {
    const palette = makeTestPalette();
    const rgba = new Uint8Array(16 * 16 * 4);
    rgba.fill(255);
    const wad = parseWad(
      encodeQuakeWad2(
        [
          {
            name: 'DEV_TEST',
            sourceName: 'test',
            width: 16,
            height: 16,
            rgba,
            alphaTest: false,
          },
        ],
        palette,
      ),
    );

    expect(wad.version).toBe(2);
    expect(wad.lumps).toHaveLength(1);
    expect(wad.lumps[0]).toMatchObject({ name: 'DEV_TEST', type: 0x44 });
    expect(decodeMipTexture(wad.lumps[0]!.data, palette)).toMatchObject({
      name: 'DEV_TEST',
      width: 16,
      height: 16,
    });
  });
});

describe('compiler coordination', () => {
  it('refuses to install a compile result after the source revision changes', async () => {
    let finish!: (result: MapCompileResult) => void;
    const compiler: MapCompiler = {
      backend: 'wasm',
      compile: () => new Promise((resolve) => (finish = resolve)),
    };
    const session = new EditorSession(createStarterDocument());
    const coordinator = new MapCompileCoordinator(compiler);
    const running = coordinator.compile(
      {
        mapName: 'preview',
        mapText: serializeMap(session.document),
        quality: 'preview',
        expectedDocumentRevision: session.document.revision,
      },
      () => session.document.revision,
    );
    const brush = brushesInDocument(session.document)[1]!;
    session.translate(brush.id, [16, 0, 0]);
    finish({
      backend: 'wasm',
      status: 'succeeded',
      buildId: 'test-build',
      sourceDocumentRevision: 0,
      diagnostics: [],
      artifacts: [],
      logs: [],
      elapsedMilliseconds: 10,
    });

    await expect(running).resolves.toMatchObject({ status: 'stale' });
  });

  it('posts the remote protocol and decodes bounded binary artifacts', async () => {
    let requestBody: unknown;
    const compiler = new RemoteMapCompiler({
      endpoint: 'https://compiler.invalid/compile',
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            status: 'succeeded',
            buildId: 'remote-build',
            sourceDocumentRevision: 7,
            diagnostics: [],
            artifacts: [
              {
                name: 'preview.bsp',
                mediaType: 'application/x-quake-bsp',
                base64: 'AQID',
                kind: 'bsp',
              },
            ],
            logs: [],
            elapsedMilliseconds: 25,
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const result = await compiler.compile({
      mapName: 'preview',
      mapText: '{ }',
      quality: 'preview',
      expectedDocumentRevision: 7,
      assets: [
        {
          name: 'textures.wad',
          mediaType: 'application/x-wad',
          data: new Uint8Array([4, 5, 6]).buffer,
        },
      ],
    });

    expect(requestBody).toMatchObject({
      mapName: 'preview',
      expectedDocumentRevision: 7,
      assets: [{ name: 'textures.wad', base64: 'BAUG' }],
    });
    expect(result.backend).toBe('remote');
    expect([...new Uint8Array(result.artifacts[0]!.data)]).toEqual([1, 2, 3]);
  });

  it('cancels the active compiler request without installing a result', async () => {
    const compiler: MapCompiler = {
      backend: 'remote',
      compile: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })),
            { once: true },
          );
        }),
    };
    const coordinator = new MapCompileCoordinator(compiler);
    const running = coordinator.compile(
      {
        mapName: 'cancelled',
        mapText: '{}',
        quality: 'preview',
        expectedDocumentRevision: 0,
      },
      () => 0,
    );

    coordinator.cancel();

    await expect(running).resolves.toEqual({ status: 'cancelled' });
  });

  it('discovers helper capabilities and launches only a build/profile/revision tuple', async () => {
    const requests: { url: string; body?: unknown; signal?: AbortSignal | null }[] = [];
    const compiler = new RemoteMapCompiler({
      endpoint: 'http://127.0.0.1:8788/compile',
      fetch: async (input, init) => {
        const url = String(input);
        requests.push({
          url,
          ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
          ...(init?.signal === undefined ? {} : { signal: init.signal }),
        });
        if (url.endsWith('/capabilities')) {
          return Response.json({
            protocolVersion: 1,
            compileProfiles: [
              {
                id: 'default',
                label: 'Local tools',
                game: 'quake',
                qualities: ['preview', 'final'],
              },
            ],
            launchProfiles: [{ id: 'quake', label: 'Quake', game: 'quake' }],
          });
        }
        return Response.json({
          buildId: 'build-7',
          profileId: 'quake',
          sourceDocumentRevision: 7,
          launchedAt: 123,
        });
      },
    });
    const controller = new AbortController();

    await expect(compiler.capabilities(controller.signal)).resolves.toMatchObject({
      protocolVersion: 1,
      compileProfiles: [{ id: 'default', game: 'quake' }],
    });
    await expect(
      compiler.launch({
        buildId: 'build-7',
        profileId: 'quake',
        expectedDocumentRevision: 7,
      }),
    ).resolves.toMatchObject({ buildId: 'build-7', sourceDocumentRevision: 7 });
    expect(requests).toEqual([
      expect.objectContaining({
        url: 'http://127.0.0.1:8788/capabilities',
        signal: controller.signal,
      }),
      expect.objectContaining({
        url: 'http://127.0.0.1:8788/launch',
        body: { buildId: 'build-7', profileId: 'quake', expectedDocumentRevision: 7 },
      }),
    ]);
  });

  it('selects compile and launch capabilities only within the active game boundary', () => {
    const capabilities = {
      protocolVersion: 1 as const,
      compileProfiles: [
        { id: 'default', label: 'Quake', game: 'quake' as const, qualities: ['preview'] as const },
        {
          id: 'q2-final',
          label: 'Quake II final',
          game: 'quake2' as const,
          qualities: ['final'] as const,
        },
      ],
      launchProfiles: [
        { id: 'quake', label: 'Quake', game: 'quake' as const },
        { id: 'quake2', label: 'Quake II', game: 'quake2' as const },
      ],
    };

    expect(
      selectMapBuildProfile(capabilities, { game: 'quake2', quality: 'preview' }),
    ).toBeUndefined();
    expect(selectMapBuildProfile(capabilities, { game: 'quake2', quality: 'final' })?.id).toBe(
      'q2-final',
    );
    expect(selectMapLaunchProfile(capabilities, 'quake2')?.id).toBe('quake2');
  });

  it('reads classic and IBSP compiled-map versions without conflating the magic word', () => {
    const classic = new ArrayBuffer(4);
    new DataView(classic).setInt32(0, 29, true);
    const ibsp = new ArrayBuffer(8);
    new DataView(ibsp).setInt32(0, 0x50534249, true);
    new DataView(ibsp).setInt32(4, 38, true);

    expect(compiledBspVersion(classic)).toBe(29);
    expect(compiledBspVersion(ibsp)).toBe(38);
    expect(compiledBspVersion(new ArrayBuffer(3))).toBeNull();
    expect(supportsCompiledBspPreview(classic)).toBe(true);
    expect(supportsCompiledBspPreview(ibsp)).toBe(true);
    new DataView(ibsp).setInt32(4, 46, true);
    expect(supportsCompiledBspPreview(ibsp)).toBe(false);
  });

  it('keeps structured failed-build diagnostics and artifacts available to the editor', async () => {
    const compiler = new RemoteMapCompiler({
      endpoint: 'https://compiler.invalid/compile',
      fetch: async () =>
        Response.json({
          status: 'failed',
          buildId: 'failed-build',
          sourceDocumentRevision: 4,
          diagnostics: [{ severity: 'error', stage: 'qbsp', message: 'MAP LEAKED' }],
          artifacts: [
            {
              name: 'failed.pts',
              mediaType: 'text/plain',
              base64: 'MCAwIDAKMTYgMCAwCg==',
              kind: 'leak-path',
              stage: 'qbsp',
            },
          ],
          logs: [{ stage: 'qbsp', text: 'MAP LEAKED', truncated: false }],
          elapsedMilliseconds: 5,
        }),
    });

    await expect(
      compiler.compile({
        mapName: 'failed',
        mapText: '{}',
        quality: 'preview',
        expectedDocumentRevision: 4,
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [{ severity: 'error', stage: 'qbsp' }],
      artifacts: [{ kind: 'leak-path', stage: 'qbsp' }],
    });
  });
});

describe('editor transactions', () => {
  it('rotates, scales, and shears authoritative planes without texture-lock drift', () => {
    const brush = createBoxBrush([-16, -8, -4], [32, 24, 20]);
    const pivot = [0, 0, 0] as const;
    const originalFace = brush.faces[0]!;
    const originalPoint = originalFace.planePoints[0];

    const rotated = rotateBrush(brush, pivot, 2, 90, true);
    const rotatedPoint = [-originalPoint[1], originalPoint[0], originalPoint[2]] as const;
    expect(deriveBrush(rotated).valid).toBe(true);
    expect(textureCoordinates(rotated.faces[0]!, rotatedPoint)[0]).toBeCloseTo(
      textureCoordinates(originalFace, originalPoint)[0],
    );
    expect(textureCoordinates(rotated.faces[0]!, rotatedPoint)[1]).toBeCloseTo(
      textureCoordinates(originalFace, originalPoint)[1],
    );

    const scaled = scaleBrush(brush, pivot, [2, 0.5, 1.5], true);
    const scaledPoint = [
      originalPoint[0] * 2,
      originalPoint[1] * 0.5,
      originalPoint[2] * 1.5,
    ] as const;
    expect(deriveBrush(scaled).valid).toBe(true);
    expect(textureCoordinates(scaled.faces[0]!, scaledPoint)[0]).toBeCloseTo(
      textureCoordinates(originalFace, originalPoint)[0],
    );
    expect(textureCoordinates(scaled.faces[0]!, scaledPoint)[1]).toBeCloseTo(
      textureCoordinates(originalFace, originalPoint)[1],
    );

    const sheared = shearBrush(brush, pivot, 2, 0, 0.5, true);
    const shearedPoint = [
      originalPoint[0] + originalPoint[2] * 0.5,
      originalPoint[1],
      originalPoint[2],
    ] as const;
    expect(deriveBrush(sheared).valid).toBe(true);
    expect(textureCoordinates(sheared.faces[0]!, shearedPoint)[0]).toBeCloseTo(
      textureCoordinates(originalFace, originalPoint)[0],
    );
    expect(textureCoordinates(sheared.faces[0]!, shearedPoint)[1]).toBeCloseTo(
      textureCoordinates(originalFace, originalPoint)[1],
    );
  });

  it('previews and commits rotate, scale, and shear as individual history entries', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const bounds = deriveBrush(brush).bounds!;
    const center = bounds.min.map((component, axis) => (component + bounds.max[axis]!) / 2) as [
      number,
      number,
      number,
    ];
    const session = new EditorSession(document);
    session.select({ brushId: brush.id });

    const rotation = session.createRotationCandidate(brush.id, center, 2, 45)!;
    expect(session.document).toBe(document);
    expect(findBrush(rotation.document, brush.id)?.faces[0]?.planePoints).not.toEqual(
      brush.faces[0]?.planePoints,
    );
    session.commitCandidate(rotation);
    expect(session.undoLabel).toBe('Rotate brush');
    expect(session.undo()).toBe(true);

    expect(session.scaleSelected(center, [2, 1, 1])).toBe(true);
    expect(session.undoLabel).toBe('Scale brush');
    expect(deriveBrush(findBrush(session.document, brush.id)!).bounds?.min[0]).toBe(-128);
    expect(session.undo()).toBe(true);

    expect(session.shearSelected(bounds.min, 2, 0, 0.5)).toBe(true);
    expect(session.undoLabel).toBe('Shear brush');
    expect(deriveBrush(findBrush(session.document, brush.id)!).bounds?.max[0]).toBeCloseTo(16);
    expect(session.undo()).toBe(true);
    expect(deriveBrush(findBrush(session.document, brush.id)!).bounds).toEqual(bounds);
  });

  it('rebuilds a convex hull when one moved vertex chops formerly planar faces', () => {
    const brush = createBoxBrush([-16, -16, -16], [16, 16, 16]);
    const moved = moveBrushVertices(
      brush,
      [[16, 16, 16]],
      [16, 16, 16],
      createSequentialIdFactory('vertex-hull'),
    );
    const derived = deriveBrush(moved);

    expect(derived.valid).toBe(true);
    expect(derived.faces.length).toBeGreaterThan(6);
    const movedCorner = brushVertices(moved).find((point) =>
      point.every((component) => Math.abs(component - 32) < 0.001),
    );
    expect(movedCorner).toBeDefined();
    for (const component of derived.bounds?.min ?? []) expect(component).toBeCloseTo(-16);
    for (const component of derived.bounds?.max ?? []) expect(component).toBeCloseTo(32);
  });

  it('adds an outward vertex as one undoable convex-hull insertion', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[0]!;
    const sourcePoint = [128, 0, -16] as const;
    const added = addBrushVertex(
      brush,
      [160, 0, -16],
      sourcePoint,
      createSequentialIdFactory('add-vertex'),
    );
    expect(deriveBrush(added).valid).toBe(true);
    expect(
      brushVertices(added).some(
        (point) =>
          Math.abs(point[0] - 160) < 0.001 &&
          Math.abs(point[1]) < 0.001 &&
          Math.abs(point[2] + 16) < 0.001,
      ),
    ).toBe(true);
    expect(added.faces.length).toBeGreaterThan(brush.faces.length);
    const sourceFaceId = intersectBrushRay(brush, [512, 0, -16], [-1, 0, 0])!.faceId;
    const sourceFace = brush.faces.find((face) => face.id === sourceFaceId)!;
    const expectedUv = textureCoordinates(sourceFace, sourcePoint);
    const insertedFaces = deriveBrush(added).faces.filter((face) =>
      face.vertices.some(
        (point) =>
          Math.abs(point[0] - 160) < 0.001 &&
          Math.abs(point[1]) < 0.001 &&
          Math.abs(point[2] + 16) < 0.001,
      ),
    );
    expect(insertedFaces).toHaveLength(4);
    for (const derivedFace of insertedFaces) {
      const face = added.faces.find((candidate) => candidate.id === derivedFace.faceId)!;
      const uv = textureCoordinates(face, [160, 0, -16]);
      expect(uv[0]).toBeCloseTo(expectedUv[0]);
      expect(uv[1]).toBeCloseTo(expectedUv[1]);
    }

    const session = new EditorSession(document);
    session.select({ brushId: brush.id });
    const candidate = session.createVertexInsertionCandidate(
      brush.id,
      sourcePoint,
      [32, 0, 0],
      createSequentialIdFactory('add-candidate'),
    )!;
    session.commitCandidate(candidate);
    expect(session.undoLabel).toBe('Add vertex');
    expect(
      brushVertices(findBrush(session.document, brush.id)!).some(
        (point) =>
          Math.abs(point[0] - 160) < 0.001 &&
          Math.abs(point[1]) < 0.001 &&
          Math.abs(point[2] + 16) < 0.001,
      ),
    ).toBe(true);
    expect(session.undo()).toBe(true);
    expect(
      brushVertices(findBrush(session.document, brush.id)!).some(
        (point) =>
          Math.abs(point[0] - 160) < 0.001 &&
          Math.abs(point[1]) < 0.001 &&
          Math.abs(point[2] + 16) < 0.001,
      ),
    ).toBe(false);
    expect(() =>
      addBrushVertex(brush, [112, 0, -16], sourcePoint, createSequentialIdFactory('add-inside')),
    ).toThrow('extend the brush hull');
  });

  it('fits split-face Valve 220 projections to the pre-move vertex UVs', () => {
    const source = createBoxBrush([-16, -16, -16], [16, 16, 16]);
    const brush = {
      ...source,
      faces: source.faces.map((face, index) =>
        Object.assign({}, face, {
          material: `FACE_${index}`,
          projection: Object.assign({}, face.projection, {
            offset: [index * 3, index * -5] as const,
            scale: [1 + index * 0.1, 0.75 + index * 0.05] as const,
          }),
        }),
      ),
    };
    const moved = moveBrushVertices(
      brush,
      [[16, 16, 16]],
      [16, 16, 16],
      createSequentialIdFactory('vertex-uv-lock'),
      true,
    );

    for (const face of moved.faces) {
      const original = brush.faces.find((candidate) => candidate.material === face.material)!;
      for (const point of face.planePoints) {
        const sourcePoint = point.every((component) => Math.abs(component - 32) < 0.001)
          ? ([16, 16, 16] as const)
          : point;
        const expected = textureCoordinates(original, sourcePoint);
        const actual = textureCoordinates(face, point);
        expect(actual[0]).toBeCloseTo(expected[0]);
        expect(actual[1]).toBeCloseTo(expected[1]);
      }
    }
  });

  it('fuses or removes an inward vertex and moves an edge as one undoable candidate', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const inward = moveBrushVertices(
      brush,
      [[-32, 32, 96]],
      [-32, -32, -48],
      createSequentialIdFactory('vertex-inward'),
    );
    expect(deriveBrush(inward).valid).toBe(true);
    expect(brushVertices(inward)).toHaveLength(7);
    expect(
      brushVertices(inward).some(
        (point) =>
          Math.abs(point[0] + 64) < 0.001 &&
          Math.abs(point[1]) < 0.001 &&
          Math.abs(point[2] - 48) < 0.001,
      ),
    ).toBe(false);

    const session = new EditorSession(document);
    session.select({ brushId: brush.id });
    const edge = [
      [-96, -32, 96],
      [-32, -32, 96],
    ] as const;
    const candidate = session.createVertexMoveCandidate(
      brush.id,
      edge,
      [0, -16, 16],
      createSequentialIdFactory('edge-move'),
      true,
    )!;
    expect(session.document).toBe(document);
    expect(deriveBrush(candidate.after).valid).toBe(true);
    session.commitCandidate(candidate);
    expect(session.undoLabel).toBe('Move vertices');
    expect(
      brushVertices(findBrush(session.document, brush.id)!).some(
        (point) =>
          Math.abs(point[0] + 96) < 0.001 &&
          Math.abs(point[1] + 48) < 0.001 &&
          Math.abs(point[2] - 112) < 0.001,
      ),
    ).toBe(true);
    expect(session.undo()).toBe(true);
    expect(deriveBrush(findBrush(session.document, brush.id)!).bounds?.max[2]).toBe(96);
  });

  it('quick-snaps selected vertices onto an existing corner as one hull-safe edit', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const source = [-32, 32, 96] as const;
    const target = [-32, -32, 96] as const;
    const session = new EditorSession(document);
    session.select({ brushId: brush.id });

    const candidate = session.createVertexSnapCandidate(
      [brush.id],
      [source],
      source,
      target,
      createSequentialIdFactory('vertex-snap'),
      true,
    )!;
    expect(session.document).toBe(document);
    expect(candidate.label).toBe('Snap vertices');
    expect(deriveBrush(findBrush(candidate.document, brush.id)!).valid).toBe(true);
    expect(brushVertices(findBrush(candidate.document, brush.id)!)).toHaveLength(7);

    session.commitCandidate(candidate);
    expect(session.undoLabel).toBe('Snap vertices');
    expect(
      brushVertices(findBrush(session.document, brush.id)!).some((point) =>
        point.every((component, axis) => Math.abs(component - source[axis]!) < 0.001),
      ),
    ).toBe(false);
    expect(session.undo()).toBe(true);
    expect(brushVertices(findBrush(session.document, brush.id)!)).toHaveLength(8);
    expect(() =>
      session.createVertexSnapCandidate(
        [brush.id],
        [source],
        [0, 0, 0],
        target,
        createSequentialIdFactory('vertex-snap-invalid'),
      ),
    ).toThrow('anchor');
  });

  it('deletes selected corners atomically and rejects a collapsed remainder', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const deleted = deleteBrushVertices(
      brush,
      [[-32, 32, 96]],
      createSequentialIdFactory('delete-vertex'),
      true,
    );
    expect(deriveBrush(deleted).valid).toBe(true);
    expect(brushVertices(deleted)).toHaveLength(7);

    const session = new EditorSession(document);
    session.select({ brushId: brush.id });
    const candidate = session.createVertexDeletionCandidate(
      brush.id,
      [[-32, 32, 96]],
      createSequentialIdFactory('delete-candidate'),
    )!;
    session.commitCandidate(candidate);
    expect(session.undoLabel).toBe('Delete vertices');
    expect(brushVertices(findBrush(session.document, brush.id)!)).toHaveLength(7);
    expect(session.undo()).toBe(true);
    expect(brushVertices(findBrush(session.document, brush.id)!)).toHaveLength(8);

    expect(() =>
      session.createVertexDeletionCandidate(
        brush.id,
        [
          [-96, -32, 96],
          [-96, 32, 96],
          [-32, -32, 96],
          [-32, 32, 96],
        ],
        createSequentialIdFactory('delete-collapse'),
      ),
    ).toThrow('collapse');
    expect(session.document.revision).toBe(2);
  });

  it('moves and deletes coincident vertices across selected brushes as one transaction', () => {
    const ids = createSequentialIdFactory('shared-topology');
    const left = createBoxBrush([-32, -32, 0], [0, 32, 32], 'LEFT', ids);
    const right = createBoxBrush([0, -32, 0], [32, 32, 32], 'RIGHT', ids);
    const starter = createStarterDocument();
    const document = {
      ...starter,
      entities: [
        { ...starter.entities[0]!, primitives: [left, right] },
        ...starter.entities.slice(1),
      ],
    };
    const session = new EditorSession(document);
    session.selectBrush(left.id);
    session.selectBrush(right.id, true);
    const sharedVertex = [0, 32, 32] as const;

    const move = session.createBrushSetVertexMoveCandidate(
      selectedBrushIds(session.selection),
      [sharedVertex],
      [0, 0, 16],
      createSequentialIdFactory('shared-move'),
    )!;
    expect(move.label).toBe('Move shared vertices');
    expect(move.document.revision).toBe(1);
    for (const brush of [left, right]) {
      expect(
        brushVertices(findBrush(move.document, brush.id)!).some(
          (point) =>
            Math.abs(point[0]) < 0.001 &&
            Math.abs(point[1] - 32) < 0.001 &&
            Math.abs(point[2] - 48) < 0.001,
        ),
      ).toBe(true);
    }
    session.commitCandidate(move);
    expect(session.undoLabel).toBe('Move shared vertices');
    expect(session.undo()).toBe(true);
    for (const brush of [left, right]) {
      expect(brushVertices(findBrush(session.document, brush.id)!)).toContainEqual(sharedVertex);
    }

    const sharedEdge = [
      [0, -32, 0],
      [0, -32, 32],
    ] as const;
    const edgeMove = session.createBrushSetVertexMoveCandidate(
      selectedBrushIds(session.selection),
      sharedEdge,
      [0, -16, 0],
      createSequentialIdFactory('shared-edge-move'),
    )!;
    session.commitCandidate(edgeMove);
    expect(edgeMove.label).toBe('Move shared vertices');
    expect(deriveBrush(findBrush(session.document, left.id)!).bounds?.min[1]).toBe(-48);
    expect(deriveBrush(findBrush(session.document, right.id)!).bounds?.min[1]).toBe(-48);
    expect(session.undo()).toBe(true);

    expect(
      session.deleteSelectedVertices([sharedVertex], createSequentialIdFactory('shared-delete')),
    ).toBe(true);
    expect(session.undoLabel).toBe('Delete shared vertices');
    expect(session.document.revision).toBe(5);
    expect(brushVertices(findBrush(session.document, left.id)!)).toHaveLength(7);
    expect(brushVertices(findBrush(session.document, right.id)!)).toHaveLength(7);
    expect(session.undo()).toBe(true);
    expect(brushVertices(findBrush(session.document, left.id)!)).toHaveLength(8);
    expect(brushVertices(findBrush(session.document, right.id)!)).toHaveLength(8);
  });

  it('clips a convex brush to either oriented half-space and prunes obsolete planes', () => {
    const brush = createBoxBrush([-16, -16, -16], [16, 16, 16]);
    const plane = [
      [0, 0, 0],
      [0, 0, 16],
      [0, 16, 0],
    ] as const;
    const ids = createSequentialIdFactory('clip-halves');
    const back = clipBrush(brush, plane, 'back', ids.face())!;
    const front = clipBrush(brush, plane, 'front', ids.face())!;

    expect(deriveBrush(back).bounds).toEqual({ min: [-16, -16, -16], max: [0, 16, 16] });
    expect(deriveBrush(front).bounds).toEqual({ min: [0, -16, -16], max: [16, 16, 16] });
    expect(deriveBrush(back).valid).toBe(true);
    expect(deriveBrush(front).valid).toBe(true);
  });

  it('previews, commits, undoes, and redoes a split brush as one transaction', () => {
    const document = createStarterDocument();
    const source = brushesInDocument(document)[1]!;
    const bounds = deriveBrush(source).bounds!;
    const x = (bounds.min[0] + bounds.max[0]) / 2;
    const plane = [
      [x, 0, 0],
      [x, 0, 16],
      [x, 16, 0],
    ] as const;
    const session = new EditorSession(document);
    const candidate = session.createClipCandidate(
      source.id,
      plane,
      'split',
      createSequentialIdFactory('clip-split'),
    )!;

    expect(candidate.after).toHaveLength(2);
    expect(deriveBrush(candidate.after[0]!).bounds?.max[0]).toBe(x);
    expect(deriveBrush(candidate.after[1]!).bounds?.min[0]).toBe(x);
    expect(brushesInDocument(candidate.document)).toHaveLength(4);
    expect(brushesInDocument(session.document)).toHaveLength(3);

    session.commitClipCandidate(candidate);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Split brush');
    expect(brushesInDocument(session.document)).toHaveLength(4);
    expect(session.undo()).toBe(true);
    expect(session.document.revision).toBe(2);
    expect(brushesInDocument(session.document)).toHaveLength(3);
    expect(deriveBrush(findBrush(session.document, source.id)!).bounds).toEqual(bounds);
    expect(session.redo()).toBe(true);
    expect(session.document.revision).toBe(3);
    expect(brushesInDocument(session.document)).toHaveLength(4);
  });

  it('splits several selected brushes with one plane and one history transaction', () => {
    const document = createStarterDocument();
    const [, left, right] = brushesInDocument(document);
    const session = new EditorSession(document);
    session.selectBrush(left!.id);
    session.selectBrush(right!.id, true);
    const plane = [
      [0, 0, 0],
      [16, 0, 0],
      [0, 0, 16],
    ] as const;
    const candidate = session.createBrushSetClipCandidate(
      selectedBrushIds(session.selection),
      plane,
      'split',
      createSequentialIdFactory('clip-set-split'),
    )!;

    expect('edits' in candidate && candidate.edits).toHaveLength(2);
    expect(candidate.label).toBe('Split brushes');
    expect(brushesInDocument(candidate.document)).toHaveLength(5);
    session.commitClipCandidate(candidate);
    expect(session.document.revision).toBe(1);
    expect(brushesInDocument(session.document)).toHaveLength(5);
    expect(selectedBrushIds(session.selection)).toHaveLength(2);
    expect(session.undoLabel).toBe('Split brushes');

    expect(session.undo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(3);
    expect(selectedBrushIds(session.selection)).toEqual([left!.id, right!.id]);
    expect(session.redo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(5);
    expect(selectedBrushIds(session.selection)).toHaveLength(2);
  });

  it('preserves unaffected selection members when a set clip removes another brush', () => {
    const document = createStarterDocument();
    const [, left, right] = brushesInDocument(document);
    const session = new EditorSession(document);
    session.selectBrush(left!.id);
    session.selectBrush(right!.id, true);
    const plane = [
      [0, 0, 0],
      [0, 0, 16],
      [0, 16, 0],
    ] as const;
    const candidate = session.createBrushSetClipCandidate(
      selectedBrushIds(session.selection),
      plane,
      'back',
      createSequentialIdFactory('clip-set-delete'),
    )!;

    expect('edits' in candidate && candidate.edits).toHaveLength(1);
    if (!('edits' in candidate)) throw new Error('Expected a batch clip candidate');
    const remainingId = candidate.selectionAfter[0]!;
    session.commitClipCandidate(candidate);
    expect(brushesInDocument(session.document)).toHaveLength(2);
    expect(selectedBrushIds(session.selection)).toEqual([remainingId]);
    expect(session.undo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(3);
    expect(selectedBrushIds(session.selection)).toEqual([left!.id, right!.id]);
    expect(session.redo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(2);
    expect(selectedBrushIds(session.selection)).toEqual([remainingId]);
  });

  it('toggles additive face selections and expands one brush to all of its faces', () => {
    const document = createStarterDocument();
    const [floor, pillar] = brushesInDocument(document);
    const floorFace = floor!.faces[4]!;
    const pillarFace = pillar!.faces[4]!;
    const session = new EditorSession(document);

    session.selectFace({ brushId: floor!.id, faceId: floorFace.id });
    session.selectFace({ brushId: pillar!.id, faceId: pillarFace.id }, true);
    expect(selectedFaceReferences(session.selection)).toEqual([
      { brushId: floor!.id, faceId: floorFace.id },
      { brushId: pillar!.id, faceId: pillarFace.id },
    ]);
    expect(session.selection).toMatchObject({ brushId: pillar!.id, faceId: pillarFace.id });

    session.selectFace({ brushId: floor!.id, faceId: floorFace.id }, true);
    expect(selectedFaceReferences(session.selection)).toEqual([
      { brushId: pillar!.id, faceId: pillarFace.id },
    ]);

    session.selectBrushFaces(floor!.id);
    expect(selectedFaceReferences(session.selection)).toHaveLength(6);
    expect(
      selectedFaceReferences(session.selection).every((face) => face.brushId === floor!.id),
    ).toBe(true);
  });

  it('toggles mixed face lasso contents while Shift ensures every enclosed face is selected', () => {
    const document = createStarterDocument();
    const [floor, pillar] = brushesInDocument(document);
    const first = { brushId: floor!.id, faceId: floor!.faces[0]!.id };
    const second = { brushId: floor!.id, faceId: floor!.faces[1]!.id };
    const third = { brushId: pillar!.id, faceId: pillar!.faces[0]!.id };
    const session = new EditorSession(document);
    session.selectFaces([first, second]);

    session.selectFacesWithLasso([second, third]);
    expect(selectedFaceReferences(session.selection)).toEqual([first, third]);

    session.selectFacesWithLasso([second, third], true);
    expect(selectedFaceReferences(session.selection)).toEqual([first, third, second]);

    session.selectFacesWithLasso([first, third, second]);
    expect(session.selection).toBeNull();
  });

  it('normalizes additive object selection and moves the set in one history step', () => {
    const document = createStarterDocument();
    const [, left, right] = brushesInDocument(document);
    const session = new EditorSession(document);

    session.selectBrush(left!.id);
    session.selectBrush(right!.id, true);
    expect(selectedBrushIds(session.selection)).toEqual([left!.id, right!.id]);
    expect(session.selection).toMatchObject({ brushId: right!.id });

    expect(session.translateSelected([0, 32, 0])).toBe(true);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Move brushes');
    expect(deriveBrush(findBrush(session.document, left!.id)!).bounds?.min[1]).toBe(0);
    expect(deriveBrush(findBrush(session.document, right!.id)!).bounds?.min[1]).toBe(0);

    expect(session.undo()).toBe(true);
    expect(deriveBrush(findBrush(session.document, left!.id)!).bounds?.min[1]).toBe(-32);
    expect(deriveBrush(findBrush(session.document, right!.id)!).bounds?.min[1]).toBe(-32);
    expect(session.redo()).toBe(true);
    expect(deriveBrush(findBrush(session.document, left!.id)!).bounds?.min[1]).toBe(0);

    session.selectBrush(left!.id, true);
    expect(selectedBrushIds(session.selection)).toEqual([right!.id]);
  });

  it('applies material to an object selection set atomically', () => {
    const document = createStarterDocument();
    const [, left, right] = brushesInDocument(document);
    const session = new EditorSession(document);
    session.selectBrush(left!.id);
    session.selectBrush(right!.id, true);

    expect(session.applyMaterial('MULTI')).toBe(true);
    expect(session.document.revision).toBe(1);
    expect(
      findBrush(session.document, left!.id)?.faces.every((face) => face.material === 'MULTI'),
    ).toBe(true);
    expect(
      findBrush(session.document, right!.id)?.faces.every((face) => face.material === 'MULTI'),
    ).toBe(true);
    expect(session.undo()).toBe(true);
    expect(
      findBrush(session.document, left!.id)?.faces.every((face) => face.material === 'DEV_PILLAR'),
    ).toBe(true);
    expect(
      findBrush(session.document, right!.id)?.faces.every((face) => face.material === 'DEV_PILLAR'),
    ).toBe(true);
  });

  it('flood selects only the connected part of a coplanar surface', () => {
    const ids = createSequentialIdFactory('coplanar');
    const left = createBoxBrush([-64, -32, 0], [0, 32, 32], 'TOP', ids);
    const right = createBoxBrush([0, -32, 0], [64, 32, 32], 'TOP', ids);
    const isolated = createBoxBrush([128, -32, 0], [192, 32, 32], 'TOP', ids);
    const starter = createStarterDocument();
    const document = {
      ...starter,
      entities: [
        { ...starter.entities[0]!, primitives: [left, right, isolated] },
        ...starter.entities.slice(1),
      ],
    };
    const session = new EditorSession(document);

    session.selectConnectedCoplanarFaces({ brushId: left.id, faceId: left.faces[4]!.id });

    expect(selectedFaceReferences(session.selection)).toEqual([
      { brushId: left.id, faceId: left.faces[4]!.id },
      { brushId: right.id, faceId: right.faces[4]!.id },
    ]);
  });

  it('applies one reversible material transaction across selected faces on several brushes', () => {
    const document = createStarterDocument();
    const [floor, pillar] = brushesInDocument(document);
    const floorFace = floor!.faces[4]!;
    const pillarFace = pillar!.faces[4]!;
    const session = new EditorSession(document);
    session.selectFaces([
      { brushId: floor!.id, faceId: floorFace.id },
      { brushId: pillar!.id, faceId: pillarFace.id },
    ]);

    expect(session.applyMaterial('ROOF')).toBe(true);
    expect(session.document.revision).toBe(1);
    expect(findBrush(session.document, floor!.id)?.faces[4]?.material).toBe('ROOF');
    expect(findBrush(session.document, pillar!.id)?.faces[4]?.material).toBe('ROOF');
    expect(findBrush(session.document, pillar!.id)?.faces[0]?.material).toBe('DEV_PILLAR');
    expect(session.undoLabel).toBe('Apply material');

    expect(session.undo()).toBe(true);
    expect(findBrush(session.document, floor!.id)?.faces[4]?.material).toBe('DEV_FLOOR');
    expect(findBrush(session.document, pillar!.id)?.faces[4]?.material).toBe('DEV_PILLAR');
    expect(session.redo()).toBe(true);
    expect(findBrush(session.document, floor!.id)?.faces[4]?.material).toBe('ROOF');
    expect(findBrush(session.document, pillar!.id)?.faces[4]?.material).toBe('ROOF');
  });

  it('moves a face plane along its normal and rejects collapsed extrusion', () => {
    const brush = createBoxBrush([-16, -16, -16], [16, 16, 16]);
    const topFace = brush.faces[4]!;
    const expanded = moveBrushFace(brush, topFace.id, 32);

    expect(deriveBrush(expanded).bounds).toEqual({ min: [-16, -16, -16], max: [16, 16, 48] });
    expect(expanded.faces).toHaveLength(brush.faces.length);
    expect(expanded.faces[4]?.id).toBe(topFace.id);

    const session = new EditorSession({
      ...createStarterDocument(),
      entities: [
        {
          ...createStarterDocument().entities[0]!,
          primitives: [brush],
        },
      ],
    });
    session.select({ brushId: brush.id, faceId: topFace.id });
    expect(() => session.createFaceExtrusionCandidate(brush.id, topFace.id, -32)).toThrow(
      /invalid brush/,
    );
  });

  it('split-extrudes a face outward or inward into two valid adjacent brushes', () => {
    const brush = createBoxBrush([-16, -16, -16], [16, 16, 16], 'SPLIT');
    const face = brush.faces[0]!;
    const outward = splitBrushFace(brush, face.id, 16, createSequentialIdFactory('split-outward'));
    const inward = splitBrushFace(brush, face.id, -16, createSequentialIdFactory('split-inward'));

    expect(outward.map((piece) => deriveBrush(piece).bounds)).toEqual([
      { min: [-16, -16, -16], max: [16, 16, 16] },
      { min: [16, -16, -16], max: [32, 16, 16] },
    ]);
    expect(inward.map((piece) => deriveBrush(piece).bounds)).toEqual([
      { min: [-16, -16, -16], max: [0, 16, 16] },
      { min: [0, -16, -16], max: [16, 16, 16] },
    ]);
    expect([...outward, ...inward].every((piece) => deriveBrush(piece).valid)).toBe(true);
    expect(
      [...outward, ...inward].every((piece) =>
        piece.faces.some((candidate) => candidate.material === 'SPLIT'),
      ),
    ).toBe(true);
  });

  it('stamps an independent textured prism from one face without changing its source brush', () => {
    const ids = createSequentialIdFactory('face-stamp-operation');
    const original = createBoxBrush([-32, -16, 0], [32, 16, 16], 'STAMPED', ids);
    const topFace = original.faces[4]!;
    const source: MapBrush = {
      ...original,
      faces: original.faces.map((face) =>
        face.id === topFace.id
          ? Object.assign({}, face, { surface: { flags: 7, value: 23 } })
          : face,
      ),
    };
    const stamped = stampBrushFace(
      source,
      topFace.id,
      32,
      createSequentialIdFactory('face-stamp-result'),
    );

    expect(deriveBrush(source).bounds).toEqual({ min: [-32, -16, 0], max: [32, 16, 16] });
    expect(deriveBrush(stamped).bounds).toEqual({ min: [-32, -16, 16], max: [32, 16, 48] });
    expect(deriveBrush(stamped).valid).toBe(true);
    expect(stamped.id).not.toBe(source.id);
    expect(stamped.faces.every((face) => face.material === 'STAMPED')).toBe(true);
    expect(
      stamped.faces.every((face) => face.surface.flags === 7 && face.surface.value === 23),
    ).toBe(true);
    expect(() =>
      stampBrushFace(source, topFace.id, 0, createSequentialIdFactory('zero-face-stamp')),
    ).toThrow('non-zero');
  });

  it('previews and commits a face stamp as one reversible creation in the source entity', () => {
    const ids = createSequentialIdFactory('face-stamp-session');
    const source = createBoxBrush([-16, -16, 0], [16, 16, 16], 'STAMP_SOURCE', ids);
    const starter = createStarterDocument();
    const entityId = ids.entity();
    const document: MapDocument = {
      ...starter,
      entities: [
        starter.entities[0]!,
        { id: entityId, properties: { classname: 'func_detail' }, primitives: [source] },
        ...starter.entities.slice(1),
      ],
    };
    const face = { brushId: source.id, faceId: source.faces[4]!.id };
    const session = new EditorSession(document);
    session.select(face);
    const candidate = session.createFaceStampCandidate(
      [face],
      face,
      16,
      createSequentialIdFactory('face-stamp-candidate'),
      true,
    )!;

    expect(candidate.label).toBe('Stamp face');
    expect(candidate.insertions).toHaveLength(1);
    expect(candidate.insertions[0]?.entityId).toBe(entityId);
    expect(brushesInDocument(candidate.document)).toHaveLength(
      brushesInDocument(document).length + 1,
    );
    expect(brushesInDocument(session.document)).toHaveLength(brushesInDocument(document).length);

    session.commitBatchCreationCandidate(candidate);
    expect(session.document.revision).toBe(1);
    expect(selectedBrushIds(session.selection)).toEqual([candidate.insertions[0]!.brush.id]);
    expect(session.undoLabel).toBe('Stamp face');
    expect(session.undo()).toBe(true);
    expect(session.selection).toEqual(face);
    expect(brushesInDocument(session.document)).toHaveLength(brushesInDocument(document).length);
    expect(session.redo()).toBe(true);
    expect(selectedBrushIds(session.selection)).toEqual([candidate.insertions[0]!.brush.id]);
  });

  it('commits an undoable face split and rejects opposing shared-face splits', () => {
    const ids = createSequentialIdFactory('face-split-session');
    const left = createBoxBrush([-32, -32, 0], [0, 32, 32], 'LEFT', ids);
    const right = createBoxBrush([0, -32, 0], [32, 32, 32], 'RIGHT', ids);
    const starter = createStarterDocument();
    const document = {
      ...starter,
      entities: [
        { ...starter.entities[0]!, primitives: [left, right] },
        ...starter.entities.slice(1),
      ],
    };
    const session = new EditorSession(document);
    const face = { brushId: left.id, faceId: left.faces[0]!.id };
    session.select(face);
    const candidate = session.createFaceSetSplitCandidate(
      [face],
      face,
      16,
      createSequentialIdFactory('face-split-candidate'),
    )!;

    expect(candidate.label).toBe('Split-extrude face');
    if ('edits' in candidate) throw new Error('Expected a single face split candidate');
    expect(candidate.after).toHaveLength(2);
    expect(brushesInDocument(candidate.document)).toHaveLength(3);
    session.commitClipCandidate(candidate);
    expect(session.document.revision).toBe(1);
    expect(brushesInDocument(session.document)).toHaveLength(3);
    expect(session.undoLabel).toBe('Split-extrude face');
    expect(session.undo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(2);
    expect(session.redo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(3);

    const sharedFaces = matchingBrushFaces(document, face, [left.id, right.id]);
    expect(() =>
      new EditorSession(document).createFaceSetSplitCandidate(
        sharedFaces,
        face,
        16,
        createSequentialIdFactory('opposing-face-split'),
      ),
    ).toThrow('opposing shared faces');
  });

  it('split-extrudes identical same-facing faces as one batch transaction', () => {
    const firstIds = createSequentialIdFactory('same-facing-first');
    const secondIds = createSequentialIdFactory('same-facing-second');
    const first = createBoxBrush([-16, -16, -16], [16, 16, 16], 'FIRST', firstIds);
    const second = createBoxBrush([-16, -16, -16], [16, 16, 16], 'SECOND', secondIds);
    const starter = createStarterDocument();
    const document = {
      ...starter,
      entities: [
        { ...starter.entities[0]!, primitives: [first, second] },
        ...starter.entities.slice(1),
      ],
    };
    const seed = { brushId: first.id, faceId: first.faces[0]!.id };
    const faces = matchingBrushFaces(document, seed, [first.id, second.id]);
    const session = new EditorSession(document);
    const candidate = session.createFaceSetSplitCandidate(
      faces,
      seed,
      16,
      createSequentialIdFactory('same-facing-split'),
    )!;

    if (!('edits' in candidate)) throw new Error('Expected a batch face split candidate');
    expect(candidate.label).toBe('Split-extrude faces');
    expect(candidate.edits).toHaveLength(2);
    expect(candidate.selectionAfter).toHaveLength(4);
    expect(brushesInDocument(candidate.document)).toHaveLength(4);
    session.commitClipCandidate(candidate);
    expect(session.document.revision).toBe(1);
    expect(brushesInDocument(session.document)).toHaveLength(4);
    expect(selectedBrushIds(session.selection)).toHaveLength(4);
    expect(session.undo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(2);
    expect(selectedBrushIds(session.selection)).toEqual([first.id, second.id]);
  });

  it('previews and commits one undoable selected-face extrusion', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const face = brush.faces[0]!;
    const session = new EditorSession(document);
    session.select({ brushId: brush.id, faceId: face.id });

    const candidate = session.createFaceExtrusionCandidate(brush.id, face.id, 16)!;
    expect(deriveBrush(findBrush(candidate.document, brush.id)!).bounds?.max[0]).toBe(-16);
    expect(findBrush(session.document, brush.id)?.revision).toBe(0);

    session.commitCandidate(candidate);
    expect(session.undoLabel).toBe('Extrude face');
    expect(deriveBrush(findBrush(session.document, brush.id)!).bounds?.max[0]).toBe(-16);
    expect(session.undo()).toBe(true);
    expect(deriveBrush(findBrush(session.document, brush.id)!).bounds?.max[0]).toBe(-32);
    expect(session.redo()).toBe(true);
    expect(deriveBrush(findBrush(session.document, brush.id)!).bounds?.max[0]).toBe(-16);
  });

  it('matches and extrudes exact shared faces with opposing normals atomically', () => {
    const ids = createSequentialIdFactory('shared-faces');
    const left = createBoxBrush([-32, -32, 0], [0, 32, 32], 'LEFT', ids);
    const right = createBoxBrush([0, -32, 0], [32, 32, 32], 'RIGHT', ids);
    const starter = createStarterDocument();
    const document = {
      ...starter,
      entities: [
        { ...starter.entities[0]!, primitives: [left, right] },
        ...starter.entities.slice(1),
      ],
    };
    const seed = { brushId: left.id, faceId: left.faces[0]!.id };
    const faces = matchingBrushFaces(document, seed, [left.id, right.id]);
    expect(faces).toEqual([seed, { brushId: right.id, faceId: right.faces[1]!.id }]);

    const session = new EditorSession(document);
    session.selectBrush(left.id);
    session.selectBrush(right.id, true);
    session.selectMatchingBrushFaces(seed, selectedBrushIds(session.selection));
    expect(selectedFaceReferences(session.selection)).toEqual(faces);
    const candidate = session.createFaceSetExtrusionCandidate(faces, seed, 16)!;
    expect(candidate.label).toBe('Extrude shared faces');
    expect(deriveBrush(findBrush(candidate.document, left.id)!).bounds?.max[0]).toBe(16);
    expect(deriveBrush(findBrush(candidate.document, right.id)!).bounds?.min[0]).toBe(16);

    session.commitCandidate(candidate);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Extrude shared faces');
    expect(session.undo()).toBe(true);
    expect(deriveBrush(findBrush(session.document, left.id)!).bounds?.max[0]).toBe(0);
    expect(deriveBrush(findBrush(session.document, right.id)!).bounds?.min[0]).toBe(0);

    expect(() =>
      session.createFaceSetExtrusionCandidate(
        [seed, { brushId: right.id, faceId: right.faces[4]!.id }],
        seed,
        16,
      ),
    ).toThrow('compatible coplanar faces');
  });

  it('extrudes coplanar faces across an object selection without requiring identical polygons', () => {
    const ids = createSequentialIdFactory('coplanar-selection');
    const lower = createBoxBrush([-32, -32, 0], [0, -8, 32], 'LOWER', ids);
    const upper = createBoxBrush([-32, 8, 0], [0, 32, 32], 'UPPER', ids);
    const unrelated = createBoxBrush([0, 48, 0], [32, 64, 32], 'UNRELATED', ids);
    const starter = createStarterDocument();
    const document = {
      ...starter,
      entities: [
        { ...starter.entities[0]!, primitives: [lower, upper, unrelated] },
        ...starter.entities.slice(1),
      ],
    };
    const seed = { brushId: lower.id, faceId: lower.faces[0]!.id };
    const faces = extrudableBrushFaces(document, seed, [lower.id, upper.id, unrelated.id]);

    expect(faces).toEqual([seed, { brushId: upper.id, faceId: upper.faces[0]!.id }]);
    const candidate = new EditorSession(document).createFaceSetExtrusionCandidate(faces, seed, 16)!;
    if (!('edits' in candidate)) throw new Error('Expected a batch face extrusion candidate');
    expect(candidate.edits).toHaveLength(2);
    expect(deriveBrush(findBrush(candidate.document, lower.id)!).bounds?.max[0]).toBe(16);
    expect(deriveBrush(findBrush(candidate.document, upper.id)!).bounds?.max[0]).toBe(16);
    expect(deriveBrush(findBrush(candidate.document, unrelated.id)!).bounds?.min[0]).toBe(0);
  });

  it('translates selected face vertices across adjacent brushes as one convex edit', () => {
    const ids = createSequentialIdFactory('face-translation');
    const left = createBoxBrush([-32, -32, 0], [0, 32, 32], 'LEFT', ids);
    const right = createBoxBrush([0, -32, 0], [32, 32, 32], 'RIGHT', ids);
    const starter = createStarterDocument();
    const document = {
      ...starter,
      entities: [
        { ...starter.entities[0]!, primitives: [left, right] },
        ...starter.entities.slice(1),
      ],
    };
    const faces = [
      { brushId: left.id, faceId: left.faces[4]!.id },
      { brushId: right.id, faceId: right.faces[4]!.id },
    ];
    const session = new EditorSession(document);
    session.selectFaces(faces);
    const candidate = session.createFaceSetTranslationCandidate(
      faces,
      [16, 0, 0],
      createSequentialIdFactory('face-translation-candidate'),
    )!;

    if (!('edits' in candidate)) throw new Error('Expected a batch face translation candidate');
    expect(candidate.label).toBe('Move faces');
    expect(candidate.edits).toHaveLength(2);
    expect(deriveBrush(findBrush(candidate.document, left.id)!).bounds?.max[0]).toBe(16);
    expect(deriveBrush(findBrush(candidate.document, right.id)!).bounds?.max[0]).toBe(48);
    for (const face of faces) {
      expect(
        findBrush(candidate.document, face.brushId)?.faces.some(
          (candidateFace) => candidateFace.id === face.faceId,
        ),
      ).toBe(true);
    }
    session.commitCandidate(candidate);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Move faces');
    expect(selectedFaceReferences(session.selection)).toEqual(faces);
    expect(session.undo()).toBe(true);
    expect(deriveBrush(findBrush(session.document, left.id)!).bounds?.max[0]).toBe(0);
    expect(deriveBrush(findBrush(session.document, right.id)!).bounds?.max[0]).toBe(32);
  });

  it('rotates, scales, and shears selected components through convex hull candidates', () => {
    const ids = createSequentialIdFactory('component-transform');
    const brush = createBoxBrush([-16, -16, -16], [16, 16, 16], 'COMPONENT', ids);
    const starter = createStarterDocument();
    const document = {
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [brush] }, ...starter.entities.slice(1)],
    };
    const vertices = brushVertices(brush).filter((point) => point[2] === 16);
    const session = new EditorSession(document);
    session.selectBrush(brush.id);

    const rotated = session.createBrushSetVertexRotationCandidate(
      [brush.id],
      vertices,
      [0, 0, 0],
      2,
      45,
      createSequentialIdFactory('component-rotate'),
    )!;
    const scaled = session.createBrushSetVertexScaleCandidate(
      [brush.id],
      vertices,
      [0, 0, 16],
      [1.5, 1.5, 1],
      createSequentialIdFactory('component-scale'),
    )!;
    const sheared = session.createBrushSetVertexShearCandidate(
      [brush.id],
      vertices,
      [0, 0, 0],
      2,
      0,
      1,
      createSequentialIdFactory('component-shear'),
    )!;

    expect(rotated.label).toBe('Rotate components');
    expect(deriveBrush(findBrush(rotated.document, brush.id)!).bounds?.max[0]).toBeCloseTo(
      Math.SQRT2 * 16,
    );
    expect(deriveBrush(findBrush(scaled.document, brush.id)!).bounds?.max[0]).toBe(24);
    expect(deriveBrush(findBrush(sheared.document, brush.id)!).bounds?.max[0]).toBe(32);
    expect(
      [rotated, scaled, sheared].every(
        (candidate) => deriveBrush(findBrush(candidate.document, brush.id)!).valid,
      ),
    ).toBe(true);

    session.commitCandidate(scaled);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Scale components');
    expect(session.undo()).toBe(true);
    expect(deriveBrush(findBrush(session.document, brush.id)!).bounds?.max[0]).toBe(16);
  });

  it('adds, edits, removes, and restores entity properties through history', () => {
    const session = new EditorSession(createStarterDocument());
    const worldspawn = session.document.entities[0]!;

    expect(session.setEntityProperty(worldspawn.id, 'sky', 'desert')).toBe(true);
    expect(session.document.entities[0]?.properties.sky).toBe('desert');
    expect(session.undoLabel).toBe('Add entity property');

    expect(session.setEntityProperty(worldspawn.id, 'sky', 'night')).toBe(true);
    expect(session.document.entities[0]?.properties.sky).toBe('night');

    expect(session.setEntityProperty(worldspawn.id, 'sky', null)).toBe(true);
    expect(session.document.entities[0]?.properties.sky).toBeUndefined();
    expect(session.undo()).toBe(true);
    expect(session.document.entities[0]?.properties.sky).toBe('night');
    expect(session.undo()).toBe(true);
    expect(session.document.entities[0]?.properties.sky).toBe('desert');
    expect(session.redo()).toBe(true);
    expect(session.document.entities[0]?.properties.sky).toBe('night');
  });

  it('duplicates a selected brush with new stable IDs and one undo step', () => {
    const document = createStarterDocument();
    const source = brushesInDocument(document)[1]!;
    const session = new EditorSession(document);
    session.select({ brushId: source.id });

    expect(
      session.duplicateSelected(createSequentialIdFactory('duplicate-test'), [16, 16, 0]),
    ).toBe(true);
    const duplicate = findBrush(session.document, session.selection!.brushId!)!;
    expect(duplicate.id).not.toBe(source.id);
    expect(duplicate.faces.map((face) => face.id)).not.toEqual(source.faces.map((face) => face.id));
    expect(deriveBrush(duplicate).bounds).toEqual({ min: [-80, -16, 0], max: [-16, 48, 96] });
    expect(session.undoLabel).toBe('Duplicate brush');
    expect(session.undo()).toBe(true);
    expect(findBrush(session.document, duplicate.id)).toBeNull();
  });

  it('keeps clone IDs stable across duplicate-and-move previews and restores selection history', () => {
    const document = createStarterDocument();
    const [, left, right] = brushesInDocument(document);
    const session = new EditorSession(document);
    session.selectBrush(left!.id);
    session.selectBrush(right!.id, true);
    const sourceSelection = session.selection;
    const base = session.createDuplicationCandidate(
      selectedBrushIds(session.selection),
      createSequentialIdFactory('drag-duplicate'),
    )!;
    const first = session.translateBatchCreationCandidate(base, [16, 0, 0]);
    const second = session.translateBatchCreationCandidate(
      base,
      [48, 32, 0],
      true,
      'Duplicate and move brushes',
    );

    expect(first.selectionAfter).toEqual(second.selectionAfter);
    expect(
      first.insertions.map((insertion) => insertion.brush.faces.map((face) => face.id)),
    ).toEqual(second.insertions.map((insertion) => insertion.brush.faces.map((face) => face.id)));
    expect(brushesInDocument(session.document)).toHaveLength(3);
    expect(deriveBrush(second.insertions[0]!.brush).bounds?.min).toEqual([-48, 0, 0]);
    expect(deriveBrush(second.insertions[1]!.brush).bounds?.min).toEqual([80, 0, 0]);

    session.commitBatchCreationCandidate(second);
    expect(session.undoLabel).toBe('Duplicate and move brushes');
    expect(selectedBrushIds(session.selection)).toEqual(second.selectionAfter);
    expect(session.undo()).toBe(true);
    expect(session.selection).toEqual(sourceSelection);
    expect(session.redo()).toBe(true);
    expect(selectedBrushIds(session.selection)).toEqual(second.selectionAfter);
  });

  it('duplicates and deletes object selection sets as atomic transactions', () => {
    const document = createStarterDocument();
    const [, left, right] = brushesInDocument(document);
    const session = new EditorSession(document);
    session.selectBrush(left!.id);
    session.selectBrush(right!.id, true);

    expect(session.duplicateSelected(createSequentialIdFactory('duplicate-set'), [0, 64, 0])).toBe(
      true,
    );
    const duplicateIds = selectedBrushIds(session.selection);
    expect(duplicateIds).toHaveLength(2);
    expect(brushesInDocument(session.document)).toHaveLength(5);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Duplicate brushes');
    expect(deriveBrush(findBrush(session.document, duplicateIds[0]!)!).bounds?.min[1]).toBe(32);
    expect(deriveBrush(findBrush(session.document, duplicateIds[1]!)!).bounds?.min[1]).toBe(32);

    expect(session.undo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(3);
    expect(session.redo()).toBe(true);
    expect(selectedBrushIds(session.selection)).toEqual(duplicateIds);
    expect(brushesInDocument(session.document)).toHaveLength(5);

    expect(session.deleteSelected()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(3);
    expect(session.undoLabel).toBe('Delete brushes');
    expect(session.selection).toBeNull();
    expect(session.undo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(5);
    expect(selectedBrushIds(session.selection)).toEqual(duplicateIds);
    expect(session.redo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(3);
  });

  it('deletes and restores a selected brush at its original entity position', () => {
    const document = createStarterDocument();
    const source = brushesInDocument(document)[1]!;
    const session = new EditorSession(document);
    session.select({ brushId: source.id });

    expect(session.deleteSelected()).toBe(true);
    expect(findBrush(session.document, source.id)).toBeNull();
    expect(session.selection).toBeNull();
    expect(session.undoLabel).toBe('Delete brush');

    expect(session.undo()).toBe(true);
    expect(brushesInDocument(session.document)[1]?.id).toBe(source.id);
    expect(session.selection).toEqual({ brushId: source.id });

    expect(session.redo()).toBe(true);
    expect(findBrush(session.document, source.id)).toBeNull();
  });

  it('previews and commits one undoable brush creation with stable IDs', () => {
    const document = createStarterDocument();
    const session = new EditorSession(document);
    const brush = createBoxBrush(
      [160, -32, 0],
      [224, 32, 64],
      'DEV_PILLAR',
      createSequentialIdFactory('created-test'),
    );

    const candidate = session.createBrushCandidate(brush);
    expect(brushesInDocument(session.document)).toHaveLength(3);
    expect(findBrush(candidate.document, brush.id)).toBe(brush);

    session.commitCreationCandidate(candidate);
    expect(findBrush(session.document, brush.id)).toBe(brush);
    expect(session.selection).toEqual({ brushId: brush.id });
    expect(session.undoLabel).toBe('Create brush');
    expect(session.document.revision).toBe(1);

    expect(session.undo()).toBe(true);
    expect(findBrush(session.document, brush.id)).toBeNull();
    expect(session.selection).toBeNull();
    expect(session.document.revision).toBe(2);

    expect(session.redo()).toBe(true);
    expect(findBrush(session.document, brush.id)).toBe(brush);
    expect(session.selection).toEqual({ brushId: brush.id });
    expect(session.document.revision).toBe(3);
  });

  it('rejects a creation preview after another edit advances the document', () => {
    const document = createStarterDocument();
    const session = new EditorSession(document);
    const brush = createBoxBrush(
      [160, -32, 0],
      [224, 32, 64],
      'DEV_PILLAR',
      createSequentialIdFactory('stale-created-test'),
    );
    const candidate = session.createBrushCandidate(brush);

    expect(session.translate(brushesInDocument(document)[1]!.id, [16, 0, 0])).toBe(true);
    expect(() => session.commitCreationCandidate(candidate)).toThrow(/stale document revision/);
  });

  it('applies a material to the selected face as one reversible brush edit', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const face = brush.faces[0]!;
    const session = new EditorSession(document);
    session.select({ brushId: brush.id, faceId: face.id });

    expect(session.applyMaterial('BRICK')).toBe(true);
    expect(findBrush(session.document, brush.id)?.faces[0]?.material).toBe('BRICK');
    expect(findBrush(session.document, brush.id)?.faces[1]?.material).toBe('DEV_PILLAR');
    expect(session.undo()).toBe(true);
    expect(findBrush(session.document, brush.id)?.faces[0]?.material).toBe('DEV_PILLAR');
  });

  it('updates Valve 220 shift, scale, and explicit axes as one texture edit', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const face = brush.faces[0]!;
    const session = new EditorSession(document);
    session.select({ brushId: brush.id, faceId: face.id });

    expect(
      session.applyTextureTransform({
        offset: [24, -8],
        rotationDegrees: 90,
        scale: [0.5, 2],
      }),
    ).toBe(true);
    const changed = findBrush(session.document, brush.id)?.faces[0];
    expect(changed?.projection).toMatchObject({
      offset: [24, -8],
      rotationDegrees: 90,
      scale: [0.5, 2],
    });
    expect(changed?.projection.uAxis).not.toEqual(face.projection.uAxis);
    expect(session.undo()).toBe(true);
    expect(findBrush(session.document, brush.id)?.faces[0]?.projection).toEqual(face.projection);
  });

  it('edits Quake II surface flags atomically while preserving unknown bits and undo', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const first = brush.faces[0]!;
    const second = brush.faces[1]!;
    const withSurface: MapDocument = {
      ...document,
      entities: document.entities.map((entity) =>
        Object.assign({}, entity, {
          primitives: entity.primitives.map((primitive) =>
            primitive.id === brush.id && primitive.kind === 'brush'
              ? Object.assign({}, primitive, {
                  faces: primitive.faces.map((face) =>
                    face.id === first.id
                      ? Object.assign({}, face, { surface: { flags: 0x101, value: 100 } })
                      : face.id === second.id
                        ? Object.assign({}, face, { surface: { flags: 0x100, value: 200 } })
                        : face,
                  ),
                })
              : primitive,
          ),
        }),
      ),
    };
    const session = new EditorSession(withSurface);
    session.select(
      createFaceSelection([
        { brushId: brush.id, faceId: first.id },
        { brushId: brush.id, faceId: second.id },
      ]),
    );

    expect(session.setSelectedSurfaceFlag('flags', 0x04, true)).toBe(true);
    const changed = findBrush(session.document, brush.id)!;
    expect(changed.faces.slice(0, 2).map(({ surface }) => surface.flags)).toEqual([0x105, 0x104]);
    expect(session.setSelectedSurfaceValue(300)).toBe(true);
    expect(
      findBrush(session.document, brush.id)!
        .faces.slice(0, 2)
        .map(({ surface }) => surface.value),
    ).toEqual([300, 300]);
    expect(session.undo()).toBe(true);
    expect(
      findBrush(session.document, brush.id)!
        .faces.slice(0, 2)
        .map(({ surface }) => surface.value),
    ).toEqual([100, 200]);
    expect(session.undo()).toBe(true);
    expect(
      findBrush(session.document, brush.id)!
        .faces.slice(0, 2)
        .map(({ surface }) => surface.flags),
    ).toEqual([0x101, 0x100]);
  });

  it('previews relative UV transforms around a stable face-space pivot', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const face = brush.faces[4]!;
    const vertices = deriveBrush(brush).faces.find(
      (candidate) => candidate.faceId === face.id,
    )!.vertices;
    const sum = vertices.reduce(
      (value, point) => [value[0] + point[0], value[1] + point[1], value[2] + point[2]],
      [0, 0, 0],
    );
    const pivot = [
      sum[0]! / vertices.length,
      sum[1]! / vertices.length,
      sum[2]! / vertices.length,
    ] as const;
    const transform = {
      offset: [12, -6] as const,
      rotationDegrees: 30,
      scale: [2, 0.5] as const,
    };
    const transformed = transformFaceTexture(brush, face.id, transform, pivot);
    const transformedFace = transformed.faces.find((candidate) => candidate.id === face.id)!;
    const beforePivot = textureCoordinates(face, pivot);
    const afterPivot = textureCoordinates(transformedFace, pivot);

    expect(afterPivot[0]).toBeCloseTo(beforePivot[0] + 12);
    expect(afterPivot[1]).toBeCloseTo(beforePivot[1] - 6);
    expect(transformedFace.projection.rotationDegrees).toBe(face.projection.rotationDegrees + 30);
    expect(transformedFace.projection.scale).toEqual([
      face.projection.scale[0] * 2,
      face.projection.scale[1] * 0.5,
    ]);
    expect(transformed.faces[0]?.projection).toEqual(brush.faces[0]?.projection);

    const session = new EditorSession(document);
    session.select({ brushId: brush.id, faceId: face.id });
    const candidate = session.createTextureTransformDeltaCandidate(
      transform,
      { brushId: brush.id, faceId: face.id },
      pivot,
    );
    expect(candidate).not.toBeNull();
    expect(findBrush(session.document, brush.id)?.faces[4]?.projection).toEqual(face.projection);
    session.commitCandidate(candidate!);
    expect(
      textureCoordinates(findBrush(session.document, brush.id)!.faces[4]!, pivot)[0],
    ).toBeCloseTo(beforePivot[0] + 12);
    expect(session.undo()).toBe(true);
    expect(findBrush(session.document, brush.id)?.faces[4]?.projection).toEqual(face.projection);
  });

  it('applies graphical UV deltas relatively across a multi-face selection', () => {
    const source = createStarterDocument();
    const sourceBrush = brushesInDocument(source)[1]!;
    const first = sourceBrush.faces[0]!;
    const second = sourceBrush.faces[1]!;
    const brush = {
      ...sourceBrush,
      faces: sourceBrush.faces.map((face) =>
        face.id === first.id
          ? Object.assign({}, face, {
              projection: Object.assign({}, face.projection, { offset: [10, 20] as const }),
            })
          : face.id === second.id
            ? Object.assign({}, face, {
                projection: Object.assign({}, face.projection, { offset: [40, -10] as const }),
              })
            : face,
      ),
    };
    const document = {
      ...source,
      entities: source.entities.map((entity) =>
        Object.assign({}, entity, {
          primitives: entity.primitives.map((candidate) =>
            candidate.id === brush.id ? brush : candidate,
          ),
        }),
      ),
    };
    const session = new EditorSession(document);
    const primary = { brushId: brush.id, faceId: first.id };
    session.select(
      createFaceSelection([primary, { brushId: brush.id, faceId: second.id }], primary),
    );
    const candidate = session.createTextureTransformDeltaCandidate(
      { offset: [5, 7], rotationDegrees: 0, scale: [1, 1] },
      primary,
      first.planePoints[0],
    );
    expect(candidate).not.toBeNull();
    session.commitCandidate(candidate!);
    const changed = findBrush(session.document, brush.id)!;

    expect(changed.faces.find((face) => face.id === first.id)?.projection.offset).toEqual([15, 27]);
    expect(changed.faces.find((face) => face.id === second.id)?.projection.offset).toEqual([
      45, -3,
    ]);
    expect(session.undo()).toBe(true);
    expect(
      findBrush(session.document, brush.id)?.faces.find((face) => face.id === second.id)?.projection
        .offset,
    ).toEqual([40, -10]);
  });

  it('transfers face attributes with project, rotated, and material-only semantics', () => {
    const ids = createSequentialIdFactory('face-attribute-transfer');
    const sourceBrush = createBoxBrush([-48, -16, -16], [-16, 16, 16], 'SOURCE', ids);
    const targetBrush = createBoxBrush([16, -16, -16], [48, 16, 16], 'TARGET', ids);
    const sourceFace = {
      ...sourceBrush.faces[4]!,
      projection: {
        kind: 'valve-220' as const,
        uAxis: [1, 0, 0] as const,
        vAxis: [0, -1, 0] as const,
        offset: [24, -8] as const,
        rotationDegrees: 15,
        scale: [0.5, 2] as const,
      },
      surface: { contents: 1, flags: 7, value: 3 },
    };
    const originalTarget = {
      ...targetBrush.faces[0]!,
      projection: {
        kind: 'valve-220' as const,
        uAxis: [0, 1, 0] as const,
        vAxis: [0, 0, -1] as const,
        offset: [3, 4] as const,
        rotationDegrees: 30,
        scale: [4, 8] as const,
      },
      surface: { contents: 42, flags: 2, value: 9 },
    };
    const target = {
      ...targetBrush,
      faces: targetBrush.faces.map((face) =>
        face.id === originalTarget.id ? originalTarget : face,
      ),
    };

    const projected = transferFaceAttributes(target, originalTarget.id, sourceFace, 'project');
    const projectedFace = projected.faces.find((face) => face.id === originalTarget.id)!;
    expect(projectedFace.material).toBe('SOURCE');
    expect(projectedFace.projection).toEqual(sourceFace.projection);
    expect(projectedFace.surface).toEqual({ contents: 42, flags: 7, value: 3 });

    const materialOnly = transferFaceAttributes(target, originalTarget.id, sourceFace, 'material');
    const materialFace = materialOnly.faces.find((face) => face.id === originalTarget.id)!;
    expect(materialFace.material).toBe('SOURCE');
    expect(materialFace.projection).toEqual(originalTarget.projection);
    expect(materialFace.surface).toEqual(originalTarget.surface);

    const rotated = transferFaceAttributes(target, originalTarget.id, sourceFace, 'rotate');
    const rotatedFace = rotated.faces.find((face) => face.id === originalTarget.id)!;
    const targetNormal = deriveBrush(rotated).faces.find(
      (face) => face.faceId === originalTarget.id,
    )!.normal;
    expect(Math.abs(dotVectors(rotatedFace.projection.uAxis, targetNormal))).toBeLessThan(1e-6);
    expect(Math.abs(dotVectors(rotatedFace.projection.vAxis, targetNormal))).toBeLessThan(1e-6);
    expect(rotatedFace.projection.offset).toEqual(sourceFace.projection.offset);
    expect(rotatedFace.projection.scale).toEqual(sourceFace.projection.scale);
    expect(rotatedFace.surface).toEqual({ contents: 42, flags: 7, value: 3 });
  });

  it('chains a painted transfer path across brushes and commits it as one undo step', () => {
    const ids = createSequentialIdFactory('face-transfer-chain');
    const source = createBoxBrush([-64, -16, -16], [-32, 16, 16], 'SOURCE', ids);
    const first = createBoxBrush([-16, -16, -16], [16, 16, 16], 'FIRST', ids);
    const second = createBoxBrush([32, -16, -16], [64, 16, 16], 'SECOND', ids);
    const sourceFace = source.faces[4]!;
    const firstTarget = first.faces[0]!;
    const secondTarget = second.faces[2]!;
    const starter = createStarterDocument();
    const document = {
      ...starter,
      entities: [
        { ...starter.entities[0]!, primitives: [source, first, second] },
        ...starter.entities.slice(1),
      ],
    };
    const session = new EditorSession(document);
    const candidate = session.createFaceAttributeTransferCandidate(
      { brushId: source.id, faceId: sourceFace.id },
      [
        { brushId: first.id, faceId: firstTarget.id },
        { brushId: second.id, faceId: secondTarget.id },
      ],
      'rotate',
    )!;
    if (!('edits' in candidate)) throw new Error('Expected a batch face transfer candidate');

    const expectedFirst = transferFaceAttributes(first, firstTarget.id, sourceFace, 'rotate');
    const chainedSource = expectedFirst.faces.find((face) => face.id === firstTarget.id)!;
    const expectedSecond = transferFaceAttributes(second, secondTarget.id, chainedSource, 'rotate');
    expect(candidate.edits).toHaveLength(2);
    expect(
      findBrush(candidate.document, second.id)?.faces.find((face) => face.id === secondTarget.id)
        ?.projection,
    ).toEqual(expectedSecond.faces.find((face) => face.id === secondTarget.id)?.projection);

    session.commitCandidate(candidate);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Transfer face attributes');
    expect(findBrush(session.document, first.id)?.faces[0]?.material).toBe('SOURCE');
    expect(findBrush(session.document, second.id)?.faces[2]?.material).toBe('SOURCE');
    expect(session.undo()).toBe(true);
    expect(findBrush(session.document, first.id)?.faces[0]?.material).toBe('FIRST');
    expect(findBrush(session.document, second.id)?.faces[2]?.material).toBe('SECOND');
  });

  it('aligns one face directly and every face in an object selection atomically', () => {
    const brush = createBoxBrush([-16, -16, -16], [16, 16, 16], 'ALIGN');
    const face = brush.faces[4]!;
    const rotated = alignFaceTexture(brush, face.id, 'rotate-ccw');
    const rotatedFace = rotated.faces[4]!;
    expect(rotatedFace.projection.rotationDegrees).toBe(face.projection.rotationDegrees + 90);
    expect(rotatedFace.projection.uAxis).not.toEqual(face.projection.uAxis);
    expect(alignFaceTexture(rotated, face.id, 'flip-u').faces[4]?.projection.scale).toEqual([
      -face.projection.scale[0],
      face.projection.scale[1],
    ]);

    const ids = createSequentialIdFactory('object-texture-align');
    const first = createBoxBrush([-48, -16, -16], [-16, 16, 16], 'FIRST', ids);
    const second = createBoxBrush([16, -16, -16], [48, 16, 16], 'SECOND', ids);
    const starter = createStarterDocument();
    const document = {
      ...starter,
      entities: [
        { ...starter.entities[0]!, primitives: [first, second] },
        ...starter.entities.slice(1),
      ],
    };
    const session = new EditorSession(document);
    session.selectBrush(first.id);
    session.selectBrush(second.id, true);

    expect(session.alignTexture('flip-v')).toBe(true);
    expect(
      [first.id, second.id].every((brushId) =>
        findBrush(session.document, brushId)?.faces.every(
          (candidate) => candidate.projection.scale[1] === -1,
        ),
      ),
    ).toBe(true);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Flip texture vertically');
    expect(session.undo()).toBe(true);
    expect(
      [first.id, second.id].every((brushId) =>
        findBrush(session.document, brushId)?.faces.every(
          (candidate) => candidate.projection.scale[1] === 1,
        ),
      ),
    ).toBe(true);
  });

  it('cycles edge alignment, atlas justification, repeats, subdivisions, and auto-fit', () => {
    const brush = createBoxBrush([-16, -16, -16], [16, 16, 16], 'LAYOUT');
    const face = brush.faces[4]!;
    const textureSize = [64, 64] as const;
    expect(() => alignFaceTexture(brush, face.id, 'fit-u')).toThrow(
      'Texture dimensions for LAYOUT are required',
    );

    const edgeAligned = alignFaceTexture(brush, face.id, 'align-edge');
    const alignedFace = edgeAligned.faces[4]!;
    const edges = deriveBrush(edgeAligned).faces.find(
      (candidate) => candidate.faceId === face.id,
    )!.vertices;
    expect(alignedFace.projection.uAxis).not.toEqual(face.projection.uAxis);
    expect(
      edges.some((vertex, index) => {
        const next = edges[(index + 1) % edges.length]!;
        const edge = next.map((component, axis) => component - vertex[axis]!) as [
          number,
          number,
          number,
        ];
        return Math.abs(dotVectors(normalizeVector(edge), alignedFace.projection.uAxis)) > 0.999;
      }),
    ).toBe(true);

    const justified = alignFaceTexture(brush, face.id, 'justify-u-min', { textureSize });
    expect(faceTextureBounds(justified, face.id).min[0]).toBeCloseTo(0);
    const nextAtlasSlot = alignFaceTexture(justified, face.id, 'justify-u-min', { textureSize });
    expect(faceTextureBounds(nextAtlasSlot, face.id).min[0]).toBeCloseTo(32);
    const previousAtlasSlot = alignFaceTexture(nextAtlasSlot, face.id, 'justify-u-min', {
      textureSize,
      direction: -1,
    });
    expect(faceTextureBounds(previousAtlasSlot, face.id).min[0]).toBeCloseTo(0);

    const fitted = alignFaceTexture(brush, face.id, 'fit-u', { textureSize });
    let bounds = faceTextureBounds(fitted, face.id);
    expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(64);
    const repeated = alignFaceTexture(fitted, face.id, 'fit-u', { textureSize });
    bounds = faceTextureBounds(repeated, face.id);
    expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(128);
    const subdivided = alignFaceTexture(brush, face.id, 'fit-u', {
      textureSize,
      fitMode: 'subdivide',
    });
    bounds = faceTextureBounds(subdivided, face.id);
    expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(64 / 3);

    const autoFitted = alignFaceTexture(brush, face.id, 'auto-fit', { textureSize });
    bounds = faceTextureBounds(autoFitted, face.id);
    expect(bounds.min[0]).toBeCloseTo(0);
    expect(bounds.min[1]).toBeCloseTo(0);
    expect(bounds.max[0]).toBeCloseTo(64);
    expect(bounds.max[1]).toBeCloseTo(64);
  });

  it('previews an arbitrary number of drag updates before committing one history entry', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const session = new EditorSession(document);

    const firstPreview = session.createTranslationCandidate(brush.id, [16, 0, 0]);
    const finalPreview = session.createTranslationCandidate(brush.id, [48, -16, 0]);

    expect(firstPreview).not.toBeNull();
    expect(finalPreview).not.toBeNull();
    expect(session.document).toBe(document);
    expect(session.document.revision).toBe(0);
    expect(deriveBrush(findBrush(finalPreview!.document, brush.id)!).bounds?.min).toEqual([
      -48, -48, 0,
    ]);

    session.commitCandidate(finalPreview!);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Move brush');
    expect(session.undo()).toBe(true);
    expect(session.canUndo).toBe(false);
    expect(deriveBrush(findBrush(session.document, brush.id)!).bounds?.min).toEqual([-96, -32, 0]);
  });

  it('rejects a preview after another edit advances the source document', () => {
    const document = createStarterDocument();
    const brushes = brushesInDocument(document);
    const session = new EditorSession(document);
    const stale = session.createTranslationCandidate(brushes[1]!.id, [16, 0, 0]);

    expect(session.translate(brushes[2]!.id, [0, 16, 0])).toBe(true);
    expect(() => session.commitCandidate(stale!)).toThrow(/stale document revision/);
  });

  it('commits one brush replacement and reverses it without rewinding document revisions', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const session = new EditorSession(document);
    session.select({ brushId: brush.id });

    expect(session.translateSelected([16, 0, 0])).toBe(true);
    expect(deriveBrush(findBrush(session.document, brush.id)!).bounds?.min[0]).toBe(-80);
    expect(session.document.revision).toBe(1);

    expect(session.undo()).toBe(true);
    expect(deriveBrush(findBrush(session.document, brush.id)!).bounds?.min[0]).toBe(-96);
    expect(session.document.revision).toBe(2);

    expect(session.redo()).toBe(true);
    expect(deriveBrush(findBrush(session.document, brush.id)!).bounds?.min[0]).toBe(-80);
    expect(session.document.revision).toBe(3);
  });
});

describe('point and brush entities', () => {
  it('formats, bounds, and ray-picks point entities without renderer dependencies', () => {
    const entity = {
      id: createSequentialIdFactory('point-helper').entity(),
      properties: { classname: 'light', origin: formatEntityOrigin([16, -32, 48]) },
      primitives: [],
    };

    expect(parseEntityOrigin(entity)).toEqual([16, -32, 48]);
    expect(pointEntityBounds(entity)).toEqual({ min: [8, -40, 40], max: [24, -24, 56] });
    expect(intersectPointEntityRay(entity, [16, -32, 100], [0, 0, -1])).toMatchObject({
      entityId: entity.id,
      distance: 44,
      point: [16, -32, 56],
    });
    expect(intersectPointEntityRay(entity, [100, 100, 100], [0, 0, -1])).toBeNull();
  });

  it('derives and filters directed entity links across point and brush entity anchors', () => {
    const ids = createSequentialIdFactory('entity-links');
    const starter = createStarterDocument();
    const doorBrush = createBoxBrush([48, -16, 0], [80, 16, 64], 'DOOR', ids);
    const trigger = {
      id: ids.entity(),
      properties: {
        classname: 'trigger_once',
        origin: '0 0 32',
        target: 'door_a',
        killtarget: 'unused_a',
      },
      primitives: [],
    };
    const door = {
      id: ids.entity(),
      properties: { classname: 'func_door', targetname: 'door_a', target: 'relay_a' },
      primitives: [doorBrush],
    };
    const relay = {
      id: ids.entity(),
      properties: {
        classname: 'trigger_relay',
        origin: '128 0 32',
        targetname: 'relay_a',
        target: 'unused_a',
      },
      primitives: [],
    };
    const unused = {
      id: ids.entity(),
      properties: { classname: 'info_null', origin: '192 0 32', targetname: 'unused_a' },
      primitives: [],
    };
    const document = {
      ...starter,
      entities: [starter.entities[0]!, trigger, door, relay, unused],
    };

    const links = deriveEntityLinks(document);
    expect(deriveEntityLinks(document)).toBe(links);
    expect(links).toHaveLength(4);
    expect(links[0]).toMatchObject({
      sourceEntityId: trigger.id,
      targetEntityId: door.id,
      property: 'target',
      sourceAnchor: [0, 0, 32],
      targetAnchor: [64, 0, 32],
    });
    expect(visibleEntityLinks(links, [trigger.id], 'direct')).toHaveLength(2);
    expect(visibleEntityLinks(links, [trigger.id], 'transitive')).toHaveLength(4);
    expect(visibleEntityLinks(links, [], 'all')).toHaveLength(4);
    expect(visibleEntityLinks(links, [trigger.id], 'none')).toHaveLength(0);
    expect(selectedEntityIdsForLinks(document, { brushId: doorBrush.id })).toEqual([door.id]);
    expect(
      selectedEntityIdsForLinks(document, {
        brushId: doorBrush.id,
        faceId: doorBrush.faces[0]!.id,
      }),
    ).toEqual([door.id]);
  });

  it('groups mixed objects as one recursive selection and ungroups them without losing ownership', () => {
    const ids = createSequentialIdFactory('editor-groups');
    const starter = createStarterDocument();
    const worldBrush = createBoxBrush([-96, -24, 0], [-48, 24, 48], 'WORLD', ids);
    const detailBrush = createBoxBrush([16, -24, 0], [64, 24, 48], 'DETAIL', ids);
    const light = {
      id: ids.entity(),
      properties: { classname: 'light', origin: '112 0 24' },
      primitives: [],
    };
    const detail = {
      id: ids.entity(),
      properties: { classname: 'func_detail' },
      primitives: [detailBrush],
    };
    const document: MapDocument = {
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [worldBrush] }, detail, light],
    };
    const session = new EditorSession(document);
    session.select(createObjectSelection([worldBrush.id, detailBrush.id], [light.id]));
    const groupId = session.groupSelected('Door assembly', ids)!;

    const [group] = deriveEditorGroups(session.document);
    expect(group).toMatchObject({
      id: groupId,
      name: 'Door assembly',
      directBrushIds: [worldBrush.id],
      directEntityIds: [detail.id, light.id],
      brushIds: [worldBrush.id, detailBrush.id],
      pointEntityIds: [light.id],
      bounds: { min: [-96, -24, 0], max: [120, 24, 48] },
    });
    expect(
      session.document.entities.find((entity) => entity.id === detail.id)!.properties['_tb_group'],
    ).toBe(groupId);
    expect(editorGroupForObject(session.document, { brushId: detailBrush.id })).toMatchObject({
      id: groupId,
    });
    expect(editorGroupForObject(session.document, { brushId: detailBrush.id }, groupId)).toBeNull();
    expect(selectedEditorGroup(session.document, session.selection)).toMatchObject({ id: groupId });

    expect(session.translateSelected([16, 0, 0])).toBe(true);
    expect(deriveBrush(findBrush(session.document, worldBrush.id)!).bounds?.min[0]).toBe(-80);
    expect(deriveBrush(findBrush(session.document, detailBrush.id)!).bounds?.min[0]).toBe(32);
    expect(
      parseEntityOrigin(session.document.entities.find((entity) => entity.id === light.id)!),
    ).toEqual([128, 0, 24]);
    expect(session.renameGroup(groupId, 'Moved assembly')).toBe(true);
    expect(deriveEditorGroups(session.document)[0]!.name).toBe('Moved assembly');

    expect(session.ungroupSelected(groupId)).toBe(true);
    expect(deriveEditorGroups(session.document)).toHaveLength(0);
    expect(
      session.document.entities[0]!.primitives.some((brush) => brush.id === worldBrush.id),
    ).toBe(true);
    expect(
      session.document.entities.find((entity) => entity.id === detail.id)!.properties['_tb_group'],
    ).toBeUndefined();
    expect(selectedBrushIds(session.selection)).toEqual([worldBrush.id, detailBrush.id]);
    expect(selectedPointEntityIds(session.selection)).toEqual([light.id]);
    expect(session.undo()).toBe(true);
    expect(deriveEditorGroups(session.document)[0]!.name).toBe('Moved assembly');
  });

  it('copies, pastes, and duplicates point-only groups with fresh persistent group IDs', () => {
    const ids = createSequentialIdFactory('point-groups');
    const starter = createStarterDocument();
    const pointIds = starter.entities.slice(1).map((entity) => entity.id);
    const session = new EditorSession(starter);
    session.select(createObjectSelection([], pointIds));
    const sourceGroupId = session.groupSelected('Signals', ids)!;
    const clipboard = createObjectClipboardDocument(session.document, session.selection)!;
    expect(deriveEditorGroups(clipboard)).toHaveLength(1);
    expect(
      clipboard.entities.find((entity) => entity.properties['_tb_id'] === sourceGroupId)
        ?.primitives,
    ).toEqual([]);

    const pasted = session.createPasteCandidate(
      clipboard,
      createSequentialIdFactory('point-group-paste'),
      [256, 0, 0],
    )!;
    const pastedGroups = deriveEditorGroups(pasted.document);
    expect(pastedGroups).toHaveLength(2);
    expect(new Set(pastedGroups.map((group) => group.id)).size).toBe(2);
    expect(selectedEditorGroup(pasted.document, pasted.selectionAfter)?.id).not.toBe(sourceGroupId);
    session.commitDocumentCandidate(pasted);

    expect(
      session.duplicateSelected(createSequentialIdFactory('point-group-duplicate'), [0, 128, 0]),
    ).toBe(true);
    expect(deriveEditorGroups(session.document)).toHaveLength(3);
    expect(selectedEditorGroup(session.document, session.selection)).not.toBeNull();
  });

  it('creates and resolves nested groups inside an open parent editing context', () => {
    const ids = createSequentialIdFactory('nested-groups');
    const starter = createStarterDocument();
    const first = createBoxBrush([-64, -16, 0], [-32, 16, 32], 'FIRST', ids);
    const second = createBoxBrush([32, -16, 0], [64, 16, 32], 'SECOND', ids);
    const document: MapDocument = {
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [first, second] }],
    };
    const session = new EditorSession(document);
    session.select(createObjectSelection([first.id, second.id], []));
    const outerId = session.groupSelected('Outer', ids)!;
    session.select({ brushId: first.id });
    const innerId = session.groupSelected('Inner', ids, outerId)!;
    const groups = deriveEditorGroups(session.document);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.id === innerId)).toMatchObject({
      parentGroupId: outerId,
      brushIds: [first.id],
    });
    expect(groups.find((group) => group.id === outerId)).toMatchObject({
      childGroupIds: [innerId],
      brushIds: [second.id, first.id],
    });
    expect(editorGroupForObject(session.document, { brushId: first.id }, outerId)?.id).toBe(
      innerId,
    );
    expect(editorGroupForObject(session.document, { brushId: second.id }, outerId)).toBeNull();

    expect(session.ungroupSelected(innerId)).toBe(true);
    expect(deriveEditorGroups(session.document)).toHaveLength(1);
    expect(deriveEditorGroups(session.document)[0]!.brushIds).toEqual([second.id, first.id]);
  });

  it('keeps transformed linked duplicates synchronized while preserving protected properties', () => {
    const ids = createSequentialIdFactory('linked-groups');
    const starter = createStarterDocument();
    const doorway = createBoxBrush([-32, -16, 0], [32, 16, 64], 'DOORWAY', ids);
    const marker = {
      id: ids.entity(),
      properties: {
        classname: 'info_target',
        origin: '0 0 32',
        angle: '90',
        targetname: 'door_a',
      },
      primitives: [],
    };
    const document: MapDocument = {
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [doorway] }, marker],
    };
    const session = new EditorSession(document);
    session.select(createObjectSelection([doorway.id], [marker.id]));
    const sourceId = session.groupSelected('Doorway', ids)!;
    const duplicateId = session.linkedDuplicateSelected(ids, [128, 0, 0])!;
    let groups = deriveEditorGroups(session.document);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((group) => group.linkedGroupId)).size).toBe(1);
    expect(groups.find((group) => group.id === sourceId)?.transformation).toBe(
      '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1',
    );
    expect(groups.find((group) => group.id === duplicateId)?.transformation).toBe(
      '1 0 0 128 0 1 0 0 0 0 1 0 0 0 0 1',
    );

    session.setEditingGroup(sourceId);
    session.select({ brushId: doorway.id });
    expect(session.translateSelected([0, 0, 16])).toBe(true);
    groups = deriveEditorGroups(session.document);
    const duplicate = groups.find((group) => group.id === duplicateId)!;
    const duplicateBrush = findBrush(session.document, duplicate.brushIds[0]!)!;
    expect(deriveBrush(duplicateBrush).bounds).toEqual({
      min: [96, -16, 16],
      max: [160, 16, 80],
    });
    const duplicateMarker = session.document.entities.find(
      (entity) => entity.id === duplicate.pointEntityIds[0],
    )!;
    expect(parseEntityOrigin(duplicateMarker)).toEqual([128, 0, 32]);

    session.setEditingGroup(null);
    session.select(selectionForEditorGroup(duplicate));
    expect(session.rotateSelected([128, 0, 0], 2, 90)).toBe(true);
    expect(
      deriveEditorGroups(session.document).find((group) => group.id === duplicateId)
        ?.transformation,
    ).toBe('0 -1 0 128 1 0 0 0 0 0 1 0 0 0 0 1');
    session.setEditingGroup(sourceId);
    session.select({ brushId: doorway.id });
    expect(session.translateSelected([16, 0, 0])).toBe(true);
    const rotatedDuplicate = deriveEditorGroups(session.document).find(
      (group) => group.id === duplicateId,
    )!;
    expect(deriveBrush(findBrush(session.document, rotatedDuplicate.brushIds[0]!)!).bounds).toEqual(
      { min: [112, -16, 16], max: [144, 48, 80] },
    );

    session.setEditingGroup(duplicateId);
    const rotatedDuplicateMarker = session.document.entities.find(
      (entity) => entity.id === rotatedDuplicate.pointEntityIds[0],
    )!;
    session.select({ entityId: rotatedDuplicateMarker.id });
    expect(session.setEntityPropertyProtected(rotatedDuplicateMarker.id, 'angle', true)).toBe(true);
    expect(session.setEntityProperty(rotatedDuplicateMarker.id, 'angle', '270')).toBe(true);
    const sourceMarker = session.document.entities.find(
      (entity) =>
        entity.id ===
        deriveEditorGroups(session.document).find((group) => group.id === sourceId)!
          .pointEntityIds[0],
    )!;
    expect(sourceMarker.properties.angle).toBe('90');

    session.setEditingGroup(sourceId);
    session.select({ entityId: sourceMarker.id });
    expect(session.setEntityProperty(sourceMarker.id, 'targetname', 'door_shared')).toBe(true);
    const refreshedDuplicate = deriveEditorGroups(session.document).find(
      (group) => group.id === duplicateId,
    )!;
    const refreshedMarker = session.document.entities.find(
      (entity) => entity.id === refreshedDuplicate.pointEntityIds[0],
    )!;
    expect(refreshedMarker.properties.targetname).toBe('door_shared');
    expect(refreshedMarker.properties.angle).toBe('270');
    expect(refreshedMarker.properties['_tb_protected_properties']).toBe('angle');

    session.setEditingGroup(duplicateId);
    session.select({ entityId: refreshedMarker.id });
    expect(session.setEntityPropertyProtected(refreshedMarker.id, 'angle', false)).toBe(true);
    expect(
      session.document.entities.find((entity) => entity.id === refreshedMarker.id)?.properties
        .angle,
    ).toBe('90');
    expect(session.unlinkGroup(duplicateId)).toBe(true);
    expect(
      deriveEditorGroups(session.document).every((group) => group.linkedGroupId === null),
    ).toBe(true);
    expect(session.undo()).toBe(true);
    expect(
      deriveEditorGroups(session.document).every((group) => group.linkedGroupId !== null),
    ).toBe(true);
  });

  it('rebuilds nested group trees in every linked copy after component edits', () => {
    const ids = createSequentialIdFactory('nested-linked-groups');
    const starter = createStarterDocument();
    const frame = createBoxBrush([-64, -16, 0], [-32, 16, 64], 'FRAME', ids);
    const inset = createBoxBrush([-16, -16, 0], [16, 16, 32], 'INSET', ids);
    const document: MapDocument = {
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [frame, inset] }],
    };
    const session = new EditorSession(document);
    session.select(createObjectSelection([frame.id, inset.id], []));
    const outerId = session.groupSelected('Door module', ids)!;
    session.select({ brushId: inset.id });
    const innerId = session.groupSelected('Inset', ids, outerId)!;
    session.select(
      selectionForEditorGroup(
        deriveEditorGroups(session.document).find((group) => group.id === outerId)!,
      ),
    );
    const duplicateId = session.linkedDuplicateSelected(ids, [256, 0, 0])!;

    session.setEditingGroup(outerId);
    session.select({ brushId: inset.id, faceId: inset.faces[0]!.id });
    expect(session.applyMaterial('UPDATED_INSET')).toBe(true);
    const groups = deriveEditorGroups(session.document);
    const duplicate = groups.find((group) => group.id === duplicateId)!;
    expect(duplicate.childGroupIds).toHaveLength(1);
    const duplicateInner = groups.find((group) => group.id === duplicate.childGroupIds[0])!;
    expect(duplicateInner.parentGroupId).toBe(duplicateId);
    expect(duplicateInner.brushIds).toHaveLength(1);
    const copiedInset = findBrush(session.document, duplicateInner.brushIds[0]!)!;
    expect(copiedInset.faces[0]!.material).toBe('UPDATED_INSET');
    expect(deriveBrush(copiedInset).bounds).toEqual({
      min: [240, -16, 0],
      max: [272, 16, 32],
    });
    expect(groups.find((group) => group.id === innerId)).not.toBeNull();
    expect(session.undo()).toBe(true);
    const restoredDuplicate = deriveEditorGroups(session.document).find(
      (group) => group.id === duplicateId,
    )!;
    const restoredInner = deriveEditorGroups(session.document).find(
      (group) => group.id === restoredDuplicate.childGroupIds[0],
    )!;
    expect(findBrush(session.document, restoredInner.brushIds[0]!)!.faces[0]!.material).toBe(
      'INSET',
    );
  });

  it('decodes TrenchBroom protected-property lists including escaped delimiters', () => {
    const ids = createSequentialIdFactory('protected-property-list');
    expect(
      protectedEntityProperties({
        id: ids.entity(),
        properties: {
          classname: 'info_target',
          _tb_protected_properties: String.raw`origin;target;with\;semicolon;path\\name`,
        },
        primitives: [],
      }),
    ).toEqual(['origin', 'target', 'with;semicolon', 'path\\name']);
  });

  it('rotates point origins and adapts angle, angles, and light mangle conventions', () => {
    const ids = createSequentialIdFactory('point-rotation');
    const player = {
      id: ids.entity(),
      properties: { classname: 'info_player_start', origin: '16 0 8', angle: '30' },
      primitives: [],
    };
    const rotatedPlayer = rotatePointEntity(player, [0, 0, 0], 2, 90);
    expect(parseEntityOrigin(rotatedPlayer)).toEqual([0, 16, 8]);
    expect(rotatedPlayer.properties.angle).toBe('120');
    expect(pointEntityYawDegrees(rotatedPlayer)).toBe(120);
    expect(rotatePointEntity(player, [0, 0, 0], 2, 90, false).properties.angle).toBe('30');

    const angled = {
      id: ids.entity(),
      properties: { classname: 'monster_ogre', origin: '0 0 0', angles: '0 0 0' },
      primitives: [],
    };
    expect(rotatePointEntity(angled, [0, 0, 0], 0, 15).properties.angles).toBe('0 0 15');
    expect(rotatePointEntity(angled, [0, 0, 0], 1, 15).properties.angles).toBe('15 0 0');
    expect(rotatePointEntity(angled, [0, 0, 0], 2, 15).properties.angles).toBe('0 15 0');

    const spotlight = {
      id: ids.entity(),
      properties: { classname: 'light_spot', origin: '0 0 0', mangle: '0 0 0' },
      primitives: [],
    };
    expect(rotatePointEntity(spotlight, [0, 0, 0], 1, 15).properties.mangle).toBe('0 -15 0');
    expect(rotatePointEntity(spotlight, [0, 0, 0], 2, 15).properties.mangle).toBe('15 0 0');
  });

  it('mirrors point origins and horizontal headings using world-axis planes', () => {
    const entity = {
      id: createSequentialIdFactory('point-flip').entity(),
      properties: { classname: 'info_player_start', origin: '32 16 8', angle: '45' },
      primitives: [],
    };

    const flippedX = flipPointEntity(entity, [0, 0, 0], 0);
    expect(parseEntityOrigin(flippedX)).toEqual([-32, 16, 8]);
    expect(flippedX.properties.angle).toBe('135');
    const flippedY = flipPointEntity(entity, [0, 0, 0], 1);
    expect(parseEntityOrigin(flippedY)).toEqual([32, -16, 8]);
    expect(flippedY.properties.angle).toBe('315');
    expect(flipPointEntity(entity, [0, 0, 0], 1, false).properties.angle).toBe('45');

    const vertical = {
      ...entity,
      properties: { ...entity.properties, angle: '-1' },
    };
    expect(flipPointEntity(vertical, [0, 0, 0], 2).properties.angle).toBe('-2');

    const euler = {
      ...entity,
      properties: { classname: 'monster_ogre', origin: '0 0 0', angles: '45 0 10' },
    };
    expect(flipPointEntity(euler, [0, 0, 0], 0).properties.angles).toBe('45 180 -10');
  });

  it('rotates and flips mixed brush/entity selections as atomic document edits', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const player = document.entities.find(
      (entity) => entity.properties.classname === 'info_player_start',
    )!;
    const selection = createObjectSelection([brush.id], [player.id], {
      kind: 'entity',
      entityId: player.id,
    })!;
    const session = new EditorSession(document);
    session.select(selection);

    const rotation = session.createObjectRotationCandidate(selection, [0, 0, 0], 2, 90);
    expect(rotation?.label).toBe('Rotate objects');
    expect(rotation?.document.revision).toBe(1);
    expect(
      parseEntityOrigin(rotation!.document.entities.find((entity) => entity.id === player.id)!),
    ).toEqual([96, 0, 24]);
    expect(
      rotation!.document.entities.find((entity) => entity.id === player.id)!.properties.angle,
    ).toBe('180');
    expect(deriveBrush(findBrush(rotation!.document, brush.id)!).valid).toBe(true);

    session.commitDocumentCandidate(rotation!);
    expect(session.document.revision).toBe(1);
    expect(session.undo()).toBe(true);
    expect(
      parseEntityOrigin(session.document.entities.find((entity) => entity.id === player.id)!),
    ).toEqual([0, -96, 24]);
    expect(session.redo()).toBe(true);

    const flipped = session.createObjectFlipCandidate(session.selection!, [0, 0, 0], 0);
    expect(flipped?.label).toBe('Flip objects');
    expect(deriveBrush(findBrush(flipped!.document, brush.id)!).valid).toBe(true);
    expect(
      parseEntityOrigin(flipped!.document.entities.find((entity) => entity.id === player.id)!),
    ).toEqual([-96, 0, 24]);
  });

  it('creates, moves, duplicates, deletes, and restores point entities transactionally', () => {
    const session = new EditorSession(createStarterDocument());
    const ids = createSequentialIdFactory('point-session');

    expect(session.createPointEntity('light', [32, 48, 64], ids)).toBe(true);
    const createdId = session.selection!.entityId!;
    expect(selectedPointEntityIds(session.selection)).toEqual([createdId]);
    expect(
      parseEntityOrigin(session.document.entities.find((entity) => entity.id === createdId)!),
    ).toEqual([32, 48, 64]);

    const move = session.createObjectTranslationCandidate(session.selection!, [16, -16, 32]);
    expect(move).not.toBeNull();
    expect(
      parseEntityOrigin(move!.document.entities.find((entity) => entity.id === createdId)!),
    ).toEqual([48, 32, 96]);
    session.commitDocumentCandidate(move!);
    expect(session.undo()).toBe(true);
    expect(
      parseEntityOrigin(session.document.entities.find((entity) => entity.id === createdId)!),
    ).toEqual([32, 48, 64]);
    expect(session.redo()).toBe(true);

    expect(session.duplicateSelected(ids, [16, 0, 0])).toBe(true);
    const duplicateId = session.selection!.entityId!;
    expect(duplicateId).not.toBe(createdId);
    expect(
      parseEntityOrigin(session.document.entities.find((entity) => entity.id === duplicateId)!),
    ).toEqual([64, 32, 96]);
    expect(session.deleteSelected()).toBe(true);
    expect(session.document.entities.some((entity) => entity.id === duplicateId)).toBe(false);
    expect(session.undo()).toBe(true);
    expect(session.document.entities.some((entity) => entity.id === duplicateId)).toBe(true);
  });

  it('converts selected brushes into a brush entity and makes them structural again', () => {
    const base = createStarterDocument();
    const sourceBrushes = brushesInDocument(base)
      .slice(0, 2)
      .map((brush) =>
        Object.assign({}, brush, {
          faces: brush.faces.map((face) =>
            Object.assign({}, face, {
              surface: { ...face.surface, contents: 1 },
            }),
          ),
        }),
      );
    const selectedById = new Map(sourceBrushes.map((brush) => [brush.id, brush] as const));
    const document = Object.assign({}, base, {
      entities: base.entities.map((entity) => ({
        id: entity.id,
        properties: entity.properties,
        primitives: entity.primitives.map((brush) => selectedById.get(brush.id) ?? brush),
      })),
    });
    const session = new EditorSession(document);
    session.select(createBrushSelection(sourceBrushes.map((brush) => brush.id)));

    expect(
      session.createBrushEntity('func_detail', createSequentialIdFactory('brush-entity')),
    ).toBe(true);
    const detail = session.document.entities.find(
      (entity) => entity.properties.classname === 'func_detail',
    );
    expect(detail?.primitives.map((brush) => brush.id)).toEqual(
      sourceBrushes.map((brush) => brush.id),
    );
    expect(session.undo()).toBe(true);
    expect(
      session.document.entities.some((entity) => entity.properties.classname === 'func_detail'),
    ).toBe(false);
    expect(session.redo()).toBe(true);

    expect(session.makeSelectedStructural()).toBe(true);
    const worldspawn = session.document.entities.find(
      (entity) => entity.properties.classname === 'worldspawn',
    )!;
    expect(worldspawn.primitives.map((brush) => brush.id)).toEqual(
      expect.arrayContaining(sourceBrushes.map((brush) => brush.id)),
    );
    expect(
      worldspawn.primitives
        .filter((brush) => brush.kind === 'brush')
        .filter((brush) => selectedById.has(brush.id))
        .every((brush) => brush.faces.every((face) => face.surface.contents === undefined)),
    ).toBe(true);
    expect(
      session.document.entities.some((entity) => entity.properties.classname === 'func_detail'),
    ).toBe(false);
    expect(session.undo()).toBe(true);
    expect(
      session.document.entities.find((entity) => entity.properties.classname === 'func_detail')
        ?.primitives,
    ).toHaveLength(2);
  });
});

describe('TrenchBroom-compatible layers', () => {
  it('derives recursive layer membership and preserves metadata through map serialization', () => {
    const fixture = layerFixture();
    const document: MapDocument = {
      ...fixture.document,
      entities: fixture.document.entities.map((entity) =>
        entity.id === fixture.layerEntity.id
          ? {
              ...entity,
              properties: {
                ...entity.properties,
                _tb_layer_hidden: '1',
                _tb_layer_locked: '1',
                _tb_layer_omit_from_export: '1',
              },
            }
          : entity,
      ),
    };

    expect(isEditorLayerEntity(fixture.layerEntity)).toBe(true);
    const layers = deriveEditorLayers(document);
    expect(layers.map((layer) => layer.name)).toEqual(['Default Layer', 'Architecture']);
    expect(layers[0]).toMatchObject({ id: null, brushIds: [fixture.defaultBrush.id] });
    expect(layers[1]).toMatchObject({
      id: '7',
      entityId: fixture.layerEntity.id,
      sortIndex: 3,
      hidden: true,
      locked: true,
      omitFromExport: true,
      groupIds: ['8', '9'],
      bounds: { min: [-32, -32, 0], max: [160, 104, 56] },
    });
    expect(new Set(layers[1]!.brushIds)).toEqual(
      new Set([
        fixture.layerBrush.id,
        fixture.detailBrush.id,
        fixture.groupBrush.id,
        fixture.nestedBrush.id,
      ]),
    );
    expect(new Set(layers[1]!.entityIds)).toEqual(
      new Set([fixture.detail.id, fixture.marker.id, fixture.groupedMarker.id]),
    );

    const reparsed = parseMap(serializeMap(document), createSequentialIdFactory('layers-reparsed'));
    expect(deriveEditorLayers(reparsed)).toMatchObject([
      { name: 'Default Layer', brushIds: expect.arrayContaining([expect.any(String)]) },
      {
        id: '7',
        name: 'Architecture',
        hidden: true,
        locked: true,
        omitFromExport: true,
        groupIds: ['8', '9'],
        brushIds: expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
        ]),
      },
    ]);
  });

  it('uses the active layer for insertion and paste, and applies layer visibility to editing', () => {
    const fixture = layerFixture();
    const session = new EditorSession(fixture.document);
    const ids = createSequentialIdFactory('layer-session');
    const gameplayId = session.createLayer('Gameplay', ids);

    expect(session.activeLayerId).toBe(gameplayId);
    const createdBrush = createBoxBrush([192, -32, 0], [224, 32, 32], 'GAMEPLAY', ids);
    session.commitCreationCandidate(session.createBrushCandidate(createdBrush));
    expect(session.createPointEntity('light', [208, 96, 32], ids)).toBe(true);
    const createdPointId = session.selection!.entityId!;
    expect(
      deriveEditorLayers(session.document).find((layer) => layer.id === gameplayId),
    ).toMatchObject({
      brushIds: [createdBrush.id],
      pointEntityIds: [createdPointId],
    });
    expect(
      session.document.entities.find((entity) => entity.id === createdPointId)!.properties[
        '_tb_layer'
      ],
    ).toBe(gameplayId);

    const beforePaste = deriveEditorLayers(session.document).find(
      (layer) => layer.id === gameplayId,
    )!;
    expect(
      session.pasteObjects(createStarterDocument(), createSequentialIdFactory('layer-paste')),
    ).toBe(true);
    const afterPaste = deriveEditorLayers(session.document).find(
      (layer) => layer.id === gameplayId,
    )!;
    expect(afterPaste.brushIds.length).toBeGreaterThan(beforePaste.brushIds.length);
    expect(afterPaste.pointEntityIds.length).toBeGreaterThan(beforePaste.pointEntityIds.length);

    session.selectBrush(fixture.layerBrush.id);
    expect(session.moveSelectedToLayer(gameplayId)).toBe(true);
    expect(
      deriveEditorLayers(session.document)
        .find((layer) => layer.id === gameplayId)!
        .brushIds.includes(fixture.layerBrush.id),
    ).toBe(true);
    expect(session.setLayerFlag(gameplayId, 'hidden', true)).toBe(true);
    expect(session.selection).toBeNull();
    expect(session.objectViewState.hiddenBrushIds).toContain(createdBrush.id);
    expect(() => session.selectBrush(createdBrush.id)).toThrow(/hidden or locked brush/);
    expect(session.setLayerFlag(gameplayId, 'hidden', false)).toBe(true);
    expect(session.setLayerFlag(gameplayId, 'locked', true)).toBe(true);
    expect(() => session.selectPointEntity(createdPointId)).toThrow(
      /hidden or locked point entity/,
    );
    expect(session.setLayerFlag(gameplayId, 'locked', false)).toBe(true);
    expect(session.selectAllInLayer(gameplayId)).not.toBeNull();
  });

  it('moves custom-layer contents to Default when removing a layer and restores them on undo', () => {
    const fixture = layerFixture();
    const session = new EditorSession(fixture.document);

    expect(session.removeLayer('7')).toBe(true);
    expect(deriveEditorLayers(session.document)).toHaveLength(1);
    expect(
      session.document.entities[0]!.primitives.some((brush) => brush.id === fixture.layerBrush.id),
    ).toBe(true);
    expect(
      session.document.entities.find((entity) => entity.id === fixture.detail.id)!.properties[
        '_tb_layer'
      ],
    ).toBeUndefined();
    expect(
      session.document.entities.find((entity) => entity.id === fixture.rootGroup.id)!.properties[
        '_tb_layer'
      ],
    ).toBeUndefined();

    expect(session.undo()).toBe(true);
    expect(deriveEditorLayers(session.document).map((layer) => layer.id)).toEqual([null, '7']);
    expect(
      session.document.entities.find((entity) => entity.id === fixture.rootGroup.id)!.properties[
        '_tb_layer'
      ],
    ).toBe('7');
  });

  it('keeps grouping and ungrouping structural objects inside their custom layer', () => {
    const fixture = layerFixture();
    const session = new EditorSession(fixture.document);
    const ids = createSequentialIdFactory('layer-grouping');
    session.setActiveLayer('7');
    session.select(createObjectSelection([fixture.layerBrush.id], [fixture.marker.id]));

    const groupId = session.groupSelected('Layer assembly', ids)!;
    const groupEntity = session.document.entities.find(
      (entity) => entity.properties['_tb_id'] === groupId,
    )!;
    expect(groupEntity.properties['_tb_layer']).toBe('7');
    expect(groupEntity.primitives.map((brush) => brush.id)).toEqual([fixture.layerBrush.id]);
    expect(
      session.document.entities.find((entity) => entity.id === fixture.marker.id)!.properties[
        '_tb_group'
      ],
    ).toBe(groupId);

    expect(session.ungroupSelected(groupId)).toBe(true);
    expect(
      session.document.entities.find((entity) => entity.id === fixture.layerEntity.id)!.primitives,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: fixture.layerBrush.id })]));
    expect(
      session.document.entities.find((entity) => entity.id === fixture.marker.id)!.properties,
    ).toMatchObject({ _tb_layer: '7' });
  });

  it('filters omitted default and custom layer contents only from the compile/export document', () => {
    const fixture = layerFixture();
    const customSession = new EditorSession(fixture.document);
    expect(customSession.setLayerFlag('7', 'omit-from-export', true)).toBe(true);
    const customExport = documentWithoutOmittedLayers(customSession.document);
    expect(brushesInDocument(customExport).map((brush) => brush.id)).toEqual([
      fixture.defaultBrush.id,
    ]);
    expect(customExport.entities.some(isEditorLayerEntity)).toBe(false);
    expect(customExport.entities.some(isEditorGroupEntity)).toBe(false);
    expect(customSession.document.entities.some(isEditorLayerEntity)).toBe(true);

    const defaultSession = new EditorSession(fixture.document);
    expect(defaultSession.setLayerFlag(null, 'omit-from-export', true)).toBe(true);
    const defaultExport = documentWithoutOmittedLayers(defaultSession.document);
    expect(
      brushesInDocument(defaultExport).some((brush) => brush.id === fixture.defaultBrush.id),
    ).toBe(false);
    expect(defaultExport.entities.some((entity) => entity.id === fixture.layerEntity.id)).toBe(
      true,
    );
    expect(
      deriveEditorLayers(defaultExport).find((layer) => layer.id === '7')!.brushIds.length,
    ).toBe(4);
  });
});

describe('object visibility and locking', () => {
  it('hides a mixed selection without dirtying the map and restores it through history', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[0]!;
    const entity = document.entities.find((candidate) => candidate.primitives.length === 0)!;
    const selection = createObjectSelection([brush.id], [entity.id], {
      kind: 'entity',
      entityId: entity.id,
    })!;
    const session = new EditorSession(document);
    session.select(selection);

    expect(session.hideSelected()).toBe(true);
    expect(session.document).toBe(document);
    expect(session.document.revision).toBe(0);
    expect(session.selection).toBeNull();
    expect(session.objectViewState).toEqual({
      hiddenBrushIds: [brush.id],
      hiddenEntityIds: [entity.id],
      lockedBrushIds: [],
      lockedEntityIds: [],
    });
    expect(() => session.selectBrush(brush.id)).toThrow(/hidden or locked brush/);

    expect(session.undo()).toBe(true);
    expect(session.objectViewState.hiddenBrushIds).toEqual([]);
    expect(session.objectViewState.hiddenEntityIds).toEqual([]);
    expect(session.selection).toEqual(selection);
    expect(session.document.revision).toBe(0);
    expect(session.redo()).toBe(true);
    expect(session.selection).toBeNull();
    expect(session.objectViewState.hiddenBrushIds).toEqual([brush.id]);
  });

  it('isolates selected objects, shows all, and keeps both operations undoable', () => {
    const document = createStarterDocument();
    const brushes = brushesInDocument(document);
    const entity = document.entities.find((candidate) => candidate.primitives.length === 0)!;
    const selection = createObjectSelection([brushes[0]!.id], [entity.id], {
      kind: 'brush',
      brushId: brushes[0]!.id,
    })!;
    const session = new EditorSession(document);
    session.select(selection);

    expect(session.isolateSelected()).toBe(true);
    expect(session.selection).toEqual(selection);
    expect(session.objectViewState.hiddenBrushIds).toEqual(
      brushes.slice(1).map((brush) => brush.id),
    );
    expect(session.objectViewState.hiddenEntityIds).toEqual(
      document.entities
        .filter((candidate) => candidate.primitives.length === 0 && candidate.id !== entity.id)
        .map((candidate) => candidate.id),
    );
    expect(session.canShowAll).toBe(true);

    expect(session.showAll()).toBe(true);
    expect(session.canShowAll).toBe(false);
    expect(session.undo()).toBe(true);
    expect(session.objectViewState.hiddenBrushIds).toEqual(
      brushes.slice(1).map((brush) => brush.id),
    );
    expect(session.redo()).toBe(true);
    expect(session.objectViewState.hiddenBrushIds).toEqual([]);
  });

  it('locks mixed objects against selection and unlocks them without changing source data', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[1]!;
    const entity = document.entities.find((candidate) => candidate.primitives.length === 0)!;
    const session = new EditorSession(document);
    session.select(createObjectSelection([brush.id], [entity.id])!);

    expect(session.lockSelected()).toBe(true);
    expect(session.selection).toBeNull();
    expect(session.objectViewState.lockedBrushIds).toEqual([brush.id]);
    expect(session.objectViewState.lockedEntityIds).toEqual([entity.id]);
    expect(session.document).toBe(document);
    expect(() => session.selectPointEntity(entity.id)).toThrow(/hidden or locked point entity/);

    expect(session.unlockAll()).toBe(true);
    expect(session.canUnlockAll).toBe(false);
    expect(session.undo()).toBe(true);
    expect(session.objectViewState.lockedBrushIds).toEqual([brush.id]);
    expect(session.undo()).toBe(true);
    expect(session.selection).not.toBeNull();
    expect(session.objectViewState.lockedBrushIds).toEqual([]);
  });
});

describe('selection brush queries', () => {
  it('distinguishes touching, enclosed, and orthographically enclosed objects', () => {
    const { document, query, inside, crossing, elevated, marker } = selectionQueryFixture();

    expect(querySelectionBrushes(document, [query.id], { mode: 'touching' })).toEqual({
      brushIds: [inside.id, crossing.id],
      entityIds: [marker.id],
    });
    expect(querySelectionBrushes(document, [query.id], { mode: 'inside' })).toEqual({
      brushIds: [inside.id],
      entityIds: [marker.id],
    });
    expect(
      querySelectionBrushes(document, [query.id], {
        mode: 'inside-projected',
        projection: 'xy',
      }),
    ).toEqual({
      brushIds: [inside.id, elevated.id],
      entityIds: [marker.id],
    });
    expect(() => querySelectionBrushes(document, [query.id], { mode: 'inside-projected' })).toThrow(
      /orthographic projection/,
    );
  });

  it('consumes selection brushes atomically, excludes locked targets, and restores through undo', () => {
    const { document, query, inside, crossing, marker } = selectionQueryFixture();
    const session = new EditorSession(document);
    session.selectBrush(crossing.id);
    expect(session.lockSelected()).toBe(true);
    session.selectBrush(query.id);

    const result = session.selectWithSelectionBrushes('inside');

    expect(result).toMatchObject({
      removedBrushCount: 1,
      selectedBrushCount: 1,
      selectedEntityCount: 1,
    });
    expect(findBrush(session.document, query.id)).toBeNull();
    expect(selectedBrushIds(session.selection)).toEqual([inside.id]);
    expect(selectedPointEntityIds(session.selection)).toEqual([marker.id]);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Select enclosed objects');

    expect(session.undo()).toBe(true);
    expect(findBrush(session.document, query.id)).not.toBeNull();
    expect(session.selection).toEqual({ brushId: query.id });
    expect(session.objectViewState.lockedBrushIds).toEqual([crossing.id]);
    expect(session.redo()).toBe(true);
    expect(findBrush(session.document, query.id)).toBeNull();
    expect(selectedBrushIds(session.selection)).toEqual([inside.id]);
  });

  it('selects all and inverts only within the editable visibility set', () => {
    const { document, query, inside, crossing, outside, elevated, marker, remoteMarker } =
      selectionQueryFixture();
    const session = new EditorSession(document);
    session.selectBrush(outside.id);
    expect(session.hideSelected()).toBe(true);
    session.selectBrush(crossing.id);
    expect(session.lockSelected()).toBe(true);

    session.selectBrush(inside.id);
    session.invertObjectSelection();
    expect(selectedBrushIds(session.selection)).toEqual([query.id, elevated.id]);
    expect(selectedPointEntityIds(session.selection)).toEqual([marker.id, remoteMarker.id]);
    session.selectAllEditable();
    expect(selectedBrushIds(session.selection)).toEqual([query.id, inside.id, elevated.id]);
    expect(selectedPointEntityIds(session.selection)).toEqual([marker.id, remoteMarker.id]);
    expect(session.document).toBe(document);
  });
});

describe('command repetition', () => {
  it('replays a staircase-style duplicate, move, and rotate sequence as one undo step', () => {
    const { document, first } = repetitionFixture();
    const session = new EditorSession(document);
    session.selectBrush(first.id);

    expect(
      session.duplicateSelected(createSequentialIdFactory('repeat-first-copy'), [0, 0, 0]),
    ).toBe(true);
    expect(session.translateSelected([64, 0, 16])).toBe(true);
    expect(session.rotateSelected([0, 0, 0], 2, 90)).toBe(true);
    expect(session.repeatCommandLabels).toEqual(['Duplicate', 'Move', 'Rotate']);
    expect(session.canRepeatCommands).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(3);
    expect(session.document.revision).toBe(3);

    expect(session.repeatLastCommands()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(4);
    expect(session.document.revision).toBe(4);
    expect(session.undoLabel).toBe('Repeat 3 commands');
    expect(session.repeatCommandCount).toBe(3);
    const repeated = findBrush(session.document, selectedBrushIds(session.selection)[0]!)!;
    const repeatedBounds = deriveBrush(repeated).bounds!;
    expect(repeatedBounds.min[0]).toBeCloseTo(-80);
    expect(repeatedBounds.min[1]).toBeCloseTo(48);
    expect(repeatedBounds.min[2]).toBeCloseTo(32);
    expect(repeatedBounds.max[0]).toBeCloseTo(-64);
    expect(repeatedBounds.max[1]).toBeCloseTo(64);
    expect(repeatedBounds.max[2]).toBeCloseTo(48);

    expect(session.undo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(3);
    expect(session.canRepeatCommands).toBe(false);
    expect(session.repeatCommandCount).toBe(0);
    expect(session.redo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(4);
  });

  it('records only committed candidates and resets after a manual selection change or clear', () => {
    const { document, first, second } = repetitionFixture();
    const session = new EditorSession(document);
    session.selectBrush(first.id);
    expect(session.translateSelected([16, 0, 0])).toBe(true);
    expect(session.repeatCommandLabels).toEqual(['Move']);

    session.selectBrush(second.id);
    expect(session.repeatCommandCount).toBe(0);
    expect(session.repeatLastCommands()).toBe(false);
    const candidate = session.createObjectRotationCandidate(session.selection!, [0, 0, 0], 2, 45)!;
    expect(session.repeatCommandCount).toBe(0);
    session.commitDocumentCandidate(candidate);
    expect(session.repeatCommandLabels).toEqual(['Rotate']);
    expect(session.clearRepeatableCommands()).toBe(true);
    expect(session.canRepeatCommands).toBe(false);
    expect(session.clearRepeatableCommands()).toBe(false);
  });
});

describe('live issue diagnostics', () => {
  it('derives stable geometry, entity, link, and structure findings', () => {
    const { document, invalid, invalidOrigin, missingOrigin, unresolved } = issueFixture();
    const issues = deriveEditorIssues(document);
    expect(deriveEditorIssues(document).map((issue) => issue.id)).toEqual(
      issues.map((issue) => issue.id),
    );
    expect(issues.find((issue) => issue.type === 'invalid-brush')?.brushIds).toEqual([invalid.id]);
    expect(issues.find((issue) => issue.type === 'invalid-origin')?.entityIds).toEqual([
      invalidOrigin.id,
    ]);
    expect(issues.find((issue) => issue.type === 'missing-origin')?.entityIds).toEqual([
      missingOrigin.id,
    ]);
    expect(issues.find((issue) => issue.type === 'unresolved-target')?.entityIds).toEqual([
      unresolved.id,
    ]);
    expect(issues.some((issue) => issue.type === 'empty-brush-entity')).toBe(true);
    expect(
      issues.some(
        (issue) => issue.type === 'empty-brush-entity' && issue.entityIds.includes(unresolved.id),
      ),
    ).toBe(false);
    expect(issues.some((issue) => issue.type === 'empty-group')).toBe(true);
  });

  it('does not flag engine, wildcard, sentinel, or generated target references as unresolved', () => {
    const ids = createSequentialIdFactory('dynamic-targets');
    const starter = createStarterDocument();
    const document: MapDocument = {
      ...starter,
      entities: [
        starter.entities[0]!,
        {
          id: ids.entity(),
          properties: {
            classname: 'trigger_relay',
            origin: '0 0 0',
            target: '!activator',
            killtarget: 'temporary_*',
          },
          primitives: [],
        },
        {
          id: ids.entity(),
          properties: {
            classname: 'multi_watcher',
            origin: '16 0 0',
            target: '<rotatable_brush.1',
          },
          primitives: [],
        },
        {
          id: ids.entity(),
          properties: {
            classname: 'monstermaker',
            origin: '32 0 0',
            netname: 'spawned_monster',
          },
          primitives: [],
        },
        {
          id: ids.entity(),
          properties: {
            classname: 'trigger_changekeyvalue',
            origin: '64 0 0',
            target: 'spawned_monster',
          },
          primitives: [],
        },
        {
          id: ids.entity(),
          properties: {
            classname: 'trigger_relay',
            origin: '96 0 0',
            target: 'nothing',
          },
          primitives: [],
        },
      ],
    };

    expect(deriveEditorIssues(document).some((issue) => issue.type === 'unresolved-target')).toBe(
      false,
    );
  });

  it('selects an invalid brush and applies its quick fix as one undoable edit', () => {
    const { document, invalid } = issueFixture();
    const session = new EditorSession(document);
    const invalidIssue = session.issues.find((issue) => issue.type === 'invalid-brush')!;

    expect(session.selectIssue(invalidIssue.id)).toEqual({ brushId: invalid.id });
    expect(session.fixIssue(invalidIssue.id)).toBe(true);
    expect(findBrush(session.document, invalid.id)).toBeNull();
    expect(session.issues.some((issue) => issue.id === invalidIssue.id)).toBe(false);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Delete invalid brush');

    expect(session.undo()).toBe(true);
    expect(findBrush(session.document, invalid.id)).not.toBeNull();
    expect(session.issues.some((issue) => issue.id === invalidIssue.id)).toBe(true);
  });

  it('repairs invalid properties without disturbing the selected object', () => {
    const { document, invalidOrigin, unresolved } = issueFixture();
    const session = new EditorSession(document);
    const invalidOriginIssue = session.issues.find((issue) => issue.type === 'invalid-origin')!;
    session.selectIssue(invalidOriginIssue.id);

    expect(session.fixIssue(invalidOriginIssue.id)).toBe(true);
    expect(
      session.document.entities.find((entity) => entity.id === invalidOrigin.id)!.properties.origin,
    ).toBe('0 0 0');
    expect(session.selection).toEqual({ entityId: invalidOrigin.id });

    const unresolvedIssue = session.issues.find(
      (issue) => issue.type === 'unresolved-target' && issue.entityIds.includes(unresolved.id),
    )!;
    expect(session.fixIssue(unresolvedIssue.id)).toBe(true);
    expect(
      session.document.entities.find((entity) => entity.id === unresolved.id)!.properties.target,
    ).toBeUndefined();
  });
});

describe('live viewport filters', () => {
  it('summarizes entity definitions and filters classnames without document history', () => {
    const { document, light, monster } = viewFilterFixture();
    expect(entityClassFiltersInDocument(document)).toEqual([
      { classname: 'func_detail', pointEntityCount: 0, brushEntityCount: 1 },
      { classname: 'func_wall', pointEntityCount: 0, brushEntityCount: 1 },
      { classname: 'light', pointEntityCount: 1, brushEntityCount: 0 },
      { classname: 'monster_army', pointEntityCount: 1, brushEntityCount: 0 },
      { classname: 'trigger_once', pointEntityCount: 0, brushEntityCount: 1 },
    ]);

    const session = new EditorSession(document);
    session.selectPointEntity(light.id);
    expect(session.setEntityClassVisible('LIGHT', false)).toBe(true);
    expect(session.objectViewState.hiddenEntityIds).toEqual([light.id]);
    expect(session.selection).toBeNull();
    expect(session.document).toBe(document);
    expect(session.document.revision).toBe(0);
    expect(session.canUndo).toBe(false);

    session.selectPointEntity(monster.id);
    expect(session.setEntityClassVisible('light', true)).toBe(true);
    expect(session.selection).toEqual({ entityId: monster.id });
    expect(session.objectViewState.hiddenEntityIds).toEqual([]);
  });

  it('combines special-material, entity-class, and world-brush filters for picking', () => {
    const { document, world, detail, trigger, clip, light, monster } = viewFilterFixture();
    const session = new EditorSession(document);

    expect(session.setSpecialBrushFilterVisible('trigger', false)).toBe(true);
    expect(session.setSpecialBrushFilterVisible('clip', false)).toBe(true);
    expect(session.setEntityClassVisible('func_detail', false)).toBe(true);
    expect(session.setEntityClassVisible('light', false)).toBe(true);
    expect(session.setWorldBrushesVisible(false)).toBe(true);
    expect(session.objectViewState.hiddenBrushIds).toEqual(
      [clip.id, detail.id, trigger.id, world.id].toSorted(),
    );
    expect(session.objectViewState.hiddenEntityIds).toEqual([light.id]);

    const selection = session.selectAllEditable();
    expect(selectedBrushIds(selection)).toEqual([]);
    expect(selectedPointEntityIds(selection)).toEqual([monster.id]);
    expect(() => session.selectBrush(trigger.id)).toThrow('hidden or locked');
    expect(() => session.selectPointEntity(light.id)).toThrow('hidden or locked');

    expect(session.setAllEntityClassesVisible(true)).toBe(true);
    expect(session.setSpecialBrushFilterVisible('trigger', true)).toBe(true);
    expect(session.setSpecialBrushFilterVisible('clip', true)).toBe(true);
    expect(session.setWorldBrushesVisible(true)).toBe(true);
    expect(session.filteredObjectIds).toEqual({ brushIds: [], entityIds: [] });
  });

  it('applies persistent filter settings to preview documents with new objects', () => {
    const { document } = viewFilterFixture();
    const session = new EditorSession(document);
    session.setEntityClassVisible('light', false);
    const ids = createSequentialIdFactory('filtered-preview');
    const previewLight = {
      id: ids.entity(),
      properties: { classname: 'light', origin: '256 0 32' },
      primitives: [],
    };
    const preview = { ...document, entities: [...document.entities, previewLight] };
    expect(session.objectViewStateFor(preview).hiddenEntityIds).toContain(previewLight.id);
  });
});

describe('material usage queries and replacement', () => {
  it('groups usage case-insensitively and selects matching visible faces or brushes', () => {
    const { document, first, second } = materialUsageFixture();
    expect(materialUsageInDocument(document)).toEqual([
      { material: 'BRICK', faceCount: 10, brushCount: 2 },
      { material: 'METAL', faceCount: 2, brushCount: 1 },
    ]);

    const session = new EditorSession(document);
    expect(selectedFaceReferences(session.selectFacesUsingMaterial('brick'))).toHaveLength(10);
    expect(selectedBrushIds(session.selectBrushesUsingMaterial('BRICK'))).toEqual([
      first.id,
      second.id,
    ]);

    session.selectBrush(first.id);
    expect(session.hideSelected()).toBe(true);
    expect(selectedFaceReferences(session.selectFacesUsingMaterial('brick'))).toHaveLength(6);
    expect(selectedBrushIds(session.selectBrushesUsingMaterial('brick'))).toEqual([second.id]);
    expect(session.document).toBe(document);
  });

  it('replaces a material globally and selects every changed face in one undo step', () => {
    const { document } = materialUsageFixture();
    const session = new EditorSession(document);

    expect(session.replaceMaterial('brick', 'STONE', null)).toBe(10);
    expect(materialUsageInDocument(session.document)).toEqual([
      { material: 'METAL', faceCount: 2, brushCount: 1 },
      { material: 'STONE', faceCount: 10, brushCount: 2 },
    ]);
    expect(selectedFaceReferences(session.selection)).toHaveLength(10);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Replace material brick → STONE');

    expect(session.undo()).toBe(true);
    expect(materialUsageInDocument(session.document)).toEqual([
      { material: 'BRICK', faceCount: 10, brushCount: 2 },
      { material: 'METAL', faceCount: 2, brushCount: 1 },
    ]);
  });

  it('limits replacement to selected faces or all faces of selected brushes', () => {
    const { document, first, second } = materialUsageFixture();
    const session = new EditorSession(document);
    const selectedFace = first.faces.find((face) => face.material === 'BRICK')!;
    session.select(createFaceSelection([{ brushId: first.id, faceId: selectedFace.id }]));
    expect(session.replaceMaterial('brick', 'FACE_ONLY')).toBe(1);
    expect(
      materialUsageInDocument(session.document).find((usage) => usage.material === 'FACE_ONLY'),
    ).toEqual({ material: 'FACE_ONLY', faceCount: 1, brushCount: 1 });

    session.selectBrush(second.id);
    expect(session.replaceMaterial('brick', 'BRUSH_ONLY')).toBe(6);
    expect(
      materialUsageInDocument(session.document).find((usage) => usage.material === 'BRUSH_ONLY'),
    ).toEqual({ material: 'BRUSH_ONLY', faceCount: 6, brushCount: 1 });
    expect(selectedFaceReferences(session.selection)).toHaveLength(6);
  });
});

describe('face attribute clipboard transactions', () => {
  it('round-trips an ID-free primary-face payload without copying brush contents', () => {
    const ids = createSequentialIdFactory('face-clipboard');
    const starter = createStarterDocument();
    const sourceBase = createBoxBrush([-64, -32, 0], [-32, 32, 32], 'SOURCE', ids);
    const sourceFace = sourceBase.faces[0]!;
    const source = withTestFace(sourceBase, sourceFace.id, {
      ...sourceFace,
      projection: {
        kind: 'valve-220',
        uAxis: [0, 1, 0],
        vAxis: [0, 0, -1],
        offset: [24, -12],
        rotationDegrees: 37,
        scale: [0.5, 2],
      },
      surface: { contents: 7, flags: 3, value: 480 },
    });
    const document: MapDocument = {
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [source] }],
    };
    const text = serializeFaceAttributeClipboard(
      document,
      createFaceSelection([{ brushId: source.id, faceId: sourceFace.id }]),
    )!;
    const payload = parseFaceAttributeClipboard(text)!;

    expect(payload.material).toBe('SOURCE');
    expect(payload.projection).toEqual(source.faces[0]!.projection);
    expect(payload.surface).toEqual({ flags: 3, value: 480 });
    expect('contents' in payload.surface).toBe(false);
    expect(parseFaceAttributeClipboard(serializeMap(document))).toBeNull();
    expect(() => parseFaceAttributeClipboard('// Worldview face attributes v1\n{')).toThrow(
      'invalid JSON',
    );
    const withUnknownField = JSON.parse(
      text.slice(FACE_ATTRIBUTE_CLIPBOARD_HEADER.length),
    ) as Record<string, unknown>;
    withUnknownField.legacy = true;
    expect(() =>
      parseFaceAttributeClipboard(
        `${FACE_ATTRIBUTE_CLIPBOARD_HEADER}\n${JSON.stringify(withUnknownField)}`,
      ),
    ).toThrow(/invalid.*legacy/i);
  });

  it('pastes one payload onto a face set atomically and preserves each target contents value', () => {
    const ids = createSequentialIdFactory('face-clipboard-paste');
    const starter = createStarterDocument();
    const sourceBase = createBoxBrush([-96, -32, 0], [-64, 32, 32], 'SOURCE', ids);
    const firstTargetBase = createBoxBrush([-16, -32, 0], [16, 32, 32], 'FIRST', ids);
    const secondTargetBase = createBoxBrush([64, -32, 0], [96, 32, 32], 'SECOND', ids);
    const sourceFaceId = sourceBase.faces[0]!.id;
    const firstTargetId = firstTargetBase.faces[1]!.id;
    const secondTargetId = secondTargetBase.faces[2]!.id;
    const sourceFace = sourceBase.faces[0]!;
    const source = withTestFace(sourceBase, sourceFaceId, {
      ...sourceFace,
      projection: {
        ...sourceFace.projection,
        uAxis: [0, 1, 0],
        vAxis: [0, 0, -1],
        offset: [32, 8],
        rotationDegrees: 90,
        scale: [0.25, 0.75],
      },
      surface: { flags: 5, value: 120 },
    });
    const firstTargetFace = firstTargetBase.faces[1]!;
    const firstTarget = withTestFace(firstTargetBase, firstTargetId, {
      ...firstTargetFace,
      surface: { contents: 11 },
    });
    const secondTargetFace = secondTargetBase.faces[2]!;
    const secondTarget = withTestFace(secondTargetBase, secondTargetId, {
      ...secondTargetFace,
      surface: { contents: 29 },
    });
    const document: MapDocument = {
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [source, firstTarget, secondTarget] }],
    };
    const payload = parseFaceAttributeClipboard(
      serializeFaceAttributeClipboard(
        document,
        createFaceSelection([{ brushId: source.id, faceId: sourceFaceId }]),
      )!,
    )!;
    const session = new EditorSession(document);
    session.select(
      createFaceSelection([
        { brushId: firstTarget.id, faceId: firstTargetId },
        { brushId: secondTarget.id, faceId: secondTargetId },
      ]),
    );

    expect(session.pasteFaceAttributes(payload)).toBe(true);
    expect(session.document.revision).toBe(1);
    expect(session.undoLabel).toBe('Paste face attributes');
    const pastedFirst = findBrush(session.document, firstTarget.id)!.faces.find(
      (face) => face.id === firstTargetId,
    )!;
    const pastedSecond = findBrush(session.document, secondTarget.id)!.faces.find(
      (face) => face.id === secondTargetId,
    )!;
    expect(pastedFirst.material).toBe('SOURCE');
    expect(pastedSecond.projection).toEqual(payload.projection);
    expect(pastedFirst.surface).toEqual({ flags: 5, value: 120, contents: 11 });
    expect(pastedSecond.surface).toEqual({ flags: 5, value: 120, contents: 29 });
    expect(selectedFaceReferences(session.selection)).toHaveLength(2);

    expect(session.undo()).toBe(true);
    expect(
      findBrush(session.document, firstTarget.id)!.faces.find((face) => face.id === firstTargetId)!
        .material,
    ).toBe('FIRST');
    expect(session.redo()).toBe(true);
    expect(
      findBrush(session.document, secondTarget.id)!.faces.find(
        (face) => face.id === secondTargetId,
      )!.material,
    ).toBe('SOURCE');
  });
});

describe('selection grid snapping', () => {
  it('snaps every selected brush vertex and restores the exact brush on undo', () => {
    const ids = createSequentialIdFactory('selection-grid-snap');
    const starter = createStarterDocument();
    const brush = createBoxBrush([3, 5, 7], [27, 29, 31], 'GRID', ids);
    const document = {
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [brush] }, ...starter.entities.slice(1)],
    };
    const session = new EditorSession(document);
    session.selectBrush(brush.id);

    expect(session.snapSelectionToGrid(8, ids)).toBe(true);
    const snapped = findBrush(session.document, brush.id)!;
    expect(brushVertices(snapped).every((point) => point.every((value) => value % 8 === 0))).toBe(
      true,
    );
    expect(session.undoLabel).toBe('Snap brush vertices to grid');
    expect(session.undo()).toBe(true);
    expect(findBrush(session.document, brush.id)?.faces).toEqual(brush.faces);
  });

  it('limits face-selection snapping to the selected face vertices', () => {
    const ids = createSequentialIdFactory('face-grid-snap');
    const starter = createStarterDocument();
    const brush = createBoxBrush([0, 0, 0], [10, 10, 10], 'GRID', ids);
    const document = {
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [brush] }, ...starter.entities.slice(1)],
    };
    const selectedFace = deriveBrush(brush).faces.find((face) =>
      face.vertices.every((point) => Math.abs(point[2] - 10) < 0.001),
    )!;
    const session = new EditorSession(document);
    session.select(createFaceSelection([{ brushId: brush.id, faceId: selectedFace.faceId }]));

    expect(session.snapSelectionToGrid(8, ids)).toBe(true);
    const vertices = brushVertices(findBrush(session.document, brush.id)!);
    expect(vertices.filter((point) => Math.abs(point[2]) < 0.001)).toHaveLength(4);
    expect(vertices.filter((point) => Math.abs(point[2] - 8) < 0.001)).toHaveLength(4);
    expect(session.undoLabel).toBe('Snap face vertices to grid');
  });
});

describe('object clipboard transactions', () => {
  it('serializes a mixed selection as parseable map text with brush-entity ownership', () => {
    const ids = createSequentialIdFactory('clipboard-source');
    const starter = createStarterDocument();
    const worldBrush = createBoxBrush([-64, -32, 0], [-32, 32, 32], 'WORLD', ids);
    const detailBrush = createBoxBrush([32, -32, 0], [64, 32, 32], 'DETAIL', ids);
    const player = starter.entities.find(
      (entity) => entity.properties.classname === 'info_player_start',
    )!;
    const document: MapDocument = {
      ...starter,
      entities: [
        { ...starter.entities[0]!, primitives: [worldBrush] },
        {
          id: ids.entity(),
          properties: { classname: 'func_detail', targetname: 'copied_detail' },
          primitives: [detailBrush],
        },
        player,
      ],
    };
    const selection = createObjectSelection([worldBrush.id, detailBrush.id], [player.id])!;

    const clipboard = createObjectClipboardDocument(document, selection)!;
    expect(clipboard.entities).toHaveLength(3);
    expect(clipboard.entities[0]!.properties).toEqual({ classname: 'worldspawn' });
    expect(clipboard.entities[1]!.properties.targetname).toBe('copied_detail');
    expect(clipboard.entities[1]!.primitives).toEqual([detailBrush]);
    const text = serializeObjectClipboard(document, selection)!;
    const reparsed = parseMap(text, createSequentialIdFactory('clipboard-reparsed'));
    expect(brushesInDocument(reparsed)).toHaveLength(2);
    expect(reparsed.entities.map((entity) => entity.properties.classname)).toEqual([
      'worldspawn',
      'func_detail',
      'info_player_start',
    ]);
  });

  it('pastes world brushes, brush entities, and point entities with fresh IDs in one undo step', () => {
    const sourceIds = createSequentialIdFactory('clipboard-paste-source');
    const starter = createStarterDocument();
    const worldBrush = createBoxBrush([-64, -32, 0], [-32, 32, 32], 'WORLD', sourceIds);
    const detailBrush = createBoxBrush([32, -32, 0], [64, 32, 32], 'DETAIL', sourceIds);
    const player = starter.entities.find(
      (entity) => entity.properties.classname === 'info_player_start',
    )!;
    const source: MapDocument = {
      ...starter,
      entities: [
        { ...starter.entities[0]!, primitives: [worldBrush] },
        {
          id: sourceIds.entity(),
          properties: { classname: 'func_detail', targetname: 'detail_clip' },
          primitives: [detailBrush],
        },
        player,
      ],
    };
    const clipboard = createObjectClipboardDocument(
      source,
      createObjectSelection([worldBrush.id, detailBrush.id], [player.id]),
    )!;
    const destination = createStarterDocument();
    const originalBrushCount = brushesInDocument(destination).length;
    const originalEntityCount = destination.entities.length;
    const session = new EditorSession(destination);
    const candidate = session.createPasteCandidate(
      clipboard,
      createSequentialIdFactory('clipboard-pasted'),
      [128, 64, 16],
    )!;

    expect(candidate.label).toBe('Paste objects');
    expect(candidate.document.revision).toBe(1);
    expect(brushesInDocument(candidate.document)).toHaveLength(originalBrushCount + 2);
    expect(candidate.document.entities).toHaveLength(originalEntityCount + 2);
    expect(selectedBrushIds(candidate.selectionAfter)).toHaveLength(2);
    expect(selectedPointEntityIds(candidate.selectionAfter)).toHaveLength(1);
    const pastedIds = new Set(selectedBrushIds(candidate.selectionAfter));
    expect(pastedIds.has(worldBrush.id)).toBe(false);
    expect(pastedIds.has(detailBrush.id)).toBe(false);
    const pastedDetail = candidate.document.entities.find(
      (entity) => entity.properties.targetname === 'detail_clip',
    )!;
    expect(pastedDetail.primitives).toHaveLength(1);
    const pastedBrush = pastedDetail.primitives[0]!;
    if (pastedBrush.kind !== 'brush') throw new Error('Expected pasted brush');
    expect(deriveBrush(pastedBrush).bounds).toEqual({
      min: [160, 32, 16],
      max: [192, 96, 48],
    });
    const pastedPlayerId = selectedPointEntityIds(candidate.selectionAfter)[0]!;
    expect(
      parseEntityOrigin(
        candidate.document.entities.find((entity) => entity.id === pastedPlayerId)!,
      ),
    ).toEqual([128, -32, 40]);

    session.commitDocumentCandidate(candidate);
    expect(session.undoLabel).toBe('Paste objects');
    expect(session.undo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(originalBrushCount);
    expect(session.document.entities).toHaveLength(originalEntityCount);
    expect(session.redo()).toBe(true);
    expect(brushesInDocument(session.document)).toHaveLength(originalBrushCount + 2);
    expect(selectedPointEntityIds(session.selection)).toHaveLength(1);
  });

  it('computes a Paste Here offset that rests copied bounds on the hit surface', () => {
    const ids = createSequentialIdFactory('clipboard-offset');
    const starter = createStarterDocument();
    const brush = createBoxBrush([-16, -8, 0], [16, 8, 32], 'CLIP', ids);
    const clipboard: MapDocument = {
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [brush] }],
    };

    expect(objectClipboardPasteOffset(clipboard, [128, 64, 48], [0, 0, 1])).toEqual([128, 64, 48]);
    const session = new EditorSession(starter);
    const candidate = session.createPasteCandidate(
      clipboard,
      createSequentialIdFactory('clipboard-offset-result'),
      [128, 64, 48],
    )!;
    const pasted = findBrush(candidate.document, selectedBrushIds(candidate.selectionAfter)[0]!)!;
    expect(deriveBrush(pasted).bounds).toEqual({ min: [112, 56, 48], max: [144, 72, 80] });
  });

  it('snaps pasted bounds on axes tangent to the target surface', () => {
    const ids = createSequentialIdFactory('clipboard-grid-offset');
    const starter = createStarterDocument();
    const brush = createBoxBrush([-15, -7, 0], [16, 8, 32], 'ODD_BOUNDS', ids);
    const clipboard: MapDocument = {
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [brush] }],
    };

    const offset = objectClipboardPasteOffset(clipboard, [128, 64, 48], [0, 0, 1], 16)!;
    const candidate = new EditorSession(starter).createPasteCandidate(
      clipboard,
      createSequentialIdFactory('clipboard-grid-result'),
      offset,
    )!;
    const pasted = findBrush(candidate.document, selectedBrushIds(candidate.selectionAfter)[0]!)!;
    expect(deriveBrush(pasted).bounds).toEqual({ min: [112, 64, 48], max: [143, 79, 80] });
  });
});
