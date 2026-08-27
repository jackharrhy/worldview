import * as Automerge from '@automerge/automerge';
import * as Y from 'yjs';
import {
  createBoxBrush,
  createSequentialIdFactory,
  translateBrush,
} from '../packages/worldview-editor/dist/core/index.js';

const brushCount = Number(process.env.WORLDVIEW_COLLAB_BRUSHES ?? 8_000);
const operationCount = Number(process.env.WORLDVIEW_COLLAB_OPERATIONS ?? 1_000);
const encoder = new TextEncoder();
const ids = createSequentialIdFactory('collaboration-bakeoff');
const sourceBrushes = Array.from({ length: brushCount }, (_, index) => {
  const x = (index % 100) * 48;
  const y = Math.floor(index / 100) * 48;
  return createBoxBrush([x, y, 0], [x + 32, y + 32, 32], 'BENCHMARK', ids);
});
// Geometry is an atomic collaboration value, so each engine receives the same complete brush JSON.
const brushes = sourceBrushes.map((brush) => JSON.stringify(brush));
const operations = Array.from({ length: operationCount }, (_, index) => ({
  schemaVersion: 1,
  operationId: `benchmark:${index}`,
  transactionId: `benchmark:${index}`,
  actorId: 'benchmark',
  baseRoomVersion: index,
  label: 'Translate brush',
  edits: [
    {
      kind: 'replace-brush',
      brushId: sourceBrushes[index % brushCount].id,
      baseRevision: Math.floor(index / brushCount),
      brush: JSON.stringify(translateBrush(sourceBrushes[index % brushCount], [16, 0, 0])),
    },
  ],
}));

function measure(action) {
  const start = performance.now();
  const value = action();
  return { value, milliseconds: performance.now() - start };
}

function bytes(value) {
  return value instanceof Uint8Array ? value.byteLength : encoder.encode(value).byteLength;
}

const customInitial = measure(() =>
  JSON.stringify({ format: 'valve-220', brushes, operations: [] }),
);
const customIncremental = measure(() => operations.map((operation) => JSON.stringify(operation)));
const customHydrate = measure(() => JSON.parse(customInitial.value));

const yInitial = measure(() => {
  const document = new Y.Doc();
  document.getArray('brushes').insert(0, brushes);
  return { document, encoded: Y.encodeStateAsUpdate(document) };
});
const yIncremental = measure(() => {
  const before = Y.encodeStateVector(yInitial.value.document);
  yInitial.value.document.getArray('operations').insert(0, operations);
  return Y.encodeStateAsUpdate(yInitial.value.document, before);
});
const yHydrate = measure(() => {
  const document = new Y.Doc();
  Y.applyUpdate(document, Y.encodeStateAsUpdate(yInitial.value.document));
  return document;
});

const automergeInitial = measure(() => Automerge.from({ brushes, operations: [] }));
const automergeInitialBytes = Automerge.save(automergeInitial.value);
const automergeIncremental = measure(() =>
  Automerge.change(automergeInitial.value, (document) => {
    document.operations.push(...operations);
  }),
);
const automergeChanges = Automerge.getChanges(automergeInitial.value, automergeIncremental.value);
const automergeHydrate = measure(() => Automerge.load(Automerge.save(automergeIncremental.value)));

const report = {
  fixture: { brushes: brushCount, operations: operationCount },
  engines: {
    custom: {
      initialBytes: bytes(customInitial.value),
      incrementalBytes: customIncremental.value.reduce((total, update) => total + bytes(update), 0),
      initialMilliseconds: customInitial.milliseconds,
      incrementalMilliseconds: customIncremental.milliseconds,
      hydrateMilliseconds: customHydrate.milliseconds,
      conflictInspection: 'explicit typed result',
      geometryValidation: 'before acceptance',
    },
    yjs: {
      initialBytes: bytes(yInitial.value.encoded),
      incrementalBytes: bytes(yIncremental.value),
      initialMilliseconds: yInitial.milliseconds,
      incrementalMilliseconds: yIncremental.milliseconds,
      hydrateMilliseconds: yHydrate.milliseconds,
      conflictInspection: 'requires domain metadata',
      geometryValidation: 'requires transaction adapter',
    },
    automerge: {
      initialBytes: bytes(automergeInitialBytes),
      incrementalBytes: automergeChanges.reduce((total, change) => total + bytes(change), 0),
      initialMilliseconds: automergeInitial.milliseconds,
      incrementalMilliseconds: automergeIncremental.milliseconds,
      hydrateMilliseconds: automergeHydrate.milliseconds,
      conflictInspection: 'native property conflicts plus domain metadata',
      geometryValidation: 'requires change adapter',
    },
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
