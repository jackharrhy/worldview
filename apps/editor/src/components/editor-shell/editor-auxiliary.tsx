import { EDITOR_ISSUE_TYPE_INFO } from '@jackharrhy/worldview-editor';

export function EditorAuxiliary() {
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
        <div id="issue-list" className="issue-list" role="list" />
      </section>
      <footer className="statusbar">
        <span id="status-message" aria-live="polite">
          Starting WebGPU source renderer...
        </span>
        <button id="issue-status" type="button" data-action="toggle-issues" aria-expanded="false">
          Issues 0
        </button>
        <div className="compile-state" title="Compiler service state">
          COMPILER OFFLINE
        </div>
        <span id="pointer-context">Perspective / edit</span>
      </footer>
      <dialog id="source-dialog" className="source-dialog">
        <div className="dialog-shell">
          <header>
            <div>
              <strong>Map source</strong>
              <span>Valve 220</span>
            </div>
            <button type="button" data-action="close-source" aria-label="Close source">
              Close
            </button>
          </header>
          <textarea
            id="map-source"
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
      <aside
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
