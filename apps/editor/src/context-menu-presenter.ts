import {
  BUILTIN_POINT_ENTITY_DEFINITIONS,
  createSequentialIdFactory,
  editorGroupForObject,
  findBrush,
  pointEntityDefinition,
  selectedBrushIds,
  selectedEditorGroup,
  selectedPointEntityIds,
  selectionForEditorGroup,
  type EditorSelection,
  type EditorViewportContextMenuEvent,
} from '@jackharrhy/worldview-editor';

import type { EditorElements } from './editor-elements.js';
import type { ObjectPastePlacement } from './editor-clipboard.js';
import type { EditorState } from './editor-state.js';
import type {
  ContextMenuActionSnapshot,
  ContextMenuSectionSnapshot,
} from './editor-shell-state.js';

type ContextMenuCommand = () => unknown;

export class ContextMenuPresenter {
  private readonly commands = new Map<string, ContextMenuCommand>();
  private readonly pendingFrames = new Set<number>();

  public constructor(
    private readonly state: EditorState,
    private readonly ui: EditorElements,
    private readonly formatVector: (value: readonly number[]) => string,
    private readonly renderMaterialCatalog: () => void,
    private readonly copySelection: (selection: EditorSelection) => Promise<void>,
    private readonly pasteFromClipboard: (
      placement: ObjectPastePlacement,
      targetFace?: EditorSelection | null,
    ) => Promise<void>,
    private readonly selectedLayerForPanel: () => ReturnType<
      import('./organization-presenter.js').OrganizationPresenter['selectedLayerForPanel']
    >,
  ) {}

  public focusCurrentSelection(): void {
    if (!this.state.renderer?.focusSelection()) {
      this.ui.statusMessage.textContent = 'Select an object or component to focus.';
      return;
    }
    this.ui.statusMessage.textContent = 'Framed the selection in every viewport.';
  }

  public focusContextViewport(context = this.state.viewportContext): void {
    if (!context) return;
    const canvas = this.ui.canvases[context.viewport];
    if (!(canvas instanceof HTMLCanvasElement)) return;
    this.requestFrame(() => canvas.focus({ preventScroll: true }));
  }

  private requestFrame(callback: () => void): void {
    const frame = window.requestAnimationFrame(() => {
      this.pendingFrames.delete(frame);
      callback();
    });
    this.pendingFrames.add(frame);
  }

  public hideViewportContextMenu(restoreFocus = false): void {
    if (!this.ui.viewportContextMenu.getSnapshot().open) return;
    this.ui.viewportContextMenu.hide();
    this.commands.clear();
    if (restoreFocus) this.focusContextViewport();
    this.state.viewportContext = null;
  }

  private contextMenuAction(
    id: string,
    label: string,
    action: ContextMenuCommand,
    disabled = false,
    shortcut?: string,
  ): ContextMenuActionSnapshot {
    this.commands.set(id, action);
    return {
      id,
      label,
      disabled,
      ...(shortcut === undefined ? {} : { shortcut }),
    };
  }

  private contextMenuSubmenu(
    id: string,
    label: string,
    actions: readonly ContextMenuActionSnapshot[],
    disabled = false,
  ): ContextMenuActionSnapshot {
    return { id, label, disabled, children: actions };
  }

  private async invoke(commandId: string): Promise<void> {
    const command = this.commands.get(commandId);
    if (!command) return;
    const context = this.state.viewportContext;
    this.ui.viewportContextMenu.hide();
    this.commands.clear();
    this.state.viewportContext = null;
    try {
      await command();
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.focusContextViewport(context);
    }
  }

  public selectContextObject(hit: EditorSelection): void {
    const objectSelection: EditorSelection | null = hit.brushId
      ? { brushId: hit.brushId }
      : hit.entityId
        ? { entityId: hit.entityId }
        : null;
    if (!objectSelection) return;
    const containingGroup = editorGroupForObject(
      this.state.session.document,
      objectSelection,
      this.state.openGroupId,
    );
    if (!containingGroup) {
      this.state.session.select(objectSelection);
      return;
    }
    this.state.session.select(
      selectionForEditorGroup(
        containingGroup,
        objectSelection.brushId
          ? { kind: 'brush', brushId: objectSelection.brushId }
          : objectSelection.entityId
            ? { kind: 'entity', entityId: objectSelection.entityId }
            : null,
      ),
    );
  }

