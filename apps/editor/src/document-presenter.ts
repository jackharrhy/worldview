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
import type { EditorShellState, WorkspaceResizeKind } from './editor-shell-state.js';
import type { ObjectPastePlacement } from './editor-clipboard.js';
import type { CompileAssetEntry } from './editor-application-contracts.js';
import type { EditorStatePort } from './editor-state-port.js';
import type { ViewportWorkspaceLayout } from './viewport-workspace-contracts.js';

type DocumentUi = Pick<
  EditorShellState,
  'documentName' | 'inspectorLayout' | 'projectUi' | 'statusMessage' | 'workspaceLayout'
>;

function isWorkspaceResizeKind(value: string | undefined): value is WorkspaceResizeKind {
  return (
    value === 'viewport-column' ||
    value === 'viewport-top' ||
    value === 'viewport-cross' ||
    value === 'inspector'
  );
}

type DocumentState = EditorStatePort<
  | 'activeGridSize'
  | 'activeTool'
  | 'builtInMaterials'
  | 'currentDocumentName'
  | 'currentMapSource'
  | 'diagnosticQuakePalette'
  | 'documentDirty'
  | 'duplicateSequence'
  | 'editorClipboard'
  | 'lastPointerPosition'
  | 'loadedWadSources'
  | 'openGroupId'
  | 'session'
  | 'textureLock',
  'currentDocumentName' | 'documentDirty' | 'duplicateSequence'
>;

export class DocumentPresenter {
  private viewportColumn = 0.5;
  private viewportTop = 0.5;
  private inspectorWidth = 320;

  public constructor(
    private readonly state: DocumentState,
    private readonly ui: DocumentUi,
    private readonly elements: Pick<
      EditorElements,
      'viewportGrid' | 'workspace' | 'workspaceResizeHandles'
    >,
    private readonly setEditorTool: (tool: EditorTool) => void,
    private readonly onWorkspaceLayoutChange: (layout: ViewportWorkspaceLayout) => void,
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
    if (!force && !this.ui.projectUi.getSnapshot().source.open) return;
    const plan = planMapSave(this.state.session.document, this.state.currentMapSource);
    this.ui.projectUi.updateSource({
      value: plan.status === 'safe' ? plan.text : plan.normalizedText,
      message:
        plan.status === 'safe'
          ? 'Source preview preserves the opened map structure.'
          : plan.diagnostics.map(({ message }) => message).join(' '),
      tone: plan.status === 'blocked' ? 'error' : 'normal',
    });
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
    this.ui.inspectorLayout.setOpen(open);
  }

  public connectWorkspaceResizers(signal: AbortSignal): void {
    this.applyWorkspaceLayout();
    for (const handle of this.elements.workspaceResizeHandles) {
      handle.addEventListener('pointerdown', (event) => this.beginWorkspaceResize(event, handle), {
        signal,
      });
      handle.addEventListener(
        'keydown',
        (event) => this.resizeWorkspaceWithKeyboard(event, handle),
        { signal },
      );
    }
  }

  public restoreWorkspaceLayout(layout: ViewportWorkspaceLayout): void {
    const workspaceWidth = this.elements.workspace.getBoundingClientRect().width;
    const maximumInspectorWidth = Math.max(240, Math.min(520, workspaceWidth * 0.48));
    this.viewportColumn = Math.max(0.3, Math.min(0.76, layout.viewportColumn));
    this.viewportTop = Math.max(0.2, Math.min(0.8, layout.viewportTop));
    this.inspectorWidth = Math.round(
      Math.max(240, Math.min(maximumInspectorWidth, layout.inspectorWidth)),
    );
    this.applyWorkspaceLayout();
  }

  private applyWorkspaceLayout(): void {
    this.ui.workspaceLayout.update({
      viewportColumn: this.viewportColumn,
      viewportTop: this.viewportTop,
      inspectorWidth: this.inspectorWidth,
    });
    this.onWorkspaceLayoutChange({
      viewportColumn: this.viewportColumn,
      viewportTop: this.viewportTop,
      inspectorWidth: this.inspectorWidth,
    });
  }

