import { type TransformAxis } from './document.js';
import { deriveEditorGroups } from './groups.js';
import { linkedGroupSiblings, synchronizeLinkedGroupContents } from './linked-groups.js';
import { deriveEditorIssues, type EditorIssue } from './issues.js';
import { EditorHistory } from './history.js';
import {
  createEditorLayer,
  deriveEditorLayers,
  editorLayerForSelection,
  findEditorLayer,
  moveSelectionToEditorLayer,
  removeEditorLayer,
  renameEditorLayer,
  reorderEditorLayer,
  selectionForEditorLayer,
  setEditorLayerFlag,
  type EditorLayerFlag,
  type EditorLayerId,
} from './layers.js';
import {
  DEFAULT_EDITOR_VIEW_FILTER_STATE,
  deriveEditorViewFilterObjectIds,
  EDITOR_SPECIAL_BRUSH_FILTER_INFO,
  entityClassFiltersInDocument,
  type EditorSpecialBrushFilter,
  type EditorViewFilterObjectIds,
  type EditorViewFilterState,
} from './view-filters.js';
import { selectedBrushIds, selectedPointEntityIds } from './selection.js';
import type {
  BrushId,
  EditorObjectViewState,
  EditorSelection,
  EntityId,
  IdFactory,
  MapBrush,
  MapDocument,
  MapEntity,
  Vec3,
} from './types.js';
import { createSequentialIdFactory } from './types.js';
import {
  repeatableCommandLabel,
  type BrushEditCandidate,
  type BrushBatchEditCandidate,
  type BrushCreationCandidate,
  type BrushBatchCreationCandidate,
  type DocumentEditCandidate,
  type EditorSessionChange,
  type EditorRepeatableCommand,
  type ChangeListener,
} from './session-common.js';
export abstract class EditorSessionState {
  public abstract select(selection: EditorSelection | null): void;
  public abstract duplicateSelected(
    ids: IdFactory,
    delta: Vec3,
    textureLock: boolean,
    targetGroupId: string | null,
  ): boolean;
  public abstract translateSelected(delta: Vec3, textureLock?: boolean): boolean;
  public abstract createObjectRotationCandidate(
    selection: EditorSelection,
    pivot: Vec3,
    axis: TransformAxis,
    degrees: number,
    textureLock: boolean,
    updateEntityAngles: boolean,
  ): DocumentEditCandidate | null;
  public abstract createObjectFlipCandidate(
    selection: EditorSelection,
    pivot: Vec3,
    axis: TransformAxis,
    textureLock: boolean,
    updateEntityAngles: boolean,
  ): DocumentEditCandidate | null;
  public abstract createObjectScaleCandidate(
    selection: EditorSelection,
    pivot: Vec3,
    factors: Vec3,
    textureLock: boolean,
    updateEntityAngles: boolean,
  ): DocumentEditCandidate | null;
  public abstract createObjectShearCandidate(
    selection: EditorSelection,
    pivot: Vec3,
    sourceAxis: TransformAxis,
    targetAxis: TransformAxis,
    factor: number,
    textureLock: boolean,
    updateEntityAngles: boolean,
  ): DocumentEditCandidate | null;
  public abstract commitDocumentCandidate(candidate: DocumentEditCandidate): void;
  public abstract commitCandidate(candidate: BrushEditCandidate | BrushBatchEditCandidate): void;
  public abstract createBrushCandidate(
    brush: MapBrush,
    entityId?: EntityId,
  ): BrushCreationCandidate;
  public abstract commitCreationCandidate(candidate: BrushCreationCandidate): void;
  public abstract commitBatchCreationCandidate(candidate: BrushBatchCreationCandidate): void;
  public abstract createMaterialCandidate(
    material: string,
    selection?: EditorSelection | null,
  ): BrushEditCandidate | BrushBatchEditCandidate | null;
  protected abstract snapshotObjectViewState(): EditorObjectViewState;
  protected abstract applyObjectViewState(state: EditorObjectViewState): void;
  protected abstract commitObjectViewState(
    label: string,
    state: EditorObjectViewState,
    selectionAfter: EditorSelection | null,
  ): boolean;
  protected abstract assertSelectionAvailable(selection: EditorSelection): void;
  protected abstract notify(kind: EditorSessionChange['kind'], label: string): void;

