import {
  downloadMapCopy,
  ExternalFileChangeError,
  pickMapFile,
  saveMapFile,
  type EditorFileHandle,
} from './project-files.js';
import {
  openWorldviewProject,
  pickProjectDirectory,
  ensureProjectDirectoryPermission,
  type EditorDirectoryHandle,
  type WorldviewProjectWorkspace,
} from './project-workspace.js';
import {
  EntityDefinitionCatalog,
  BUILTIN_POINT_ENTITY_DEFINITIONS,
  createEmptyDocument,
  createSequentialIdFactory,
  mapSourceFingerprint,
  parseMapSource,
  planMapSave,
  serializeMap,
  rebaseMapSource,
  type EditorTool,
  type MapDocument,
  worldviewGameProfile,
  type MapFaceSyntax,
  type WorldviewGameProfile,
} from '@jackharrhy/worldview-editor';

import type { EditorElements } from './editor-elements.js';
import type {
  OpenEditorMapOptions,
  ReplaceDocumentOptions,
} from './editor-application-contracts.js';
import type { EditorShellState } from './editor-shell-state.js';
import type { EditorStatePort } from './editor-state-port.js';
import { recoverySourceIdFactory, type DocumentRecoverySnapshot } from './document-recovery.js';
import type { ProjectActionId } from './project-build-ui-state.js';
import type { DetachedHostedMap } from './collaboration-outbox.js';
import { loadWorkspaceResources } from './project-resource-loader.js';
import type { LoadedProjectResources } from './project-resource-loader.js';

type ProjectUi = Pick<
  EditorShellState,
  | 'pointEntityTool'
  | 'projectToolbar'
  | 'projectUi'
  | 'recoveryVersions'
  | 'resourceSettings'
  | 'statusMessage'
  | 'workspaceHome'
>;

type ProjectState = EditorStatePort<
  | 'activeGameProfile'
  | 'assetMountState'
  | 'builtInMaterials'
  | 'currentDocumentName'
  | 'currentFileHandle'
  | 'currentMapSource'
  | 'documentKey'
  | 'entityDefinitions'
  | 'lastDiskFingerprint'
  | 'lastRecoveryLabel'
  | 'loadedWadSources'
  | 'loadedGameAssets'
  | 'materialCatalog'
  | 'projectKey'
  | 'projectLocalState'
  | 'projectSprites'
  | 'projectWorkspace'
  | 'quakePalette'
  | 'recovery'
  | 'renderer'
  | 'savedDocumentRevision'
  | 'session'
  | 'workspaceId',
  | 'activeGameProfile'
  | 'currentFileHandle'
  | 'currentMapSource'
  | 'documentKey'
  | 'entityDefinitions'
  | 'lastDiskFingerprint'
  | 'lastRecoveryLabel'
  | 'projectKey'
  | 'projectSprites'
  | 'projectWorkspace'
  | 'quakePalette'
  | 'savedDocumentRevision'
  | 'workspaceId'
>;

interface ProjectBuildCommands {
  checkCompilerService(): Promise<void>;
}

interface ProjectDocumentCommands {
  setDocumentDirty(dirty: boolean): void;
  updateSourceFromDocument(force?: boolean): void;
}

interface ProjectMaterialCommands {
  addReferenceDocument(label: string, document: MapDocument): void;
  renderMaterialCatalog(): void;
}

interface ProjectSessionCommands {
  replaceDocument(document: MapDocument, label: string, options?: ReplaceDocumentOptions): void;
  setEditorTool(tool: EditorTool): void;
}

interface ProjectViewportWorkspaceCommands {
  beginDocumentChange(): void;
  restore(documentKey: string): boolean;
}

export class ProjectPresenter {
  private recoverySnapshots = new Map<string, DocumentRecoverySnapshot>();
  private projectOpenController: AbortController | null = null;

