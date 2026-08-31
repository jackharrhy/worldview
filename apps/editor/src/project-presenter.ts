import {
  downloadMapCopy,
  ExternalFileChangeError,
  pickMapFile,
  saveMapFile,
  type EditorFileHandle,
} from './project-files.js';
import {
  loadProjectEntityDefinitions,
  loadProjectSprites,
  loadProjectWalFiles,
  openWorldviewProject,
  pickProjectDirectory,
  projectFile,
  ensureProjectDirectoryPermission,
  type EditorDirectoryHandle,
  type WorldviewProjectWorkspace,
} from './project-workspace.js';
import {
  EditorMaterialCatalog,
  EntityDefinitionCatalog,
  BUILTIN_POINT_ENTITY_DEFINITIONS,
  createEmptyDocument,
  createSequentialIdFactory,
  mapSourceFingerprint,
  parseMapSource,
  planMapSave,
  serializeMap,
  rebaseMapSource,
  worldviewGameProfile,
  type MapFaceSyntax,
  type WorldviewGameProfile,
} from '@jackharrhy/worldview-editor';

import type { BuildPresenter } from './build-presenter.js';
import type { DocumentPresenter } from './document-presenter.js';
import type { EditorElements } from './editor-elements.js';
import type { EditorState } from './editor-state.js';
import type { MaterialsPresenter } from './materials-presenter.js';
import type { OrganizationPresenter } from './organization-presenter.js';
import type { SessionPresenter } from './session-presenter.js';
import { recoverySourceIdFactory, type DocumentRecoverySnapshot } from './document-recovery.js';
import { required } from './editor-elements.js';
import type { ViewportWorkspacePresenter } from './viewport-workspace-presenter.js';

interface OpenEditorMapOptions {
  readonly expectedDocumentId?: string;
  readonly expectedRevision?: number;
  readonly throwOnError?: boolean;
  readonly viewportWorkspaceKey?: string;
}

export class ProjectPresenter {
  public constructor(
    private readonly state: EditorState,
    private readonly ui: EditorElements,
    private readonly build: BuildPresenter,
    private readonly document: DocumentPresenter,
    private readonly materials: MaterialsPresenter,
    private readonly organization: OrganizationPresenter,
    private readonly session: SessionPresenter,
    private readonly viewportWorkspace: ViewportWorkspacePresenter,
    private readonly signal: AbortSignal,
  ) {}

  private detachProjectContext(): void {
    if (!this.state.projectWorkspace) return;
    this.state.projectWorkspace = null;
    this.state.projectKey = null;
    this.ui.projectMap.replaceChildren();
    this.ui.projectMap.hidden = true;
    this.ui.buildProfile.replaceChildren();
    this.ui.buildProfile.hidden = true;
    this.state.entityDefinitions = new EntityDefinitionCatalog();
    this.state.projectSprites = [];
    this.state.materialCatalog.clear();
    for (const material of this.state.builtInMaterials) this.state.materialCatalog.set(material);
    this.state.loadedWadSources.clear();
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
      const documentKey = belongsToCurrentProject
        ? `${this.state.workspaceId}:map:${logicalName.toLowerCase()}`
        : `file:${logicalName.toLowerCase()}:${fingerprint}`;
      const viewportWorkspaceKey =
        options.viewportWorkspaceKey ??
        (belongsToCurrentProject ? documentKey : `standalone-map:${logicalName.toLowerCase()}`);
      const recovered = await this.state.recovery.latest(documentKey);
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
        this.ui.statusMessage.textContent = sourceMatchesDisk
          ? `Restored recovery for ${logicalName}; the on-disk map is unchanged.`
          : `Restored recovery for ${logicalName} as a detached copy because the on-disk source changed.`;
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
      this.ui.statusMessage.textContent = `Opened ${logicalName}${handle ? ' with a writable browser handle' : ''}.`;
    } catch (error) {
      if (this.signal.aborted) throw error;
      this.ui.statusMessage.textContent = `${file.name}: ${error instanceof Error ? error.message : String(error)}`;
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
    const selectedClassname = this.ui.pointEntityClassname.value.trim().toLowerCase();
    this.ui.pointEntityPreset.replaceChildren(
      ...[...definitions.values()]
        .toSorted((left, right) => left.label.localeCompare(right.label))
        .map((definition) => {
          const option = document.createElement('option');
          option.value = definition.classname;
          option.textContent = definition.label;
          return option;
        }),
    );
    const selected = [...definitions.values()].find(
      ({ classname }) => classname.toLowerCase() === selectedClassname,
    );
    if (selected) this.ui.pointEntityPreset.value = selected.classname;
  }

