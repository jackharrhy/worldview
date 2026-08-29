import type {
  CollaborationEdit,
  CollaborationOperation,
  MapDocument,
} from '@jackharrhy/worldview-editor/core';

export type ClientFrame =
  | { readonly type: 'operation'; readonly operation: CollaborationOperation }
  | { readonly type: 'presence'; readonly presence: PresenceState };

export type ServerFrame =
  | {
      readonly type: 'ready';
      readonly roomVersion: number;
      readonly document: MapDocument | null;
    }
  | {
      readonly type: 'operation';
      readonly roomVersion: number;
      readonly operation: CollaborationOperation;
    }
  | {
      readonly type: 'ack';
      readonly operationId: string;
      readonly roomVersion: number;
    }
  | {
      readonly type: 'conflict';
      readonly operationId: string;
      readonly conflicts: readonly unknown[];
    }
  | { readonly type: 'presence'; readonly presence: PresenceState }
  | { readonly type: 'error'; readonly message: string };

export interface PresenceState {
  readonly actorId: string;
  readonly displayName?: string;
  readonly color?: string;
  readonly selectedObjectIds?: readonly string[];
  readonly viewport?: 'perspective' | 'xy' | 'xz' | 'yz';
  readonly pointer?: readonly [number, number, number];
  readonly tool?: string;
  readonly preview?: {
    readonly interactionId: string;
    readonly sequence: number;
    readonly baseRoomVersion: number;
    readonly edits: readonly CollaborationEdit[];
  };
  readonly sentAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isBrush(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    Number.isInteger(value.revision) &&
    Array.isArray(value.faces) &&
    value.faces.length >= 4 &&
    value.faces.length <= 1_024
  );
}

function isEdit(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'replace-brush') {
    return (
      typeof value.brushId === 'string' &&
      Number.isInteger(value.baseRevision) &&
      isBrush(value.brush)
    );
  }
  if (value.kind === 'insert-brush') {
    return (
      typeof value.entityId === 'string' &&
      Number.isInteger(value.insertionIndex) &&
      isBrush(value.brush)
    );
  }
  if (value.kind === 'delete-brush') {
    return typeof value.brushId === 'string' && Number.isInteger(value.baseRevision);
  }
  return (
    value.kind === 'replace-entity-properties' &&
    typeof value.entityId === 'string' &&
    isStringRecord(value.baseProperties) &&
    isStringRecord(value.properties)
  );
}

export function parseClientFrame(value: string | ArrayBuffer): ClientFrame {
  if (typeof value !== 'string') throw new Error('Binary collaboration frames are not supported');
  if (value.length > 512 * 1024) throw new Error('Collaboration frame is too large');
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed) || (parsed.type !== 'operation' && parsed.type !== 'presence')) {
    throw new Error('Unknown collaboration frame');
  }
  if (parsed.type === 'presence') {
    if (
      !isRecord(parsed.presence) ||
      typeof parsed.presence.actorId !== 'string' ||
      parsed.presence.actorId.length > 128 ||
      typeof parsed.presence.sentAt !== 'number'
    ) {
      throw new Error('Presence requires an actorId');
    }
    const presence = parsed.presence;
    if (
      (presence.selectedObjectIds !== undefined &&
        (!Array.isArray(presence.selectedObjectIds) ||
          presence.selectedObjectIds.length > 1_000 ||
          !presence.selectedObjectIds.every((id) => typeof id === 'string'))) ||
      (presence.pointer !== undefined &&
        (!Array.isArray(presence.pointer) ||
          presence.pointer.length !== 3 ||
          !presence.pointer.every(
            (component) => typeof component === 'number' && Number.isFinite(component),
          ))) ||
      (presence.preview !== undefined &&
        (!isRecord(presence.preview) ||
          typeof presence.preview.interactionId !== 'string' ||
          !Number.isInteger(presence.preview.sequence) ||
          !Number.isInteger(presence.preview.baseRoomVersion) ||
          !Array.isArray(presence.preview.edits) ||
          presence.preview.edits.length > 256 ||
          !presence.preview.edits.every(isEdit)))
    ) {
      throw new Error('Invalid presence payload');
    }
    return parsed as ClientFrame;
  }
  if (!isRecord(parsed.operation)) throw new Error('Operation frame requires an operation');
  const operation = parsed.operation;
  if (
    operation.schemaVersion !== 1 ||
    typeof operation.operationId !== 'string' ||
    operation.operationId.length < 1 ||
    operation.operationId.length > 128 ||
    typeof operation.transactionId !== 'string' ||
    typeof operation.actorId !== 'string' ||
    typeof operation.baseRoomVersion !== 'number' ||
    typeof operation.label !== 'string' ||
    !Array.isArray(operation.edits) ||
    operation.edits.length > 1_000 ||
    !operation.edits.every(isEdit) ||
    (operation.inverseEdits !== undefined &&
      (!Array.isArray(operation.inverseEdits) || !operation.inverseEdits.every(isEdit)))
  ) {
    throw new Error('Invalid collaboration operation');
  }
  return parsed as ClientFrame;
}
