import {
  createSequentialIdFactory,
  deriveEditorGroups,
  selectedEditorGroup,
  type EditorSelection,
} from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';
import type { ObjectToolsCommand } from './object-tools-state.js';

export class ToolEvents {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
  }

  public connect(signal: AbortSignal): void {
    this.ui.toolSettings.bind({
      setGridSize: (size) => {
        this.state.activeGridSize = size;
        this.ui.toolSettings.update({ gridSize: size });
        this.state.renderer?.setGridSize(this.state.activeGridSize);
        this.ui.objectTools.updateFaceExtrude({ distance: size, step: size });
        this.app.geometry.syncSweepControls();
        this.ui.statusMessage.set(`Grid size set to ${this.state.activeGridSize}.`);
      },
      setTextureLock: (enabled) => {
        this.state.textureLock = enabled;
        this.ui.toolSettings.update({ textureLock: enabled });
        this.state.sweepOptions = { ...this.state.sweepOptions, textureLock: enabled };
        this.app.geometry.refreshSweepPreview(false);
      },
    });
    signal.addEventListener('abort', () => this.ui.toolSettings.unbind(), { once: true });

    this.ui.objectTools.bind({
      dispatch: (command) => this.dispatchObjectToolsCommand(command),
    });
    signal.addEventListener('abort', () => this.ui.objectTools.unbind(), { once: true });

    this.app.elements.paletteFile.addEventListener(
      'change',
      async () => {
        const file = this.app.elements.paletteFile.files?.[0];
        if (!file) return;
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.byteLength < 768) {
          this.ui.resourceSettings.update({
            message: `${file.name} is ${bytes.byteLength} bytes; a Quake palette needs at least 768.`,
            tone: 'error',
          });
        } else {
          this.state.quakePalette = bytes.slice(0, 768);
          for (const [name, data] of this.state.loadedWadSources) {
            this.state.materialCatalog.importWad(name, data, this.state.quakePalette);
          }
          this.app.materials.renderMaterialCatalog();
          this.state.renderer?.setMaterials(this.state.materialCatalog.materials());
          this.ui.resourceSettings.update({
            message: `Loaded ${file.name}. Existing and future WAD2 imports use this palette.`,
            paletteLoaded: true,
            tone: 'normal',
          });
        }
        this.app.elements.paletteFile.value = '';
      },
      { signal },
    );

    this.app.elements.wadFiles.addEventListener(
      'change',
      async () => {
        const files = [...(this.app.elements.wadFiles.files ?? [])];
        if (files.length === 0) return;
        const summaries: string[] = [];
        let hasErrors = false;
        const wadData = await Promise.allSettled(files.map((file) => file.arrayBuffer()));
        for (const [index, file] of files.entries()) {
          try {
            const data = wadData[index];
            if (!data || data.status === 'rejected') {
              throw data?.reason ?? new Error('WAD file could not be read');
            }
            const result = this.state.materialCatalog.importWad(
              file.name,
              data.value,
              this.state.quakePalette,
            );
            this.state.loadedWadSources.set(file.name, data.value);
            await this.state.assetMountState.addBrowserWad(
              this.state.documentKey,
              this.state.activeGameProfile,
              file.name,
              data.value,
              this.state.loadedWadSources.size,
            );
            summaries.push(
              `${file.name}: ${result.added} added, ${result.replaced} replaced, ${result.skipped} skipped`,
            );
            hasErrors ||= result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
            if (result.diagnostics[0]) summaries.push(result.diagnostics[0].message);
          } catch (error) {
            hasErrors = true;
            summaries.push(
              `${file.name}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        this.app.materials.renderMaterialCatalog();
        this.state.renderer?.setMaterials(this.state.materialCatalog.materials());
        this.ui.resourceSettings.update({
          message: summaries.join(' · '),
          tone: hasErrors ? 'error' : 'normal',
          loadedWadCount: this.state.loadedWadSources.size,
        });
        this.ui.statusMessage.set(
          `Material catalog now contains ${this.state.materialCatalog.size} textures.`,
        );
        this.app.elements.wadFiles.value = '';
      },
      { signal },
    );

    window.addEventListener(
      'copy',
      (event) => {
        if (this.app.document.isTextEditingTarget(event.target)) return;
        const text = this.app.document.copySelectionText();
        if (!text) return;
        event.preventDefault();
        event.clipboardData?.setData('text/plain', text);
        this.ui.statusMessage.set(
          this.state.session.selection?.faceId
            ? 'Copied face material and attributes.'
            : 'Copied selected objects as map text.',
        );
      },
      { signal },
    );

    window.addEventListener(
      'paste',
      (event) => {
        if (this.app.document.isTextEditingTarget(event.target)) return;
        const text = event.clipboardData?.getData('text/plain');
        if (!text?.trim()) return;
        event.preventDefault();
        this.app.document.pasteClipboardText(text, 'cursor');
      },
      { signal },
    );
  }

  private dispatchObjectToolsCommand(command: ObjectToolsCommand): void {
    try {
      switch (command.type) {
        case 'create-hull':
          if (!this.state.renderer?.commitHullBrush()) {
            this.ui.statusMessage.set('Place hull points first.');
          }
          return;
        case 'discard-hull':
          if (!this.state.renderer?.clearHullPoints()) {
            this.ui.statusMessage.set('There are no hull points to discard.');
          }
          return;
        case 'create-group': {
          const name = command.name.trim() || 'Group';
          const ids = createSequentialIdFactory(
            `group-${this.state.session.document.revision + 1}`,
          );
          if (!this.state.session.groupSelected(name, ids, this.state.openGroupId)) {
            this.ui.statusMessage.set('Select one or more objects before grouping.');
            return;
          }
          this.ui.statusMessage.set(`Grouped the selection as ${name}.`);
          return;
        }
        case 'rename-group': {
          const group =
            selectedEditorGroup(this.state.session.document, this.state.session.selection) ??
            deriveEditorGroups(this.state.session.document).find(
              (candidate) => candidate.id === this.state.openGroupId,
            );
          if (!group) throw new Error('Select or open a group before renaming it');
          const name = command.name.trim();
          if (!name) throw new Error('Enter a group name');
          this.state.session.renameGroup(group.id, name);
          this.ui.statusMessage.set(`Renamed group to ${name}.`);
          return;
        }
        case 'open-group': {
          const group = selectedEditorGroup(
            this.state.session.document,
            this.state.session.selection,
          );
          if (!group) {
            this.ui.statusMessage.set('Select a group before opening it.');
            return;
          }
          const memberSelection: EditorSelection | null = this.state.session.selection?.brushId
            ? { brushId: this.state.session.selection.brushId }
            : this.state.session.selection?.entityId
              ? { entityId: this.state.session.selection.entityId }
              : null;
          this.app.organization.openEditorGroup(group.id, memberSelection);
          return;
        }
        case 'close-group':
          this.app.organization.closeEditorGroup();
          return;
        case 'duplicate-linked-group': {
          this.state.duplicateSequence += 1;
          const groupId = this.state.session.linkedDuplicateSelected(
            createSequentialIdFactory(`linked-duplicate-${this.state.duplicateSequence}`),
            [this.state.activeGridSize, this.state.activeGridSize, 0],
            this.state.textureLock,
          );
          if (!groupId) {
            this.ui.statusMessage.set('Select a closed group before creating a linked duplicate.');
            return;
          }
          const group = deriveEditorGroups(this.state.session.document).find(
            (candidate) => candidate.id === groupId,
          );
          this.ui.statusMessage.set(
            `Created linked duplicate${group ? ` of ${group.name}` : ''}. Move or transform this copy independently.`,
          );
          return;
        }
        case 'unlink-group': {
          const group = selectedEditorGroup(
            this.state.session.document,
            this.state.session.selection,
          );
          if (!group || !this.state.session.unlinkGroup(group.id)) {
            this.ui.statusMessage.set('Select a linked group before unlinking it.');
            return;
          }
          this.ui.statusMessage.set(`Unlinked ${group.name}. Its contents are now independent.`);
          return;
        }
        case 'ungroup': {
          const group = selectedEditorGroup(
            this.state.session.document,
            this.state.session.selection,
          );
          if (!group || !this.state.session.ungroupSelected(group.id)) {
            this.ui.statusMessage.set('Select a closed group before ungrouping it.');
            return;
          }
          if (this.state.openGroupId === group.id) this.app.organization.closeEditorGroup(false);
          this.ui.statusMessage.set(`Ungrouped ${group.name} without deleting its objects.`);
          return;
        }
        case 'selection-query':
          this.app.document.applySelectionBrushQuery(command.mode);
          return;
        case 'flip':
          this.app.transform.flipSelectedObjects(command.axis);
          return;
        case 'face-extrude':
          if (command.operation === 'inward') {
            this.app.geometry.extrudeSelectedFaceBy(-this.state.activeGridSize);
          } else if (command.operation === 'outward') {
            this.app.geometry.extrudeSelectedFaceBy(this.state.activeGridSize);
          } else if (command.operation === 'exact') {
            this.app.geometry.extrudeSelectedFaceBy(command.distance);
          } else if (command.operation === 'split') {
            this.app.geometry.splitSelectedFaceBy(command.distance);
          } else {
            this.app.geometry.stampSelectedFaceBy(command.distance);
          }
          return;
        case 'set-clip-mode':
          this.app.geometry.setClipMode(command.mode);
          return;
        case 'apply-clip':
          this.app.geometry.applyClip();
          return;
        case 'reset-clip':
          this.state.renderer?.clearClipPlane();
          return;
        case 'set-transform-pivot':
          this.app.transform.setTransformPivot(command.pivot);
          return;
        case 'reset-transform-pivot':
          this.app.transform.resetTransformPivot();
          return;
        case 'apply-transform':
          this.app.transform.applyExactTransform();
          return;
        case 'csg':
          this.app.geometry.applyCsgOperation(command.operation);
          return;
        case 'make-brush-entity': {
          const classname = command.classname.trim();
          if (!classname) throw new Error('Enter a brush-entity classname first');
          const ids = createSequentialIdFactory(
            `brush-entity-${this.state.session.document.revision + 1}`,
          );
          if (!this.state.session.createBrushEntity(classname, ids)) {
            this.ui.statusMessage.set('Select one or more brushes first.');
          }
          return;
        }
        case 'make-structural':
          if (!this.state.session.makeSelectedStructural()) {
            this.ui.statusMessage.set('Select one or more brushes first.');
          }
          return;
        case 'nudge':
          this.nudge(command.axis, command.direction);
      }
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  private nudge(axis: 0 | 1 | 2, direction: -1 | 1): void {
    const delta: [number, number, number] = [0, 0, 0];
    delta[axis] = this.state.activeGridSize * direction;
    if (this.state.activeTool === 'sweep') {
      const translation = [...this.state.sweepTransform.translation] as [number, number, number];
      translation[axis] += delta[axis];
      this.state.sweepTransform = { ...this.state.sweepTransform, translation };
      this.state.sweepEscapeReset = false;
      this.app.geometry.syncSweepControls();
      this.app.geometry.refreshSweepPreview();
      return;
    }
    const viewport = this.state.lastPointerPosition?.viewport ?? 'perspective';
    if (this.state.activeTool === 'face' && this.app.transform.commitFaceNudge(delta, viewport)) {
      return;
    }
    if (
      this.app.transform.isTopologyTool(this.state.activeTool) &&
      this.app.transform.commitTopologyNudge(delta, viewport)
    ) {
      return;
    }
    if (!this.state.session.translateSelected(delta, this.state.textureLock)) {
      this.ui.statusMessage.set('Select a brush before nudging.');
    }
  }
}
