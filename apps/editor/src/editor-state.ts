import type { WorldviewViewer } from '@jackharrhy/worldview';
import {
  DEFAULT_SIMPLE_SHAPE_OPTIONS,
  EDITOR_ISSUE_TYPE_INFO,
  EditorMaterialCatalog,
  EditorSession,
  EditorSourceRenderer,
  EntityDefinitionCatalog,
  MapCompileCoordinator,
  RemoteMapCompiler,
  createEmptyDocument,
  rebaseMapSource,
  serializeMap,
  type BrushBatchClipCandidate,
  type BrushBatchCreationCandidate,
  type BrushBatchEditCandidate,
  type BrushClipCandidate,
  type BrushClipMode,
  type BrushCreationCandidate,
  type BrushEditCandidate,
  type DocumentEditCandidate,
  type EditorCameraChangeEvent,
  type EditorDiagnosticOverlay,
  type EditorIssueType,
  type EditorLayerId,
  type EditorPointerPositionEvent,
  type EditorReferenceScene,
  type EditorSpriteMaterial,
  type EditorTool,
  type EditorTopologyKind,
  type EntityLinkMode,
  type MapCompileResult,
  type MapCompileQuality,
  type MapBuildService,
  type MapDocument,
  type WorldviewGameProfile,
  type MapSourceState,
  type SimpleShapeOptions,
  type SweepCandidate,
  type SweepOptions,
  type SweepTransform,
  type Vec3,
} from '@jackharrhy/worldview-editor';
import { MapBuildHistoryService } from './build-history.js';
import { DocumentRecoveryService } from './document-recovery.js';
import { EditorClipboard } from './editor-clipboard.js';
import type { EditorElements } from './editor-elements.js';
import {
  createDeveloperMaterial,
  createDiagnosticQuakePalette,
} from './editor-material-fixtures.js';
import type { EditorFileHandle } from './project-files.js';
import { ProjectLocalStateService } from './project-local-state.js';
import { AssetMountStateService } from './asset-mount-state.js';
import type { WorldviewProjectWorkspace } from './project-workspace.js';
import { TextureUvEditor } from './uv-editor.js';

export interface EditorStateHost {
  effectiveObjectViewState(
    document?: MapDocument,
  ): Parameters<EditorSourceRenderer['setDocument']>[2];
  setEditorTool(tool: EditorTool): void;
  updateInspector(document?: MapDocument, selection?: MapDocumentSelection): void;
}

export interface EditorStateOptions {
  readonly buildService?: MapBuildService;
  readonly buildServiceEnabled?: boolean;
}

type MapDocumentSelection = Parameters<EditorSession['select']>[0];

