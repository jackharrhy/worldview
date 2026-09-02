import { describe, expect, it } from 'vitest';

import {
  EditorSession,
  brushesInDocument,
  createBoxBrush,
  createSequentialIdFactory,
  createStarterDocument,
  deriveBrush,
  findBrush,
  selectedBrushIds,
} from '../src/core/index.js';

describe('editor object and history transactions', () => {
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
