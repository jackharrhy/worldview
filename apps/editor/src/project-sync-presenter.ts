import {
  mapSourceFingerprint,
  parseMapSource,
  serializeWorldviewProject,
} from '@jackharrhy/worldview-editor';
import { HostedProjectResponseSchema } from '@worldview/protocol';
import type { EditorStatePort } from './editor-state-port.js';
import type { EditorShellState } from './editor-shell-state.js';
import { saveMapFile, type EditorFileHandle } from './project-files.js';
import { LinkedProjectSync, ProjectSyncConflictError } from './project-sync.js';
import type { WorldviewProjectWorkspace } from './project-workspace.js';

export class ProjectSyncPresenter {
  private linkedSync: LinkedProjectSync | null = null;

  public constructor(
    private readonly state: EditorStatePort<
      'projectWorkspace' | 'documentDirty',
      'projectWorkspace'
    >,
    private readonly ui: Pick<EditorShellState, 'projectSync' | 'projectToolbar' | 'statusMessage'>,
    private readonly openMap: (
      file: File,
      handle: EditorFileHandle,
      path: string,
      options: { restoreRecovery: false },
    ) => Promise<void>,
  ) {
    this.ui.projectSync.bind({
      open: () => void this.openSync(),
      close: () => this.ui.projectSync.update({ open: false }),
      inspect: (path) => void this.inspectSync(path),
      pull: () => void this.performSync('pull'),
      push: () => void this.performSync('push'),
      loadProject: (projectId) => void this.loadSyncProject(projectId),
      setMapping: (path, mapId) => {
        const setup = this.ui.projectSync.getSnapshot().setup;
        if (setup)
          this.ui.projectSync.update({
            setup: { ...setup, mappings: { ...setup.mappings, [path]: mapId } },
          });
      },
      saveLink: () => void this.saveSyncLink(),
    });
  }

  public dispose(): void {
    this.ui.projectSync.unbind();
  }

  public setWorkspace(workspace: WorldviewProjectWorkspace | null): void {
    this.linkedSync = workspace?.manifest.hosted ? new LinkedProjectSync(workspace) : null;
    this.ui.projectSync.update({
      open: false,
      maps: workspace?.manifest.hosted?.maps ?? [],
      localMaps: workspace?.maps.map((map) => map.path) ?? [],
      setup: null,
      inspection: null,
    });
  }

