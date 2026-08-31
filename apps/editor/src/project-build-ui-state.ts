import { SnapshotStore } from '@jackharrhy/worldview';

export interface ProjectToolbarOption {
  readonly id: string;
  readonly label: string;
}

export const PROJECT_ACTION_IDS = [
  'new',
  'show-source',
  'open-project',
  'open-file',
  'download',
  'checkpoint',
  'versions',
  'export-normalized',
  'load-reference',
  'snapshot-reference',
] as const;

export type ProjectActionId = (typeof PROJECT_ACTION_IDS)[number];

export function isProjectActionId(value: string): value is ProjectActionId {
  return (PROJECT_ACTION_IDS as readonly string[]).includes(value);
}

export interface ProjectUiSnapshot {
  readonly source: {
    readonly open: boolean;
    readonly value: string;
    readonly message: string;
    readonly tone: 'normal' | 'error';
  };
  readonly checkpoint: {
    readonly open: boolean;
    readonly label: string;
  };
  readonly recoveryOpen: boolean;
}

export interface ProjectUiActions {
  invoke(action: ProjectActionId): void;
  applySource(source: string): void;
  createCheckpoint(label: string): void;
}

export class ProjectUiPort {
  private readonly store = new SnapshotStore<ProjectUiSnapshot>({
    source: {
      open: false,
      value: '',
      message: 'Normalized source is ready.',
      tone: 'normal',
    },
    checkpoint: { open: false, label: '' },
    recoveryOpen: false,
  });
  private actions: ProjectUiActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: ProjectUiActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
  }
  public update(update: Partial<ProjectUiSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
  public updateSource(update: Partial<ProjectUiSnapshot['source']>): void {
    const snapshot = this.store.getSnapshot();
    this.store.set({ ...snapshot, source: { ...snapshot.source, ...update } });
  }
  public updateCheckpoint(update: Partial<ProjectUiSnapshot['checkpoint']>): void {
    const snapshot = this.store.getSnapshot();
    this.store.set({ ...snapshot, checkpoint: { ...snapshot.checkpoint, ...update } });
  }
  public invoke(action: ProjectActionId): void {
    this.actions?.invoke(action);
  }
  public applySource(source: string): void {
    this.actions?.applySource(source);
  }
  public createCheckpoint(label: string): void {
    this.actions?.createCheckpoint(label);
  }
}

export interface ProjectToolbarSnapshot {
  readonly maps: readonly ProjectToolbarOption[];
  readonly selectedMapId: string | null;
  readonly buildProfiles: readonly ProjectToolbarOption[];
  readonly selectedBuildProfileId: string | null;
}

export interface ProjectToolbarActions {
  openMap(id: string): void;
  selectBuildProfile(id: string): void;
}

const EMPTY_PROJECT_TOOLBAR: ProjectToolbarSnapshot = {
  maps: [],
  selectedMapId: null,
  buildProfiles: [],
  selectedBuildProfileId: null,
};

export class ProjectToolbarPort {
  private readonly store = new SnapshotStore<ProjectToolbarSnapshot>(EMPTY_PROJECT_TOOLBAR);
  private actions: ProjectToolbarActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: ProjectToolbarActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
    this.store.set(EMPTY_PROJECT_TOOLBAR);
  }
  public set(snapshot: ProjectToolbarSnapshot): void {
    this.store.set(snapshot);
  }
  public update(update: Partial<ProjectToolbarSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
  public openMap(id: string): void {
    this.actions?.openMap(id);
  }
  public selectBuildProfile(id: string): void {
    this.actions?.selectBuildProfile(id);
  }
}

export interface RecoveryVersionSnapshot {
  readonly id: string;
  readonly label: string;
  readonly revision: number;
  readonly updatedAtLabel: string;
  readonly protected: boolean;
}

export interface RecoveryVersionsActions {
  restore(id: string): void;
  setProtected(id: string, protectedValue: boolean): void;
}

export class RecoveryVersionsPort {
  private readonly store = new SnapshotStore<readonly RecoveryVersionSnapshot[]>([]);
  private actions: RecoveryVersionsActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: RecoveryVersionsActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
    this.store.set([]);
  }
  public set(versions: readonly RecoveryVersionSnapshot[]): void {
    this.store.set(versions);
  }
  public restore(id: string): void {
    this.actions?.restore(id);
  }
  public setProtected(id: string, protectedValue: boolean): void {
    this.actions?.setProtected(id, protectedValue);
  }
}

export interface BuildHistorySnapshot {
  readonly id: string;
  readonly label: string;
}

export interface BuildLogSnapshot {
  readonly open: boolean;
  readonly output: string;
  readonly history: readonly BuildHistorySnapshot[];
  readonly selectedBuildId: string | null;
}

export interface BuildLogActions {
  inspect(buildId: string): void;
}

export class BuildLogPort {
  private readonly store = new SnapshotStore<BuildLogSnapshot>({
    open: false,
    output: '',
    history: [],
    selectedBuildId: null,
  });
  private actions: BuildLogActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: BuildLogActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
  }
  public set(snapshot: BuildLogSnapshot): void {
    this.store.set(snapshot);
  }
  public update(update: Partial<BuildLogSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
  public inspect(buildId: string): void {
    this.actions?.inspect(buildId);
  }
  public setOpen(open: boolean): void {
    this.update({ open });
  }
}