  private beginWorkspaceResize(event: PointerEvent, handle: HTMLElement): void {
    if (event.button !== 0) return;
    const kind = handle.dataset.resize;
    if (!isWorkspaceResizeKind(kind)) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    this.ui.workspaceLayout.update({ dragging: kind });
    const move = (moveEvent: PointerEvent) => {
      this.resizeWorkspaceAt(kind, moveEvent.clientX, moveEvent.clientY);
    };
    const finish = () => {
      this.ui.workspaceLayout.update({ dragging: null });
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
      const bounds = this.elements.workspace.getBoundingClientRect();
      this.inspectorWidth = Math.round(
        Math.max(240, Math.min(Math.min(520, bounds.width * 0.48), bounds.right - clientX)),
      );
    } else {
      const bounds = this.elements.viewportGrid.getBoundingClientRect();
      if (kind === 'viewport-column' || kind === 'viewport-cross')
        this.viewportColumn = Math.max(0.3, Math.min(0.76, (clientX - bounds.left) / bounds.width));
      if (kind === 'viewport-top' || kind === 'viewport-cross')
        this.viewportTop = Math.max(0.2, Math.min(0.8, (clientY - bounds.top) / bounds.height));
    }
    this.applyWorkspaceLayout();
  }

  private resizeWorkspaceWithKeyboard(event: KeyboardEvent, handle: HTMLElement): void {
    const kind = handle.dataset.resize;
    if (kind === 'viewport-cross') {
      const columnDirection = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const rowDirection = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      if (!columnDirection && !rowDirection) return;
      event.preventDefault();
      this.viewportColumn = Math.max(
        0.3,
        Math.min(0.76, this.viewportColumn + columnDirection * 0.02),
      );
      this.viewportTop = Math.max(0.2, Math.min(0.8, this.viewportTop + rowDirection * 0.02));
      this.applyWorkspaceLayout();
      return;
    }
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
        this.state.textureLock,
        this.state.openGroupId,
      );
      if (!duplicated) this.ui.statusMessage.set('Select a brush before duplicating.');
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  public repeatRecordedCommands(): void {
    try {
      if (!this.state.session.repeatLastCommands()) {
        this.ui.statusMessage.set('Record object commands before repeating them.');
      }
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
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
      this.ui.statusMessage.set('Select a brush before deleting.');
  }

  public selectAllEditableObjects(): void {
    if (this.state.activeTool !== 'select') this.setEditorTool('select');
    const selection = this.state.session.selectAllEditable();
    const count = selectedBrushIds(selection).length + selectedPointEntityIds(selection).length;
    this.ui.statusMessage.set(
      count > 0
        ? `Selected all ${count} visible, unlocked ${count === 1 ? 'object' : 'objects'}.`
        : 'There are no editable objects to select.',
    );
  }

  public invertEditableObjectSelection(): void {
    if (this.state.activeTool !== 'select') this.setEditorTool('select');
    const selection = this.state.session.invertObjectSelection();
    const count = selectedBrushIds(selection).length + selectedPointEntityIds(selection).length;
    this.ui.statusMessage.set(
      count > 0
        ? `Inverted the selection to ${count} ${count === 1 ? 'object' : 'objects'}.`
        : 'Inverting the selection cleared it.',
    );
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
        this.ui.statusMessage.set('Select one or more ordinary structural brushes first.');
        return;
      }
      const selected = result.selectedBrushCount + result.selectedEntityCount;
      const relationship =
        mode === 'touching'
          ? 'touching'
          : mode === 'inside'
            ? 'enclosed'
            : `${projection} enclosed`;
      this.ui.statusMessage.set(
        `Consumed ${result.removedBrushCount} selection ${result.removedBrushCount === 1 ? 'brush' : 'brushes'} and selected ${selected} ${relationship} ${selected === 1 ? 'object' : 'objects'}.`,
      );
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  public openGroupEntityId(
    document: MapDocument = this.state.session.document,
  ): MapDocument['entities'][number]['id'] | undefined {
    return deriveEditorGroups(document).find((group) => group.id === this.state.openGroupId)
      ?.entityId;
  }
}