  public createPointEntityFromContext(
    context: EditorViewportContextMenuEvent,
    classname: string,
  ): void {
    if (!context.pointEntityOrigin) throw new Error('No valid placement point under the cursor');
    const definition = pointEntityDefinition(classname, this.state.entityDefinitions);
    const origin = [...context.pointer.point] as [number, number, number];
    if (context.viewport === 'perspective') {
      const normal = context.pointer.surfaceNormal ?? ([0, 0, 1] as const);
      const axis = normal
        .map((component, index) => [Math.abs(component), index] as const)
        .toSorted((left, right) => right[0] - left[0])[0]![1] as 0 | 1 | 2;
      const relativeSide =
        normal[axis] >= 0 ? definition.bounds.min[axis] : definition.bounds.max[axis];
      origin[axis] =
        Math.round((context.pointer.point[axis] - relativeSide) / this.state.activeGridSize) *
        this.state.activeGridSize;
    }
    const ids = createSequentialIdFactory(
      `context-point-entity-${this.state.session.document.revision + 1}`,
    );
    this.state.session.createPointEntity(
      classname,
      origin,
      ids,
      this.state.openGroupId ? { _tb_group: this.state.openGroupId } : {},
    );
    this.ui.pointEntityPreset.value = classname;
    this.ui.pointEntityClassname.value = classname;
    this.state.renderer?.setEntityPlacementBounds(definition.bounds);
    this.ui.statusMessage.textContent = `Created ${classname} at ${this.formatVector(origin)}.`;
  }

  public createBrushEntityFromContext(classname: string): void {
    const ids = createSequentialIdFactory(
      `context-brush-entity-${this.state.session.document.revision + 1}`,
    );
    if (!this.state.session.createBrushEntity(classname, ids)) {
      this.ui.statusMessage.textContent =
        'Select one or more brushes before creating a brush entity.';
      return;
    }
    this.ui.brushEntityClassname.value = classname;
    this.ui.statusMessage.textContent = `Created ${classname} from the selected brushes.`;
  }

  public revealContextMaterial(material: string): void {
    this.state.activeMaterialName = material;
    this.ui.materialBrowser.update({ activeMaterial: material, filter: material });
    this.ui.inspectorLayout.setActive('textures');
    this.renderMaterialCatalog();
    this.requestFrame(() => {
      const tile = document.querySelector<HTMLElement>(
        `[data-material-name="${CSS.escape(material)}"]`,
      );
      (
        tile ?? document.querySelector<HTMLElement>('[data-inspector-panel="textures"]')
      )?.scrollIntoView({
        block: 'nearest',
      });
    });
    this.ui.statusMessage.textContent = this.state.materialCatalog.find(material)
      ? `Revealed ${material} in the material browser.`
      : `${material} is used by the map but is not loaded in the material catalog.`;
  }

