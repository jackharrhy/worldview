import { SnapshotStore } from '@jackharrhy/worldview';
import type {
  EditorMaterial,
  FaceTextureProjectionField,
  FaceTextureAlignmentOperation,
  SurfaceFlagDefinition,
  WorldviewGameProfile,
} from '@jackharrhy/worldview-editor/core';
import { EntityInspectorPort } from './entity-inspector-state.js';
import {
  EntityLinksPort,
  IssueBrowserPort,
  LayerPanelPort,
  ViewFilterPort,
} from './organization-ui-state.js';
import { ReferenceScenesPort } from './reference-scenes-state.js';
import {
  BuildLogPort,
  ProjectUiPort,
  ProjectToolbarPort,
  RecoveryVersionsPort,
} from './project-build-ui-state.js';
import { PointEntityToolPort } from './point-entity-tool-state.js';
import { EditorToolSettingsPort } from './editor-tool-settings-state.js';
import { EditorCommandPort } from './editor-command-state.js';
import { SelectionInspectorPort } from './selection-inspector-state.js';
import { SimpleShapeToolPort, SweepToolPort } from './geometry-tool-state.js';
import { ObjectToolsPort } from './object-tools-state.js';
import type { CollaborationLifecycleSnapshot } from './collaboration-lifecycle.js';

export interface StatusMessageSnapshot {
  readonly message: string;
  readonly tone: 'normal' | 'error';
}

export class StatusMessagePort {
  private readonly store = new SnapshotStore<StatusMessageSnapshot>({
    message: 'Starting WebGPU source renderer...',
    tone: 'normal',
  });

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public set(message: string | null): void {
    this.store.set({ message: message ?? '', tone: 'normal' });
  }

  public setError(message: string): void {
    this.store.set({ message, tone: 'error' });
  }
}

export interface DocumentNameSnapshot {
  readonly label: string;
  readonly title: string;
}

export class DocumentNamePort {
  private readonly store = new SnapshotStore<DocumentNameSnapshot>({
    label: 'untitled.map',
    title: 'untitled.map',
  });

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public set(label: string, title: string): void {
    this.store.set({ label, title });
  }
}

export interface CompileStateSnapshot {
  readonly label: string;
  readonly state: 'offline' | 'ready' | 'busy' | 'stale';
}

export class CompileStatePort {
  private readonly store = new SnapshotStore<CompileStateSnapshot>({
    label: 'COMPILER OFFLINE',
    state: 'offline',
  });

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public set(label: string, state: CompileStateSnapshot['state']): void {
    this.store.set({ label, state });
  }
}

export class PointerContextPort {
  private readonly store = new SnapshotStore('Perspective / edit');

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public set(message: string | null): void {
    this.store.set(message ?? '');
  }
}

export interface ViewportLayoutSnapshot {
  readonly perspectiveOnly: boolean;
  readonly rendererReady: boolean;
}

export type WorkspaceResizeKind =
  | 'viewport-column'
  | 'viewport-top'
  | 'viewport-cross'
  | 'inspector';

export interface WorkspaceLayoutSnapshot {
  readonly viewportColumn: number;
  readonly viewportTop: number;
  readonly inspectorWidth: number;
  readonly dragging: WorkspaceResizeKind | null;
}

export class WorkspaceLayoutPort {
  private readonly store = new SnapshotStore<WorkspaceLayoutSnapshot>({
    viewportColumn: 0.5,
    viewportTop: 0.5,
    inspectorWidth: 320,
    dragging: null,
  });
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public update(update: Partial<WorkspaceLayoutSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
}

export interface ViewportPresentationSnapshot {
  readonly showingCompiled: boolean;
  readonly perspectiveMode: string;
  readonly perspectiveTitle: string;
  readonly error: string | null;
}

export class ViewportPresentationPort {
  private readonly store = new SnapshotStore<ViewportPresentationSnapshot>({
    showingCompiled: false,
    perspectiveMode: 'EDIT',
    perspectiveTitle: '',
    error: null,
  });
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public update(update: Partial<ViewportPresentationSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
}

export interface ViewportLayoutActions {
  setPerspectiveOnly(enabled: boolean): void;
}

export class ViewportLayoutPort {
  private readonly store = new SnapshotStore<ViewportLayoutSnapshot>({
    perspectiveOnly: false,
    rendererReady: false,
  });
  private actions: ViewportLayoutActions | null = null;

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public bind(actions: ViewportLayoutActions): void {
    this.actions = actions;
    this.store.set({ ...this.store.getSnapshot(), rendererReady: true });
  }

