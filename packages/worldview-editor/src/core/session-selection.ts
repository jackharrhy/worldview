import { removeBrushes } from './document.js';
import {
  deriveEditorGroups,
  editorGroupForObject,
  groupObjects,
  isEditorGroupEntity,
  moveObjectsIntoEditorGroup,
  renameEditorGroup,
  selectedEditorGroup,
  selectionForEditorGroup,
  ungroupObjects,
} from './groups.js';
import {
  createLinkedGroupDuplicate,
  normalizeSingleLinkedGroups,
  transformEditorGroupSubtreeMetadata,
  translationAffineMatrix,
  unlinkEditorGroup,
} from './linked-groups.js';
import { applyEditorIssueFix, selectionForEditorIssue } from './issues.js';
import { isEditorLayerEntity } from './layers.js';
import { pointEntitiesInDocument } from './point-entities.js';
import {
  connectedCoplanarFaces,
  createFaceSelection,
  createObjectSelection,
  facesOfBrush,
  matchingBrushFaces,
  selectedBrushIds,
  selectedFaceReferences,
  selectedPointEntityIds,
  updateBrushSelection,
  updateFaceSelection,
  updatePointEntitySelection,
} from './selection.js';
import {
  querySelectionBrushes,
  type SelectionBrushProjection,
  type SelectionBrushQueryMode,
} from './selection-query.js';
import type {
  BrushId,
  BrushSelection,
  EditorSelection,
  EntityId,
  FaceId,
  FaceSelection,
  IdFactory,
  Vec3,
} from './types.js';
import { brushesInDocument, findBrush } from './types.js';
import {
  faceSelectionKey,
  translatedObjects,
  type SelectionBrushSelectionResult,
} from './session-common.js';
import { EditorSessionState } from './session-state.js';
export abstract class EditorSessionSelection extends EditorSessionState {
  public groupSelected(
    name: string,
    ids: IdFactory,
    openGroupId: string | null = null,
  ): string | null {
    const selection = this.currentSelection;
    if (!selection || selection.faceId) return null;
    const result = groupObjects(
      this.currentDocument,
      selection,
      name,
      ids,
      openGroupId,
      openGroupId ? null : this.currentLayerId,
    );
    this.commitDocumentCandidate({
      label: 'Group objects',
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after: result.document,
      selectionBefore: selection,
      selectionAfter: result.selection,
      document: result.document,
    });
    return result.groupId;
  }
  /** Creates another transformed copy and links both group roots as one reusable structure. */
  public linkedDuplicateSelected(
    ids: IdFactory,
    delta: Vec3 = [16, 16, 0],
    textureLock = true,
  ): string | null {
    const source = selectedEditorGroup(this.currentDocument, this.currentSelection);
    if (!source) return null;
    const duplicate = createLinkedGroupDuplicate(this.currentDocument, source.id, ids);
    let after = duplicate.document;
    if (duplicate.selection && delta.some((component) => Math.abs(component) > Number.EPSILON)) {
      after = translatedObjects(after, duplicate.selection, delta, textureLock);
      after = transformEditorGroupSubtreeMetadata(
        after,
        duplicate.groupId,
        translationAffineMatrix(delta),
      );
    }
    this.commitDocumentCandidate({
      label: 'Create linked duplicate',
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: duplicate.selection,
      document: after,
    });
    return duplicate.groupId;
  }

  public unlinkGroup(groupId?: string): boolean {
    const group = groupId
      ? deriveEditorGroups(this.currentDocument).find((candidate) => candidate.id === groupId)
      : selectedEditorGroup(this.currentDocument, this.currentSelection);
    if (!group?.linkedGroupId) return false;
    const after = unlinkEditorGroup(this.currentDocument, group.id);
    this.commitDocumentCandidate({
      label: 'Unlink group',
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: this.currentSelection,
      document: after,
    });
    return true;
  }

  /** Removes one selected group container but retains all of its objects and child groups. */
  public ungroupSelected(groupId?: string): boolean {
    const group = groupId
      ? { id: groupId }
      : selectedEditorGroup(this.currentDocument, this.currentSelection);
    if (!group) return false;
    const result = ungroupObjects(this.currentDocument, group.id);
    const after = normalizeSingleLinkedGroups(result.document);
    this.commitDocumentCandidate({
      label: 'Ungroup objects',
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: result.selection,
      document: after,
    });
    return true;
  }

