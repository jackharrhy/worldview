export function EditorChrome() {
  return (
    <>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="wordmark">WORLDVIEW</div>
          <span id="document-name" className="document-name">
            untitled.map
          </span>
        </div>
        <nav className="top-actions" aria-label="Document actions">
          <div className="toolbar-group" aria-label="Files">
            <button className="icon-button" type="button" data-action="new" title="New map">
              <i className="ph ph-file-plus" aria-hidden="true" />
              <span className="toolbar-label">New</span>
            </button>
            <button className="icon-button" type="button" data-action="open-file" title="Open map">
              <i className="ph ph-folder-open" aria-hidden="true" />
              <span className="toolbar-label">Open</span>
            </button>
            <button
              className="icon-button"
              type="button"
              data-action="open-project"
              title="Open project directory"
            >
              <i className="ph ph-folders" aria-hidden="true" />
              <span className="toolbar-label">Project</span>
            </button>
            <button className="icon-button" type="button" data-action="download" title="Save map">
              <i className="ph ph-floppy-disk" aria-hidden="true" />
              <span className="toolbar-label">Save</span>
            </button>
          </div>
          <select id="project-map" aria-label="Project map" hidden />
          <div className="toolbar-group secondary-actions" aria-label="Document history and source">
            <button
              className="icon-button"
              type="button"
              data-action="export-normalized"
              title="Export normalized copy"
            >
              <i className="ph ph-export" aria-hidden="true" />
              <span className="toolbar-label">Export normalized</span>
            </button>
            <button
              className="icon-button"
              type="button"
              data-action="checkpoint"
              title="Create recovery checkpoint"
            >
              <i className="ph ph-bookmark-simple" aria-hidden="true" />
              <span className="toolbar-label">Checkpoint</span>
            </button>
            <button
              className="icon-button"
              type="button"
              data-action="versions"
              title="Recovery versions"
            >
              <i className="ph ph-clock-counter-clockwise" aria-hidden="true" />
              <span className="toolbar-label">Versions</span>
            </button>
            <button
              className="icon-button"
              type="button"
              data-action="show-source"
              title="Edit map source"
            >
              <i className="ph ph-code" aria-hidden="true" />
              <span className="toolbar-label">Source</span>
            </button>
          </div>
          <div className="toolbar-group build-actions" aria-label="Build">
            <select id="build-profile" aria-label="Build profile" hidden />
            <button className="icon-button" type="button" data-action="compile" title="Compile map">
              <i className="ph ph-hammer" aria-hidden="true" />
              <span className="toolbar-label">Compile</span>
            </button>
            <button
              className="icon-button"
              type="button"
              data-action="toggle-preview"
              title="Toggle compiled preview"
              disabled
            >
              <i className="ph ph-monitor-play" aria-hidden="true" />
              <span className="toolbar-label">Preview</span>
            </button>
            <button
              className="icon-button"
              type="button"
              data-action="toggle-leak"
              title="Toggle leak path"
              disabled
            >
              <i className="ph ph-warning" aria-hidden="true" />
              <span className="toolbar-label">Leak</span>
            </button>
            <button
              className="icon-button"
              type="button"
              data-action="toggle-portals"
              title="Toggle portals"
              disabled
            >
              <i className="ph ph-intersect-three" aria-hidden="true" />
              <span className="toolbar-label">Portals</span>
            </button>
            <button
              className="icon-button"
              type="button"
              data-action="build-log"
              title="Build diagnostics"
              disabled
            >
              <i className="ph ph-terminal-window" aria-hidden="true" />
              <span className="toolbar-label">Log</span>
            </button>
            <button
              className="icon-button"
              type="button"
              data-action="launch"
              title="Launch external game"
              disabled
            >
              <i className="ph ph-rocket-launch" aria-hidden="true" />
              <span className="toolbar-label">Launch</span>
            </button>
          </div>
        </nav>
        <button
          className="inspector-toggle icon-button"
          type="button"
          data-action="toggle-inspector"
          aria-pressed="true"
          title="Toggle inspector"
        >
          <i className="ph ph-sidebar" aria-hidden="true" />
          <span className="toolbar-label">Inspector</span>
        </button>
        <input id="map-file" type="file" accept=".map,.txt" hidden />
        <input id="reference-files" type="file" accept=".map" multiple hidden />
      </header>
      <section className="toolrail" aria-label="Editor tools">
        <div className="toolbar-group tool-group" aria-label="Modes">
          <button
            className="tool-button icon-button active"
            type="button"
            data-tool="select"
            aria-pressed="true"
            title="Select objects"
          >
            <i className="ph ph-cursor" aria-hidden="true" />
            <span className="toolbar-label">Select</span>
          </button>
          <button
            className="tool-button icon-button"
            type="button"
            data-tool="create"
            aria-pressed="false"
            title="Create brush"
          >
            <i className="ph ph-cube" aria-hidden="true" />
            <span className="toolbar-label">Brush</span>
          </button>
          <button
            className="tool-button icon-button"
            type="button"
            data-tool="entity"
            aria-pressed="false"
            title="Place entity"
          >
            <i className="ph ph-user-square" aria-hidden="true" />
            <span className="toolbar-label">Entity</span>
          </button>
          <button
            className="tool-button icon-button"
            type="button"
            data-tool="hull"
            aria-pressed="false"
            title="Build convex hull"
          >
            <i className="ph ph-polygon" aria-hidden="true" />
            <span className="toolbar-label">Hull</span>
          </button>
          <button
            className="tool-button icon-button"
            type="button"
            data-tool="face"
            aria-pressed="false"
            title="Edit faces"
          >
            <i className="ph ph-square" aria-hidden="true" />
            <span className="toolbar-label">Face</span>
          </button>
          <button
            className="tool-button icon-button"
            type="button"
            data-tool="sweep"
            aria-pressed="false"
            title="Sweep selection"
          >
            <i className="ph ph-flow-arrow" aria-hidden="true" />
            <span className="toolbar-label">Sweep</span>
          </button>
          <button
            className="tool-button icon-button"
            type="button"
            data-tool="clip"
            aria-pressed="false"
            title="Clip brushes"
          >
            <i className="ph ph-scissors" aria-hidden="true" />
            <span className="toolbar-label">Clip</span>
          </button>
          <button
            className="tool-button icon-button"
            type="button"
            data-tool="vertex"
            aria-pressed="false"
            title="Edit vertices"
          >
            <i className="ph ph-vector-three" aria-hidden="true" />
            <span className="toolbar-label">Vertex</span>
          </button>
          <button
            className="tool-button icon-button"
            type="button"
            data-tool="edge"
            aria-pressed="false"
            title="Edit edges"
          >
            <i className="ph ph-line-segment" aria-hidden="true" />
            <span className="toolbar-label">Edge</span>
          </button>
          <button
            className="tool-button icon-button"
            type="button"
            data-tool="rotate"
            aria-pressed="false"
            title="Rotate selection"
          >
            <i className="ph ph-arrow-clockwise" aria-hidden="true" />
            <span className="toolbar-label">Rotate</span>
          </button>
          <button
            className="tool-button icon-button"
            type="button"
            data-tool="scale"
            aria-pressed="false"
            title="Scale selection"
          >
            <i className="ph ph-arrows-out" aria-hidden="true" />
            <span className="toolbar-label">Scale</span>
          </button>
          <button
            className="tool-button icon-button"
            type="button"
            data-tool="shear"
            aria-pressed="false"
            title="Shear selection"
          >
            <i className="ph ph-perspective" aria-hidden="true" />
            <span className="toolbar-label">Shear</span>
          </button>
        </div>
        <span className="toolrail-rule" aria-hidden="true" />
        <div className="toolbar-group selection-actions" aria-label="Selection and history">
          <button
            className="icon-button"
            type="button"
            data-action="focus-selection"
            title="Frame selection (Home)"
            disabled
          >
            <i className="ph ph-crosshair" aria-hidden="true" />
            <span className="toolbar-label">Focus</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="select-all"
            title="Select all (Ctrl/Command+A)"
          >
            <i className="ph ph-selection-all" aria-hidden="true" />
            <span className="toolbar-label">All</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="invert-selection"
            title="Invert selection (Ctrl/Command+Shift+A)"
          >
            <i className="ph ph-selection-inverse" aria-hidden="true" />
            <span className="toolbar-label">Invert</span>
          </button>
          <button className="icon-button" type="button" data-action="undo" title="Undo" disabled>
            <i className="ph ph-arrow-counter-clockwise" aria-hidden="true" />
            <span className="toolbar-label">Undo</span>
          </button>
          <button className="icon-button" type="button" data-action="redo" title="Redo" disabled>
            <i className="ph ph-arrow-clockwise" aria-hidden="true" />
            <span className="toolbar-label">Redo</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="repeat-commands"
            title="Repeat commands (Ctrl/Command+Shift+R)"
            disabled
          >
            <i className="ph ph-repeat" aria-hidden="true" />
            <span className="toolbar-label">Repeat</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="clear-repeat-commands"
            title="Clear repeat sequence"
            disabled
          >
            <i className="ph ph-prohibit" aria-hidden="true" />
            <span className="toolbar-label">Clear repeat</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="duplicate"
            title="Duplicate"
            disabled
          >
            <i className="ph ph-copy-simple" aria-hidden="true" />
            <span className="toolbar-label">Duplicate</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="copy"
            title="Copy (Ctrl/Command+C)"
            disabled
          >
            <i className="ph ph-clipboard" aria-hidden="true" />
            <span className="toolbar-label">Copy</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="paste"
            title="Paste (Ctrl/Command+V)"
          >
            <i className="ph ph-clipboard-text" aria-hidden="true" />
            <span className="toolbar-label">Paste</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="paste-here"
            title="Paste at pointer (Ctrl/Command+Shift+V)"
            disabled
          >
            <i className="ph ph-push-pin" aria-hidden="true" />
            <span className="toolbar-label">Paste here</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="delete"
            title="Delete"
            disabled
          >
            <i className="ph ph-trash" aria-hidden="true" />
            <span className="toolbar-label">Delete</span>
          </button>
        </div>
        <span className="toolrail-rule" aria-hidden="true" />
        <div className="toolbar-group visibility-actions" aria-label="Visibility and locking">
          <button
            className="icon-button"
            type="button"
            data-action="hide-selection"
            title="Hide selection"
            disabled
          >
            <i className="ph ph-eye-slash" aria-hidden="true" />
            <span className="toolbar-label">Hide</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="isolate-selection"
            title="Isolate selection"
            disabled
          >
            <i className="ph ph-target" aria-hidden="true" />
            <span className="toolbar-label">Isolate</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="show-all"
            title="Show all hidden objects"
            disabled
          >
            <i className="ph ph-eye" aria-hidden="true" />
            <span className="toolbar-label">Show all</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="lock-selection"
            title="Lock selection"
            disabled
          >
            <i className="ph ph-lock" aria-hidden="true" />
            <span className="toolbar-label">Lock</span>
          </button>
          <button
            className="icon-button"
            type="button"
            data-action="unlock-all"
            title="Unlock all objects"
            disabled
          >
            <i className="ph ph-lock-open" aria-hidden="true" />
            <span className="toolbar-label">Unlock all</span>
          </button>
        </div>
        <span className="toolrail-rule" aria-hidden="true" />
        <label className="tool-select">
          Grid
          <select id="grid-size" aria-label="Grid size" defaultValue={16}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={4}>4</option>
            <option value={8}>8</option>
            <option value={16}>16</option>
            <option value={32}>32</option>
            <option value={64}>64</option>
          </select>
        </label>
        <label className="tool-toggle">
          <input id="texture-lock" type="checkbox" defaultChecked /> Texture lock
        </label>
        <button
          className="view-filter-toggle icon-button"
          type="button"
          data-action="toggle-view-filters"
          aria-expanded="false"
          title="Viewport filters"
        >
          <i className="ph ph-funnel" aria-hidden="true" />
          <span className="toolbar-label">View</span>
          <span id="view-filter-count">0</span>
        </button>
        <span className="toolrail-spacer" />
        <span className="tool-help">
          RMB look · Alt+RMB orbit · MMB pan · WASD/QX fly · Home focus
        </span>
      </section>
    </>
  );
}
