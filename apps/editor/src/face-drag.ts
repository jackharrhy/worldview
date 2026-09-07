import {
  createSequentialIdFactory,
  extrudableBrushFaces,
  selectedFaceReferences,
  selectedBrushIds,
  type EditorFaceDragEvent,
  type FaceSelection,
} from '@jackharrhy/worldview-editor';
import type { EditorStatePort } from './editor-state-port.js';
import type { EditorShellState } from './editor-shell-state.js';
import { facePreviewGeometryIds, facePreviewObjectIds } from './preview-object-ids.js';

type FaceDragState = EditorStatePort<
  | 'session'
  | 'renderer'
  | 'textureLock'
  | 'faceCandidate'
  | 'faceTranslationSequence'
  | 'faceSplitSequence'
  | 'faceStampSequence',
  'faceCandidate' | 'faceTranslationSequence' | 'faceSplitSequence' | 'faceStampSequence'
>;
type FaceDragUi = Pick<EditorShellState, 'statusMessage' | 'pointerContext'>;

function createFaceCandidate(
  event: EditorFaceDragEvent,
  state: FaceDragState,
): FaceDragState['faceCandidate'] {
  const { session } = state;
  const eventFace = { brushId: event.selection.brushId, faceId: event.selection.faceId };
  const selectedFaces = selectedFaceReferences(session.selection);
  const selectedBrushes = selectedBrushIds(session.selection);
  let faces: readonly FaceSelection[] = [eventFace];
  if (
    selectedFaces.some(
      (face) => face.brushId === eventFace.brushId && face.faceId === eventFace.faceId,
    )
  )
    faces = selectedFaces;
  else if (
    selectedBrushes.includes(eventFace.brushId) &&
    event.mode === 'normal' &&
    !event.split &&
    !event.stamp
  )
    faces = extrudableBrushFaces(session.document, eventFace, selectedBrushes);
  if (event.mode === 'translate')
    return session.createFaceSetTranslationCandidate(
      faces,
      event.delta,
      createSequentialIdFactory(`face-move-${state.faceTranslationSequence + 1}`),
      state.textureLock,
    );
  if (event.stamp)
    return session.createFaceStampCandidate(
      faces,
      eventFace,
      event.distance,
      createSequentialIdFactory(`face-stamp-${state.faceStampSequence + 1}`),
      state.textureLock,
    );
  if (event.split)
    return session.createFaceSetSplitCandidate(
      faces,
      eventFace,
      event.distance,
      createSequentialIdFactory(`face-split-${state.faceSplitSequence + 1}`),
    );
  return session.createFaceSetExtrusionCandidate(faces, eventFace, event.distance);
}

function resolveFaceCandidate(event: EditorFaceDragEvent, state: FaceDragState) {
  try {
    return { candidate: createFaceCandidate(event, state), limited: false };
  } catch (error) {
    const candidate = state.faceCandidate;
    // Last-valid fallback belongs to this document revision, never a concurrent edit.
    if (!candidate || candidate.baseDocumentRevision !== state.session.document.revision)
      throw error;
    return { candidate, limited: true };
  }
}

/** Face gesture policy: sample, keep last valid geometry, then commit or cancel once. */
export function handleFaceDrag(
  event: EditorFaceDragEvent,
  state: FaceDragState,
  ui: FaceDragUi,
  inspector: { updateInspector(): void },
  formatting: { formatVector(value: readonly number[]): string },
): void {
  const pointerContext = ui.pointerContext;
  const hasMovement =
    event.mode === 'translate'
      ? event.delta.some((component) => Math.abs(component) > Number.EPSILON)
      : Math.abs(event.distance) > Number.EPSILON;
  if (event.phase === 'cancel' || !hasMovement) {
    state.faceCandidate = null;
    state.renderer?.setDocument(state.session.document, state.session.selection);
    inspector.updateInspector();
    ui.statusMessage.set(
      event.phase === 'cancel'
        ? event.mode === 'translate'
          ? 'Face move cancelled.'
          : event.stamp
            ? 'Face stamp cancelled.'
            : event.split
              ? 'Face split cancelled.'
              : 'Face extrusion cancelled.'
        : 'Face stayed on its plane.',
    );
    pointerContext.set(`${event.viewport.toUpperCase()} / face`);
    return;
  }

  try {
    const { candidate, limited } = resolveFaceCandidate(event, state);
    if (limited && event.phase === 'preview') {
      ui.statusMessage.set('Brush limit reached. Keeping the last valid shape; release to commit.');
      return;
    }
    if (!candidate) return;
    if (event.phase === 'preview') {
      state.faceCandidate = candidate;
      state.renderer?.setPreviewDocument(
        candidate.document,
        state.session.selection,
        facePreviewGeometryIds(candidate),
        facePreviewObjectIds(candidate, state.session.selection),
      );
      // The viewport is the latency-critical feedback surface during a drag. Inspector
      // values settle from the committed session change; rebuilding its derived model on
      // every snapped pointer position only competes with the next visual frame.
      ui.statusMessage.set(
        event.mode === 'translate'
          ? `Face move preview: ${formatting.formatVector(event.delta)}. Release to commit.`
          : `${event.stamp ? 'Face stamp' : event.split ? 'Face split' : 'Face extrusion'} preview: ${event.distance > 0 ? '+' : ''}${event.distance}. Release to commit.`,
      );
      pointerContext.set(
        event.mode === 'translate'
          ? `${event.viewport.toUpperCase()} / face move ${formatting.formatVector(event.delta)}`
          : `${event.viewport.toUpperCase()} / face ${event.stamp ? 'stamp ' : event.split ? 'split ' : ''}${event.distance}`,
      );
      return;
    }
    if ('insertions' in candidate) {
      state.session.commitBatchCreationCandidate(candidate);
      state.faceStampSequence += 1;
    } else if ('mode' in candidate) {
      state.session.commitClipCandidate(candidate);
      state.faceSplitSequence += 1;
    } else {
      state.session.commitCandidate(candidate);
      if (event.mode === 'translate') state.faceTranslationSequence += 1;
    }
    state.faceCandidate = null;
    pointerContext.set(`${event.viewport.toUpperCase()} / face`);
  } catch (error) {
    state.faceCandidate = null;
    state.renderer?.setDocument(state.session.document, state.session.selection);
    inspector.updateInspector();
    ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    pointerContext.set(`${event.viewport.toUpperCase()} / face invalid`);
  }
}
