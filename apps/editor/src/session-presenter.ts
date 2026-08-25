import { type EditorFileHandle } from './project-files.js';
import {
  selectedFaceReferences,
  serializeMap,
  rebaseMapSource,
  type EditorTool,
  type MapDocument,
  type MapSourceState,
} from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';
import { required } from './editor-elements.js';

interface ReplaceDocumentOptions {
  readonly name?: string;
  readonly source?: MapSourceState;
  readonly fileHandle?: EditorFileHandle | null;
  readonly diskFingerprint?: string | null;
  readonly dirty?: boolean;
  readonly savedRevision?: number;
  readonly focusView?: boolean;
}

export class SessionPresenter {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
  }

  public connectSession(): void {
    this.state.stopSubscription?.();
    this.state.stopSubscription = this.state.session.subscribe((change) => {
      const started = performance.now();
      this.state.renderer?.setDocument(
        this.state.session.document,
        this.state.session.selection,
        this.app.organization.effectiveObjectViewState(),
      );
      this.app.inspector.updateInspector();
      if (change.kind !== 'selection' && change.kind !== 'view') {
        this.app.document.updateSourceFromDocument();
        this.state.lastRecoveryLabel = change.label;
        if (!this.state.replacingDocument) {
          this.app.document.setDocumentDirty(true);
          this.state.recovery.schedule();
        }
      }
      if (change.kind === 'document' || change.kind === 'history')
        this.app.materials.renderMaterialCatalog();
      else this.app.materials.updateMaterialBrowserControls();
      if (
        change.kind !== 'selection' &&
        this.state.compiledRevision !== null &&
        this.state.compiledRevision !== this.state.session.document.revision
      ) {
        this.app.build.showCompiledPreview(false);
        this.app.build.setCompileState(`PREVIEW R${this.state.compiledRevision} STALE`, 'stale');
      }
      if (change.kind !== 'selection' && change.kind !== 'view')
        this.ui.launchButton.disabled = true;
      this.ui.statusMessage.textContent = `${change.label}. Document revision ${change.documentRevision}.`;
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
    this.state.layerPanelSignature = '';
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
    this.ui.pasteHereButton.disabled = true;
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
    this.app.document.setDocumentDirty(options.dirty ?? false);
    if (options.name) this.app.document.setDocumentName(options.name);
    this.ui.sourceMessage.textContent = 'Source parsed successfully.';
    this.ui.sourceMessage.classList.remove('error-text');
  }

  public setEditorTool(tool: EditorTool): void {
    const previousTool = this.state.activeTool;
    if (previousTool === 'sweep' && tool !== 'sweep') {
      this.state.sweepCandidate = null;
      this.state.sweepDragBase = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.state.renderer?.setSweepCaps([]);
    }
    if (
      (tool === 'clip' ||
        this.app.transform.isTransformTool(tool) ||
        this.app.transform.isTopologyTool(tool)) &&
      this.state.session.selection?.faceId
    ) {
      this.state.session.select({ brushId: this.state.session.selection.brushId });
    }
    if (this.app.transform.isTransformTool(tool) && tool !== this.state.activeTool) {
      this.state.transformPivot = null;
      this.state.transformPivotSelectionKey = null;
      this.state.renderer?.setTransformPivot(null);
    }
    this.state.activeTool = tool;
    this.state.renderer?.setTool(tool);
    if (tool === 'sweep' && previousTool !== 'sweep') {
      this.state.sweepDefaultTransform = this.app.geometry.initialSweepTransform();
      this.state.sweepTransform = this.app.geometry.cloneSweepTransform(
        this.state.sweepDefaultTransform,
      );
      this.state.sweepEscapeReset = false;
      this.app.geometry.resetSweep(false);
    }
    if (tool === 'create') this.app.geometry.updateSimpleShapeFields();
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
      const active = button.dataset.tool === tool;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    required<HTMLElement>('#pointer-context').textContent =
      `${tool === 'create' ? 'CREATE' : tool === 'entity' ? 'ENTITY' : tool === 'hull' ? 'HULL' : tool === 'face' ? 'FACE' : tool === 'sweep' ? 'SWEEP' : tool === 'clip' ? 'CLIP' : this.app.transform.isTopologyTool(tool) || this.app.transform.isTransformTool(tool) ? tool.toUpperCase() : 'PERSPECTIVE'} / edit`;
    this.ui.statusMessage.textContent =
      tool === 'create'
        ? `Simple Shape tool active. Drag in any viewport to draw a ${this.app.geometry.simpleShapeLabel(this.state.simpleShapeOptions.kind)}; use the Object inspector for shape options.`
        : tool === 'entity'
          ? `Entity tool active. Click a surface or 2D viewport to place ${this.ui.pointEntityClassname.value.trim() || 'a point entity'}.`
          : tool === 'hull'
            ? 'Hull tool active in perspective. Place points on reference faces; Enter creates their convex hull and Escape discards the point set.'
            : tool === 'face'
              ? 'Face tool active. Drag a center handle to extrude, Alt-drag it on the viewport plane, or use Arrow keys on the pointed viewport. Ctrl/Command-drag splits and Ctrl/Command+Alt-drag stamps. Escape clears handles before leaving.'
              : tool === 'sweep'
                ? selectedFaceReferences(this.state.session.selection).length > 0
                  ? 'Sweep tool active. Move, rotate, or scale the green destination cap in 3D; tune its path in the inspector and press Enter to generate the gap.'
                  : 'Sweep tool needs one or more selected brush faces. Select faces with the Face tool or Shift-click in Select, then activate Sweep again.'
                : tool === 'clip'
                  ? 'Clip tool active. Click two or three points, drag to place two, or drag an orange point to move it. Shift locks moved points to one axis in 2D; double-click matches a face plane.'
                  : tool === 'vertex'
                    ? 'Vertex tool active. Shift+Alt-click a target vertex to snap; Arrow keys nudge on the pointed viewport. Ctrl/Command adds corners or toggles absolute drag snapping. Escape clears handles before leaving.'
                    : tool === 'edge'
                      ? 'Edge tool active. Ctrl/Command selects multiple edge centers; Arrow keys nudge them on the pointed viewport. Escape clears handles before leaving.'
                      : tool === 'rotate'
                        ? 'Rotate tool active. Drag around the pivot; angles snap to 15°, or hold Shift for 5°. Selected vertex or edge handles take priority over brushes.'
                        : tool === 'scale'
                          ? 'Scale tool active. Drag a side, edge, or corner handle. The opposite handle stays fixed; hold Alt to anchor at center or Shift for proportional axes. Selected vertex or edge handles take priority over brushes.'
                          : tool === 'shear'
                            ? 'Shear tool active. Drag horizontally to offset the viewport plane by snapped grid units. Selected vertex or edge handles take priority over brushes.'
                            : 'Select tool active. Drag on XY in 3D; Alt moves vertically and Shift locks an axis. Shift-drag a selected brush face to resize it; add Ctrl/Command to split, Alt to move the face freely, or both to stamp. Ctrl/Command-drag duplicates selected brushes or paint-selects unselected ones; Ctrl/Command-wheel drills through 3D hits. Shift-click selects a face.';
    this.app.inspector.updateInspector(
      tool === 'sweep' && this.state.sweepCandidate
        ? this.state.sweepCandidate.document
        : this.state.session.document,
      this.state.session.selection,
    );
  }
}
