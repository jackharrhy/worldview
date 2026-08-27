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
import { TransformToolPresenter } from './transform-tool-presenter.js';
import { WebMcpPresenter } from './webmcp-presenter.js';
import type { MapDocument } from '@jackharrhy/worldview-editor/core';
import {
  CollaborationController,
  CollaborationSocketClient,
  EditorCollaborationBridge,
  type CollaborationPresence,
} from './collaboration.js';

export interface JoinCollaborationOptions {
  readonly endpoint: string;
  readonly roomId: string;
  readonly actorId: string;
  readonly onPresence?: (presence: CollaborationPresence) => void;
  readonly onConflict?: (operationId: string, conflicts: readonly unknown[]) => void;
}

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
  private readonly organizationEvents = new OrganizationEvents(this);
  private readonly commandEvents = new CommandEvents(this);
  private readonly toolEvents = new ToolEvents(this);
  private readonly keyboardEvents = new KeyboardEvents(this);
  private collaboration: {
    readonly roomId: string;
    readonly bridge: EditorCollaborationBridge;
    readonly socket: CollaborationSocketClient;
  } | null = null;

  public constructor(public readonly ui: EditorElements) {
    this.state = new EditorState(ui, () => this);
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
    this.session.connectSession();
    this.document.updateSourceFromDocument();
    this.inspector.updateInspector();
    this.materials.renderMaterialCatalog();
    this.materials.renderReferenceScenes();
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
  }

  public get collaborationRoomId(): string | null {
    return this.collaboration?.roomId ?? null;
  }

  /** Explicitly enters multiplayer; ordinary construction and `start()` remain solo-only. */
  public async joinCollaboration(options: JoinCollaborationOptions): Promise<void> {
    this.leaveCollaboration();
    const roomUrl = new URL(`/rooms/${encodeURIComponent(options.roomId)}`, options.endpoint);
    const snapshotResponse = await fetch(roomUrl);
    if (!snapshotResponse.ok) throw new Error(`Cannot inspect room (${snapshotResponse.status})`);
    const snapshot = (await snapshotResponse.json()) as {
      readonly roomVersion: number;
      readonly document: MapDocument | null;
    };
    if (snapshot.document) {
      this.state.session.replaceDocument(snapshot.document, `Join room ${options.roomId}`);
    } else {
      const initializeResponse = await fetch(roomUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.state.session.document),
      });
      if (!initializeResponse.ok) {
        throw new Error(`Cannot initialize room (${initializeResponse.status})`);
      }
    }

    let bridge: EditorCollaborationBridge;
    const controller = new CollaborationController({
      roomId: options.roomId,
      actorId: options.actorId,
      onPeerOperation: (operation) => bridge.receive(operation),
    });
    controller.setRoomVersion(snapshot.roomVersion);
    bridge = new EditorCollaborationBridge(this.state.session, controller, (error) => {
      this.ui.statusMessage.textContent =
        error instanceof Error ? error.message : 'Collaboration operation failed';
    });
    const socketEndpoint = new URL(options.endpoint);
    socketEndpoint.protocol = socketEndpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new CollaborationSocketClient({
      endpoint: socketEndpoint.toString(),
      roomId: options.roomId,
      actorId: options.actorId,
      controller,
      ...(options.onPresence ? { onPresence: options.onPresence } : {}),
      ...(options.onConflict ? { onConflict: options.onConflict } : {}),
      onError: (error) => {
        this.ui.statusMessage.textContent =
          error instanceof Error ? error.message : 'Collaboration connection failed';
      },
    });
    this.collaboration = { roomId: options.roomId, bridge, socket };
    socket.connect();
    this.ui.statusMessage.textContent = `Joined collaboration room ${options.roomId}.`;
  }

  public leaveCollaboration(): void {
    const collaboration = this.collaboration;
    if (!collaboration) return;
    this.collaboration = null;
    collaboration.socket.close();
    collaboration.bridge.close();
    this.ui.statusMessage.textContent = `Left collaboration room ${collaboration.roomId}; editing remains local.`;
  }
}
