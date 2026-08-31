import { type EditorTool } from '@jackharrhy/worldview-editor';

import type { EditorElements } from './editor-elements.js';
import type { EditorShellState } from './editor-shell-state.js';
import type { EditorStatePort } from './editor-state-port.js';

type KeyboardState = EditorStatePort<
  | 'activeGridSize'
  | 'activeTool'
  | 'openGroupId'
  | 'recovery'
  | 'session'
  | 'uvEditor'
  | 'viewFilterPopoverOpen'
>;

type KeyboardUi = Pick<
  EditorShellState,
  'objectTools' | 'projectUi' | 'statusMessage' | 'toolSettings'
>;

interface KeyboardDocumentCommands {
  copySelection(): Promise<void>;
  deleteSelection(): void;
  duplicateSelection(): void;
  invertEditableObjectSelection(): void;
  isTextEditingTarget(target: EventTarget | null): boolean;
  pasteFromClipboard(placement: 'cursor' | 'original'): Promise<void>;
  repeatRecordedCommands(): void;
  selectAllEditableObjects(): void;
}

interface KeyboardToolCommands {
  activate(tool: EditorTool): void;
  handleKeyDown(event: KeyboardEvent): boolean;
}

interface KeyboardPorts {
  readonly state: KeyboardState;
  readonly ui: KeyboardUi;
  readonly elements: Pick<EditorElements, 'viewFilterToggle'>;
  readonly document: KeyboardDocumentCommands;
  readonly tools: KeyboardToolCommands;
  readonly focusSelection: () => void;
  readonly closeEditorGroup: () => boolean;
  readonly setViewFilterPopoverOpen: (open: boolean) => void;
  readonly dispose: () => void;
}

export class KeyboardEvents {
  public constructor(private readonly ports: KeyboardPorts) {}
  private get state() {
    return this.ports.state;
  }
  private get ui() {
    return this.ports.ui;
  }

  public connect(signal: AbortSignal): void {
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.defaultPrevented) return;
        const editingText = this.ports.document.isTextEditingTarget(event.target);
        if (!editingText && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const directGridIndex = /^Digit([1-9])$/.exec(event.code)?.[1];
          const gridSizes = [1, 2, 4, 8, 16, 32, 64, 128, 256] as const;
          const currentIndex = gridSizes.indexOf(
            this.state.activeGridSize as (typeof gridSizes)[number],
          );
          const steppedIndex =
            event.key === '['
              ? Math.max(0, currentIndex - 1)
              : event.key === ']'
                ? Math.min(gridSizes.length - 1, currentIndex + 1)
                : null;
          const nextGridSize = directGridIndex
            ? gridSizes[Number(directGridIndex) - 1]
            : steppedIndex === null
              ? undefined
              : gridSizes[steppedIndex];
          if (nextGridSize !== undefined && this.state.activeTool !== 'sweep') {
            event.preventDefault();
            this.ui.toolSettings.setGridSize(nextGridSize);
            return;
          }
        }
        if (event.key === 'Escape' && this.state.viewFilterPopoverOpen) {
          event.preventDefault();
          this.ports.setViewFilterPopoverOpen(false);
          this.ports.elements.viewFilterToggle.focus();
          return;
        }
        if (!editingText && event.key === 'Home') {
          event.preventDefault();
          this.ports.focusSelection();
          return;
        }
        if (!editingText && event.key === 'Escape' && this.state.uvEditor.cancel()) {
          event.preventDefault();
          return;
        }
        if (
          !editingText &&
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          event.key.toLowerCase() === 'a'
        ) {
          event.preventDefault();
          if (event.shiftKey) this.ports.document.invertEditableObjectSelection();
          else this.ports.document.selectAllEditableObjects();
          return;
        }
        if (
          !editingText &&
          (event.metaKey || event.ctrlKey) &&
          event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === 'r'
        ) {
          event.preventDefault();
          this.ports.document.repeatRecordedCommands();
          return;
        }
        if (
          !editingText &&
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'c'
        ) {
          event.preventDefault();
          void this.ports.document.copySelection();
          return;
        }
        if (
          !editingText &&
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === 'v'
        ) {
          event.preventDefault();
          void this.ports.document.pasteFromClipboard('cursor');
          return;
        }
        if (
          !editingText &&
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          event.altKey &&
          event.key.toLowerCase() === 'v'
        ) {
          event.preventDefault();
          void this.ports.document.pasteFromClipboard('original');
          return;
        }
        if (!editingText && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') {
          event.preventDefault();
          this.ui.objectTools.dispatch(
            event.shiftKey ? { type: 'ungroup' } : { type: 'create-group', name: 'Group' },
          );
          return;
        }
        if (
          !editingText &&
          (event.metaKey || event.ctrlKey) &&
          event.altKey &&
          event.key.toLowerCase() === 'd'
        ) {
          event.preventDefault();
          this.ui.objectTools.dispatch({ type: 'duplicate-linked-group' });
          return;
        }
        if (!editingText && this.ports.tools.handleKeyDown(event)) return;
        if (!editingText && event.key.toLowerCase() === 'b' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.ports.tools.activate('create');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.ports.tools.activate(this.state.activeTool === 'entity' ? 'select' : 'entity');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'g' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.ports.tools.activate(this.state.activeTool === 'hull' ? 'select' : 'hull');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.ports.tools.activate(this.state.activeTool === 'face' ? 'select' : 'face');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'w' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.ports.tools.activate(this.state.activeTool === 'sweep' ? 'select' : 'sweep');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'v' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.ports.tools.activate(this.state.activeTool === 'vertex' ? 'select' : 'vertex');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.ports.tools.activate(this.state.activeTool === 'edge' ? 'select' : 'edge');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'c' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.ports.tools.activate(this.state.activeTool === 'clip' ? 'select' : 'clip');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.ports.tools.activate(this.state.activeTool === 'rotate' ? 'select' : 'rotate');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 's' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.ports.tools.activate(this.state.activeTool === 'scale' ? 'select' : 'scale');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'h' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.ports.tools.activate(this.state.activeTool === 'shear' ? 'select' : 'shear');
          return;
        }
        if (!editingText && event.key === 'Escape' && this.state.openGroupId) {
          event.preventDefault();
          this.ports.closeEditorGroup();
          return;
        }
        if (!editingText && event.key === 'Escape' && this.state.session.selection) {
          event.preventDefault();
          this.state.session.select(null);
          this.ui.statusMessage.set('Cleared the object selection.');
          return;
        }
        if (!editingText && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
          event.preventDefault();
          this.ports.document.duplicateSelection();
          return;
        }
        if (!editingText && (event.key === 'Delete' || event.key === 'Backspace')) {
          event.preventDefault();
          this.ports.document.deleteSelection();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
          event.preventDefault();
          this.ui.projectUi.invoke('open-file');
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          this.ui.projectUi.invoke('download');
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) this.state.session.redo();
          else this.state.session.undo();
        }
      },
      { signal },
    );

    window.addEventListener(
      'beforeunload',
      () => {
        void this.state.recovery.flush();
        this.ports.dispose();
      },
      { signal },
    );
  }
}
