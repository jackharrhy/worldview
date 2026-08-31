import type { ReplaceDocumentOptions } from './editor-application-contracts.js';
import {
  serializeMap,
  rebaseMapSource,
  type EditorObjectViewState,
  type EditorSelection,
  type EditorTool,
  type MapDocument,
} from '@jackharrhy/worldview-editor';

import type { EditorShellState } from './editor-shell-state.js';
import type { EditorStatePort } from './editor-state-port.js';

type SessionUi = Pick<EditorShellState, 'editorCommands' | 'projectUi' | 'statusMessage'>;

type SessionState = EditorStatePort<
  | 'clipCandidate'
  | 'clipPlanePoints'
  | 'compiledRevision'
  | 'creationCandidate'
  | 'currentFileHandle'
  | 'currentMapSource'
  | 'duplicationBase'
  | 'duplicationCandidate'
  | 'faceCandidate'
  | 'faceTransferCandidate'
  | 'hiddenIssueIds'
  | 'hullBuildPoints'
  | 'hullCandidate'
  | 'lastDiskFingerprint'
  | 'lastPointerPosition'
  | 'lastRecoveryLabel'
  | 'moveCandidate'
  | 'openGroupId'
  | 'recovery'
  | 'renderer'
  | 'replacingDocument'
  | 'savedDocumentRevision'
  | 'selectedLayerId'
  | 'session'
  | 'stopSubscription'
  | 'sweepCandidate'
  | 'sweepDragBase'
  | 'sweepEscapeReset'
  | 'topologyCandidate'
  | 'topologySelectedVertices'
  | 'topologySelectionCount'
  | 'topologySelectionKind'
  | 'transformCandidate'
  | 'transformPivot'
  | 'transformPivotSelectionKey'
  | 'uvEditor'
  | 'uvTextureCandidate',
  | 'clipCandidate'
  | 'clipPlanePoints'
  | 'creationCandidate'
  | 'currentFileHandle'
  | 'currentMapSource'
  | 'duplicationBase'
  | 'duplicationCandidate'
  | 'faceCandidate'
  | 'faceTransferCandidate'
  | 'hullBuildPoints'
  | 'hullCandidate'
  | 'lastDiskFingerprint'
  | 'lastPointerPosition'
  | 'lastRecoveryLabel'
  | 'moveCandidate'
  | 'openGroupId'
  | 'replacingDocument'
  | 'savedDocumentRevision'
  | 'selectedLayerId'
  | 'stopSubscription'
  | 'sweepCandidate'
  | 'sweepDragBase'
  | 'sweepEscapeReset'
  | 'topologyCandidate'
  | 'topologySelectedVertices'
  | 'topologySelectionCount'
  | 'topologySelectionKind'
  | 'transformCandidate'
  | 'transformPivot'
  | 'transformPivotSelectionKey'
  | 'uvTextureCandidate'
>;

interface SessionBuildCommands {
  setCompileState(label: string, state: 'offline' | 'ready' | 'busy' | 'stale'): void;
  showCompiledPreview(show: boolean): void;
}

interface SessionDocumentCommands {
  setDocumentDirty(dirty: boolean): void;
  setDocumentName(name: string): void;
  updateSourceFromDocument(force?: boolean): void;
}

interface SessionInspectorCommands {
  updateInspector(document?: MapDocument, selection?: EditorSelection | null): void;
}

interface SessionMaterialCommands {
  renderMaterialCatalog(): void;
  updateMaterialBrowserControls(): void;
}

interface SessionOrganizationView {
  effectiveObjectViewState(document?: MapDocument): EditorObjectViewState;
}

interface SessionToolCommands {
  activate(tool: EditorTool): void;
}

export class SessionPresenter {
  public constructor(
    private readonly state: SessionState,
    private readonly ui: SessionUi,
    private readonly build: SessionBuildCommands,
    private readonly document: SessionDocumentCommands,
    private readonly inspector: SessionInspectorCommands,
    private readonly materials: SessionMaterialCommands,
    private readonly organization: SessionOrganizationView,
    private readonly tools: SessionToolCommands,
  ) {}

