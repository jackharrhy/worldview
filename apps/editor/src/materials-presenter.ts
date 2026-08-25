import {
  materialUsageInDocument,
  selectedBrushIds,
  selectedFaceReferences,
  type EditorReferenceScene,
  type MapDocument,
} from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';

export class MaterialsPresenter {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
  }

  public selectedMaterialToken(): string {
    return this.ui.materialName.value.trim() || this.state.activeMaterialName;
  }

  public updateMaterialBrowserControls(): void {
    const material = this.selectedMaterialToken();
    const hasMaterial = material.length > 0;
    this.ui.selectMaterialFacesButton.disabled = !hasMaterial;
    this.ui.selectMaterialBrushesButton.disabled = !hasMaterial;
    this.ui.setMaterialReplaceSourceButton.disabled = !hasMaterial;
    this.ui.setMaterialReplaceTargetButton.disabled = !hasMaterial;

    const sourceMaterial = this.ui.materialReplaceSource.value.trim();
    const targetMaterial = this.ui.materialReplaceTarget.value.trim();
    this.ui.materialReplaceButton.disabled =
      !sourceMaterial ||
      !targetMaterial ||
      sourceMaterial.toLowerCase() === targetMaterial.toLowerCase();

    const selectedFaces = selectedFaceReferences(this.state.session.selection);
    if (selectedFaces.length > 0) {
      this.ui.materialReplaceScope.textContent = `${selectedFaces.length} selected ${selectedFaces.length === 1 ? 'face' : 'faces'} · replacement selects changed faces.`;
      return;
    }
    const selectedBrushes = selectedBrushIds(this.state.session.selection);
    if (selectedBrushes.length > 0) {
      this.ui.materialReplaceScope.textContent = `${selectedBrushes.length} selected ${selectedBrushes.length === 1 ? 'brush' : 'brushes'} · replacement affects their matching faces.`;
      return;
    }
    this.ui.materialReplaceScope.textContent = this.state.session.selection
      ? 'Selection has no brush faces to replace.'
      : 'No selection · replacement affects the whole map and selects changed faces.';
  }

  public renderMaterialCatalog(): void {
    const queryTokens = this.ui.materialFilter.value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const usages = materialUsageInDocument(this.state.session.document);
    const usageByName = new Map(usages.map((usage) => [usage.material.toLowerCase(), usage]));
    const loadedNames = new Set(
      this.state.materialCatalog.materials().map((material) => material.name.toLowerCase()),
    );
    const missingMaterials = usages
      .filter((usage) => !loadedNames.has(usage.material.toLowerCase()))
      .map((usage) => usage.material)
      .toSorted((left, right) => left.localeCompare(right));
    const materials = this.state.materialCatalog
      .materials()
      .filter((material) =>
        queryTokens.every((token) => material.name.toLowerCase().includes(token)),
      )
      .filter(
        (material) =>
          !this.ui.materialUsedOnly.checked || usageByName.has(material.name.toLowerCase()),
      )
      .toSorted((left, right) => {
        if (this.ui.materialSort.value === 'usage') {
          const usageDifference =
            (usageByName.get(right.name.toLowerCase())?.faceCount ?? 0) -
            (usageByName.get(left.name.toLowerCase())?.faceCount ?? 0);
          if (usageDifference !== 0) return usageDifference;
        }
        return left.name.localeCompare(right.name);
      });
    this.ui.materialCount.textContent = `${this.state.materialCatalog.size} loaded · ${usages.length} in use`;
    this.ui.materialCoverage.hidden = missingMaterials.length === 0;
    this.ui.materialCoverage.textContent =
      missingMaterials.length === 0
        ? ''
        : `Missing ${missingMaterials.length} of ${usages.length} map materials: ${missingMaterials.slice(0, 8).join(', ')}${missingMaterials.length > 8 ? `, +${missingMaterials.length - 8} more` : ''}. Load the matching WAD to render them.`;
    this.ui.materialGrid.replaceChildren();
    for (const material of materials) {
      const usage = usageByName.get(material.name.toLowerCase());
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'material-tile';
      button.classList.toggle(
        'active',
        material.name.toLowerCase() === this.state.activeMaterialName.toLowerCase(),
      );
      button.classList.toggle('in-use', Boolean(usage));
      button.title = usage
        ? `${material.name} · ${material.width}×${material.height} · ${usage.faceCount} ${usage.faceCount === 1 ? 'face' : 'faces'} in ${usage.brushCount} ${usage.brushCount === 1 ? 'brush' : 'brushes'} · ${material.sourceName}`
        : `${material.name} · ${material.width}×${material.height} · unused · ${material.sourceName}`;

      const canvas = document.createElement('canvas');
      canvas.width = material.width;
      canvas.height = material.height;
      const context = canvas.getContext('2d');
      context?.putImageData(
        new ImageData(new Uint8ClampedArray(material.rgba), material.width, material.height),
        0,
        0,
      );
      const label = document.createElement('span');
      label.textContent = material.name;
      button.append(canvas, label);
      button.addEventListener('click', () => {
        this.state.activeMaterialName = material.name;
        this.ui.materialName.value = material.name;
        this.ui.applyMaterialButton.disabled = !this.state.session.selection;
        this.renderMaterialCatalog();
      });
      button.addEventListener('dblclick', () => this.applySelectedMaterial());
      this.ui.materialGrid.append(button);
    }
    this.updateMaterialBrowserControls();
  }

  public updateReferenceScene(id: string, update: Partial<EditorReferenceScene>): void {
    this.state.referenceScenes = this.state.referenceScenes.map((reference) =>
      reference.id === id ? { ...reference, ...update } : reference,
    );
    this.state.renderer?.setReferenceScenes(this.state.referenceScenes);
    this.renderReferenceScenes();
  }

  public renderReferenceScenes(): void {
    this.ui.referenceCount.textContent = `${this.state.referenceScenes.length} loaded`;
    this.ui.clearReferencesButton.disabled = this.state.referenceScenes.length === 0;
    this.ui.referenceList.replaceChildren();
    for (const reference of this.state.referenceScenes) {
      const row = document.createElement('div');
      row.className = 'reference-row';
      const heading = document.createElement('div');
      heading.className = 'reference-row-heading';
      const visible = document.createElement('input');
      visible.type = 'checkbox';
      visible.checked = reference.visible;
      visible.title = 'Show reference';
      visible.addEventListener('change', () =>
        this.updateReferenceScene(reference.id, { visible: visible.checked }),
      );
      const label = document.createElement('span');
      label.textContent = reference.label;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        this.state.referenceScenes = this.state.referenceScenes.filter(
          (candidate) => candidate.id !== reference.id,
        );
        this.state.renderer?.setReferenceScenes(this.state.referenceScenes);
        this.renderReferenceScenes();
      });
      heading.append(visible, label, remove);

      const offsets = document.createElement('div');
      offsets.className = 'reference-offsets';
      for (const [axis, value] of reference.offset.entries()) {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '16';
        input.value = String(value);
        input.title = `${['X', 'Y', 'Z'][axis]} offset`;
        input.addEventListener('change', () => {
          const next = [...reference.offset] as [number, number, number];
          const parsed = Number(input.value);
          if (!Number.isFinite(parsed)) return;
          next[axis] = parsed;
          this.updateReferenceScene(reference.id, { offset: next });
        });
        offsets.append(input);
      }
      row.append(heading, offsets);
      this.ui.referenceList.append(row);
    }
  }

  public addReferenceDocument(label: string, document: MapDocument): void {
    this.state.referenceSequence += 1;
    this.state.referenceScenes = [
      ...this.state.referenceScenes,
      {
        id: `reference-${this.state.referenceSequence}`,
        label,
        document,
        offset: [this.state.referenceSequence * 384, 0, 0],
        visible: true,
      },
    ];
    this.state.renderer?.setReferenceScenes(this.state.referenceScenes);
    this.renderReferenceScenes();
    this.ui.statusMessage.textContent = `Loaded reference ${label}.`;
  }

  public applySelectedMaterial(): void {
    const name = this.ui.materialName.value.trim();
    if (!name || !this.state.session.selection) {
      this.ui.statusMessage.textContent = 'Select a face and choose or enter a material first.';
      return;
    }
    try {
      if (!this.state.session.applyMaterial(name)) {
        this.ui.statusMessage.textContent = `Face already uses ${name}.`;
      }
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public selectFacesUsingCurrentMaterial(): void {
    const material = this.selectedMaterialToken();
    if (!material) {
      this.ui.statusMessage.textContent = 'Choose or enter a material first.';
      return;
    }
    const selection = this.state.session.selectFacesUsingMaterial(material);
    const faceCount = selectedFaceReferences(selection).length;
    if (faceCount === 0) {
      this.ui.statusMessage.textContent = `No visible, editable faces use ${material}.`;
      return;
    }
    this.app.session.setEditorTool('face');
    this.ui.statusMessage.textContent = `Selected ${faceCount} ${faceCount === 1 ? 'face' : 'faces'} using ${material}.`;
  }

  public selectBrushesUsingCurrentMaterial(): void {
    const material = this.selectedMaterialToken();
    if (!material) {
      this.ui.statusMessage.textContent = 'Choose or enter a material first.';
      return;
    }
    const selection = this.state.session.selectBrushesUsingMaterial(material);
    const selectedBrushCount = selectedBrushIds(selection).length;
    if (selectedBrushCount === 0) {
      this.ui.statusMessage.textContent = `No visible, editable brushes use ${material}.`;
      return;
    }
    this.app.session.setEditorTool('select');
    this.ui.statusMessage.textContent = `Selected ${selectedBrushCount} ${selectedBrushCount === 1 ? 'brush' : 'brushes'} using ${material}.`;
  }

  public replaceSelectedMaterialUsage(): void {
    const sourceMaterial = this.ui.materialReplaceSource.value.trim();
    const targetMaterial = this.ui.materialReplaceTarget.value.trim();
    if (
      !sourceMaterial ||
      !targetMaterial ||
      sourceMaterial.toLowerCase() === targetMaterial.toLowerCase()
    ) {
      this.ui.statusMessage.textContent = 'Enter two different material names first.';
      return;
    }
    try {
      const changedFaceCount = this.state.session.replaceMaterial(sourceMaterial, targetMaterial);
      if (changedFaceCount === 0) {
        this.ui.statusMessage.textContent = `No ${sourceMaterial} faces match the current replacement scope.`;
        return;
      }
      this.state.activeMaterialName = targetMaterial;
      this.ui.materialName.value = targetMaterial;
      this.app.session.setEditorTool('face');
      this.renderMaterialCatalog();
      this.ui.statusMessage.textContent = `Replaced ${sourceMaterial} with ${targetMaterial} on ${changedFaceCount} ${changedFaceCount === 1 ? 'face' : 'faces'}. Undo restores the previous materials.`;
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }
}
