import {
  createSequentialIdFactory,
  deriveEditorGroups,
  documentWithoutOmittedLayers,
  encodeQuakeWad2,
  planMapSave,
  selectedBrushIds,
  selectedPointEntityIds,
  serializeMap,
  type EditorSelection,
  type MapDocument,
  type SelectionBrushQueryMode,
} from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';

interface CompileAssetEntry {
  readonly name: string;
  readonly data: ArrayBuffer;
}

export class DocumentPresenter {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
  }

  public compileAssetName(name: string, index: number): string {
    const stem = name
      .replace(/\.wad$/i, '')
      .replace(/[^A-Za-z0-9_.-]/g, '_')
      .slice(0, 112);
    return `${stem || `textures_${index}`}.wad`;
  }

  public compileAssets(): readonly CompileAssetEntry[] {
    const assets: CompileAssetEntry[] = [
      {
        name: 'worldview_dev.wad',
        data: encodeQuakeWad2(this.state.builtInMaterials, this.state.diagnosticQuakePalette),
      },
    ];
    let index = 0;
    for (const [name, data] of this.state.loadedWadSources) {
      let safeName = this.compileAssetName(name, index++);
      while (assets.some((asset) => asset.name.toLowerCase() === safeName.toLowerCase())) {
        safeName = this.compileAssetName(`${index}_${name}`, index++);
      }
      assets.push({ name: safeName, data });
    }
    return assets;
  }

  public serializeCompileDocument(assets: readonly CompileAssetEntry[]): string {
    const document = documentWithoutOmittedLayers(this.state.session.document);
    const worldspawn = document.entities.find(
      (entity) => entity.properties.classname?.toLowerCase() === 'worldspawn',
    );
    if (!worldspawn) throw new Error('The map document has no worldspawn entity');
    const compileWorldspawn = {
      ...worldspawn,
      properties: {
        ...worldspawn.properties,
        wad: assets.map((asset) => asset.name).join(';'),
      },
    };
    return serializeMap({
      ...document,
      entities: document.entities.map((entity) =>
        entity.id === worldspawn.id ? compileWorldspawn : entity,
      ),
    });
  }

  public updateSourceFromDocument(force = false): void {
    if (!force && !this.ui.sourceDialog.open) return;
    const plan = planMapSave(this.state.session.document, this.state.currentMapSource);
    this.ui.source.value = plan.status === 'safe' ? plan.text : plan.normalizedText;
    this.ui.sourceMessage.textContent =
      plan.status === 'safe'
        ? 'Source preview preserves the opened map structure.'
        : plan.diagnostics.map(({ message }) => message).join(' ');
    this.ui.sourceMessage.classList.toggle('error-text', plan.status === 'blocked');
  }

  public setDocumentName(name: string): void {
    this.state.currentDocumentName = name.toLowerCase().endsWith('.map') ? name : `${name}.map`;
    this.ui.documentName.textContent = `${this.state.documentDirty ? '• ' : ''}${this.state.currentDocumentName}`;
    this.ui.documentName.title = this.state.currentDocumentName;
  }

  public setDocumentDirty(dirty: boolean): void {
    this.state.documentDirty = dirty;
    this.setDocumentName(this.state.currentDocumentName);
  }

  public setInspectorOpen(open: boolean): void {
    this.ui.inspector.classList.toggle('closed', !open);
    this.ui.inspector.parentElement?.classList.toggle('inspector-closed', !open);
    this.ui.inspectorToggle.setAttribute('aria-pressed', String(open));
  }

  public duplicateSelection(): void {
    this.state.duplicateSequence += 1;
    const duplicated = this.state.session.duplicateSelected(
      createSequentialIdFactory(`duplicate-${this.state.duplicateSequence}`),
      [this.state.activeGridSize, this.state.activeGridSize, 0],
      this.ui.textureLock.checked,
      this.state.openGroupId,
    );
    if (!duplicated) this.ui.statusMessage.textContent = 'Select a brush before duplicating.';
  }

  public repeatRecordedCommands(): void {
    try {
      if (!this.state.session.repeatLastCommands()) {
        this.ui.statusMessage.textContent = 'Record object commands before repeating them.';
      }
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public isTextEditingTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    );
  }

  public copySelectionText(
    selection: EditorSelection | null = this.state.session.selection,
  ): string | null {
    return this.state.editorClipboard.selectionText(selection);
  }

  public copySelection(
    selection: EditorSelection | null = this.state.session.selection,
  ): Promise<void> {
    return this.state.editorClipboard.copy(selection);
  }

  public pasteClipboardText(
    text: string,
    atPointer: boolean,
    targetFace: EditorSelection | null = null,
  ): boolean {
    return this.state.editorClipboard.pasteText(text, atPointer, targetFace);
  }

  public pasteFromClipboard(
    atPointer: boolean,
    targetFace: EditorSelection | null = null,
  ): Promise<void> {
    return this.state.editorClipboard.paste(atPointer, targetFace);
  }

  public deleteSelection(): void {
    if (!this.state.session.deleteSelected())
      this.ui.statusMessage.textContent = 'Select a brush before deleting.';
  }

  public selectAllEditableObjects(): void {
    if (this.state.activeTool !== 'select') this.app.session.setEditorTool('select');
    const selection = this.state.session.selectAllEditable();
    const count = selectedBrushIds(selection).length + selectedPointEntityIds(selection).length;
    this.ui.statusMessage.textContent =
      count > 0
        ? `Selected all ${count} visible, unlocked ${count === 1 ? 'object' : 'objects'}.`
        : 'There are no editable objects to select.';
  }

  public invertEditableObjectSelection(): void {
    if (this.state.activeTool !== 'select') this.app.session.setEditorTool('select');
    const selection = this.state.session.invertObjectSelection();
    const count = selectedBrushIds(selection).length + selectedPointEntityIds(selection).length;
    this.ui.statusMessage.textContent =
      count > 0
        ? `Inverted the selection to ${count} ${count === 1 ? 'object' : 'objects'}.`
        : 'Inverting the selection cleared it.';
  }

  public applySelectionBrushQuery(mode: SelectionBrushQueryMode): void {
    try {
      const viewport = this.state.lastPointerPosition?.viewport;
      const projection =
        mode === 'inside-projected' && (viewport === 'xy' || viewport === 'xz' || viewport === 'yz')
          ? viewport
          : undefined;
      if (mode === 'inside-projected' && !projection) {
        throw new Error('Point at an XY, XZ, or YZ viewport before using Enclosed in 2D');
      }
      if (this.state.activeTool !== 'select') this.app.session.setEditorTool('select');
      const result = this.state.session.selectWithSelectionBrushes(mode, projection);
      if (!result) {
        this.ui.statusMessage.textContent = 'Select one or more ordinary structural brushes first.';
        return;
      }
      const selected = result.selectedBrushCount + result.selectedEntityCount;
      const relationship =
        mode === 'touching'
          ? 'touching'
          : mode === 'inside'
            ? 'enclosed'
            : `${projection} enclosed`;
      this.ui.statusMessage.textContent = `Consumed ${result.removedBrushCount} selection ${result.removedBrushCount === 1 ? 'brush' : 'brushes'} and selected ${selected} ${relationship} ${selected === 1 ? 'object' : 'objects'}.`;
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public openGroupEntityId(
    document: MapDocument = this.state.session.document,
  ): MapDocument['entities'][number]['id'] | undefined {
    return deriveEditorGroups(document).find((group) => group.id === this.state.openGroupId)
      ?.entityId;
  }
}
