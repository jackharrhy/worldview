import {
  brushesInDocument,
  createSequentialIdFactory,
  EDITOR_ISSUE_TYPE_INFO,
  EDITOR_SPECIAL_BRUSH_FILTER_INFO,
  deriveEditorGroups,
  deriveEditorLayers,
  deriveEntityLinks,
  entityClassFiltersInDocument,
  pointEntityBounds,
  selectedBrushIds,
  selectedEntityIdsForLinks,
  selectedPointEntityIds,
  selectionForEditorGroup,
  visibleEntityLinks,
  type EditorIssue,
  type EditorIssueType,
  type EditorLayerId,
  type EditorObjectViewState,
  type EditorSelection,
  type MapDocument,
} from '@jackharrhy/worldview-editor';

import type { EditorShellState } from './editor-shell-state.js';
import type { EditorStatePort } from './editor-state-port.js';

type OrganizationUi = Pick<
  EditorShellState,
  'entityLinks' | 'issueBrowser' | 'layerPanel' | 'statusMessage' | 'viewFilter'
>;

type OrganizationState = EditorStatePort<
  | 'enabledIssueTypes'
  | 'entityLinkMode'
  | 'hiddenIssueIds'
  | 'issueBrowserOpen'
  | 'openGroupId'
  | 'renderer'
  | 'selectedLayerId'
  | 'session'
  | 'viewFilterPopoverOpen',
  | 'entityLinkMode'
  | 'issueBrowserOpen'
  | 'openGroupId'
  | 'selectedLayerId'
  | 'viewFilterPopoverOpen'
>;

const DEFAULT_LAYER_TOKEN = '__default__';

export class OrganizationPresenter {
  public constructor(
    private readonly state: OrganizationState,
    private readonly ui: OrganizationUi,
  ) {
    this.ui.layerPanel.bind({
      select: (id) => this.selectLayerInPanel(id),
      makeActive: (id) => this.makeLayerActive(id),
      rename: (id, name) => this.renameLayer(id, name),
      setFlag: (id, flag, enabled) => this.state.session.setLayerFlag(id, flag, enabled),
      create: (name) => this.createLayer(name),
      moveSelection: () => this.moveSelectionToLayer(),
      selectContents: () => this.selectLayerContents(),
      isolate: () => this.isolateLayer(),
      remove: () => this.removeLayer(),
      reorder: (direction) => this.reorderLayer(direction),
      setAllFlags: (flag, enabled) => this.setAllLayersFlag(flag, enabled),
    });
    this.ui.issueBrowser.bind({
      setOpen: (open) => this.setIssueBrowserOpen(open),
      setShowHidden: (show) => {
        this.ui.issueBrowser.update({ showHidden: show });
        this.renderIssues();
      },
      setTypeEnabled: (type, enabled) => {
        if (enabled) this.state.enabledIssueTypes.add(type);
        else this.state.enabledIssueTypes.delete(type);
        this.renderIssues();
      },
      select: (id, reveal) => {
        const issue = this.state.session.issues.find((candidate) => candidate.id === id);
        if (issue) this.selectEditorIssue(issue, reveal);
      },
      fix: (id) => this.fixIssue(id),
      toggleHidden: (id) => {
        if (this.state.hiddenIssueIds.has(id)) this.state.hiddenIssueIds.delete(id);
        else this.state.hiddenIssueIds.add(id);
        this.renderIssues();
      },
    });
    this.ui.viewFilter.bind({
      setOpen: (open) => this.setViewFilterPopoverOpen(open),
      setWorldBrushesVisible: (visible) => this.state.session.setWorldBrushesVisible(visible),
      setSpecialBrushTypeVisible: (type, visible) =>
        this.state.session.setSpecialBrushFilterVisible(type, visible),
      setEntityClassVisible: (classname, visible) =>
        this.state.session.setEntityClassVisible(classname, visible),
      setAllEntityClassesVisible: (visible) =>
        this.state.session.setAllEntityClassesVisible(visible),
    });
    this.ui.entityLinks.bind({ setMode: (mode) => this.setEntityLinkMode(mode) });
  }

  public dispose(): void {
    this.ui.layerPanel.unbind();
    this.ui.issueBrowser.unbind();
    this.ui.viewFilter.unbind();
    this.ui.entityLinks.unbind();
  }

  public selectedLayerForPanel() {
    return (
      deriveEditorLayers(this.state.session.document).find(
        (layer) => layer.id === this.state.selectedLayerId,
      ) ?? null
    );
  }

