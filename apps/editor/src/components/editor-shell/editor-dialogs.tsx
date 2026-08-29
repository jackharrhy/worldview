import { EDITOR_SPECIAL_BRUSH_FILTER_INFO } from '@jackharrhy/worldview-editor';
import type { EditorShellState } from '../../editor-shell-state.js';
import { CollaborationDialog } from './collaboration-ui.js';

export function EditorDialogs({ shellState }: { readonly shellState: EditorShellState }) {
  return (
    <>
      <dialog
        id="build-log-dialog"
        className="build-log-dialog"
        aria-labelledby="build-log-dialog-title"
      >
        <header>
          <strong id="build-log-dialog-title">Build diagnostics</strong>
          <select id="build-history" aria-label="Build history" />
          <button type="button" data-action="close-build-log">
            Close
          </button>
        </header>
        <pre id="build-log-output" />
      </dialog>
      <dialog
        id="recovery-dialog"
        className="build-log-dialog recovery-dialog"
        aria-labelledby="recovery-dialog-title"
      >
        <header>
          <strong id="recovery-dialog-title">Recovery versions</strong>
          <button type="button" data-action="close-recovery">
            Close
          </button>
        </header>
        <div id="recovery-list" className="recovery-list" />
      </dialog>
      <dialog
        id="checkpoint-dialog"
        className="build-log-dialog checkpoint-dialog"
        aria-labelledby="checkpoint-dialog-title"
      >
        <header>
          <strong id="checkpoint-dialog-title">Protect recovery checkpoint</strong>
          <button type="button" data-action="close-checkpoint">
            Close
          </button>
        </header>
        <div className="checkpoint-body">
          <label>
            Label
            <input id="checkpoint-label" type="text" autoComplete="off" spellCheck="false" />
          </label>
          <p>Protected checkpoints are retained until you explicitly remove them.</p>
          <div className="checkpoint-actions">
            <button type="button" data-action="cancel-checkpoint">
              Cancel
            </button>
            <button type="button" data-action="create-checkpoint">
              Protect checkpoint
            </button>
          </div>
        </div>
      </dialog>
      <CollaborationDialog port={shellState.collaborationUi} />
      <aside
        id="view-filter-popover"
        className="view-filter-popover"
        aria-label="Viewport filters"
        hidden
      >
        <header>
          <div>
            <strong>View filters</strong>
            <span>Non-serialized</span>
          </div>
          <button type="button" data-action="close-view-filters">
            Close
          </button>
        </header>
        <div className="view-filter-scroll">
          <section className="view-filter-section">
            <div className="view-filter-heading">
              <strong>Brushes</strong>
              <span>Special types</span>
            </div>
            <label className="view-filter-row">
              <input id="show-world-brushes" type="checkbox" defaultChecked />
              <span>
                <b>World brushes</b>
                <small>Structural geometry in worldspawn, groups, and layers</small>
              </span>
            </label>
            {EDITOR_SPECIAL_BRUSH_FILTER_INFO.map((entry) => (
              <label className="view-filter-row" key={entry.type}>
                <input type="checkbox" data-special-brush-filter={entry.type} defaultChecked />
                <span>
                  <b>{entry.label}</b>
                  <small>{entry.description}</small>
                </span>
              </label>
            ))}
          </section>
          <section className="view-filter-section entity-class-filter-section">
            <div className="view-filter-heading">
              <strong>Entity definitions</strong>
              <span id="entity-class-filter-summary">0 classes</span>
            </div>
            <div className="view-filter-entity-actions">
              <input
                id="entity-class-filter-search"
                type="search"
                placeholder="Filter classnames"
                aria-label="Filter entity classnames"
              />
              <button type="button" data-action="show-all-entity-classes">
                All
              </button>
              <button type="button" data-action="hide-all-entity-classes">
                None
              </button>
            </div>
            <div id="entity-class-filter-list" className="entity-class-filter-list" />
          </section>
        </div>
        <footer id="view-filter-status">0 objects filtered · map source unchanged</footer>
      </aside>
    </>
  );
}