  public renameGroup(groupId: string, name: string): boolean {
    const after = renameEditorGroup(this.currentDocument, groupId, name);
    if (after === this.currentDocument) return false;
    this.commitDocumentCandidate({
      label: 'Rename group',
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: this.currentSelection,
      document: after,
    });
    return true;
  }

  public addSelectedToGroup(groupId: string): boolean {
    const selection = this.currentSelection;
    if (!selection || selection.faceId) return false;
    const after = moveObjectsIntoEditorGroup(this.currentDocument, selection, groupId);
    if (after === this.currentDocument) return false;
    this.commitDocumentCandidate({
      label: 'Add objects to group',
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: selection,
      selectionAfter: selection,
      document: after,
    });
    return true;
  }

  public hideSelected(): boolean {
    const selection = this.currentSelection;
    if (!selection || selection.faceId) return false;
    const brushIds = selectedBrushIds(selection);
    const entityIds = selectedPointEntityIds(selection);
    if (brushIds.length + entityIds.length === 0) return false;
    const after = this.snapshotObjectViewState();
    return this.commitObjectViewState(
      brushIds.length + entityIds.length === 1 ? 'Hide object' : 'Hide objects',
      {
        ...after,
        hiddenBrushIds: [...new Set([...after.hiddenBrushIds, ...brushIds])],
        hiddenEntityIds: [...new Set([...after.hiddenEntityIds, ...entityIds])],
      },
      null,
    );
  }

  public isolateSelected(): boolean {
    const selection = this.currentSelection;
    if (!selection || selection.faceId) return false;
    const visibleBrushIds = new Set(selectedBrushIds(selection));
    const visibleEntityIds = new Set(selectedPointEntityIds(selection));
    if (visibleBrushIds.size + visibleEntityIds.size === 0) return false;
    return this.commitObjectViewState(
      'Isolate objects',
      {
        ...this.snapshotObjectViewState(),
        hiddenBrushIds: brushesInDocument(this.currentDocument)
          .map((brush) => brush.id)
          .filter((brushId) => !visibleBrushIds.has(brushId)),
        hiddenEntityIds: pointEntitiesInDocument(this.currentDocument)
          .map((entity) => entity.id)
          .filter((entityId) => !visibleEntityIds.has(entityId)),
      },
      selection,
    );
  }

  public showAll(): boolean {
    if (!this.canShowAll) return false;
    return this.commitObjectViewState(
      'Show all objects',
      {
        ...this.snapshotObjectViewState(),
        hiddenBrushIds: [],
        hiddenEntityIds: [],
      },
      this.currentSelection,
    );
  }

  public lockSelected(): boolean {
    const selection = this.currentSelection;
    if (!selection || selection.faceId) return false;
    const brushIds = selectedBrushIds(selection);
    const entityIds = selectedPointEntityIds(selection);
    if (brushIds.length + entityIds.length === 0) return false;
    const before = this.snapshotObjectViewState();
    return this.commitObjectViewState(
      brushIds.length + entityIds.length === 1 ? 'Lock object' : 'Lock objects',
      {
        ...before,
        lockedBrushIds: [...new Set([...before.lockedBrushIds, ...brushIds])],
        lockedEntityIds: [...new Set([...before.lockedEntityIds, ...entityIds])],
      },
      null,
    );
  }

  public unlockAll(): boolean {
    if (!this.canUnlockAll) return false;
    return this.commitObjectViewState(
      'Unlock all objects',
      {
        ...this.snapshotObjectViewState(),
        lockedBrushIds: [],
        lockedEntityIds: [],
      },
      this.currentSelection,
    );
  }

  public select(selection: EditorSelection | null): void {
    if (selection) this.assertSelectionAvailable(selection);
    this.discardRepeatableCommands();
    this.currentSelection = selection;
    this.notify(
      'selection',
      selection
        ? selection.faceId
          ? 'Select face'
          : selection.entityId
            ? 'Select entity'
            : 'Select brush'
        : 'Clear selection',
    );
  }