  protected readonly listeners = new Set<ChangeListener>();
  protected readonly history = new EditorHistory();
  protected currentDocument: MapDocument;
  protected currentSelection: EditorSelection | null = null;
  protected hiddenBrushIds = new Set<BrushId>();
  protected hiddenEntityIds = new Set<EntityId>();
  protected lockedBrushIds = new Set<BrushId>();
  protected lockedEntityIds = new Set<EntityId>();
  protected editingGroupId: string | null = null;
  protected currentLayerId: EditorLayerId = null;
  protected readonly linkedSyncIds = createSequentialIdFactory('worldview-linked-sync');
  protected readonly issueFixIds = createSequentialIdFactory('worldview-issue-fix');
  protected currentViewFilters: EditorViewFilterState = DEFAULT_EDITOR_VIEW_FILTER_STATE;
  protected repeatableCommands: EditorRepeatableCommand[] = [];
  protected repeatSequence = 0;
  protected suppressRepeatRecording = false;

  public constructor(document: MapDocument) {
    this.currentDocument = document;
  }

  public get document(): MapDocument {
    return this.currentDocument;
  }

  public get selection(): EditorSelection | null {
    return this.currentSelection;
  }

  /** Live, deterministic diagnostics for the current document revision. */
  public get issues(): readonly EditorIssue[] {
    return deriveEditorIssues(this.currentDocument);
  }

  public get objectViewState(): EditorObjectViewState {
    return this.objectViewStateFor(this.currentDocument);
  }

  /** Resolves visibility, layer, and view-filter state for a committed or preview document. */
  public objectViewStateFor(document: MapDocument): EditorObjectViewState {
    const base = this.snapshotObjectViewState();
    const layers = deriveEditorLayers(document);
    const filtered = deriveEditorViewFilterObjectIds(document, this.currentViewFilters);
    return {
      hiddenBrushIds: [
        ...new Set([
          ...base.hiddenBrushIds,
          ...filtered.brushIds,
          ...layers.filter((layer) => layer.hidden).flatMap((layer) => layer.brushIds),
        ]),
      ],
      hiddenEntityIds: [
        ...new Set([
          ...base.hiddenEntityIds,
          ...filtered.entityIds,
          ...layers.filter((layer) => layer.hidden).flatMap((layer) => layer.pointEntityIds),
        ]),
      ],
      lockedBrushIds: [
        ...new Set([
          ...base.lockedBrushIds,
          ...layers.filter((layer) => layer.locked).flatMap((layer) => layer.brushIds),
        ]),
      ],
      lockedEntityIds: [
        ...new Set([
          ...base.lockedEntityIds,
          ...layers.filter((layer) => layer.locked).flatMap((layer) => layer.pointEntityIds),
        ]),
      ],
    };
  }

  public get viewFilters(): EditorViewFilterState {
    return {
      worldBrushesVisible: this.currentViewFilters.worldBrushesVisible,
      hiddenEntityClassnames: [...this.currentViewFilters.hiddenEntityClassnames],
      hiddenSpecialBrushTypes: [...this.currentViewFilters.hiddenSpecialBrushTypes],
    };
  }

  public get filteredObjectIds(): EditorViewFilterObjectIds {
    return deriveEditorViewFilterObjectIds(this.currentDocument, this.currentViewFilters);
  }

