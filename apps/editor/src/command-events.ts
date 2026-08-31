import { createSequentialIdFactory, parseMap } from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';
import type { EditorCommandId } from './editor-command-state.js';

export class CommandEvents {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
  }

  private invokeCommand(command: EditorCommandId): void {
    switch (command) {
      case 'undo':
        this.state.session.undo();
        return;
      case 'redo':
        this.state.session.redo();
        return;
      case 'repeat-commands':
        this.app.document.repeatRecordedCommands();
        return;
      case 'clear-repeat-commands':
        if (!this.state.session.clearRepeatableCommands()) {
          this.ui.statusMessage.set('No recorded command sequence to clear.');
        }
        return;
      case 'select-all':
        this.app.document.selectAllEditableObjects();
        return;
      case 'invert-selection':
        this.app.document.invertEditableObjectSelection();
        return;
      case 'snap-selection-to-grid':
        try {
          if (
            !this.state.session.snapSelectionToGrid(
              this.state.activeGridSize,
              createSequentialIdFactory(`grid-snap-${this.state.session.document.revision + 1}`),
              this.state.textureLock,
            )
          ) {
            this.ui.statusMessage.set('Select a brush or face to snap to the grid.');
          }
        } catch (error) {
          this.ui.statusMessage.setError(error instanceof Error ? error.message : String(error));
        }
        return;
      case 'duplicate':
        this.app.document.duplicateSelection();
        return;
      case 'copy':
        void this.app.document.copySelection();
        return;
      case 'paste':
        void this.app.document.pasteFromClipboard('cursor');
        return;
      case 'paste-original':
        void this.app.document.pasteFromClipboard('original');
        return;
      case 'delete':
        this.app.document.deleteSelection();
        return;
      case 'focus-selection':
        this.app.contextMenu.focusCurrentSelection();
        return;
      case 'hide-selection':
        this.state.session.hideSelected();
        return;
      case 'isolate-selection':
        this.state.session.isolateSelected();
        return;
      case 'show-all':
        this.state.session.showAll();
        return;
      case 'lock-selection':
        this.state.session.lockSelected();
        return;
      case 'unlock-all':
        this.state.session.unlockAll();
        return;
      case 'compile':
        void this.app.build.compilePreview();
        return;
      case 'toggle-preview':
        this.app.build.showCompiledPreview(!this.state.showingCompiled);
        return;
      case 'toggle-leak':
        this.state.leakOverlayVisible = !this.state.leakOverlayVisible;
        this.app.build.updateDiagnosticOverlayVisibility();
        return;
      case 'toggle-portals':
        this.state.portalOverlayVisible = !this.state.portalOverlayVisible;
        this.app.build.updateDiagnosticOverlayVisibility();
        return;
      case 'build-log':
        void this.openBuildLog();
        return;
      case 'launch':
        void this.launchBuild();
    }
  }

  private async openBuildLog(): Promise<void> {
    await this.app.build.renderBuildHistory();
    this.ui.buildLog.setOpen(true);
  }

  private async launchBuild(): Promise<void> {
    if (!this.state.latestBuild || !this.state.launchProfileId) return;
    this.ui.editorCommands.updateActions({ launch: { disabled: true } });
    try {
      const result = await this.state.buildService.launch({
        buildId: this.state.latestBuild.buildId,
        profileId: this.state.launchProfileId,
        expectedDocumentRevision: this.state.session.document.revision,
      });
      this.ui.statusMessage.set(
        `Launched build ${result.buildId.slice(0, 8)} with ${result.profileId}.`,
      );
    } catch (error) {
      this.ui.statusMessage.setError(error instanceof Error ? error.message : String(error));
    } finally {
      this.ui.editorCommands.updateActions({
        launch: {
          disabled:
            this.state.latestBuild.status !== 'succeeded' ||
            this.state.latestBuild.sourceDocumentRevision !== this.state.session.document.revision,
        },
      });
    }
  }

  public connect(signal: AbortSignal): void {
    this.ui.editorCommands.bind({
      invoke: (command) => this.invokeCommand(command),
      selectTool: (tool) => this.app.session.setEditorTool(tool),
    });
    signal.addEventListener('abort', () => this.ui.editorCommands.unbind(), { once: true });
    this.app.elements.referenceFiles.addEventListener(
      'change',
      async () => {
        const files = [...(this.app.elements.referenceFiles.files ?? [])];
        const sources = await Promise.allSettled(files.map((file) => file.text()));
        for (const [index, file] of files.entries()) {
          try {
            const source = sources[index];
            if (!source || source.status === 'rejected') {
              throw source?.reason ?? new Error('Reference file could not be read');
            }
            const document = parseMap(
              source.value,
              createSequentialIdFactory(`reference-source-${this.state.referenceSequence + 1}`),
            );
            this.app.materials.addReferenceDocument(file.name, document);
          } catch (error) {
            this.ui.statusMessage.set(
              `${file.name}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        this.app.elements.referenceFiles.value = '';
      },
      { signal },
    );
  }
}