  private async openSync(): Promise<void> {
    if (!this.linkedSync) {
      if (this.state.projectWorkspace)
        this.ui.projectSync.update({
          open: true,
          error: null,
          setup: { projectId: '', hostedMaps: [], mappings: {} },
        });
      return;
    }
    const maps = this.state.projectWorkspace!.manifest.hosted!.maps;
    this.ui.projectSync.update({ open: true, maps, error: null });
    try {
      await this.linkedSync.verifyProject();
    } catch (error) {
      this.ui.projectSync.update({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const selected = this.ui.projectToolbar.getSnapshot().selectedMapId;
    await this.inspectSync(
      selected && maps.some((map) => map.path === selected) ? selected : (maps[0]?.path ?? ''),
    );
  }

  private async loadSyncProject(projectId: string): Promise<void> {
    const workspace = this.state.projectWorkspace;
    if (!workspace) return;
    this.ui.projectSync.update({ busy: true, error: null });
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId.trim())}`, {
        credentials: 'same-origin',
      });
      if (!response.ok)
        throw new Error(
          `Cannot open hosted project (${response.status}). Check its ID and your access.`,
        );
      const { project } = HostedProjectResponseSchema.parse(await response.json());
      if (project.game !== workspace.manifest.game)
        throw new Error(
          `Hosted project is ${project.game}; this local project is ${workspace.manifest.game}.`,
        );
      this.ui.projectSync.update({
        setup: { projectId: project.id, hostedMaps: project.maps, mappings: {} },
      });
    } catch (error) {
      this.ui.projectSync.update({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.ui.projectSync.update({ busy: false });
    }
  }

  private async saveSyncLink(): Promise<void> {
    const workspace = this.state.projectWorkspace;
    const setup = this.ui.projectSync.getSnapshot().setup;
    if (!workspace || !setup) return;
    this.ui.projectSync.update({ busy: true, error: null });
    try {
      const entries = Object.entries(setup.mappings).filter(([, mapId]) => mapId);
      if (entries.length === 0) throw new Error('Choose at least one hosted map.');
      if (new Set(entries.map(([, mapId]) => mapId)).size !== entries.length)
        throw new Error('Each hosted map can only be linked once.');
      for (const [path, mapId] of entries) {
        const local = workspace.maps.find((map) => map.path === path);
        const hosted = setup.hostedMaps.find((map) => map.id === mapId);
        if (!local || !hosted) throw new Error(`Invalid map link: ${path}`);
        const syntax = parseMapSource(await (await local.handle.getFile()).text()).document
          .faceSyntax;
        if (syntax !== hosted.format)
          throw new Error(`${path} uses ${syntax}; ${hosted.name} uses ${hosted.format}.`);
      }
      const manifest = {
        ...workspace.manifest,
        hosted: {
          origin: location.origin,
          projectId: setup.projectId,
          maps: entries.map(([path, mapId]) => ({ path, mapId })),
        },
      };
      const rawHandle = await workspace.handle.getFileHandle('worldview.project.json');
      if (!('createWritable' in rawHandle) || typeof rawHandle.createWritable !== 'function')
        throw new Error('The project manifest is not writable in this browser.');
      const fileHandle = rawHandle as EditorFileHandle;
      const expected = mapSourceFingerprint(await (await fileHandle.getFile()).text());
      await saveMapFile(fileHandle, expected, serializeWorldviewProject(manifest));
      const updated = { ...workspace, manifest };
      this.state.projectWorkspace = updated;
      this.linkedSync = new LinkedProjectSync(updated);
      this.ui.projectSync.update({
        maps: manifest.hosted.maps,
        setup: null,
        localMaps: workspace.maps.map((map) => map.path),
      });
      this.ui.statusMessage.set(`Linked ${entries.length} local maps to the hosted project.`);
      await this.inspectSync(entries[0]![0]);
    } catch (error) {
      this.ui.projectSync.update({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.ui.projectSync.update({ busy: false });
    }
  }

  private async inspectSync(path: string): Promise<void> {
    if (!this.linkedSync || !path) return;
    this.ui.projectSync.update({ busy: true, error: null, selectedPath: path, inspection: null });
    try {
      const inspection = await this.linkedSync.inspect(path);
      if (this.ui.projectSync.getSnapshot().selectedPath === path)
        this.ui.projectSync.update({ inspection });
    } catch (error) {
      this.ui.projectSync.update({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.ui.projectSync.update({ busy: false });
    }
  }

  private async performSync(direction: 'pull' | 'push'): Promise<void> {
    const inspection = this.ui.projectSync.getSnapshot().inspection;
    if (!inspection || !this.linkedSync) return;
    if (
      this.state.documentDirty &&
      this.ui.projectToolbar.getSnapshot().selectedMapId === inspection.path
    ) {
      this.ui.projectSync.update({
        error: 'Save or discard the open editor changes before syncing this map.',
      });
      return;
    }
    this.ui.projectSync.update({ busy: true, error: null });
    try {
      if (direction === 'pull') {
        await this.linkedSync.pull(inspection);
        if (this.ui.projectToolbar.getSnapshot().selectedMapId === inspection.path) {
          const map = this.state.projectWorkspace?.maps.find(
            (candidate) => candidate.path === inspection.path,
          );
          if (map)
            await this.openMap(await map.handle.getFile(), map.handle, map.path, {
              restoreRecovery: false,
            });
        }
      } else await this.linkedSync.push(inspection);
      this.ui.statusMessage.set(
        `${direction === 'pull' ? 'Pulled' : 'Pushed'} ${inspection.path}.`,
      );
      await this.inspectSync(inspection.path);
    } catch (error) {
      this.ui.projectSync.update({ error: error instanceof Error ? error.message : String(error) });
      if (error instanceof ProjectSyncConflictError) await this.inspectSync(inspection.path);
    } finally {
      this.ui.projectSync.update({ busy: false });
    }
  }
}
