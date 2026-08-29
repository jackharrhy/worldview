import {
  cloneBrush,
  insertBrush,
  insertBrushes,
  insertEntity,
  removeBrush,
  removeBrushes,
  removeEntities,
  replaceBrushes,
  replaceEntityProperties,
  setBrushFaceMaterials,
  translateBrush,
  type BrushInsertion,
} from './document.js';
import { createObjectClipboardDocument } from './clipboard.js';
import { deriveBrush } from './geometry.js';
import {
  deriveEditorGroups,
  deleteEditorGroup,
  isEditorGroupEntity,
  selectedEditorGroup,
} from './groups.js';
import {
  normalizeSingleLinkedGroups,
  setEntityPropertyProtection as setLinkedEntityPropertyProtection,
  transformEditorGroupMetadata,
  transformEditorGroupSubtreeMetadata,
  translationAffineMatrix,
} from './linked-groups.js';
import { brushIdsWithMaterial, faceReferencesWithMaterial } from './material-usage.js';
import {
  deriveEditorLayers,
  editorLayerForSelection,
  findEditorLayer,
  isEditorLayerEntity,
  type EditorLayerId,
} from './layers.js';
import {
  formatEntityOrigin,
  parseEntityOrigin,
  pointEntitiesInDocument,
} from './point-entities.js';
import { sweepBrushFace, type SweepOptions, type SweepTransform } from './sweep.js';
import {
  createFaceSelection,
  createObjectSelection,
  selectedBrushIds,
  selectedFaceReferences,
  selectedPointEntityIds,
} from './selection.js';
import type {
  BrushId,
  EditorSelection,
  EntityId,
  FaceId,
  FaceSelection,
  IdFactory,
  MapBrush,
  MapDocument,
  MapEntity,
  Vec3,
} from './types.js';
import { brushesInDocument, findBrush } from './types.js';
import {
  faceSelectionKey,
  translatedObjects,
  type BrushCreationCandidate,
  type BrushBatchCreationCandidate,
  type DocumentEditCandidate,
  type SweepCandidate,
} from './session-common.js';
import { EditorSessionEntities } from './session-entities.js';
export abstract class EditorSessionObjects extends EditorSessionEntities {
  public createBrushCandidate(brush: MapBrush, entityId?: EntityId): BrushCreationCandidate {
    const target = entityId
      ? this.currentDocument.entities.find((entity) => entity.id === entityId)
      : this.activeLayerEntity();
    if (!target) {
      throw new Error(entityId ? `Unknown entity ${entityId}` : 'The map has no worldspawn entity');
    }
    const derived = deriveBrush(brush);
    if (!derived.valid) {
      throw new Error(derived.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
    }
    const insertionIndex = target.primitives.length;
    return {
      label: 'Create brush',
      entityId: target.id,
      insertionIndex,
      baseDocumentRevision: this.currentDocument.revision,
      brush,
      document: insertBrush(this.currentDocument, target.id, brush, insertionIndex),
    };
  }
  public createBrushesCandidate(
    brushes: readonly MapBrush[],
    label = brushes.length === 1 ? 'Create brush' : 'Create brushes',
    entityId?: EntityId,
  ): BrushBatchCreationCandidate {
    if (brushes.length === 0)
      throw new Error('A batch creation candidate needs at least one brush');
    if (brushes.length > 1024) {
      throw new Error('A batch creation candidate may contain at most 1024 brushes');
    }
    const target = entityId
      ? this.currentDocument.entities.find((entity) => entity.id === entityId)
      : this.activeLayerEntity();
    if (!target) {
      throw new Error(entityId ? `Unknown entity ${entityId}` : 'The map has no worldspawn entity');
    }
    for (const brush of brushes) {
      const derived = deriveBrush(brush);
      if (!derived.valid) {
        throw new Error(derived.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
      }
    }
    const insertions = brushes.map((brush, index) => ({
      entityId: target.id,
      insertionIndex: target.primitives.length + index,
      brush,
    }));
    return {
      label,
      baseDocumentRevision: this.currentDocument.revision,
      insertions,
      selectionBefore: this.currentSelection,
      selectionAfter: brushes.map((brush) => brush.id),
      document: insertBrushes(this.currentDocument, insertions),
    };
  }

  public createSweepCandidate(
    faces: readonly FaceSelection[],
    transform: SweepTransform,
    options: SweepOptions,
    ids: IdFactory,
  ): SweepCandidate | null {
    const normalizedFaces = faces.filter(
      (face, index, all) =>
        all.findIndex((candidate) => faceSelectionKey(candidate) === faceSelectionKey(face)) ===
        index,
    );
    if (normalizedFaces.length === 0) return null;
    const insertions: BrushInsertion[] = [];
    const destinationCaps: (readonly Vec3[])[] = [];
    const nextInsertionByEntity = new Map<EntityId, number>();
    for (const face of normalizedFaces) {
      const sourceBrush = findBrush(this.currentDocument, face.brushId);
      if (!sourceBrush) throw new Error(`Unknown sweep source brush ${face.brushId}`);
      const owner = this.currentDocument.entities.find((entity) =>
        entity.primitives.some((brush) => brush.id === sourceBrush.id),
      );
      if (!owner) throw new Error(`Sweep source brush ${face.brushId} has no owning entity`);
      const result = sweepBrushFace(sourceBrush, face.faceId, transform, options, ids);
      const destinationCap = result.caps.at(-1);
      if (!destinationCap) throw new Error(`Sweep face ${face.faceId} produced no destination cap`);
      destinationCaps.push(destinationCap);
      if (insertions.length + result.brushes.length > 1024) {
        throw new Error('A multi-face sweep may create at most 1024 brushes');
      }
      let insertionIndex = nextInsertionByEntity.get(owner.id) ?? owner.primitives.length;
      for (const brush of result.brushes) {
        insertions.push({ entityId: owner.id, insertionIndex, brush });
        insertionIndex += 1;
      }
      nextInsertionByEntity.set(owner.id, insertionIndex);
    }
    const selectionAfter = insertions.map((insertion) => insertion.brush.id);
    return {
      label: normalizedFaces.length === 1 ? 'Sweep face' : 'Sweep faces',
      baseDocumentRevision: this.currentDocument.revision,
      insertions,
      selectionBefore: this.currentSelection,
      selectionAfter,
      sourceFaces: normalizedFaces,
      destinationCaps,
      document: insertBrushes(this.currentDocument, insertions),
    };
  }

  public sweepFaces(
    faces: readonly FaceSelection[],
    transform: SweepTransform,
    options: SweepOptions,
    ids: IdFactory,
  ): boolean {
    const candidate = this.createSweepCandidate(faces, transform, options, ids);
    if (!candidate) return false;
    this.commitBatchCreationCandidate(candidate);
    return true;
  }

  /** Builds stable in-place clones that can be translated repeatedly during a drag preview. */
  public createDuplicationCandidate(
    brushIds: readonly BrushId[],
    ids: IdFactory,
  ): BrushBatchCreationCandidate | null {
    const normalizedIds = [...new Set(brushIds)];
    if (normalizedIds.length === 0) return null;
    if (normalizedIds.length > 1024) throw new Error('At most 1024 brushes may be duplicated');
    const selectedIds = new Set(normalizedIds);
    const insertions: BrushInsertion[] = [];
    for (const entity of this.currentDocument.entities) {
      let insertionIndex = entity.primitives.length;
      for (const brush of entity.primitives) {
        if (brush.kind !== 'brush') continue;
        if (!selectedIds.has(brush.id)) continue;
        insertions.push({
          entityId: entity.id,
          insertionIndex,
          brush: cloneBrush(brush, ids),
        });
        insertionIndex += 1;
      }
    }
    if (insertions.length !== normalizedIds.length) {
      throw new Error('The duplication selection contains an unknown brush');
    }
    return {
      label: insertions.length === 1 ? 'Duplicate brush' : 'Duplicate brushes',
      baseDocumentRevision: this.currentDocument.revision,
      insertions,
      selectionBefore: this.currentSelection,
      selectionAfter: insertions.map((insertion) => insertion.brush.id),
      document: insertBrushes(this.currentDocument, insertions),
    };
  }

  /** Creates stable-ID duplicates for a mixed brush/point-entity selection. */
  public createObjectDuplicationCandidate(
    selection: EditorSelection,
    ids: IdFactory,
    targetGroupId: string | null = null,
  ): DocumentEditCandidate | null {
    if (selection.faceId) return null;
    const brushIds = selectedBrushIds(selection);
    const entityIds = selectedPointEntityIds(selection);
    if (brushIds.length + entityIds.length === 0) return null;
    if (brushIds.length + entityIds.length > 1024) {
      throw new Error('At most 1024 objects may be duplicated');
    }
    const groupedClipboard = createObjectClipboardDocument(this.currentDocument, selection);
    if (groupedClipboard && deriveEditorGroups(groupedClipboard).length > 0) {
      const sourceLayer = editorLayerForSelection(this.currentDocument, selection);
      const candidate = this.createPasteCandidate(
        groupedClipboard,
        ids,
        [0, 0, 0],
        true,
        targetGroupId,
        targetGroupId ? null : sourceLayer ? sourceLayer.id : this.currentLayerId,
      );
      return candidate
        ? {
            ...candidate,
            label:
              brushIds.length + entityIds.length === 1 ? 'Duplicate object' : 'Duplicate objects',
            selectionBefore: this.currentSelection,
            repeatable: {
              kind: 'duplicate',
              delta: [0, 0, 0],
              textureLock: true,
              targetGroupId,
            },
          }
        : null;
    }
    const brushCandidate = this.createDuplicationCandidate(brushIds, ids);
    let after = brushCandidate?.document ?? this.currentDocument;
    const pointEntityIds = new Set(entityIds);
    const pointEntities = pointEntitiesInDocument(this.currentDocument).filter((entity) =>
      pointEntityIds.has(entity.id),
    );
    if (pointEntities.length !== pointEntityIds.size) {
      throw new Error('The duplication selection contains an unknown point entity');
    }
    const duplicatedEntities = pointEntities.map<MapEntity>((entity) =>
      Object.assign({}, entity, {
        id: ids.entity(),
        properties: { ...entity.properties },
        primitives: [],
      }),
    );
    for (const entity of duplicatedEntities) after = insertEntity(after, entity);
    after = { ...after, revision: this.currentDocument.revision + 1 };
    const duplicatedBrushIds = brushCandidate?.selectionAfter ?? [];
    const duplicatedEntityIds = duplicatedEntities.map((entity) => entity.id);
    const selectionAfter = createObjectSelection(
      duplicatedBrushIds,
      duplicatedEntityIds,
      selection.entityId && duplicatedEntityIds.length > 0
        ? { kind: 'entity', entityId: duplicatedEntityIds.at(-1)! }
        : duplicatedBrushIds.length > 0
          ? { kind: 'brush', brushId: duplicatedBrushIds.at(-1)! }
          : { kind: 'entity', entityId: duplicatedEntityIds.at(-1)! },
    );
    const count = brushIds.length + entityIds.length;
    const subject =
      brushIds.length > 0 && entityIds.length > 0
        ? 'object'
        : entityIds.length > 0
          ? 'entity'
          : 'brush';
    return {
      label:
        count === 1
          ? `Duplicate ${subject}`
          : `Duplicate ${subject === 'brush' ? 'brushes' : `${subject}s`}`,
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter,
      document: after,
      repeatable: {
        kind: 'duplicate',
        delta: [0, 0, 0],
        textureLock: true,
        targetGroupId,
      },
    };
  }

  /** Translates stable duplicates from their original locations without accumulating preview drift. */
  public translateObjectDuplicationCandidate(
    base: DocumentEditCandidate,
    delta: Vec3,
    textureLock = true,
    label = base.label,
  ): DocumentEditCandidate {
    if (base.baseDocumentRevision !== this.currentDocument.revision) {
      throw new Error('Cannot translate a duplication candidate from a stale document revision');
    }
    if (!base.selectionAfter) throw new Error('A duplication candidate requires a selection');
    let after = translatedObjects(base.after, base.selectionAfter, delta, textureLock);
    after = transformEditorGroupSubtreeMetadata(
      after,
      base.selectionAfter.groupId,
      translationAffineMatrix(delta),
    );
    return {
      ...base,
      label,
      after: { ...after, revision: this.currentDocument.revision + 1 },
      document: { ...after, revision: this.currentDocument.revision + 1 },
      ...(base.repeatable?.kind === 'duplicate'
        ? {
            repeatable: {
              ...base.repeatable,
              delta: [...delta] as Vec3,
              textureLock,
            },
          }
        : {}),
    };
  }

  /** Translates an in-place batch candidate without changing its generated brush or face IDs. */
  public translateBatchCreationCandidate(
    base: BrushBatchCreationCandidate,
    delta: Vec3,
    textureLock = true,
    label = base.label,
  ): BrushBatchCreationCandidate {
    if (base.baseDocumentRevision !== this.currentDocument.revision) {
      throw new Error('Cannot translate a batch candidate from a stale document revision');
    }
    if (!delta.every(Number.isFinite)) throw new Error('Duplication translation must be finite');
    const insertions = base.insertions.map<BrushInsertion>((insertion) => ({
      ...insertion,
      brush: {
        ...translateBrush(insertion.brush, delta, textureLock),
        revision: insertion.brush.revision,
      },
    }));
    return {
      ...base,
      label,
      insertions,
      document: insertBrushes(this.currentDocument, insertions),
    };
  }

  public duplicateSelected(
    ids: IdFactory,
    delta: Vec3 = [16, 16, 0],
    textureLock = true,
    targetGroupId: string | null = null,
  ): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const base = this.createObjectDuplicationCandidate(this.currentSelection, ids, targetGroupId);
    if (!base) return false;
    this.commitDocumentCandidate(
      this.translateObjectDuplicationCandidate(base, delta, textureLock),
    );
    return true;
  }

  /** Clones every object in a parseable clipboard map with fresh IDs as one document transaction. */
  public createPasteCandidate(
    clipboard: MapDocument,
    ids: IdFactory,
    delta: Vec3 = [0, 0, 0],
    textureLock = true,
    targetGroupId: string | null = null,
    targetLayerId: EditorLayerId = this.currentLayerId,
  ): DocumentEditCandidate | null {
    if (!delta.every(Number.isFinite)) throw new Error('Clipboard translation must be finite');
    const sourceWorldspawn = clipboard.entities.find(
      (entity) => entity.properties.classname?.toLowerCase() === 'worldspawn',
    );
    if (!sourceWorldspawn) throw new Error('Clipboard map has no worldspawn entity');
    const destinationWorldspawn = this.currentDocument.entities.find(
      (entity) => entity.properties.classname?.toLowerCase() === 'worldspawn',
    );
    if (!destinationWorldspawn) throw new Error('The map has no worldspawn entity');
    const destinationGroup = targetGroupId
      ? deriveEditorGroups(this.currentDocument).find((group) => group.id === targetGroupId)
      : null;
    if (targetGroupId && !destinationGroup) throw new Error(`Unknown group ${targetGroupId}`);
    const destinationLayer = targetGroupId
      ? null
      : findEditorLayer(this.currentDocument, targetLayerId);
    if (!targetGroupId && !destinationLayer) {
      throw new Error(
        targetLayerId === null ? 'Default Layer is missing' : `Unknown layer ${targetLayerId}`,
      );
    }
    const destinationBrushEntity = destinationGroup
      ? this.currentDocument.entities.find((entity) => entity.id === destinationGroup.entityId)!
      : destinationLayer?.id
        ? this.currentDocument.entities.find((entity) => entity.id === destinationLayer.entityId)!
        : destinationWorldspawn;
    const pointEntities = clipboard.entities.filter(
      (entity) =>
        entity.id !== sourceWorldspawn.id &&
        entity.primitives.length === 0 &&
        !isEditorGroupEntity(entity) &&
        !isEditorLayerEntity(entity),
    );
    const existingNumericGroupIds = [
      ...deriveEditorGroups(this.currentDocument).map((group) => group.id),
      ...deriveEditorLayers(this.currentDocument).flatMap((layer) => (layer.id ? [layer.id] : [])),
    ]
      .map((id) => Number.parseInt(id, 10))
      .filter(Number.isFinite);
    let nextGroupId =
      (existingNumericGroupIds.length > 0 ? Math.max(...existingNumericGroupIds) : 0) + 1;
    const groupIdMap = new Map(
      deriveEditorGroups(clipboard).map((group) => [group.id, String(nextGroupId++)] as const),
    );
    const clipboardBrushes = brushesInDocument(clipboard);
    for (const brush of clipboardBrushes) {
      const derived = deriveBrush(brush);
      if (!derived.valid) {
        throw new Error(
          `Clipboard brush ${brush.id} is invalid: ${derived.diagnostics
            .map((diagnostic) => diagnostic.message)
            .join('; ')}`,
        );
      }
    }
    const brushCount = clipboardBrushes.length;
    if (brushCount + pointEntities.length === 0) return null;
    if (brushCount + pointEntities.length > 1024) {
      throw new Error('A clipboard may contain at most 1024 objects');
    }

    const pastedBrushIds: BrushId[] = [];
    const pastedEntityIds: EntityId[] = [];
    const worldBrushes = [
      ...sourceWorldspawn.primitives,
      ...clipboard.entities.filter(isEditorLayerEntity).flatMap((entity) => entity.primitives),
    ]
      .filter((primitive) => primitive.kind === 'brush')
      .map((brush) => {
        const clone = cloneBrush(brush, ids, delta, textureLock);
        pastedBrushIds.push(clone.id);
        return clone;
      });
    let after = insertBrushes(
      this.currentDocument,
      worldBrushes.map((brush, index) => ({
        entityId: destinationBrushEntity.id,
        insertionIndex: destinationBrushEntity.primitives.length + index,
        brush,
      })),
    );
    for (const sourceEntity of clipboard.entities) {
      if (sourceEntity.id === sourceWorldspawn.id) continue;
      if (isEditorLayerEntity(sourceEntity)) continue;
      const properties = { ...sourceEntity.properties };
      if (isEditorGroupEntity(sourceEntity)) {
        const mappedId = groupIdMap.get(properties['_tb_id'] ?? '');
        if (!mappedId) throw new Error(`Clipboard group ${sourceEntity.id} has no persistent ID`);
        properties['_tb_id'] = mappedId;
      }
      if (properties['_tb_group']) {
        const mappedParent = groupIdMap.get(properties['_tb_group']);
        if (mappedParent) properties['_tb_group'] = mappedParent;
        else if (targetGroupId) properties['_tb_group'] = targetGroupId;
        else delete properties['_tb_group'];
      } else if (targetGroupId) properties['_tb_group'] = targetGroupId;
      if (properties['_tb_group']) delete properties['_tb_layer'];
      else if (targetLayerId) properties['_tb_layer'] = targetLayerId;
      else delete properties['_tb_layer'];
      if ('origin' in properties) {
        const origin = parseEntityOrigin(sourceEntity);
        if (!origin) throw new Error(`Clipboard entity ${sourceEntity.id} has an invalid origin`);
        properties.origin = formatEntityOrigin([
          origin[0] + delta[0],
          origin[1] + delta[1],
          origin[2] + delta[2],
        ]);
      } else if (sourceEntity.primitives.length === 0 && !isEditorGroupEntity(sourceEntity)) {
        throw new Error(`Clipboard point entity ${sourceEntity.id} has no origin`);
      }
      const brushes = sourceEntity.primitives
        .filter((primitive) => primitive.kind === 'brush')
        .map((brush) => {
          const clone = cloneBrush(brush, ids, delta, textureLock);
          pastedBrushIds.push(clone.id);
          return clone;
        });
      const entity: MapEntity = {
        id: ids.entity(),
        properties,
        primitives: brushes,
      };
      after = insertEntity(after, entity);
      if (brushes.length === 0 && !isEditorGroupEntity(entity)) pastedEntityIds.push(entity.id);
    }
    for (const pastedGroupId of groupIdMap.values()) {
      after = transformEditorGroupMetadata(after, pastedGroupId, translationAffineMatrix(delta));
    }
    after = normalizeSingleLinkedGroups(after);
    after = { ...after, revision: this.currentDocument.revision + 1 };
    let selectionAfter = createObjectSelection(
      pastedBrushIds,
      pastedEntityIds,
      pastedEntityIds.length > 0
        ? { kind: 'entity', entityId: pastedEntityIds.at(-1)! }
        : { kind: 'brush', brushId: pastedBrushIds.at(-1)! },
    );
    const selectedPastedGroup = selectedEditorGroup(after, selectionAfter);
    if (selectionAfter && selectedPastedGroup) {
      selectionAfter = { ...selectionAfter, groupId: selectedPastedGroup.id };
    }
    const count = pastedBrushIds.length + pastedEntityIds.length;
    return {
      label: count === 1 ? 'Paste object' : 'Paste objects',
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter,
      document: after,
    };
  }

  public pasteObjects(
    clipboard: MapDocument,
    ids: IdFactory,
    delta: Vec3 = [0, 0, 0],
    textureLock = true,
    targetGroupId: string | null = null,
    targetLayerId: EditorLayerId = this.currentLayerId,
  ): boolean {
    const candidate = this.createPasteCandidate(
      clipboard,
      ids,
      delta,
      textureLock,
      targetGroupId,
      targetLayerId,
    );
    if (!candidate) return false;
    this.commitDocumentCandidate(candidate);
    return true;
  }

  public deleteSelected(): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const selectedGroup = selectedEditorGroup(this.currentDocument, this.currentSelection);
    if (selectedGroup) {
      const after = normalizeSingleLinkedGroups(
        deleteEditorGroup(this.currentDocument, selectedGroup.id),
      );
      this.commitDocumentCandidate({
        label: 'Delete group',
        baseDocumentRevision: this.currentDocument.revision,
        before: this.currentDocument,
        after,
        selectionBefore: this.currentSelection,
        selectionAfter: null,
        document: after,
      });
      return true;
    }
    const brushIds = selectedBrushIds(this.currentSelection);
    const entityIds = selectedPointEntityIds(this.currentSelection);
    if (entityIds.length > 0) {
      let after = this.currentDocument;
      if (brushIds.length > 0) after = removeBrushes(after, brushIds);
      after = removeEntities(after, entityIds);
      after = { ...after, revision: this.currentDocument.revision + 1 };
      this.commitDocumentCandidate({
        label: brushIds.length + entityIds.length === 1 ? 'Delete object' : 'Delete objects',
        baseDocumentRevision: this.currentDocument.revision,
        before: this.currentDocument,
        after,
        selectionBefore: this.currentSelection,
        selectionAfter: null,
        document: after,
      });
      return true;
    }
    if (brushIds.length === 1) return this.deleteBrush(brushIds[0]!);
    const selectedIds = new Set(brushIds);
    const insertions = this.currentDocument.entities.flatMap((entity) =>
      entity.primitives.flatMap((brush, insertionIndex) =>
        brush.kind === 'brush' && selectedIds.has(brush.id)
          ? [{ entityId: entity.id, insertionIndex, brush }]
          : [],
      ),
    );
    if (insertions.length !== selectedIds.size) return false;
    if (this.hasLinkedEditingGroup()) {
      const after = removeBrushes(this.currentDocument, brushIds);
      this.commitDocumentCandidate({
        label: 'Delete brushes',
        baseDocumentRevision: this.currentDocument.revision,
        before: this.currentDocument,
        after,
        selectionBefore: this.currentSelection,
        selectionAfter: null,
        document: after,
      });
      return true;
    }
    this.currentDocument = removeBrushes(this.currentDocument, brushIds);
    this.currentSelection = null;
    this.history.record({
      kind: 'delete-brushes',
      label: 'Delete brushes',
      insertions,
    });
    this.notify('document', 'Delete brushes');
    return true;
  }