  public unbind(): void {
    this.actions = null;
    this.store.set({ perspectiveOnly: false, rendererReady: false });
  }

  public setPerspectiveOnly(enabled: boolean): void {
    this.store.set({ ...this.store.getSnapshot(), perspectiveOnly: enabled });
  }

  public togglePerspectiveOnly(): void {
    const snapshot = this.store.getSnapshot();
    if (!snapshot.rendererReady) return;
    this.actions?.setPerspectiveOnly(!snapshot.perspectiveOnly);
  }
}

export type InspectorPage = 'map' | 'object' | 'textures';

export interface InspectorLayoutSnapshot {
  readonly active: InspectorPage;
  readonly open: boolean;
}

export class InspectorLayoutPort {
  private readonly store = new SnapshotStore<InspectorLayoutSnapshot>({
    active: 'object',
    open: true,
  });

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public setActive(page: InspectorPage): void {
    this.store.set({ ...this.store.getSnapshot(), active: page });
  }

  public setOpen(open: boolean): void {
    this.store.set({ ...this.store.getSnapshot(), open });
  }

  public toggle(): void {
    this.setOpen(!this.store.getSnapshot().open);
  }
}

export type EditorThemePreference = 'system' | 'dark' | 'light';

export interface ThemeUiActions {
  setPreference(preference: EditorThemePreference): void;
}

export class ThemeUiPort {
  private readonly store = new SnapshotStore<EditorThemePreference>('system');
  private actions: ThemeUiActions | null = null;

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public bind(actions: ThemeUiActions, preference: EditorThemePreference): void {
    this.actions = actions;
    this.store.set(preference);
  }

  public unbind(): void {
    this.actions = null;
  }

  public setPreference(preference: EditorThemePreference): void {
    this.store.set(preference);
  }

  public select(preference: EditorThemePreference): void {
    this.actions?.setPreference(preference);
  }
}

export interface ContextMenuActionSnapshot {
  readonly id: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly children?: readonly ContextMenuActionSnapshot[];
}

export interface ContextMenuSectionSnapshot {
  readonly id: string;
  readonly label: string;
  readonly emptyMessage?: string;
  readonly actions: readonly ContextMenuActionSnapshot[];
}

export interface ViewportContextMenuSnapshot {
  readonly open: boolean;
  readonly x: number;
  readonly y: number;
  readonly heading: string;
  readonly detail: string;
  readonly sections: readonly ContextMenuSectionSnapshot[];
}

export interface ViewportContextMenuActions {
  dismiss(restoreFocus: boolean): void;
  invoke(commandId: string): void;
}

const CLOSED_VIEWPORT_CONTEXT_MENU: ViewportContextMenuSnapshot = {
  open: false,
  x: 0,
  y: 0,
  heading: '',
  detail: '',
  sections: [],
};

export class ViewportContextMenuPort {
  private readonly store = new SnapshotStore<ViewportContextMenuSnapshot>(
    CLOSED_VIEWPORT_CONTEXT_MENU,
  );
  private actions: ViewportContextMenuActions | null = null;

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public bind(actions: ViewportContextMenuActions): void {
    this.actions = actions;
  }

  public unbind(): void {
    this.actions = null;
    this.hide();
  }

  public show(snapshot: Omit<ViewportContextMenuSnapshot, 'open'>): void {
    this.store.set({ ...snapshot, open: true });
  }

  public hide(): void {
    if (!this.store.getSnapshot().open) return;
    this.store.set(CLOSED_VIEWPORT_CONTEXT_MENU);
  }

  public dismiss(restoreFocus = false): void {
    this.actions?.dismiss(restoreFocus);
  }

