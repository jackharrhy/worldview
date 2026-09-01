import {
  applyCollaborationOperation,
  collaborationEditsBetween,
  COLLABORATION_SCHEMA_VERSION,
  planMapSave,
  rebaseMapSource,
  selectedBrushIds,
  selectedPointEntityIds,
  type CollaborationOperation,
  type MapDocument,
} from '@jackharrhy/worldview-editor/core';
import { HostedMapSnapshotSchema } from '@worldview/protocol';

import {
  CollaborationController,
  CollaborationSocketClient,
  EditorCollaborationBridge,
  IndexedDbCollaborationOutbox,
  reconcilePendingOperations,
  type CollaborationPresence,
  type DetachedHostedMap,
  type JoinCollaborationOptions,
} from './collaboration.js';
import type { EditorShellState } from './editor-shell-state.js';
import type { EditorStatePort } from './editor-state-port.js';
import type { ReplaceDocumentCommand } from './editor-application-contracts.js';

const COLLABORATOR_RENDER_COLORS: Readonly<Record<string, readonly [number, number, number]>> = {
  red: [0.95, 0.2, 0.18],
  orange: [0.98, 0.45, 0.12],
  yellow: [0.95, 0.78, 0.12],
  green: [0.18, 0.82, 0.35],
  cyan: [0.12, 0.78, 0.88],
  blue: [0.2, 0.42, 1],
  violet: [0.64, 0.3, 1],
  pink: [0.95, 0.32, 0.68],
};

type CollaborationSessionState = EditorStatePort<
  | 'activeTool'
  | 'activeGameProfile'
  | 'currentDocumentName'
  | 'currentMapSource'
  | 'documentKey'
  | 'lastPointerPosition'
  | 'renderer'
  | 'savedDocumentRevision'
  | 'session',
  'currentMapSource' | 'savedDocumentRevision'
>;

type CollaborationSessionUi = Pick<EditorShellState, 'statusMessage'>;

interface CollaborationDocumentCommands {
  replaceDocument: ReplaceDocumentCommand;
  setDocumentDirty(dirty: boolean): void;
}

interface ActiveCollaboration {
  readonly mapId: string;
  readonly bridge: EditorCollaborationBridge;
  readonly socket: CollaborationSocketClient;
  readonly presenceTimer: number;
  readonly unsubscribePresence: () => void;
  readonly publishPreview: (document: MapDocument) => void;
  readonly schedulePresence: () => void;
  readonly cancelPresence: () => void;
  readonly clearRemotePresence: () => void;
}

/** Owns the transport/runtime lifetime for one optional hosted-map collaboration session. */
export class CollaborationSession {
  private attempt: AbortController | null = null;
  private active: ActiveCollaboration | null = null;

  public constructor(
    private readonly state: CollaborationSessionState,
    private readonly ui: CollaborationSessionUi,
    private readonly document: CollaborationDocumentCommands,
    private readonly signal: AbortSignal,
  ) {}

  public publishPreview(document: MapDocument): void {
    this.active?.publishPreview(document);
  }

  public publishPointer(): void {
    this.active?.schedulePresence();
  }

  public async join(options: JoinCollaborationOptions): Promise<'started' | 'detached-local'> {
    this.close(false);
    const lifetime = new AbortController();
    this.attempt = lifetime;
    try {
      return await this.open(options, lifetime);
    } catch (error) {
      if (this.attempt === lifetime) this.attempt = null;
      lifetime.abort();
      throw error;
    }
  }

  public leave(announce = true): void {
    this.close(announce);
  }

  public dispose(): void {
    this.close(false);
  }

