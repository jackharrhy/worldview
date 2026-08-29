import { BuildPresenter } from './build-presenter.js';
import { CommandEvents } from './command-events.js';
import { ContextMenuPresenter } from './context-menu-presenter.js';
import { DocumentPresenter } from './document-presenter.js';
import type { EditorElements } from './editor-elements.js';
import { EditorState, type EditorStateHost } from './editor-state.js';
import { EntityPresenter } from './entity-presenter.js';
import { GeometryToolPresenter } from './geometry-tool-presenter.js';
import { InspectorPresenter } from './inspector-presenter.js';
import { KeyboardEvents } from './keyboard-events.js';
import { MaterialsPresenter } from './materials-presenter.js';
import { OrganizationEvents } from './organization-events.js';
import { OrganizationPresenter } from './organization-presenter.js';
import { ProjectPresenter } from './project-presenter.js';
import { RendererPresenter } from './renderer-presenter.js';
import { SessionPresenter } from './session-presenter.js';
import { ToolEvents } from './tool-events.js';
import { ThemePresenter } from './theme-presenter.js';
import { CollaborationPresenter } from './collaboration-presenter.js';
import { TransformToolPresenter } from './transform-tool-presenter.js';
import { WebMcpPresenter } from './webmcp-presenter.js';
import {
  applyCollaborationOperation,
  collaborationEditsBetween,
  COLLABORATION_SCHEMA_VERSION,
  selectedBrushIds,
  selectedPointEntityIds,
  planMapSave,
  rebaseMapSource,
  type CollaborationOperation,
  type MapDocument,
} from '@jackharrhy/worldview-editor/core';

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
import {
  CollaborationController,
  CollaborationSocketClient,
  EditorCollaborationBridge,
  reconcilePendingOperations,
  type CollaborationPresence,
  type JoinCollaborationOptions,
} from './collaboration.js';

export class EditorApplication implements EditorStateHost {
  public readonly state: EditorState;
  public readonly document: DocumentPresenter;
  public readonly geometry: GeometryToolPresenter;
  public readonly transform: TransformToolPresenter;
  public readonly entity: EntityPresenter;
  public readonly build: BuildPresenter;
  public readonly organization: OrganizationPresenter;
  public readonly inspector: InspectorPresenter;
  public readonly materials: MaterialsPresenter;
  public readonly session: SessionPresenter;
  public readonly contextMenu: ContextMenuPresenter;
  public readonly project: ProjectPresenter;
  public readonly renderer: RendererPresenter;
  public readonly webmcp: WebMcpPresenter;
  public readonly theme: ThemePresenter;
  public readonly collaborationUi: CollaborationPresenter;
  private readonly organizationEvents = new OrganizationEvents(this);
  private readonly commandEvents = new CommandEvents(this);
  private readonly toolEvents = new ToolEvents(this);
  private readonly keyboardEvents = new KeyboardEvents(this);
  private collaboration: {
    readonly mapId: string;
    readonly bridge: EditorCollaborationBridge;
    readonly socket: CollaborationSocketClient;
    readonly presenceTimer: number;
    readonly unsubscribePresence: () => void;
    readonly publishPreview: (document: MapDocument) => void;
    readonly schedulePresence: () => void;
    readonly clearRemotePresence: () => void;
  } | null = null;