  public deleteBrush(brushId: BrushId): boolean {
    const owner = this.currentDocument.entities.find((entity) =>
      entity.primitives.some((brush) => brush.id === brushId),
    );
    if (!owner) return false;
    const insertionIndex = owner.primitives.findIndex((brush) => brush.id === brushId);
    const brush = owner.primitives[insertionIndex];
    if (!brush || brush.kind !== 'brush') return false;
    if (this.hasLinkedEditingGroup()) {
      const after = removeBrush(this.currentDocument, brushId);
      this.commitDocumentCandidate({
        label: 'Delete brush',
        baseDocumentRevision: this.currentDocument.revision,
        before: this.currentDocument,
        after,
        selectionBefore: this.currentSelection,
        selectionAfter: null,
        document: after,
      });
      return true;
    }
    this.currentDocument = removeBrush(this.currentDocument, brushId);
    if (this.currentSelection?.brushId === brushId) this.currentSelection = null;
    this.history.record({
      kind: 'delete-brush',
      label: 'Delete brush',
      entityId: owner.id,
      insertionIndex,
      brush,
    });
    this.notify('document', 'Delete brush');
    return true;
  }

  public setEntityProperty(
    entityId: EntityId,
    key: string,
    value: string | null,
    protect = false,
  ): boolean {
    const entity = this.currentDocument.entities.find((candidate) => candidate.id === entityId);
    if (!entity) return false;
    const normalizedKey = key.trim();
    if (normalizedKey.length === 0) throw new Error('Entity property keys cannot be empty');
    if (/[\r\n]/.test(normalizedKey)) {
      throw new Error('Entity property keys cannot contain line breaks');
    }
    if (value === null && !(normalizedKey in entity.properties) && !protect) return false;
    if (value !== null && entity.properties[normalizedKey] === value && !protect) return false;
    const beforeDocument = this.currentDocument;
    let workingDocument = this.currentDocument;
    if (protect) {
      if (!this.editingGroupId) throw new Error('Open a linked group before protecting a property');
      workingDocument = setLinkedEntityPropertyProtection(
        workingDocument,
        this.editingGroupId,
        entityId,
        normalizedKey,
        true,
      );
    }
    const workingEntity = workingDocument.entities.find((candidate) => candidate.id === entityId)!;
    const before = entity.properties;
    const after = { ...workingEntity.properties };
    let label = 'Update entity property';
    if (value === null) {
      delete after[normalizedKey];
      label = 'Remove entity property';
    } else {
      if (!(normalizedKey in before)) label = 'Add entity property';
      after[normalizedKey] = value;
    }
    const changedDocument = replaceEntityProperties(workingDocument, entityId, after);
    if (this.hasLinkedEditingGroup(changedDocument)) {
      this.commitDocumentCandidate({
        label,
        baseDocumentRevision: this.currentDocument.revision,
        before: beforeDocument,
        after: changedDocument,
        selectionBefore: this.currentSelection,
        selectionAfter: this.currentSelection,
        document: changedDocument,
      });
      return true;
    }
    this.currentDocument = changedDocument;
    this.history.record({
      kind: 'replace-entity-properties',
      label,
      entityId,
      before,
      after,
    });
    this.notify('document', label);
    return true;
  }