  public async loadProjectResources(workspace: WorldviewProjectWorkspace): Promise<void> {
    const stagedCatalog = new EditorMaterialCatalog();
    const stagedWads = new Map<string, ArrayBuffer>();
    let stagedPalette: Uint8Array | undefined;
    for (const material of this.state.builtInMaterials) stagedCatalog.set(material);
    const palettePath = workspace.manifest.resources.palette;
    if (palettePath) {
      const bytes = new Uint8Array(
        await (await projectFile(workspace.handle, palettePath)).arrayBuffer(),
      );
      if (bytes.byteLength < 768) throw new Error(`${palettePath} is not a 768-byte Quake palette`);
      stagedPalette = bytes.slice(0, 768);
    }
    const resourceMessages: string[] = [];
    const wadPaths = workspace.manifest.resources.wads;
    const wadData = await Promise.all(
      wadPaths.map(async (path) => (await projectFile(workspace.handle, path)).arrayBuffer()),
    );
    for (const [index, path] of wadPaths.entries()) {
      const data = wadData[index];
      if (!data) throw new Error(`${path} could not be read`);
      const result = stagedCatalog.importWad(path, data, stagedPalette);
      stagedWads.set(path, data);
      resourceMessages.push(`${path}: ${result.added} added, ${result.replaced} replaced`);
      const error = result.diagnostics.find(({ severity }) => severity === 'error');
      if (error) throw new Error(error.message);
    }
    const walFiles = await loadProjectWalFiles(workspace);
    if (walFiles.length > 0) {
      if (!stagedPalette) {
        throw new Error('Quake II WAL material roots require a 768-byte palette resource');
      }
      const walPalette = stagedPalette;
      for (const { path, file } of walFiles) {
        const result = stagedCatalog.importWal(path, await file.arrayBuffer(), walPalette);
        resourceMessages.push(`${path}: ${result.added} added, ${result.replaced} replaced`);
        resourceMessages.push(...result.diagnostics.map(({ message }) => `${path}: ${message}`));
      }
    }
    const [definitions, sprites] = await Promise.all([
      loadProjectEntityDefinitions(workspace),
      loadProjectSprites(workspace),
    ]);
    this.signal.throwIfAborted();
    this.state.materialCatalog.clear();
    for (const material of stagedCatalog.materials()) this.state.materialCatalog.set(material);
    this.state.loadedWadSources.clear();
    for (const [path, data] of stagedWads) this.state.loadedWadSources.set(path, data);
    this.state.quakePalette = stagedPalette;
    this.state.entityDefinitions = definitions.catalog;
    this.state.projectSprites = sprites.sprites;
    this.state.renderer?.setEntityDefinitions(this.state.entityDefinitions);
    this.state.renderer?.setMaterials(this.state.materialCatalog.materials());
    this.state.renderer?.setSprites(this.state.projectSprites);
    this.refreshEntityDefinitionPresets();
    this.materials.renderMaterialCatalog();
    const definitionErrors = definitions.diagnostics.filter(({ severity }) => severity === 'error');
    const resourceMessage = [
      `${workspace.manifest.name}: ${this.state.materialCatalog.size} textures and ${this.state.entityDefinitions.size} entity definitions`,
      ...resourceMessages,
      ...definitionErrors.map(({ message }) => message),
      ...sprites.diagnostics,
    ].join(' · ');
    this.ui.resourceSettings.update({
      loadedWadCount: this.state.loadedWadSources.size,
      paletteLoaded: Boolean(this.state.quakePalette),
      message: resourceMessage,
      tone: definitionErrors.length > 0 || sprites.diagnostics.length > 0 ? 'error' : 'normal',
    });
  }