export class EditorState {
  public readonly initialDocument = createEmptyDocument();
  public session = new EditorSession(this.initialDocument);
  public currentMapSource: MapSourceState = rebaseMapSource(
    this.initialDocument,
    serializeMap(this.initialDocument),
  );
  public currentFileHandle: EditorFileHandle | null = null;
  public lastDiskFingerprint: string | null = null;
  public savedDocumentRevision = -1;
  public documentDirty = true;
  public replacingDocument = false;
  public lastRecoveryLabel = 'Initial document';
  public projectWorkspace: WorldviewProjectWorkspace | null = null;
  public projectKey: string | null = null;
  public workspaceId = `browser:${crypto.randomUUID()}`;
  public documentKey = `${this.workspaceId}:untitled`;
  public activeGameProfile: WorldviewGameProfile = 'quake';
  public entityDefinitions = new EntityDefinitionCatalog();
  public projectSprites: readonly EditorSpriteMaterial[] = [];
  public renderer: EditorSourceRenderer | null = null;
  public stopSubscription: (() => void) | null = null;
  public moveCandidate: DocumentEditCandidate | null = null;
  public duplicationBase: DocumentEditCandidate | null = null;
  public duplicationCandidate: DocumentEditCandidate | null = null;
  public faceCandidate:
    | BrushEditCandidate
    | BrushBatchEditCandidate
    | BrushClipCandidate
    | BrushBatchClipCandidate
    | BrushBatchCreationCandidate
    | null = null;
  public faceTransferCandidate: BrushEditCandidate | BrushBatchEditCandidate | null = null;
  public uvTextureCandidate: BrushEditCandidate | BrushBatchEditCandidate | null = null;
  public faceSplitSequence = 0;
  public faceStampSequence = 0;
  public faceTranslationSequence = 0;
  public sweepCandidate: SweepCandidate | null = null;
  public sweepTransform: SweepTransform = {
    translation: [0, 0, 64],
    rotationDegrees: [0, 0, 0],
    scale: 1,
  };
  public sweepDefaultTransform: SweepTransform = this.sweepTransform;
  public sweepOptions: SweepOptions = {
    path: 'straight',
    segments: 4,
    iterations: 1,
    snapToInteger: false,
    textureLock: true,
  };
  public sweepDragBase: SweepTransform | null = null;
  public sweepEscapeReset = false;
  public sweepSequence = 0;
  public transformCandidate:
    | BrushEditCandidate
    | BrushBatchEditCandidate
    | DocumentEditCandidate
    | null = null;
  public topologyCandidate: BrushEditCandidate | BrushBatchEditCandidate | null = null;
  public topologySequence = 0;
  public topologySelectedVertices: readonly Vec3[] = [];
  public topologySelectionKind: EditorTopologyKind | null = null;
  public topologyTransformSequence = 0;
  public transformPivot: Vec3 | null = null;
  public transformPivotSelectionKey: string | null = null;
  public clipCandidate: BrushClipCandidate | BrushBatchClipCandidate | null = null;
  public clipPlanePoints: readonly [Vec3, Vec3, Vec3] | null = null;
  public clipMode: BrushClipMode = 'back';
  public clipSequence = 0;
  public csgSequence = 0;
  public creationCandidate: BrushBatchCreationCandidate | null = null;
  public creationSequence = 0;
  public simpleShapeOptions: SimpleShapeOptions = { ...DEFAULT_SIMPLE_SHAPE_OPTIONS };
  public hullCandidate: BrushCreationCandidate | null = null;
  public hullBuildPoints: readonly Vec3[] = [];
  public hullSequence = 0;
  public duplicateSequence = 0;
  public lastPointerPosition: EditorPointerPositionEvent | null = null;
  public perspectiveCamera: EditorCameraChangeEvent['camera'] | null = null;
  public activeGridSize: number;
  public currentDocumentName = 'untitled.map';
  public activeEntityId: MapDocument['entities'][number]['id'] | null = null;
  public activeTool: EditorTool = 'select';
  public compiledViewer: WorldviewViewer | null = null;
  public compiledRevision: number | null = null;
  public latestBuild: MapCompileResult | null = null;
  public buildOverlays: readonly EditorDiagnosticOverlay[] = [];
  public leakOverlayVisible = true;
  public portalOverlayVisible = false;
  public launchProfileId: string | null = null;
  public activeCompileProfileId = 'default';
  public activeCompileQuality: MapCompileQuality = 'preview';
  public showingCompiled = false;
  public referenceScenes: EditorReferenceScene[] = [];
  public referenceSequence = 0;
  public entityLinkMode: EntityLinkMode = 'direct';
  public openGroupId: string | null = null;
  public selectedLayerId: EditorLayerId = null;
  public layerPanelSignature = '';
  public issueBrowserOpen = false;
  public viewFilterPopoverOpen = false;
  public readonly hiddenIssueIds = new Set<string>();
  public readonly enabledIssueTypes = new Set<EditorIssueType>(
    EDITOR_ISSUE_TYPE_INFO.map((entry) => entry.type),
  );
  public readonly buildService: MapBuildService;
  public readonly compilerCoordinator: MapCompileCoordinator;
  public readonly buildServiceEnabled: boolean;
  public readonly buildHistory: MapBuildHistoryService;
  public readonly projectLocalState = new ProjectLocalStateService();
  public readonly assetMountState = new AssetMountStateService();
  public readonly materialCatalog = new EditorMaterialCatalog();
  public readonly builtInMaterials = [
    createDeveloperMaterial('DEV_FLOOR', [205, 82, 13], [255, 214, 154]),
    createDeveloperMaterial('DEV_PILLAR', [70, 75, 79], [214, 219, 216]),
    createDeveloperMaterial('DEV_ORANGE_64', [220, 91, 12], [255, 220, 164]),
    createDeveloperMaterial('DEV_GREY_64', [83, 88, 91], [224, 228, 225]),
  ] as const;
  public readonly uvEditor: TextureUvEditor;
  public readonly loadedWadSources = new Map<string, ArrayBuffer>();
  public readonly editorClipboard: EditorClipboard;
  public quakePalette: Uint8Array | undefined;
  public activeMaterialName = '';
  public viewportContext:
    | import('@jackharrhy/worldview-editor').EditorViewportContextMenuEvent
    | null = null;
  public readonly diagnosticQuakePalette = createDiagnosticQuakePalette();
  public compiledPreviewWarning: string | null = null;
  public readonly recovery: DocumentRecoveryService;

