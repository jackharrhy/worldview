import { EditorUiPort } from './editor-ui-port.js';
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

export class LayerPanelPort extends EditorUiPort<LayerPanelSnapshot, LayerPanelActions> {
  public constructor() {
    super(EMPTY_LAYER_PANEL);
  }
  public override unbind(): void {
    super.unbind();
    this.store.set(EMPTY_LAYER_PANEL);
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

export class IssueBrowserPort extends EditorUiPort<IssueBrowserSnapshot, IssueBrowserActions> {
  public constructor() {
    super(EMPTY_ISSUE_BROWSER);
  }
  public override unbind(): void {
    super.unbind();
    this.store.set(EMPTY_ISSUE_BROWSER);
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

export class ViewFilterPort extends EditorUiPort<ViewFilterSnapshot, ViewFilterActions> {
  public constructor() {
    super(EMPTY_VIEW_FILTER);
  }
  public override unbind(): void {
    super.unbind();
    this.store.set(EMPTY_VIEW_FILTER);
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

export class EntityLinksPort extends EditorUiPort<EntityLinksSnapshot, EntityLinksActions> {
  public constructor() {
    super({
      mode: 'direct',
      shownCount: 0,
      totalCount: 0,
    });
  }
  public setMode(mode: EntityLinkMode): void {
    this.actions?.setMode(mode);
  }
}
