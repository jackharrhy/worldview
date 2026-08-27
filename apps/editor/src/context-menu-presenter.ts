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

import { required, type EditorElements } from './editor-elements.js';
import type { EditorState } from './editor-state.js';

export class ContextMenuPresenter {
  public constructor(
    private readonly state: EditorState,
    private readonly ui: EditorElements,
    private readonly formatVector: (value: readonly number[]) => string,
    private readonly renderMaterialCatalog: () => void,
    private readonly copySelection: (selection: EditorSelection) => Promise<void>,
    private readonly pasteFromClipboard: (
      atPointer: boolean,
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
    if (canvas instanceof HTMLCanvasElement) canvas.focus({ preventScroll: true });
  }

  public hideViewportContextMenu(restoreFocus = false): void {
    if (this.ui.viewportContextMenu.hidden) return;
    this.ui.viewportContextMenu.hidden = true;
    this.ui.viewportContextMenu.replaceChildren();
    if (restoreFocus) this.focusContextViewport();
    this.state.viewportContext = null;
  }

  public contextMenuHeading(text: string, detail?: string): HTMLElement {
    const heading = document.createElement('div');
    heading.className = 'viewport-context-heading';
    const label = document.createElement('strong');
    label.textContent = text;
    heading.append(label);
    if (detail) {
      const description = document.createElement('span');
      description.textContent = detail;
      heading.append(description);
    }
    return heading;
  }

  public contextMenuSection(label: string): HTMLElement {
    const section = document.createElement('section');
    section.className = 'viewport-context-section';
    const heading = document.createElement('h3');
    heading.textContent = label;
    section.append(heading);
    return section;
  }

  public contextMenuAction(
    container: HTMLElement,
    label: string,
    action: () => void,
    disabled = false,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'menuitem';
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', () => {
      const context = this.state.viewportContext;
      this.hideViewportContextMenu();
      try {
        action();
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
      this.focusContextViewport(context);
    });
    container.append(button);
    return button;
  }

  public contextMenuSubmenu(
    container: HTMLElement,
    label: string,
    actions: readonly { readonly label: string; readonly action: () => void }[],
    disabled = false,
  ): void {
    const details = document.createElement('details');
    details.className = 'viewport-context-submenu';
    const summary = document.createElement('summary');
    summary.textContent = label;
    summary.ariaDisabled = String(disabled);
    if (disabled) summary.tabIndex = -1;
    const items = document.createElement('div');
    items.className = 'viewport-context-submenu-items';
    for (const action of actions) {
      this.contextMenuAction(items, action.label, action.action, disabled);
    }
    details.addEventListener('toggle', () => {
      if (disabled && details.open) details.open = false;
    });
    details.append(summary, items);
    container.append(details);
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
    this.ui.materialName.value = material;
    this.ui.materialFilter.value = material;
    required<HTMLButtonElement>('[data-inspector-tab="textures"]').click();
    this.renderMaterialCatalog();
    window.requestAnimationFrame(() => {
      const tile = [
        ...this.ui.materialGrid.querySelectorAll<HTMLButtonElement>('.material-tile'),
      ].find((button) => button.textContent?.trim().toLowerCase() === material.toLowerCase());
      (tile ?? required<HTMLElement>('.material-section')).scrollIntoView({ block: 'nearest' });
    });
    this.ui.statusMessage.textContent = this.state.materialCatalog.find(material)
      ? `Revealed ${material} in the material browser.`
      : `${material} is used by the map but is not loaded in the material catalog.`;
  }