  public async openProjectDirectory(handle: EditorDirectoryHandle): Promise<void> {
    const workspace = await openWorldviewProject(handle);
    this.signal.throwIfAborted();
    await this.loadProjectResources(workspace);
    this.signal.throwIfAborted();
    this.state.projectWorkspace = workspace;
    this.state.projectKey = `${workspace.manifest.name.toLowerCase()}:${handle.name.toLowerCase()}`;
    const remembered = await this.state.projectLocalState.remember(
      this.state.projectKey,
      handle,
      workspace.manifest.name,
    );
    this.signal.throwIfAborted();
    if (remembered) this.state.projectKey = remembered.projectKey;
    this.state.workspaceId = remembered?.workspaceId ?? `project:${this.state.projectKey}`;
    this.state.activeGameProfile = workspace.manifest.game;
    this.ui.projectMap.replaceChildren(
      ...workspace.maps.map(({ path }) => {
        const option = document.createElement('option');
        option.value = path;
        option.textContent = path;
        return option;
      }),
    );
    this.ui.projectMap.hidden = workspace.maps.length === 0;
    this.ui.projectMap.selectedIndex = -1;
    this.ui.buildProfile.replaceChildren(
      ...workspace.manifest.buildProfiles.map((profile) => {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = `${profile.label} · ${profile.quality}`;
        return option;
      }),
    );
    this.ui.buildProfile.hidden = workspace.manifest.buildProfiles.length === 0;
    this.ui.buildProfile.value =
      workspace.manifest.defaultBuildProfile ?? workspace.manifest.buildProfiles[0]?.id ?? '';
    await this.build.checkCompilerService();
    this.signal.throwIfAborted();
    const summary = `Opened ${workspace.manifest.name}: ${workspace.maps.length} maps, ${this.state.entityDefinitions.size} entity definitions.`;
    if (remembered === null) {
      const warning =
        'The project is open, but its directory binding could not be saved; choose the directory again after reload.';
      this.ui.resourceSettings.update({ message: warning, tone: 'error' });
      this.ui.statusMessage.textContent = `${summary} ${warning}`;
      return;
    }
    this.ui.statusMessage.textContent = summary;
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
    this.ui.statusMessage.textContent = `Created an empty ${definition.label} ${format} map.`;
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
    const opened = await pickMapFile(this.ui.mapFile);
    if (!opened) return false;
    await this.openEditorMap(opened.file, opened.handle);
    return true;
  }

