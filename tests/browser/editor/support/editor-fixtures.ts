import {
  EditorSession,
  createBoxBrush,
  createObjectSelection,
  createSequentialIdFactory,
  createStarterDocument,
  encodeQuakeWad2,
  setBrushFaceMaterials,
  serializeMap,
  type EditorMaterial,
} from '../../../../packages/worldview-editor/src/core/index.js';

function largeMaterialWad(count: number): { readonly palette: Buffer; readonly wad: Buffer } {
  const palette = new Uint8Array(768);
  for (let index = 0; index < 256; index += 1) {
    palette[index * 3] = index;
    palette[index * 3 + 1] = index;
    palette[index * 3 + 2] = index;
  }
  const materials: EditorMaterial[] = Array.from({ length: count }, (_, index) => {
    const rgba = new Uint8Array(16 * 16 * 4);
    const value = 32 + (index % 192);
    for (let pixel = 0; pixel < 16 * 16; pixel += 1) {
      const offset = pixel * 4;
      rgba[offset] = value;
      rgba[offset + 1] = value;
      rgba[offset + 2] = value;
      rgba[offset + 3] = 255;
    }
    return {
      name: `MAT_${String(index).padStart(3, '0')}`,
      sourceName: 'large-test.wad',
      width: 16,
      height: 16,
      rgba,
      alphaTest: false,
    };
  });
  return { palette: Buffer.from(palette), wad: Buffer.from(encodeQuakeWad2(materials, palette)) };
}

function adjacentBrushSource(): string {
  const ids = createSequentialIdFactory('browser-shared-face');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const left = createBoxBrush([-32, -32, 0], [0, 32, 32], 'LEFT', ids);
  const right = createBoxBrush([0, -32, 0], [32, 32, 32], 'RIGHT', ids);

  return serializeMap({
    ...starter,
    entities: [{ ...worldspawn, primitives: [left, right] }, ...starter.entities.slice(1)],
  });
}

function mixedProjectionBrushSource(): string {
  const ids = createSequentialIdFactory('browser-mixed-projection');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const left = createBoxBrush([-48, -24, 0], [-8, 24, 32], 'MIXED', ids);
  const right = createBoxBrush([8, -24, 0], [48, 24, 32], 'MIXED', ids);
  const translatedRight = Object.assign({}, right, {
    faces: right.faces.map((face) =>
      Object.assign({}, face, {
        projection: Object.assign({}, face.projection, {
          offset: [48, face.projection.offset[1]] as const,
        }),
      }),
    ),
  });
  return serializeMap({
    ...starter,
    entities: [
      { ...worldspawn, primitives: [left, translatedRight] },
      ...starter.entities.slice(1),
    ],
  });
}

function coplanarBrushSource(): string {
  const ids = createSequentialIdFactory('browser-coplanar-face');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const lower = createBoxBrush([-32, -64, 0], [0, -16, 32], 'LOWER', ids);
  const upper = createBoxBrush([-32, 16, 0], [0, 64, 32], 'UPPER', ids);

  return serializeMap({
    ...starter,
    entities: [{ ...worldspawn, primitives: [lower, upper] }, ...starter.entities.slice(1)],
  });
}

function subtractionBrushSource(): string {
  const ids = createSequentialIdFactory('browser-csg-subtract');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const target = createBoxBrush([-48, -48, -32], [48, 48, 32], 'TARGET', ids);
  const cutter = createBoxBrush([-16, -16, -48], [16, 16, 48], 'CUTTER', ids);
  return serializeMap({
    ...starter,
    entities: [{ ...worldspawn, primitives: [target, cutter] }, ...starter.entities.slice(1)],
  });
}

function selectionPaintSource(): string {
  const ids = createSequentialIdFactory('browser-object-paint');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const brushes = [
    createBoxBrush([-160, -32, 0], [-96, 32, 64], 'PAINT_A', ids),
    createBoxBrush([-32, -32, 0], [32, 32, 64], 'PAINT_B', ids),
    createBoxBrush([96, -32, 0], [160, 32, 64], 'PAINT_C', ids),
  ];
  return serializeMap({
    ...starter,
    entities: [{ ...worldspawn, primitives: brushes }, ...starter.entities.slice(1)],
  });
}