  public showViewportContextMenu(context: EditorViewportContextMenuEvent): void {
    this.state.viewportContext = context;
    this.state.lastPointerPosition = context.pointer;
    this.ui.pasteButton.disabled = false;
    this.commands.clear();

    const hitActions: ContextMenuActionSnapshot[] = [];
    const hit = context.hit;
    if (hit?.brushId && hit.faceId) {
      const brush = findBrush(this.state.session.document, hit.brushId);
      const face = brush?.faces.find((candidate) => candidate.id === hit.faceId);
      hitActions.push(
        this.contextMenuAction('hit:select-object', 'Select object', () =>
          this.selectContextObject(hit),
        ),
        this.contextMenuAction('hit:select-face', 'Select face', () =>
          this.state.session.selectFace({
            brushId: hit.brushId!,
            faceId: hit.faceId!,
          }),
        ),
        this.contextMenuAction('hit:select-brush-faces', 'Select all brush faces', () =>
          this.state.session.selectBrushFaces(hit.brushId!, false, hit.faceId!),
        ),
        this.contextMenuAction('hit:select-coplanar', 'Select coplanar surface', () =>
          this.state.session.selectConnectedCoplanarFaces({
            brushId: hit.brushId!,
            faceId: hit.faceId!,
          }),
        ),
        this.contextMenuAction('hit:copy-face', 'Copy face attributes', () =>
          this.copySelection(hit),
        ),
        this.contextMenuAction('hit:paste-face', 'Paste face attributes here', () =>
          this.pasteFromClipboard('original', hit),
        ),
      );
      if (face) {
        hitActions.push(
          this.contextMenuAction('hit:reveal-material', `Reveal ${face.material}`, () =>
            this.revealContextMaterial(face.material),
          ),
        );
      }
    } else if (hit?.entityId) {
      hitActions.push(
        this.contextMenuAction('hit:select-entity', 'Select point entity', () =>
          this.selectContextObject(hit),
        ),
      );
    }

    const selectedBrushCount = selectedBrushIds(this.state.session.selection).length;
    const selectedEntityCount = selectedPointEntityIds(this.state.session.selection).length;
    const objectSelected =
      !this.state.session.selection?.faceId && selectedBrushCount + selectedEntityCount > 0;
    const selectedGroup = selectedEditorGroup(
      this.state.session.document,
      this.state.session.selection,
    );
    const selectionActions: ContextMenuActionSnapshot[] = [
      this.contextMenuAction(
        'selection:focus',
        'Focus selection',
        () => this.focusCurrentSelection(),
        !objectSelected,
        'Home',
      ),
      this.contextMenuAction(
        'selection:hide',
        'Hide selection',
        () => this.state.session.hideSelected(),
        !objectSelected,
      ),
      this.contextMenuAction(
        'selection:isolate',
        'Isolate selection',
        () => this.state.session.isolateSelected(),
        !objectSelected,
      ),
      this.contextMenuAction(
        'selection:group',
        selectedGroup ? `Ungroup ${selectedGroup.name}` : 'Group selection',
        () => {
          if (selectedGroup) this.state.session.ungroupSelected(selectedGroup.id);
          else {
            const ids = createSequentialIdFactory(
              `context-group-${this.state.session.document.revision + 1}`,
            );
            if (!this.state.session.groupSelected('Group', ids, this.state.openGroupId)) {
              throw new Error('Select one or more objects before grouping');
            }
          }
        },
        !objectSelected,
      ),
    ];
    const layer = this.selectedLayerForPanel();
    if (layer) {
      selectionActions.push(
        this.contextMenuAction(
          `selection:move-layer:${layer.id}`,
          `Move to ${layer.name}`,
          () => {
            if (!this.state.session.moveSelectedToLayer(layer.id)) {
              throw new Error(`The selection is already in ${layer.name}`);
            }
          },
          !objectSelected,
        ),
      );
    }
    if (selectedBrushCount > 0) {
      selectionActions.push(
        this.contextMenuSubmenu(
          'selection:create-brush-entity',
          'Create brush entity',
          ['func_detail', 'func_door', 'trigger_once'].map((classname) =>
            this.contextMenuAction(`selection:create-brush-entity:${classname}`, classname, () =>
              this.createBrushEntityFromContext(classname),
            ),
          ),
        ),
        this.contextMenuAction('selection:make-structural', 'Make structural', () => {
          if (!this.state.session.makeSelectedStructural())
            throw new Error('The selection is already structural');
        }),
      );
    }
    selectionActions.push(
      this.contextMenuAction(
        'selection:show-all',
        'Show all hidden',
        () => this.state.session.showAll(),
        !this.state.session.canShowAll,
      ),
    );

    const createActions = [
      this.contextMenuSubmenu(
        'create:point-entity',
        'Create point entity',
        BUILTIN_POINT_ENTITY_DEFINITIONS.map((definition) =>
          this.contextMenuAction(
            `create:point-entity:${definition.classname}`,
            definition.label,
            () => this.createPointEntityFromContext(context, definition.classname),
          ),
        ),
        !context.pointEntityOrigin,
      ),
      this.contextMenuAction(
        'create:paste',
        'Paste here',
        () => this.pasteFromClipboard('cursor'),
        this.ui.pasteButton.disabled,
      ),
    ];

    const sections: readonly ContextMenuSectionSnapshot[] = [
      {
        id: 'under-cursor',
        label: 'Under cursor',
        emptyMessage: 'No editable object',
        actions: hitActions,
      },
      { id: 'selection', label: 'Selection', actions: selectionActions },
      { id: 'create', label: 'Create here', actions: createActions },
    ];
    this.ui.viewportContextMenu.show({
      x: context.clientX,
      y: context.clientY,
      heading: `${context.viewport === 'perspective' ? '3D' : context.viewport.toUpperCase()} view`,
      detail: this.formatVector(context.pointer.point),
      sections,
    });
  }

  public connect(): void {
    this.ui.viewportContextMenu.bind({
      dismiss: (restoreFocus) => this.hideViewportContextMenu(restoreFocus),
      invoke: (commandId) => {
        void this.invoke(commandId);
      },
    });
  }

  public dispose(): void {
    for (const frame of this.pendingFrames) window.cancelAnimationFrame(frame);
    this.pendingFrames.clear();
    this.commands.clear();
    this.state.viewportContext = null;
    this.ui.viewportContextMenu.unbind();
  }
}