  public effectiveObjectViewState(
    document: MapDocument = this.state.session.document,
  ): EditorObjectViewState {
    const base = this.state.session.objectViewStateFor(document);
    if (!this.state.openGroupId) return base;
    const group = deriveEditorGroups(document).find(
      (candidate) => candidate.id === this.state.openGroupId,
    );
    if (!group) {
      this.state.openGroupId = null;
      this.state.session.setEditingGroup(null);
      this.state.renderer?.setOpenGroupId(null);
      return base;
    }
    const editableBrushes = new Set(group.brushIds);
    const editableEntities = new Set(group.pointEntityIds);
    const lockedBrushIds = new Set(base.lockedBrushIds);
    for (const brush of brushesInDocument(document)) {
      if (!editableBrushes.has(brush.id)) lockedBrushIds.add(brush.id);
    }
    const lockedEntityIds = new Set(base.lockedEntityIds);
    for (const entity of document.entities) {
      if (pointEntityBounds(entity) !== null && !editableEntities.has(entity.id)) {
        lockedEntityIds.add(entity.id);
      }
    }
    return {
      ...base,
      lockedBrushIds: [...lockedBrushIds],
      lockedEntityIds: [...lockedEntityIds],
    };
  }

  public openEditorGroup(groupId: string, selection: EditorSelection | null = null): boolean {
    const group = deriveEditorGroups(this.state.session.document).find(
      (candidate) => candidate.id === groupId,
    );
    if (!group) return false;
    this.state.openGroupId = groupId;
    this.state.session.setEditingGroup(groupId);
    this.state.renderer?.setOpenGroupId(groupId);
    this.state.session.select(selection);
    this.state.renderer?.setDocument(
      this.state.session.document,
      this.state.session.selection,
      this.effectiveObjectViewState(),
    );
    this.ui.statusMessage.set(`Opened group ${group.name}. Objects outside it are locked.`);
    return true;
  }

  public closeEditorGroup(selectGroup = true): boolean {
    if (!this.state.openGroupId) return false;
    const group = deriveEditorGroups(this.state.session.document).find(
      (candidate) => candidate.id === this.state.openGroupId,
    );
    this.state.openGroupId = null;
    this.state.session.setEditingGroup(null);
    this.state.renderer?.setOpenGroupId(null);
    this.state.session.select(group && selectGroup ? selectionForEditorGroup(group) : null);
    this.state.renderer?.setDocument(
      this.state.session.document,
      this.state.session.selection,
      this.effectiveObjectViewState(),
    );
    this.ui.statusMessage.set(group ? `Closed group ${group.name}.` : 'Closed the missing group.');
    return true;
  }

  public updateEntityLinkSummary(
    document: MapDocument = this.state.session.document,
    selection = this.state.session.selection,
  ): void {
    const links = deriveEntityLinks(document);
    const shown = visibleEntityLinks(
      links,
      selectedEntityIdsForLinks(document, selection),
      this.state.entityLinkMode,
    );
    this.ui.entityLinks.set({
      mode: this.state.entityLinkMode,
      shownCount: shown.length,
      totalCount: links.length,
    });
  }

  private setEntityLinkMode(mode: typeof this.state.entityLinkMode): void {
    this.state.entityLinkMode = mode;
    this.state.renderer?.setEntityLinkMode(mode);
    this.updateEntityLinkSummary();
    const label =
      mode === 'all'
        ? 'All'
        : mode === 'transitive'
          ? 'Transitive selected'
          : mode === 'direct'
            ? 'Direct selected'
            : 'None';
    this.ui.statusMessage.set(`Entity links: ${label}.`);
  }

  public layerToken(layerId: EditorLayerId): string {
    return layerId ?? DEFAULT_LAYER_TOKEN;
  }

  private layerActionState(
    layers: ReturnType<typeof deriveEditorLayers>,
    selection: EditorSelection | null,
  ) {
    const selectedIndex = layers.findIndex((layer) => layer.id === this.state.selectedLayerId);
    const selected = layers[selectedIndex] ?? layers[0];
    if (!selected)
      return {
        canMoveSelection: false,
        canSelectContents: false,
        canIsolate: false,
        canRemove: false,
        canMoveUp: false,
        canMoveDown: false,
      };
    const selectedCustomIndex = layers
      .filter((layer) => layer.id !== null)
      .findIndex((layer) => layer.id === selected.id);
    const customCount = layers.filter((layer) => layer.id !== null).length;
    const hasObjectSelection = Boolean(
      selection &&
      !selection.faceId &&
      selectedBrushIds(selection).length + selectedPointEntityIds(selection).length > 0,
    );
    return {
      canMoveSelection: hasObjectSelection,
      canSelectContents:
        !selected.hidden &&
        !selected.locked &&
        selected.brushIds.length + selected.pointEntityIds.length > 0,
      canIsolate: layers.length >= 2,
      canRemove: selected.id !== null,
      canMoveUp: selectedCustomIndex > 0,
      canMoveDown: selectedCustomIndex >= 0 && selectedCustomIndex < customCount - 1,
    };
  }

