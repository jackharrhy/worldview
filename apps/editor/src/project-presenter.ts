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
  openWorldviewProject,
  pickProjectDirectory,
  projectFile,
  ensureProjectDirectoryPermission,
  type EditorDirectoryHandle,
  type WorldviewProjectWorkspace,
} from './project-workspace.js';
import {
  EditorMaterialCatalog,
  BUILTIN_POINT_ENTITY_DEFINITIONS,
  createStarterDocument,
  createSequentialIdFactory,
  mapSourceFingerprint,
  parseMapSource,
  planMapSave,
  serializeMap,
  rebaseMapSource,
} from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';
import { recoverySourceIdFactory, type DocumentRecoverySnapshot } from './document-recovery.js';
import { required } from './editor-elements.js';

export class ProjectPresenter {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
  }

  public async openEditorMap(
    file: File,
    handle: EditorFileHandle | null,
    logicalName = file.name,
  ): Promise<void> {
    try {
      const text = await file.text();
      let parsed = parseMapSource(text, createSequentialIdFactory(`opened-${Date.now()}`));
      const fingerprint = mapSourceFingerprint(text);
      const recovered = await this.state.recovery.latest(logicalName.toLowerCase());
      if (
        recovered &&
        recovered.updatedAt > file.lastModified &&
        recovered.document.revision !== recovered.savedDocumentRevision &&
        window.confirm(
          `A newer recovery snapshot exists for ${logicalName}. Restore revision ${recovered.document.revision}?`,
        )
      ) {
        const sourceMatchesDisk = recovered.source.fingerprint === fingerprint;
        if (sourceMatchesDisk) parsed = parseMapSource(text, recoverySourceIdFactory(recovered));
        this.app.session.replaceDocument(parsed.document, 'Open map before recovery', {
          name: logicalName,
          source: sourceMatchesDisk ? recovered.source : parsed.source,
          fileHandle: sourceMatchesDisk ? handle : null,
          diskFingerprint: sourceMatchesDisk ? fingerprint : null,
          dirty: false,
          savedRevision: parsed.document.revision,
        });
        this.state.session.restoreDocument(recovered.document, `Restore ${recovered.label}`);
        this.ui.statusMessage.textContent = sourceMatchesDisk
          ? `Restored recovery for ${logicalName}; the on-disk map is unchanged.`
          : `Restored recovery for ${logicalName} as a detached copy because the on-disk source changed.`;
        return;
      }
      this.app.session.replaceDocument(parsed.document, 'Open map', {
        name: logicalName,
        source: parsed.source,
        fileHandle: handle,
        diskFingerprint: fingerprint,
        dirty: false,
        savedRevision: parsed.document.revision,
      });
      this.ui.statusMessage.textContent = `Opened ${logicalName}${handle ? ' with a writable browser handle' : ''}.`;
    } catch (error) {
      this.ui.statusMessage.textContent = `${file.name}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  public refreshEntityDefinitionPresets(): void {
    const definitions = new Map(
      [
        ...BUILTIN_POINT_ENTITY_DEFINITIONS,
        ...this.state.entityDefinitions
          .all()
          .filter(({ kind }) => kind === 'point')
          .map((definition) => ({
            classname: definition.classname,
            label: definition.label,
            bounds: definition.bounds ?? { min: [-16, -16, -16], max: [16, 16, 16] },
          })),
      ].map((definition) => [definition.classname.toLowerCase(), definition]),
    );
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
    for (const path of workspace.manifest.resources.wads) {
      const data = await (await projectFile(workspace.handle, path)).arrayBuffer();
      const result = stagedCatalog.importWad(path, data, stagedPalette);
      stagedWads.set(path, data);
      resourceMessages.push(`${path}: ${result.added} added, ${result.replaced} replaced`);
      const error = result.diagnostics.find(({ severity }) => severity === 'error');
      if (error) throw new Error(error.message);
    }
    const [definitions, sprites] = await Promise.all([
      loadProjectEntityDefinitions(workspace),
      loadProjectSprites(workspace),
    ]);
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
    this.app.materials.renderMaterialCatalog();
    const definitionErrors = definitions.diagnostics.filter(({ severity }) => severity === 'error');
    this.ui.materialMessage.textContent = [
      `${workspace.manifest.name}: ${this.state.materialCatalog.size} textures and ${this.state.entityDefinitions.size} entity definitions`,
      ...resourceMessages,
      ...definitionErrors.map(({ message }) => message),
      ...sprites.diagnostics,
    ].join(' · ');
    this.ui.materialMessage.classList.toggle(
      'error-text',
      definitionErrors.length > 0 || sprites.diagnostics.length > 0,
    );
  }

  public async openProjectDirectory(handle: EditorDirectoryHandle): Promise<void> {
    const workspace = await openWorldviewProject(handle);
    await this.loadProjectResources(workspace);
    this.state.projectWorkspace = workspace;
    this.state.projectKey = `${workspace.manifest.name.toLowerCase()}:${handle.name.toLowerCase()}`;
    await this.state.projectLocalState.remember(this.state.projectKey, handle);
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
    this.ui.statusMessage.textContent = `Opened ${workspace.manifest.name}: ${workspace.maps.length} maps, ${this.state.entityDefinitions.size} entity definitions.`;
  }

  private async projectDirectoryForOpen(): Promise<EditorDirectoryHandle | null> {
    const remembered = await this.state.projectLocalState.latest().catch(() => null);
    if (remembered && (await ensureProjectDirectoryPermission(remembered.handle, true))) {
      return remembered.handle;
    }
    return pickProjectDirectory();
  }

  public async renderRecoveryVersions(): Promise<void> {
    const snapshots = await this.state.recovery.list(this.state.currentDocumentName.toLowerCase());
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

  public connect(): void {
    required<HTMLButtonElement>('[data-action="new"]').addEventListener('click', () => {
      const document = createStarterDocument();
      this.app.session.replaceDocument(document, 'Create starter map', {
        name: 'untitled.map',
        source: rebaseMapSource(document, serializeMap(document)),
        fileHandle: null,
        diskFingerprint: null,
        dirty: true,
        savedRevision: -1,
      });
    });

    required<HTMLButtonElement>('[data-action="show-source"]').addEventListener('click', () => {
      this.app.document.updateSourceFromDocument();
      this.ui.sourceDialog.showModal();
      this.ui.source.focus();
    });
    required<HTMLButtonElement>('[data-action="close-source"]').addEventListener('click', () => {
      this.ui.sourceDialog.close();
    });
    required<HTMLButtonElement>('[data-action="apply-source"]').addEventListener('click', () => {
      try {
        const parsed = parseMapSource(
          this.ui.source.value,
          createSequentialIdFactory(`source-${Date.now()}`),
        );
        this.app.session.replaceDocument(parsed.document, 'Apply map source', {
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
    });

    required<HTMLButtonElement>('[data-action="open-project"]').addEventListener(
      'click',
      async () => {
        try {
          const handle = await this.projectDirectoryForOpen();
          if (!handle) {
            this.ui.statusMessage.textContent =
              'Persistent project directories require a Chromium browser with File System Access.';
            return;
          }
          await this.openProjectDirectory(handle);
        } catch (error) {
          this.ui.statusMessage.textContent = `Project open failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    );

    this.ui.projectMap.addEventListener('change', async () => {
      const map = this.state.projectWorkspace?.maps.find(
        ({ path }) => path === this.ui.projectMap.value,
      );
      if (!map) return;
      await this.openEditorMap(map.file, map.handle, map.path);
    });

    required<HTMLButtonElement>('[data-action="open-file"]').addEventListener('click', async () => {
      try {
        const opened = await pickMapFile(this.ui.mapFile);
        if (opened) await this.openEditorMap(opened.file, opened.handle);
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    this.ui.mapFile.addEventListener('change', async () => {
      const file = this.ui.mapFile.files?.[0];
      if (!file) return;
      await this.openEditorMap(file, null);
      this.ui.mapFile.value = '';
    });

    required<HTMLButtonElement>('[data-action="download"]').addEventListener('click', async () => {
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
        this.app.document.setDocumentDirty(false);
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
    });

    required<HTMLButtonElement>('[data-action="checkpoint"]').addEventListener(
      'click',
      async () => {
        const label = window.prompt(
          'Checkpoint label',
          `Checkpoint r${this.state.session.document.revision}`,
        );
        if (label === null) return;
        const snapshot = await this.state.recovery.createCheckpoint(label);
        this.ui.statusMessage.textContent = `Protected checkpoint “${snapshot.label}” created.`;
      },
    );
    required<HTMLButtonElement>('[data-action="versions"]').addEventListener('click', async () => {
      await this.renderRecoveryVersions();
      this.ui.recoveryDialog.showModal();
    });
    required<HTMLButtonElement>('[data-action="close-recovery"]').addEventListener('click', () =>
      this.ui.recoveryDialog.close(),
    );

    required<HTMLButtonElement>('[data-action="export-normalized"]').addEventListener(
      'click',
      () => {
        const normalizedName = this.state.currentDocumentName.replace(/\.map$/i, '.normalized.map');
        downloadMapCopy(normalizedName, serializeMap(this.state.session.document));
        this.ui.statusMessage.textContent = `Exported normalized source as ${normalizedName}; the original was not overwritten.`;
      },
    );

    required<HTMLButtonElement>('[data-action="load-reference"]').addEventListener('click', () => {
      this.ui.referenceFiles.click();
    });
    required<HTMLButtonElement>('[data-action="snapshot-reference"]').addEventListener(
      'click',
      () => {
        this.app.materials.addReferenceDocument(
          `Document revision ${this.state.session.document.revision}`,
          this.state.session.document,
        );
      },
    );
    this.ui.clearReferencesButton.addEventListener('click', () => {
      this.state.referenceScenes = [];
      this.state.renderer?.setReferenceScenes(this.state.referenceScenes);
      this.app.materials.renderReferenceScenes();
      this.ui.statusMessage.textContent = 'Cleared reference scenes.';
    });

    this.ui.entityLinkModeSelect.addEventListener('change', () => {
      const mode = this.ui.entityLinkModeSelect.value;
      if (mode !== 'all' && mode !== 'transitive' && mode !== 'direct' && mode !== 'none') return;
      this.state.entityLinkMode = mode;
      this.state.renderer?.setEntityLinkMode(mode);
      this.app.organization.updateEntityLinkSummary();
      this.ui.statusMessage.textContent = `Entity links: ${this.ui.entityLinkModeSelect.selectedOptions[0]?.textContent ?? mode}.`;
    });
  }
}
