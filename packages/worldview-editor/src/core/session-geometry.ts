import {
  clipBrush,
  cloneBrush,
  convexMergeBrushes,
  insertBrushes,
  hollowBrush,
  intersectBrushes,
  moveBrushFace,
  replaceBrush,
  replaceBrushes,
  replaceBrushSequence,
  replaceBrushSequences,
  splitBrushFace,
  subtractBrush,
  type BrushInsertion,
} from './document.js';
import { deriveBrush } from './geometry.js';
import { type BrushClipEdit, type BrushEdit } from './history.js';
import { stampBrushFace } from './sweep.js';
import {
  createBrushSelection,
  extrudableBrushFaces,
  matchingBrushFaces,
  selectedBrushIds,
  selectedFaceReferences,
} from './selection.js';
import type {
  BrushId,
  BrushSelection,
  EntityId,
  FaceSelection,
  IdFactory,
  MapBrush,
  Vec3,
} from './types.js';
import { findBrush } from './types.js';
import {
  type BrushEditCandidate,
  type BrushBatchEditCandidate,
  type BrushBatchCreationCandidate,
  type BrushClipCandidate,
  type BrushBatchClipCandidate,
  type BrushSequenceCandidate,
  type BrushClipMode,
  type BrushCreationCandidate,
  type DocumentEditCandidate,
  type SessionCommitMutation,
} from './session-common.js';
import { SessionKernel } from './session-kernel.js';

type SessionGeometryKernel = Pick<SessionKernel, 'document' | 'selection'>;

export interface SessionGeometryPorts {
  readonly commitCandidate: (candidate: BrushEditCandidate | BrushBatchEditCandidate) => void;
  readonly commitDocumentCandidate: (candidate: DocumentEditCandidate) => void;
  readonly commitCreationCandidate: (candidate: BrushCreationCandidate) => void;
  readonly commitBatchCreationCandidate: (candidate: BrushBatchCreationCandidate) => void;
  readonly createBrushCandidate: (brush: MapBrush, entityId?: EntityId) => BrushCreationCandidate;
  readonly commitMutation: (mutation: SessionCommitMutation) => void;
  readonly hasLinkedEditingGroup: (document?: import('./types.js').MapDocument) => boolean;
  readonly isBrushUnavailable: (brushId: BrushId) => boolean;
}

export class SessionGeometryCommands {
  public constructor(
    private readonly kernel: SessionGeometryKernel,
    private readonly ports: SessionGeometryPorts,
  ) {}

  private get currentDocument() {
    return this.kernel.document;
  }

  private get currentSelection() {
    return this.kernel.selection;
  }

  private commitCandidate(candidate: BrushEditCandidate | BrushBatchEditCandidate): void {
    this.ports.commitCandidate(candidate);
  }

  private commitDocumentCandidate(candidate: DocumentEditCandidate): void {
    this.ports.commitDocumentCandidate(candidate);
  }

  private commitCreationCandidate(candidate: BrushCreationCandidate): void {
    this.ports.commitCreationCandidate(candidate);
  }

  private commitBatchCreationCandidate(candidate: BrushBatchCreationCandidate): void {
    this.ports.commitBatchCreationCandidate(candidate);
  }

  private createBrushCandidate(brush: MapBrush, entityId?: EntityId): BrushCreationCandidate {
    return this.ports.createBrushCandidate(brush, entityId);
  }

  private hasLinkedEditingGroup(document = this.currentDocument): boolean {
    return this.ports.hasLinkedEditingGroup(document);
  }

