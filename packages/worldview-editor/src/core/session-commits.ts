import { insertBrush, insertBrushes, replaceBrush, replaceBrushes } from './document.js';
import { deriveBrush } from './geometry.js';
import { applyHistoryEntry } from './history.js';
import {
  applyCollaborationOperation,
  type CollaborationApplyResult,
  type CollaborationOperation,
} from './collaboration.js';
import { createBrushSelection } from './selection.js';
import type { EditorObjectViewState, EditorSelection, MapDocument } from './types.js';
import { findBrush } from './types.js';
import {
  documentRevisionForApply,
  type BrushBatchCreationCandidate,
  type BrushBatchEditCandidate,
  type BrushCreationCandidate,
  type BrushEditCandidate,
  type DocumentEditCandidate,
  type SessionCommitMutation,
} from './session-common.js';
import { SessionKernel } from './session-kernel.js';

type SessionCommitKernel = Pick<
  SessionKernel,
  | 'applyObjectViewState'
  | 'discardRepeatableCommands'
  | 'document'
  | 'history'
  | 'notify'
  | 'recordRepeatableCommand'
  | 'selection'
  | 'snapshotObjectViewState'
>;

export interface SessionCommitPorts {
  readonly hasLinkedEditingGroup: (document?: MapDocument) => boolean;
  readonly synchronizeEditingGroup: (document: MapDocument) => MapDocument;
}

export class SessionCommitCommands {
  public constructor(
    private readonly kernel: SessionCommitKernel,
    private readonly ports: SessionCommitPorts,
  ) {}

  private get currentDocument() {
    return this.kernel.document;
  }

  private set currentDocument(document: MapDocument) {
    this.kernel.document = document;
  }

  private get currentSelection() {
    return this.kernel.selection;
  }

  private set currentSelection(selection: EditorSelection | null) {
    this.kernel.selection = selection;
  }

  private get history() {
    return this.kernel.history;
  }

  private discardRepeatableCommands(): void {
    this.kernel.discardRepeatableCommands();
  }

  private recordRepeatableCommand(command: DocumentEditCandidate['repeatable']): void {
    this.kernel.recordRepeatableCommand(command);
  }

  private hasLinkedEditingGroup(document = this.currentDocument): boolean {
    return this.ports.hasLinkedEditingGroup(document);
  }

  private synchronizeEditingGroup(document: MapDocument): MapDocument {
    return this.ports.synchronizeEditingGroup(document);
  }

  /** The only generic document/history mutation point used by command domains. */
  public commitMutation(mutation: SessionCommitMutation): void {
    this.currentDocument = mutation.document;
    this.currentSelection = mutation.selection;
    this.history.record(mutation.historyEntry);
    this.notify(mutation.changeKind ?? 'document', mutation.historyEntry.label);
  }

  /** Applies an already sequenced remote commit without adding it to this actor's undo stack. */
  public applyRemoteCollaborationOperation(
    operation: CollaborationOperation,
  ): CollaborationApplyResult {
    const result = applyCollaborationOperation(this.currentDocument, operation);
    if (result.status !== 'applied') return result;
    this.currentDocument = result.document;
    this.discardRepeatableCommands();
    this.notify('document', operation.label);
    return result;
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
    this.commitMutation({
      document: replaceBrush(this.currentDocument, candidate.after),
      selection: this.currentSelection,
      historyEntry: {
        kind: 'replace-brush',
        label: candidate.label,
        brushId: candidate.brushId,
        before: candidate.before,
        after: candidate.after,
      },
    });
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
    this.commitMutation({
      document: replaceBrushes(
        this.currentDocument,
        candidate.edits.map((edit) => edit.after),
      ),
      selection: this.currentSelection,
      historyEntry: {
        kind: 'replace-brushes',
        label: candidate.label,
        edits: candidate.edits,
      },
    });
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
    this.commitMutation({
      document: insertBrush(
        this.currentDocument,
        candidate.entityId,
        candidate.brush,
        candidate.insertionIndex,
      ),
      selection: { brushId: candidate.brush.id },
      historyEntry: {
        kind: 'create-brush',
        label: candidate.label,
        entityId: candidate.entityId,
        insertionIndex: candidate.insertionIndex,
        brush: candidate.brush,
      },
    });
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
    this.commitMutation({
      document: insertBrushes(this.currentDocument, candidate.insertions),
      selection: createBrushSelection(candidate.selectionAfter),
      historyEntry: {
        kind: 'create-brushes',
        label: candidate.label,
        insertions: candidate.insertions,
        selectionBefore: candidate.selectionBefore,
        selectionAfter: candidate.selectionAfter,
      },
    });
  }

  public commitDocumentCandidate(candidate: DocumentEditCandidate): void {
    if (this.currentDocument.revision !== candidate.baseDocumentRevision) {
      throw new Error('Cannot commit a document candidate from a stale document revision');
    }
    const synchronizedAfter = this.synchronizeEditingGroup(candidate.after);
    this.recordRepeatableCommand(candidate.repeatable);
    this.commitMutation({
      document: documentRevisionForApply(this.currentDocument, synchronizedAfter),
      selection: candidate.selectionAfter,
      historyEntry: {
        kind: 'replace-document',
        label: candidate.label,
        before: candidate.before,
        after: synchronizedAfter,
        selectionBefore: candidate.selectionBefore,
        selectionAfter: candidate.selectionAfter,
      },
    });
  }

  private snapshotObjectViewState(): EditorObjectViewState {
    return this.kernel.snapshotObjectViewState();
  }

  private applyObjectViewState(state: EditorObjectViewState): void {
    this.kernel.applyObjectViewState(state);
  }

  public commitObjectViewState(
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
    this.commitMutation({
      document: this.currentDocument,
      selection: selectionAfter,
      historyEntry: {
        kind: 'view-state',
        label,
        before,
        after,
        selectionBefore: this.currentSelection,
        selectionAfter,
      },
      changeKind: 'view',
    });
    return true;
  }

  private applyHistory(direction: 'undo' | 'redo'): boolean {
    const entry = direction === 'undo' ? this.history.takeUndo() : this.history.takeRedo();
    if (!entry) return false;

    this.discardRepeatableCommands();
    const next = applyHistoryEntry(
      {
        document: this.currentDocument,
        selection: this.currentSelection,
        objectViewState: this.snapshotObjectViewState(),
      },
      entry,
      direction,
    );
    this.currentDocument = next.document;
    this.currentSelection = next.selection;
    this.applyObjectViewState(next.objectViewState);

    if (direction === 'undo') this.history.completeUndo(entry);
    else this.history.completeRedo(entry);
    const changeKind = entry.kind === 'view-state' ? 'view' : 'history';
    const action = direction === 'undo' ? 'Undo' : 'Redo';
    this.notify(changeKind, `${action} ${entry.label}`);
    return true;
  }

  public undo(): boolean {
    return this.applyHistory('undo');
  }

  public redo(): boolean {
    return this.applyHistory('redo');
  }

  private notify(kind: 'document' | 'selection' | 'history' | 'view', label: string): void {
    this.kernel.notify(kind, label);
  }
}
