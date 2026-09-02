import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';

import {
  EditorSession,
  brushesInDocument,
  createStarterDocument,
  selectedBrushIds,
  serializeMap,
} from '../src/core/index.js';

const nonZeroTranslation = fc
  .tuple(
    fc.integer({ min: -64, max: 64 }),
    fc.integer({ min: -64, max: 64 }),
    fc.integer({ min: -64, max: 64 }),
  )
  .filter(([x, y, z]) => x !== 0 || y !== 0 || z !== 0);

test.prop([fc.array(nonZeroTranslation, { minLength: 1, maxLength: 24 })], { numRuns: 50 })(
  'undo and redo restore exact source and selection across generated translation histories',
  (translations) => {
    const session = new EditorSession(createStarterDocument());
    const brush = brushesInDocument(session.document)[1]!;
    session.selectBrush(brush.id);
    const initialSource = serializeMap(session.document);
    const initialSelection = selectedBrushIds(session.selection);

    for (const translation of translations) {
      expect(session.translateSelected(translation)).toBe(true);
    }

    const editedSource = serializeMap(session.document);
    const editedSelection = selectedBrushIds(session.selection);
    expect(editedSource).not.toBe(initialSource);

    for (let index = 0; index < translations.length; index += 1) {
      expect(session.undo()).toBe(true);
    }
    expect(serializeMap(session.document)).toBe(initialSource);
    expect(selectedBrushIds(session.selection)).toEqual(initialSelection);
    expect(session.canUndo).toBe(false);

    for (let index = 0; index < translations.length; index += 1) {
      expect(session.redo()).toBe(true);
    }
    expect(serializeMap(session.document)).toBe(editedSource);
    expect(selectedBrushIds(session.selection)).toEqual(editedSelection);
    expect(session.canRedo).toBe(false);
  },
);
