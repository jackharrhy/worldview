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
  type EditorTool,
  type MapDocument,
  type SelectionBrushQueryMode,
} from '@jackharrhy/worldview-editor';

import type { EditorElements } from './editor-elements.js';
import type { ObjectPastePlacement } from './editor-clipboard.js';
import type { EditorState } from './editor-state.js';

interface CompileAssetEntry {
  readonly name: string;
  readonly data: ArrayBuffer;
}

export class DocumentPresenter {
  private viewportColumn = 0.5;
  private viewportTop = 0.5;
  private inspectorWidth = 288;

  public constructor(
    private readonly state: EditorState,
    private readonly ui: EditorElements,
    private readonly setEditorTool: (tool: EditorTool) => void,
  ) {}

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
    this.ui.documentName.set(
      `${this.state.documentDirty ? '• ' : ''}${this.state.currentDocumentName}`,
      this.state.currentDocumentName,
    );
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

  public connectWorkspaceResizers(): void {
    this.applyWorkspaceLayout();
    for (const handle of this.ui.workspaceResizeHandles) {
      handle.addEventListener('pointerdown', (event) => this.beginWorkspaceResize(event, handle));
      handle.addEventListener('keydown', (event) =>
        this.resizeWorkspaceWithKeyboard(event, handle),
      );
    }
  }

  private applyWorkspaceLayout(): void {
    this.ui.viewportGrid.style.setProperty('--viewport-column', `${this.viewportColumn * 100}%`);
    this.ui.viewportGrid.style.setProperty('--viewport-top', `${this.viewportTop * 100}%`);
    this.ui.workspace.style.setProperty('--inspector-width', `${this.inspectorWidth}px`);
    for (const handle of this.ui.workspaceResizeHandles) {
      const kind = handle.dataset.resize;
      const value =
        kind === 'viewport-column'
          ? Math.round(this.viewportColumn * 100)
          : kind === 'viewport-top'
            ? Math.round(this.viewportTop * 100)
            : this.inspectorWidth;
      handle.setAttribute('aria-valuenow', String(value));
    }
  }

  private beginWorkspaceResize(event: PointerEvent, handle: HTMLElement): void {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('dragging');
    const move = (moveEvent: PointerEvent) => {
      this.resizeWorkspaceAt(handle.dataset.resize, moveEvent.clientX, moveEvent.clientY);
    };
    const finish = () => {
      handle.classList.remove('dragging');
      handle.blur();
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  private resizeWorkspaceAt(kind: string | undefined, clientX: number, clientY: number): void {
    if (kind === 'inspector') {
      const bounds = this.ui.workspace.getBoundingClientRect();
      this.inspectorWidth = Math.round(
        Math.max(240, Math.min(Math.min(520, bounds.width * 0.48), bounds.right - clientX)),
      );
    } else {
      const bounds = this.ui.viewportGrid.getBoundingClientRect();
      if (kind === 'viewport-column')
        this.viewportColumn = Math.max(0.3, Math.min(0.76, (clientX - bounds.left) / bounds.width));
      if (kind === 'viewport-top')
        this.viewportTop = Math.max(0.2, Math.min(0.8, (clientY - bounds.top) / bounds.height));
    }
    this.applyWorkspaceLayout();
  }

  private resizeWorkspaceWithKeyboard(event: KeyboardEvent, handle: HTMLElement): void {
    const kind = handle.dataset.resize;
    const direction =
      event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : 0;
    if (!direction) return;
    event.preventDefault();
    if (kind === 'inspector')
      this.inspectorWidth = Math.max(240, Math.min(520, this.inspectorWidth - direction * 16));
    if (kind === 'viewport-column')
      this.viewportColumn = Math.max(0.3, Math.min(0.76, this.viewportColumn + direction * 0.02));
    if (kind === 'viewport-top')
      this.viewportTop = Math.max(0.2, Math.min(0.8, this.viewportTop + direction * 0.02));
    this.applyWorkspaceLayout();
  }

  public duplicateSelection(): void {
    try {
      this.state.duplicateSequence += 1;
      const duplicated = this.state.session.duplicateSelected(
        createSequentialIdFactory(`duplicate-${this.state.duplicateSequence}`),
        [this.state.activeGridSize, this.state.activeGridSize, 0],
        this.ui.textureLock.checked,
        this.state.openGroupId,
      );
      if (!duplicated) this.ui.statusMessage.textContent = 'Select a brush before duplicating.';
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
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
    placement: ObjectPastePlacement,
    targetFace: EditorSelection | null = null,
  ): boolean {
    return this.state.editorClipboard.pasteText(text, placement, targetFace);
  }

  public pasteFromClipboard(
    placement: ObjectPastePlacement,
    targetFace: EditorSelection | null = null,
  ): Promise<void> {
    return this.state.editorClipboard.paste(placement, targetFace);
  }

  public deleteSelection(): void {
    if (!this.state.session.deleteSelected())
      this.ui.statusMessage.textContent = 'Select a brush before deleting.';
  }

  public selectAllEditableObjects(): void {
    if (this.state.activeTool !== 'select') this.setEditorTool('select');
    const selection = this.state.session.selectAllEditable();
    const count = selectedBrushIds(selection).length + selectedPointEntityIds(selection).length;
    this.ui.statusMessage.textContent =
      count > 0
        ? `Selected all ${count} visible, unlocked ${count === 1 ? 'object' : 'objects'}.`
        : 'There are no editable objects to select.';
  }

  public invertEditableObjectSelection(): void {
    if (this.state.activeTool !== 'select') this.setEditorTool('select');
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
      if (this.state.activeTool !== 'select') this.setEditorTool('select');
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
