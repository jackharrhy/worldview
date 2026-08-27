import { useSyncExternalStore } from 'react';

import type { EditorShellState } from '../../editor-shell-state.js';

interface MapInspectorProps {
  readonly shellState: EditorShellState;
}

function DocumentSummary({ shellState }: MapInspectorProps) {
  const summary = useSyncExternalStore(
    shellState.documentSummary.subscribe,
    shellState.documentSummary.getSnapshot,
    shellState.documentSummary.getSnapshot,
  );
  const geometryLabel =
    summary.geometryErrorCount === 0 ? 'valid' : `${summary.geometryErrorCount} errors`;

  return (
    <div className="document-section inspector-section">
      <h3>Document</h3>
      <dl className="property-list compact">
        <div>
          <dt>Revision</dt>
          <dd id="document-revision">{summary.revision}</dd>
        </div>
        <div>
          <dt>Entities</dt>
          <dd id="entity-count">{summary.entityCount}</dd>
        </div>
        <div>
          <dt>Brushes</dt>
          <dd id="brush-count">{summary.brushCount}</dd>
        </div>
        <div>
          <dt>Groups</dt>
          <dd id="group-count">{summary.groupCount}</dd>
        </div>
        <div>
          <dt>Hidden</dt>
          <dd id="hidden-object-count">{summary.hiddenObjectCount}</dd>
        </div>
        <div>
          <dt>Locked</dt>
          <dd id="locked-object-count">{summary.lockedObjectCount}</dd>
        </div>
        <div>
          <dt>Geometry</dt>
          <dd
            id="geometry-state"
            className={summary.geometryErrorCount > 0 ? 'error-text' : undefined}
          >
            {geometryLabel}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function MapInspector({ shellState }: MapInspectorProps) {
  return (
    <section data-inspector-panel="map" hidden>
      <div className="panel-heading">
        <h2>Map</h2>
        <span>Valve 220</span>
      </div>
      <div className="layer-section inspector-section">
        <div className="section-heading">
          <h3>Layers</h3>
          <span id="active-layer-name">Default Layer active</span>
        </div>
        <div id="layer-list" className="layer-list" aria-label="Map layers" />
        <div className="layer-create">
          <input
            id="layer-name"
            type="text"
            defaultValue="Layer"
            autoComplete="off"
            spellCheck="false"
            aria-label="New layer name"
          />
          <button type="button" data-action="add-layer">
            Add layer
          </button>
        </div>
        <div className="layer-selection-actions">
          <button type="button" data-action="move-selection-to-layer">
            Move selection
          </button>
          <button type="button" data-action="select-layer">
            Select contents
          </button>
          <button type="button" data-action="isolate-layer">
            Isolate
          </button>
          <button type="button" data-action="remove-layer">
            Remove
          </button>
          <button type="button" data-action="layer-up" aria-label="Move selected layer up">
            Move up
          </button>
          <button type="button" data-action="layer-down" aria-label="Move selected layer down">
            Move down
          </button>
        </div>
        <div className="layer-global-actions">
          <button type="button" data-action="show-all-layers">
            Show all
          </button>
          <button type="button" data-action="hide-all-layers">
            Hide all
          </button>
          <button type="button" data-action="unlock-all-layers">
            Unlock all
          </button>
          <button type="button" data-action="lock-all-layers">
            Lock all
          </button>
        </div>
        <p>
          New and pasted top-level objects go to the active layer. Hidden and locked layers are
          excluded from picking; omitted layers stay in source but are removed from compile export.
        </p>
      </div>
      <DocumentSummary shellState={shellState} />
      <div className="entity-link-section inspector-section">
        <div className="section-heading">
          <h3>Entity links</h3>
          <span id="entity-link-count">0 / 0 shown</span>
        </div>
        <label className="entity-link-mode">
          Visibility
          <select id="entity-link-mode" defaultValue="direct">
            <option value="all">All</option>
            <option value="transitive">Transitive selected</option>
            <option value="direct">Direct selected</option>
            <option value="none">None</option>
          </select>
        </label>
        <p>
          Resolved target and killtarget links render as directed arrows. Links touching the
          selection are red; other visible links are green.
        </p>
      </div>
      <div className="reference-section inspector-section">
        <div className="section-heading">
          <h3>References</h3>
          <span id="reference-count">0 loaded</span>
        </div>
        <div className="reference-actions">
          <button type="button" data-action="load-reference">
            Load map
          </button>
          <button type="button" data-action="snapshot-reference">
            Snapshot
          </button>
          <button type="button" data-action="clear-references" disabled>
            Clear
          </button>
        </div>
        <div id="reference-list" className="reference-list" />
        <p>Reference maps render in blue and are excluded from selection and export.</p>
      </div>
    </section>
  );
}
