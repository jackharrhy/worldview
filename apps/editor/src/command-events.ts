import {
  createSequentialIdFactory,
  parseMap,
  type EditorTool,
  type MapDocument,
} from '@jackharrhy/worldview-editor';

import type { EditorCommandId } from './editor-command-state.js';
import type { EditorElements } from './editor-elements.js';
import type { EditorShellState } from './editor-shell-state.js';
import type { EditorStatePort } from './editor-state-port.js';

type CommandEventState = EditorStatePort<
  | 'activeGridSize'
  | 'buildService'
  | 'latestBuild'
  | 'launchProfileId'
  | 'leakOverlayVisible'
  | 'portalOverlayVisible'
  | 'referenceSequence'
  | 'session'
  | 'showingCompiled'
  | 'textureLock',
  'leakOverlayVisible' | 'portalOverlayVisible'
>;

type CommandEventUi = Pick<EditorShellState, 'buildLog' | 'editorCommands' | 'statusMessage'>;

interface CommandDocumentCommands {
  copySelection(): Promise<void>;
  deleteSelection(): void;
  duplicateSelection(): void;
  invertEditableObjectSelection(): void;
  pasteFromClipboard(placement: 'cursor' | 'original'): Promise<void>;
  repeatRecordedCommands(): void;
  selectAllEditableObjects(): void;
}

interface CommandBuildCommands {
  compilePreview(): Promise<void>;
  renderBuildHistory(): Promise<void>;
  showCompiledPreview(show: boolean): void;
  updateDiagnosticOverlayVisibility(): void;
}

interface CommandEventPorts {
  readonly state: CommandEventState;
  readonly ui: CommandEventUi;
  readonly elements: Pick<EditorElements, 'referenceFiles'>;
  readonly document: CommandDocumentCommands;
  readonly build: CommandBuildCommands;
  readonly focusSelection: () => void;
  readonly addReferenceDocument: (label: string, document: MapDocument) => void;
  readonly setEditorTool: (tool: EditorTool) => void;
}

export class CommandEvents {
  public constructor(private readonly ports: CommandEventPorts) {}
  private get state() {
    return this.ports.state;
  }
  private get ui() {
    return this.ports.ui;
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
        this.ports.document.repeatRecordedCommands();
        return;
      case 'clear-repeat-commands':
        if (!this.state.session.clearRepeatableCommands()) {
          this.ui.statusMessage.set('No recorded command sequence to clear.');
        }
        return;
      case 'select-all':
        this.ports.document.selectAllEditableObjects();
        return;
      case 'invert-selection':
        this.ports.document.invertEditableObjectSelection();
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
        this.ports.document.duplicateSelection();
        return;
      case 'copy':
        void this.ports.document.copySelection();
        return;
      case 'paste':
        void this.ports.document.pasteFromClipboard('cursor');
        return;
      case 'paste-original':
        void this.ports.document.pasteFromClipboard('original');
        return;
      case 'delete':
        this.ports.document.deleteSelection();
        return;
      case 'focus-selection':
        this.ports.focusSelection();
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
        void this.ports.build.compilePreview();
        return;
      case 'toggle-preview':
        this.ports.build.showCompiledPreview(!this.state.showingCompiled);
        return;
      case 'toggle-leak':
        this.state.leakOverlayVisible = !this.state.leakOverlayVisible;
        this.ports.build.updateDiagnosticOverlayVisibility();
        return;
      case 'toggle-portals':
        this.state.portalOverlayVisible = !this.state.portalOverlayVisible;
        this.ports.build.updateDiagnosticOverlayVisibility();
        return;
      case 'build-log':
        void this.openBuildLog();
        return;
      case 'launch':
        void this.launchBuild();
    }
  }

  private async openBuildLog(): Promise<void> {
    await this.ports.build.renderBuildHistory();
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
      selectTool: (tool) => this.ports.setEditorTool(tool),
    });
    signal.addEventListener('abort', () => this.ui.editorCommands.unbind(), { once: true });
    this.ports.elements.referenceFiles.addEventListener(
      'change',
      async () => {
        const files = [...(this.ports.elements.referenceFiles.files ?? [])];
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
            this.ports.addReferenceDocument(file.name, document);
          } catch (error) {
            this.ui.statusMessage.set(
              `${file.name}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        this.ports.elements.referenceFiles.value = '';
      },
      { signal },
    );
  }
}