  public setEntityPropertyProtected(entityId: EntityId, key: string, protect: boolean): boolean {
    if (!this.editingGroupId) return false;
    const entity = this.currentDocument.entities.find((candidate) => candidate.id === entityId);
    if (!entity) return false;
    const beforeProtected = entity.properties['_tb_protected_properties'] ?? '';
    const after = setLinkedEntityPropertyProtection(
      this.currentDocument,
      this.editingGroupId,
      entityId,
      key,
      protect,
    );
    const updated = after.entities.find((candidate) => candidate.id === entityId)!;
    if (
      beforeProtected === (updated.properties['_tb_protected_properties'] ?? '') &&
      entity.properties[key] === updated.properties[key]
    ) {
      return false;
    }
    this.commitDocumentCandidate({
      label: protect ? 'Protect entity property' : 'Unprotect entity property',
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: this.currentSelection,
      document: after,
    });
    return true;
  }

  public applyMaterial(material: string, selection = this.currentSelection): boolean {
    const candidate = this.createMaterialCandidate(material, selection);
    if (!candidate) return false;
    this.commitCandidate(candidate);
    return true;
  }

  /** Selects every visible, editable face using a material token. */
  public selectFacesUsingMaterial(material: string): EditorSelection | null {
    const editableBrushIds = new Set(this.editableObjectIds().brushIds);
    const faces = faceReferencesWithMaterial(this.currentDocument, material, editableBrushIds);
    this.discardRepeatableCommands();
    this.currentSelection = createFaceSelection(faces);
    this.notify(
      'selection',
      faces.length > 0
        ? `Select ${faces.length} ${faces.length === 1 ? 'face' : 'faces'} using ${material.trim()}`
        : `No visible faces use ${material.trim()}`,
    );
    return this.currentSelection;
  }

