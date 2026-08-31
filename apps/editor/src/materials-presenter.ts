import {
  findBrush,
  materialUsageInDocument,
  selectedBrushIds,
  selectedFaceReferences,
  type EditorReferenceScene,
  type EditorTool,
  type MapDocument,
} from '@jackharrhy/worldview-editor';

import type { EditorElements } from './editor-elements.js';
import type { EditorState } from './editor-state.js';

export class MaterialsPresenter {
  public constructor(
    private readonly state: EditorState,
    private readonly ui: EditorElements,
    private readonly setEditorTool: (tool: EditorTool) => void,
  ) {
    this.ui.materialBrowser.bind({
      setFilter: (filter) => {
        this.ui.materialBrowser.update({ filter });
        this.renderMaterialCatalog();
      },
      setSort: (sort) => {
        this.ui.materialBrowser.update({ sort });
        this.renderMaterialCatalog();
      },
      setUsedOnly: (usedOnly) => {
        this.ui.materialBrowser.update({ usedOnly });
        this.renderMaterialCatalog();
      },
      setSource: (source) => {
        this.ui.materialBrowser.update({ source });
        this.renderMaterialCatalog();
      },
      setActiveMaterial: (value) => this.setActiveMaterial(value),
      activateMaterial: (value) => this.activateMaterial(value),
      sampleSelection: () => this.sampleSelection(),
      applyActiveMaterial: () => this.applySelectedMaterial(),
      selectFaces: () => this.selectFacesUsingCurrentMaterial(),
      selectBrushes: () => this.selectBrushesUsingCurrentMaterial(),
      copyMaterialName: () => this.copyCurrentMaterialName(),
      setReplaceSource: (replaceSource) => this.ui.materialBrowser.update({ replaceSource }),
      setReplaceTarget: (replaceTarget) => this.ui.materialBrowser.update({ replaceTarget }),
      replace: () => this.replaceSelectedMaterialUsage(),
    });
  }

  public dispose(): void {
    this.ui.materialBrowser.unbind();
  }

  public selectedMaterialToken(): string {
    return this.ui.materialBrowser.getSnapshot().activeMaterial.trim();
  }

  public updateMaterialBrowserControls(): void {
    const selectedFaces = selectedFaceReferences(this.state.session.selection);
    if (selectedFaces.length > 0) {
      this.ui.materialBrowser.update({
        replaceScope: `${selectedFaces.length} selected ${selectedFaces.length === 1 ? 'face' : 'faces'}. Replacement selects changed faces.`,
      });
      return;
    }
    const selectedBrushes = selectedBrushIds(this.state.session.selection);
    if (selectedBrushes.length > 0) {
      this.ui.materialBrowser.update({
        replaceScope: `${selectedBrushes.length} selected ${selectedBrushes.length === 1 ? 'brush' : 'brushes'}. Replacement affects matching faces.`,
      });
      return;
    }
    this.ui.materialBrowser.update({
      replaceScope: this.state.session.selection
        ? 'Selection has no brush faces to replace.'
        : 'No selection. Replacement affects the whole map and selects changed faces.',
    });
  }