  public invoke(commandId: string): void {
    this.actions?.invoke(commandId);
  }
}

export interface DocumentSummarySnapshot {
  readonly revision: number;
  readonly entityCount: number;
  readonly brushCount: number;
  readonly groupCount: number;
  readonly hiddenObjectCount: number;
  readonly lockedObjectCount: number;
  readonly geometryErrorCount: number;
}

export class DocumentSummaryPort {
  private readonly store = new SnapshotStore<DocumentSummarySnapshot>({
    revision: 0,
    entityCount: 0,
    brushCount: 0,
    groupCount: 0,
    hiddenObjectCount: 0,
    lockedObjectCount: 0,
    geometryErrorCount: 0,
  });

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public set(snapshot: DocumentSummarySnapshot): void {
    this.store.set(snapshot);
  }
}

export interface SurfaceFlagControl extends SurfaceFlagDefinition {
  readonly checked: boolean;
  readonly mixed: boolean;
}

export interface SurfaceInspectorSnapshot {
  readonly visible: boolean;
  readonly contents: readonly SurfaceFlagControl[];
  readonly flags: readonly SurfaceFlagControl[];
  readonly unknownContents: string;
  readonly unknownFlags: string;
  readonly value: string;
  readonly valueMixed: boolean;
  readonly valueLabel: string;
}

export interface SurfaceInspectorActions {
  setFlag(field: 'contents' | 'flags', mask: number, enabled: boolean): void;
  setValue(value: number): void;
}

export class SurfaceInspectorPort {
  private readonly store = new SnapshotStore<SurfaceInspectorSnapshot>({
    visible: false,
    contents: [],
    flags: [],
    unknownContents: '',
    unknownFlags: '',
    value: '',
    valueMixed: false,
    valueLabel: 'Value',
  });
  private actions: SurfaceInspectorActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: SurfaceInspectorActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
  }
  public set(snapshot: SurfaceInspectorSnapshot): void {
    this.store.set(snapshot);
  }
  public invoke<K extends keyof SurfaceInspectorActions>(
    action: K,
    ...args: Parameters<SurfaceInspectorActions[K]>
  ): void {
    const handler = this.actions?.[action] as
      | ((...values: Parameters<SurfaceInspectorActions[K]>) => void)
      | undefined;
    handler?.(...args);
  }
}

export interface FaceInspectorSnapshot {
  readonly mode: 'none' | 'single' | 'multiple';
  readonly selectedFaceCount: number;
  readonly material: string;
  readonly materialMixed: boolean;
  readonly materialSize: readonly [number, number] | null;
  readonly offset: readonly [number | null, number | null];
  readonly scale: readonly [number | null, number | null];
  readonly rotationDegrees: number | null;
  readonly uAxis: string;
  readonly vAxis: string;
  readonly canEditProjection: boolean;
  readonly canAlign: boolean;
  readonly uvStatus: string;
  readonly uvGrid: readonly [number, number];
}

export interface FaceInspectorActions {
  setProjectionField(field: FaceTextureProjectionField, value: number): void;
  align(
    operation: FaceTextureAlignmentOperation,
    options?: { readonly reverse?: boolean; readonly subdivide?: boolean },
  ): void;
  resetUvPivot(): void;
  frameUvSelection(): void;
  setUvGrid(axis: 0 | 1, subdivisions: number): void;
}

const EMPTY_FACE_INSPECTOR: FaceInspectorSnapshot = {
  mode: 'none',
  selectedFaceCount: 0,
  material: '',
  materialMixed: false,
  materialSize: null,
  offset: [null, null],
  scale: [null, null],
  rotationDegrees: null,
  uAxis: '',
  vAxis: '',
  canEditProjection: false,
  canAlign: false,
  uvStatus: 'No editable UV projection',
  uvGrid: [1, 1],
};

export class FaceInspectorPort {
  private readonly store = new SnapshotStore<FaceInspectorSnapshot>(EMPTY_FACE_INSPECTOR);
  private actions: FaceInspectorActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: FaceInspectorActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
    this.store.set(EMPTY_FACE_INSPECTOR);
  }
  public set(snapshot: FaceInspectorSnapshot): void {
    this.store.set(snapshot);
  }
  public update(update: Partial<FaceInspectorSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
  public invoke<K extends keyof FaceInspectorActions>(
    action: K,
    ...args: Parameters<FaceInspectorActions[K]>
  ): void {
    const handler = this.actions?.[action] as
      | ((...values: Parameters<FaceInspectorActions[K]>) => void)
      | undefined;
    handler?.(...args);
  }
}

export interface MaterialCellSnapshot {
  readonly material: EditorMaterial;
  readonly active: boolean;
  readonly inUse: boolean;
  readonly faceCount: number;
  readonly brushCount: number;
}

export interface MaterialBrowserSnapshot {
  readonly loadedCount: number;
  readonly usedCount: number;
  readonly cells: readonly MaterialCellSnapshot[];
  readonly activeMaterial: string;
  readonly filter: string;
  readonly sort: 'name' | 'usage';
  readonly usedOnly: boolean;
  readonly sources: readonly string[];
  readonly source: string;
  readonly coverageMessage: string;
  readonly replaceSource: string;
  readonly replaceTarget: string;
  readonly replaceScope: string;
  readonly revealVersion: number;
}

export interface MaterialBrowserActions {
  setFilter(value: string): void;
  setSort(value: 'name' | 'usage'): void;
  setUsedOnly(value: boolean): void;
  setSource(value: string): void;
  setActiveMaterial(value: string): void;
  activateMaterial(value: string): void;
  sampleSelection(): void;
  applyActiveMaterial(): void;
  selectFaces(): void;
  selectBrushes(): void;
  copyMaterialName(): void;
  setReplaceSource(value: string): void;
  setReplaceTarget(value: string): void;
  replace(): void;
}

const EMPTY_MATERIAL_BROWSER: MaterialBrowserSnapshot = {
  loadedCount: 0,
  usedCount: 0,
  cells: [],
  activeMaterial: '',
  filter: '',
  sort: 'name',
  usedOnly: false,
  sources: [],
  source: 'all',
  coverageMessage: '',
  replaceSource: '',
  replaceTarget: '',
  replaceScope: 'No selection: replace across the whole map.',
  revealVersion: 0,
};

export class MaterialBrowserPort {
  private readonly store = new SnapshotStore<MaterialBrowserSnapshot>(EMPTY_MATERIAL_BROWSER);
  private actions: MaterialBrowserActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: MaterialBrowserActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
    this.store.set(EMPTY_MATERIAL_BROWSER);
  }
  public set(snapshot: MaterialBrowserSnapshot): void {
    this.store.set(snapshot);
  }
  public update(update: Partial<MaterialBrowserSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
  public invoke<K extends keyof MaterialBrowserActions>(
    action: K,
    ...args: Parameters<MaterialBrowserActions[K]>
  ): void {
    const handler = this.actions?.[action] as
      | ((...values: Parameters<MaterialBrowserActions[K]>) => void)
      | undefined;
    handler?.(...args);
  }
}

export interface ResourceSettingsSnapshot {
  readonly loadedWadCount: number;
  readonly paletteLoaded: boolean;
  readonly message: string;
  readonly tone: 'normal' | 'error';
  readonly revealVersion: number;
}

export class ResourceSettingsPort {
  private readonly store = new SnapshotStore<ResourceSettingsSnapshot>({
    loadedWadCount: 0,
    paletteLoaded: false,
    message: 'Material resources are local to this browser until added to a project mount.',
    tone: 'normal',
    revealVersion: 0,
  });
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public update(update: Partial<ResourceSettingsSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
}

export interface RecentProjectSnapshot {
  readonly projectKey: string;
  readonly displayName: string;
  readonly detail: string;
  readonly updatedAt: number;
}

export interface WorkspaceHomeSnapshot {
  readonly visible: boolean;
  readonly newMapOpen: boolean;
  readonly name: string;
  readonly profile: WorldviewGameProfile;
  readonly format: 'valve-220' | 'quake';
  readonly recents: readonly RecentProjectSnapshot[];
}

export interface WorkspaceHomeActions {
  newMap(): void;
  cancelNewMap(): void;
  setName(name: string): void;
  setProfile(profile: WorkspaceHomeSnapshot['profile']): void;
  setFormat(format: WorkspaceHomeSnapshot['format']): void;
  createMap(): void;
  openProject(): void;
  openMap(): void;
  reopenProject(projectKey: string): void;
  showHome(): void;
}

export class WorkspaceHomePort {
  private readonly store = new SnapshotStore<WorkspaceHomeSnapshot>({
    visible: true,
    newMapOpen: false,
    name: 'untitled.map',
    profile: 'quake',
    format: 'valve-220',
    recents: [],
  });
  private actions: WorkspaceHomeActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: WorkspaceHomeActions): void {
    this.actions = actions;
  }
  public update(update: Partial<WorkspaceHomeSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
  public invoke<K extends keyof WorkspaceHomeActions>(
    action: K,
    ...args: Parameters<WorkspaceHomeActions[K]>
  ): void {
    const handler = this.actions?.[action] as
      | ((...values: Parameters<WorkspaceHomeActions[K]>) => void)
      | undefined;
    handler?.(...args);
  }
}

export interface CollaborationParticipantSnapshot {
  readonly actorId: string;
  readonly displayName: string;
  readonly color: string;
  readonly viewport: string;
  readonly selectedCount: number;
  readonly moving: boolean;
  readonly isLocal: boolean;
}

export interface CollaborationUiSnapshot {
  readonly dialogOpen: boolean;
  readonly state: string;
  readonly description: string;
  readonly displayName: string;
  readonly shareLink: string;
  readonly lifecycle: CollaborationLifecycleSnapshot;
  readonly error: string | null;
  readonly participants: readonly CollaborationParticipantSnapshot[];
}

export interface CollaborationUiActions {
  open(): void;
  close(): void;
  setDisplayName(name: string): void;
  start(): void;
  stop(): void;
  copyLink(): void;
}

export class CollaborationUiPort {
  private readonly store = new SnapshotStore<CollaborationUiSnapshot>({
    dialogOpen: false,
    state: 'Local only',
    description:
      'Live collaboration requires a hosted project and a 4orm account. This local map stays offline.',
    displayName: '',
    shareLink: '',
    lifecycle: { status: 'solo' },
    error: null,
    participants: [],
  });
  private actions: CollaborationUiActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: CollaborationUiActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
  }
  public update(update: Partial<CollaborationUiSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
  public invoke<K extends keyof CollaborationUiActions>(
    action: K,
    ...args: Parameters<CollaborationUiActions[K]>
  ): void {
    const handler = this.actions?.[action] as
      | ((...values: Parameters<CollaborationUiActions[K]>) => void)
      | undefined;
    handler?.(...args);
  }
}

export interface EditorShellState {
  readonly statusMessage: StatusMessagePort;
  readonly documentName: DocumentNamePort;
  readonly compileState: CompileStatePort;
  readonly pointerContext: PointerContextPort;
  readonly viewportLayout: ViewportLayoutPort;
  readonly workspaceLayout: WorkspaceLayoutPort;
  readonly viewportPresentation: ViewportPresentationPort;
  readonly inspectorLayout: InspectorLayoutPort;
  readonly theme: ThemeUiPort;
  readonly viewportContextMenu: ViewportContextMenuPort;
  readonly documentSummary: DocumentSummaryPort;
  readonly surfaceInspector: SurfaceInspectorPort;
  readonly faceInspector: FaceInspectorPort;
  readonly materialBrowser: MaterialBrowserPort;
  readonly resourceSettings: ResourceSettingsPort;
  readonly workspaceHome: WorkspaceHomePort;
  readonly collaborationUi: CollaborationUiPort;
  readonly entityInspector: EntityInspectorPort;
  readonly layerPanel: LayerPanelPort;
  readonly issueBrowser: IssueBrowserPort;
  readonly viewFilter: ViewFilterPort;
  readonly entityLinks: EntityLinksPort;
  readonly referenceScenes: ReferenceScenesPort;
  readonly projectToolbar: ProjectToolbarPort;
  readonly projectUi: ProjectUiPort;
  readonly recoveryVersions: RecoveryVersionsPort;
  readonly buildLog: BuildLogPort;
  readonly pointEntityTool: PointEntityToolPort;
  readonly toolSettings: EditorToolSettingsPort;
  readonly editorCommands: EditorCommandPort;
  readonly selectionInspector: SelectionInspectorPort;
  readonly simpleShapeTool: SimpleShapeToolPort;
  readonly sweepTool: SweepToolPort;
  readonly objectTools: ObjectToolsPort;
}

export function createEditorShellState(): EditorShellState {
  return {
    statusMessage: new StatusMessagePort(),
    documentName: new DocumentNamePort(),
    compileState: new CompileStatePort(),
    pointerContext: new PointerContextPort(),
    viewportLayout: new ViewportLayoutPort(),
    workspaceLayout: new WorkspaceLayoutPort(),
    viewportPresentation: new ViewportPresentationPort(),
    inspectorLayout: new InspectorLayoutPort(),
    theme: new ThemeUiPort(),
    viewportContextMenu: new ViewportContextMenuPort(),
    documentSummary: new DocumentSummaryPort(),
    surfaceInspector: new SurfaceInspectorPort(),
    faceInspector: new FaceInspectorPort(),
    materialBrowser: new MaterialBrowserPort(),
    resourceSettings: new ResourceSettingsPort(),
    workspaceHome: new WorkspaceHomePort(),
    collaborationUi: new CollaborationUiPort(),
    entityInspector: new EntityInspectorPort(),
    layerPanel: new LayerPanelPort(),
    issueBrowser: new IssueBrowserPort(),
    viewFilter: new ViewFilterPort(),
    entityLinks: new EntityLinksPort(),
    referenceScenes: new ReferenceScenesPort(),
    projectToolbar: new ProjectToolbarPort(),
    projectUi: new ProjectUiPort(),
    recoveryVersions: new RecoveryVersionsPort(),
    buildLog: new BuildLogPort(),
    pointEntityTool: new PointEntityToolPort(),
    toolSettings: new EditorToolSettingsPort(),
    editorCommands: new EditorCommandPort(),
    selectionInspector: new SelectionInspectorPort(),
    simpleShapeTool: new SimpleShapeToolPort(),
    sweepTool: new SweepToolPort(),
    objectTools: new ObjectToolsPort(),
  };
}