function selectionBrushSource(): string {
  const ids = createSequentialIdFactory('browser-selection-brush');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const brushes = [
    createBoxBrush([-96, -96, -32], [96, 96, 96], 'SELECTOR', ids),
    createBoxBrush([-24, -24, 0], [24, 24, 32], 'INSIDE', ids),
    createBoxBrush([80, -16, 0], [112, 16, 32], 'CROSSING', ids),
    createBoxBrush([144, -16, 0], [176, 16, 32], 'OUTSIDE', ids),
    createBoxBrush([-24, 40, 160], [24, 64, 192], 'ELEVATED', ids),
  ];
  return serializeMap({
    ...starter,
    entities: [
      { ...worldspawn, primitives: brushes },
      {
        id: ids.entity(),
        properties: { classname: 'info_target', origin: '0 -48 16' },
        primitives: [],
      },
      {
        id: ids.entity(),
        properties: { classname: 'info_target', origin: '160 64 16' },
        primitives: [],
      },
    ],
  });
}

function offGridBrushSource(): string {
  const ids = createSequentialIdFactory('browser-grid-snap');
  const starter = createStarterDocument();
  const brush = createBoxBrush([3, 5, 7], [27, 29, 31], 'GRID_SNAP', ids);
  return serializeMap({
    ...starter,
    entities: [{ ...starter.entities[0]!, primitives: [brush] }, ...starter.entities.slice(1)],
  });
}

function regularGroupSource(): string {
  const ids = createSequentialIdFactory('browser-linked-group');
  const starter = createStarterDocument();
  const brush = createBoxBrush([-32, -16, 0], [32, 16, 64], 'LINKED_DOOR', ids);
  const marker = {
    id: ids.entity(),
    properties: {
      classname: 'info_target',
      origin: '0 96 32',
      angle: '90',
      targetname: 'door_a',
    },
    primitives: [],
  };
  const document = {
    ...starter,
    entities: [{ ...starter.entities[0]!, primitives: [brush] }, marker],
  };
  const session = new EditorSession(document);
  session.select(createObjectSelection([brush.id], [marker.id]));
  session.groupSelected('Reusable doorway', ids);
  return serializeMap(session.document);
}

function drillSelectionSource(): string {
  const ids = createSequentialIdFactory('browser-selection-drill');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const front = createBoxBrush([72, -136, 88], [120, -88, 136], 'DRILL_FRONT', ids);
  const back = createBoxBrush([16, -72, 48], [64, -24, 96], 'DRILL_BACK', ids);
  return serializeMap({
    ...starter,
    entities: [{ ...worldspawn, primitives: [front, back] }, ...starter.entities.slice(1)],
  });
}

function orthographicDrillSelectionSource(): string {
  const ids = createSequentialIdFactory('browser-orthographic-selection-drill');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const lowerWall = createBoxBrush([-96, -96, 0], [96, 96, 64], 'DRILL_WALL', ids);
  const upperDetail = createBoxBrush([-32, -32, 128], [32, 32, 192], 'DRILL_DETAIL', ids);
  return serializeMap({
    ...starter,
    entities: [
      { ...worldspawn, primitives: [lowerWall, upperDetail] },
      ...starter.entities.slice(1),
    ],
  });
}

function brushEntitySiblingSource(): string {
  const ids = createSequentialIdFactory('browser-brush-entity');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const worldBrush = createBoxBrush([-192, -32, 0], [-128, 32, 64], 'WORLD', ids);
  const first = createBoxBrush([-32, -32, 0], [32, 32, 64], 'DETAIL_A', ids);
  const second = createBoxBrush([96, -32, 0], [160, 32, 64], 'DETAIL_B', ids);
  return serializeMap({
    ...starter,
    entities: [
      { ...worldspawn, primitives: [worldBrush] },
      { id: ids.entity(), properties: { classname: 'func_detail' }, primitives: [first, second] },
      ...starter.entities.slice(1),
    ],
  });
}

