import {
  selectedBrushIds,
  selectedFaceReferences,
  selectedPointEntityIds,
  type EditorSelection,
} from '@jackharrhy/worldview-editor';

import type { EditorState } from './editor-state.js';

export function webMcpSelectionSummary(selection: EditorSelection | null) {
  return {
    kind: !selection ? 'none' : selection.faceId ? 'faces' : 'objects',
    brushIds: selectedBrushIds(selection),
    entityIds: selectedPointEntityIds(selection),
    faces: selectedFaceReferences(selection),
    groupId: selection?.groupId ?? null,
  } as const;
}

export function webMcpDocumentState(state: EditorState) {
  const document = state.session.document;
  return {
    documentId: document.id,
    name: state.currentDocumentName,
    revision: document.revision,
    format: document.faceSyntax,
    dirty: state.documentDirty,
    selection: webMcpSelectionSummary(state.session.selection),
    canUndo: state.session.canUndo,
    undoLabel: state.session.undoLabel,
    canRedo: state.session.canRedo,
    redoLabel: state.session.redoLabel,
  } as const;
}
