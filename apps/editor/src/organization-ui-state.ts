import { SnapshotStore } from '@jackharrhy/worldview';
import type {
  EditorIssueType,
  EditorLayerId,
  EditorSpecialBrushFilter,
  EntityLinkMode,
} from '@jackharrhy/worldview-editor';

export interface LayerSnapshot {
  readonly id: EditorLayerId;
  readonly token: string;
  readonly name: string;
  readonly selected: boolean;
  readonly active: boolean;
  readonly hidden: boolean;
  readonly locked: boolean;
  readonly omitted: boolean;
  readonly brushCount: number;
  readonly pointEntityCount: number;
}

export interface LayerPanelSnapshot {
  readonly activeName: string;
  readonly layers: readonly LayerSnapshot[];
  readonly canMoveSelection: boolean;
  readonly canSelectContents: boolean;
  readonly canIsolate: boolean;
  readonly canRemove: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}

export interface LayerPanelActions {
  select(id: EditorLayerId): void;
  makeActive(id: EditorLayerId): void;
  rename(id: string, name: string): void;
  setFlag(
    id: EditorLayerId,
    flag: 'hidden' | 'locked' | 'omit-from-export',
    enabled: boolean,
  ): void;
  create(name: string): void;
  moveSelection(): void;
  selectContents(): void;
  isolate(): void;
  remove(): void;
  reorder(direction: -1 | 1): void;
  setAllFlags(flag: 'hidden' | 'locked', enabled: boolean): void;
}

const EMPTY_LAYER_PANEL: LayerPanelSnapshot = {
  activeName: 'Default Layer',
  layers: [],
  canMoveSelection: false,
  canSelectContents: false,
  canIsolate: false,
  canRemove: false,
  canMoveUp: false,
  canMoveDown: false,
};

export class LayerPanelPort {
  private readonly store = new SnapshotStore<LayerPanelSnapshot>(EMPTY_LAYER_PANEL);
  private actions: LayerPanelActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: LayerPanelActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
    this.store.set(EMPTY_LAYER_PANEL);
  }
  public set(snapshot: LayerPanelSnapshot): void {
    this.store.set(snapshot);
  }
  public invoke<K extends keyof LayerPanelActions>(
    action: K,
    ...args: Parameters<LayerPanelActions[K]>
  ): void {
    const handler = this.actions?.[action] as
      | ((...values: Parameters<LayerPanelActions[K]>) => void)
      | undefined;
    handler?.(...args);
  }
}

export interface IssueSnapshot {
  readonly id: string;
  readonly type: EditorIssueType;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly meta: string;
  readonly hidden: boolean;
  readonly fixLabel: string;
}

export interface IssueBrowserSnapshot {
  readonly open: boolean;
  readonly summary: string;
  readonly statusLabel: string;
  readonly status: 'error' | 'warning' | 'clean';
  readonly showHidden: boolean;
  readonly enabledTypes: readonly EditorIssueType[];
  readonly emptyMessage: string;
  readonly issues: readonly IssueSnapshot[];
}

export interface IssueBrowserActions {
  setOpen(open: boolean): void;
  setShowHidden(show: boolean): void;
  setTypeEnabled(type: EditorIssueType, enabled: boolean): void;
  select(id: string, reveal: boolean): void;
  fix(id: string): void;
  toggleHidden(id: string): void;
}

const EMPTY_ISSUE_BROWSER: IssueBrowserSnapshot = {
  open: false,
  summary: '0 errors · 0 warnings',
  statusLabel: 'Issues 0',
  status: 'clean',
  showHidden: false,
  enabledTypes: [],
  emptyMessage: 'No issues found. The document is clean.',
  issues: [],
};

export class IssueBrowserPort {
  private readonly store = new SnapshotStore<IssueBrowserSnapshot>(EMPTY_ISSUE_BROWSER);
  private actions: IssueBrowserActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: IssueBrowserActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
    this.store.set(EMPTY_ISSUE_BROWSER);
  }
  public set(snapshot: IssueBrowserSnapshot): void {
    this.store.set(snapshot);
  }
  public update(update: Partial<IssueBrowserSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
  public invoke<K extends keyof IssueBrowserActions>(
    action: K,
    ...args: Parameters<IssueBrowserActions[K]>
  ): void {
    const handler = this.actions?.[action] as
      | ((...values: Parameters<IssueBrowserActions[K]>) => void)
      | undefined;
    handler?.(...args);
  }
}

export interface EntityClassFilterSnapshot {
  readonly classname: string;
  readonly visible: boolean;
  readonly pointEntityCount: number;
  readonly brushEntityCount: number;
}

export interface ViewFilterSnapshot {
  readonly open: boolean;
  readonly worldBrushesVisible: boolean;
  readonly visibleSpecialBrushTypes: readonly EditorSpecialBrushFilter[];
  readonly entityClasses: readonly EntityClassFilterSnapshot[];
  readonly filteredCount: number;
  readonly status: string;
}

export interface ViewFilterActions {
  setOpen(open: boolean): void;
  setWorldBrushesVisible(visible: boolean): void;
  setSpecialBrushTypeVisible(type: EditorSpecialBrushFilter, visible: boolean): void;
  setEntityClassVisible(classname: string, visible: boolean): void;
  setAllEntityClassesVisible(visible: boolean): void;
}

const EMPTY_VIEW_FILTER: ViewFilterSnapshot = {
  open: false,
  worldBrushesVisible: true,
  visibleSpecialBrushTypes: [],
  entityClasses: [],
  filteredCount: 0,
  status: '0 objects filtered · map source unchanged',
};

export class ViewFilterPort {
  private readonly store = new SnapshotStore<ViewFilterSnapshot>(EMPTY_VIEW_FILTER);
  private actions: ViewFilterActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: ViewFilterActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
    this.store.set(EMPTY_VIEW_FILTER);
  }
  public set(snapshot: ViewFilterSnapshot): void {
    this.store.set(snapshot);
  }
  public update(update: Partial<ViewFilterSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
  public invoke<K extends keyof ViewFilterActions>(
    action: K,
    ...args: Parameters<ViewFilterActions[K]>
  ): void {
    const handler = this.actions?.[action] as
      | ((...values: Parameters<ViewFilterActions[K]>) => void)
      | undefined;
    handler?.(...args);
  }
}

export interface EntityLinksSnapshot {
  readonly mode: EntityLinkMode;
  readonly shownCount: number;
  readonly totalCount: number;
}

export interface EntityLinksActions {
  setMode(mode: EntityLinkMode): void;
}

export class EntityLinksPort {
  private readonly store = new SnapshotStore<EntityLinksSnapshot>({
    mode: 'direct',
    shownCount: 0,
    totalCount: 0,
  });
  private actions: EntityLinksActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: EntityLinksActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
  }
  public set(snapshot: EntityLinksSnapshot): void {
    this.store.set(snapshot);
  }
  public setMode(mode: EntityLinkMode): void {
    this.actions?.setMode(mode);
  }
}
