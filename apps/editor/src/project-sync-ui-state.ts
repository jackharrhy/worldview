import { EditorUiPort } from './editor-ui-port.js';
import type { ProjectSyncInspection } from './project-sync.js';

export interface ProjectSyncSnapshot {
  readonly open: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly maps: readonly { path: string; mapId: string }[];
  readonly selectedPath: string | null;
  readonly inspection: ProjectSyncInspection | null;
  readonly localMaps: readonly string[];
  readonly setup: {
    readonly projectId: string;
    readonly hostedMaps: readonly { id: string; name: string; format: string }[];
    readonly mappings: Readonly<Record<string, string>>;
  } | null;
}

export interface ProjectSyncActions {
  open(): void;
  close(): void;
  inspect(path: string): void;
  pull(): void;
  push(): void;
  loadProject(projectId: string): void;
  setMapping(path: string, mapId: string): void;
  saveLink(): void;
}

export class ProjectSyncPort extends EditorUiPort<ProjectSyncSnapshot, ProjectSyncActions> {
  public constructor() {
    super({
      open: false,
      busy: false,
      error: null,
      maps: [],
      selectedPath: null,
      inspection: null,
      localMaps: [],
      setup: null,
    });
  }
  public open(): void {
    this.actions?.open();
  }
  public close(): void {
    this.actions?.close();
  }
  public inspect(path: string): void {
    this.actions?.inspect(path);
  }
  public pull(): void {
    this.actions?.pull();
  }
  public push(): void {
    this.actions?.push();
  }
  public loadProject(projectId: string): void {
    this.actions?.loadProject(projectId);
  }
  public setMapping(path: string, mapId: string): void {
    this.actions?.setMapping(path, mapId);
  }
  public saveLink(): void {
    this.actions?.saveLink();
  }
}