  public constructor(public readonly ui: EditorElements) {
    this.state = new EditorState(ui, () => this);
    this.theme = new ThemePresenter(this.state, ui);
    this.collaborationUi = new CollaborationPresenter(
      ui,
      (options) => this.joinCollaboration(options),
      () => this.leaveCollaboration(),
    );
    this.entity = new EntityPresenter(this.state, ui);
    this.organization = new OrganizationPresenter(this.state, ui);
    this.document = new DocumentPresenter(this.state, ui, (tool) =>
      this.session.setEditorTool(tool),
    );
    this.build = new BuildPresenter(this.state, ui, this.document);
    this.transform = new TransformToolPresenter(
      this.state,
      ui,
      (...args) => this.inspector.updateInspector(...args),
      (value) => this.build.formatVector(value),
      (event) => this.build.movementDescription(event),
    );
    this.geometry = new GeometryToolPresenter(
      this.state,
      ui,
      (tool) => this.transform.isTopologyTool(tool),
      (...args) => this.inspector.updateInspector(...args),
      (value) => this.build.formatVector(value),
      (tool) => this.session.setEditorTool(tool),
    );
    this.inspector = new InspectorPresenter(
      this.state,
      ui,
      this.organization,
      this.entity,
      this.transform,
      (value) => this.build.formatVector(value),
    );
    this.materials = new MaterialsPresenter(this.state, ui, (tool) =>
      this.session.setEditorTool(tool),
    );
    this.session = new SessionPresenter(
      this.state,
      ui,
      this.build,
      this.document,
      this.geometry,
      this.inspector,
      this.materials,
      this.organization,
      this.transform,
    );
    this.contextMenu = new ContextMenuPresenter(
      this.state,
      ui,
      (value) => this.build.formatVector(value),
      () => this.materials.renderMaterialCatalog(),
      (selection) => this.document.copySelection(selection),
      (...args) => this.document.pasteFromClipboard(...args),
      () => this.organization.selectedLayerForPanel(),
    );
    this.renderer = new RendererPresenter({
      state: this.state,
      ui,
      build: this.build,
      contextMenu: this.contextMenu,
      document: this.document,
      geometry: this.geometry,
      inspector: this.inspector,
      organization: this.organization,
      transform: this.transform,
      publishCollaborationPreview: (document) => this.publishCollaborationPreview(document),
      publishCollaborationPointer: () => this.publishCollaborationPointer(),
    });
    this.project = new ProjectPresenter(
      this.state,
      ui,
      this.build,
      this.document,
      this.materials,
      this.organization,
      this.session,
    );
    this.webmcp = new WebMcpPresenter(
      this.state,
      ui,
      (tool) => this.session.setEditorTool(tool),
      (...args) => this.session.replaceDocument(...args),
      (...args) => this.project.openEditorMap(...args),
    );
  }

  public effectiveObjectViewState(
    document?: Parameters<OrganizationPresenter['effectiveObjectViewState']>[0],
  ) {
    return this.organization.effectiveObjectViewState(document);
  }

  public setEditorTool(tool: Parameters<SessionPresenter['setEditorTool']>[0]): void {
    this.session.setEditorTool(tool);
  }

  public updateInspector(
    document?: Parameters<InspectorPresenter['updateInspector']>[0],
    selection?: Parameters<InspectorPresenter['updateInspector']>[1],
  ): void {
    this.inspector.updateInspector(document, selection);
  }

  public async start(): Promise<void> {
    this.theme.connect();
    this.session.connectSession();
    this.document.updateSourceFromDocument();
    this.inspector.updateInspector();
    this.materials.renderMaterialCatalog();
    this.materials.renderReferenceScenes();
    this.document.connectWorkspaceResizers();
    this.document.setInspectorOpen(!window.matchMedia('(max-width: 760px)').matches);
    void this.build.checkCompilerService();
    await this.renderer.start();
    this.contextMenu.connect();
    this.project.connect();
    this.organizationEvents.connect();
    this.commandEvents.connect();
    this.toolEvents.connect();
    this.keyboardEvents.connect();
    await this.webmcp.connect();
    await this.collaborationUi.connect();
  }

  public get collaborationMapId(): string | null {
    return this.collaboration?.mapId ?? null;
  }

  private publishCollaborationPreview(document: MapDocument): void {
    this.collaboration?.publishPreview(document);
  }

  private publishCollaborationPointer(): void {
    this.collaboration?.schedulePresence();
  }

