import { BuildPresenter } from './build-presenter.js';
import { CommandEvents } from './command-events.js';
import { ContextMenuPresenter } from './context-menu-presenter.js';
import { DocumentPresenter } from './document-presenter.js';
import type { EditorElements } from './editor-elements.js';
import type { EditorShellState } from './editor-shell-state.js';
import { EditorState, type EditorStateHost, type EditorStateOptions } from './editor-state.js';
import { EditorToolControllerRegistry } from './editor-tool-controller-registry.js';
import { EntityPresenter } from './entity-presenter.js';
import { GeometryToolPresenter } from './geometry-tool-presenter.js';
import { InspectorPresenter } from './inspector-presenter.js';
import { KeyboardEvents } from './keyboard-events.js';
import { MaterialsPresenter } from './materials-presenter.js';
import { OrganizationPresenter } from './organization-presenter.js';
import { ProjectPresenter } from './project-presenter.js';
import { RendererPresenter } from './renderer-presenter.js';
import { SessionPresenter } from './session-presenter.js';
import { ToolEvents } from './tool-events.js';
import { ThemePresenter } from './theme-presenter.js';
import { CollaborationPresenter } from './collaboration-presenter.js';
import { CollaborationLifecycle } from './collaboration-lifecycle.js';
import { CollaborationSession } from './collaboration-session.js';
import { TransformToolPresenter } from './transform-tool-presenter.js';
import { WebMcpPresenter } from './webmcp-presenter.js';
import { ViewportWorkspacePresenter } from './viewport-workspace-presenter.js';
import type { EditorApplicationLaunch } from './editor-application-contracts.js';
import type { DetachedHostedMap } from './collaboration.js';

export interface EditorApplicationOptions extends EditorStateOptions {
  readonly onHostedMapDetached?: (copy: DetachedHostedMap) => void;
}

export class EditorApplication {
  private readonly state: EditorState;
  private readonly document: DocumentPresenter;
  private readonly geometry: GeometryToolPresenter;
  private readonly transform: TransformToolPresenter;
  private readonly entity: EntityPresenter;
  private readonly build: BuildPresenter;
  private readonly organization: OrganizationPresenter;
  private readonly inspector: InspectorPresenter;
  private readonly materials: MaterialsPresenter;
  private readonly session: SessionPresenter;
  private readonly contextMenu: ContextMenuPresenter;
  private readonly project: ProjectPresenter;
  private readonly renderer: RendererPresenter;
  private readonly webmcp: WebMcpPresenter;
  private readonly theme: ThemePresenter;
  private readonly collaborationUi: CollaborationPresenter;
  private readonly viewportWorkspace: ViewportWorkspacePresenter;
  private readonly commandEvents: CommandEvents;
  private readonly toolEvents: ToolEvents;
  private readonly keyboardEvents: KeyboardEvents;
  private readonly tools: EditorToolControllerRegistry;
  private readonly lifetime = new AbortController();
  private readonly collaborationLifecycle = new CollaborationLifecycle();
  private readonly collaboration: CollaborationSession;
  private startPromise: Promise<void> | null = null;