  public async renderRecoveryVersions(): Promise<void> {
    const snapshots = await this.state.recovery.list(this.state.documentKey);
    this.ui.recoveryList.replaceChildren(
      ...snapshots.map((snapshot) => {
        const row = document.createElement('div');
        row.className = 'recovery-row';
        const description = document.createElement('span');
        description.textContent = `${snapshot.protected ? '★ ' : ''}${snapshot.label} · r${snapshot.document.revision} · ${new Date(snapshot.updatedAt).toLocaleString()}`;
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.textContent = 'Restore';
        restore.addEventListener('click', () => {
          this.restoreRecoverySnapshot(snapshot);
          this.ui.recoveryDialog.close();
          this.ui.statusMessage.textContent = `Restored ${snapshot.label} as one undoable replacement.`;
        });
        const protect = document.createElement('button');
        protect.type = 'button';
        protect.textContent = snapshot.protected ? 'Unprotect' : 'Protect';
        protect.addEventListener('click', async () => {
          await this.state.recovery.setProtected(snapshot.snapshotId, !snapshot.protected);
          await this.renderRecoveryVersions();
        });
        row.append(description, restore, protect);
        return row;
      }),
    );
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

  public connect(signal: AbortSignal): void {
    required<HTMLButtonElement>('[data-action="new"]').addEventListener(
      'click',
      () => {
        this.ui.workspaceHome.invoke('newMap');
      },
      { signal },
    );

    required<HTMLButtonElement>('[data-action="show-source"]').addEventListener(
      'click',
      () => {
        this.document.updateSourceFromDocument(true);
        this.ui.sourceDialog.showModal();
        this.ui.source.focus();
      },
      { signal },
    );
    required<HTMLButtonElement>('[data-action="close-source"]').addEventListener(
      'click',
      () => {
        this.ui.sourceDialog.close();
      },
      { signal },
    );
    required<HTMLButtonElement>('[data-action="apply-source"]').addEventListener(
      'click',
      () => {
        try {
          const parsed = parseMapSource(
            this.ui.source.value,
            createSequentialIdFactory(`source-${Date.now()}`),
          );
          this.session.replaceDocument(parsed.document, 'Apply map source', {
            source: parsed.source,
            dirty: true,
            savedRevision: this.state.savedDocumentRevision,
          });
          this.ui.sourceDialog.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.ui.sourceMessage.textContent = message;
          this.ui.sourceMessage.classList.add('error-text');
          this.ui.statusMessage.textContent = 'Source contains a parse error.';
        }
      },
      { signal },
    );

    required<HTMLButtonElement>('[data-action="open-project"]').addEventListener(
      'click',
      async () => {
        try {
          if (!(await this.chooseProjectDirectory())) {
            this.ui.statusMessage.textContent =
              'Persistent project directories require a Chromium browser with File System Access.';
            return;
          }
        } catch (error) {
          this.ui.statusMessage.textContent = `Project open failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
      { signal },
    );

    this.ui.projectMap.addEventListener(
      'change',
      async () => {
        const map = this.state.projectWorkspace?.maps.find(
          ({ path }) => path === this.ui.projectMap.value,
        );
        if (!map) return;
        await this.openEditorMap(await map.handle.getFile(), map.handle, map.path);
      },
      { signal },
    );
    this.ui.buildProfile.addEventListener('change', () => void this.build.checkCompilerService(), {
      signal,
    });

    required<HTMLButtonElement>('[data-action="open-file"]').addEventListener(
      'click',
      async () => {
        try {
          await this.chooseMapFile();
        } catch (error) {
          this.ui.statusMessage.textContent =
            error instanceof Error ? error.message : String(error);
        }
      },
      { signal },
    );
    this.ui.mapFile.addEventListener(
      'change',
      async () => {
        const file = this.ui.mapFile.files?.[0];
        if (!file) return;
        await this.openEditorMap(file, null);
        this.ui.mapFile.value = '';
      },
      { signal },
    );

    required<HTMLButtonElement>('[data-action="download"]').addEventListener(
      'click',
      async () => {
        const plan = planMapSave(this.state.session.document, this.state.currentMapSource);
        if (plan.status === 'blocked') {
          this.ui.statusMessage.textContent = `${plan.diagnostics.map(({ message }) => message).join(' ')} Use Export normalized to create a separate copy.`;
          return;
        }
        if (!this.state.currentFileHandle || !this.state.lastDiskFingerprint) {
          downloadMapCopy(this.state.currentDocumentName, plan.text);
          this.ui.statusMessage.textContent =
            'Downloaded a source-preserving copy; the browser cannot confirm an on-disk save.';
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
          this.ui.statusMessage.textContent = `Saved ${this.state.currentDocumentName} without normalizing untouched source.`;
        } catch (error) {
          if (error instanceof ExternalFileChangeError && this.state.currentFileHandle) {
            const reload = window.confirm(
              `${error.message}\n\nChoose OK to reload the disk version, or Cancel to download a source-preserving copy.`,
            );
            if (reload)
              await this.openEditorMap(
                await this.state.currentFileHandle.getFile(),
                this.state.currentFileHandle,
              );
            else {
              downloadMapCopy(
                this.state.currentDocumentName.replace(/\.map$/i, '.copy.map'),
                plan.text,
              );
              this.ui.statusMessage.textContent =
                'Downloaded a copy; the externally changed file was not overwritten.';
            }
          } else {
            this.ui.statusMessage.textContent = `Save failed: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
      },
      { signal },
    );

    const closeCheckpointDialog = () => this.ui.checkpointDialog.close();
    const createCheckpoint = async () => {
      const label =
        this.ui.checkpointLabel.value.trim() ||
        `Checkpoint r${this.state.session.document.revision}`;
      try {
        const snapshot = await this.state.recovery.createCheckpoint(label);
        closeCheckpointDialog();
        this.ui.statusMessage.textContent = `Protected checkpoint “${snapshot.label}” created.`;
      } catch (error) {
        this.ui.statusMessage.textContent = `Checkpoint failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    };
    required<HTMLButtonElement>('[data-action="checkpoint"]').addEventListener(
      'click',
      () => {
        this.ui.checkpointLabel.value = `Checkpoint r${this.state.session.document.revision}`;
        this.ui.checkpointDialog.showModal();
        this.ui.checkpointLabel.focus();
        this.ui.checkpointLabel.select();
      },
      { signal },
    );
    required<HTMLButtonElement>('[data-action="create-checkpoint"]').addEventListener(
      'click',
      () => void createCheckpoint(),
      { signal },
    );
    required<HTMLButtonElement>('[data-action="close-checkpoint"]').addEventListener(
      'click',
      closeCheckpointDialog,
      { signal },
    );
    required<HTMLButtonElement>('[data-action="cancel-checkpoint"]').addEventListener(
      'click',
      closeCheckpointDialog,
      { signal },
    );
    this.ui.checkpointLabel.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void createCheckpoint();
      },
      { signal },
    );
    required<HTMLButtonElement>('[data-action="versions"]').addEventListener(
      'click',
      async () => {
        await this.renderRecoveryVersions();
        this.ui.recoveryDialog.showModal();
      },
      { signal },
    );
    required<HTMLButtonElement>('[data-action="close-recovery"]').addEventListener(
      'click',
      () => this.ui.recoveryDialog.close(),
      { signal },
    );

    required<HTMLButtonElement>('[data-action="export-normalized"]').addEventListener(
      'click',
      () => {
        const normalizedName = this.state.currentDocumentName.replace(/\.map$/i, '.normalized.map');
        downloadMapCopy(normalizedName, serializeMap(this.state.session.document));
        this.ui.statusMessage.textContent = `Exported normalized source as ${normalizedName}; the original was not overwritten.`;
      },
      { signal },
    );

    required<HTMLButtonElement>('[data-action="load-reference"]').addEventListener(
      'click',
      () => {
        this.ui.referenceFiles.click();
      },
      { signal },
    );
    required<HTMLButtonElement>('[data-action="snapshot-reference"]').addEventListener(
      'click',
      () => {
        this.materials.addReferenceDocument(
          `Document revision ${this.state.session.document.revision}`,
          this.state.session.document,
        );
      },
      { signal },
    );
    this.ui.clearReferencesButton.addEventListener(
      'click',
      () => {
        this.state.referenceScenes = [];
        this.state.renderer?.setReferenceScenes(this.state.referenceScenes);
        this.materials.renderReferenceScenes();
        this.ui.statusMessage.textContent = 'Cleared reference scenes.';
      },
      { signal },
    );

    this.ui.entityLinkModeSelect.addEventListener(
      'change',
      () => {
        const mode = this.ui.entityLinkModeSelect.value;
        if (mode !== 'all' && mode !== 'transitive' && mode !== 'direct' && mode !== 'none') return;
        this.state.entityLinkMode = mode;
        this.state.renderer?.setEntityLinkMode(mode);
        this.organization.updateEntityLinkSummary();
        this.ui.statusMessage.textContent = `Entity links: ${this.ui.entityLinkModeSelect.selectedOptions[0]?.textContent ?? mode}.`;
      },
      { signal },
    );
  }
}