  /** Locates every object implicated by an issue, including hidden or locked objects. */
  public selectIssue(issueId: string): EditorSelection | null {
    const issue = this.issues.find((candidate) => candidate.id === issueId);
    if (!issue) return null;
    this.discardRepeatableCommands();
    this.currentSelection = selectionForEditorIssue(issue);
    this.notify('selection', `Select issue: ${issue.message}`);
    return this.currentSelection;
  }
  /** Applies one advertised issue quick fix as a single undoable document edit. */
  public fixIssue(issueId: string): boolean {
    const result = applyEditorIssueFix(this.currentDocument, issueId, this.issueFixIds);
    if (!result) return false;
    this.discardRepeatableCommands();
    this.commitDocumentCandidate({
      label: result.label,
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after: result.document,
      selectionBefore: this.currentSelection,
      selectionAfter: result.removesObjects ? null : this.currentSelection,
      document: result.document,
    });
    return true;
  }

  protected isBrushUnavailable(brushId: BrushId): boolean {
    const state = this.objectViewState;
    return state.hiddenBrushIds.includes(brushId) || state.lockedBrushIds.includes(brushId);
  }

  protected isEntityUnavailable(entityId: EntityId): boolean {
    const state = this.objectViewState;
    return state.hiddenEntityIds.includes(entityId) || state.lockedEntityIds.includes(entityId);
  }

  protected editableObjectIds(): {
    readonly brushIds: readonly BrushId[];
    readonly entityIds: readonly EntityId[];
  } {
    const editingGroup = this.editingGroupId
      ? deriveEditorGroups(this.currentDocument).find((group) => group.id === this.editingGroupId)
      : null;
    const groupBrushIds = editingGroup ? new Set(editingGroup.brushIds) : null;
    const groupEntityIds = editingGroup ? new Set(editingGroup.pointEntityIds) : null;
    return {
      brushIds: brushesInDocument(this.currentDocument)
        .map((brush) => brush.id)
        .filter(
          (brushId) =>
            (!groupBrushIds || groupBrushIds.has(brushId)) && !this.isBrushUnavailable(brushId),
        ),
      entityIds: pointEntitiesInDocument(this.currentDocument)
        .map((entity) => entity.id)
        .filter(
          (entityId) =>
            (!groupEntityIds || groupEntityIds.has(entityId)) &&
            !this.isEntityUnavailable(entityId),
        ),
    };
  }

  protected setObjectSelection(
    brushIds: readonly BrushId[],
    entityIds: readonly EntityId[],
    label: string,
  ): EditorSelection | null {
    const selection = createObjectSelection(brushIds, entityIds);
    this.discardRepeatableCommands();
    this.currentSelection = selection;
    const count = brushIds.length + entityIds.length;
    this.notify('selection', count > 0 ? `${label} (${count})` : 'Clear selection');
    return selection;
  }

  /** Selects every currently editable brush and point entity without changing document history. */
  public selectAllEditable(): EditorSelection | null {
    const editable = this.editableObjectIds();
    return this.setObjectSelection(editable.brushIds, editable.entityIds, 'Select all objects');
  }

  /** Inverts the current object selection within the visible, unlocked editing context. */
  public invertObjectSelection(): EditorSelection | null {
    const editable = this.editableObjectIds();
    const selectedBrushes = new Set(
      this.currentSelection?.faceId ? [] : selectedBrushIds(this.currentSelection),
    );
    const selectedEntities = new Set(
      this.currentSelection?.faceId ? [] : selectedPointEntityIds(this.currentSelection),
    );
    return this.setObjectSelection(
      editable.brushIds.filter((brushId) => !selectedBrushes.has(brushId)),
      editable.entityIds.filter((entityId) => !selectedEntities.has(entityId)),
      'Invert object selection',
    );
  }

