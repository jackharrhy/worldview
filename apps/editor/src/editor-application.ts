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

export class EditorApplication implements EditorStateHost {
  public readonly state: EditorState;
  public readonly document = new DocumentPresenter(this);
  public readonly geometry = new GeometryToolPresenter(this);
  public readonly transform = new TransformToolPresenter(this);
  public readonly entity = new EntityPresenter(this);
  public readonly build = new BuildPresenter(this);
  public readonly organization = new OrganizationPresenter(this);
  public readonly inspector = new InspectorPresenter(this);
  public readonly materials = new MaterialsPresenter(this);
  public readonly session = new SessionPresenter(this);
  public readonly contextMenu = new ContextMenuPresenter(this);
  public readonly project = new ProjectPresenter(this);
  public readonly renderer = new RendererPresenter(this);
  public readonly webmcp = new WebMcpPresenter(this);
  private readonly organizationEvents = new OrganizationEvents(this);
  private readonly commandEvents = new CommandEvents(this);
  private readonly toolEvents = new ToolEvents(this);
  private readonly keyboardEvents = new KeyboardEvents(this);

  public constructor(public readonly ui: EditorElements) {
    this.state = new EditorState(ui, () => this);
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
}
