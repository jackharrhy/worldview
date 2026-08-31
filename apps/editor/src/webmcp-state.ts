import {
  selectedBrushIds,
  selectedFaceReferences,
  selectedPointEntityIds,
  type EditorSelection,
} from '@jackharrhy/worldview-editor';

import type { EditorStatePort } from './editor-state-port.js';

export type WebMcpDocumentState = EditorStatePort<
  'currentDocumentName' | 'documentDirty' | 'session'
>;

export function webMcpSelectionSummary(selection: EditorSelection | null) {
  return {
    kind: !selection ? 'none' : selection.faceId ? 'faces' : 'objects',
    brushIds: selectedBrushIds(selection),
    entityIds: selectedPointEntityIds(selection),
    faces: selectedFaceReferences(selection),
    groupId: selection?.groupId ?? null,
  } as const;
}

export function webMcpDocumentState(state: WebMcpDocumentState) {
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