  public constructor(
    public readonly ui: EditorElements,
    host: () => EditorStateHost,
    signal: AbortSignal,
    options: EditorStateOptions = {},
  ) {
    this.activeGridSize = Number(ui.gridSizeSelect.value);
    const configuredCompilerEndpoint =
      new URLSearchParams(window.location.search).get('compiler') ??
      import.meta.env.VITE_WORLDVIEW_COMPILER_ENDPOINT;
    const localHost =
      window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
    this.buildServiceEnabled =
      options.buildServiceEnabled ??
      (Boolean(options.buildService ?? configuredCompilerEndpoint) || localHost);
    const compilerEndpoint = configuredCompilerEndpoint ?? 'http://127.0.0.1:8788/compile';
    this.buildService =
      options.buildService ?? new RemoteMapCompiler({ endpoint: compilerEndpoint });
    this.compilerCoordinator = new MapCompileCoordinator(this.buildService);
    this.buildHistory = new MapBuildHistoryService(undefined, (error) => {
      if (signal.aborted) return;
      ui.statusMessage.setError(
        `Build history storage failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    for (const material of this.builtInMaterials) this.materialCatalog.set(material);
    this.uvEditor = new TextureUvEditor({
      svg: ui.uvEditorSvg,
      status: ui.uvEditorStatus,
      resetPivotButton: ui.uvResetPivot,
      signal,
      onStatus(message) {
        ui.statusMessage.textContent = message;
      },
      onTransform: (event) => {
        if (event.phase === 'cancel') {
          this.uvTextureCandidate = null;
          this.renderer?.setDocument(
            this.session.document,
            this.session.selection,
            host().effectiveObjectViewState(),
          );
          host().updateInspector();
          ui.statusMessage.textContent = 'UV transform cancelled.';
          return;
        }
        try {
          const candidate = this.session.createTextureTransformDeltaCandidate(
            event.transform,
            event.selection,
            event.pivot,
          );
          if (!candidate) return;
          if (event.phase === 'preview') {
            this.uvTextureCandidate = candidate;
            this.renderer?.setDocument(
              candidate.document,
              this.session.selection,
              host().effectiveObjectViewState(candidate.document),
            );
            host().updateInspector(candidate.document, this.session.selection);
            ui.statusMessage.textContent = `${candidate.label} preview. Release to commit.`;
            return;
          }
          this.session.commitCandidate(this.uvTextureCandidate ?? candidate);
          this.uvTextureCandidate = null;
        } catch (error) {
          this.uvTextureCandidate = null;
          this.renderer?.setDocument(
            this.session.document,
            this.session.selection,
            host().effectiveObjectViewState(),
          );
          host().updateInspector();
          ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
        }
      },
    });
    this.editorClipboard = new EditorClipboard({
      session: () => this.session,
      context: () => ({
        pointer: this.lastPointerPosition,
        textureLock: ui.textureLock.checked,
        targetGroupId: this.openGroupId,
        selectToolActive: this.activeTool === 'select',
        gridSize: this.activeGridSize,
      }),
      activateSelectTool: () => host().setEditorTool('select'),
      setStatus: (message) => {
        ui.statusMessage.textContent = message;
      },
    });
    this.recovery = new DocumentRecoveryService(
      () => ({
        documentKey: this.documentKey,
        fileName: this.currentDocumentName,
        document: this.session.document,
        source: this.currentMapSource,
        savedDocumentRevision: this.savedDocumentRevision,
        label: this.lastRecoveryLabel,
      }),
      undefined,
      (error) => {
        if (signal.aborted) return;
        ui.statusMessage.setError(
          `Recovery storage failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );
  }
}
