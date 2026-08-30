import { SnapshotStore } from '@jackharrhy/worldview';
import type {
  SurfaceFlagDefinition,
  WorldviewGameProfile,
} from '@jackharrhy/worldview-editor/core';

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

  public get textContent(): string {
    return this.store.getSnapshot().message;
  }

  public set textContent(message: string | null) {
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

  public get textContent(): string {
    return this.store.getSnapshot();
  }

  public set textContent(message: string | null) {
    this.store.set(message ?? '');
  }
}

export interface ViewportLayoutSnapshot {
  readonly perspectiveOnly: boolean;
  readonly rendererReady: boolean;
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

  public setPerspectiveOnly(enabled: boolean): void {
    this.store.set({ ...this.store.getSnapshot(), perspectiveOnly: enabled });
  }

  public togglePerspectiveOnly(): void {
    const snapshot = this.store.getSnapshot();
    if (!snapshot.rendererReady) return;
    this.actions?.setPerspectiveOnly(!snapshot.perspectiveOnly);
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
  readonly live: boolean;
  readonly joining: boolean;
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
    live: false,
    joining: false,
    error: null,
    participants: [],
  });
  private actions: CollaborationUiActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: CollaborationUiActions): void {
    this.actions = actions;
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
  readonly viewportContextMenu: ViewportContextMenuPort;
  readonly documentSummary: DocumentSummaryPort;
  readonly surfaceInspector: SurfaceInspectorPort;
  readonly workspaceHome: WorkspaceHomePort;
  readonly collaborationUi: CollaborationUiPort;
}

export function createEditorShellState(): EditorShellState {
  return {
    statusMessage: new StatusMessagePort(),
    documentName: new DocumentNamePort(),
    compileState: new CompileStatePort(),
    pointerContext: new PointerContextPort(),
    viewportLayout: new ViewportLayoutPort(),
    viewportContextMenu: new ViewportContextMenuPort(),
    documentSummary: new DocumentSummaryPort(),
    surfaceInspector: new SurfaceInspectorPort(),
    workspaceHome: new WorkspaceHomePort(),
    collaborationUi: new CollaborationUiPort(),
  };
}
