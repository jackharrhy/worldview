import {
  selectedBrushIds,
  selectedFaceReferences,
  selectedPointEntityIds,
  type BrushBatchClipCandidate,
  type BrushBatchCreationCandidate,
  type BrushBatchEditCandidate,
  type BrushClipCandidate,
  type BrushEditCandidate,
  type EditorSelection,
} from '@jackharrhy/worldview-editor';

type FacePreviewCandidate =
  | BrushEditCandidate
  | BrushBatchEditCandidate
  | BrushClipCandidate
  | BrushBatchClipCandidate
  | BrushBatchCreationCandidate;

export function selectedObjectIds(selection: EditorSelection | null): readonly string[] {
  return [
    ...new Set([
      ...selectedBrushIds(selection),
      ...selectedFaceReferences(selection).map((face) => face.brushId),
      ...selectedPointEntityIds(selection),
    ]),
  ];
}

export function editedBrushIds(
  candidate: BrushEditCandidate | BrushBatchEditCandidate,
): readonly string[] {
  return 'edits' in candidate ? candidate.edits.map((edit) => edit.brushId) : [candidate.brushId];
}

export function facePreviewGeometryIds(candidate: FacePreviewCandidate): readonly string[] {
  return 'insertions' in candidate
    ? candidate.insertions.map((insertion) => insertion.brush.id)
    : 'mode' in candidate
      ? 'selectionBefore' in candidate
        ? [...candidate.selectionBefore, ...candidate.selectionAfter]
        : [candidate.before.id, ...candidate.after.map((brush) => brush.id)]
      : editedBrushIds(candidate);
}

export function facePreviewObjectIds(
  candidate: FacePreviewCandidate,
  selection: EditorSelection | null,
): readonly string[] {
  return [...new Set([...selectedObjectIds(selection), ...facePreviewGeometryIds(candidate)])];
}