  protected expandSelectionQueryGroups(
    brushIds: readonly BrushId[],
    entityIds: readonly EntityId[],
  ): EditorSelection | null {
    const brushes = new Set<BrushId>();
    const entities = new Set<EntityId>();
    const expandedGroups = new Map<string, ReturnType<typeof editorGroupForObject>>();
    const addGroupOrObject = (selection: EditorSelection): void => {
      const group = editorGroupForObject(this.currentDocument, selection, this.editingGroupId);
      if (!group) {
        for (const brushId of selectedBrushIds(selection)) brushes.add(brushId);
        for (const entityId of selectedPointEntityIds(selection)) entities.add(entityId);
        return;
      }
      expandedGroups.set(group.id, group);
    };
    for (const brushId of brushIds) addGroupOrObject({ brushId });
    for (const entityId of entityIds) addGroupOrObject({ entityId });
    for (const group of expandedGroups.values()) {
      if (!group) continue;
      const unavailable =
        group.brushIds.some((brushId) => this.isBrushUnavailable(brushId)) ||
        group.pointEntityIds.some((entityId) => this.isEntityUnavailable(entityId));
      if (unavailable) continue;
      for (const brushId of group.brushIds) brushes.add(brushId);
      for (const entityId of group.pointEntityIds) entities.add(entityId);
    }
    if (expandedGroups.size === 1 && brushes.size + entities.size > 0) {
      const group = [...expandedGroups.values()][0];
      if (
        group &&
        group.brushIds.length === brushes.size &&
        group.pointEntityIds.length === entities.size
      ) {
        return selectionForEditorGroup(group);
      }
    }
    return createObjectSelection([...brushes], [...entities]);
  }

  /**
   * Consumes the selected structural brushes and selects editable objects touching or contained by
   * their convex volumes. The deletion and resulting selection are one reversible transaction.
   */
  public selectWithSelectionBrushes(
    mode: SelectionBrushQueryMode,
    projection?: SelectionBrushProjection,
  ): SelectionBrushSelectionResult | null {
    const selection = this.currentSelection;
    if (!selection || selection.faceId || selection.groupId) return null;
    const selectionBrushIds = selectedBrushIds(selection);
    if (selectionBrushIds.length === 0 || selectedPointEntityIds(selection).length > 0) return null;
    for (const brushId of selectionBrushIds) {
      const owner = this.currentDocument.entities.find((entity) =>
        entity.brushes.some((brush) => brush.id === brushId),
      );
      if (
        !owner ||
        (owner.properties.classname !== 'worldspawn' &&
          !isEditorGroupEntity(owner) &&
          !isEditorLayerEntity(owner))
      ) {
        throw new Error('Selection brushes must be structural brushes');
      }
    }
    const editable = this.editableObjectIds();
    const queried = querySelectionBrushes(this.currentDocument, selectionBrushIds, {
      mode,
      ...(projection ? { projection } : {}),
      candidateBrushIds: editable.brushIds,
      candidateEntityIds: editable.entityIds,
    });
    const selectionAfter = this.expandSelectionQueryGroups(queried.brushIds, queried.entityIds);
    this.discardRepeatableCommands();
    const after = removeBrushes(this.currentDocument, selectionBrushIds);
    const selectedBrushCount = selectedBrushIds(selectionAfter).length;
    const selectedEntityCount = selectedPointEntityIds(selectionAfter).length;
    const modeLabel =
      mode === 'touching'
        ? 'Select touching objects'
        : mode === 'inside'
          ? 'Select enclosed objects'
          : 'Select projected objects';
    this.commitDocumentCandidate({
      label: modeLabel,
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: selection,
      selectionAfter,
      document: after,
    });
    return {
      removedBrushCount: selectionBrushIds.length,
      selectedBrushCount,
      selectedEntityCount,
      selection: selectionAfter,
    };
  }

  public selectBrush(brushId: BrushId, additive = false): EditorSelection | null {
    if (!findBrush(this.currentDocument, brushId)) throw new Error(`Unknown brush ${brushId}`);
    if (this.isBrushUnavailable(brushId)) {
      throw new Error(`Cannot select hidden or locked brush ${brushId}`);
    }
    this.discardRepeatableCommands();
    this.currentSelection = updateBrushSelection(this.currentSelection, brushId, additive);
    const count = selectedBrushIds(this.currentSelection).length;
    this.notify(
      'selection',
      this.currentSelection
        ? count > 1
          ? `Select ${count} brushes`
          : 'Select brush'
        : 'Clear selection',
    );
    return this.currentSelection;
  }