  protected setViewFilters(after: EditorViewFilterState, label: string): boolean {
    const normalized: EditorViewFilterState = {
      worldBrushesVisible: after.worldBrushesVisible,
      hiddenEntityClassnames: [
        ...new Set(after.hiddenEntityClassnames.map((classname) => classname.trim().toLowerCase())),
      ].toSorted(),
      hiddenSpecialBrushTypes: EDITOR_SPECIAL_BRUSH_FILTER_INFO.map(({ type }) => type).filter(
        (type) => after.hiddenSpecialBrushTypes.includes(type),
      ),
    };
    if (
      normalized.worldBrushesVisible === this.currentViewFilters.worldBrushesVisible &&
      normalized.hiddenEntityClassnames.join('\u0000') ===
        this.currentViewFilters.hiddenEntityClassnames.join('\u0000') &&
      normalized.hiddenSpecialBrushTypes.join('\u0000') ===
        this.currentViewFilters.hiddenSpecialBrushTypes.join('\u0000')
    ) {
      return false;
    }
    this.currentViewFilters = normalized;
    if (this.currentSelection) {
      const state = this.objectViewState;
      const hiddenBrushIds = new Set(state.hiddenBrushIds);
      const hiddenEntityIds = new Set(state.hiddenEntityIds);
      if (
        selectedBrushIds(this.currentSelection).some((brushId) => hiddenBrushIds.has(brushId)) ||
        selectedPointEntityIds(this.currentSelection).some((entityId) =>
          hiddenEntityIds.has(entityId),
        )
      ) {
        this.currentSelection = null;
        this.discardRepeatableCommands();
      }
    }
    this.notify('view', label);
    return true;
  }

  /** Toggles every point or brush entity sharing a classname without dirtying map source. */
  public setEntityClassVisible(classname: string, visible: boolean): boolean {
    const normalizedClassname = classname.trim().toLowerCase();
    if (!normalizedClassname || normalizedClassname === 'worldspawn') return false;
    const hidden = new Set(this.currentViewFilters.hiddenEntityClassnames);
    if (visible) hidden.delete(normalizedClassname);
    else hidden.add(normalizedClassname);
    return this.setViewFilters(
      { ...this.currentViewFilters, hiddenEntityClassnames: [...hidden] },
      `${visible ? 'Show' : 'Hide'} ${normalizedClassname} entities`,
    );
  }

  public setAllEntityClassesVisible(visible: boolean): boolean {
    return this.setViewFilters(
      {
        ...this.currentViewFilters,
        hiddenEntityClassnames: visible
          ? []
          : entityClassFiltersInDocument(this.currentDocument).map(({ classname }) => classname),
      },
      `${visible ? 'Show' : 'Hide'} all entity classes`,
    );
  }

  public setWorldBrushesVisible(visible: boolean): boolean {
    return this.setViewFilters(
      { ...this.currentViewFilters, worldBrushesVisible: visible },
      `${visible ? 'Show' : 'Hide'} world brushes`,
    );
  }

  public setSpecialBrushFilterVisible(type: EditorSpecialBrushFilter, visible: boolean): boolean {
    if (!EDITOR_SPECIAL_BRUSH_FILTER_INFO.some((entry) => entry.type === type)) return false;
    const hidden = new Set(this.currentViewFilters.hiddenSpecialBrushTypes);
    if (visible) hidden.delete(type);
    else hidden.add(type);
    const label = EDITOR_SPECIAL_BRUSH_FILTER_INFO.find((entry) => entry.type === type)!.label;
    return this.setViewFilters(
      { ...this.currentViewFilters, hiddenSpecialBrushTypes: [...hidden] },
      `${visible ? 'Show' : 'Hide'} ${label.toLowerCase()}`,
    );
  }

  public get canShowAll(): boolean {
    return this.hiddenBrushIds.size + this.hiddenEntityIds.size > 0;
  }

  public get canUnlockAll(): boolean {
    return this.lockedBrushIds.size + this.lockedEntityIds.size > 0;
  }

  public get canUndo(): boolean {
    return this.history.canUndo;
  }

  public get canRedo(): boolean {
    return this.history.canRedo;
  }

  public get undoLabel(): string | null {
    return this.history.undoLabel;
  }

