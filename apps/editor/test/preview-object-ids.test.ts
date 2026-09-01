import { describe, expect, it } from 'vitest';
import {
  EditorSession,
  brushesInDocument,
  createFaceSelection,
  createObjectSelection,
  createSequentialIdFactory,
  createStarterDocument,
  pointEntitiesInDocument,
} from '@jackharrhy/worldview-editor';

import {
  facePreviewGeometryIds,
  facePreviewObjectIds,
  selectedObjectIds,
} from '../src/preview-object-ids.js';

describe('preview object ownership', () => {
  it('keeps every selected brush and point entity in a mixed preview', () => {
    const document = createStarterDocument();
    const brush = brushesInDocument(document)[0]!;
    const entity = pointEntitiesInDocument(document)[0]!;

    expect(selectedObjectIds(createObjectSelection([brush.id], [entity.id]))).toEqual([
      brush.id,
      entity.id,
    ]);
  });

  it('includes attribute-transfer targets without dropping the selected source', () => {
    const session = new EditorSession(createStarterDocument());
    const [sourceBrush, targetBrush] = brushesInDocument(session.document);
    const source = { brushId: sourceBrush!.id, faceId: sourceBrush!.faces[0]!.id };
    const target = { brushId: targetBrush!.id, faceId: targetBrush!.faces[0]!.id };
    session.select(createFaceSelection([source]));
    const candidate = session.createFaceAttributeTransferCandidate(source, [target], 'material');
    expect(candidate).not.toBeNull();

    expect(facePreviewGeometryIds(candidate!)).toEqual([targetBrush!.id]);
    expect(facePreviewObjectIds(candidate!, session.selection)).toEqual([
      sourceBrush!.id,
      targetBrush!.id,
    ]);
  });

  it('includes stamped brushes alongside their selected source', () => {
    const session = new EditorSession(createStarterDocument());
    const sourceBrush = brushesInDocument(session.document)[0]!;
    const source = { brushId: sourceBrush.id, faceId: sourceBrush.faces[0]!.id };
    session.select(createFaceSelection([source]));
    const candidate = session.createFaceStampCandidate(
      [source],
      source,
      16,
      createSequentialIdFactory('preview-stamp'),
      true,
    );
    expect(candidate).not.toBeNull();

    expect(facePreviewGeometryIds(candidate!)).toEqual(candidate!.selectionAfter);
    expect(facePreviewObjectIds(candidate!, session.selection)).toEqual([
      sourceBrush.id,
      ...candidate!.selectionAfter,
    ]);
  });
});
