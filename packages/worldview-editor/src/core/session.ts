import {
  addBrushVertex,
  alignFaceTexture,
  clipBrush,
  cloneBrush,
  convexMergeBrushes,
  createBrushEntity as createBrushEntityInDocument,
  deleteBrushVertices,
  flipBrush,
  insertBrush,
  insertBrushes,
  insertEntity,
  hollowBrush,
  intersectBrushes,
  moveBrushFace,
  moveBrushVertices,
  moveBrushesToEntity,
  removeBrush,
  removeBrushes,
  removeEntities,
  replaceBrush,
  replaceBrushes,
  replaceBrushSequence,
  replaceBrushSequences,
  replaceEntityProperties,
  replaceEntities,
  rotateBrush,
  rotateBrushVertices,
  scaleBrush,
  scaleBrushVertices,
  setBrushFaceMaterials,
  setBrushMaterial,
  setFaceTextureTransform,
  transformFaceTexture,
  shearBrush,
  shearBrushVertices,
  splitBrushFace,
  subtractBrush,
  transferFaceAttributes,
  translateBrush,
  type FaceAttributeTransferMode,
  type FaceTextureAlignmentOperation,
  type FaceTextureAlignmentOptions,
  type FaceTextureTransform,
  type FaceTextureTransformDelta,
  type TransformAxis,
  type BrushInsertion,
  type BrushSequenceReplacement,
} from './document.js';
import { createObjectClipboardDocument, type FaceAttributeClipboard } from './clipboard.js';
import { brushVertices, deriveBrush } from './geometry.js';
import {
  deriveEditorGroups,
  deleteEditorGroup,
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
  flipAffineMatrix,
  linkedGroupSiblings,
  normalizeSingleLinkedGroups,
  rotationAffineMatrix,
  scaleAffineMatrix,
  setEntityPropertyProtection as setLinkedEntityPropertyProtection,
  shearAffineMatrix,
  synchronizeLinkedGroupContents,
  transformEditorGroupMetadata,
  transformEditorGroupSubtreeMetadata,
  translationAffineMatrix,
  unlinkEditorGroup,
  type AffineMatrix,
} from './linked-groups.js';
import {
  applyEditorIssueFix,
  deriveEditorIssues,
  selectionForEditorIssue,
  type EditorIssue,
} from './issues.js';
import { brushIdsWithMaterial, faceReferencesWithMaterial } from './material-usage.js';
import {
  createEditorLayer,
  deriveEditorLayers,
  editorLayerForSelection,
  findEditorLayer,
  isEditorLayerEntity,
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
  formatEntityOrigin,
  flipPointEntity,
  parseEntityOrigin,
  pointEntityDefinition,
  pointEntitiesInDocument,
  rotatePointEntity,
  transformPointEntityAffine,
} from './point-entities.js';
import { stampBrushFace, sweepBrushFace, type SweepOptions, type SweepTransform } from './sweep.js';
import {
  DEFAULT_EDITOR_VIEW_FILTER_STATE,
  deriveEditorViewFilterObjectIds,
  EDITOR_SPECIAL_BRUSH_FILTER_INFO,
  entityClassFiltersInDocument,
  type EditorSpecialBrushFilter,
  type EditorViewFilterObjectIds,
  type EditorViewFilterState,
} from './view-filters.js';
import {
  connectedCoplanarFaces,
  createBrushSelection,
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
  EditorObjectViewState,
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
import { brushesInDocument, createSequentialIdFactory, findBrush } from './types.js';

export interface EditorSessionChange {
  readonly kind: 'document' | 'selection' | 'history' | 'view';
  readonly label: string;
  readonly documentRevision: number;
}

export interface SelectionBrushSelectionResult {
  readonly removedBrushCount: number;
  readonly selectedBrushCount: number;
  readonly selectedEntityCount: number;
  readonly selection: EditorSelection | null;
}

type ChangeListener = (change: EditorSessionChange) => void;

interface BrushHistoryEntry {
  readonly kind: 'replace-brush';
  readonly label: string;
  readonly brushId: BrushId;
  readonly before: MapBrush;
  readonly after: MapBrush;
}

interface BrushBatchHistoryEntry {
  readonly kind: 'replace-brushes';
  readonly label: string;
  readonly edits: readonly BrushEdit[];
}

interface BrushCreationHistoryEntry {
  readonly kind: 'create-brush';
  readonly label: string;
  readonly entityId: EntityId;
  readonly insertionIndex: number;
  readonly brush: MapBrush;
}

interface BrushDeletionHistoryEntry {
  readonly kind: 'delete-brush';
  readonly label: string;
  readonly entityId: EntityId;
  readonly insertionIndex: number;
  readonly brush: MapBrush;
}

interface BrushBatchCreationHistoryEntry {
  readonly kind: 'create-brushes';
  readonly label: string;
  readonly insertions: readonly BrushInsertion[];
  readonly selectionBefore?: EditorSelection | null;
  readonly selectionAfter?: readonly BrushId[];
}

interface BrushBatchDeletionHistoryEntry {
  readonly kind: 'delete-brushes';
  readonly label: string;
  readonly insertions: readonly BrushInsertion[];
}

interface BrushClipHistoryEntry {
  readonly kind: 'clip-brush';
  readonly label: string;
  readonly entityId: EntityId;
  readonly insertionIndex: number;
  readonly before: MapBrush;
  readonly after: readonly MapBrush[];
}

interface BrushBatchClipHistoryEntry {
  readonly kind: 'clip-brushes';
  readonly label: string;
  readonly edits: readonly BrushClipEdit[];
  readonly selectionBefore: readonly BrushId[];
  readonly selectionAfter: readonly BrushId[];
}

interface BrushSequenceHistoryEntry {
  readonly kind: 'replace-brush-sequences';
  readonly label: string;
  readonly edits: readonly BrushClipEdit[];
  readonly selectionBefore: readonly BrushId[];
  readonly selectionAfter: readonly BrushId[];
}

interface EntityPropertiesHistoryEntry {
  readonly kind: 'replace-entity-properties';
  readonly label: string;
  readonly entityId: EntityId;
  readonly before: Readonly<Record<string, string>>;
  readonly after: Readonly<Record<string, string>>;
}

interface DocumentSnapshotHistoryEntry {
  readonly kind: 'replace-document';
  readonly label: string;
  readonly before: MapDocument;
  readonly after: MapDocument;
  readonly selectionBefore: EditorSelection | null;
  readonly selectionAfter: EditorSelection | null;
}

interface ObjectViewStateHistoryEntry {
  readonly kind: 'view-state';
  readonly label: string;
  readonly before: EditorObjectViewState;
  readonly after: EditorObjectViewState;
  readonly selectionBefore: EditorSelection | null;
  readonly selectionAfter: EditorSelection | null;
}

type HistoryEntry =
  | BrushHistoryEntry
  | BrushBatchHistoryEntry
  | BrushCreationHistoryEntry
  | BrushDeletionHistoryEntry
  | BrushBatchCreationHistoryEntry
  | BrushBatchDeletionHistoryEntry
  | BrushClipHistoryEntry
  | BrushBatchClipHistoryEntry
  | BrushSequenceHistoryEntry
  | EntityPropertiesHistoryEntry
  | DocumentSnapshotHistoryEntry
  | ObjectViewStateHistoryEntry;

export interface BrushEditCandidate {
  readonly label: string;
  readonly brushId: BrushId;
  readonly baseDocumentRevision: number;
  readonly baseBrushRevision: number;
  readonly before: MapBrush;
  readonly after: MapBrush;
  /** A derived preview document. The session remains unchanged until commitCandidate is called. */
  readonly document: MapDocument;
}

export interface BrushEdit {
  readonly brushId: BrushId;
  readonly baseBrushRevision: number;
  readonly before: MapBrush;
  readonly after: MapBrush;
}

export interface BrushBatchEditCandidate {
  readonly label: string;
  readonly baseDocumentRevision: number;
  readonly edits: readonly BrushEdit[];
  /** A derived preview document. The session remains unchanged until commitCandidate is called. */
  readonly document: MapDocument;
}

export interface BrushCreationCandidate {
  readonly label: string;
  readonly entityId: EntityId;
  readonly insertionIndex: number;
  readonly baseDocumentRevision: number;
  readonly brush: MapBrush;
  /** A derived preview document. The session remains unchanged until commitCreationCandidate. */
  readonly document: MapDocument;
}

export interface BrushBatchCreationCandidate {
  readonly label: string;
  readonly baseDocumentRevision: number;
  readonly insertions: readonly BrushInsertion[];
  readonly selectionBefore: EditorSelection | null;
  readonly selectionAfter: readonly BrushId[];
  /** A derived preview document. The session remains unchanged until commitBatchCreationCandidate. */
  readonly document: MapDocument;
}

/** Object-edit commands that can be replayed as TrenchBroom-style command repetition. */
export type EditorRepeatableCommand =
  | {
      readonly kind: 'duplicate';
      readonly delta: Vec3;
      readonly textureLock: boolean;
      readonly targetGroupId: string | null;
    }
  | { readonly kind: 'translate'; readonly delta: Vec3; readonly textureLock: boolean }
  | {
      readonly kind: 'rotate';
      readonly pivot: Vec3;
      readonly axis: TransformAxis;
      readonly degrees: number;
      readonly textureLock: boolean;
      readonly updateEntityAngles: boolean;
    }
  | {
      readonly kind: 'flip';
      readonly pivot: Vec3;
      readonly axis: TransformAxis;
      readonly textureLock: boolean;
      readonly updateEntityAngles: boolean;
    }
  | {
      readonly kind: 'scale';
      readonly pivot: Vec3;
      readonly factors: Vec3;
      readonly textureLock: boolean;
      readonly updateEntityAngles: boolean;
    }
  | {
      readonly kind: 'shear';
      readonly pivot: Vec3;
      readonly sourceAxis: TransformAxis;
      readonly targetAxis: TransformAxis;
      readonly factor: number;
      readonly textureLock: boolean;
      readonly updateEntityAngles: boolean;
    };

/** A stable whole-document preview used when an edit spans brushes and point entities. */
export interface DocumentEditCandidate {
  readonly label: string;
  readonly baseDocumentRevision: number;
  readonly before: MapDocument;
  readonly after: MapDocument;
  readonly selectionBefore: EditorSelection | null;
  readonly selectionAfter: EditorSelection | null;
  readonly document: MapDocument;
  /** Present when this candidate should join the current command-repetition sequence. */
  readonly repeatable?: EditorRepeatableCommand;
}

export interface SweepCandidate extends BrushBatchCreationCandidate {
  /** Deduplicated source faces used to produce this preview. */
  readonly sourceFaces: readonly FaceSelection[];
  /** Final cap for each source face, used by the 3D Sweep manipulator. */
  readonly destinationCaps: readonly (readonly Vec3[])[];
}

export type BrushClipMode = 'back' | 'split' | 'front';

export interface BrushClipCandidate {
  readonly label: string;
  readonly mode: BrushClipMode;
  readonly entityId: EntityId;
  readonly insertionIndex: number;
  readonly baseDocumentRevision: number;
  readonly baseBrushRevision: number;
  readonly before: MapBrush;
  readonly after: readonly MapBrush[];
  /** A derived preview document. The session remains unchanged until commitClipCandidate. */
  readonly document: MapDocument;
}

export interface BrushClipEdit {
  readonly entityId: EntityId;
  readonly insertionIndex: number;
  readonly afterInsertionIndex: number;
  readonly baseBrushRevision: number;
  readonly before: MapBrush;
  readonly after: readonly MapBrush[];
}

export interface BrushBatchClipCandidate {
  readonly label: string;
  readonly mode: BrushClipMode;
  readonly baseDocumentRevision: number;
  readonly edits: readonly BrushClipEdit[];
  readonly selectionBefore: readonly BrushId[];
  readonly selectionAfter: readonly BrushId[];
  /** A derived preview document. The session remains unchanged until commitClipCandidate. */
  readonly document: MapDocument;
}

export interface BrushSequenceCandidate {
  readonly label: string;
  readonly baseDocumentRevision: number;
  readonly edits: readonly BrushClipEdit[];
  readonly selectionBefore: readonly BrushId[];
  readonly selectionAfter: readonly BrushId[];
  /** A derived preview document. The session remains unchanged until commitSequenceCandidate. */
  readonly document: MapDocument;
}

function revisionForApply(current: MapBrush, content: MapBrush): MapBrush {
  return { ...content, revision: current.revision + 1 };
}

function documentRevisionForApply(current: MapDocument, content: MapDocument): MapDocument {
  return { ...content, revision: current.revision + 1 };
}

function faceSelectionKey(face: FaceSelection): string {
  return `${face.brushId}\u0000${face.faceId}`;
}

function translatedObjects(
  document: MapDocument,
  selection: EditorSelection,
  delta: Vec3,
  textureLock: boolean,
): MapDocument {
  let translated = document;
  const brushIds = selectedBrushIds(selection);
  if (brushIds.length > 0) {
    const brushes = brushIds.map((brushId) => {
      const brush = findBrush(document, brushId);
      if (!brush) throw new Error(`Unknown brush ${brushId}`);
      return translateBrush(brush, delta, textureLock);
    });
    translated = replaceBrushes(translated, brushes);
  }
  const entityIds = selectedPointEntityIds(selection);
  if (entityIds.length > 0) {
    const entities = entityIds.map((entityId) => {
      const entity = document.entities.find((candidate) => candidate.id === entityId);
      if (!entity) throw new Error(`Unknown point entity ${entityId}`);
      const origin = parseEntityOrigin(entity);
      if (!origin || entity.brushes.length > 0)
        throw new Error(`Entity ${entityId} is not a point entity`);
      return Object.assign({}, entity, {
        properties: {
          ...entity.properties,
          origin: formatEntityOrigin([
            origin[0] + delta[0],
            origin[1] + delta[1],
            origin[2] + delta[2],
          ]),
        },
      });
    });
    translated = replaceEntities(translated, entities);
  }
  return { ...translated, revision: document.revision + 1 };
}

function transformedObjects(
  document: MapDocument,
  selection: EditorSelection,
  transformBrush: (brush: MapBrush) => MapBrush,
  transformEntity: (entity: MapEntity) => MapEntity,
): MapDocument {
  let transformed = document;
  const brushIds = selectedBrushIds(selection);
  if (brushIds.length > 0) {
    const brushes = brushIds.map((brushId) => {
      const brush = findBrush(document, brushId);
      if (!brush) throw new Error(`Unknown brush ${brushId}`);
      return transformBrush(brush);
    });
    transformed = replaceBrushes(transformed, brushes);
  }
  const entityIds = selectedPointEntityIds(selection);
  if (entityIds.length > 0) {
    const entities = entityIds.map((entityId) => {
      const entity = document.entities.find((candidate) => candidate.id === entityId);
      if (!entity) throw new Error(`Unknown point entity ${entityId}`);
      return transformEntity(entity);
    });
    transformed = replaceEntities(transformed, entities);
  }
  return { ...transformed, revision: document.revision + 1 };
}

function transformPointEntityByAffine(
  entity: MapEntity,
  matrix: AffineMatrix,
  updateAngles = true,
): MapEntity {
  return transformPointEntityAffine(
    entity,
    [
      [matrix[0], matrix[1], matrix[2]],
      [matrix[4], matrix[5], matrix[6]],
      [matrix[8], matrix[9], matrix[10]],
    ],
    [matrix[3], matrix[7], matrix[11]],
    updateAngles,
  );
}

function objectTransformLabel(
  verb: 'Rotate' | 'Flip' | 'Scale' | 'Shear',
  brushCount: number,
  entityCount: number,
): string {
  const count = brushCount + entityCount;
  if (brushCount > 0 && entityCount > 0) return `${verb} objects`;
  if (entityCount > 0) return `${verb} ${count === 1 ? 'entity' : 'entities'}`;
  return `${verb} ${count === 1 ? 'brush' : 'brushes'}`;
}

function repeatableCommandLabel(command: EditorRepeatableCommand): string {
  switch (command.kind) {
    case 'duplicate':
      return 'Duplicate';
    case 'translate':
      return 'Move';
    case 'rotate':
      return 'Rotate';
    case 'flip':
      return 'Flip';
    case 'scale':
      return 'Scale';
    case 'shear':
      return 'Shear';
  }
}

export class EditorSession {
  private readonly listeners = new Set<ChangeListener>();
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private currentDocument: MapDocument;
  private currentSelection: EditorSelection | null = null;
  private hiddenBrushIds = new Set<BrushId>();
  private hiddenEntityIds = new Set<EntityId>();
  private lockedBrushIds = new Set<BrushId>();
  private lockedEntityIds = new Set<EntityId>();
  private editingGroupId: string | null = null;
  private currentLayerId: EditorLayerId = null;
  private readonly linkedSyncIds = createSequentialIdFactory('worldview-linked-sync');
  private readonly issueFixIds = createSequentialIdFactory('worldview-issue-fix');
  private currentViewFilters: EditorViewFilterState = DEFAULT_EDITOR_VIEW_FILTER_STATE;
  private repeatableCommands: EditorRepeatableCommand[] = [];
  private repeatSequence = 0;
  private suppressRepeatRecording = false;

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

  private setViewFilters(after: EditorViewFilterState, label: string): boolean {
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
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  public get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
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

  private discardRepeatableCommands(): void {
    this.repeatableCommands = [];
  }

  /** Explicitly starts a new macro-like command-repetition sequence. */
  public clearRepeatableCommands(): boolean {
    if (this.repeatableCommands.length === 0) return false;
    this.discardRepeatableCommands();
    this.notify('view', 'Clear repeatable commands');
    return true;
  }

  private recordRepeatableCommand(command: EditorRepeatableCommand | undefined): void {
    if (!command || this.suppressRepeatRecording) return;
    this.repeatableCommands.push(command);
  }

  private applyRepeatableCommand(
    target: EditorSession,
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
    const replay = new EditorSession(this.currentDocument);
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
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.notify('document', label);
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

  private activeLayerEntity(document = this.currentDocument): MapEntity {
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

  private commitLayerChange(
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

  private hasLinkedEditingGroup(document = this.currentDocument): boolean {
    return Boolean(
      this.editingGroupId && linkedGroupSiblings(document, this.editingGroupId).length > 1,
    );
  }

  private synchronizeEditingGroup(document: MapDocument): MapDocument {
    return this.editingGroupId && linkedGroupSiblings(document, this.editingGroupId).length > 1
      ? synchronizeLinkedGroupContents(document, this.editingGroupId, this.linkedSyncIds)
      : document;
  }

  /** Wraps the current object selection in a TrenchBroom-compatible named group. */
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

  private isBrushUnavailable(brushId: BrushId): boolean {
    const state = this.objectViewState;
    return state.hiddenBrushIds.includes(brushId) || state.lockedBrushIds.includes(brushId);
  }

  private isEntityUnavailable(entityId: EntityId): boolean {
    const state = this.objectViewState;
    return state.hiddenEntityIds.includes(entityId) || state.lockedEntityIds.includes(entityId);
  }

  private editableObjectIds(): {
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

  private setObjectSelection(
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

  private expandSelectionQueryGroups(
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

  public translateSelected(delta: Vec3, textureLock = true): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const candidate = this.createObjectTranslationCandidate(
      this.currentSelection,
      delta,
      textureLock,
    );
    if (!candidate) return false;
    this.commitDocumentCandidate(candidate);
    return true;
  }

  public translate(brushId: BrushId, delta: Vec3, textureLock = true): boolean {
    if (delta.every((component) => Math.abs(component) <= Number.EPSILON)) return false;
    const candidate = this.createTranslationCandidate(brushId, delta, textureLock);
    if (!candidate) return false;
    this.commitCandidate(candidate);
    return true;
  }

  public createTranslationCandidate(
    brushId: BrushId,
    delta: Vec3,
    textureLock = true,
  ): BrushEditCandidate | null {
    const before = findBrush(this.currentDocument, brushId);
    if (!before) return null;
    const after = translateBrush(before, delta, textureLock);
    const derived = deriveBrush(after);
    if (!derived.valid) {
      throw new Error(derived.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
    }
    return {
      label: 'Move brush',
      brushId,
      baseDocumentRevision: this.currentDocument.revision,
      baseBrushRevision: before.revision,
      before,
      after,
      document: replaceBrush(this.currentDocument, after),
    };
  }

  public createBrushSetTranslationCandidate(
    brushIds: readonly BrushId[],
    delta: Vec3,
    textureLock = true,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (delta.every((component) => Math.abs(component) <= Number.EPSILON)) return null;
    return this.createBrushSetTransformCandidate(brushIds, 'Move brush', 'Move brushes', (before) =>
      translateBrush(before, delta, textureLock),
    );
  }

  public createObjectTranslationCandidate(
    selection: EditorSelection,
    delta: Vec3,
    textureLock = true,
  ): DocumentEditCandidate | null {
    if (selection.faceId || delta.every((component) => Math.abs(component) <= Number.EPSILON)) {
      return null;
    }
    const brushCount = selectedBrushIds(selection).length;
    const entityCount = selectedPointEntityIds(selection).length;
    if (brushCount + entityCount === 0) return null;
    let after = translatedObjects(this.currentDocument, selection, delta, textureLock);
    after = transformEditorGroupSubtreeMetadata(
      after,
      selection.groupId,
      translationAffineMatrix(delta),
    );
    const subject =
      brushCount > 0 && entityCount > 0 ? 'object' : entityCount > 0 ? 'entity' : 'brush';
    const count = brushCount + entityCount;
    return {
      label:
        count === 1 ? `Move ${subject}` : `Move ${subject === 'brush' ? 'brushes' : `${subject}s`}`,
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: selection,
      document: after,
      repeatable: { kind: 'translate', delta: [...delta] as Vec3, textureLock },
    };
  }

  public rotateSelected(
    pivot: Vec3,
    axis: TransformAxis,
    degrees: number,
    textureLock = true,
  ): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const candidate = this.createObjectRotationCandidate(
      this.currentSelection,
      pivot,
      axis,
      degrees,
      textureLock,
    );
    if (!candidate) return false;
    this.commitDocumentCandidate(candidate);
    return true;
  }

  public createObjectRotationCandidate(
    selection: EditorSelection,
    pivot: Vec3,
    axis: TransformAxis,
    degrees: number,
    textureLock = true,
    updateEntityAngles = true,
  ): DocumentEditCandidate | null {
    if (selection.faceId || Math.abs(degrees) <= Number.EPSILON) return null;
    const brushCount = selectedBrushIds(selection).length;
    const entityCount = selectedPointEntityIds(selection).length;
    if (brushCount + entityCount === 0) return null;
    let after = transformedObjects(
      this.currentDocument,
      selection,
      (brush) => rotateBrush(brush, pivot, axis, degrees, textureLock),
      (entity) => rotatePointEntity(entity, pivot, axis, degrees, updateEntityAngles),
    );
    after = transformEditorGroupSubtreeMetadata(
      after,
      selection.groupId,
      rotationAffineMatrix(pivot, axis, degrees),
    );
    return {
      label: objectTransformLabel('Rotate', brushCount, entityCount),
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: selection,
      document: after,
      repeatable: {
        kind: 'rotate',
        pivot: [...pivot] as Vec3,
        axis,
        degrees,
        textureLock,
        updateEntityAngles,
      },
    };
  }

  public flipSelected(
    pivot: Vec3,
    axis: TransformAxis,
    textureLock = true,
    updateEntityAngles = true,
  ): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const candidate = this.createObjectFlipCandidate(
      this.currentSelection,
      pivot,
      axis,
      textureLock,
      updateEntityAngles,
    );
    if (!candidate) return false;
    this.commitDocumentCandidate(candidate);
    return true;
  }

  public createObjectFlipCandidate(
    selection: EditorSelection,
    pivot: Vec3,
    axis: TransformAxis,
    textureLock = true,
    updateEntityAngles = true,
  ): DocumentEditCandidate | null {
    if (selection.faceId) return null;
    const brushCount = selectedBrushIds(selection).length;
    const entityCount = selectedPointEntityIds(selection).length;
    if (brushCount + entityCount === 0) return null;
    let after = transformedObjects(
      this.currentDocument,
      selection,
      (brush) => flipBrush(brush, pivot, axis, textureLock),
      (entity) => flipPointEntity(entity, pivot, axis, updateEntityAngles),
    );
    after = transformEditorGroupSubtreeMetadata(
      after,
      selection.groupId,
      flipAffineMatrix(pivot, axis),
    );
    return {
      label: objectTransformLabel('Flip', brushCount, entityCount),
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: selection,
      document: after,
      repeatable: {
        kind: 'flip',
        pivot: [...pivot] as Vec3,
        axis,
        textureLock,
        updateEntityAngles,
      },
    };
  }

  public createRotationCandidate(
    brushId: BrushId,
    pivot: Vec3,
    axis: TransformAxis,
    degrees: number,
    textureLock = true,
  ): BrushEditCandidate | null {
    if (Math.abs(degrees) <= Number.EPSILON) return null;
    return this.createBrushTransformCandidate(brushId, 'Rotate brush', (before) =>
      rotateBrush(before, pivot, axis, degrees, textureLock),
    );
  }

  public createBrushSetRotationCandidate(
    brushIds: readonly BrushId[],
    pivot: Vec3,
    axis: TransformAxis,
    degrees: number,
    textureLock = true,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (Math.abs(degrees) <= Number.EPSILON) return null;
    return this.createBrushSetTransformCandidate(
      brushIds,
      'Rotate brush',
      'Rotate brushes',
      (before) => rotateBrush(before, pivot, axis, degrees, textureLock),
    );
  }

  public scaleSelected(pivot: Vec3, factors: Vec3, textureLock = true): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const candidate = this.createObjectScaleCandidate(
      this.currentSelection,
      pivot,
      factors,
      textureLock,
    );
    if (!candidate) return false;
    this.commitDocumentCandidate(candidate);
    return true;
  }

  public createObjectScaleCandidate(
    selection: EditorSelection,
    pivot: Vec3,
    factors: Vec3,
    textureLock = true,
    updateEntityAngles = true,
  ): DocumentEditCandidate | null {
    if (selection.faceId || factors.every((factor) => Math.abs(factor - 1) <= Number.EPSILON)) {
      return null;
    }
    const brushCount = selectedBrushIds(selection).length;
    const entityCount = selectedPointEntityIds(selection).length;
    if (brushCount + entityCount === 0) return null;
    const affine = scaleAffineMatrix(pivot, factors);
    let after = transformedObjects(
      this.currentDocument,
      selection,
      (brush) => scaleBrush(brush, pivot, factors, textureLock),
      (entity) => transformPointEntityByAffine(entity, affine, updateEntityAngles),
    );
    after = transformEditorGroupSubtreeMetadata(after, selection.groupId, affine);
    return {
      label: objectTransformLabel('Scale', brushCount, entityCount),
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: selection,
      document: after,
      repeatable: {
        kind: 'scale',
        pivot: [...pivot] as Vec3,
        factors: [...factors] as Vec3,
        textureLock,
        updateEntityAngles,
      },
    };
  }

  public createScaleCandidate(
    brushId: BrushId,
    pivot: Vec3,
    factors: Vec3,
    textureLock = true,
  ): BrushEditCandidate | null {
    if (factors.every((factor) => Math.abs(factor - 1) <= Number.EPSILON)) return null;
    return this.createBrushTransformCandidate(brushId, 'Scale brush', (before) =>
      scaleBrush(before, pivot, factors, textureLock),
    );
  }

  public createBrushSetScaleCandidate(
    brushIds: readonly BrushId[],
    pivot: Vec3,
    factors: Vec3,
    textureLock = true,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (factors.every((factor) => Math.abs(factor - 1) <= Number.EPSILON)) return null;
    return this.createBrushSetTransformCandidate(
      brushIds,
      'Scale brush',
      'Scale brushes',
      (before) => scaleBrush(before, pivot, factors, textureLock),
    );
  }

  public shearSelected(
    pivot: Vec3,
    sourceAxis: TransformAxis,
    targetAxis: TransformAxis,
    factor: number,
    textureLock = true,
  ): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const candidate = this.createObjectShearCandidate(
      this.currentSelection,
      pivot,
      sourceAxis,
      targetAxis,
      factor,
      textureLock,
    );
    if (!candidate) return false;
    this.commitDocumentCandidate(candidate);
    return true;
  }

  public createObjectShearCandidate(
    selection: EditorSelection,
    pivot: Vec3,
    sourceAxis: TransformAxis,
    targetAxis: TransformAxis,
    factor: number,
    textureLock = true,
    updateEntityAngles = true,
  ): DocumentEditCandidate | null {
    if (selection.faceId || Math.abs(factor) <= Number.EPSILON) return null;
    const brushCount = selectedBrushIds(selection).length;
    const entityCount = selectedPointEntityIds(selection).length;
    if (brushCount + entityCount === 0) return null;
    const affine = shearAffineMatrix(pivot, sourceAxis, targetAxis, factor);
    let after = transformedObjects(
      this.currentDocument,
      selection,
      (brush) => shearBrush(brush, pivot, sourceAxis, targetAxis, factor, textureLock),
      (entity) => transformPointEntityByAffine(entity, affine, updateEntityAngles),
    );
    after = transformEditorGroupSubtreeMetadata(after, selection.groupId, affine);
    return {
      label: objectTransformLabel('Shear', brushCount, entityCount),
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: selection,
      document: after,
      repeatable: {
        kind: 'shear',
        pivot: [...pivot] as Vec3,
        sourceAxis,
        targetAxis,
        factor,
        textureLock,
        updateEntityAngles,
      },
    };
  }

  public createShearCandidate(
    brushId: BrushId,
    pivot: Vec3,
    sourceAxis: TransformAxis,
    targetAxis: TransformAxis,
    factor: number,
    textureLock = true,
  ): BrushEditCandidate | null {
    if (Math.abs(factor) <= Number.EPSILON) return null;
    return this.createBrushTransformCandidate(brushId, 'Shear brush', (before) =>
      shearBrush(before, pivot, sourceAxis, targetAxis, factor, textureLock),
    );
  }

  public createBrushSetShearCandidate(
    brushIds: readonly BrushId[],
    pivot: Vec3,
    sourceAxis: TransformAxis,
    targetAxis: TransformAxis,
    factor: number,
    textureLock = true,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (Math.abs(factor) <= Number.EPSILON) return null;
    return this.createBrushSetTransformCandidate(
      brushIds,
      'Shear brush',
      'Shear brushes',
      (before) => shearBrush(before, pivot, sourceAxis, targetAxis, factor, textureLock),
    );
  }

  public createBrushSetVertexRotationCandidate(
    brushIds: readonly BrushId[],
    vertices: readonly Vec3[],
    pivot: Vec3,
    axis: TransformAxis,
    degrees: number,
    ids: IdFactory,
    textureLock = true,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (Math.abs(degrees) <= Number.EPSILON) return null;
    return this.createBrushSetVertexTransformCandidate(
      brushIds,
      vertices,
      'Rotate components',
      (before) => rotateBrushVertices(before, vertices, pivot, axis, degrees, ids, textureLock),
    );
  }

  public createBrushSetVertexScaleCandidate(
    brushIds: readonly BrushId[],
    vertices: readonly Vec3[],
    pivot: Vec3,
    factors: Vec3,
    ids: IdFactory,
    textureLock = true,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (factors.every((factor) => Math.abs(factor - 1) <= Number.EPSILON)) return null;
    return this.createBrushSetVertexTransformCandidate(
      brushIds,
      vertices,
      'Scale components',
      (before) => scaleBrushVertices(before, vertices, pivot, factors, ids, textureLock),
    );
  }

  public createBrushSetVertexShearCandidate(
    brushIds: readonly BrushId[],
    vertices: readonly Vec3[],
    pivot: Vec3,
    sourceAxis: TransformAxis,
    targetAxis: TransformAxis,
    factor: number,
    ids: IdFactory,
    textureLock = true,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (Math.abs(factor) <= Number.EPSILON) return null;
    return this.createBrushSetVertexTransformCandidate(
      brushIds,
      vertices,
      'Shear components',
      (before) =>
        shearBrushVertices(
          before,
          vertices,
          pivot,
          sourceAxis,
          targetAxis,
          factor,
          ids,
          textureLock,
        ),
    );
  }

  private createBrushSetVertexTransformCandidate(
    brushIds: readonly BrushId[],
    vertices: readonly Vec3[],
    label: string,
    transform: (brush: MapBrush) => MapBrush,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (vertices.length === 0) return null;
    const targets = this.brushIdsContainingVertices(brushIds, vertices);
    return this.createBrushSetTransformCandidate(targets, label, label, transform);
  }

  private createBrushSetTransformCandidate(
    brushIds: readonly BrushId[],
    singleLabel: string,
    batchLabel: string,
    transform: (brush: MapBrush) => MapBrush,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    const uniqueIds = [...new Set(brushIds)];
    if (uniqueIds.length === 0) return null;
    const edits: BrushEdit[] = [];
    for (const brushId of uniqueIds) {
      const before = findBrush(this.currentDocument, brushId);
      if (!before) return null;
      const after = transform(before);
      const derived = deriveBrush(after);
      if (!derived.valid) {
        throw new Error(
          `${uniqueIds.length === 1 ? singleLabel : batchLabel} would create an invalid brush: ${derived.diagnostics
            .map((diagnostic) => diagnostic.message)
            .join('; ')}`,
        );
      }
      edits.push({ brushId, baseBrushRevision: before.revision, before, after });
    }
    const document = replaceBrushes(
      this.currentDocument,
      edits.map((edit) => edit.after),
    );
    if (edits.length === 1) {
      const edit = edits[0]!;
      return {
        label: singleLabel,
        brushId: edit.brushId,
        baseDocumentRevision: this.currentDocument.revision,
        baseBrushRevision: edit.baseBrushRevision,
        before: edit.before,
        after: edit.after,
        document,
      };
    }
    return {
      label: batchLabel,
      baseDocumentRevision: this.currentDocument.revision,
      edits,
      document,
    };
  }

  private createBrushTransformCandidate(
    brushId: BrushId,
    label: string,
    transform: (brush: MapBrush) => MapBrush,
  ): BrushEditCandidate | null {
    const before = findBrush(this.currentDocument, brushId);
    if (!before) return null;
    const after = transform(before);
    const derived = deriveBrush(after);
    if (!derived.valid) {
      throw new Error(
        `${label} would create an invalid brush: ${derived.diagnostics
          .map((diagnostic) => diagnostic.message)
          .join('; ')}`,
      );
    }
    return {
      label,
      brushId,
      baseDocumentRevision: this.currentDocument.revision,
      baseBrushRevision: before.revision,
      before,
      after,
      document: replaceBrush(this.currentDocument, after),
    };
  }

  public moveSelectedVertices(
    vertices: readonly Vec3[],
    delta: Vec3,
    ids: IdFactory,
    textureLock = true,
  ): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const candidate = this.createBrushSetVertexMoveCandidate(
      selectedBrushIds(this.currentSelection),
      vertices,
      delta,
      ids,
      textureLock,
    );
    if (!candidate) return false;
    this.commitCandidate(candidate);
    return true;
  }

  public createVertexMoveCandidate(
    brushId: BrushId,
    vertices: readonly Vec3[],
    delta: Vec3,
    ids: IdFactory,
    textureLock = true,
  ): BrushEditCandidate | null {
    if (delta.every((component) => Math.abs(component) <= Number.EPSILON)) return null;
    return this.createBrushTransformCandidate(brushId, 'Move vertices', (before) =>
      moveBrushVertices(before, vertices, delta, ids, textureLock),
    );
  }

  public createBrushSetVertexMoveCandidate(
    brushIds: readonly BrushId[],
    vertices: readonly Vec3[],
    delta: Vec3,
    ids: IdFactory,
    textureLock = true,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (delta.every((component) => Math.abs(component) <= Number.EPSILON)) return null;
    const targets = this.brushIdsContainingVertices(brushIds, vertices);
    return this.createBrushSetTransformCandidate(
      targets,
      'Move vertices',
      'Move shared vertices',
      (before) => moveBrushVertices(before, vertices, delta, ids, textureLock),
    );
  }

  public createVertexSnapCandidate(
    brushIds: readonly BrushId[],
    vertices: readonly Vec3[],
    anchor: Vec3,
    target: Vec3,
    ids: IdFactory,
    textureLock = true,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (![...vertices, anchor, target].every((point) => point.every(Number.isFinite))) {
      throw new Error('Vertex snap coordinates must be finite');
    }
    if (
      !vertices.some((vertex) =>
        vertex.every((component, axis) => Math.abs(component - anchor[axis]!) <= 0.001),
      )
    ) {
      throw new Error('Vertex snap anchor must be part of the selected handle set');
    }
    const delta: Vec3 = [target[0] - anchor[0], target[1] - anchor[1], target[2] - anchor[2]];
    const candidate = this.createBrushSetVertexMoveCandidate(
      brushIds,
      vertices,
      delta,
      ids,
      textureLock,
    );
    return candidate ? { ...candidate, label: 'Snap vertices' } : null;
  }

  public createFaceSetTranslationCandidate(
    faces: readonly FaceSelection[],
    delta: Vec3,
    ids: IdFactory,
    textureLock = true,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (faces.length === 0) return null;
    const vertices: Vec3[] = [];
    for (const face of faces) {
      const brush = findBrush(this.currentDocument, face.brushId);
      const derivedFace = brush
        ? deriveBrush(brush).faces.find((candidate) => candidate.faceId === face.faceId)
        : null;
      if (!derivedFace) throw new Error(`Unknown face ${face.faceId} on brush ${face.brushId}`);
      vertices.push(...derivedFace.vertices);
    }
    const candidate = this.createBrushSetVertexMoveCandidate(
      [...new Set(faces.map((face) => face.brushId))],
      vertices,
      delta,
      ids,
      textureLock,
    );
    if (!candidate) return null;
    return { ...candidate, label: faces.length === 1 ? 'Move face' : 'Move faces' };
  }

  public createVertexInsertionCandidate(
    brushId: BrushId,
    sourcePoint: Vec3,
    delta: Vec3,
    ids: IdFactory,
    textureLock = true,
  ): BrushEditCandidate | null {
    if (delta.every((component) => Math.abs(component) <= Number.EPSILON)) return null;
    const vertex: Vec3 = [
      sourcePoint[0] + delta[0],
      sourcePoint[1] + delta[1],
      sourcePoint[2] + delta[2],
    ];
    return this.createBrushTransformCandidate(brushId, 'Add vertex', (before) =>
      addBrushVertex(before, vertex, sourcePoint, ids, textureLock),
    );
  }

  public deleteSelectedVertices(
    vertices: readonly Vec3[],
    ids: IdFactory,
    textureLock = true,
  ): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const candidate = this.createBrushSetVertexDeletionCandidate(
      selectedBrushIds(this.currentSelection),
      vertices,
      ids,
      textureLock,
    );
    if (!candidate) return false;
    this.commitCandidate(candidate);
    return true;
  }

  public createVertexDeletionCandidate(
    brushId: BrushId,
    vertices: readonly Vec3[],
    ids: IdFactory,
    textureLock = true,
  ): BrushEditCandidate | null {
    if (vertices.length === 0) return null;
    return this.createBrushTransformCandidate(brushId, 'Delete vertices', (before) =>
      deleteBrushVertices(before, vertices, ids, textureLock),
    );
  }

  public createBrushSetVertexDeletionCandidate(
    brushIds: readonly BrushId[],
    vertices: readonly Vec3[],
    ids: IdFactory,
    textureLock = true,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (vertices.length === 0) return null;
    const targets = this.brushIdsContainingVertices(brushIds, vertices);
    return this.createBrushSetTransformCandidate(
      targets,
      'Delete vertices',
      'Delete shared vertices',
      (before) => deleteBrushVertices(before, vertices, ids, textureLock),
    );
  }

  private brushIdsContainingVertices(
    brushIds: readonly BrushId[],
    vertices: readonly Vec3[],
  ): readonly BrushId[] {
    return [...new Set(brushIds)].filter((brushId) => {
      const brush = findBrush(this.currentDocument, brushId);
      return Boolean(
        brush &&
        brushVertices(brush).some((point) =>
          vertices.some(
            (vertex) =>
              (point[0] - vertex[0]) ** 2 +
                (point[1] - vertex[1]) ** 2 +
                (point[2] - vertex[2]) ** 2 <=
              0.001 ** 2,
          ),
        ),
      );
    });
  }

  public extrudeSelectedFace(distance: number): boolean {
    const faces = selectedFaceReferences(this.currentSelection);
    if (faces.length === 0 || !this.currentSelection?.faceId) return false;
    const candidate = this.createFaceSetExtrusionCandidate(
      faces,
      { brushId: this.currentSelection.brushId, faceId: this.currentSelection.faceId },
      distance,
    );
    if (!candidate) return false;
    this.commitCandidate(candidate);
    return true;
  }

  public createFaceExtrusionCandidate(
    brushId: BrushId,
    faceId: BrushSelection['faceId'],
    distance: number,
  ): BrushEditCandidate | null {
    if (!faceId || Math.abs(distance) <= Number.EPSILON) return null;
    const before = findBrush(this.currentDocument, brushId);
    if (!before) return null;
    const after = moveBrushFace(before, faceId, distance);
    const derived = deriveBrush(after);
    if (!derived.valid) {
      throw new Error(
        `Face extrusion would create an invalid brush: ${derived.diagnostics
          .map((diagnostic) => diagnostic.message)
          .join('; ')}`,
      );
    }
    return {
      label: 'Extrude face',
      brushId,
      baseDocumentRevision: this.currentDocument.revision,
      baseBrushRevision: before.revision,
      before,
      after,
      document: replaceBrush(this.currentDocument, after),
    };
  }

  public createFaceSetExtrusionCandidate(
    faces: readonly FaceSelection[],
    primary: FaceSelection,
    distance: number,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (faces.length === 0 || Math.abs(distance) <= Number.EPSILON) return null;
    const unique = new Map(
      faces.map((face) => [`${face.brushId}\u0000${face.faceId}`, face] as const),
    );
    const normalized = [...unique.values()];
    const matching = matchingBrushFaces(
      this.currentDocument,
      primary,
      normalized.map((face) => face.brushId),
    );
    const matchingKeys = new Set(matching.map((face) => `${face.brushId}\u0000${face.faceId}`));
    if (
      matchingKeys.size !== normalized.length ||
      normalized.some((face) => !matchingKeys.has(`${face.brushId}\u0000${face.faceId}`))
    ) {
      throw new Error('Shared extrusion requires faces with exactly the same vertices');
    }
    const primaryBrush = findBrush(this.currentDocument, primary.brushId);
    const primaryFace = primaryBrush
      ? deriveBrush(primaryBrush).faces.find((face) => face.faceId === primary.faceId)
      : null;
    if (!primaryFace) return null;
    const edits: BrushEdit[] = [];
    for (const face of normalized) {
      const before = findBrush(this.currentDocument, face.brushId);
      const derivedFace = before
        ? deriveBrush(before).faces.find((candidate) => candidate.faceId === face.faceId)
        : null;
      if (!before || !derivedFace) return null;
      const alignment =
        primaryFace.normal[0] * derivedFace.normal[0] +
        primaryFace.normal[1] * derivedFace.normal[1] +
        primaryFace.normal[2] * derivedFace.normal[2];
      if (Math.abs(alignment) < 1 - 1e-5) {
        throw new Error('Shared extrusion faces must have parallel or opposing normals');
      }
      const after = moveBrushFace(before, face.faceId, distance * (alignment < 0 ? -1 : 1));
      const derived = deriveBrush(after);
      if (!derived.valid) {
        throw new Error(
          `Face extrusion would create an invalid brush: ${derived.diagnostics
            .map((diagnostic) => diagnostic.message)
            .join('; ')}`,
        );
      }
      edits.push({
        brushId: before.id,
        baseBrushRevision: before.revision,
        before,
        after,
      });
    }
    const document = replaceBrushes(
      this.currentDocument,
      edits.map((edit) => edit.after),
    );
    if (edits.length === 1) {
      const edit = edits[0]!;
      return {
        label: 'Extrude face',
        brushId: edit.brushId,
        baseDocumentRevision: this.currentDocument.revision,
        baseBrushRevision: edit.baseBrushRevision,
        before: edit.before,
        after: edit.after,
        document,
      };
    }
    return {
      label: 'Extrude shared faces',
      baseDocumentRevision: this.currentDocument.revision,
      edits,
      document,
    };
  }

  public splitSelectedFace(distance: number, ids: IdFactory): boolean {
    const faces = selectedFaceReferences(this.currentSelection);
    if (faces.length === 0 || !this.currentSelection?.faceId) return false;
    const primary = {
      brushId: this.currentSelection.brushId,
      faceId: this.currentSelection.faceId,
    };
    const candidate = this.createFaceSetSplitCandidate(faces, primary, distance, ids);
    if (!candidate) return false;
    this.commitClipCandidate(candidate);
    return true;
  }

  public createFaceSetSplitCandidate(
    faces: readonly FaceSelection[],
    primary: FaceSelection,
    distance: number,
    ids: IdFactory,
  ): BrushClipCandidate | BrushBatchClipCandidate | null {
    if (faces.length === 0 || Math.abs(distance) <= Number.EPSILON) return null;
    const unique = new Map(
      faces.map((face) => [`${face.brushId}\u0000${face.faceId}`, face] as const),
    );
    const normalized = [...unique.values()];
    const matching = matchingBrushFaces(
      this.currentDocument,
      primary,
      normalized.map((face) => face.brushId),
    );
    const matchingKeys = new Set(matching.map((face) => `${face.brushId}\u0000${face.faceId}`));
    if (
      matchingKeys.size !== normalized.length ||
      normalized.some((face) => !matchingKeys.has(`${face.brushId}\u0000${face.faceId}`))
    ) {
      throw new Error('Split extrusion requires faces with exactly the same vertices');
    }
    const primaryBrush = findBrush(this.currentDocument, primary.brushId);
    const primaryFace = primaryBrush
      ? deriveBrush(primaryBrush).faces.find((face) => face.faceId === primary.faceId)
      : null;
    if (!primaryFace) return null;
    const rawEdits = normalized.map<BrushClipEdit>((face) => {
      const before = findBrush(this.currentDocument, face.brushId);
      const derivedFace = before
        ? deriveBrush(before).faces.find((candidate) => candidate.faceId === face.faceId)
        : null;
      if (!before || !derivedFace) throw new Error('The selected face no longer exists');
      const alignment =
        primaryFace.normal[0] * derivedFace.normal[0] +
        primaryFace.normal[1] * derivedFace.normal[1] +
        primaryFace.normal[2] * derivedFace.normal[2];
      if (alignment < 1 - 1e-5) {
        throw new Error('Split extrusion is unavailable for opposing shared faces');
      }
      const owner = this.currentDocument.entities.find((entity) =>
        entity.brushes.some((brush) => brush.id === before.id),
      );
      if (!owner) throw new Error(`Unknown owner for brush ${before.id}`);
      const insertionIndex = owner.brushes.findIndex((brush) => brush.id === before.id);
      return {
        entityId: owner.id,
        insertionIndex,
        afterInsertionIndex: insertionIndex,
        baseBrushRevision: before.revision,
        before,
        after: splitBrushFace(before, face.faceId, distance, ids),
      };
    });
    const offsets = new Map<EntityId, number>();
    const edits = rawEdits
      .toSorted((left, right) => {
        const leftEntity = this.currentDocument.entities.findIndex(
          (entity) => entity.id === left.entityId,
        );
        const rightEntity = this.currentDocument.entities.findIndex(
          (entity) => entity.id === right.entityId,
        );
        return leftEntity - rightEntity || left.insertionIndex - right.insertionIndex;
      })
      .map<BrushClipEdit>((edit) => {
        const offset = offsets.get(edit.entityId) ?? 0;
        offsets.set(edit.entityId, offset + edit.after.length - 1);
        return Object.assign({}, edit, { afterInsertionIndex: edit.insertionIndex + offset });
      });
    if (edits.length === 1) {
      const edit = edits[0]!;
      return {
        label: 'Split-extrude face',
        mode: 'split',
        entityId: edit.entityId,
        insertionIndex: edit.insertionIndex,
        baseDocumentRevision: this.currentDocument.revision,
        baseBrushRevision: edit.baseBrushRevision,
        before: edit.before,
        after: edit.after,
        document: replaceBrushSequence(
          this.currentDocument,
          edit.entityId,
          edit.insertionIndex,
          [edit.before.id],
          edit.after,
        ),
      };
    }
    const selectionBefore = [...new Set(normalized.map((face) => face.brushId))];
    return {
      label: 'Split-extrude faces',
      mode: 'split',
      baseDocumentRevision: this.currentDocument.revision,
      edits,
      selectionBefore,
      selectionAfter: edits.flatMap((edit) => edit.after.map((brush) => brush.id)),
      document: replaceBrushSequences(
        this.currentDocument,
        edits.map((edit) => ({
          entityId: edit.entityId,
          insertionIndex: edit.insertionIndex,
          expectedBrushIds: [edit.before.id],
          replacements: edit.after,
        })),
      ),
    };
  }

  public createFaceStampCandidate(
    faces: readonly FaceSelection[],
    primary: FaceSelection,
    distance: number,
    ids: IdFactory,
    textureLock = true,
  ): BrushBatchCreationCandidate | null {
    if (faces.length === 0 || Math.abs(distance) <= Number.EPSILON) return null;
    const unique = new Map(
      faces.map((face) => [`${face.brushId}\u0000${face.faceId}`, face] as const),
    );
    const normalized = [...unique.values()];
    const matching = matchingBrushFaces(
      this.currentDocument,
      primary,
      normalized.map((face) => face.brushId),
    );
    const matchingKeys = new Set(matching.map((face) => `${face.brushId}\u0000${face.faceId}`));
    if (
      matchingKeys.size !== normalized.length ||
      normalized.some((face) => !matchingKeys.has(`${face.brushId}\u0000${face.faceId}`))
    ) {
      throw new Error('Face stamping requires faces with exactly the same vertices');
    }
    const source = findBrush(this.currentDocument, primary.brushId);
    if (!source) return null;
    const owner = this.currentDocument.entities.find((entity) =>
      entity.brushes.some((brush) => brush.id === source.id),
    );
    if (!owner) throw new Error(`Stamp source brush ${source.id} has no owning entity`);
    const brush = stampBrushFace(source, primary.faceId, distance, ids, textureLock);
    const insertion: BrushInsertion = {
      entityId: owner.id,
      insertionIndex: owner.brushes.length,
      brush,
    };
    return {
      label: 'Stamp face',
      baseDocumentRevision: this.currentDocument.revision,
      insertions: [insertion],
      selectionBefore: this.currentSelection,
      selectionAfter: [brush.id],
      document: insertBrushes(this.currentDocument, [insertion]),
    };
  }

  public stampSelectedFace(distance: number, ids: IdFactory, textureLock = true): boolean {
    const faces = selectedFaceReferences(this.currentSelection);
    if (faces.length === 0 || !this.currentSelection?.faceId) return false;
    const candidate = this.createFaceStampCandidate(
      faces,
      { brushId: this.currentSelection.brushId, faceId: this.currentSelection.faceId },
      distance,
      ids,
      textureLock,
    );
    if (!candidate) return false;
    this.commitBatchCreationCandidate(candidate);
    return true;
  }

  public createBrush(brush: MapBrush, entityId?: EntityId): boolean {
    const candidate = this.createBrushCandidate(brush, entityId);
    this.commitCreationCandidate(candidate);
    return true;
  }

  public createClipCandidate(
    brushId: BrushId,
    planePoints: readonly [Vec3, Vec3, Vec3],
    mode: BrushClipMode,
    ids: IdFactory,
    material?: string,
  ): BrushClipCandidate | null {
    const edit = this.createClipEdit(brushId, planePoints, mode, ids, material);
    if (!edit) return null;
    return {
      label: mode === 'split' ? 'Split brush' : 'Clip brush',
      mode,
      entityId: edit.entityId,
      insertionIndex: edit.insertionIndex,
      baseDocumentRevision: this.currentDocument.revision,
      baseBrushRevision: edit.baseBrushRevision,
      before: edit.before,
      after: edit.after,
      document: replaceBrushSequence(
        this.currentDocument,
        edit.entityId,
        edit.insertionIndex,
        [edit.before.id],
        edit.after,
      ),
    };
  }

  public createBrushSetClipCandidate(
    brushIds: readonly BrushId[],
    planePoints: readonly [Vec3, Vec3, Vec3],
    mode: BrushClipMode,
    ids: IdFactory,
    material?: string,
  ): BrushClipCandidate | BrushBatchClipCandidate | null {
    const selectionBefore = [...new Set(brushIds)];
    if (selectionBefore.length === 0) return null;
    if (selectionBefore.length === 1) {
      return this.createClipCandidate(selectionBefore[0]!, planePoints, mode, ids, material);
    }
    const rawEdits = selectionBefore.flatMap((brushId) => {
      const edit = this.createClipEdit(brushId, planePoints, mode, ids, material);
      return edit ? [edit] : [];
    });
    if (rawEdits.length === 0) return null;
    const offsets = new Map<EntityId, number>();
    const edits = rawEdits
      .toSorted((left, right) => {
        const leftEntity = this.currentDocument.entities.findIndex(
          (entity) => entity.id === left.entityId,
        );
        const rightEntity = this.currentDocument.entities.findIndex(
          (entity) => entity.id === right.entityId,
        );
        return leftEntity - rightEntity || left.insertionIndex - right.insertionIndex;
      })
      .map<BrushClipEdit>((edit) => {
        const offset = offsets.get(edit.entityId) ?? 0;
        offsets.set(edit.entityId, offset + edit.after.length - 1);
        return Object.assign({}, edit, { afterInsertionIndex: edit.insertionIndex + offset });
      });
    const byBeforeId = new Map(edits.map((edit) => [edit.before.id, edit] as const));
    const selectionAfter = selectionBefore.flatMap((brushId) => {
      const edit = byBeforeId.get(brushId);
      return edit ? (edit.after[0] ? [edit.after[0].id] : []) : [brushId];
    });
    return {
      label: mode === 'split' ? 'Split brushes' : 'Clip brushes',
      mode,
      baseDocumentRevision: this.currentDocument.revision,
      edits,
      selectionBefore,
      selectionAfter,
      document: replaceBrushSequences(
        this.currentDocument,
        edits.map((edit) => ({
          entityId: edit.entityId,
          insertionIndex: edit.insertionIndex,
          expectedBrushIds: [edit.before.id],
          replacements: edit.after,
        })),
      ),
    };
  }

  private createClipEdit(
    brushId: BrushId,
    planePoints: readonly [Vec3, Vec3, Vec3],
    mode: BrushClipMode,
    ids: IdFactory,
    material?: string,
  ): BrushClipEdit | null {
    const before = findBrush(this.currentDocument, brushId);
    if (!before) return null;
    const owner = this.currentDocument.entities.find((entity) =>
      entity.brushes.some((brush) => brush.id === brushId),
    );
    if (!owner) return null;
    const insertionIndex = owner.brushes.findIndex((brush) => brush.id === brushId);
    let after: readonly MapBrush[];
    if (mode === 'split') {
      const back = clipBrush(before, planePoints, 'back', ids.face(), material);
      const frontSource = cloneBrush(before, ids);
      const front = clipBrush(frontSource, planePoints, 'front', ids.face(), material);
      if (!back || !front || back === before || front === frontSource) return null;
      after = [back, front];
    } else {
      const clipped = clipBrush(before, planePoints, mode, ids.face(), material);
      if (clipped === before) return null;
      after = clipped ? [clipped] : [];
    }
    return {
      entityId: owner.id,
      insertionIndex,
      afterInsertionIndex: insertionIndex,
      baseBrushRevision: before.revision,
      before,
      after,
    };
  }

  public commitClipCandidate(candidate: BrushClipCandidate | BrushBatchClipCandidate): void {
    if ('edits' in candidate) {
      this.commitBatchClipCandidate(candidate);
      return;
    }
    if (this.currentDocument.revision !== candidate.baseDocumentRevision) {
      throw new Error('Cannot commit a clip candidate created from a stale document revision');
    }
    const current = findBrush(this.currentDocument, candidate.before.id);
    if (!current || current.revision !== candidate.baseBrushRevision) {
      throw new Error('Cannot commit a clip candidate created from a stale brush revision');
    }
    for (const brush of candidate.after) {
      const derived = deriveBrush(brush);
      if (!derived.valid) {
        throw new Error(derived.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
      }
    }
    if (this.hasLinkedEditingGroup(candidate.document)) {
      this.commitDocumentCandidate({
        label: candidate.label,
        baseDocumentRevision: candidate.baseDocumentRevision,
        before: this.currentDocument,
        after: candidate.document,
        selectionBefore: this.currentSelection,
        selectionAfter: candidate.after[0] ? { brushId: candidate.after[0].id } : null,
        document: candidate.document,
      });
      return;
    }
    this.currentDocument = replaceBrushSequence(
      this.currentDocument,
      candidate.entityId,
      candidate.insertionIndex,
      [candidate.before.id],
      candidate.after,
    );
    this.currentSelection = candidate.after[0] ? { brushId: candidate.after[0].id } : null;
    this.undoStack.push({
      kind: 'clip-brush',
      label: candidate.label,
      entityId: candidate.entityId,
      insertionIndex: candidate.insertionIndex,
      before: candidate.before,
      after: candidate.after,
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.notify('document', candidate.label);
  }

  private commitBatchClipCandidate(candidate: BrushBatchClipCandidate): void {
    if (this.currentDocument.revision !== candidate.baseDocumentRevision) {
      throw new Error('Cannot commit a clip candidate created from a stale document revision');
    }
    for (const edit of candidate.edits) {
      const current = findBrush(this.currentDocument, edit.before.id);
      if (!current || current.revision !== edit.baseBrushRevision) {
        throw new Error('Cannot commit a clip candidate created from a stale brush revision');
      }
      for (const brush of edit.after) {
        const derived = deriveBrush(brush);
        if (!derived.valid) {
          throw new Error(derived.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
        }
      }
    }
    if (this.hasLinkedEditingGroup(candidate.document)) {
      const selectionAfter = createBrushSelection(candidate.selectionAfter);
      this.commitDocumentCandidate({
        label: candidate.label,
        baseDocumentRevision: candidate.baseDocumentRevision,
        before: this.currentDocument,
        after: candidate.document,
        selectionBefore: this.currentSelection,
        selectionAfter,
        document: candidate.document,
      });
      return;
    }
    this.currentDocument = replaceBrushSequences(
      this.currentDocument,
      candidate.edits.map((edit) => ({
        entityId: edit.entityId,
        insertionIndex: edit.insertionIndex,
        expectedBrushIds: [edit.before.id],
        replacements: edit.after,
      })),
    );
    this.currentSelection = createBrushSelection(candidate.selectionAfter);
    this.undoStack.push({
      kind: 'clip-brushes',
      label: candidate.label,
      edits: candidate.edits,
      selectionBefore: candidate.selectionBefore,
      selectionAfter: candidate.selectionAfter,
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.notify('document', candidate.label);
  }

  private createSequenceCandidate(
    label: string,
    replacements: ReadonlyMap<BrushId, readonly MapBrush[]>,
    selectionAfter: readonly BrushId[],
  ): BrushSequenceCandidate | null {
    if (replacements.size === 0) return null;
    const rawEdits: BrushClipEdit[] = [];
    for (const entity of this.currentDocument.entities) {
      for (const [insertionIndex, brush] of entity.brushes.entries()) {
        const after = replacements.get(brush.id);
        if (!after) continue;
        rawEdits.push({
          entityId: entity.id,
          insertionIndex,
          afterInsertionIndex: insertionIndex,
          baseBrushRevision: brush.revision,
          before: brush,
          after,
        });
      }
    }
    if (rawEdits.length !== replacements.size) return null;
    const offsets = new Map<EntityId, number>();
    const edits = rawEdits.map<BrushClipEdit>((edit) => {
      const offset = offsets.get(edit.entityId) ?? 0;
      offsets.set(edit.entityId, offset + edit.after.length - 1);
      return Object.assign({}, edit, { afterInsertionIndex: edit.insertionIndex + offset });
    });
    return {
      label,
      baseDocumentRevision: this.currentDocument.revision,
      edits,
      selectionBefore: selectedBrushIds(this.currentSelection),
      selectionAfter,
      document: replaceBrushSequences(
        this.currentDocument,
        edits.map((edit) => ({
          entityId: edit.entityId,
          insertionIndex: edit.insertionIndex,
          expectedBrushIds: [edit.before.id],
          replacements: edit.after,
        })),
      ),
    };
  }

  public commitSequenceCandidate(candidate: BrushSequenceCandidate): void {
    if (this.currentDocument.revision !== candidate.baseDocumentRevision) {
      throw new Error('Cannot commit a brush replacement created from a stale document revision');
    }
    for (const edit of candidate.edits) {
      const current = findBrush(this.currentDocument, edit.before.id);
      if (!current || current.revision !== edit.baseBrushRevision) {
        throw new Error('Cannot commit a brush replacement created from a stale brush revision');
      }
      for (const brush of edit.after) {
        const derived = deriveBrush(brush);
        if (!derived.valid) {
          throw new Error(derived.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
        }
      }
    }
    if (this.hasLinkedEditingGroup(candidate.document)) {
      this.commitDocumentCandidate({
        label: candidate.label,
        baseDocumentRevision: candidate.baseDocumentRevision,
        before: this.currentDocument,
        after: candidate.document,
        selectionBefore: this.currentSelection,
        selectionAfter: createBrushSelection(candidate.selectionAfter),
        document: candidate.document,
      });
      return;
    }
    this.currentDocument = replaceBrushSequences(
      this.currentDocument,
      candidate.edits.map((edit) => ({
        entityId: edit.entityId,
        insertionIndex: edit.insertionIndex,
        expectedBrushIds: [edit.before.id],
        replacements: edit.after,
      })),
    );
    this.currentSelection = createBrushSelection(candidate.selectionAfter);
    this.undoStack.push({
      kind: 'replace-brush-sequences',
      label: candidate.label,
      edits: candidate.edits,
      selectionBefore: candidate.selectionBefore,
      selectionAfter: candidate.selectionAfter,
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.notify('document', candidate.label);
  }

  public csgConvexMergeSelected(ids: IdFactory, currentMaterial?: string): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const selected = new Set(selectedBrushIds(this.currentSelection));
    if (selected.size < 2) return false;
    const inputs = this.currentDocument.entities.flatMap((entity) =>
      entity.brushes.filter((brush) => selected.has(brush.id)),
    );
    if (inputs.length !== selected.size) return false;
    const result = convexMergeBrushes(inputs, ids, currentMaterial);
    const replacements = new Map<BrushId, readonly MapBrush[]>();
    inputs.forEach((brush, index) => replacements.set(brush.id, index === 0 ? [result] : []));
    const candidate = this.createSequenceCandidate('CSG convex merge', replacements, [result.id]);
    if (!candidate) return false;
    this.commitSequenceCandidate(candidate);
    return true;
  }

  public csgIntersectSelected(ids: IdFactory): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const selected = new Set(selectedBrushIds(this.currentSelection));
    if (selected.size < 2) return false;
    const inputs = this.currentDocument.entities.flatMap((entity) =>
      entity.brushes.filter((brush) => selected.has(brush.id)),
    );
    if (inputs.length !== selected.size) return false;
    const result = intersectBrushes(inputs, ids);
    const replacements = new Map<BrushId, readonly MapBrush[]>();
    inputs.forEach((brush, index) =>
      replacements.set(brush.id, index === 0 && result ? [result] : []),
    );
    const candidate = this.createSequenceCandidate(
      'CSG intersection',
      replacements,
      result ? [result.id] : [],
    );
    if (!candidate) return false;
    this.commitSequenceCandidate(candidate);
    return true;
  }

  public csgSubtractSelected(ids: IdFactory): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const selected = new Set(selectedBrushIds(this.currentSelection));
    if (selected.size === 0) return false;
    const subtrahends = this.currentDocument.entities.flatMap((entity) =>
      entity.brushes.filter((brush) => selected.has(brush.id)),
    );
    if (subtrahends.length !== selected.size) return false;
    const replacements = new Map<BrushId, readonly MapBrush[]>();
    const selectionAfter: BrushId[] = [];
    for (const entity of this.currentDocument.entities) {
      for (const brush of entity.brushes) {
        if (selected.has(brush.id)) {
          replacements.set(brush.id, []);
          continue;
        }
        if (this.isBrushUnavailable(brush.id)) continue;
        let fragments: readonly MapBrush[] = [brush];
        let changed = false;
        for (const subtrahend of subtrahends) {
          fragments = fragments.flatMap((fragment) => {
            const result = subtractBrush(fragment, subtrahend, ids);
            if (result.length !== 1 || result[0] !== fragment) changed = true;
            return result;
          });
        }
        if (!changed) continue;
        replacements.set(brush.id, fragments);
        selectionAfter.push(...fragments.map((fragment) => fragment.id));
      }
    }
    const candidate = this.createSequenceCandidate('CSG subtraction', replacements, selectionAfter);
    if (!candidate) return false;
    this.commitSequenceCandidate(candidate);
    return true;
  }

  public csgHollowSelected(thickness: number, ids: IdFactory): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const selected = new Set(selectedBrushIds(this.currentSelection));
    if (selected.size === 0) return false;
    const replacements = new Map<BrushId, readonly MapBrush[]>();
    const selectionAfter: BrushId[] = [];
    for (const entity of this.currentDocument.entities) {
      for (const brush of entity.brushes) {
        if (!selected.has(brush.id)) continue;
        const walls = hollowBrush(brush, thickness, ids);
        replacements.set(brush.id, walls);
        selectionAfter.push(...walls.map((wall) => wall.id));
      }
    }
    if (replacements.size !== selected.size) return false;
    const candidate = this.createSequenceCandidate('CSG hollow', replacements, selectionAfter);
    if (!candidate) return false;
    this.commitSequenceCandidate(candidate);
    return true;
  }

  public createPointEntity(
    classname: string,
    origin: Vec3,
    ids: IdFactory,
    properties: Readonly<Record<string, string>> = {},
  ): boolean {
    const normalizedClassname = classname.trim();
    if (!normalizedClassname) throw new Error('A point entity requires a classname');
    const definition = pointEntityDefinition(normalizedClassname);
    const layerProperties =
      !properties['_tb_group'] && this.currentLayerId ? { _tb_layer: this.currentLayerId } : {};
    const entity: MapEntity = {
      id: ids.entity(),
      properties: {
        ...definition.defaults,
        ...layerProperties,
        ...properties,
        classname: normalizedClassname,
        origin: formatEntityOrigin(origin),
      },
      brushes: [],
    };
    const after = insertEntity(this.currentDocument, entity);
    this.commitDocumentCandidate({
      label: `Create ${normalizedClassname}`,
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: { entityId: entity.id },
      document: after,
    });
    return true;
  }

  public createBrushEntity(
    classname: string,
    ids: IdFactory,
    properties: Readonly<Record<string, string>> = {},
  ): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const brushIds = selectedBrushIds(this.currentSelection);
    if (brushIds.length === 0) return false;
    const normalizedClassname = classname.trim();
    if (!normalizedClassname) throw new Error('A brush entity requires a classname');
    const layer = editorLayerForSelection(this.currentDocument, this.currentSelection);
    const entity: MapEntity = {
      id: ids.entity(),
      properties: {
        ...(layer?.id ? { _tb_layer: layer.id } : {}),
        ...properties,
        classname: normalizedClassname,
      },
      brushes: [],
    };
    const after = createBrushEntityInDocument(this.currentDocument, brushIds, entity);
    const selectionAfter = createObjectSelection(
      brushIds,
      selectedPointEntityIds(this.currentSelection),
      { kind: 'brush', brushId: brushIds.at(-1)! },
    );
    this.commitDocumentCandidate({
      label: `Make ${normalizedClassname}`,
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter,
      document: after,
    });
    return true;
  }

  public moveSelectedBrushesToEntity(entityId: EntityId): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const brushIds = selectedBrushIds(this.currentSelection);
    if (brushIds.length === 0) return false;
    const after = moveBrushesToEntity(this.currentDocument, brushIds, entityId);
    this.commitDocumentCandidate({
      label: 'Move brushes to entity',
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: this.currentSelection,
      document: after,
    });
    return true;
  }

  public makeSelectedStructural(): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const brushIds = selectedBrushIds(this.currentSelection);
    if (brushIds.length === 0) return false;
    const layer = editorLayerForSelection(this.currentDocument, this.currentSelection);
    const target = layer?.id
      ? this.currentDocument.entities.find((entity) => entity.id === layer.entityId)
      : this.currentDocument.entities.find(
          (entity) => entity.properties.classname?.toLowerCase() === 'worldspawn',
        );
    if (!target) throw new Error('The map has no structural layer entity');
    const after = moveBrushesToEntity(this.currentDocument, brushIds, target.id, true);
    this.commitDocumentCandidate({
      label: brushIds.length === 1 ? 'Make brush structural' : 'Make brushes structural',
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: this.currentSelection,
      document: after,
    });
    return true;
  }

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
    const insertionIndex = target.brushes.length;
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
      insertionIndex: target.brushes.length + index,
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
        entity.brushes.some((brush) => brush.id === sourceBrush.id),
      );
      if (!owner) throw new Error(`Sweep source brush ${face.brushId} has no owning entity`);
      const result = sweepBrushFace(sourceBrush, face.faceId, transform, options, ids);
      const destinationCap = result.caps.at(-1);
      if (!destinationCap) throw new Error(`Sweep face ${face.faceId} produced no destination cap`);
      destinationCaps.push(destinationCap);
      if (insertions.length + result.brushes.length > 1024) {
        throw new Error('A multi-face sweep may create at most 1024 brushes');
      }
      let insertionIndex = nextInsertionByEntity.get(owner.id) ?? owner.brushes.length;
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
      let insertionIndex = entity.brushes.length;
      for (const brush of entity.brushes) {
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
        brushes: [],
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
        entity.brushes.length === 0 &&
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
      ...sourceWorldspawn.brushes,
      ...clipboard.entities.filter(isEditorLayerEntity).flatMap((entity) => entity.brushes),
    ].map((brush) => {
      const clone = cloneBrush(brush, ids, delta, textureLock);
      pastedBrushIds.push(clone.id);
      return clone;
    });
    let after = insertBrushes(
      this.currentDocument,
      worldBrushes.map((brush, index) => ({
        entityId: destinationBrushEntity.id,
        insertionIndex: destinationBrushEntity.brushes.length + index,
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
      } else if (sourceEntity.brushes.length === 0 && !isEditorGroupEntity(sourceEntity)) {
        throw new Error(`Clipboard point entity ${sourceEntity.id} has no origin`);
      }
      const brushes = sourceEntity.brushes.map((brush) => {
        const clone = cloneBrush(brush, ids, delta, textureLock);
        pastedBrushIds.push(clone.id);
        return clone;
      });
      const entity: MapEntity = { id: ids.entity(), properties, brushes };
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
      entity.brushes.flatMap((brush, insertionIndex) =>
        selectedIds.has(brush.id) ? [{ entityId: entity.id, insertionIndex, brush }] : [],
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
    this.undoStack.push({ kind: 'delete-brushes', label: 'Delete brushes', insertions });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.notify('document', 'Delete brushes');
    return true;
  }

  public deleteBrush(brushId: BrushId): boolean {
    const owner = this.currentDocument.entities.find((entity) =>
      entity.brushes.some((brush) => brush.id === brushId),
    );
    if (!owner) return false;
    const insertionIndex = owner.brushes.findIndex((brush) => brush.id === brushId);
    const brush = owner.brushes[insertionIndex];
    if (!brush) return false;
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
    this.undoStack.push({
      kind: 'delete-brush',
      label: 'Delete brush',
      entityId: owner.id,
      insertionIndex,
      brush,
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
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
    this.undoStack.push({
      kind: 'replace-entity-properties',
      label,
      entityId,
      before,
      after,
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
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

  public createMaterialCandidate(
    material: string,
    selection = this.currentSelection,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (!selection) return null;
    const selectedFaces = selectedFaceReferences(selection);
    const byBrush = new Map<BrushId, FaceSelection[]>();
    if (selectedFaces.length === 0) {
      for (const brushId of selectedBrushIds(selection)) byBrush.set(brushId, []);
    } else {
      for (const face of selectedFaces) {
        const entries = byBrush.get(face.brushId) ?? [];
        entries.push(face);
        byBrush.set(face.brushId, entries);
      }
    }
    const edits: BrushEdit[] = [];
    for (const [brushId, faceSelections] of byBrush) {
      const before = findBrush(this.currentDocument, brushId);
      if (!before) continue;
      const affectedFaces =
        faceSelections.length === 0
          ? before.faces
          : before.faces.filter((face) =>
              faceSelections.some((selected) => selected.faceId === face.id),
            );
      if (affectedFaces.every((face) => face.material === material.trim())) continue;
      const after =
        faceSelections.length === 0
          ? setBrushMaterial(before, material)
          : setBrushFaceMaterials(
              before,
              material,
              faceSelections.map((face) => face.faceId),
            );
      edits.push({
        brushId,
        baseBrushRevision: before.revision,
        before,
        after,
      });
    }
    if (edits.length === 0) return null;
    const document = replaceBrushes(
      this.currentDocument,
      edits.map((edit) => edit.after),
    );
    if (edits.length > 1) {
      return {
        label: 'Apply material',
        baseDocumentRevision: this.currentDocument.revision,
        edits,
        document,
      };
    }
    const edit = edits[0]!;
    return {
      label: 'Apply material',
      brushId: edit.brushId,
      baseDocumentRevision: this.currentDocument.revision,
      baseBrushRevision: edit.baseBrushRevision,
      before: edit.before,
      after: edit.after,
      document,
    };
  }

  public applyTextureTransform(
    transform: FaceTextureTransform,
    selection = this.currentSelection,
  ): boolean {
    const candidate = this.createTextureTransformCandidate(transform, selection);
    if (!candidate) return false;
    this.commitCandidate(candidate);
    return true;
  }

  public alignTexture(
    operation: FaceTextureAlignmentOperation,
    options: FaceTextureAlignmentOptions = {},
    selection = this.currentSelection,
  ): boolean {
    const candidate = this.createTextureAlignmentCandidate(operation, options, selection);
    if (!candidate) return false;
    this.commitCandidate(candidate);
    return true;
  }

  public createTextureAlignmentCandidate(
    operation: FaceTextureAlignmentOperation,
    options: FaceTextureAlignmentOptions = {},
    selection = this.currentSelection,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    if (!selection) return null;
    const selectedFaces = selectedFaceReferences(selection);
    const faces =
      selectedFaces.length > 0
        ? selectedFaces
        : selectedBrushIds(selection).flatMap((brushId) => {
            const brush = findBrush(this.currentDocument, brushId);
            return brush?.faces.map((face) => ({ brushId, faceId: face.id })) ?? [];
          });
    if (faces.length === 0) return null;
    const byBrush = new Map<BrushId, FaceSelection[]>();
    for (const face of faces) {
      const entries = byBrush.get(face.brushId) ?? [];
      entries.push(face);
      byBrush.set(face.brushId, entries);
    }
    const edits = [...byBrush].map<BrushEdit>(([brushId, targets]) => {
      const before = findBrush(this.currentDocument, brushId)!;
      const after = targets.reduce(
        (brush, target) => alignFaceTexture(brush, target.faceId, operation, options),
        before,
      );
      return { brushId, baseBrushRevision: before.revision, before, after };
    });
    const labels: Record<FaceTextureAlignmentOperation, string> = {
      reset: 'Reset texture alignment',
      world: 'Reset world texture alignment',
      'flip-u': 'Flip texture horizontally',
      'flip-v': 'Flip texture vertically',
      'rotate-ccw': 'Rotate texture counterclockwise',
      'rotate-cw': 'Rotate texture clockwise',
      'align-edge': 'Align texture to face edge',
      'justify-u-min': 'Justify texture left',
      'justify-u-max': 'Justify texture right',
      'justify-v-min': 'Justify texture top',
      'justify-v-max': 'Justify texture bottom',
      'fit-u': 'Fit texture horizontally',
      'fit-v': 'Fit texture vertically',
      'auto-fit': 'Auto-fit texture',
    };
    const label = labels[operation];
    const document = replaceBrushes(
      this.currentDocument,
      edits.map((edit) => edit.after),
    );
    if (edits.length > 1) {
      return { label, baseDocumentRevision: this.currentDocument.revision, edits, document };
    }
    const edit = edits[0]!;
    return {
      label,
      brushId: edit.brushId,
      baseDocumentRevision: this.currentDocument.revision,
      baseBrushRevision: edit.baseBrushRevision,
      before: edit.before,
      after: edit.after,
      document,
    };
  }

  public transferFaceAttributes(
    source: FaceSelection,
    targets: readonly FaceSelection[],
    mode: FaceAttributeTransferMode,
  ): boolean {
    const candidate = this.createFaceAttributeTransferCandidate(source, targets, mode);
    if (!candidate) return false;
    this.commitCandidate(candidate);
    return true;
  }

  /** Applies a standalone face-attribute clipboard payload to the current face selection. */
  public pasteFaceAttributes(
    source: FaceAttributeClipboard,
    selection: EditorSelection | null = this.currentSelection,
  ): boolean {
    const candidate = this.createFaceAttributePasteCandidate(source, selection);
    if (!candidate) return false;
    this.commitCandidate(candidate);
    return true;
  }

  public createFaceAttributePasteCandidate(
    source: FaceAttributeClipboard,
    selection: EditorSelection | null = this.currentSelection,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    const targets = selectedFaceReferences(selection);
    if (targets.length === 0) return null;
    const afterByBrush = new Map<BrushId, MapBrush>();
    for (const target of targets) {
      const before =
        afterByBrush.get(target.brushId) ?? findBrush(this.currentDocument, target.brushId);
      if (!before) throw new Error(`Unknown target brush ${target.brushId}`);
      afterByBrush.set(
        target.brushId,
        transferFaceAttributes(before, target.faceId, source, 'project'),
      );
    }
    const edits = [...afterByBrush].map<BrushEdit>(([brushId, after]) => {
      const before = findBrush(this.currentDocument, brushId)!;
      return { brushId, baseBrushRevision: before.revision, before, after };
    });
    const document = replaceBrushes(
      this.currentDocument,
      edits.map((edit) => edit.after),
    );
    if (edits.length > 1) {
      return {
        label: 'Paste face attributes',
        baseDocumentRevision: this.currentDocument.revision,
        edits,
        document,
      };
    }
    const edit = edits[0]!;
    return {
      label: 'Paste face attributes',
      brushId: edit.brushId,
      baseDocumentRevision: this.currentDocument.revision,
      baseBrushRevision: edit.baseBrushRevision,
      before: edit.before,
      after: edit.after,
      document,
    };
  }

  public createFaceAttributeTransferCandidate(
    source: FaceSelection,
    targets: readonly FaceSelection[],
    mode: FaceAttributeTransferMode,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    const sourceBrush = findBrush(this.currentDocument, source.brushId);
    let chainSource = sourceBrush?.faces.find((face) => face.id === source.faceId);
    if (!chainSource) throw new Error(`Unknown source face ${source.faceId}`);
    const normalizedTargets = targets.filter(
      (target, index, all) =>
        faceSelectionKey(target) !== faceSelectionKey(source) &&
        all.findIndex((candidate) => faceSelectionKey(candidate) === faceSelectionKey(target)) ===
          index,
    );
    if (normalizedTargets.length === 0) return null;
    const afterByBrush = new Map<BrushId, MapBrush>();
    for (const target of normalizedTargets) {
      const before =
        afterByBrush.get(target.brushId) ?? findBrush(this.currentDocument, target.brushId);
      if (!before) throw new Error(`Unknown target brush ${target.brushId}`);
      const after = transferFaceAttributes(before, target.faceId, chainSource, mode);
      afterByBrush.set(target.brushId, after);
      chainSource = after.faces.find((face) => face.id === target.faceId);
      if (!chainSource) throw new Error(`Unknown transferred face ${target.faceId}`);
    }
    const edits = [...afterByBrush].map<BrushEdit>(([brushId, after]) => {
      const before = findBrush(this.currentDocument, brushId)!;
      return { brushId, baseBrushRevision: before.revision, before, after };
    });
    const label = mode === 'material' ? 'Transfer material' : 'Transfer face attributes';
    const document = replaceBrushes(
      this.currentDocument,
      edits.map((edit) => edit.after),
    );
    if (edits.length > 1) {
      return { label, baseDocumentRevision: this.currentDocument.revision, edits, document };
    }
    const edit = edits[0]!;
    return {
      label,
      brushId: edit.brushId,
      baseDocumentRevision: this.currentDocument.revision,
      baseBrushRevision: edit.baseBrushRevision,
      before: edit.before,
      after: edit.after,
      document,
    };
  }

  public createTextureTransformCandidate(
    transform: FaceTextureTransform,
    selection = this.currentSelection,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    const faces = selectedFaceReferences(selection);
    if (faces.length === 0) return null;
    const byBrush = new Map<BrushId, FaceSelection[]>();
    for (const face of faces) {
      const entries = byBrush.get(face.brushId) ?? [];
      entries.push(face);
      byBrush.set(face.brushId, entries);
    }
    const edits: BrushEdit[] = [];
    for (const [brushId, faceSelections] of byBrush) {
      const before = findBrush(this.currentDocument, brushId);
      if (!before) continue;
      let after = before;
      for (const face of faceSelections) {
        after = setFaceTextureTransform(after, face.faceId, transform);
      }
      edits.push({
        brushId,
        baseBrushRevision: before.revision,
        before,
        after,
      });
    }
    if (edits.length === 0) return null;
    const document = replaceBrushes(
      this.currentDocument,
      edits.map((edit) => edit.after),
    );
    if (edits.length > 1) {
      return {
        label: 'Adjust texture',
        baseDocumentRevision: this.currentDocument.revision,
        edits,
        document,
      };
    }
    const edit = edits[0]!;
    return {
      label: 'Adjust texture',
      brushId: edit.brushId,
      baseDocumentRevision: this.currentDocument.revision,
      baseBrushRevision: edit.baseBrushRevision,
      before: edit.before,
      after: edit.after,
      document,
    };
  }

  public createTextureTransformDeltaCandidate(
    transform: FaceTextureTransformDelta,
    primary: FaceSelection,
    primaryPivot: Vec3,
    selection = this.currentSelection,
  ): BrushEditCandidate | BrushBatchEditCandidate | null {
    const identity =
      transform.offset.every((value) => Math.abs(value) <= Number.EPSILON) &&
      Math.abs(transform.rotationDegrees) <= Number.EPSILON &&
      transform.scale.every((value) => Math.abs(value - 1) <= Number.EPSILON);
    if (identity) return null;
    const faces = selectedFaceReferences(selection);
    const primaryKey = `${primary.brushId}\u0000${primary.faceId}`;
    if (
      faces.length === 0 ||
      !faces.some((face) => `${face.brushId}\u0000${face.faceId}` === primaryKey)
    ) {
      return null;
    }
    const byBrush = new Map<BrushId, FaceSelection[]>();
    for (const face of faces) {
      const entries = byBrush.get(face.brushId) ?? [];
      entries.push(face);
      byBrush.set(face.brushId, entries);
    }
    const edits: BrushEdit[] = [];
    for (const [brushId, faceSelections] of byBrush) {
      const before = findBrush(this.currentDocument, brushId);
      if (!before) continue;
      const derived = deriveBrush(before);
      let after = before;
      for (const face of faceSelections) {
        const derivedFace = derived.faces.find((candidate) => candidate.faceId === face.faceId);
        if (!derivedFace || derivedFace.vertices.length === 0) {
          throw new Error(`Cannot transform missing face ${face.faceId}`);
        }
        const pivot =
          `${face.brushId}\u0000${face.faceId}` === primaryKey
            ? primaryPivot
            : ((): Vec3 => {
                const sum = derivedFace.vertices.reduce<Vec3>(
                  (value, point) => [value[0] + point[0], value[1] + point[1], value[2] + point[2]],
                  [0, 0, 0],
                );
                return [
                  sum[0] / derivedFace.vertices.length,
                  sum[1] / derivedFace.vertices.length,
                  sum[2] / derivedFace.vertices.length,
                ];
              })();
        after = transformFaceTexture(after, face.faceId, transform, pivot);
      }
      edits.push({
        brushId,
        baseBrushRevision: before.revision,
        before,
        after,
      });
    }
    if (edits.length === 0) return null;
    const changingScale = transform.scale.some((value) => Math.abs(value - 1) > Number.EPSILON);
    const label = changingScale
      ? 'Scale texture'
      : Math.abs(transform.rotationDegrees) > Number.EPSILON
        ? 'Rotate texture'
        : 'Pan texture';
    const document = replaceBrushes(
      this.currentDocument,
      edits.map((edit) => edit.after),
    );
    if (edits.length > 1) {
      return { label, baseDocumentRevision: this.currentDocument.revision, edits, document };
    }
    const edit = edits[0]!;
    return {
      label,
      brushId: edit.brushId,
      baseDocumentRevision: this.currentDocument.revision,
      baseBrushRevision: edit.baseBrushRevision,
      before: edit.before,
      after: edit.after,
      document,
    };
  }

  public commitCandidate(candidate: BrushEditCandidate | BrushBatchEditCandidate): void {
    if ('edits' in candidate) {
      this.commitBatchCandidate(candidate);
      return;
    }
    if (this.currentDocument.revision !== candidate.baseDocumentRevision) {
      throw new Error('Cannot commit an edit candidate created from a stale document revision');
    }
    const current = findBrush(this.currentDocument, candidate.brushId);
    if (!current || current.revision !== candidate.baseBrushRevision) {
      throw new Error('Cannot commit an edit candidate created from a stale brush revision');
    }
    const derived = deriveBrush(candidate.after);
    if (!derived.valid) {
      throw new Error(derived.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
    }
    if (this.hasLinkedEditingGroup(candidate.document)) {
      this.commitDocumentCandidate({
        label: candidate.label,
        baseDocumentRevision: candidate.baseDocumentRevision,
        before: this.currentDocument,
        after: candidate.document,
        selectionBefore: this.currentSelection,
        selectionAfter: this.currentSelection,
        document: candidate.document,
      });
      return;
    }
    this.currentDocument = replaceBrush(this.currentDocument, candidate.after);
    this.undoStack.push({
      kind: 'replace-brush',
      label: candidate.label,
      brushId: candidate.brushId,
      before: candidate.before,
      after: candidate.after,
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.notify('document', candidate.label);
  }

  private commitBatchCandidate(candidate: BrushBatchEditCandidate): void {
    if (this.currentDocument.revision !== candidate.baseDocumentRevision) {
      throw new Error('Cannot commit an edit candidate created from a stale document revision');
    }
    for (const edit of candidate.edits) {
      const current = findBrush(this.currentDocument, edit.brushId);
      if (!current || current.revision !== edit.baseBrushRevision) {
        throw new Error('Cannot commit an edit candidate created from a stale brush revision');
      }
      const derived = deriveBrush(edit.after);
      if (!derived.valid) {
        throw new Error(derived.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
      }
    }
    if (this.hasLinkedEditingGroup(candidate.document)) {
      this.commitDocumentCandidate({
        label: candidate.label,
        baseDocumentRevision: candidate.baseDocumentRevision,
        before: this.currentDocument,
        after: candidate.document,
        selectionBefore: this.currentSelection,
        selectionAfter: this.currentSelection,
        document: candidate.document,
      });
      return;
    }
    this.currentDocument = replaceBrushes(
      this.currentDocument,
      candidate.edits.map((edit) => edit.after),
    );
    this.undoStack.push({
      kind: 'replace-brushes',
      label: candidate.label,
      edits: candidate.edits,
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.notify('document', candidate.label);
  }

  public commitCreationCandidate(candidate: BrushCreationCandidate): void {
    if (this.currentDocument.revision !== candidate.baseDocumentRevision) {
      throw new Error('Cannot commit a creation candidate from a stale document revision');
    }
    const derived = deriveBrush(candidate.brush);
    if (!derived.valid) {
      throw new Error(derived.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
    }
    if (this.hasLinkedEditingGroup(candidate.document)) {
      this.commitDocumentCandidate({
        label: candidate.label,
        baseDocumentRevision: candidate.baseDocumentRevision,
        before: this.currentDocument,
        after: candidate.document,
        selectionBefore: this.currentSelection,
        selectionAfter: { brushId: candidate.brush.id },
        document: candidate.document,
      });
      return;
    }
    this.currentDocument = insertBrush(
      this.currentDocument,
      candidate.entityId,
      candidate.brush,
      candidate.insertionIndex,
    );
    this.currentSelection = { brushId: candidate.brush.id };
    this.undoStack.push({
      kind: 'create-brush',
      label: candidate.label,
      entityId: candidate.entityId,
      insertionIndex: candidate.insertionIndex,
      brush: candidate.brush,
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.notify('document', candidate.label);
  }

  public commitBatchCreationCandidate(candidate: BrushBatchCreationCandidate): void {
    if (this.currentDocument.revision !== candidate.baseDocumentRevision) {
      throw new Error('Cannot commit a batch creation candidate from a stale document revision');
    }
    for (const insertion of candidate.insertions) {
      const derived = deriveBrush(insertion.brush);
      if (!derived.valid) {
        throw new Error(derived.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
      }
    }
    if (this.hasLinkedEditingGroup(candidate.document)) {
      this.commitDocumentCandidate({
        label: candidate.label,
        baseDocumentRevision: candidate.baseDocumentRevision,
        before: this.currentDocument,
        after: candidate.document,
        selectionBefore: candidate.selectionBefore,
        selectionAfter: createBrushSelection(candidate.selectionAfter),
        document: candidate.document,
      });
      return;
    }
    this.currentDocument = insertBrushes(this.currentDocument, candidate.insertions);
    this.currentSelection = createBrushSelection(candidate.selectionAfter);
    this.undoStack.push({
      kind: 'create-brushes',
      label: candidate.label,
      insertions: candidate.insertions,
      selectionBefore: candidate.selectionBefore,
      selectionAfter: candidate.selectionAfter,
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.notify('document', candidate.label);
  }

  public commitDocumentCandidate(candidate: DocumentEditCandidate): void {
    if (this.currentDocument.revision !== candidate.baseDocumentRevision) {
      throw new Error('Cannot commit a document candidate from a stale document revision');
    }
    const synchronizedAfter = this.synchronizeEditingGroup(candidate.after);
    this.currentDocument = documentRevisionForApply(this.currentDocument, synchronizedAfter);
    this.currentSelection = candidate.selectionAfter;
    this.undoStack.push({
      kind: 'replace-document',
      label: candidate.label,
      before: candidate.before,
      after: synchronizedAfter,
      selectionBefore: candidate.selectionBefore,
      selectionAfter: candidate.selectionAfter,
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.recordRepeatableCommand(candidate.repeatable);
    this.notify('document', candidate.label);
  }

  private snapshotObjectViewState(): EditorObjectViewState {
    return {
      hiddenBrushIds: [...this.hiddenBrushIds].toSorted(),
      hiddenEntityIds: [...this.hiddenEntityIds].toSorted(),
      lockedBrushIds: [...this.lockedBrushIds].toSorted(),
      lockedEntityIds: [...this.lockedEntityIds].toSorted(),
    };
  }

  private applyObjectViewState(state: EditorObjectViewState): void {
    this.hiddenBrushIds = new Set(state.hiddenBrushIds);
    this.hiddenEntityIds = new Set(state.hiddenEntityIds);
    this.lockedBrushIds = new Set(state.lockedBrushIds);
    this.lockedEntityIds = new Set(state.lockedEntityIds);
  }

  private commitObjectViewState(
    label: string,
    state: EditorObjectViewState,
    selectionAfter: EditorSelection | null,
  ): boolean {
    const before = this.snapshotObjectViewState();
    this.applyObjectViewState(state);
    const after = this.snapshotObjectViewState();
    const unchanged =
      before.hiddenBrushIds.join('\u0000') === after.hiddenBrushIds.join('\u0000') &&
      before.hiddenEntityIds.join('\u0000') === after.hiddenEntityIds.join('\u0000') &&
      before.lockedBrushIds.join('\u0000') === after.lockedBrushIds.join('\u0000') &&
      before.lockedEntityIds.join('\u0000') === after.lockedEntityIds.join('\u0000');
    if (unchanged) return false;
    this.undoStack.push({
      kind: 'view-state',
      label,
      before,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter,
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.currentSelection = selectionAfter;
    this.redoStack.length = 0;
    this.notify('view', label);
    return true;
  }

  private assertSelectionAvailable(selection: EditorSelection): void {
    const hiddenOrLockedBrush = selectedBrushIds(selection).find((brushId) =>
      this.isBrushUnavailable(brushId),
    );
    if (hiddenOrLockedBrush) {
      throw new Error(`Cannot select hidden or locked brush ${hiddenOrLockedBrush}`);
    }
    const hiddenOrLockedEntity = selectedPointEntityIds(selection).find((entityId) =>
      this.isEntityUnavailable(entityId),
    );
    if (hiddenOrLockedEntity) {
      throw new Error(`Cannot select hidden or locked point entity ${hiddenOrLockedEntity}`);
    }
  }

  public undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.discardRepeatableCommands();
    if (entry.kind === 'replace-brush') {
      const current = findBrush(this.currentDocument, entry.brushId);
      if (!current) throw new Error(`Cannot undo change to missing brush ${entry.brushId}`);
      this.currentDocument = replaceBrush(
        this.currentDocument,
        revisionForApply(current, entry.before),
      );
    } else if (entry.kind === 'replace-brushes') {
      this.currentDocument = replaceBrushes(
        this.currentDocument,
        entry.edits.map((edit) => {
          const current = findBrush(this.currentDocument, edit.brushId);
          if (!current) throw new Error(`Cannot undo change to missing brush ${edit.brushId}`);
          return revisionForApply(current, edit.before);
        }),
      );
    } else if (entry.kind === 'create-brush') {
      this.currentDocument = removeBrush(this.currentDocument, entry.brush.id);
      if (this.currentSelection?.brushId === entry.brush.id) this.currentSelection = null;
    } else if (entry.kind === 'delete-brush') {
      this.currentDocument = insertBrush(
        this.currentDocument,
        entry.entityId,
        entry.brush,
        entry.insertionIndex,
      );
      this.currentSelection = { brushId: entry.brush.id };
    } else if (entry.kind === 'create-brushes') {
      this.currentDocument = removeBrushes(
        this.currentDocument,
        entry.insertions.map((insertion) => insertion.brush.id),
      );
      this.currentSelection = entry.selectionBefore ?? null;
    } else if (entry.kind === 'delete-brushes') {
      this.currentDocument = insertBrushes(this.currentDocument, entry.insertions);
      this.currentSelection = createBrushSelection(
        entry.insertions.map((insertion) => insertion.brush.id),
      );
    } else if (entry.kind === 'clip-brush') {
      const currentOriginal = entry.after
        .map((brush) => findBrush(this.currentDocument, brush.id))
        .find((brush) => brush?.id === entry.before.id);
      const restored = {
        ...entry.before,
        revision: (currentOriginal?.revision ?? entry.before.revision) + 1,
      };
      this.currentDocument = replaceBrushSequence(
        this.currentDocument,
        entry.entityId,
        entry.insertionIndex,
        entry.after.map((brush) => brush.id),
        [restored],
      );
      this.currentSelection = { brushId: restored.id };
    } else if (entry.kind === 'clip-brushes') {
      const sequences: BrushSequenceReplacement[] = entry.edits.toReversed().map((edit) => {
        const currentOriginal = edit.after
          .map((brush) => findBrush(this.currentDocument, brush.id))
          .find((brush) => brush?.id === edit.before.id);
        return {
          entityId: edit.entityId,
          insertionIndex: edit.afterInsertionIndex,
          expectedBrushIds: edit.after.map((brush) => brush.id),
          replacements: [
            {
              ...edit.before,
              revision: (currentOriginal?.revision ?? edit.before.revision) + 1,
            },
          ],
        };
      });
      this.currentDocument = replaceBrushSequences(this.currentDocument, sequences);
      this.currentSelection = createBrushSelection(entry.selectionBefore);
    } else if (entry.kind === 'replace-brush-sequences') {
      const sequences: BrushSequenceReplacement[] = entry.edits.toReversed().map((edit) => {
        const currentOriginal = edit.after
          .map((brush) => findBrush(this.currentDocument, brush.id))
          .find((brush) => brush?.id === edit.before.id);
        return {
          entityId: edit.entityId,
          insertionIndex: edit.afterInsertionIndex,
          expectedBrushIds: edit.after.map((brush) => brush.id),
          replacements: [
            {
              ...edit.before,
              revision: (currentOriginal?.revision ?? edit.before.revision) + 1,
            },
          ],
        };
      });
      this.currentDocument = replaceBrushSequences(this.currentDocument, sequences);
      this.currentSelection = createBrushSelection(entry.selectionBefore);
    } else if (entry.kind === 'replace-entity-properties') {
      this.currentDocument = replaceEntityProperties(
        this.currentDocument,
        entry.entityId,
        entry.before,
      );
    } else if (entry.kind === 'view-state') {
      this.applyObjectViewState(entry.before);
      this.currentSelection = entry.selectionBefore;
    } else {
      this.currentDocument = documentRevisionForApply(this.currentDocument, entry.before);
      this.currentSelection = entry.selectionBefore;
    }
    this.redoStack.push(entry);
    this.notify(entry.kind === 'view-state' ? 'view' : 'history', `Undo ${entry.label}`);
    return true;
  }

  public redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.discardRepeatableCommands();
    if (entry.kind === 'replace-brush') {
      const current = findBrush(this.currentDocument, entry.brushId);
      if (!current) throw new Error(`Cannot redo change to missing brush ${entry.brushId}`);
      this.currentDocument = replaceBrush(
        this.currentDocument,
        revisionForApply(current, entry.after),
      );
    } else if (entry.kind === 'replace-brushes') {
      this.currentDocument = replaceBrushes(
        this.currentDocument,
        entry.edits.map((edit) => {
          const current = findBrush(this.currentDocument, edit.brushId);
          if (!current) throw new Error(`Cannot redo change to missing brush ${edit.brushId}`);
          return revisionForApply(current, edit.after);
        }),
      );
    } else if (entry.kind === 'create-brush') {
      this.currentDocument = insertBrush(
        this.currentDocument,
        entry.entityId,
        entry.brush,
        entry.insertionIndex,
      );
      this.currentSelection = { brushId: entry.brush.id };
    } else if (entry.kind === 'delete-brush') {
      this.currentDocument = removeBrush(this.currentDocument, entry.brush.id);
      if (this.currentSelection?.brushId === entry.brush.id) this.currentSelection = null;
    } else if (entry.kind === 'create-brushes') {
      this.currentDocument = insertBrushes(this.currentDocument, entry.insertions);
      this.currentSelection = createBrushSelection(
        entry.selectionAfter ?? entry.insertions.map((insertion) => insertion.brush.id),
      );
    } else if (entry.kind === 'delete-brushes') {
      this.currentDocument = removeBrushes(
        this.currentDocument,
        entry.insertions.map((insertion) => insertion.brush.id),
      );
      this.currentSelection = null;
    } else if (entry.kind === 'clip-brush') {
      const current = findBrush(this.currentDocument, entry.before.id);
      if (!current) throw new Error(`Cannot redo clip of missing brush ${entry.before.id}`);
      const reapplied = entry.after.map((brush) =>
        brush.id === current.id ? revisionForApply(current, brush) : brush,
      );
      this.currentDocument = replaceBrushSequence(
        this.currentDocument,
        entry.entityId,
        entry.insertionIndex,
        [entry.before.id],
        reapplied,
      );
      this.currentSelection = reapplied[0] ? { brushId: reapplied[0].id } : null;
    } else if (entry.kind === 'clip-brushes') {
      const sequences: BrushSequenceReplacement[] = entry.edits.map((edit) => {
        const current = findBrush(this.currentDocument, edit.before.id);
        if (!current) throw new Error(`Cannot redo clip of missing brush ${edit.before.id}`);
        return {
          entityId: edit.entityId,
          insertionIndex: edit.insertionIndex,
          expectedBrushIds: [edit.before.id],
          replacements: edit.after.map((brush) =>
            brush.id === current.id ? revisionForApply(current, brush) : brush,
          ),
        };
      });
      this.currentDocument = replaceBrushSequences(this.currentDocument, sequences);
      this.currentSelection = createBrushSelection(entry.selectionAfter);
    } else if (entry.kind === 'replace-brush-sequences') {
      const sequences: BrushSequenceReplacement[] = entry.edits.map((edit) => {
        const current = findBrush(this.currentDocument, edit.before.id);
        if (!current) {
          throw new Error(`Cannot redo brush replacement of missing brush ${edit.before.id}`);
        }
        return {
          entityId: edit.entityId,
          insertionIndex: edit.insertionIndex,
          expectedBrushIds: [edit.before.id],
          replacements: edit.after.map((brush) =>
            brush.id === current.id ? revisionForApply(current, brush) : brush,
          ),
        };
      });
      this.currentDocument = replaceBrushSequences(this.currentDocument, sequences);
      this.currentSelection = createBrushSelection(entry.selectionAfter);
    } else if (entry.kind === 'replace-entity-properties') {
      this.currentDocument = replaceEntityProperties(
        this.currentDocument,
        entry.entityId,
        entry.after,
      );
    } else if (entry.kind === 'view-state') {
      this.applyObjectViewState(entry.after);
      this.currentSelection = entry.selectionAfter;
    } else {
      this.currentDocument = documentRevisionForApply(this.currentDocument, entry.after);
      this.currentSelection = entry.selectionAfter;
    }
    this.undoStack.push(entry);
    this.notify(entry.kind === 'view-state' ? 'view' : 'history', `Redo ${entry.label}`);
    return true;
  }

  private notify(kind: EditorSessionChange['kind'], label: string): void {
    const change = { kind, label, documentRevision: this.currentDocument.revision } as const;
    for (const listener of this.listeners) listener(change);
  }
}
