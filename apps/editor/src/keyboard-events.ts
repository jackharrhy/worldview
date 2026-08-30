import { selectedFaceReferences } from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';
import { required } from './editor-elements.js';

export class KeyboardEvents {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
  }

  public connect(signal: AbortSignal): void {
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.defaultPrevented) return;
        const editingText = this.app.document.isTextEditingTarget(event.target);
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
            this.ui.gridSizeSelect.value = String(nextGridSize);
            this.ui.gridSizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            return;
          }
        }
        if (event.key === 'Escape' && this.state.viewFilterPopoverOpen) {
          event.preventDefault();
          this.app.organization.setViewFilterPopoverOpen(false);
          this.ui.viewFilterToggle.focus();
          return;
        }
        if (!editingText && event.key === 'Home') {
          event.preventDefault();
          this.app.contextMenu.focusCurrentSelection();
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
          if (event.shiftKey) this.app.document.invertEditableObjectSelection();
          else this.app.document.selectAllEditableObjects();
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
          this.app.document.repeatRecordedCommands();
          return;
        }
        if (
          !editingText &&
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'c'
        ) {
          event.preventDefault();
          void this.app.document.copySelection();
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
          void this.app.document.pasteFromClipboard('cursor');
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
          void this.app.document.pasteFromClipboard('original');
          return;
        }
        if (!editingText && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') {
          event.preventDefault();
          if (event.shiftKey) this.ui.ungroupButton.click();
          else this.ui.createGroupButton.click();
          return;
        }
        if (
          !editingText &&
          (event.metaKey || event.ctrlKey) &&
          event.altKey &&
          event.key.toLowerCase() === 'd'
        ) {
          event.preventDefault();
          this.ui.createLinkedDuplicateButton.click();
          return;
        }
        if (this.state.activeTool === 'sweep' && event.key === 'Escape') {
          event.preventDefault();
          if (!this.state.sweepEscapeReset) {
            this.app.geometry.resetSweep(true);
            this.ui.statusMessage.textContent =
              'Sweep destination reset. Press Escape again to leave the tool.';
          } else {
            this.app.session.setEditorTool('select');
          }
          return;
        }
        if (!editingText && this.state.activeTool === 'sweep' && event.key.startsWith('Arrow')) {
          event.preventDefault();
          const translation = [...this.state.sweepTransform.translation] as [
            number,
            number,
            number,
          ];
          if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            translation[2] +=
              event.key === 'ArrowUp' ? this.state.activeGridSize : -this.state.activeGridSize;
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            translation[0] +=
              event.key === 'ArrowRight' ? this.state.activeGridSize : -this.state.activeGridSize;
          } else {
            translation[1] +=
              event.key === 'ArrowUp' ? this.state.activeGridSize : -this.state.activeGridSize;
          }
          this.state.sweepTransform = { ...this.state.sweepTransform, translation };
          this.state.sweepEscapeReset = false;
          this.app.geometry.syncSweepControls();
          this.app.geometry.refreshSweepPreview();
          return;
        }
        if (
          !editingText &&
          this.app.transform.isTopologyTool(this.state.activeTool) &&
          this.state.topologySelectedVertices.length > 0 &&
          event.key.startsWith('Arrow')
        ) {
          const viewport = this.state.lastPointerPosition?.viewport ?? 'perspective';
          const delta = this.app.transform.viewportKeyboardNudge(event.key, viewport, event.altKey);
          if (delta) {
            event.preventDefault();
            this.app.transform.commitTopologyNudge(delta, viewport);
            return;
          }
        }
        if (
          !editingText &&
          this.state.activeTool === 'face' &&
          selectedFaceReferences(this.state.session.selection).length > 0 &&
          event.key.startsWith('Arrow')
        ) {
          const viewport = this.state.lastPointerPosition?.viewport ?? 'perspective';
          const delta = this.app.transform.viewportKeyboardNudge(event.key, viewport, event.altKey);
          if (delta) {
            event.preventDefault();
            this.app.transform.commitFaceNudge(delta, viewport);
            return;
          }
        }
        if (
          !editingText &&
          this.state.activeTool === 'sweep' &&
          (event.key === '[' || event.key === ']')
        ) {
          event.preventDefault();
          const rotationDegrees = [...this.state.sweepTransform.rotationDegrees] as [
            number,
            number,
            number,
          ];
          rotationDegrees[2] += event.key === ']' ? 15 : -15;
          this.state.sweepTransform = { ...this.state.sweepTransform, rotationDegrees };
          this.state.sweepEscapeReset = false;
          this.app.geometry.syncSweepControls();
          this.app.geometry.refreshSweepPreview();
          return;
        }
        if (
          !editingText &&
          this.state.activeTool === 'sweep' &&
          (event.key === '-' || event.key === '=')
        ) {
          event.preventDefault();
          this.state.sweepTransform = {
            ...this.state.sweepTransform,
            scale: Math.max(
              0.05,
              Math.min(20, this.state.sweepTransform.scale + (event.key === '=' ? 0.05 : -0.05)),
            ),
          };
          this.state.sweepEscapeReset = false;
          this.app.geometry.syncSweepControls();
          this.app.geometry.refreshSweepPreview();
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'b' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.app.session.setEditorTool('create');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.app.session.setEditorTool(this.state.activeTool === 'entity' ? 'select' : 'entity');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'g' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.app.session.setEditorTool(this.state.activeTool === 'hull' ? 'select' : 'hull');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.app.session.setEditorTool(this.state.activeTool === 'face' ? 'select' : 'face');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'w' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.app.session.setEditorTool(this.state.activeTool === 'sweep' ? 'select' : 'sweep');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'v' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.app.session.setEditorTool(this.state.activeTool === 'vertex' ? 'select' : 'vertex');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.app.session.setEditorTool(this.state.activeTool === 'edge' ? 'select' : 'edge');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'c' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.app.session.setEditorTool(this.state.activeTool === 'clip' ? 'select' : 'clip');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.app.session.setEditorTool(this.state.activeTool === 'rotate' ? 'select' : 'rotate');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 's' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.app.session.setEditorTool(this.state.activeTool === 'scale' ? 'select' : 'scale');
          return;
        }
        if (!editingText && event.key.toLowerCase() === 'h' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.app.session.setEditorTool(this.state.activeTool === 'shear' ? 'select' : 'shear');
          return;
        }
        if (!editingText && this.state.activeTool === 'clip' && event.key === 'Enter') {
          event.preventDefault();
          this.app.geometry.applyClip();
          return;
        }
        if (!editingText && this.state.activeTool === 'sweep' && event.key === 'Enter') {
          event.preventDefault();
          this.app.geometry.applySweep();
          return;
        }
        if (!editingText && this.state.activeTool === 'hull' && event.key === 'Enter') {
          event.preventDefault();
          try {
            if (!this.state.renderer?.commitHullBrush())
              this.ui.statusMessage.textContent = 'Place hull points first.';
          } catch (error) {
            this.ui.statusMessage.textContent =
              error instanceof Error ? error.message : String(error);
          }
          return;
        }
        if (
          !editingText &&
          event.key === 'Escape' &&
          this.app.geometry.clearActiveHandleSelection()
        ) {
          event.preventDefault();
          return;
        }
        if (!editingText && event.key === 'Escape' && this.state.activeTool !== 'select') {
          event.preventDefault();
          if (this.state.activeTool === 'clip' && this.state.renderer?.removeLastClipPoint()) {
            this.ui.statusMessage.textContent = 'Removed the most recent clip point.';
            return;
          }
          if (this.state.activeTool === 'hull' && this.state.renderer?.clearHullPoints()) {
            this.ui.statusMessage.textContent = 'Discarded all hull points.';
            return;
          }
          this.app.session.setEditorTool('select');
          return;
        }
        if (!editingText && event.key === 'Escape' && this.state.openGroupId) {
          event.preventDefault();
          this.app.organization.closeEditorGroup();
          return;
        }
        if (!editingText && event.key === 'Escape' && this.state.session.selection) {
          event.preventDefault();
          this.state.session.select(null);
          this.ui.statusMessage.textContent = 'Cleared the object selection.';
          return;
        }
        if (!editingText && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
          event.preventDefault();
          this.app.document.duplicateSelection();
          return;
        }
        if (!editingText && (event.key === 'Delete' || event.key === 'Backspace')) {
          event.preventDefault();
          if (this.state.activeTool === 'clip' && this.state.renderer?.removeLastClipPoint()) {
            this.ui.statusMessage.textContent = 'Removed the most recent clip point.';
            return;
          }
          if (this.app.transform.isTopologyTool(this.state.activeTool)) {
            this.app.geometry.deleteTopologySelection();
            return;
          }
          this.app.document.deleteSelection();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
          event.preventDefault();
          required<HTMLButtonElement>('[data-action="open-file"]').click();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          required<HTMLButtonElement>('[data-action="download"]').click();
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
        this.app.dispose();
      },
      { signal },
    );
  }
}
