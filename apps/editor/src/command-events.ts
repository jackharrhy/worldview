import {
  createSequentialIdFactory,
  parseMap,
  type EditorIssueType,
  type EditorSpecialBrushFilter,
} from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';
import { required } from './editor-elements.js';

export class CommandEvents {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
  }

  public connect(): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
      button.addEventListener('click', () => {
        const tool = button.dataset.tool;
        if (
          tool === 'select' ||
          tool === 'create' ||
          tool === 'entity' ||
          tool === 'hull' ||
          tool === 'face' ||
          tool === 'sweep' ||
          tool === 'clip' ||
          tool === 'vertex' ||
          tool === 'edge' ||
          tool === 'rotate' ||
          tool === 'scale' ||
          tool === 'shear'
        ) {
          this.app.session.setEditorTool(tool);
        }
      });
    }
    this.ui.referenceFiles.addEventListener('change', async () => {
      const files = [...(this.ui.referenceFiles.files ?? [])];
      for (const file of files) {
        try {
          const document = parseMap(
            await file.text(),
            createSequentialIdFactory(`reference-source-${this.state.referenceSequence + 1}`),
          );
          this.app.materials.addReferenceDocument(file.name, document);
        } catch (error) {
          this.ui.statusMessage.textContent = `${file.name}: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      this.ui.referenceFiles.value = '';
    });

    this.ui.undoButton.addEventListener('click', () => this.state.session.undo());
    this.ui.redoButton.addEventListener('click', () => this.state.session.redo());
    this.ui.repeatCommandsButton.addEventListener(
      'click',
      this.app.document.repeatRecordedCommands,
    );
    this.ui.clearRepeatCommandsButton.addEventListener('click', () => {
      if (!this.state.session.clearRepeatableCommands()) {
        this.ui.statusMessage.textContent = 'No recorded command sequence to clear.';
      }
    });
    this.ui.selectAllButton.addEventListener('click', this.app.document.selectAllEditableObjects);
    this.ui.invertSelectionButton.addEventListener(
      'click',
      this.app.document.invertEditableObjectSelection,
    );
    this.ui.duplicateButton.addEventListener('click', this.app.document.duplicateSelection);
    this.ui.copyButton.addEventListener('click', () => void this.app.document.copySelection());
    this.ui.pasteButton.addEventListener(
      'click',
      () => void this.app.document.pasteFromClipboard(false),
    );
    this.ui.pasteHereButton.addEventListener(
      'click',
      () => void this.app.document.pasteFromClipboard(true),
    );
    this.ui.deleteButton.addEventListener('click', this.app.document.deleteSelection);
    this.ui.focusSelectionButton.addEventListener(
      'click',
      this.app.contextMenu.focusCurrentSelection,
    );
    this.ui.hideSelectionButton.addEventListener('click', () => this.state.session.hideSelected());
    this.ui.isolateSelectionButton.addEventListener('click', () =>
      this.state.session.isolateSelected(),
    );
    this.ui.showAllButton.addEventListener('click', () => this.state.session.showAll());
    this.ui.lockSelectionButton.addEventListener('click', () => this.state.session.lockSelected());
    this.ui.unlockAllButton.addEventListener('click', () => this.state.session.unlockAll());
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-selection-query]')) {
      button.addEventListener('click', () => {
        const mode = button.dataset.selectionQuery;
        if (mode === 'touching' || mode === 'inside' || mode === 'inside-projected') {
          this.app.document.applySelectionBrushQuery(mode);
        }
      });
    }
    this.ui.compileButton.addEventListener('click', () => void this.app.build.compilePreview());
    this.ui.togglePreviewButton.addEventListener('click', () =>
      this.app.build.showCompiledPreview(!this.state.showingCompiled),
    );
    this.ui.toggleLeakButton.addEventListener('click', () => {
      this.state.leakOverlayVisible = !this.state.leakOverlayVisible;
      this.app.build.updateDiagnosticOverlayVisibility();
    });
    this.ui.togglePortalsButton.addEventListener('click', () => {
      this.state.portalOverlayVisible = !this.state.portalOverlayVisible;
      this.app.build.updateDiagnosticOverlayVisibility();
    });
    this.ui.buildLogButton.addEventListener('click', () => this.ui.buildLogDialog.showModal());
    required<HTMLButtonElement>('[data-action="close-build-log"]').addEventListener('click', () =>
      this.ui.buildLogDialog.close(),
    );
    this.ui.launchButton.addEventListener('click', async () => {
      if (!this.state.latestBuild || !this.state.launchProfileId) return;
      this.ui.launchButton.disabled = true;
      try {
        const result = await this.state.buildService.launch({
          buildId: this.state.latestBuild.buildId,
          profileId: this.state.launchProfileId,
          expectedDocumentRevision: this.state.session.document.revision,
        });
        this.ui.statusMessage.textContent = `Launched build ${result.buildId.slice(0, 8)} with ${result.profileId}.`;
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        this.ui.launchButton.disabled =
          this.state.latestBuild.status !== 'succeeded' ||
          this.state.latestBuild.sourceDocumentRevision !== this.state.session.document.revision;
      }
    });

    this.ui.issueStatus.addEventListener('click', () =>
      this.app.organization.setIssueBrowserOpen(!this.state.issueBrowserOpen),
    );
    required<HTMLButtonElement>('[data-action="close-issues"]').addEventListener('click', () =>
      this.app.organization.setIssueBrowserOpen(false),
    );
    this.ui.showHiddenIssues.addEventListener('change', this.app.organization.renderIssues);
    for (const input of document.querySelectorAll<HTMLInputElement>('[data-issue-filter]')) {
      input.addEventListener('change', () => {
        const type = input.dataset.issueFilter as EditorIssueType | undefined;
        if (!type) return;
        if (input.checked) this.state.enabledIssueTypes.add(type);
        else this.state.enabledIssueTypes.delete(type);
        this.app.organization.renderIssues();
      });
    }

    this.ui.viewFilterToggle.addEventListener('click', () =>
      this.app.organization.setViewFilterPopoverOpen(!this.state.viewFilterPopoverOpen),
    );
    required<HTMLButtonElement>('[data-action="close-view-filters"]').addEventListener(
      'click',
      () => this.app.organization.setViewFilterPopoverOpen(false),
    );
    this.ui.showWorldBrushes.addEventListener('change', () => {
      this.state.session.setWorldBrushesVisible(this.ui.showWorldBrushes.checked);
    });
    for (const input of document.querySelectorAll<HTMLInputElement>(
      '[data-special-brush-filter]',
    )) {
      input.addEventListener('change', () => {
        const type = input.dataset.specialBrushFilter as EditorSpecialBrushFilter | undefined;
        if (type) this.state.session.setSpecialBrushFilterVisible(type, input.checked);
      });
    }
    this.ui.entityClassFilterSearch.addEventListener(
      'input',
      this.app.organization.renderViewFilters,
    );
    required<HTMLButtonElement>('[data-action="show-all-entity-classes"]').addEventListener(
      'click',
      () => this.state.session.setAllEntityClassesVisible(true),
    );
    required<HTMLButtonElement>('[data-action="hide-all-entity-classes"]').addEventListener(
      'click',
      () => this.state.session.setAllEntityClassesVisible(false),
    );

    this.ui.inspectorToggle.addEventListener('click', () => {
      this.app.document.setInspectorOpen(this.ui.inspector.classList.contains('closed'));
    });

    for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-inspector-tab]')) {
      tab.addEventListener('click', () => {
        const target = tab.dataset.inspectorTab;
        for (const candidate of document.querySelectorAll<HTMLButtonElement>(
          '[data-inspector-tab]',
        )) {
          const active = candidate === tab;
          candidate.classList.toggle('active', active);
          candidate.setAttribute('aria-selected', String(active));
        }
        for (const panel of document.querySelectorAll<HTMLElement>('[data-inspector-panel]')) {
          panel.hidden = panel.dataset.inspectorPanel !== target;
        }
      });
    }
  }
}