  public renderMaterialCatalog(): void {
    const started = performance.now();
    const finish = () =>
      performance.measure('worldview.editor.material-catalog', {
        start: started,
        end: performance.now(),
      });
    const snapshot = this.ui.materialBrowser.getSnapshot();
    const queryTokens = snapshot.filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const usages = materialUsageInDocument(this.state.session.document);
    const usageByName = new Map(usages.map((usage) => [usage.material.toLowerCase(), usage]));
    const catalogMaterials = this.state.materialCatalog.materials();
    const loadedNames = new Set(catalogMaterials.map((material) => material.name.toLowerCase()));
    const missingMaterials: string[] = [];
    for (const usage of usages) {
      if (!loadedNames.has(usage.material.toLowerCase())) missingMaterials.push(usage.material);
    }
    missingMaterials.sort((left, right) => left.localeCompare(right));
    const sources = [
      ...new Set(
        catalogMaterials.flatMap((material) => (material.sourceName ? [material.sourceName] : [])),
      ),
    ].toSorted((left, right) => left.localeCompare(right));
    const activeSource =
      snapshot.source === 'all' || sources.includes(snapshot.source) ? snapshot.source : 'all';
    const materials = catalogMaterials.filter((material) => {
      const normalizedName = material.name.toLowerCase();
      return (
        queryTokens.every((token) => normalizedName.includes(token)) &&
        (!snapshot.usedOnly || usageByName.has(normalizedName)) &&
        (activeSource === 'all' || material.sourceName === activeSource)
      );
    });
    materials.sort((left, right) => {
      if (snapshot.sort === 'usage') {
        const usageDifference =
          (usageByName.get(right.name.toLowerCase())?.faceCount ?? 0) -
          (usageByName.get(left.name.toLowerCase())?.faceCount ?? 0);
        if (usageDifference !== 0) return usageDifference;
      }
      return left.name.localeCompare(right.name);
    });
    const coverageMessage =
      missingMaterials.length === 0
        ? ''
        : `Missing ${missingMaterials.length} of ${usages.length} map materials: ${missingMaterials.slice(0, 8).join(', ')}${missingMaterials.length > 8 ? `, +${missingMaterials.length - 8} more` : ''}. Add the matching source in Map resources.`;
    this.ui.materialBrowser.set({
      ...snapshot,
      loadedCount: this.state.materialCatalog.size,
      usedCount: usages.length,
      activeMaterial: this.state.activeMaterialName,
      source: activeSource,
      sources,
      coverageMessage,
      cells: materials.map((material) => {
        const usage = usageByName.get(material.name.toLowerCase());
        return {
          material,
          active: material.name.toLowerCase() === this.state.activeMaterialName.toLowerCase(),
          inUse: Boolean(usage),
          faceCount: usage?.faceCount ?? 0,
          brushCount: usage?.brushCount ?? 0,
        };
      }),
    });
    this.updateMaterialBrowserControls();
    finish();
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

  public setActiveMaterial(name: string): void {
    this.state.activeMaterialName = name.trim();
    this.ui.materialBrowser.update({ activeMaterial: this.state.activeMaterialName });
    this.renderMaterialCatalog();
  }

  public activateMaterial(name: string): void {
    this.state.activeMaterialName = name;
    this.ui.materialBrowser.update({ activeMaterial: name });
    if (this.state.session.selection) this.applySelectedMaterial();
    else this.renderMaterialCatalog();
  }

  public sampleSelection(): void {
    const selection = this.state.session.selection;
    const brush = selection?.brushId
      ? findBrush(this.state.session.document, selection.brushId)
      : null;
    const face =
      brush && selection?.faceId
        ? brush.faces.find((candidate) => candidate.id === selection.faceId)
        : undefined;
    if (!face) {
      this.ui.statusMessage.textContent = 'Select a face before sampling its material.';
      return;
    }
    this.setActiveMaterial(face.material);
    this.ui.statusMessage.textContent = `Sampled ${face.material}.`;
  }

  public copyCurrentMaterialName(): void {
    const material = this.selectedMaterialToken();
    if (!material) {
      this.ui.statusMessage.textContent = 'Choose or enter a material first.';
      return;
    }
    void navigator.clipboard.writeText(material).then(
      () => {
        this.ui.statusMessage.textContent = `Copied material name ${material}.`;
      },
      (error: unknown) => {
        this.ui.statusMessage.setError(
          `Could not copy the material name: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );
  }

  public applySelectedMaterial(): void {
    const name = this.selectedMaterialToken();
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
    this.setEditorTool('face');
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
    this.setEditorTool('select');
    this.ui.statusMessage.textContent = `Selected ${selectedBrushCount} ${selectedBrushCount === 1 ? 'brush' : 'brushes'} using ${material}.`;
  }

  public replaceSelectedMaterialUsage(): void {
    const browser = this.ui.materialBrowser.getSnapshot();
    const sourceMaterial = browser.replaceSource.trim();
    const targetMaterial = browser.replaceTarget.trim();
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
      this.ui.materialBrowser.update({ activeMaterial: targetMaterial });
      this.setEditorTool('face');
      this.renderMaterialCatalog();
      this.ui.statusMessage.textContent = `Replaced ${sourceMaterial} with ${targetMaterial} on ${changedFaceCount} ${changedFaceCount === 1 ? 'face' : 'faces'}. Undo restores the previous materials.`;
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }
}