  public get redoLabel(): string | null {
    return this.history.redoLabel;
  }

  public get canRepeatCommands(): boolean {
    return Boolean(
      this.repeatableCommands.length > 0 &&
      this.currentSelection &&
      !this.currentSelection.faceId &&
      selectedBrushIds(this.currentSelection).length +
        selectedPointEntityIds(this.currentSelection).length >
        0,
    );
  }

  public get repeatCommandCount(): number {
    return this.repeatableCommands.length;
  }

  public get repeatCommandLabels(): readonly string[] {
    return this.repeatableCommands.map(repeatableCommandLabel);
  }

  protected discardRepeatableCommands(): void {
    this.repeatableCommands = [];
  }

  /** Explicitly starts a new macro-like command-repetition sequence. */
  public clearRepeatableCommands(): boolean {
    if (this.repeatableCommands.length === 0) return false;
    this.discardRepeatableCommands();
    this.notify('view', 'Clear repeatable commands');
    return true;
  }

  protected recordRepeatableCommand(command: EditorRepeatableCommand | undefined): void {
    if (!command || this.suppressRepeatRecording) return;
    this.repeatableCommands.push(command);
  }

  protected applyRepeatableCommand(
    target: this,
    command: EditorRepeatableCommand,
    ids: IdFactory,
  ): boolean {
    const selection = target.selection;
    if (!selection || selection.faceId) return false;
    if (command.kind === 'duplicate') {
      return target.duplicateSelected(
        ids,
        command.delta,
        command.textureLock,
        command.targetGroupId,
      );
    }
    if (command.kind === 'translate') {
      return target.translateSelected(command.delta, command.textureLock);
    }
    const candidate =
      command.kind === 'rotate'
        ? target.createObjectRotationCandidate(
            selection,
            command.pivot,
            command.axis,
            command.degrees,
            command.textureLock,
            command.updateEntityAngles,
          )
        : command.kind === 'flip'
          ? target.createObjectFlipCandidate(
              selection,
              command.pivot,
              command.axis,
              command.textureLock,
              command.updateEntityAngles,
            )
          : command.kind === 'scale'
            ? target.createObjectScaleCandidate(
                selection,
                command.pivot,
                command.factors,
                command.textureLock,
                command.updateEntityAngles,
              )
            : target.createObjectShearCandidate(
                selection,
                command.pivot,
                command.sourceAxis,
                command.targetAxis,
                command.factor,
                command.textureLock,
                command.updateEntityAngles,
              );
    if (!candidate) return false;
    target.commitDocumentCandidate(candidate);
    return true;
  }

  /** Replays the actions recorded since the last manual selection change as one undo step. */
  public repeatLastCommands(): boolean {
    if (!this.canRepeatCommands || !this.currentSelection) return false;
    const commands = [...this.repeatableCommands];
    const SessionConstructor = this.constructor as new (document: MapDocument) => this;
    const replay = new SessionConstructor(this.currentDocument);
    replay.currentSelection = this.currentSelection;
    replay.currentLayerId = this.activeLayerId;
    replay.editingGroupId = this.editingGroupId;
    replay.suppressRepeatRecording = true;
    const ids = createSequentialIdFactory(
      `repeat-${this.currentDocument.revision}-${++this.repeatSequence}`,
    );
    for (const command of commands) {
      if (!this.applyRepeatableCommand(replay, command, ids)) {
        throw new Error(`Cannot repeat ${repeatableCommandLabel(command).toLowerCase()} command`);
      }
    }
    if (replay.document === this.currentDocument) return false;
    const count = commands.length;
    this.commitDocumentCandidate({
      label: `Repeat ${count} ${count === 1 ? 'command' : 'commands'}`,
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after: replay.document,
      selectionBefore: this.currentSelection,
      selectionAfter: replay.selection,
      document: replay.document,
    });
    return true;
  }