  public selectLayerInPanel(layerId: EditorLayerId): void {
    this.state.selectedLayerId = layerId;
    this.renderLayers();
  }

  private makeLayerActive(layerId: EditorLayerId): void {
    if (this.state.openGroupId) this.closeEditorGroup(false);
    this.state.selectedLayerId = layerId;
    this.state.session.setActiveLayer(layerId);
  }

  private renameLayer(layerId: string, name: string): void {
    try {
      this.state.selectedLayerId = layerId;
      this.state.session.renameLayer(layerId, name);
    } catch (error) {
      this.ui.statusMessage.setError(error instanceof Error ? error.message : String(error));
      this.renderLayers();
    }
  }

  private createLayer(name: string): void {
    try {
      const layerId = this.state.session.createLayer(
        name.trim(),
        createSequentialIdFactory(`layer-${this.state.session.document.revision + 1}`),
      );
      this.state.selectedLayerId = layerId;
      this.ui.statusMessage.set(`Created and activated ${name.trim()}.`);
    } catch (error) {
      this.ui.statusMessage.setError(error instanceof Error ? error.message : String(error));
    }
  }

  private moveSelectionToLayer(): void {
    try {
      const layer = this.selectedLayerForPanel();
      if (!layer || !this.state.session.moveSelectedToLayer(layer.id)) {
        this.ui.statusMessage.set('Select top-level objects in a different layer first.');
        return;
      }
      this.ui.statusMessage.set(`Moved the selection to ${layer.name}.`);
    } catch (error) {
      this.ui.statusMessage.setError(error instanceof Error ? error.message : String(error));
    }
  }

  private selectLayerContents(): void {
    const layer = this.selectedLayerForPanel();
    if (!layer) return;
    if (!this.state.session.selectAllInLayer(layer.id)) {
      this.ui.statusMessage.set(`${layer.name} has no selectable contents.`);
      return;
    }
    this.ui.statusMessage.set(`Selected all contents of ${layer.name}.`);
  }

  private isolateLayer(): void {
    const layer = this.selectedLayerForPanel();
    if (!layer || !this.state.session.isolateLayer(layer.id)) {
      this.ui.statusMessage.set(layer ? `${layer.name} is already isolated.` : 'Select a layer.');
      return;
    }
    this.ui.statusMessage.set(`Isolated ${layer.name}.`);
  }

  private removeLayer(): void {
    const layer = this.selectedLayerForPanel();
    if (!layer?.id || !this.state.session.removeLayer(layer.id)) return;
    this.state.selectedLayerId = null;
    this.ui.statusMessage.set(
      `Removed ${layer.name}; its contents moved to Default Layer. Undo restores it.`,
    );
  }

  private reorderLayer(direction: -1 | 1): void {
    const layer = this.selectedLayerForPanel();
    if (layer?.id) this.state.session.reorderLayer(layer.id, direction);
  }

  private setAllLayersFlag(flag: 'hidden' | 'locked', enabled: boolean): void {
    if (this.state.session.setAllLayersFlag(flag, enabled)) return;
    this.ui.statusMessage.set(
      flag === 'hidden' && !enabled
        ? 'All layers are already shown.'
        : flag === 'locked' && !enabled
          ? 'All layers are already unlocked.'
          : 'All layers are already up to date.',
    );
  }

  public renderLayers(
    document: MapDocument = this.state.session.document,
    selection: EditorSelection | null = this.state.session.selection,
  ): void {
    const layers = deriveEditorLayers(document);
    if (!layers.some((layer) => layer.id === this.state.selectedLayerId))
      this.state.selectedLayerId = null;
    const active =
      layers.find((layer) => layer.id === this.state.session.activeLayerId) ?? layers[0];
    const activeLayerId = this.state.session.activeLayerId;
    this.ui.layerPanel.set({
      activeName: active?.name ?? 'Default Layer',
      layers: layers.map((layer) => ({
        id: layer.id,
        token: this.layerToken(layer.id),
        name: layer.name,
        selected: layer.id === this.state.selectedLayerId,
        active: layer.id === activeLayerId,
        hidden: layer.hidden,
        locked: layer.locked,
        omitted: layer.omitFromExport,
        brushCount: layer.brushIds.length,
        pointEntityCount: layer.pointEntityIds.length,
      })),
      ...this.layerActionState(layers, selection),
    });
  }

  public setIssueBrowserOpen(open: boolean): void {
    this.state.issueBrowserOpen = open;
    this.ui.issueBrowser.update({ open });
  }