  public connectSession(): void {
    this.state.stopSubscription?.();
    this.state.stopSubscription = this.state.session.subscribe((change) => {
      const started = performance.now();
      this.state.renderer?.setDocument(
        this.state.session.document,
        this.state.session.selection,
        this.organization.effectiveObjectViewState(),
      );
      this.inspector.updateInspector();
      if (change.kind !== 'selection' && change.kind !== 'view') {
        this.document.updateSourceFromDocument();
        this.state.lastRecoveryLabel = change.label;
        if (!this.state.replacingDocument) {
          this.document.setDocumentDirty(true);
          this.state.recovery.schedule();
        }
      }
      if (change.kind === 'document' || change.kind === 'history')
        this.materials.renderMaterialCatalog();
      else this.materials.updateMaterialBrowserControls();
      if (
        change.kind !== 'selection' &&
        this.state.compiledRevision !== null &&
        this.state.compiledRevision !== this.state.session.document.revision
      ) {
        this.build.showCompiledPreview(false);
        this.build.setCompileState(`PREVIEW R${this.state.compiledRevision} STALE`, 'stale');
      }
      if (change.kind !== 'selection' && change.kind !== 'view')
        this.ui.editorCommands.updateActions({ launch: { disabled: true } });
      this.ui.statusMessage.set(`${change.label}. Document revision ${change.documentRevision}.`);
      performance.measure('worldview.editor.change-presentation', {
        start: started,
        end: performance.now(),
      });
    });
  }

  public replaceDocument(
    document: MapDocument,
    label: string,
    options: ReplaceDocumentOptions = {},
  ): void {
    this.state.openGroupId = null;
    this.state.selectedLayerId = null;
    this.state.hiddenIssueIds.clear();
    this.state.renderer?.setOpenGroupId(null);
    this.state.moveCandidate = null;
    this.state.duplicationBase = null;
    this.state.duplicationCandidate = null;
    this.state.faceCandidate = null;
    this.state.faceTransferCandidate = null;
    this.state.uvTextureCandidate = null;
    this.state.uvEditor.cancel();
    this.state.sweepCandidate = null;
    this.state.sweepDragBase = null;
    this.state.sweepEscapeReset = false;
    this.state.transformCandidate = null;
    this.state.topologyCandidate = null;
    this.state.topologySelectionCount = 0;
    this.state.topologySelectedVertices = [];
    this.state.topologySelectionKind = null;
    this.state.transformPivot = null;
    this.state.transformPivotSelectionKey = null;
    this.state.renderer?.setTransformPivot(null);
    this.state.clipCandidate = null;
    this.state.clipPlanePoints = null;
    this.state.creationCandidate = null;
    this.state.hullCandidate = null;
    this.state.hullBuildPoints = [];
    this.state.lastPointerPosition = null;
    this.ui.editorCommands.updateActions({ paste: { disabled: true } });
    this.state.renderer?.clearClipPlane();
    this.state.renderer?.clearHullPoints();
    this.state.renderer?.setSweepCaps([]);
    this.state.currentMapSource =
      options.source ?? rebaseMapSource(document, serializeMap(document));
    if (options.fileHandle !== undefined) this.state.currentFileHandle = options.fileHandle;
    if (options.diskFingerprint !== undefined)
      this.state.lastDiskFingerprint = options.diskFingerprint;
    this.state.replacingDocument = true;
    try {
      this.state.session.replaceDocument(document, label);
    } finally {
      this.state.replacingDocument = false;
    }
    if (options.focusView) this.state.renderer?.focusDocument();
    this.state.savedDocumentRevision = options.savedRevision ?? document.revision;
    this.state.lastRecoveryLabel = label;
    this.document.setDocumentDirty(options.dirty ?? false);
    if (options.name) this.document.setDocumentName(options.name);
    this.ui.projectUi.updateSource({
      message: 'Source parsed successfully.',
      tone: 'normal',
    });
  }

  public setEditorTool(tool: EditorTool): void {
    this.tools.activate(tool);
  }
}