  /** Selects every visible, editable brush containing a material token. */
  public selectBrushesUsingMaterial(material: string): EditorSelection | null {
    const editableBrushIds = new Set(this.editableObjectIds().brushIds);
    const brushIds = brushIdsWithMaterial(this.currentDocument, material, editableBrushIds);
    return this.setObjectSelection(
      brushIds,
      [],
      brushIds.length > 0
        ? `Select ${brushIds.length} ${brushIds.length === 1 ? 'brush' : 'brushes'} using ${material.trim()}`
        : `No visible brushes use ${material.trim()}`,
    );
  }

  /** Builds one document transaction that replaces a material globally or within the selection. */
  public createMaterialReplacementCandidate(
    sourceMaterial: string,
    replacementMaterial: string,
    selection = this.currentSelection,
  ): DocumentEditCandidate | null {
    const source = sourceMaterial.trim();
    const replacement = replacementMaterial.trim();
    if (!source || !replacement || source.toLowerCase() === replacement.toLowerCase()) return null;

    const matchingFaces = faceReferencesWithMaterial(this.currentDocument, source);
    const scopedFaces = selection?.faceId
      ? (() => {
          const selected = new Set(
            selectedFaceReferences(selection).map((face) => `${face.brushId}\u0000${face.faceId}`),
          );
          return matchingFaces.filter((face) =>
            selected.has(`${face.brushId}\u0000${face.faceId}`),
          );
        })()
      : selection
        ? (() => {
            const selected = new Set(selectedBrushIds(selection));
            return matchingFaces.filter((face) => selected.has(face.brushId));
          })()
        : matchingFaces;
    if (scopedFaces.length === 0) return null;

    const byBrush = new Map<BrushId, FaceId[]>();
    for (const face of scopedFaces) {
      const faceIds = byBrush.get(face.brushId) ?? [];
      faceIds.push(face.faceId);
      byBrush.set(face.brushId, faceIds);
    }
    const replacements = [...byBrush].map(([brushId, faceIds]) => {
      const brush = findBrush(this.currentDocument, brushId);
      if (!brush) throw new Error(`Unknown material replacement brush ${brushId}`);
      return setBrushFaceMaterials(brush, replacement, faceIds);
    });
    const after = replaceBrushes(this.currentDocument, replacements);
    return {
      label: `Replace material ${source} → ${replacement}`,
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: createFaceSelection(scopedFaces),
      document: after,
    };
  }

  /** Replaces matching materials and selects the changed faces as one undoable edit. */
  public replaceMaterial(
    sourceMaterial: string,
    replacementMaterial: string,
    selection = this.currentSelection,
  ): number {
    const candidate = this.createMaterialReplacementCandidate(
      sourceMaterial,
      replacementMaterial,
      selection,
    );
    if (!candidate) return 0;
    const changedFaceCount = selectedFaceReferences(candidate.selectionAfter).length;
    this.commitDocumentCandidate(candidate);
    return changedFaceCount;
  }
}