  public constructor(
    private readonly state: ProjectState,
    private readonly ui: ProjectUi,
    private readonly elements: Pick<EditorElements, 'mapFile' | 'referenceFiles'>,
    private readonly build: ProjectBuildCommands,
    private readonly document: ProjectDocumentCommands,
    private readonly materials: ProjectMaterialCommands,
    private readonly session: ProjectSessionCommands,
    private readonly viewportWorkspace: ProjectViewportWorkspaceCommands,
    private readonly signal: AbortSignal,
  ) {
    this.ui.projectToolbar.bind({
      openMap: (id) => void this.openProjectMap(id),
      selectBuildProfile: (id) => {
        this.ui.projectToolbar.update({ selectedBuildProfileId: id });
        void this.build.checkCompilerService();
      },
    });
    this.ui.recoveryVersions.bind({
      restore: (id) => this.restoreRecoveryVersion(id),
      setProtected: (id, protectedValue) =>
        void this.setRecoveryVersionProtected(id, protectedValue),
    });
    this.ui.projectUi.bind({
      invoke: (action) => this.invokeProjectAction(action),
      applySource: (source) => this.applySource(source),
      createCheckpoint: (label) => void this.createCheckpoint(label),
    });
    this.refreshEntityDefinitionPresets();
  }

  public dispose(): void {
    this.cancelProjectOpen();
    this.ui.projectToolbar.unbind();
    this.ui.recoveryVersions.unbind();
    this.ui.projectUi.unbind();
  }

  private async openProjectMap(path: string): Promise<void> {
    const map = this.state.projectWorkspace?.maps.find((candidate) => candidate.path === path);
    if (!map) return;
    this.ui.projectToolbar.update({ selectedMapId: path });
    await this.openEditorMap(await map.handle.getFile(), map.handle, map.path);
  }

  private detachProjectContext(): void {
    this.cancelProjectOpen();
    if (!this.state.projectWorkspace) return;
    this.state.projectWorkspace = null;
    this.state.projectKey = null;
    this.ui.projectToolbar.set({
      maps: [],
      selectedMapId: null,
      buildProfiles: [],
      selectedBuildProfileId: null,
    });
    this.state.entityDefinitions = new EntityDefinitionCatalog();
    this.state.projectSprites = [];
    this.state.materialCatalog.clear();
    for (const material of this.state.builtInMaterials) this.state.materialCatalog.set(material);
    this.state.loadedWadSources.clear();
    this.state.loadedGameAssets.clear();
    this.state.quakePalette = undefined;
    this.state.renderer?.setEntityDefinitions(this.state.entityDefinitions);
    this.state.renderer?.setSprites([]);
    this.state.renderer?.setMaterials(this.state.materialCatalog.materials());
    this.refreshEntityDefinitionPresets();
    this.materials.renderMaterialCatalog();
    this.ui.resourceSettings.update({
      loadedWadCount: 0,
      paletteLoaded: false,
      message: 'Standalone map opened without the previous project’s resources.',
      tone: 'normal',
    });
    void this.build.checkCompilerService();
  }