  private async open(
    options: JoinCollaborationOptions,
    lifetime: AbortController,
  ): Promise<'started' | 'detached-local'> {
    const signal = AbortSignal.any([this.signal, lifetime.signal]);
    signal.throwIfAborted();
    let detachedCopy: DetachedHostedMap | null = null;
    const applyDetachedCopy = (copy: DetachedHostedMap) => {
      if (detachedCopy) return;
      detachedCopy = copy;
      this.document.replaceDocument(copy.document, `Open detached copy of ${copy.fileName}`, {
        name: copy.fileName,
        source: copy.source,
        savedRevision: -1,
        dirty: true,
      });
      options.onDetached?.(copy);
      if (this.active?.mapId === options.mapId) this.close(false);
    };
    const captureRecovery = (document: MapDocument, mapVersion: number) => {
      const plan = planMapSave(document, this.state.currentMapSource);
      if (plan.status === 'blocked') {
        throw new Error('Cannot preserve this hosted edit as source-safe recovery data');
      }
      return {
        version: 1 as const,
        mapId: options.mapId,
        documentKey: this.state.documentKey,
        fileName: this.state.currentDocumentName,
        profile: this.state.activeGameProfile,
        document: structuredClone(document),
        source: rebaseMapSource(document, plan.text),
        savedDocumentRevision: this.state.savedDocumentRevision,
        mapVersion,
        updatedAt: Date.now(),
      };
    };
    const outbox = new IndexedDbCollaborationOutbox();
    const preflight = await outbox.connectionChanged(options.mapId, Date.now());
    if (preflight.status === 'detach') {
      const copy = await outbox.detach(options.mapId, preflight.reason, Date.now());
      if (!copy)
        throw new Error(
          'Offline edits exceeded their reconnect limit but have no recovery snapshot',
        );
      applyDetachedCopy(copy);
      return 'detached-local';
    }
    const roomUrl = new URL(
      `/sync/maps/${encodeURIComponent(options.mapId)}/snapshot`,
      options.endpoint,
    );
    const accessToken = await options.authorize?.(signal);
    signal.throwIfAborted();
    const authorizationHeaders = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    const snapshotResponse = await fetch(roomUrl, {
      headers: authorizationHeaders,
      signal,
    });
    if (!snapshotResponse.ok) throw new Error(`Cannot inspect room (${snapshotResponse.status})`);
    const snapshot = HostedMapSnapshotSchema.parse(await snapshotResponse.json());
    signal.throwIfAborted();
    const pendingAtOpen = await outbox.pending(options.mapId);
    const initial = reconcilePendingOperations(snapshot.document, pendingAtOpen);
    for (const conflict of initial.conflicts) {
      options.onConflict?.(conflict.operationId, conflict.details);
    }
    this.document.replaceDocument(initial.document, `Open hosted map ${options.mapId}`, {
      source: rebaseMapSource(snapshot.document, snapshot.source),
      savedRevision:
        pendingAtOpen.length === 0 ? initial.document.revision : this.state.savedDocumentRevision,
      dirty: pendingAtOpen.length > 0,
    });

    let bridge: EditorCollaborationBridge;
    const remotePresences = new Map<string, CollaborationPresence>();
    let previewDocument: MapDocument | null = null;
    let interactionId: string | null = null;
    let previewSequence = 0;
    let presenceFrame: number | null = null;
    let lastPresenceSentAt = 0;

    const renderRemotePresence = () => {
      if (signal.aborted) return;
      const canonical = this.state.session.document;
      this.state.renderer?.setRemotePresence(
        // oxlint-disable-next-line no-map-spread -- renderer overlays are immutable value objects.
        [...remotePresences.values()].map((presence) => {
          let document = canonical;
          const preview = presence.preview;
          if (preview) {
            const operation: CollaborationOperation = {
              schemaVersion: COLLABORATION_SCHEMA_VERSION,
              operationId: `preview:${presence.actorId}:${preview.interactionId}:${preview.sequence}`,
              transactionId: preview.interactionId,
              actorId: presence.actorId,
              baseMapVersion: preview.baseMapVersion,
              label: 'Remote preview',
              edits: preview.edits,
            };
            const result = applyCollaborationOperation(canonical, operation);
            if (result.status === 'applied') document = result.document;
          }
          const previewObjectIds: string[] = [];
          for (const edit of preview?.edits ?? []) {
            previewObjectIds.push(
              edit.kind === 'insert-entity'
                ? edit.entity.id
                : edit.kind === 'insert-brush'
                  ? edit.brush.id
                  : edit.kind === 'replace-entity-properties' || edit.kind === 'delete-entity'
                    ? edit.entityId
                    : edit.brushId,
            );
          }
          return {
            actorId: presence.actorId,
            color:
              COLLABORATOR_RENDER_COLORS[presence.color ?? ''] ?? COLLABORATOR_RENDER_COLORS.cyan!,
            document,
            selectedObjectIds: presence.selectedObjectIds ?? [],
            previewObjectIds,
            ...(presence.pointer ? { pointer: presence.pointer } : {}),
          };
        }),
      );
    };

    const receivePresence = (presence: CollaborationPresence) => {
      if (signal.aborted) return;
      const previous = remotePresences.get(presence.actorId);
      if (previous && presence.sentAt < previous.sentAt) return;
      if (
        previous?.preview &&
        presence.preview?.interactionId === previous.preview.interactionId &&
        presence.preview.sequence <= previous.preview.sequence
      ) {
        return;
      }
      remotePresences.set(presence.actorId, presence);
      renderRemotePresence();
      options.onPresence?.(presence);
    };

    let canonicalMapVersion = snapshot.mapVersion;
    const refreshSourceState = (status?: string) => {
      const plan = planMapSave(this.state.session.document, this.state.currentMapSource);
      if (plan.status === 'blocked') return;
      this.state.currentMapSource = rebaseMapSource(this.state.session.document, plan.text);
      void controller.pending().then((pending) => {
        if (signal.aborted || pending.length > 0) return;
        this.state.savedDocumentRevision = this.state.session.document.revision;
        this.document.setDocumentDirty(false);
        if (status) this.ui.statusMessage.set(status);
      });
    };
    const controller = new CollaborationController({
      mapId: options.mapId,
      actorId: options.actorId,
      outbox,
      captureRecovery,
      onDetached: applyDetachedCopy,
      onPeerOperation: (operation) => {
        if (signal.aborted) return;
        bridge.receive(operation);
        canonicalMapVersion = controller.getMapVersion();
        refreshSourceState();
        const presence = remotePresences.get(operation.actorId);
        if (presence?.preview) {
          const { preview: _preview, ...withoutPreview } = presence;
          remotePresences.set(operation.actorId, withoutPreview);
          renderRemotePresence();
        }
      },
      onAcknowledged: (_operationId, mapVersion) => {
        if (signal.aborted) return;
        canonicalMapVersion = mapVersion;
        refreshSourceState(`Hosted map saved · v${mapVersion}`);
      },
    });
    controller.setMapVersion(snapshot.mapVersion);
    bridge = new EditorCollaborationBridge(this.state.session, controller, (error) => {
      this.ui.statusMessage.set(
        error instanceof Error ? error.message : 'Collaboration operation failed',
      );
    });
    const socketEndpoint = new URL(options.endpoint);
    socketEndpoint.protocol = socketEndpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: CollaborationSocketClient;
    const sendPresence = () => {
      presenceFrame = null;
      if (signal.aborted) return false;
      lastPresenceSentAt = performance.now();
      const edits = previewDocument
        ? collaborationEditsBetween(this.state.session.document, previewDocument)
        : [];
      const presence: CollaborationPresence = {
        actorId: options.actorId,
        ...(options.displayName ? { displayName: options.displayName } : {}),
        ...(options.color ? { color: options.color } : {}),
        selectedObjectIds: [
          ...selectedBrushIds(this.state.session.selection),
          ...selectedPointEntityIds(this.state.session.selection),
        ],
        ...(this.state.lastPointerPosition
          ? {
              viewport: this.state.lastPointerPosition.viewport,
              pointer: this.state.lastPointerPosition.point,
            }
          : {}),
        tool: this.state.activeTool,
        ...(interactionId && edits.length > 0 && edits.length <= 256
          ? {
              preview: {
                interactionId,
                sequence: previewSequence,
                baseMapVersion: controller.getMapVersion(),
                edits,
              },
            }
          : {}),
        sentAt: Date.now(),
      };
      options.onLocalPresence?.(presence);
      return socket.sendPresence(presence);
    };
    const schedulePresence = () => {
      if (signal.aborted || presenceFrame !== null) return;
      const tick = (now: number) => {
        if (signal.aborted) {
          presenceFrame = null;
          return;
        }
        if (now - lastPresenceSentAt < 33) {
          presenceFrame = window.requestAnimationFrame(tick);
          return;
        }
        sendPresence();
      };
      presenceFrame = window.requestAnimationFrame(tick);
    };
    const publishPreview = (document: MapDocument) => {
      if (signal.aborted) return;
      previewDocument = document === this.state.session.document ? null : document;
      if (previewDocument) {
        interactionId ??= crypto.randomUUID();
        previewSequence += 1;
      } else {
        interactionId = null;
      }
      schedulePresence();
    };
    socket = new CollaborationSocketClient({
      endpoint: socketEndpoint.toString(),
      mapId: options.mapId,
      actorId: options.actorId,
      ...(options.authorize ? { authorize: () => options.authorize!(signal) } : {}),
      controller,
      onPresence: receivePresence,
      ...(options.onConflict ? { onConflict: options.onConflict } : {}),
      ...(options.onConnectionChange ? { onConnectionChange: options.onConnectionChange } : {}),
      onReady: async (ready) => {
        if (signal.aborted) return;
        const pending = await controller.pending();
        if (signal.aborted) return;
        if (ready.mapVersion > canonicalMapVersion || pending.length > 0) {
          const reconciliation = reconcilePendingOperations(ready.document, pending);
          for (const conflict of reconciliation.conflicts) {
            options.onConflict?.(conflict.operationId, conflict.details);
          }
          bridge.synchronize(() =>
            this.document.replaceDocument(
              reconciliation.document,
              `Synchronize map ${options.mapId}`,
              {
                source: rebaseMapSource(ready.document, ready.source),
                savedRevision:
                  pending.length === 0
                    ? reconciliation.document.revision
                    : this.state.savedDocumentRevision,
                dirty: pending.length > 0,
              },
            ),
          );
          refreshSourceState();
          canonicalMapVersion = ready.mapVersion;
        }
        sendPresence();
      },
      onError: (error) => {
        if (signal.aborted) return;
        this.ui.statusMessage.set(
          error instanceof Error ? error.message : 'Collaboration connection failed',
        );
      },
    });
    const presenceTimer = window.setInterval(sendPresence, 2_000);
    const unsubscribePresence = this.state.session.subscribe((change) => {
      if (change.kind === 'selection' || change.kind === 'document' || change.kind === 'history') {
        sendPresence();
      }
    });
    signal.throwIfAborted();
    if (this.attempt !== lifetime) {
      lifetime.abort();
      signal.throwIfAborted();
    }
    this.active = {
      mapId: options.mapId,
      bridge,
      socket,
      presenceTimer,
      unsubscribePresence,
      publishPreview,
      schedulePresence,
      cancelPresence: () => {
        if (presenceFrame === null) return;
        window.cancelAnimationFrame(presenceFrame);
        presenceFrame = null;
      },
      clearRemotePresence: () => {
        remotePresences.clear();
        this.state.renderer?.setRemotePresence([]);
      },
    };
    socket.connect();
    this.ui.statusMessage.set(`Joined collaboration room ${options.mapId}.`);
    return 'started';
  }

  private close(announce: boolean): void {
    this.attempt?.abort();
    this.attempt = null;
    const collaboration = this.active;
    if (!collaboration) return;
    this.active = null;
    window.clearInterval(collaboration.presenceTimer);
    collaboration.cancelPresence();
    collaboration.unsubscribePresence();
    collaboration.clearRemotePresence();
    collaboration.socket.close();
    collaboration.bridge.close();
    if (announce) {
      this.ui.statusMessage.set(
        `Left collaboration room ${collaboration.mapId}; editing remains local.`,
      );
    }
  }
}