  public showViewportContextMenu(context: EditorViewportContextMenuEvent): void {
    this.state.viewportContext = context;
    this.state.lastPointerPosition = context.pointer;
    this.ui.pasteHereButton.disabled = false;
    this.ui.viewportContextMenu.replaceChildren();
    this.ui.viewportContextMenu.append(
      this.contextMenuHeading(
        `${context.viewport === 'perspective' ? '3D' : context.viewport.toUpperCase()} view`,
        this.formatVector(context.pointer.point),
      ),
    );

    const hitSection = this.contextMenuSection('Under cursor');
    const hit = context.hit;
    if (hit?.brushId && hit.faceId) {
      const brush = findBrush(this.state.session.document, hit.brushId);
      const face = brush?.faces.find((candidate) => candidate.id === hit.faceId);
      this.contextMenuAction(hitSection, 'Select object', () => this.selectContextObject(hit));
      this.contextMenuAction(hitSection, 'Select face', () =>
        this.state.session.selectFace({ brushId: hit.brushId!, faceId: hit.faceId! }),
      );
      this.contextMenuAction(hitSection, 'Select all brush faces', () =>
        this.state.session.selectBrushFaces(hit.brushId!, false, hit.faceId!),
      );
      this.contextMenuAction(hitSection, 'Select coplanar surface', () =>
        this.state.session.selectConnectedCoplanarFaces({
          brushId: hit.brushId!,
          faceId: hit.faceId!,
        }),
      );
      this.contextMenuAction(
        hitSection,
        'Copy face attributes',
        () => void this.copySelection(hit),
      );
      this.contextMenuAction(
        hitSection,
        'Paste face attributes here',
        () => void this.pasteFromClipboard(false, hit),
      );
      if (face) {
        this.contextMenuAction(hitSection, `Reveal ${face.material}`, () =>
          this.revealContextMaterial(face.material),
        );
      }
    } else if (hit?.entityId) {
      this.contextMenuAction(hitSection, 'Select point entity', () =>
        this.selectContextObject(hit),
      );
    } else {
      const empty = document.createElement('p');
      empty.textContent = 'No editable object';
      hitSection.append(empty);
    }
    this.ui.viewportContextMenu.append(hitSection);

    const selectedBrushCount = selectedBrushIds(this.state.session.selection).length;
    const selectedEntityCount = selectedPointEntityIds(this.state.session.selection).length;
    const objectSelected =
      !this.state.session.selection?.faceId && selectedBrushCount + selectedEntityCount > 0;
    const selectedGroup = selectedEditorGroup(
      this.state.session.document,
      this.state.session.selection,
    );
    const selectionSection = this.contextMenuSection('Selection');
    this.contextMenuAction(
      selectionSection,
      'Focus selection',
      this.focusCurrentSelection,
      !objectSelected,
    );
    this.contextMenuAction(
      selectionSection,
      'Hide selection',
      () => this.state.session.hideSelected(),
      !objectSelected,
    );
    this.contextMenuAction(
      selectionSection,
      'Isolate selection',
      () => this.state.session.isolateSelected(),
      !objectSelected,
    );
    this.contextMenuAction(
      selectionSection,
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
    );
    const layer = this.selectedLayerForPanel();
    if (layer) {
      this.contextMenuAction(
        selectionSection,
        `Move to ${layer.name}`,
        () => {
          if (!this.state.session.moveSelectedToLayer(layer.id)) {
            throw new Error(`The selection is already in ${layer.name}`);
          }
        },
        !objectSelected,
      );
    }
    if (selectedBrushCount > 0) {
      this.contextMenuSubmenu(
        selectionSection,
        'Create brush entity',
        ['func_detail', 'func_door', 'trigger_once'].map((classname) => ({
          label: classname,
          action: () => this.createBrushEntityFromContext(classname),
        })),
      );
      this.contextMenuAction(selectionSection, 'Make structural', () => {
        if (!this.state.session.makeSelectedStructural())
          throw new Error('The selection is already structural');
      });
    }
    this.contextMenuAction(
      selectionSection,
      'Show all hidden',
      () => this.state.session.showAll(),
      !this.state.session.canShowAll,
    );
    this.ui.viewportContextMenu.append(selectionSection);

    const createSection = this.contextMenuSection('Create here');
    this.contextMenuSubmenu(
      createSection,
      'Create point entity',
      BUILTIN_POINT_ENTITY_DEFINITIONS.map((definition) => ({
        label: definition.label,
        action: () => this.createPointEntityFromContext(context, definition.classname),
      })),
      !context.pointEntityOrigin,
    );
    this.contextMenuAction(
      createSection,
      'Paste here',
      () => void this.pasteFromClipboard(true),
      this.ui.pasteHereButton.disabled,
    );
    this.ui.viewportContextMenu.append(createSection);

    this.ui.viewportContextMenu.hidden = false;
    this.ui.viewportContextMenu.style.left = `${context.clientX}px`;
    this.ui.viewportContextMenu.style.top = `${context.clientY}px`;
    const bounds = this.ui.viewportContextMenu.getBoundingClientRect();
    this.ui.viewportContextMenu.style.left = `${Math.max(8, Math.min(context.clientX, window.innerWidth - bounds.width - 8))}px`;
    this.ui.viewportContextMenu.style.top = `${Math.max(8, Math.min(context.clientY, window.innerHeight - bounds.height - 8))}px`;
    const initialButton = [
      ...this.ui.viewportContextMenu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    ].find((button) => button.offsetParent !== null);
    (initialButton ?? this.ui.viewportContextMenu).focus({ preventScroll: true });
  }

  public connect(): void {
    this.ui.viewportContextMenu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.hideViewportContextMenu(true);
        return;
      }
      if (
        event.key !== 'ArrowDown' &&
        event.key !== 'ArrowUp' &&
        event.key !== 'Home' &&
        event.key !== 'End'
      )
        return;
      const buttons = [
        ...this.ui.viewportContextMenu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      ].filter((button) => button.offsetParent !== null);
      if (buttons.length === 0) return;
      event.preventDefault();
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : event.key === 'ArrowDown'
              ? (current + 1 + buttons.length) % buttons.length
              : (current - 1 + buttons.length) % buttons.length;
      buttons[nextIndex]?.focus({ preventScroll: true });
    });
    window.addEventListener(
      'pointerdown',
      (event) => {
        if (
          !this.ui.viewportContextMenu.hidden &&
          !this.ui.viewportContextMenu.contains(event.target as Node)
        ) {
          this.hideViewportContextMenu();
        }
      },
      { capture: true },
    );
    window.addEventListener('blur', () => this.hideViewportContextMenu());
    window.addEventListener('resize', () => this.hideViewportContextMenu());
  }
}