  public selectPointEntity(entityId: EntityId, additive = false): EditorSelection | null {
    if (!pointEntitiesInDocument(this.currentDocument).some((entity) => entity.id === entityId)) {
      throw new Error(`Unknown point entity ${entityId}`);
    }
    if (this.isEntityUnavailable(entityId)) {
      throw new Error(`Cannot select hidden or locked point entity ${entityId}`);
    }
    this.discardRepeatableCommands();
    this.currentSelection = updatePointEntitySelection(this.currentSelection, entityId, additive);
    const count = selectedPointEntityIds(this.currentSelection).length;
    this.notify(
      'selection',
      this.currentSelection
        ? count > 1
          ? `Select ${count} entities`
          : 'Select entity'
        : 'Clear selection',
    );
    return this.currentSelection;
  }

  public selectFace(face: FaceSelection, additive = false): BrushSelection | null {
    return this.selectFaces([face], additive, additive ? 'Toggle face selection' : 'Select face');
  }

  public selectBrushFaces(
    brushId: BrushId,
    additive = false,
    primaryFaceId?: FaceId,
  ): BrushSelection | null {
    return this.selectFaces(
      facesOfBrush(this.currentDocument, brushId),
      additive,
      additive ? 'Add brush faces' : 'Select brush faces',
      primaryFaceId ? { brushId, faceId: primaryFaceId } : null,
    );
  }

  public selectConnectedCoplanarFaces(
    seed: FaceSelection,
    additive = false,
  ): BrushSelection | null {
    return this.selectFaces(
      connectedCoplanarFaces(this.currentDocument, seed),
      additive,
      additive ? 'Add coplanar faces' : 'Select coplanar faces',
      seed,
    );
  }

  public selectMatchingBrushFaces(
    seed: FaceSelection,
    brushIds: readonly BrushId[],
    additive = false,
  ): BrushSelection | null {
    return this.selectFaces(
      matchingBrushFaces(this.currentDocument, seed, brushIds),
      additive,
      additive ? 'Add matching faces' : 'Select matching faces',
      seed,
    );
  }

  public selectFaces(
    faces: readonly FaceSelection[],
    additive = false,
    label = 'Select faces',
    primary: FaceSelection | null = faces.at(-1) ?? null,
  ): BrushSelection | null {
    for (const face of faces) {
      if (this.isBrushUnavailable(face.brushId)) {
        throw new Error(`Cannot select a face on hidden or locked brush ${face.brushId}`);
      }
      const brush = findBrush(this.currentDocument, face.brushId);
      if (!brush?.faces.some((candidate) => candidate.id === face.faceId)) {
        throw new Error(`Unknown face ${face.faceId} on brush ${face.brushId}`);
      }
    }
    this.discardRepeatableCommands();
    this.currentSelection = updateFaceSelection(this.currentSelection, faces, additive, primary);
    this.notify('selection', this.currentSelection ? label : 'Clear selection');
    return this.currentSelection;
  }

  public selectFacesWithLasso(
    faces: readonly FaceSelection[],
    ensureSelected = false,
  ): BrushSelection | null {
    if (faces.length === 0) return this.currentSelection?.brushId ? this.currentSelection : null;
    for (const face of faces) {
      const brush = findBrush(this.currentDocument, face.brushId);
      if (!brush?.faces.some((candidate) => candidate.id === face.faceId)) {
        throw new Error(`Unknown face ${face.faceId} on brush ${face.brushId}`);
      }
    }
    const selected = new Map(
      selectedFaceReferences(this.currentSelection).map(
        (face) => [faceSelectionKey(face), face] as const,
      ),
    );
    for (const face of faces) {
      const faceKey = faceSelectionKey(face);
      if (ensureSelected) selected.set(faceKey, face);
      else if (selected.has(faceKey)) selected.delete(faceKey);
      else selected.set(faceKey, face);
    }
    const primary = faces.toReversed().find((face) => selected.has(faceSelectionKey(face))) ?? null;
    this.discardRepeatableCommands();
    this.currentSelection = createFaceSelection([...selected.values()], primary);
    const count = selected.size;
    this.notify(
      'selection',
      count === 0
        ? 'Clear face lasso selection'
        : `Lasso selected ${count} ${count === 1 ? 'face' : 'faces'}`,
    );
    return this.currentSelection;
  }
}
