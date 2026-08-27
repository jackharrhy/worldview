import {
  brushesInDocument,
  EDITOR_ISSUE_TYPE_INFO,
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
  type EditorSpecialBrushFilter,
  type MapDocument,
} from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';

const DEFAULT_LAYER_TOKEN = '__default__';

export class OrganizationPresenter {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
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
    return {
      ...base,
      lockedBrushIds: [
        ...new Set([
          ...base.lockedBrushIds,
          ...brushesInDocument(document)
            .map((brush) => brush.id)
            .filter((candidateBrushId) => !editableBrushes.has(candidateBrushId)),
        ]),
      ],
      lockedEntityIds: [
        ...new Set([
          ...base.lockedEntityIds,
          ...document.entities
            .filter((entity) => pointEntityBounds(entity) !== null)
            .map((entity) => entity.id)
            .filter((entityId) => !editableEntities.has(entityId)),
        ]),
      ],
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
    this.ui.statusMessage.textContent = `Opened group ${group.name}. Objects outside it are locked.`;
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
    this.ui.statusMessage.textContent = group
      ? `Closed group ${group.name}.`
      : 'Closed the missing group.';
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
    this.ui.entityLinkCount.textContent = `${shown.length} / ${links.length} shown`;
  }

  public layerToken(layerId: EditorLayerId): string {
    return layerId ?? DEFAULT_LAYER_TOKEN;
  }

  public updateLayerActionButtons(
    layers: ReturnType<typeof deriveEditorLayers>,
    selection: EditorSelection | null,
  ): void {
    const selectedIndex = layers.findIndex((layer) => layer.id === this.state.selectedLayerId);
    const selected = layers[selectedIndex] ?? layers[0];
    if (!selected) return;
    const selectedCustomIndex = layers
      .filter((layer) => layer.id !== null)
      .findIndex((layer) => layer.id === selected.id);
    const customCount = layers.filter((layer) => layer.id !== null).length;
    const hasObjectSelection = Boolean(
      selection &&
      !selection.faceId &&
      selectedBrushIds(selection).length + selectedPointEntityIds(selection).length > 0,
    );
    this.ui.moveSelectionToLayerButton.disabled = !hasObjectSelection;
    this.ui.selectLayerButton.disabled =
      selected.hidden ||
      selected.locked ||
      selected.brushIds.length + selected.pointEntityIds.length === 0;
    this.ui.isolateLayerButton.disabled = layers.length < 2;
    this.ui.removeLayerButton.disabled = selected.id === null;
    this.ui.layerUpButton.disabled = selectedCustomIndex <= 0;
    this.ui.layerDownButton.disabled =
      selectedCustomIndex < 0 || selectedCustomIndex >= customCount - 1;
  }