  public subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public replaceDocument(document: MapDocument, label = 'Open map'): void {
    this.currentDocument = document;
    this.currentSelection = null;
    this.editingGroupId = null;
    this.currentLayerId = null;
    this.discardRepeatableCommands();
    this.repeatSequence = 0;
    this.applyObjectViewState({
      hiddenBrushIds: [],
      hiddenEntityIds: [],
      lockedBrushIds: [],
      lockedEntityIds: [],
    });
    this.history.clear();
    this.notify('document', label);
  }

  /** Replaces document contents as one history entry, primarily for recovery/version restore. */
  public restoreDocument(document: MapDocument, label = 'Restore document'): void {
    const restored: MapDocument = {
      ...structuredClone(document),
      revision: this.currentDocument.revision + 1,
    };
    this.commitDocumentCandidate({
      label,
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after: restored,
      selectionBefore: this.currentSelection,
      selectionAfter: null,
      document: restored,
    });
  }

  /** Sets the group whose members are currently editable; linked sibling updates stay atomic. */
  public setEditingGroup(groupId: string | null): void {
    if (
      groupId &&
      !deriveEditorGroups(this.currentDocument).some((group) => group.id === groupId)
    ) {
      throw new Error(`Unknown group ${groupId}`);
    }
    this.editingGroupId = groupId;
  }

  public get editingGroup(): string | null {
    return this.editingGroupId;
  }

  public get activeLayerId(): EditorLayerId {
    return findEditorLayer(this.currentDocument, this.currentLayerId) ? this.currentLayerId : null;
  }

  /** Changes the non-serialized insertion target used for new and pasted top-level objects. */
  public setActiveLayer(layerId: EditorLayerId): void {
    if (!findEditorLayer(this.currentDocument, layerId)) {
      throw new Error(layerId === null ? 'Default Layer is missing' : `Unknown layer ${layerId}`);
    }
    this.currentLayerId = layerId;
    this.notify('view', `Set active layer ${findEditorLayer(this.currentDocument, layerId)!.name}`);
  }

  protected activeLayerEntity(document = this.currentDocument): MapEntity {
    const layer = findEditorLayer(document, this.currentLayerId);
    if (!layer) {
      this.currentLayerId = null;
      return document.entities.find(
        (entity) => entity.properties.classname?.toLowerCase() === 'worldspawn',
      )!;
    }
    const entity =
      layer.id === null
        ? document.entities.find(
            (candidate) => candidate.properties.classname?.toLowerCase() === 'worldspawn',
          )
        : document.entities.find((candidate) => candidate.id === layer.entityId);
    if (!entity) throw new Error(`Layer ${layer.name} has no structural entity`);
    return entity;
  }

  protected commitLayerChange(
    label: string,
    after: MapDocument,
    selectionAfter: EditorSelection | null = this.currentSelection,
  ): void {
    this.commitDocumentCandidate({
      label,
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter,
      document: after,
    });
  }

  public createLayer(name: string, ids: IdFactory): string {
    const result = createEditorLayer(this.currentDocument, name, ids);
    this.currentLayerId = result.layerId;
    this.commitLayerChange('Create layer', result.document);
    return result.layerId;
  }

  public renameLayer(layerId: string, name: string): boolean {
    const after = renameEditorLayer(this.currentDocument, layerId, name);
    this.commitLayerChange('Rename layer', after);
    return true;
  }

  public setLayerFlag(layerId: EditorLayerId, flag: EditorLayerFlag, value: boolean): boolean {
    const layer = findEditorLayer(this.currentDocument, layerId);
    if (!layer || layer[flag === 'omit-from-export' ? 'omitFromExport' : flag] === value) {
      return false;
    }
    const after = setEditorLayerFlag(this.currentDocument, layerId, flag, value);
    const selectedBrushes = new Set(selectedBrushIds(this.currentSelection));
    const selectedEntities = new Set(selectedPointEntityIds(this.currentSelection));
    const selectionTouchesLayer =
      layer.brushIds.some((brushId) => selectedBrushes.has(brushId)) ||
      layer.pointEntityIds.some((entityId) => selectedEntities.has(entityId));
    const label = `${value ? 'Enable' : 'Disable'} layer ${flag}`;
    this.commitLayerChange(
      label,
      after,
      (flag === 'hidden' || flag === 'locked') && value && selectionTouchesLayer
        ? null
        : this.currentSelection,
    );
    return true;
  }

