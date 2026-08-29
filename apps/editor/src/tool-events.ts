import {
  createSequentialIdFactory,
  deriveEditorGroups,
  findBrush,
  pointEntityDefinition,
  selectedEditorGroup,
  type FaceTextureAlignmentOperation,
  type EditorSelection,
} from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';
import { required } from './editor-elements.js';

const FACE_TEXTURE_ALIGNMENT_OPERATIONS = new Set<FaceTextureAlignmentOperation>([
  'reset',
  'world',
  'flip-u',
  'flip-v',
  'rotate-ccw',
  'rotate-cw',
  'align-edge',
  'justify-u-min',
  'justify-u-max',
  'justify-v-min',
  'justify-v-max',
  'fit-u',
  'fit-v',
  'auto-fit',
]);

export class ToolEvents {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
  }

  public connect(): void {
    for (const control of [
      this.ui.simpleShapeKind,
      this.ui.simpleShapeAxis,
      this.ui.simpleShapeSides,
      this.ui.simpleShapeCircleMode,
      this.ui.simpleShapeHollow,
      this.ui.simpleShapeThickness,
      this.ui.simpleShapeRings,
      this.ui.simpleShapeAccuracy,
      this.ui.simpleShapeStepHeight,
      this.ui.simpleShapeStairDirection,
    ]) {
      control.addEventListener('change', () => {
        try {
          this.app.geometry.updateSimpleShapeFields();
          if (this.state.activeTool === 'create') {
            this.ui.statusMessage.textContent = `${this.app.geometry.simpleShapeLabel(this.state.simpleShapeOptions.kind)} selected. Drag a bounding box in any viewport.`;
          }
        } catch (error) {
          this.ui.statusMessage.textContent =
            error instanceof Error ? error.message : String(error);
        }
      });
    }

    this.ui.gridSizeSelect.addEventListener('change', () => {
      this.state.activeGridSize = Number(this.ui.gridSizeSelect.value);
      this.state.renderer?.setGridSize(this.state.activeGridSize);
      this.ui.faceExtrudeDistance.step = String(this.state.activeGridSize);
      this.ui.faceExtrudeDistance.value = String(this.state.activeGridSize);
      this.ui.shearOffset.step = String(this.state.activeGridSize);
      this.ui.sweepTranslateInputs.forEach((input) => {
        input.step = String(this.state.activeGridSize);
      });
      this.ui.statusMessage.textContent = `Grid size set to ${this.state.activeGridSize}.`;
    });

    required<HTMLButtonElement>('[data-action="extrude-inward"]').addEventListener('click', () => {
      this.app.geometry.extrudeSelectedFaceBy(-this.state.activeGridSize);
    });
    required<HTMLButtonElement>('[data-action="extrude-outward"]').addEventListener('click', () => {
      this.app.geometry.extrudeSelectedFaceBy(this.state.activeGridSize);
    });
    required<HTMLButtonElement>('[data-action="extrude-exact"]').addEventListener('click', () => {
      this.app.geometry.extrudeSelectedFaceBy(Number(this.ui.faceExtrudeDistance.value));
    });
    required<HTMLButtonElement>('[data-action="split-face"]').addEventListener('click', () => {
      this.app.geometry.splitSelectedFaceBy(Number(this.ui.faceExtrudeDistance.value));
    });
    required<HTMLButtonElement>('[data-action="stamp-face"]').addEventListener('click', () => {
      this.app.geometry.stampSelectedFaceBy(Number(this.ui.faceExtrudeDistance.value));
    });
    const updateSweepFromControls = (): void => {
      if (this.state.activeTool !== 'sweep') return;
      try {
        this.app.geometry.readSweepControls();
        this.state.sweepEscapeReset = false;
        this.app.geometry.refreshSweepPreview();
      } catch (error) {
        this.state.sweepCandidate = null;
        this.ui.applySweepButton.disabled = true;
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    };
    for (const input of [
      ...this.ui.sweepTranslateInputs,
      ...this.ui.sweepRotateInputs,
      this.ui.sweepScale,
      this.ui.sweepSegments,
      this.ui.sweepIterations,
    ]) {
      input.addEventListener('input', updateSweepFromControls);
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        updateSweepFromControls();
        this.app.geometry.applySweep();
      });
    }
    this.ui.sweepPath.addEventListener('change', updateSweepFromControls);
    this.ui.sweepSnap.addEventListener('change', updateSweepFromControls);
    this.ui.textureLock.addEventListener('change', () => {
      this.state.sweepOptions = {
        ...this.state.sweepOptions,
        textureLock: this.ui.textureLock.checked,
      };
      this.app.geometry.refreshSweepPreview(false);
    });
    required<HTMLButtonElement>('[data-action="reset-sweep"]').addEventListener('click', () => {
      this.app.geometry.resetSweep(true);
      this.ui.statusMessage.textContent = 'Sweep destination and path controls reset.';
    });
    this.ui.applySweepButton.addEventListener('click', () => this.app.geometry.applySweep());
    this.ui.createHullButton.addEventListener('click', () => {
      try {
        if (!this.state.renderer?.commitHullBrush())
          this.ui.statusMessage.textContent = 'Place hull points first.';
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    this.ui.discardHullButton.addEventListener('click', () => {
      if (!this.state.renderer?.clearHullPoints())
        this.ui.statusMessage.textContent = 'There are no hull points to discard.';
    });
    this.ui.csgMergeButton.addEventListener('click', () =>
      this.app.geometry.applyCsgOperation('merge'),
    );
    this.ui.csgIntersectButton.addEventListener('click', () =>
      this.app.geometry.applyCsgOperation('intersect'),
    );
    required<HTMLButtonElement>('[data-action="csg-subtract"]').addEventListener('click', () =>
      this.app.geometry.applyCsgOperation('subtract'),
    );
    required<HTMLButtonElement>('[data-action="csg-hollow"]').addEventListener('click', () =>
      this.app.geometry.applyCsgOperation('hollow'),
    );
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-clip-mode]')) {
      button.addEventListener('click', () => {
        const mode = button.dataset.clipMode;
        if (mode === 'back' || mode === 'split' || mode === 'front')
          this.app.geometry.setClipMode(mode);
      });
    }
    this.ui.applyClipButton.addEventListener('click', () => this.app.geometry.applyClip());
    required<HTMLButtonElement>('[data-action="reset-clip"]').addEventListener('click', () => {
      this.state.renderer?.clearClipPlane();
    });
    required<HTMLButtonElement>('[data-action="reset-transform-pivot"]').addEventListener(
      'click',
      () => this.app.transform.resetTransformPivot(),
    );
    for (const input of [
      this.ui.transformPivotX,
      this.ui.transformPivotY,
      this.ui.transformPivotZ,
    ]) {
      input.addEventListener('input', () => {
        try {
          this.app.transform.readTransformPivot();
        } catch (error) {
          this.ui.statusMessage.textContent =
            error instanceof Error ? error.message : String(error);
        }
      });
    }
    required<HTMLButtonElement>('[data-action="apply-transform"]').addEventListener('click', () =>
      this.app.transform.applyExactTransform(),
    );
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-flip-axis]')) {
      button.addEventListener('click', () => {
        const axis = Number(button.dataset.flipAxis);
        if (axis === 0 || axis === 1 || axis === 2) this.app.transform.flipSelectedObjects(axis);
      });
    }

    required<HTMLButtonElement>('[data-action="load-wad"]').addEventListener('click', () => {
      this.ui.wadFiles.click();
    });
    required<HTMLButtonElement>('[data-action="load-palette"]').addEventListener('click', () => {
      this.ui.paletteFile.click();
    });
    required<HTMLButtonElement>('[data-action="apply-material"]').addEventListener('click', () => {
      this.app.materials.applySelectedMaterial();
    });
    this.ui.applyTextureTransformButton.addEventListener('click', () => {
      try {
        const changed = this.state.session.applyTextureTransform({
          offset: [Number(this.ui.textureShiftU.value), Number(this.ui.textureShiftV.value)],
          rotationDegrees: Number(this.ui.textureRotation.value),
          scale: [Number(this.ui.textureScaleU.value), Number(this.ui.textureScaleV.value)],
        });
        if (!changed)
          this.ui.statusMessage.textContent = 'Select a face before adjusting its texture.';
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[data-texture-align], [data-texture-layout]',
    )) {
      button.addEventListener('click', (event) => {
        const operation = (button.dataset.textureAlign ?? button.dataset.textureLayout) as
          | FaceTextureAlignmentOperation
          | undefined;
        if (!operation || !FACE_TEXTURE_ALIGNMENT_OPERATIONS.has(operation)) return;
        try {
          if (
            !this.state.session.alignTexture(operation, {
              direction: event.shiftKey ? -1 : 1,
              fitMode: event.ctrlKey || event.metaKey ? 'subdivide' : 'repeat',
              textureSizeForMaterial: (materialToken) => {
                const material = this.state.materialCatalog.find(materialToken);
                return material ? [material.width, material.height] : null;
              },
            })
          ) {
            this.ui.statusMessage.textContent =
              'Select a brush or face before aligning its texture.';
          }
        } catch (error) {
          this.ui.statusMessage.textContent =
            error instanceof Error ? error.message : String(error);
        }
      });
    }
    required<HTMLButtonElement>('[data-action="set-entity-property"]').addEventListener(
      'click',
      () => {
        const key = this.ui.entityPropertyKey.value.trim();
        if (!key) {
          this.ui.statusMessage.textContent = 'Enter an entity property key first.';
          this.ui.entityPropertyKey.focus();
          return;
        }
        this.app.entity.setEntityProperty(
          key,
          this.ui.entityPropertyValue.value,
          this.ui.entityPropertyProtected.checked,
        );
        this.ui.entityPropertyKey.value = '';
        this.ui.entityPropertyValue.value = '';
        this.ui.entityPropertyProtected.checked = false;
        this.ui.entityPropertyKey.focus();
      },
    );
    for (const input of [this.ui.entityPropertyKey, this.ui.entityPropertyValue]) {
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        required<HTMLButtonElement>('[data-action="set-entity-property"]').click();
      });
    }

    this.ui.pointEntityPreset.addEventListener('change', () => {
      this.ui.pointEntityClassname.value = this.ui.pointEntityPreset.value;
      this.state.renderer?.setEntityPlacementBounds(
        pointEntityDefinition(this.ui.pointEntityClassname.value, this.state.entityDefinitions)
          .bounds,
      );
      if (this.state.activeTool === 'entity') this.app.session.setEditorTool('entity');
    });
    this.ui.pointEntityClassname.addEventListener('input', () => {
      this.state.renderer?.setEntityPlacementBounds(
        pointEntityDefinition(this.ui.pointEntityClassname.value, this.state.entityDefinitions)
          .bounds,
      );
      if (this.state.activeTool === 'entity') {
        this.ui.statusMessage.textContent = this.ui.pointEntityClassname.value.trim()
          ? `Entity tool active. Click to place ${this.ui.pointEntityClassname.value.trim()}.`
          : 'Enter a point-entity classname before placing it.';
      }
    });

    this.ui.brushEntityClassname.addEventListener('input', () =>
      this.app.inspector.updateInspector(),
    );
    this.ui.createGroupButton.addEventListener('click', () => {
      try {
        const name = this.ui.groupName.value.trim() || 'Group';
        const ids = createSequentialIdFactory(`group-${this.state.session.document.revision + 1}`);
        const groupId = this.state.session.groupSelected(name, ids, this.state.openGroupId);
        if (!groupId) {
          this.ui.statusMessage.textContent = 'Select one or more objects before grouping.';
          return;
        }
        this.ui.statusMessage.textContent = `Grouped the selection as ${name}.`;
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    this.ui.renameGroupButton.addEventListener('click', () => {
      try {
        const group =
          selectedEditorGroup(this.state.session.document, this.state.session.selection) ??
          deriveEditorGroups(this.state.session.document).find(
            (candidate) => candidate.id === this.state.openGroupId,
          );
        if (!group) throw new Error('Select or open a group before renaming it');
        const name = this.ui.groupName.value.trim();
        if (!name) throw new Error('Enter a group name');
        this.state.session.renameGroup(group.id, name);
        this.ui.statusMessage.textContent = `Renamed group to ${name}.`;
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    this.ui.openGroupButton.addEventListener('click', () => {
      const group = selectedEditorGroup(this.state.session.document, this.state.session.selection);
      if (!group) {
        this.ui.statusMessage.textContent = 'Select a group before opening it.';
        return;
      }
      const memberSelection: EditorSelection | null = this.state.session.selection?.brushId
        ? { brushId: this.state.session.selection.brushId }
        : this.state.session.selection?.entityId
          ? { entityId: this.state.session.selection.entityId }
          : null;
      this.app.organization.openEditorGroup(group.id, memberSelection);
    });
    this.ui.closeGroupButton.addEventListener('click', () =>
      this.app.organization.closeEditorGroup(),
    );
    this.ui.createLinkedDuplicateButton.addEventListener('click', () => {
      try {
        this.state.duplicateSequence += 1;
        const groupId = this.state.session.linkedDuplicateSelected(
          createSequentialIdFactory(`linked-duplicate-${this.state.duplicateSequence}`),
          [this.state.activeGridSize, this.state.activeGridSize, 0],
          this.ui.textureLock.checked,
        );
        if (!groupId) {
          this.ui.statusMessage.textContent =
            'Select a closed group before creating a linked duplicate.';
          return;
        }
        const group = deriveEditorGroups(this.state.session.document).find(
          (candidate) => candidate.id === groupId,
        );
        this.ui.statusMessage.textContent = `Created linked duplicate${group ? ` of ${group.name}` : ''}. Move or transform this copy independently.`;
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    this.ui.unlinkGroupButton.addEventListener('click', () => {
      try {
        const group = selectedEditorGroup(
          this.state.session.document,
          this.state.session.selection,
        );
        if (!group || !this.state.session.unlinkGroup(group.id)) {
          this.ui.statusMessage.textContent = 'Select a linked group before unlinking it.';
          return;
        }
        this.ui.statusMessage.textContent = `Unlinked ${group.name}. Its contents are now independent.`;
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    this.ui.ungroupButton.addEventListener('click', () => {
      try {
        const group = selectedEditorGroup(
          this.state.session.document,
          this.state.session.selection,
        );
        if (!group || !this.state.session.ungroupSelected(group.id)) {
          this.ui.statusMessage.textContent = 'Select a closed group before ungrouping it.';
          return;
        }
        if (this.state.openGroupId === group.id) this.app.organization.closeEditorGroup(false);
        this.ui.statusMessage.textContent = `Ungrouped ${group.name} without deleting its objects.`;
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    this.ui.groupName.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (!this.ui.renameGroupButton.hidden) this.ui.renameGroupButton.click();
      else this.ui.createGroupButton.click();
    });
    this.ui.makeBrushEntityButton.addEventListener('click', () => {
      try {
        const classname = this.ui.brushEntityClassname.value.trim();
        if (!classname) throw new Error('Enter a brush-entity classname first');
        const ids = createSequentialIdFactory(
          `brush-entity-${this.state.session.document.revision + 1}`,
        );
        if (!this.state.session.createBrushEntity(classname, ids)) {
          this.ui.statusMessage.textContent = 'Select one or more brushes first.';
        }
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    this.ui.makeStructuralButton.addEventListener('click', () => {
      try {
        if (!this.state.session.makeSelectedStructural()) {
          this.ui.statusMessage.textContent = 'Select one or more brushes first.';
        }
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    required<HTMLButtonElement>('[data-action="sample-material"]').addEventListener('click', () => {
      const selection = this.state.session.selection;
      const brush = selection?.brushId
        ? findBrush(this.state.session.document, selection.brushId)
        : null;
      const face = selection?.faceId
        ? brush?.faces.find((candidate) => candidate.id === selection.faceId)
        : undefined;
      if (!face) {
        this.ui.statusMessage.textContent = 'Select a face before sampling its material.';
        return;
      }
      this.state.activeMaterialName = face.material;
      this.ui.materialName.value = face.material;
      this.ui.applyMaterialButton.disabled = false;
      this.app.materials.renderMaterialCatalog();
      this.ui.statusMessage.textContent = `Sampled ${face.material}.`;
    });

    this.ui.materialFilter.addEventListener('input', () =>
      this.app.materials.renderMaterialCatalog(),
    );
    this.ui.materialSort.addEventListener('change', () =>
      this.app.materials.renderMaterialCatalog(),
    );
    this.ui.materialUsedOnly.addEventListener('change', () =>
      this.app.materials.renderMaterialCatalog(),
    );
    this.ui.materialName.addEventListener('input', () => {
      this.state.activeMaterialName = this.ui.materialName.value.trim();
      this.ui.applyMaterialButton.disabled =
        !this.state.session.selection || this.state.activeMaterialName.length === 0;
      this.app.materials.renderMaterialCatalog();
    });
    this.ui.selectMaterialFacesButton.addEventListener('click', () =>
      this.app.materials.selectFacesUsingCurrentMaterial(),
    );
    this.ui.selectMaterialBrushesButton.addEventListener('click', () =>
      this.app.materials.selectBrushesUsingCurrentMaterial(),
    );
    this.ui.setMaterialReplaceSourceButton.addEventListener('click', () => {
      this.ui.materialReplaceSource.value = this.app.materials.selectedMaterialToken();
      this.app.materials.updateMaterialBrowserControls();
      this.ui.materialReplaceTarget.focus();
    });
    this.ui.setMaterialReplaceTargetButton.addEventListener('click', () => {
      this.ui.materialReplaceTarget.value = this.app.materials.selectedMaterialToken();
      this.app.materials.updateMaterialBrowserControls();
    });
    this.ui.materialReplaceSource.addEventListener('input', () =>
      this.app.materials.updateMaterialBrowserControls(),
    );
    this.ui.materialReplaceTarget.addEventListener('input', () =>
      this.app.materials.updateMaterialBrowserControls(),
    );
    this.ui.materialReplaceButton.addEventListener('click', () =>
      this.app.materials.replaceSelectedMaterialUsage(),
    );

    this.ui.paletteFile.addEventListener('change', async () => {
      const file = this.ui.paletteFile.files?.[0];
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength < 768) {
        this.ui.materialMessage.textContent = `${file.name} is ${bytes.byteLength} bytes; a Quake palette needs at least 768.`;
        this.ui.materialMessage.classList.add('error-text');
      } else {
        this.state.quakePalette = bytes.slice(0, 768);
        for (const [name, data] of this.state.loadedWadSources) {
          this.state.materialCatalog.importWad(name, data, this.state.quakePalette);
        }
        this.app.materials.renderMaterialCatalog();
        this.state.renderer?.setMaterials(this.state.materialCatalog.materials());
        this.ui.materialMessage.textContent = `Loaded ${file.name}. Existing and future WAD2 imports use this palette.`;
        this.ui.materialMessage.classList.remove('error-text');
      }
      this.ui.paletteFile.value = '';
    });

    this.ui.wadFiles.addEventListener('change', async () => {
      const files = [...(this.ui.wadFiles.files ?? [])];
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
          summaries.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.app.materials.renderMaterialCatalog();
      this.state.renderer?.setMaterials(this.state.materialCatalog.materials());
      this.ui.materialMessage.textContent = summaries.join(' · ');
      this.ui.materialMessage.classList.toggle('error-text', hasErrors);
      this.ui.statusMessage.textContent = `Material catalog now contains ${this.state.materialCatalog.size} textures.`;
      this.ui.wadFiles.value = '';
    });

    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-nudge-axis]')) {
      button.addEventListener('click', () => {
        const axis = Number(button.dataset.nudgeAxis);
        const direction = Number(button.dataset.nudgeDirection);
        if (!Number.isInteger(axis) || axis < 0 || axis > 2 || !Number.isFinite(direction)) return;
        const delta: [number, number, number] = [0, 0, 0];
        delta[axis] = this.state.activeGridSize * direction;
        if (this.state.activeTool === 'sweep') {
          const translation = [...this.state.sweepTransform.translation] as [
            number,
            number,
            number,
          ];
          translation[axis] = translation[axis]! + delta[axis]!;
          this.state.sweepTransform = { ...this.state.sweepTransform, translation };
          this.state.sweepEscapeReset = false;
          this.app.geometry.syncSweepControls();
          this.app.geometry.refreshSweepPreview();
          return;
        }
        if (
          this.state.activeTool === 'face' &&
          this.app.transform.commitFaceNudge(
            delta,
            this.state.lastPointerPosition?.viewport ?? 'perspective',
          )
        ) {
          return;
        }
        if (
          this.app.transform.isTopologyTool(this.state.activeTool) &&
          this.app.transform.commitTopologyNudge(
            delta,
            this.state.lastPointerPosition?.viewport ?? 'perspective',
          )
        ) {
          return;
        }
        try {
          if (!this.state.session.translateSelected(delta, this.ui.textureLock.checked)) {
            this.ui.statusMessage.textContent = 'Select a brush before nudging.';
          }
        } catch (error) {
          this.ui.statusMessage.textContent =
            error instanceof Error ? error.message : String(error);
        }
      });
    }

    for (const pane of document.querySelectorAll<HTMLElement>('.viewport-pane')) {
      pane.querySelector('header')?.addEventListener('dblclick', () => {
        const maximized = pane.classList.toggle('maximized');
        this.ui.viewportGrid.classList.toggle('has-maximized', maximized);
        if (!maximized) return;
        for (const other of document.querySelectorAll<HTMLElement>('.viewport-pane')) {
          if (other !== pane) other.classList.remove('maximized');
        }
      });
    }

    window.addEventListener('copy', (event) => {
      if (this.app.document.isTextEditingTarget(event.target)) return;
      const text = this.app.document.copySelectionText();
      if (!text) return;
      event.preventDefault();
      event.clipboardData?.setData('text/plain', text);
      this.ui.statusMessage.textContent = this.state.session.selection?.faceId
        ? 'Copied face material and attributes.'
        : 'Copied selected objects as map text.';
    });

    window.addEventListener('paste', (event) => {
      if (this.app.document.isTextEditingTarget(event.target)) return;
      const text = event.clipboardData?.getData('text/plain');
      if (!text?.trim()) return;
      event.preventDefault();
      this.app.document.pasteClipboardText(text, 'cursor');
    });
  }
}