  public async openEditorMap(
    file: File,
    handle: EditorFileHandle | null,
    logicalName = file.name,
    options: OpenEditorMapOptions = {},
  ): Promise<void> {
    try {
      const belongsToCurrentProject = Boolean(
        handle &&
        this.state.projectWorkspace?.maps.some(
          (map) => map.handle === handle && map.path === logicalName,
        ),
      );
      const assertExpectedDocument = (): void => {
        this.signal.throwIfAborted();
        if (
          options.expectedDocumentId !== undefined &&
          this.state.session.document.id !== options.expectedDocumentId
        ) {
          throw new Error(
            `Stale document identity: expected ${options.expectedDocumentId}, current document is ${this.state.session.document.id}`,
          );
        }
        if (
          options.expectedRevision !== undefined &&
          this.state.session.document.revision !== options.expectedRevision
        ) {
          throw new Error(
            `Stale document revision: expected ${options.expectedRevision}, current revision is ${this.state.session.document.revision}`,
          );
        }
      };
      const text = await file.text();
      assertExpectedDocument();
      let parsed = parseMapSource(text, createSequentialIdFactory(`opened-${Date.now()}`));
      const fingerprint = mapSourceFingerprint(text);
      const documentKey =
        options.documentKey ??
        (belongsToCurrentProject
          ? `${this.state.workspaceId}:map:${logicalName.toLowerCase()}`
          : `file:${logicalName.toLowerCase()}:${fingerprint}`);
      const viewportWorkspaceKey =
        options.viewportWorkspaceKey ??
        (belongsToCurrentProject ? documentKey : `standalone-map:${logicalName.toLowerCase()}`);
      const recovered =
        options.restoreRecovery === false ? null : await this.state.recovery.latest(documentKey);
      assertExpectedDocument();
      const restoreRecovery = Boolean(
        recovered &&
        recovered.updatedAt > file.lastModified &&
        recovered.document.revision !== recovered.savedDocumentRevision &&
        window.confirm(
          `A newer recovery snapshot exists for ${logicalName}. Restore revision ${recovered.document.revision}?`,
        ),
      );
      assertExpectedDocument();
      if (!belongsToCurrentProject) this.detachProjectContext();
      this.viewportWorkspace.beginDocumentChange();
      this.state.documentKey = documentKey;
      if (recovered && restoreRecovery) {
        const sourceMatchesDisk = recovered.source.fingerprint === fingerprint;
        if (sourceMatchesDisk) parsed = parseMapSource(text, recoverySourceIdFactory(recovered));
        this.session.replaceDocument(parsed.document, 'Open map before recovery', {
          name: logicalName,
          source: sourceMatchesDisk ? recovered.source : parsed.source,
          fileHandle: sourceMatchesDisk ? handle : null,
          diskFingerprint: sourceMatchesDisk ? fingerprint : null,
          dirty: false,
          savedRevision: parsed.document.revision,
          focusView: true,
        });
        this.state.session.restoreDocument(recovered.document, `Restore ${recovered.label}`);
        this.session.setEditorTool('select');
        this.viewportWorkspace.restore(viewportWorkspaceKey);
        this.ui.statusMessage.set(
          sourceMatchesDisk
            ? `Restored recovery for ${logicalName}; the on-disk map is unchanged.`
            : `Restored recovery for ${logicalName} as a detached copy because the on-disk source changed.`,
        );
        return;
      }
      assertExpectedDocument();
      this.session.replaceDocument(parsed.document, 'Open map', {
        name: logicalName,
        source: parsed.source,
        fileHandle: handle,
        diskFingerprint: fingerprint,
        dirty: false,
        savedRevision: parsed.document.revision,
        focusView: true,
      });
      this.session.setEditorTool('select');
      this.viewportWorkspace.restore(viewportWorkspaceKey);
      if (belongsToCurrentProject && this.state.projectKey) {
        await this.state.projectLocalState.setLastMap(this.state.projectKey, logicalName);
      }
      await this.restoreBrowserAssetMounts();
      assertExpectedDocument();
      this.ui.statusMessage.set(
        `Opened ${logicalName}${handle ? ' with a writable browser handle' : ''}.`,
      );
    } catch (error) {
      if (this.signal.aborted) throw error;
      this.ui.statusMessage.set(
        `${file.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (options.throwOnError) throw error;
    }
  }

  public refreshEntityDefinitionPresets(): void {
    const definitions = new Map(
      BUILTIN_POINT_ENTITY_DEFINITIONS.map((definition) => [
        definition.classname.toLowerCase(),
        definition,
      ]),
    );
    for (const definition of this.state.entityDefinitions.all()) {
      if (definition.kind !== 'point') continue;
      definitions.set(definition.classname.toLowerCase(), {
        classname: definition.classname,
        label: definition.label,
        bounds: definition.bounds ?? { min: [-16, -16, -16], max: [16, 16, 16] },
      });
    }
    const selectedClassname = this.ui.pointEntityTool.getSnapshot().classname.trim().toLowerCase();
    const selected = [...definitions.values()].find(
      ({ classname }) => classname.toLowerCase() === selectedClassname,
    );
    this.ui.pointEntityTool.update({
      presets: [...definitions.values()]
        .toSorted((left, right) => left.label.localeCompare(right.label))
        .map((definition) => ({ id: definition.classname, label: definition.label })),
      ...(selected ? { classname: selected.classname } : {}),
    });
  }

  private applyProjectResources(
    workspace: WorldviewProjectWorkspace,
    resources: LoadedProjectResources,
  ): void {
    this.state.materialCatalog.clear();
    for (const material of resources.catalog.materials()) this.state.materialCatalog.set(material);
    this.state.loadedWadSources.clear();
    for (const [path, data] of resources.wadSources) this.state.loadedWadSources.set(path, data);
    this.state.loadedGameAssets.clear();
    for (const [path, data] of resources.gameAssets) this.state.loadedGameAssets.set(path, data);
    this.state.quakePalette = resources.palette;
    this.state.entityDefinitions = resources.definitions.catalog;
    this.state.projectSprites = resources.sprites.sprites;
    this.state.renderer?.setEntityDefinitions(this.state.entityDefinitions);
    this.state.renderer?.setMaterials(this.state.materialCatalog.materials());
    this.state.renderer?.setSprites(this.state.projectSprites);
    this.refreshEntityDefinitionPresets();
    this.materials.renderMaterialCatalog();
    const definitionErrors = resources.definitions.diagnostics.filter(
      ({ severity }) => severity === 'error',
    );
    const resourceMessage = [
      `${workspace.manifest.name}: ${this.state.materialCatalog.size} textures and ${this.state.entityDefinitions.size} entity definitions`,
      ...resources.messages,
      ...definitionErrors.map(({ message }) => message),
      ...resources.sprites.diagnostics,
    ].join(' · ');
    this.ui.resourceSettings.update({
      loadedWadCount: this.state.loadedWadSources.size,
      paletteLoaded: Boolean(this.state.quakePalette),
      message: resourceMessage,
      tone:
        definitionErrors.length > 0 || resources.sprites.diagnostics.length > 0
          ? 'error'
          : 'normal',
    });
  }

  public async openProjectDirectory(handle: EditorDirectoryHandle): Promise<void> {
    this.cancelProjectOpen();
    const controller = new AbortController();
    this.projectOpenController = controller;
    const signal = AbortSignal.any([this.signal, controller.signal]);
    try {
      const workspace = await openWorldviewProject(handle);
      signal.throwIfAborted();
      const resources = await loadWorkspaceResources(
        workspace,
        this.state.builtInMaterials,
        signal,
      );
      signal.throwIfAborted();
      const provisionalProjectKey = `${workspace.manifest.name.toLowerCase()}:${handle.name.toLowerCase()}`;
      const remembered = await this.state.projectLocalState.remember(
        provisionalProjectKey,
        handle,
        workspace.manifest.name,
      );
      signal.throwIfAborted();

      this.applyProjectResources(workspace, resources);
      this.state.projectWorkspace = workspace;
      this.state.projectKey = remembered?.projectKey ?? provisionalProjectKey;
      this.state.workspaceId = remembered?.workspaceId ?? `project:${this.state.projectKey}`;
      this.state.activeGameProfile = workspace.manifest.game;
      this.ui.projectToolbar.set({
        maps: workspace.maps.map(({ path }) => ({ id: path, label: path })),
        selectedMapId: null,
        buildProfiles: workspace.manifest.buildProfiles.map((profile) => ({
          id: profile.id,
          label: `${profile.label} · ${profile.quality}`,
        })),
        selectedBuildProfileId:
          workspace.manifest.defaultBuildProfile ?? workspace.manifest.buildProfiles[0]?.id ?? null,
      });
      await this.build.checkCompilerService();
      signal.throwIfAborted();
      const summary = `Opened ${workspace.manifest.name}: ${workspace.maps.length} maps, ${this.state.entityDefinitions.size} entity definitions.`;
      if (remembered === null) {
        const warning =
          'The project is open, but its directory binding could not be saved; choose the directory again after reload.';
        this.ui.resourceSettings.update({ message: warning, tone: 'error' });
        this.ui.statusMessage.set(`${summary} ${warning}`);
        return;
      }
      this.ui.statusMessage.set(summary);
    } finally {
      if (this.projectOpenController === controller) this.projectOpenController = null;
    }
  }

  private cancelProjectOpen(): void {
    this.projectOpenController?.abort(
      new DOMException('Project open was superseded by a newer editor action', 'AbortError'),
    );
    this.projectOpenController = null;
  }

  public createNewMap(
    profile: WorldviewGameProfile,
    format: MapFaceSyntax = worldviewGameProfile(profile).defaultFaceSyntax,
    name = 'untitled.map',
    workspaceId: string = crypto.randomUUID(),
  ): void {
    const definition = worldviewGameProfile(profile);
    if (!definition.supportedFaceSyntaxes.includes(format)) {
      throw new Error(`${definition.label} does not support ${format}`);
    }
    this.viewportWorkspace.beginDocumentChange();
    this.detachProjectContext();
    const document = { ...createEmptyDocument(), faceSyntax: format };
    this.state.workspaceId = `browser:${workspaceId}`;
    this.state.documentKey = `${this.state.workspaceId}:map`;
    this.state.activeGameProfile = profile;
    this.session.replaceDocument(document, `Create empty ${definition.label} map`, {
      name: name.toLowerCase().endsWith('.map') ? name : `${name}.map`,
      source: rebaseMapSource(document, serializeMap(document)),
      fileHandle: null,
      diskFingerprint: null,
      dirty: true,
      savedRevision: -1,
      focusView: true,
    });
    this.viewportWorkspace.restore(this.state.documentKey);
    this.ui.statusMessage.set(`Created an empty ${definition.label} ${format} map.`);
  }

  public openDetachedHostedMap(copy: DetachedHostedMap): void {
    this.viewportWorkspace.beginDocumentChange();
    this.detachProjectContext();
    this.state.workspaceId = `browser:${copy.id}`;
    this.state.documentKey = copy.documentKey;
    this.state.activeGameProfile = copy.profile;
    this.session.replaceDocument(copy.document, `Open detached copy of ${copy.fileName}`, {
      name: copy.fileName,
      source: copy.source,
      fileHandle: null,
      diskFingerprint: null,
      dirty: true,
      savedRevision: -1,
      focusView: true,
    });
    this.session.setEditorTool('select');
    this.viewportWorkspace.restore(copy.documentKey);
    this.ui.statusMessage.set(
      `${copy.fileName} is an independent local copy. Its hosted replay queue was cleared.`,
    );
  }

  public async recentProjects() {
    return this.state.projectLocalState.list();
  }

  public async reopenProject(projectKey: string): Promise<void> {
    const recent = await this.state.projectLocalState.load(projectKey);
    this.signal.throwIfAborted();
    if (!recent) throw new Error('Recent project is no longer available');
    if (!(await ensureProjectDirectoryPermission(recent.handle, true))) {
      throw new Error('Project directory permission was not granted');
    }
    this.signal.throwIfAborted();
    await this.openProjectDirectory(recent.handle);
    if (!recent.lastMapPath) return;
    const map = this.state.projectWorkspace?.maps.find(({ path }) => path === recent.lastMapPath);
    if (map) {
      const file = await map.handle.getFile();
      this.signal.throwIfAborted();
      await this.openEditorMap(file, map.handle, map.path);
    }
  }

  public async restoreBrowserAssetMounts(): Promise<void> {
    const mounts = await this.state.assetMountState.list(this.state.documentKey).catch(() => []);
    this.signal.throwIfAborted();
    for (const mount of mounts) {
      if (!mount.data || !('sourceName' in mount)) continue;
      this.state.materialCatalog.importWad(mount.sourceName, mount.data, this.state.quakePalette);
      this.state.loadedWadSources.set(mount.sourceName, mount.data);
    }
    if (mounts.length > 0) {
      this.materials.renderMaterialCatalog();
      this.state.renderer?.setMaterials(this.state.materialCatalog.materials());
    }
  }

  public loadHostedResources(
    resources: readonly {
      readonly name: string;
      readonly kind: string;
      readonly data: ArrayBuffer;
    }[],
  ): void {
    for (const resource of resources) {
      if (resource.kind !== 'wad' && !resource.name.toLowerCase().endsWith('.wad')) continue;
      this.state.materialCatalog.importWad(resource.name, resource.data, this.state.quakePalette);
      this.state.loadedWadSources.set(resource.name, resource.data);
    }
    this.materials.renderMaterialCatalog();
    this.state.renderer?.setMaterials(this.state.materialCatalog.materials());
  }

  private async projectDirectoryForOpen(): Promise<EditorDirectoryHandle | null> {
    const remembered = await this.state.projectLocalState.latest().catch(() => null);
    if (remembered && (await ensureProjectDirectoryPermission(remembered.handle, true))) {
      return remembered.handle;
    }
    return pickProjectDirectory();
  }

  public async chooseProjectDirectory(): Promise<boolean> {
    const handle = await this.projectDirectoryForOpen();
    if (!handle) return false;
    await this.openProjectDirectory(handle);
    return true;
  }

  public async chooseMapFile(): Promise<boolean> {
    const opened = await pickMapFile(this.elements.mapFile);
    if (!opened) return false;
    await this.openEditorMap(opened.file, opened.handle);
    return true;
  }

  public async renderRecoveryVersions(): Promise<void> {
    const snapshots = await this.state.recovery.list(this.state.documentKey);
    this.recoverySnapshots = new Map(snapshots.map((snapshot) => [snapshot.snapshotId, snapshot]));
    this.ui.recoveryVersions.set(
      snapshots.map((snapshot) => ({
        id: snapshot.snapshotId,
        label: snapshot.label,
        revision: snapshot.document.revision,
        updatedAtLabel: new Date(snapshot.updatedAt).toLocaleString(),
        protected: snapshot.protected,
      })),
    );
  }

  private restoreRecoveryVersion(snapshotId: string): void {
    const snapshot = this.recoverySnapshots.get(snapshotId);
    if (!snapshot) return;
    this.restoreRecoverySnapshot(snapshot);
    this.ui.projectUi.update({ recoveryOpen: false });
    this.ui.statusMessage.set(`Restored ${snapshot.label} as one undoable replacement.`);
  }

  private async setRecoveryVersionProtected(
    snapshotId: string,
    protectedValue: boolean,
  ): Promise<void> {
    await this.state.recovery.setProtected(snapshotId, protectedValue);
    await this.renderRecoveryVersions();
  }

  private restoreRecoverySnapshot(snapshot: DocumentRecoverySnapshot): void {
    this.state.currentMapSource = snapshot.source;
    if (
      this.state.lastDiskFingerprint !== null &&
      this.state.lastDiskFingerprint !== snapshot.source.fingerprint
    ) {
      this.state.currentFileHandle = null;
      this.state.lastDiskFingerprint = null;
    }
    this.state.session.restoreDocument(snapshot.document, `Restore ${snapshot.label}`);
  }

  private invokeProjectAction(action: ProjectActionId): void {
    switch (action) {
      case 'new':
        this.ui.workspaceHome.invoke('newMap');
        return;
      case 'show-source':
        this.document.updateSourceFromDocument(true);
        this.ui.projectUi.updateSource({ open: true });
        return;
      case 'open-project':
        void this.openProjectFromPicker();
        return;
      case 'open-file':
        void this.openMapFromPicker();
        return;
      case 'download':
        void this.saveCurrentMap();
        return;
      case 'checkpoint':
        this.ui.projectUi.updateCheckpoint({
          open: true,
          label: `Checkpoint r${this.state.session.document.revision}`,
        });
        return;
      case 'versions':
        void this.openRecoveryVersions();
        return;
      case 'export-normalized': {
        const normalizedName = this.state.currentDocumentName.replace(/\.map$/i, '.normalized.map');
        downloadMapCopy(normalizedName, serializeMap(this.state.session.document));
        this.ui.statusMessage.set(
          `Exported normalized source as ${normalizedName}; the original was not overwritten.`,
        );
        return;
      }
      case 'load-reference':
        this.elements.referenceFiles.click();
        return;
      case 'snapshot-reference':
        this.materials.addReferenceDocument(
          `Document revision ${this.state.session.document.revision}`,
          this.state.session.document,
        );
    }
  }

  private applySource(source: string): void {
    try {
      const parsed = parseMapSource(source, createSequentialIdFactory(`source-${Date.now()}`));
      this.session.replaceDocument(parsed.document, 'Apply map source', {
        source: parsed.source,
        dirty: true,
        savedRevision: this.state.savedDocumentRevision,
      });
      this.ui.projectUi.updateSource({ open: false });
    } catch (error) {
      this.ui.projectUi.updateSource({
        message: error instanceof Error ? error.message : String(error),
        tone: 'error',
      });
      this.ui.statusMessage.set('Source contains a parse error.');
    }
  }

  private async openProjectFromPicker(): Promise<void> {
    try {
      if (!(await this.chooseProjectDirectory())) {
        this.ui.statusMessage.set(
          'Persistent project directories require a Chromium browser with File System Access.',
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.ui.statusMessage.set(
        `Project open failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async openMapFromPicker(): Promise<void> {
    try {
      await this.chooseMapFile();
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  private async saveCurrentMap(): Promise<void> {
    const plan = planMapSave(this.state.session.document, this.state.currentMapSource);
    if (plan.status === 'blocked') {
      this.ui.statusMessage.set(
        `${plan.diagnostics.map(({ message }) => message).join(' ')} Use Export normalized to create a separate copy.`,
      );
      return;
    }
    if (!this.state.currentFileHandle || !this.state.lastDiskFingerprint) {
      downloadMapCopy(this.state.currentDocumentName, plan.text);
      this.ui.statusMessage.set(
        'Downloaded a source-preserving copy; the browser cannot confirm an on-disk save.',
      );
      return;
    }
    try {
      this.state.lastDiskFingerprint = await saveMapFile(
        this.state.currentFileHandle,
        this.state.lastDiskFingerprint,
        plan.text,
      );
      this.state.currentMapSource = rebaseMapSource(this.state.session.document, plan.text);
      this.state.savedDocumentRevision = this.state.session.document.revision;
      this.document.setDocumentDirty(false);
      this.state.lastRecoveryLabel = `Saved ${this.state.currentDocumentName}`;
      await this.state.recovery.flush();
      this.ui.statusMessage.set(
        `Saved ${this.state.currentDocumentName} without normalizing untouched source.`,
      );
    } catch (error) {
      if (error instanceof ExternalFileChangeError && this.state.currentFileHandle) {
        const reload = window.confirm(
          `${error.message}\n\nChoose OK to reload the disk version, or Cancel to download a source-preserving copy.`,
        );
        if (reload) {
          await this.openEditorMap(
            await this.state.currentFileHandle.getFile(),
            this.state.currentFileHandle,
          );
        } else {
          downloadMapCopy(
            this.state.currentDocumentName.replace(/\.map$/i, '.copy.map'),
            plan.text,
          );
          this.ui.statusMessage.set(
            'Downloaded a copy; the externally changed file was not overwritten.',
          );
        }
      } else {
        this.ui.statusMessage.set(
          `Save failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async createCheckpoint(label: string): Promise<void> {
    const resolvedLabel = label.trim() || `Checkpoint r${this.state.session.document.revision}`;
    try {
      const snapshot = await this.state.recovery.createCheckpoint(resolvedLabel);
      this.ui.projectUi.updateCheckpoint({ open: false });
      this.ui.statusMessage.set(`Protected checkpoint “${snapshot.label}” created.`);
    } catch (error) {
      this.ui.statusMessage.set(
        `Checkpoint failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async openRecoveryVersions(): Promise<void> {
    await this.renderRecoveryVersions();
    this.ui.projectUi.update({ recoveryOpen: true });
  }

  public connect(signal: AbortSignal): void {
    this.elements.mapFile.addEventListener(
      'change',
      async () => {
        const file = this.elements.mapFile.files?.[0];
        if (!file) return;
        await this.openEditorMap(file, null);
        this.elements.mapFile.value = '';
      },
      { signal },
    );
  }
}