  public constructor(
    private readonly ui: EditorShellState,
    elements: EditorElements,
    options: EditorApplicationOptions = {},
  ) {
    const stateHost: EditorStateHost = {
      effectiveObjectViewState: (document) => this.organization.effectiveObjectViewState(document),
      setEditorTool: (tool) => this.session.setEditorTool(tool),
      updateInspector: (document, selection) => this.inspector.updateInspector(document, selection),
      updateFaceInspector: (document, selection) =>
        this.inspector.updateFaceInspector(document, selection),
      publishCollaborationPreview: (document) => this.collaboration.publishPreview(document),
    };
    this.state = new EditorState(
      ui,
      elements.uvEditorSvg,
      () => stateHost,
      this.lifetime.signal,
      options,
    );
    this.viewportWorkspace = new ViewportWorkspacePresenter(undefined, (error) => {
      if (this.signal.aborted) return;
      console.error('Viewport workspace persistence failed', error);
    });
    this.theme = new ThemePresenter(this.state, ui);
    this.entity = new EntityPresenter(this.state, ui);
    this.organization = new OrganizationPresenter(this.state, ui);
    this.document = new DocumentPresenter(
      this.state,
      ui,
      elements,
      (tool) => this.session.setEditorTool(tool),
      (layout) => this.viewportWorkspace.setLayout(layout),
    );
    this.collaboration = new CollaborationSession(
      this.state,
      ui,
      {
        replaceDocument: (...args) => this.session.replaceDocument(...args),
        setDocumentDirty: (dirty) => this.document.setDocumentDirty(dirty),
      },
      this.lifetime.signal,
    );
    this.collaborationUi = new CollaborationPresenter(
      ui,
      (joinOptions) => this.collaboration.join(joinOptions),
      () => this.collaboration.leave(),
      this.collaborationLifecycle,
      this.lifetime.signal,
      options.onHostedMapDetached,
    );
    this.build = new BuildPresenter(
      this.state,
      ui,
      elements.compiledCanvas,
      this.document,
      this.lifetime.signal,
    );
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
    this.tools = new EditorToolControllerRegistry(
      this.state,
      ui,
      this.geometry,
      this.transform,
      this.inspector,
    );
    this.materials = new MaterialsPresenter(this.state, ui, (tool) =>
      this.session.setEditorTool(tool),
    );
    this.session = new SessionPresenter(
      this.state,
      ui,
      this.build,
      this.document,
      this.inspector,
      this.materials,
      this.organization,
      this.tools,
    );
    this.contextMenu = new ContextMenuPresenter(
      this.state,
      ui,
      elements.canvases,
      (value) => this.build.formatVector(value),
      () => this.materials.renderMaterialCatalog(),
      (selection) => this.document.copySelection(selection),
      (...args) => this.document.pasteFromClipboard(...args),
      () => this.organization.selectedLayerForPanel(),
    );
    this.renderer = new RendererPresenter({
      state: this.state,
      ui,
      canvases: elements.canvases,
      viewportOverlays: elements.viewportOverlays,
      build: this.build,
      contextMenu: this.contextMenu,
      document: this.document,
      geometry: this.geometry,
      inspector: this.inspector,
      organization: this.organization,
      transform: this.transform,
      viewportWorkspace: this.viewportWorkspace,
      publishCollaborationPreview: (document) => this.collaboration.publishPreview(document),
      publishCollaborationPointer: () => this.collaboration.publishPointer(),
    });
    this.project = new ProjectPresenter(
      this.state,
      ui,
      elements,
      this.build,
      this.document,
      this.materials,
      this.session,
      this.viewportWorkspace,
      this.lifetime.signal,
    );
    this.webmcp = new WebMcpPresenter(
      this.state,
      ui,
      (tool) => this.session.setEditorTool(tool),
      (...args) => this.session.replaceDocument(...args),
      (...args) => this.project.openEditorMap(...args),
      this.lifetime.signal,
    );
    this.commandEvents = new CommandEvents({
      state: this.state,
      ui,
      elements,
      document: this.document,
      build: this.build,
      focusSelection: () => this.contextMenu.focusCurrentSelection(),
      addReferenceDocument: (label, document) =>
        this.materials.addReferenceDocument(label, document),
      setEditorTool: (tool) => this.session.setEditorTool(tool),
    });
    this.toolEvents = new ToolEvents({
      state: this.state,
      ui,
      elements,
      document: this.document,
      geometry: this.geometry,
      organization: this.organization,
      transform: this.transform,
      renderMaterialCatalog: () => this.materials.renderMaterialCatalog(),
    });
    this.keyboardEvents = new KeyboardEvents({
      state: this.state,
      ui,
      elements,
      document: this.document,
      tools: this.tools,
      focusSelection: () => this.contextMenu.focusCurrentSelection(),
      closeEditorGroup: () => this.organization.closeEditorGroup(),
      setViewFilterPopoverOpen: (open) => this.organization.setViewFilterPopoverOpen(open),
      dispose: () => this.dispose(),
    });
  }