  /** Explicitly enters multiplayer; ordinary construction and `start()` remain solo-only. */
  public async joinCollaboration(options: JoinCollaborationOptions): Promise<void> {
    this.leaveCollaboration();
    const roomUrl = new URL(
      `/sync/maps/${encodeURIComponent(options.mapId)}/snapshot`,
      options.endpoint,
    );
    const accessToken = await options.authorize?.();
    const authorizationHeaders = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    const snapshotResponse = await fetch(roomUrl, { headers: authorizationHeaders });
    if (!snapshotResponse.ok) throw new Error(`Cannot inspect room (${snapshotResponse.status})`);
    const snapshot = (await snapshotResponse.json()) as {
      readonly mapVersion: number;
      readonly document: MapDocument;
      readonly source: string;
      readonly sourceSha256: string;
    };
    this.state.session.replaceDocument(snapshot.document, `Open hosted map ${options.mapId}`);
    this.state.currentMapSource = rebaseMapSource(snapshot.document, snapshot.source);
    this.state.savedDocumentRevision = snapshot.document.revision;

    let bridge: EditorCollaborationBridge;
    const remotePresences = new Map<string, CollaborationPresence>();
    let previewDocument: MapDocument | null = null;
    let interactionId: string | null = null;
    let previewSequence = 0;
    let presenceFrame: number | null = null;
    let lastPresenceSentAt = 0;

    const renderRemotePresence = () => {
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
              edit.kind === 'insert-brush'
                ? edit.brush.id
                : edit.kind === 'replace-entity-properties'
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
    let controller: CollaborationController;
    let canonicalMapVersion = snapshot.mapVersion;
    const refreshSourceState = (status?: string) => {
      const plan = planMapSave(this.state.session.document, this.state.currentMapSource);
      if (plan.status === 'blocked') return;
      this.state.currentMapSource = rebaseMapSource(this.state.session.document, plan.text);
      void controller.pending().then((pending) => {
        if (pending.length > 0) return;
        this.state.savedDocumentRevision = this.state.session.document.revision;
        this.document.setDocumentDirty(false);
        if (status) this.ui.statusMessage.textContent = status;
      });
    };
    controller = new CollaborationController({
      mapId: options.mapId,
      actorId: options.actorId,
      ...(options.authorize ? { authorize: options.authorize } : {}),
      onPeerOperation: (operation) => {
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
        canonicalMapVersion = mapVersion;
        refreshSourceState(`Hosted map saved · v${mapVersion}`);
      },
    });
    controller.setMapVersion(snapshot.mapVersion);
    bridge = new EditorCollaborationBridge(this.state.session, controller, (error) => {
      this.ui.statusMessage.textContent =
        error instanceof Error ? error.message : 'Collaboration operation failed';
    });
    const socketEndpoint = new URL(options.endpoint);
    socketEndpoint.protocol = socketEndpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: CollaborationSocketClient;
    const sendPresence = () => {
      presenceFrame = null;
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
      if (presenceFrame !== null) return;
      const tick = (now: number) => {
        if (now - lastPresenceSentAt < 33) {
          presenceFrame = window.requestAnimationFrame(tick);
          return;
        }
        sendPresence();
      };
      presenceFrame = window.requestAnimationFrame(tick);
    };
    const publishPreview = (document: MapDocument) => {
      const edits = collaborationEditsBetween(this.state.session.document, document);
      previewDocument = edits.length > 0 ? document : null;
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
      controller,
      onPresence: receivePresence,
      ...(options.onConflict ? { onConflict: options.onConflict } : {}),
      ...(options.onConnectionChange ? { onConnectionChange: options.onConnectionChange } : {}),
      onReady: async (ready) => {
        if (ready.mapVersion > canonicalMapVersion) {
          const reconciliation = reconcilePendingOperations(
            ready.document,
            await controller.pending(),
          );
          for (const conflict of reconciliation.conflicts) {
            options.onConflict?.(conflict.operationId, conflict.details);
          }
          bridge.synchronize(reconciliation.document, `Synchronize map ${options.mapId}`);
          this.state.currentMapSource = rebaseMapSource(ready.document, ready.source);
          refreshSourceState();
          canonicalMapVersion = ready.mapVersion;
        }
        sendPresence();
      },
      onError: (error) => {
        this.ui.statusMessage.textContent =
          error instanceof Error ? error.message : 'Collaboration connection failed';
      },
    });
    const presenceTimer = window.setInterval(sendPresence, 2_000);
    const unsubscribePresence = this.state.session.subscribe((change) => {
      if (change.kind === 'selection' || change.kind === 'document' || change.kind === 'history') {
        sendPresence();
      }
    });
    this.collaboration = {
      mapId: options.mapId,
      bridge,
      socket,
      presenceTimer,
      unsubscribePresence,
      publishPreview,
      schedulePresence,
      clearRemotePresence: () => {
        remotePresences.clear();
        this.state.renderer?.setRemotePresence([]);
      },
    };
    socket.connect();
    this.ui.statusMessage.textContent = `Joined collaboration room ${options.mapId}.`;
  }

  public leaveCollaboration(): void {
    const collaboration = this.collaboration;
    if (!collaboration) return;
    this.collaboration = null;
    window.clearInterval(collaboration.presenceTimer);
    collaboration.unsubscribePresence();
    collaboration.clearRemotePresence();
    collaboration.socket.close();
    collaboration.bridge.close();
    this.ui.statusMessage.textContent = `Left collaboration room ${collaboration.mapId}; editing remains local.`;
  }
}