  private isBrushUnavailable(brushId: BrushId): boolean {
    return this.ports.isBrushUnavailable(brushId);
  }
  public extrudeSelectedFace(distance: number): boolean {
    const faces = selectedFaceReferences(this.currentSelection);
    if (faces.length === 0 || !this.currentSelection?.faceId) return false;
    const candidate = this.createFaceSetExtrusionCandidate(
      faces,
      {
        brushId: this.currentSelection.brushId,
        faceId: this.currentSelection.faceId,
      },
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
    const matching = extrudableBrushFaces(
      this.currentDocument,
      primary,
      normalized.map((face) => face.brushId),
    );
    const matchingKeys = new Set(matching.map((face) => `${face.brushId}\u0000${face.faceId}`));
    if (
      matchingKeys.size !== normalized.length ||
      normalized.some((face) => !matchingKeys.has(`${face.brushId}\u0000${face.faceId}`))
    ) {
      throw new Error('Shared extrusion requires compatible coplanar faces');
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
        entity.primitives.some((brush) => brush.id === before.id),
      );
      if (!owner) throw new Error(`Unknown owner for brush ${before.id}`);
      const insertionIndex = owner.primitives.findIndex((brush) => brush.id === before.id);
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
        return Object.assign({}, edit, {
          afterInsertionIndex: edit.insertionIndex + offset,
        });
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
      entity.primitives.some((brush) => brush.id === source.id),
    );
    if (!owner) throw new Error(`Stamp source brush ${source.id} has no owning entity`);
    const brush = stampBrushFace(source, primary.faceId, distance, ids, textureLock);
    const insertion: BrushInsertion = {
      entityId: owner.id,
      insertionIndex: owner.primitives.length,
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
      {
        brushId: this.currentSelection.brushId,
        faceId: this.currentSelection.faceId,
      },
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
        return Object.assign({}, edit, {
          afterInsertionIndex: edit.insertionIndex + offset,
        });
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
      entity.primitives.some((brush) => brush.id === brushId),
    );
    if (!owner) return null;
    const insertionIndex = owner.primitives.findIndex((brush) => brush.id === brushId);
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
    const document = replaceBrushSequence(
      this.currentDocument,
      candidate.entityId,
      candidate.insertionIndex,
      [candidate.before.id],
      candidate.after,
    );
    this.ports.commitMutation({
      document,
      selection: candidate.after[0] ? { brushId: candidate.after[0].id } : null,
      historyEntry: {
        kind: 'clip-brush',
        label: candidate.label,
        entityId: candidate.entityId,
        insertionIndex: candidate.insertionIndex,
        before: candidate.before,
        after: candidate.after,
      },
    });
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
    const document = replaceBrushSequences(
      this.currentDocument,
      candidate.edits.map((edit) => ({
        entityId: edit.entityId,
        insertionIndex: edit.insertionIndex,
        expectedBrushIds: [edit.before.id],
        replacements: edit.after,
      })),
    );
    this.ports.commitMutation({
      document,
      selection: createBrushSelection(candidate.selectionAfter),
      historyEntry: {
        kind: 'clip-brushes',
        label: candidate.label,
        edits: candidate.edits,
        selectionBefore: candidate.selectionBefore,
        selectionAfter: candidate.selectionAfter,
      },
    });
  }

  private createSequenceCandidate(
    label: string,
    replacements: ReadonlyMap<BrushId, readonly MapBrush[]>,
    selectionAfter: readonly BrushId[],
  ): BrushSequenceCandidate | null {
    if (replacements.size === 0) return null;
    const rawEdits: BrushClipEdit[] = [];
    for (const entity of this.currentDocument.entities) {
      for (const [insertionIndex, brush] of entity.primitives.entries()) {
        if (brush.kind !== 'brush') continue;
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
      return Object.assign({}, edit, {
        afterInsertionIndex: edit.insertionIndex + offset,
      });
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
    const document = replaceBrushSequences(
      this.currentDocument,
      candidate.edits.map((edit) => ({
        entityId: edit.entityId,
        insertionIndex: edit.insertionIndex,
        expectedBrushIds: [edit.before.id],
        replacements: edit.after,
      })),
    );
    this.ports.commitMutation({
      document,
      selection: createBrushSelection(candidate.selectionAfter),
      historyEntry: {
        kind: 'replace-brush-sequences',
        label: candidate.label,
        edits: candidate.edits,
        selectionBefore: candidate.selectionBefore,
        selectionAfter: candidate.selectionAfter,
      },
    });
  }

  public csgConvexMergeSelected(ids: IdFactory, currentMaterial?: string): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const selected = new Set(selectedBrushIds(this.currentSelection));
    if (selected.size < 2) return false;
    const inputs = this.currentDocument.entities.flatMap((entity) =>
      entity.primitives.filter(
        (brush): brush is MapBrush => brush.kind === 'brush' && selected.has(brush.id),
      ),
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
      entity.primitives.filter(
        (brush): brush is MapBrush => brush.kind === 'brush' && selected.has(brush.id),
      ),
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
      entity.primitives.filter(
        (brush): brush is MapBrush => brush.kind === 'brush' && selected.has(brush.id),
      ),
    );
    if (subtrahends.length !== selected.size) return false;
    const replacements = new Map<BrushId, readonly MapBrush[]>();
    const selectionAfter: BrushId[] = [];
    for (const entity of this.currentDocument.entities) {
      for (const brush of entity.primitives) {
        if (brush.kind !== 'brush') continue;
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
      for (const brush of entity.primitives) {
        if (brush.kind !== 'brush') continue;
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
}
