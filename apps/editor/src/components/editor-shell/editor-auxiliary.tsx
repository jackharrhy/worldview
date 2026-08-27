import { EDITOR_ISSUE_TYPE_INFO } from '@jackharrhy/worldview-editor';

import type { EditorShellState } from '../../editor-shell-state.js';
import { StatusBar } from './status-bar.js';

interface EditorAuxiliaryProps {
  readonly shellState: EditorShellState;
}

export function EditorAuxiliary({ shellState }: EditorAuxiliaryProps) {
  return (
    <>
      <section id="issue-browser" className="issue-browser" aria-label="Issue browser" hidden>
        <header className="issue-browser-toolbar">
          <div className="issue-browser-title">
            <strong>Issues</strong>
            <span id="issue-summary">0 findings</span>
          </div>
          <details className="issue-filter-menu">
            <summary>Filter types</summary>
            <div id="issue-filters" className="issue-filter-list">
              {EDITOR_ISSUE_TYPE_INFO.map((entry) => (
                <label key={entry.type}>
                  <input type="checkbox" data-issue-filter={entry.type} defaultChecked />
                  <span>{entry.label}</span>
                </label>
              ))}
            </div>
          </details>
          <label className="show-hidden-issues">
            <input id="show-hidden-issues" type="checkbox" /> Show hidden
          </label>
          <button type="button" data-action="close-issues" aria-label="Close issue browser">
            Close
          </button>
        </header>
        <ul id="issue-list" className="issue-list" />
      </section>
      <StatusBar shellState={shellState} />
      <dialog id="source-dialog" className="source-dialog" aria-labelledby="source-dialog-title">
        <div className="dialog-shell">
          <header>
            <div>
              <strong id="source-dialog-title">Map source</strong>
              <span>Valve 220</span>
            </div>
            <button type="button" data-action="close-source" aria-label="Close source">
              Close
            </button>
          </header>
          <textarea
            id="map-source"
            aria-label="Map source"
            spellCheck="false"
            aria-describedby="source-message"
            defaultValue={''}
          />
          <footer>
            <p id="source-message" className="source-message">
              Normalized source is ready.
            </p>
            <button type="button" data-action="apply-source">
              Apply source
            </button>
          </footer>
        </div>
      </dialog>
      <div
        id="viewport-context-menu"
        className="viewport-context-menu"
        role="menu"
        aria-label="Map view actions"
        tabIndex={-1}
        hidden
      />
    </>
  );
}