function entityLinkSource(): string {
  const ids = createSequentialIdFactory('browser-entity-links');
  const starter = createStarterDocument();
  const worldspawn = { ...starter.entities[0]!, primitives: [] };
  const doorBrush = createBoxBrush([-16, -16, 0], [16, 16, 64], 'DOOR', ids);
  return serializeMap({
    ...starter,
    entities: [
      worldspawn,
      {
        id: ids.entity(),
        properties: {
          classname: 'trigger_once',
          origin: '-96 0 32',
          target: 'door_a',
          killtarget: 'unused_a',
        },
        primitives: [],
      },
      {
        id: ids.entity(),
        properties: { classname: 'func_door', targetname: 'door_a', target: 'relay_a' },
        primitives: [doorBrush],
      },
      {
        id: ids.entity(),
        properties: {
          classname: 'trigger_relay',
          origin: '96 0 32',
          targetname: 'relay_a',
          target: 'unused_a',
        },
        primitives: [],
      },
      {
        id: ids.entity(),
        properties: { classname: 'info_null', origin: '192 0 32', targetname: 'unused_a' },
        primitives: [],
      },
    ],
  });
}

function issueBrowserSource(): string {
  const ids = createSequentialIdFactory('browser-issues');
  const starter = createStarterDocument();
  const box = createBoxBrush([-32, -32, 0], [32, 32, 64], 'BROKEN', ids);
  const invalid = { ...box, faces: box.faces.slice(0, 3) };
  return serializeMap({
    ...starter,
    entities: [
      { ...starter.entities[0]!, primitives: [invalid] },
      {
        id: ids.entity(),
        properties: { classname: 'light', origin: 'not a vector' },
        primitives: [],
      },
      {
        id: ids.entity(),
        properties: {
          classname: 'trigger_once',
          origin: '96 0 16',
          target: 'missing_door',
        },
        primitives: [],
      },
    ],
  });
}

function viewFilterSource(): string {
  const ids = createSequentialIdFactory('browser-view-filters');
  const starter = createStarterDocument();
  const world = createBoxBrush([-128, -32, 0], [-96, 32, 48], 'STONE', ids);
  const detail = createBoxBrush([-64, -32, 0], [-32, 32, 48], 'DETAIL', ids);
  const trigger = createBoxBrush([0, -32, 0], [32, 32, 48], 'TRIGGER', ids);
  const clip = createBoxBrush([64, -32, 0], [96, 32, 48], 'PLAYERCLIP', ids);
  return serializeMap({
    ...starter,
    entities: [
      { ...starter.entities[0]!, primitives: [world] },
      { id: ids.entity(), properties: { classname: 'func_detail' }, primitives: [detail] },
      { id: ids.entity(), properties: { classname: 'trigger_once' }, primitives: [trigger] },
      { id: ids.entity(), properties: { classname: 'func_wall' }, primitives: [clip] },
      {
        id: ids.entity(),
        properties: { classname: 'light', origin: '-48 96 24' },
        primitives: [],
      },
      {
        id: ids.entity(),
        properties: { classname: 'monster_army', origin: '48 96 24' },
        primitives: [],
      },
    ],
  });
}

function materialUsageSource(): string {
  const ids = createSequentialIdFactory('browser-material-usage');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const firstBase = createBoxBrush([-96, -32, 0], [-32, 32, 64], 'DEV_FLOOR', ids);
  const first = setBrushFaceMaterials(
    firstBase,
    'DEV_PILLAR',
    firstBase.faces.slice(0, 2).map((face) => face.id),
  );
  const second = createBoxBrush([32, -32, 0], [96, 32, 64], 'DEV_FLOOR', ids);
  return serializeMap({
    ...starter,
    entities: [{ ...worldspawn, primitives: [first, second] }, ...starter.entities.slice(1)],
  });
}

function orthographicPickPrioritySource(): string {
  const ids = createSequentialIdFactory('browser-orthographic-pick');
  const starter = createStarterDocument();
  const wall = createBoxBrush([-192, -192, 0], [192, 192, 16], 'PICK_WALL', ids);
  const detail = createBoxBrush([-32, -32, 0], [32, 32, 16], 'PICK_DETAIL', ids);
  return serializeMap({
    ...starter,
    entities: [{ ...starter.entities[0]!, primitives: [wall, detail] }],
  });
}

export {
  largeMaterialWad,
  adjacentBrushSource,
  mixedProjectionBrushSource,
  coplanarBrushSource,
  subtractionBrushSource,
  selectionPaintSource,
  selectionBrushSource,
  offGridBrushSource,
  regularGroupSource,
  drillSelectionSource,
  orthographicDrillSelectionSource,
  brushEntitySiblingSource,
  entityLinkSource,
  issueBrowserSource,
  viewFilterSource,
  materialUsageSource,
  orthographicPickPrioritySource,
};