  public get signal(): AbortSignal {
    return this.lifetime.signal;
  }

  public start(launch: EditorApplicationLaunch | null = null): Promise<void> {
    this.startPromise ??= this.startApplication(launch);
    return this.startPromise;
  }

  private async startApplication(launch: EditorApplicationLaunch | null): Promise<void> {
    try {
      this.signal.throwIfAborted();
      this.theme.connect(this.signal);
      this.session.connectSession();
      this.document.updateSourceFromDocument();
      this.inspector.updateInspector();
      this.materials.renderMaterialCatalog();
      this.materials.renderReferenceScenes();
      this.document.connectWorkspaceResizers(this.signal);
      this.document.setInspectorOpen(!window.matchMedia('(max-width: 760px)').matches);
      void this.build.checkCompilerService();
      await this.renderer.start(this.signal);
      this.signal.throwIfAborted();
      this.contextMenu.connect();
      this.project.connect(this.signal);
      this.commandEvents.connect(this.signal);
      this.toolEvents.connect(this.signal);
      this.keyboardEvents.connect(this.signal);
      await this.webmcp.connect();
      this.signal.throwIfAborted();
      await this.collaborationUi.connect();
      this.signal.throwIfAborted();
      await this.openLaunch(launch);
      this.signal.throwIfAborted();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private async openLaunch(launch: EditorApplicationLaunch | null): Promise<void> {
    if (!launch) return;
    switch (launch.kind) {
      case 'new-map':
        this.project.createNewMap(launch.profile, launch.format, launch.name, launch.workspaceId);
        return;
      case 'hosted-map': {
        this.state.activeGameProfile = launch.game;
        this.state.workspaceId = `hosted:${launch.id}`;
        const source = new File([launch.source], launch.name, { type: 'text/plain' });
        await this.project.openEditorMap(source, null, launch.name, {
          throwOnError: true,
          viewportWorkspaceKey: `hosted-map:${launch.id}`,
          documentKey: `hosted-map:${launch.id}`,
          restoreRecovery: false,
        });
        this.signal.throwIfAborted();
        this.project.loadHostedResources(launch.resources ?? []);
        const result = await this.collaborationUi.joinHostedMap(
          launch.id,
          launch.actorId,
          launch.displayName,
        );
        if (result !== 'started') return;
        this.ui.statusMessage.set(
          `Opened hosted map ${launch.projectName} / ${launch.name} · live at v${launch.mapVersion}`,
        );
        return;
      }
      case 'detached-map':
        this.project.openDetachedHostedMap(launch.copy);
        return;
      case 'project':
        await this.project.openProjectDirectory(launch.handle);
        return;
      case 'recent-project':
        await this.project.reopenProject(launch.projectKey);
        return;
      case 'map':
        await this.project.openEditorMap(launch.file, null);
    }
  }

  public dispose(): void {
    if (this.signal.aborted) return;
    this.lifetime.abort();
    this.collaboration.dispose();
    this.state.compilerCoordinator.cancel();
    this.state.stopSubscription?.();
    this.state.stopSubscription = null;
    void this.state.recovery.flush();
    this.state.recovery.dispose();
    this.state.compiledViewer?.dispose();
    this.state.compiledViewer = null;
    this.contextMenu.dispose();
    this.geometry.dispose();
    this.inspector.dispose();
    this.entity.dispose();
    this.organization.dispose();
    this.project.dispose();
    this.build.dispose();
    this.materials.dispose();
    this.collaborationUi.dispose();
    this.theme.dispose();
    this.webmcp.dispose();
    this.renderer.dispose();
    this.viewportWorkspace.dispose();
  }
}