  public setAllLayersFlag(flag: 'hidden' | 'locked', value: boolean): boolean {
    const layers = deriveEditorLayers(this.currentDocument);
    let after = this.currentDocument;
    let changed = false;
    for (const layer of layers) {
      if (layer[flag] === value) continue;
      after = setEditorLayerFlag(after, layer.id, flag, value);
      changed = true;
    }
    if (!changed) return false;
    this.commitLayerChange(
      `${value ? (flag === 'hidden' ? 'Hide' : 'Lock') : flag === 'hidden' ? 'Show' : 'Unlock'} all layers`,
      after,
      value ? null : this.currentSelection,
    );
    return true;
  }

  public isolateLayer(layerId: EditorLayerId): boolean {
    if (!findEditorLayer(this.currentDocument, layerId)) return false;
    let after = this.currentDocument;
    let changed = false;
    for (const layer of deriveEditorLayers(this.currentDocument)) {
      const hidden = layer.id !== layerId;
      if (layer.hidden === hidden) continue;
      after = setEditorLayerFlag(after, layer.id, 'hidden', hidden);
      changed = true;
    }
    if (!changed) return false;
    const layer = findEditorLayer(this.currentDocument, layerId)!;
    const selection = layer.locked ? null : selectionForEditorLayer(layer);
    this.commitLayerChange('Isolate layer', after, selection);
    return true;
  }

  public reorderLayer(layerId: string, direction: -1 | 1): boolean {
    const after = reorderEditorLayer(this.currentDocument, layerId, direction);
    if (after === this.currentDocument) return false;
    this.commitLayerChange('Reorder layer', after);
    return true;
  }

  public removeLayer(layerId: string): boolean {
    const layer = findEditorLayer(this.currentDocument, layerId);
    if (!layer?.entityId) return false;
    const after = removeEditorLayer(this.currentDocument, layerId);
    if (this.currentLayerId === layerId) this.currentLayerId = null;
    this.commitLayerChange('Remove layer', after);
    return true;
  }

  public moveSelectedToLayer(layerId: EditorLayerId): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const currentLayer = editorLayerForSelection(this.currentDocument, this.currentSelection);
    if (currentLayer?.id === layerId) return false;
    const targetLayer = findEditorLayer(this.currentDocument, layerId);
    if (!targetLayer) return false;
    const after = moveSelectionToEditorLayer(this.currentDocument, this.currentSelection, layerId);
    this.commitLayerChange(
      'Move objects to layer',
      after,
      targetLayer.hidden || targetLayer.locked ? null : this.currentSelection,
    );
    return true;
  }

  public selectAllInLayer(layerId: EditorLayerId): EditorSelection | null {
    const layer = findEditorLayer(this.currentDocument, layerId);
    if (!layer || layer.hidden || layer.locked) return this.currentSelection;
    const selection = selectionForEditorLayer(layer);
    this.select(selection);
    return selection;
  }

  protected hasLinkedEditingGroup(document = this.currentDocument): boolean {
    return Boolean(
      this.editingGroupId && linkedGroupSiblings(document, this.editingGroupId).length > 1,
    );
  }

  protected synchronizeEditingGroup(document: MapDocument): MapDocument {
    return this.editingGroupId && linkedGroupSiblings(document, this.editingGroupId).length > 1
      ? synchronizeLinkedGroupContents(document, this.editingGroupId, this.linkedSyncIds)
      : document;
  }

  /** Wraps the current object selection in a TrenchBroom-compatible named group. */
}