  public setViewFilterPopoverOpen(open: boolean): void {
    this.state.viewFilterPopoverOpen = open;
    this.ui.viewFilter.update({ open });
    if (open) this.renderViewFilters();
  }

  public renderViewFilters(): void {
    const state = this.state.session.viewFilters;
    const hiddenClassnames = new Set(state.hiddenEntityClassnames);
    const hiddenSpecialTypes = new Set(state.hiddenSpecialBrushTypes);
    const filters = entityClassFiltersInDocument(this.state.session.document);
    const filtered = this.state.session.filteredObjectIds;
    const filteredCount = filtered.brushIds.length + filtered.entityIds.length;
    this.ui.viewFilter.set({
      open: this.state.viewFilterPopoverOpen,
      worldBrushesVisible: state.worldBrushesVisible,
      visibleSpecialBrushTypes: EDITOR_SPECIAL_BRUSH_FILTER_INFO.flatMap(({ type }) =>
        hiddenSpecialTypes.has(type) ? [] : [type],
      ),
      entityClasses: filters.map((filter) =>
        Object.assign({}, filter, { visible: !hiddenClassnames.has(filter.classname) }),
      ),
      filteredCount,
      status: `${filteredCount} ${filteredCount === 1 ? 'object' : 'objects'} filtered · map source unchanged`,
    });
  }

  public issueTypeLabel(type: EditorIssueType): string {
    return EDITOR_ISSUE_TYPE_INFO.find((entry) => entry.type === type)?.label ?? type;
  }

  public selectEditorIssue(issue: EditorIssue, reveal: boolean): void {
    if (reveal) {
      this.state.session.showAll();
      const brushIds = new Set(issue.brushIds);
      const entityIds = new Set(issue.entityIds);
      for (const layer of deriveEditorLayers(this.state.session.document)) {
        const containsIssue =
          (layer.entityId ? entityIds.has(layer.entityId) : false) ||
          layer.brushIds.some((candidateBrushId) => brushIds.has(candidateBrushId)) ||
          layer.pointEntityIds.some((entityId) => entityIds.has(entityId));
        if (containsIssue && layer.hidden)
          this.state.session.setLayerFlag(layer.id, 'hidden', false);
      }
    }
    const selection = this.state.session.selectIssue(issue.id);
    if (!selection) {
      this.ui.statusMessage.set(`${issue.message} This finding is document-wide.`);
      return;
    }
    const focused = reveal ? this.state.renderer?.focusSelection() : false;
    this.ui.statusMessage.set(
      reveal
        ? focused
          ? `Revealed and focused: ${issue.message}`
          : `Revealed: ${issue.message}`
        : `Selected: ${issue.message}`,
    );
  }

  public renderIssues(): void {
    const issues = this.state.session.issues;
    const errors = issues.filter((issue) => issue.severity === 'error').length;
    const warnings = issues.length - errors;
    const hiddenCount = issues.filter((issue) => this.state.hiddenIssueIds.has(issue.id)).length;
    const showHidden = this.ui.issueBrowser.getSnapshot().showHidden;
    const visible = issues.filter(
      (issue) =>
        this.state.enabledIssueTypes.has(issue.type) &&
        (showHidden || !this.state.hiddenIssueIds.has(issue.id)),
    );
    this.ui.issueBrowser.set({
      open: this.state.issueBrowserOpen,
      summary: `${errors} ${errors === 1 ? 'error' : 'errors'} · ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}${hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}`,
      statusLabel: `Issues ${issues.length}`,
      status: errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'clean',
      showHidden,
      enabledTypes: [...this.state.enabledIssueTypes],
      emptyMessage:
        issues.length === 0
          ? 'No issues found. The document is clean.'
          : 'No findings match the current filters.',
      issues: visible.map((issue) => {
        const objectCount = issue.brushIds.length + issue.entityIds.length;
        return {
          id: issue.id,
          type: issue.type,
          severity: issue.severity,
          message: issue.message,
          meta: `${this.issueTypeLabel(issue.type)}${objectCount > 0 ? ` · ${objectCount} ${objectCount === 1 ? 'object' : 'objects'}` : ' · document'}`,
          hidden: this.state.hiddenIssueIds.has(issue.id),
          fixLabel: issue.fix?.label ?? '',
        };
      }),
    });
  }

  private fixIssue(issueId: string): void {
    try {
      if (!this.state.session.fixIssue(issueId)) {
        this.ui.statusMessage.set('That issue changed before its fix could be applied.');
      }
    } catch (error) {
      this.ui.statusMessage.setError(error instanceof Error ? error.message : String(error));
    }
  }
}