  public selectLayerInPanel(
    layerId: EditorLayerId,
    layers: ReturnType<typeof deriveEditorLayers>,
    selection: EditorSelection | null,
  ): void {
    this.state.selectedLayerId = layerId;
    for (const row of this.ui.layerList.querySelectorAll<HTMLElement>('[data-layer-id]')) {
      const selected = row.dataset.layerId === this.layerToken(layerId);
      row.classList.toggle('selected', selected);
      row.setAttribute('aria-selected', String(selected));
    }
    this.updateLayerActionButtons(layers, selection);
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
    this.ui.activeLayerName.textContent = `${active?.name ?? 'Default Layer'} active`;
    const signature = JSON.stringify({
      active: this.state.session.activeLayerId,
      selected: this.state.selectedLayerId,
      selection: selection
        ? {
            brushes: selectedBrushIds(selection),
            entities: selectedPointEntityIds(selection),
            face: selection.faceId,
          }
        : null,
      layers: layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        sort: layer.sortIndex,
        hidden: layer.hidden,
        locked: layer.locked,
        omit: layer.omitFromExport,
        brushes: layer.brushIds,
        entities: layer.pointEntityIds,
      })),
    });
    if (signature === this.state.layerPanelSignature) {
      this.updateLayerActionButtons(layers, selection);
      return;
    }
    this.state.layerPanelSignature = signature;
    this.ui.layerList.replaceChildren();

    for (const layer of layers) {
      const row = window.document.createElement('div');
      row.className = 'layer-row';
      row.dataset.layerId = this.layerToken(layer.id);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(layer.id === this.state.selectedLayerId));
      row.classList.toggle('selected', layer.id === this.state.selectedLayerId);
      row.classList.toggle('hidden-layer', layer.hidden);
      row.classList.toggle('locked-layer', layer.locked);
      row.classList.toggle('omitted-layer', layer.omitFromExport);
      row.addEventListener('click', () =>
        this.selectLayerInPanel(
          layer.id,
          deriveEditorLayers(this.state.session.document),
          this.state.session.selection,
        ),
      );

      const activeButton = window.document.createElement('button');
      activeButton.type = 'button';
      activeButton.className = 'layer-active';
      activeButton.textContent = layer.id === this.state.session.activeLayerId ? 'A' : '·';
      activeButton.setAttribute(
        'aria-pressed',
        String(layer.id === this.state.session.activeLayerId),
      );
      activeButton.setAttribute('aria-label', `Make ${layer.name} active`);
      activeButton.title =
        layer.id === this.state.session.activeLayerId
          ? 'Active insertion layer'
          : 'Make active layer';
      activeButton.addEventListener('click', () => {
        if (this.state.openGroupId) this.closeEditorGroup(false);
        this.state.selectedLayerId = layer.id;
        this.state.session.setActiveLayer(layer.id);
      });

      const name = window.document.createElement('input');
      name.className = 'layer-row-name';
      name.type = 'text';
      name.value = layer.name;
      name.readOnly = layer.id === null;
      name.setAttribute('aria-label', layer.id === null ? 'Default Layer' : `Rename ${layer.name}`);
      name.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        name.blur();
      });
      name.addEventListener('change', () => {
        if (layer.id === null || name.value.trim() === layer.name) return;
        try {
          this.state.selectedLayerId = layer.id;
          this.state.session.renameLayer(layer.id, name.value);
        } catch (error) {
          name.value = layer.name;
          this.ui.statusMessage.textContent =
            error instanceof Error ? error.message : String(error);
        }
      });

      const count = window.document.createElement('span');
      count.className = 'layer-object-count';
      count.textContent = String(layer.brushIds.length + layer.pointEntityIds.length);
      count.title = `${layer.brushIds.length} brushes · ${layer.pointEntityIds.length} point entities`;

      const flagButton = (
        text: string,
        label: string,
        activeFlag: boolean,
        flag: 'hidden' | 'locked' | 'omit-from-export',
      ) => {
        const button = window.document.createElement('button');
        button.type = 'button';
        button.className = 'layer-flag';
        button.textContent = text;
        button.classList.toggle('active', activeFlag);
        button.setAttribute('aria-pressed', String(activeFlag));
        button.setAttribute('aria-label', label);
        button.title = label;
        button.addEventListener('click', () => {
          this.state.selectedLayerId = layer.id;
          this.state.session.setLayerFlag(layer.id, flag, !activeFlag);
        });
        return button;
      };

      row.append(
        activeButton,
        name,
        count,
        flagButton('V', `${layer.hidden ? 'Show' : 'Hide'} ${layer.name}`, layer.hidden, 'hidden'),
        flagButton(
          'L',
          `${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`,
          layer.locked,
          'locked',
        ),
        flagButton(
          'X',
          `${layer.omitFromExport ? 'Include' : 'Omit'} ${layer.name} in compile export`,
          layer.omitFromExport,
          'omit-from-export',
        ),
      );
      this.ui.layerList.append(row);
    }
    this.updateLayerActionButtons(layers, selection);
  }

  public setIssueBrowserOpen(open: boolean): void {
    this.state.issueBrowserOpen = open;
    this.ui.issueBrowser.hidden = !open;
    this.ui.editorShell.classList.toggle('issues-open', open);
    this.ui.issueStatus.setAttribute('aria-expanded', String(open));
  }

  public setViewFilterPopoverOpen(open: boolean): void {
    this.state.viewFilterPopoverOpen = open;
    this.ui.viewFilterPopover.hidden = !open;
    this.ui.viewFilterToggle.setAttribute('aria-expanded', String(open));
    if (open) this.renderViewFilters();
  }

  public renderViewFilters(): void {
    const state = this.state.session.viewFilters;
    const hiddenClassnames = new Set(state.hiddenEntityClassnames);
    const hiddenSpecialTypes = new Set(state.hiddenSpecialBrushTypes);
    this.ui.showWorldBrushes.checked = state.worldBrushesVisible;
    for (const input of document.querySelectorAll<HTMLInputElement>(
      '[data-special-brush-filter]',
    )) {
      input.checked = !hiddenSpecialTypes.has(
        input.dataset.specialBrushFilter as EditorSpecialBrushFilter,
      );
    }

    const filters = entityClassFiltersInDocument(this.state.session.document);
    const queryTerms = this.ui.entityClassFilterSearch.value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const displayed = filters.filter(({ classname }) =>
      queryTerms.every((term) => classname.includes(term)),
    );
    this.ui.entityClassFilterSummary.textContent = `${filters.length} ${filters.length === 1 ? 'class' : 'classes'}`;
    this.ui.entityClassFilterList.replaceChildren();
    if (displayed.length === 0) {
      const empty = window.document.createElement('p');
      empty.className = 'entity-class-filter-empty';
      empty.textContent =
        filters.length === 0 ? 'No entity definitions in this map.' : 'No matches.';
      this.ui.entityClassFilterList.append(empty);
    }
    for (const filter of displayed) {
      const row = window.document.createElement('label');
      row.className = 'view-filter-row entity-class-filter-row';
      row.dataset.entityClassname = filter.classname;
      const input = window.document.createElement('input');
      input.type = 'checkbox';
      input.checked = !hiddenClassnames.has(filter.classname);
      input.setAttribute('aria-label', `Show ${filter.classname}`);
      input.addEventListener('change', () => {
        this.state.session.setEntityClassVisible(filter.classname, input.checked);
      });
      const copy = window.document.createElement('span');
      const classname = window.document.createElement('b');
      classname.textContent = filter.classname;
      const count = window.document.createElement('small');
      const parts = [];
      if (filter.pointEntityCount > 0) parts.push(`${filter.pointEntityCount} point`);
      if (filter.brushEntityCount > 0) parts.push(`${filter.brushEntityCount} brush`);
      count.textContent = `${parts.join(' · ')} ${filter.pointEntityCount + filter.brushEntityCount === 1 ? 'entity' : 'entities'}`;
      copy.append(classname, count);
      row.append(input, copy);
      this.ui.entityClassFilterList.append(row);
    }

    const filtered = this.state.session.filteredObjectIds;
    const filteredCount = filtered.brushIds.length + filtered.entityIds.length;
    this.ui.viewFilterCount.textContent = String(filteredCount);
    this.ui.viewFilterCount.hidden = filteredCount === 0;
    this.ui.viewFilterToggle.classList.toggle('active-filter', filteredCount > 0);
    this.ui.viewFilterStatus.textContent = `${filteredCount} ${filteredCount === 1 ? 'object' : 'objects'} filtered · map source unchanged`;
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
      this.ui.statusMessage.textContent = `${issue.message} This finding is document-wide.`;
      return;
    }
    const focused = reveal ? this.state.renderer?.focusSelection() : false;
    this.ui.statusMessage.textContent = reveal
      ? focused
        ? `Revealed and focused: ${issue.message}`
        : `Revealed: ${issue.message}`
      : `Selected: ${issue.message}`;
  }

  public renderIssues(): void {
    const issues = this.state.session.issues;
    const errors = issues.filter((issue) => issue.severity === 'error').length;
    const warnings = issues.length - errors;
    const hiddenCount = issues.filter((issue) => this.state.hiddenIssueIds.has(issue.id)).length;
    this.ui.issueSummary.textContent = `${errors} ${errors === 1 ? 'error' : 'errors'} · ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}${hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}`;
    this.ui.issueStatus.textContent = `Issues ${issues.length}`;
    this.ui.issueStatus.dataset.state = errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'clean';

    const visible = issues.filter(
      (issue) =>
        this.state.enabledIssueTypes.has(issue.type) &&
        (this.ui.showHiddenIssues.checked || !this.state.hiddenIssueIds.has(issue.id)),
    );
    this.ui.issueList.replaceChildren();
    if (visible.length === 0) {
      const empty = window.document.createElement('li');
      empty.className = 'issue-list-empty';
      empty.textContent =
        issues.length === 0
          ? 'No issues found. The document is clean.'
          : 'No findings match the current filters.';
      this.ui.issueList.append(empty);
      return;
    }

    for (const issue of visible) {
      const row = window.document.createElement('li');
      row.className = `issue-row ${issue.severity}`;
      row.dataset.issueId = issue.id;
      row.dataset.issueType = issue.type;
      row.classList.toggle('hidden-issue', this.state.hiddenIssueIds.has(issue.id));

      const select = window.document.createElement('button');
      select.type = 'button';
      select.className = 'issue-description';
      select.title = 'Select the implicated objects; use Reveal to show and frame them';
      const severity = window.document.createElement('span');
      severity.className = 'issue-severity';
      severity.textContent = issue.severity === 'error' ? 'ERROR' : 'WARN';
      const copy = window.document.createElement('span');
      copy.className = 'issue-copy';
      const message = window.document.createElement('strong');
      message.textContent = issue.message;
      const meta = window.document.createElement('small');
      const objectCount = issue.brushIds.length + issue.entityIds.length;
      meta.textContent = `${this.issueTypeLabel(issue.type)}${objectCount > 0 ? ` · ${objectCount} ${objectCount === 1 ? 'object' : 'objects'}` : ' · document'}`;
      copy.append(message, meta);
      select.append(severity, copy);
      select.addEventListener('click', () => this.selectEditorIssue(issue, false));
      select.addEventListener('dblclick', () => this.selectEditorIssue(issue, true));

      const actions = window.document.createElement('div');
      actions.className = 'issue-actions';
      const reveal = window.document.createElement('button');
      reveal.type = 'button';
      reveal.textContent = 'Reveal';
      reveal.addEventListener('click', () => this.selectEditorIssue(issue, true));
      actions.append(reveal);

      if (issue.fix) {
        const fix = window.document.createElement('button');
        fix.type = 'button';
        fix.className = 'issue-fix';
        fix.textContent = 'Fix';
        fix.title = issue.fix.label;
        fix.addEventListener('click', () => {
          try {
            if (!this.state.session.fixIssue(issue.id)) {
              this.ui.statusMessage.textContent =
                'That issue changed before its fix could be applied.';
            }
          } catch (error) {
            this.ui.statusMessage.textContent =
              error instanceof Error ? error.message : String(error);
          }
        });
        actions.append(fix);
      }

      const hide = window.document.createElement('button');
      hide.type = 'button';
      const hidden = this.state.hiddenIssueIds.has(issue.id);
      hide.textContent = hidden ? 'Show' : 'Hide';
      hide.addEventListener('click', () => {
        if (hidden) this.state.hiddenIssueIds.delete(issue.id);
        else this.state.hiddenIssueIds.add(issue.id);
        this.renderIssues();
      });
      actions.append(hide);
      row.append(select, actions);
      this.ui.issueList.append(row);
    }
  }
}
