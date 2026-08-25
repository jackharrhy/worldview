import {
  BUILTIN_POINT_ENTITY_DEFINITIONS,
  EDITOR_ISSUE_TYPE_INFO,
  EDITOR_SPECIAL_BRUSH_FILTER_INFO,
} from '@jackharrhy/worldview-editor';

function toolbarIcon(name: string, label: string): string {
  return `<i class="ph ph-${name}" aria-hidden="true"></i><span class="toolbar-label">${label}</span>`;
}

/** Static application chrome kept separate from the editor's state and command wiring. */
export function renderEditorShell(): string {
  return `
  <main class="editor-shell">
    <header class="topbar">
      <div class="brand-lockup">
        <div class="wordmark">WORLDVIEW</div>
        <span id="document-name" class="document-name">untitled.map</span>
      </div>
      <nav class="top-actions" aria-label="Document actions">
        <div class="toolbar-group" aria-label="Files">
          <button class="icon-button" type="button" data-action="new" title="New map">${toolbarIcon('file-plus', 'New')}</button>
          <button class="icon-button" type="button" data-action="open-file" title="Open map">${toolbarIcon('folder-open', 'Open')}</button>
          <button class="icon-button" type="button" data-action="open-project" title="Open project directory">${toolbarIcon('folders', 'Project')}</button>
          <button class="icon-button" type="button" data-action="download" title="Save map">${toolbarIcon('floppy-disk', 'Save')}</button>
        </div>
        <select id="project-map" aria-label="Project map" hidden></select>
        <div class="toolbar-group secondary-actions" aria-label="Document history and source">
          <button class="icon-button" type="button" data-action="export-normalized" title="Export normalized copy">${toolbarIcon('export', 'Export normalized')}</button>
          <button class="icon-button" type="button" data-action="checkpoint" title="Create recovery checkpoint">${toolbarIcon('bookmark-simple', 'Checkpoint')}</button>
          <button class="icon-button" type="button" data-action="versions" title="Recovery versions">${toolbarIcon('clock-counter-clockwise', 'Versions')}</button>
          <button class="icon-button" type="button" data-action="show-source" title="Edit map source">${toolbarIcon('code', 'Source')}</button>
        </div>
        <div class="toolbar-group build-actions" aria-label="Build">
          <select id="build-profile" aria-label="Build profile" hidden></select>
          <button class="icon-button" type="button" data-action="compile" title="Compile map">${toolbarIcon('hammer', 'Compile')}</button>
          <button class="icon-button" type="button" data-action="toggle-preview" title="Toggle compiled preview" disabled>${toolbarIcon('monitor-play', 'Preview')}</button>
          <button class="icon-button" type="button" data-action="toggle-leak" title="Toggle leak path" disabled>${toolbarIcon('warning', 'Leak')}</button>
          <button class="icon-button" type="button" data-action="toggle-portals" title="Toggle portals" disabled>${toolbarIcon('intersect-three', 'Portals')}</button>
          <button class="icon-button" type="button" data-action="build-log" title="Build diagnostics" disabled>${toolbarIcon('terminal-window', 'Log')}</button>
          <button class="icon-button" type="button" data-action="launch" title="Launch external game" disabled>${toolbarIcon('rocket-launch', 'Launch')}</button>
        </div>
      </nav>
      <button class="inspector-toggle icon-button" type="button" data-action="toggle-inspector" aria-pressed="true" title="Toggle inspector">${toolbarIcon('sidebar', 'Inspector')}</button>
      <input id="map-file" type="file" accept=".map,.txt" hidden>
      <input id="reference-files" type="file" accept=".map" multiple hidden>
    </header>

    <section class="toolrail" aria-label="Editor tools">
      <div class="toolbar-group tool-group" aria-label="Modes">
        <button class="tool-button icon-button active" type="button" data-tool="select" aria-pressed="true" title="Select objects">${toolbarIcon('cursor', 'Select')}</button>
        <button class="tool-button icon-button" type="button" data-tool="create" aria-pressed="false" title="Create brush">${toolbarIcon('cube', 'Brush')}</button>
        <button class="tool-button icon-button" type="button" data-tool="entity" aria-pressed="false" title="Place entity">${toolbarIcon('user-square', 'Entity')}</button>
        <button class="tool-button icon-button" type="button" data-tool="hull" aria-pressed="false" title="Build convex hull">${toolbarIcon('polygon', 'Hull')}</button>
        <button class="tool-button icon-button" type="button" data-tool="face" aria-pressed="false" title="Edit faces">${toolbarIcon('square', 'Face')}</button>
        <button class="tool-button icon-button" type="button" data-tool="sweep" aria-pressed="false" title="Sweep selection">${toolbarIcon('flow-arrow', 'Sweep')}</button>
        <button class="tool-button icon-button" type="button" data-tool="clip" aria-pressed="false" title="Clip brushes">${toolbarIcon('scissors', 'Clip')}</button>
        <button class="tool-button icon-button" type="button" data-tool="vertex" aria-pressed="false" title="Edit vertices">${toolbarIcon('vector-three', 'Vertex')}</button>
        <button class="tool-button icon-button" type="button" data-tool="edge" aria-pressed="false" title="Edit edges">${toolbarIcon('line-segment', 'Edge')}</button>
        <button class="tool-button icon-button" type="button" data-tool="rotate" aria-pressed="false" title="Rotate selection">${toolbarIcon('arrow-clockwise', 'Rotate')}</button>
        <button class="tool-button icon-button" type="button" data-tool="scale" aria-pressed="false" title="Scale selection">${toolbarIcon('arrows-out', 'Scale')}</button>
        <button class="tool-button icon-button" type="button" data-tool="shear" aria-pressed="false" title="Shear selection">${toolbarIcon('perspective', 'Shear')}</button>
      </div>
      <span class="toolrail-rule" aria-hidden="true"></span>
      <div class="toolbar-group selection-actions" aria-label="Selection and history">
        <button class="icon-button" type="button" data-action="focus-selection" title="Frame selection (Home)" disabled>${toolbarIcon('crosshair', 'Focus')}</button>
        <button class="icon-button" type="button" data-action="select-all" title="Select all (Ctrl/Command+A)">${toolbarIcon('selection-all', 'All')}</button>
        <button class="icon-button" type="button" data-action="invert-selection" title="Invert selection (Ctrl/Command+Shift+A)">${toolbarIcon('selection-inverse', 'Invert')}</button>
        <button class="icon-button" type="button" data-action="undo" title="Undo" disabled>${toolbarIcon('arrow-counter-clockwise', 'Undo')}</button>
        <button class="icon-button" type="button" data-action="redo" title="Redo" disabled>${toolbarIcon('arrow-clockwise', 'Redo')}</button>
        <button class="icon-button" type="button" data-action="repeat-commands" title="Repeat commands (Ctrl/Command+Shift+R)" disabled>${toolbarIcon('repeat', 'Repeat')}</button>
        <button class="icon-button" type="button" data-action="clear-repeat-commands" title="Clear repeat sequence" disabled>${toolbarIcon('prohibit', 'Clear repeat')}</button>
        <button class="icon-button" type="button" data-action="duplicate" title="Duplicate" disabled>${toolbarIcon('copy-simple', 'Duplicate')}</button>
        <button class="icon-button" type="button" data-action="copy" title="Copy (Ctrl/Command+C)" disabled>${toolbarIcon('clipboard', 'Copy')}</button>
        <button class="icon-button" type="button" data-action="paste" title="Paste (Ctrl/Command+V)">${toolbarIcon('clipboard-text', 'Paste')}</button>
        <button class="icon-button" type="button" data-action="paste-here" title="Paste at pointer (Ctrl/Command+Shift+V)" disabled>${toolbarIcon('push-pin', 'Paste here')}</button>
        <button class="icon-button" type="button" data-action="delete" title="Delete" disabled>${toolbarIcon('trash', 'Delete')}</button>
      </div>
      <span class="toolrail-rule" aria-hidden="true"></span>
      <div class="toolbar-group visibility-actions" aria-label="Visibility and locking">
        <button class="icon-button" type="button" data-action="hide-selection" title="Hide selection" disabled>${toolbarIcon('eye-slash', 'Hide')}</button>
        <button class="icon-button" type="button" data-action="isolate-selection" title="Isolate selection" disabled>${toolbarIcon('target', 'Isolate')}</button>
        <button class="icon-button" type="button" data-action="show-all" title="Show all hidden objects" disabled>${toolbarIcon('eye', 'Show all')}</button>
        <button class="icon-button" type="button" data-action="lock-selection" title="Lock selection" disabled>${toolbarIcon('lock', 'Lock')}</button>
        <button class="icon-button" type="button" data-action="unlock-all" title="Unlock all objects" disabled>${toolbarIcon('lock-open', 'Unlock all')}</button>
      </div>
      <span class="toolrail-rule" aria-hidden="true"></span>
      <label class="tool-select">Grid
        <select id="grid-size" aria-label="Grid size">
          <option value="1">1</option><option value="2">2</option><option value="4">4</option>
          <option value="8">8</option><option value="16" selected>16</option>
          <option value="32">32</option><option value="64">64</option>
        </select>
      </label>
      <label class="tool-toggle"><input id="texture-lock" type="checkbox" checked> Texture lock</label>
      <button class="view-filter-toggle icon-button" type="button" data-action="toggle-view-filters" aria-expanded="false" title="Viewport filters">${toolbarIcon('funnel', 'View')}<span id="view-filter-count">0</span></button>
      <span class="toolrail-spacer"></span>
      <span class="tool-help">RMB look · Alt+RMB orbit · MMB pan · WASD/QX fly · Home focus</span>
    </section>

    <dialog id="build-log-dialog" class="build-log-dialog">
      <header><strong>Build diagnostics</strong><select id="build-history" aria-label="Build history"></select><button type="button" data-action="close-build-log">Close</button></header>
      <pre id="build-log-output"></pre>
    </dialog>
    <dialog id="recovery-dialog" class="build-log-dialog recovery-dialog">
      <header><strong>Recovery versions</strong><button type="button" data-action="close-recovery">Close</button></header>
      <div id="recovery-list" class="recovery-list"></div>
    </dialog>

    <aside id="view-filter-popover" class="view-filter-popover" aria-label="Viewport filters" hidden>
      <header><div><strong>View filters</strong><span>Non-serialized</span></div><button type="button" data-action="close-view-filters">Close</button></header>
      <div class="view-filter-scroll">
        <section class="view-filter-section">
          <div class="view-filter-heading"><strong>Brushes</strong><span>Special types</span></div>
          <label class="view-filter-row"><input id="show-world-brushes" type="checkbox" checked><span><b>World brushes</b><small>Structural geometry in worldspawn, groups, and layers</small></span></label>
          ${EDITOR_SPECIAL_BRUSH_FILTER_INFO.map((entry) => `<label class="view-filter-row"><input type="checkbox" data-special-brush-filter="${entry.type}" checked><span><b>${entry.label}</b><small>${entry.description}</small></span></label>`).join('')}
        </section>
        <section class="view-filter-section entity-class-filter-section">
          <div class="view-filter-heading"><strong>Entity definitions</strong><span id="entity-class-filter-summary">0 classes</span></div>
          <div class="view-filter-entity-actions"><input id="entity-class-filter-search" type="search" placeholder="Filter classnames" aria-label="Filter entity classnames"><button type="button" data-action="show-all-entity-classes">All</button><button type="button" data-action="hide-all-entity-classes">None</button></div>
          <div id="entity-class-filter-list" class="entity-class-filter-list"></div>
        </section>
      </div>
      <footer id="view-filter-status">0 objects filtered · map source unchanged</footer>
    </aside>

    <section class="workspace">
      <section class="viewport-grid" aria-label="Map viewports">
        <article class="viewport-pane" data-viewport="xy">
          <header><strong>TOP</strong><span>XY</span></header>
          <canvas class="source-canvas" aria-label="Top XY map viewport"></canvas>
        </article>
        <article class="viewport-pane perspective" data-viewport="perspective">
          <header><strong>PERSPECTIVE</strong><span id="perspective-mode">EDIT</span></header>
          <canvas class="source-canvas" aria-label="Perspective map viewport"></canvas>
          <canvas class="compiled-canvas" aria-label="Compiled BSP preview" hidden></canvas>
        </article>
        <article class="viewport-pane" data-viewport="xz">
          <header><strong>FRONT</strong><span>XZ</span></header>
          <canvas class="source-canvas" aria-label="Front XZ map viewport"></canvas>
        </article>
        <article class="viewport-pane" data-viewport="yz">
          <header><strong>SIDE</strong><span>YZ</span></header>
          <canvas class="source-canvas" aria-label="Side YZ map viewport"></canvas>
        </article>
        <div class="viewport-error" hidden></div>
      </section>

      <aside class="inspector panel" aria-label="Inspector">
        <div class="inspector-tabs" role="tablist" aria-label="Inspector pages">
          <button class="active" type="button" role="tab" data-inspector-tab="object" aria-selected="true">Object</button>
          <button type="button" role="tab" data-inspector-tab="textures" aria-selected="false">Textures</button>
          <button type="button" role="tab" data-inspector-tab="map" aria-selected="false">Map</button>
        </div>
        <div class="inspector-scroll">
          <section data-inspector-panel="object">
            <div class="panel-heading">
              <h2>Selection</h2>
              <span id="selection-kind">None</span>
            </div>
            <div id="selection-empty" class="empty-selection">Select a brush or face in any view.</div>
            <div id="point-entity-tool-section" class="point-entity-tool-section inspector-section" hidden>
              <div class="section-heading"><h3>Point entity</h3><span>Click to place</span></div>
              <label>Preset<select id="point-entity-preset">${BUILTIN_POINT_ENTITY_DEFINITIONS.map((definition) => `<option value="${definition.classname}">${definition.label}</option>`).join('')}</select></label>
              <label>Classname<input id="point-entity-classname" type="text" value="light" autocomplete="off" spellcheck="false"></label>
              <p>Click a brush surface in 3D to drop the entity against it. In a 2D view, visible axes come from the click and the hidden axis follows the latest selection.</p>
            </div>
            <div id="simple-shape-tool-section" class="simple-shape-tool-section inspector-section" hidden>
              <div class="section-heading"><h3>Simple shape</h3><span id="simple-shape-result">Drag to draw</span></div>
              <div class="simple-shape-primary">
                <label>Shape<select id="simple-shape-kind"><option value="cuboid">Cuboid</option><option value="stairs">Stairs</option><option value="arch">Arch</option><option value="cylinder">Cylinder</option><option value="cone">Cone</option><option value="uv-sphere">Spheroid (UV)</option><option value="ico-sphere">Spheroid (Icosahedron)</option></select></label>
                <label data-shape-field="axis">Axis<select id="simple-shape-axis"><option value="0">X</option><option value="1">Y</option><option value="2" selected>Z</option></select></label>
              </div>
              <div id="simple-shape-circle-fields" class="simple-shape-fields" hidden>
                <label>Sides<input id="simple-shape-sides" type="number" value="8" min="3" max="96" step="1"></label>
                <label>Circle<select id="simple-shape-circle-mode"><option value="edge-aligned">Edge aligned</option><option value="vertex-aligned">Vertex aligned</option><option value="scalable">Scalable grid</option></select></label>
              </div>
              <div id="simple-shape-hollow-fields" class="simple-shape-fields" hidden>
                <label class="simple-shape-check"><input id="simple-shape-hollow" type="checkbox"> Hollow</label>
                <label>Thickness<input id="simple-shape-thickness" type="number" value="16" min="1" max="1024" step="1"></label>
              </div>
              <div id="simple-shape-uv-fields" class="simple-shape-fields" hidden>
                <label>Rings<input id="simple-shape-rings" type="number" value="8" min="1" max="32" step="1"></label>
              </div>
              <div id="simple-shape-ico-fields" class="simple-shape-fields" hidden>
                <label>Accuracy<input id="simple-shape-accuracy" type="number" value="1" min="1" max="3" step="1"></label>
              </div>
              <div id="simple-shape-stair-fields" class="simple-shape-fields" hidden>
                <label>Step height<input id="simple-shape-step-height" type="number" value="16" min="1" max="1024" step="1"></label>
                <label>Direction<select id="simple-shape-stair-direction"><option value="positive-x">+X</option><option value="negative-x">−X</option><option value="positive-y">+Y</option><option value="negative-y">−Y</option></select></label>
              </div>
              <p>Drag in any viewport for a live preview. Shift makes the visible axes equal; Shift+Alt makes a cube in 3D. After starting a 3D drag, hold Alt to adjust only its height.</p>
            </div>
            <div id="hull-tool-section" class="hull-tool-section inspector-section" hidden>
              <div class="section-heading"><h3>Convex hull brush</h3><span id="hull-point-count">0 points</span></div>
              <div class="hull-actions">
                <button type="button" data-action="create-hull" disabled>Create hull</button>
                <button type="button" data-action="discard-hull" disabled>Discard points</button>
              </div>
              <p>Perspective only: click a reference face for one point, double-click for all face vertices, or drag a rectangle. Shift-drag a placed polygon along its normal. Enter creates; Escape discards everything.</p>
            </div>
            <div id="selection-inspector" hidden>
              <dl class="property-list">
                <div><dt>Brush</dt><dd id="brush-id"></dd></div>
                <div><dt>Revision</dt><dd id="brush-revision"></dd></div>
                <div><dt>Faces</dt><dd id="brush-faces"></dd></div>
                <div><dt>Bounds</dt><dd id="brush-bounds"></dd></div>
                <div><dt>Material</dt><dd id="face-material"></dd></div>
              </dl>
              <div id="group-section" class="group-section inspector-section" hidden>
                <div class="section-heading"><h3>Group</h3><span id="group-state">Selection</span></div>
                <label>Name<input id="group-name" type="text" value="Group" autocomplete="off" spellcheck="false"></label>
                <div class="group-actions">
                  <button type="button" data-action="create-group">Group selection</button>
                  <button type="button" data-action="rename-group" hidden>Rename</button>
                  <button type="button" data-action="open-group" hidden>Open</button>
                  <button type="button" data-action="close-group" hidden>Close</button>
                  <button type="button" data-action="create-linked-duplicate" hidden>Linked duplicate</button>
                  <button type="button" data-action="unlink-group" hidden>Unlink</button>
                  <button type="button" data-action="ungroup" hidden>Ungroup</button>
                </div>
                <p>Closed groups select and transform as one object. Linked duplicates keep reusable copies synchronized; purple arrows show affected siblings. Double-click or Open to edit members, with everything outside locked.</p>
              </div>
              <div id="selection-brush-section" class="selection-brush-section inspector-section" hidden>
                <div class="section-heading"><h3>Selection brush</h3><span id="selection-brush-count">1 volume</span></div>
                <div class="selection-brush-actions">
                  <button type="button" data-selection-query="touching">Touching</button>
                  <button type="button" data-selection-query="inside">Enclosed</button>
                  <button type="button" data-selection-query="inside-projected">Enclosed in 2D</button>
                </div>
                <p>Consumes the selected structural brushes and selects editable objects touching them, fully enclosed by them, or enclosed by their projection in the last pointed 2D view.</p>
              </div>
              <div id="object-flip-section" class="object-flip-section inspector-section" hidden>
                <div class="section-heading"><h3>Mirror selection</h3><span>Snapped center</span></div>
                <div class="object-flip-controls" role="group" aria-label="Mirror selection by world axis">
                  <button type="button" data-flip-axis="0">Flip X</button>
                  <button type="button" data-flip-axis="1">Flip Y</button>
                  <button type="button" data-flip-axis="2">Flip Z</button>
                </div>
              </div>
              <div id="face-extrude-section" class="face-extrude-section inspector-section" hidden>
                <div class="section-heading"><h3>Face extrusion</h3><span id="face-normal"></span></div>
                <div class="face-extrude-controls">
                  <input id="face-extrude-distance" type="number" value="16" step="16" aria-label="Face extrusion distance">
                  <button type="button" data-action="extrude-inward">Inward</button>
                  <button type="button" data-action="extrude-outward">Outward</button>
                  <button type="button" data-action="extrude-exact">Apply</button>
                  <button type="button" data-action="split-face">Split</button>
                  <button type="button" data-action="stamp-face">Stamp</button>
                </div>
                <p>In Face, drag the center handle or use Arrow keys on the pointed viewport; Escape clears face handles before leaving the tool. In Select, Shift-drag a face of an already selected brush. Add Alt to move on the viewport plane, Ctrl/Command to split, or both to stamp.</p>
              </div>
              <div id="sweep-tool-section" class="sweep-tool-section inspector-section" hidden>
                <div class="section-heading"><h3>Sweep selected faces</h3><span id="sweep-generated-count">0 brushes</span></div>
                <h4>Destination translation</h4>
                <div class="transform-vector">
                  <label>X<input id="sweep-translate-x" type="number" value="0" step="16"></label>
                  <label>Y<input id="sweep-translate-y" type="number" value="0" step="16"></label>
                  <label>Z<input id="sweep-translate-z" type="number" value="64" step="16"></label>
                </div>
                <h4>Destination rotation</h4>
                <div class="transform-vector">
                  <label>X<input id="sweep-rotate-x" type="number" value="0" step="5"></label>
                  <label>Y<input id="sweep-rotate-y" type="number" value="0" step="5"></label>
                  <label>Z<input id="sweep-rotate-z" type="number" value="0" step="5"></label>
                </div>
                <div class="sweep-shape-fields">
                  <label>Scale<input id="sweep-scale" type="number" value="1" min="0.05" max="20" step="0.05"></label>
                  <label>Path<select id="sweep-path"><option value="straight">Straight</option><option value="arc">Arc</option><option value="s-bend">S-bend</option></select></label>
                  <label>Segments<input id="sweep-segments" type="number" value="4" min="1" max="128" step="1"></label>
                  <label>Iterations<input id="sweep-iterations" type="number" value="1" min="1" max="64" step="1"></label>
                </div>
                <label class="sweep-snap-toggle"><input id="sweep-snap" type="checkbox"> Snap generated vertices to integers</label>
                <div class="sweep-actions">
                  <button type="button" data-action="reset-sweep">Reset</button>
                  <button type="button" data-action="apply-sweep">Apply Sweep</button>
                </div>
                <p>3D only: drag the yellow center to move (Alt for Z), colored rings to rotate, or the green handle to scale. Shift constrains movement or rotates in 5° steps. Enter applies; Escape resets, then exits.</p>
              </div>
              <div id="clip-tool-section" class="clip-tool-section inspector-section" hidden>
                <div class="section-heading"><h3>Clip plane</h3><span id="clip-point-count">0 / 3 points</span></div>
                <p id="clip-point-positions">No clip points.</p>
                <div class="clip-mode-controls" role="group" aria-label="Clip result">
                  <button class="active" type="button" data-clip-mode="back" aria-pressed="true">Keep back</button>
                  <button type="button" data-clip-mode="split" aria-pressed="false">Split</button>
                  <button type="button" data-clip-mode="front" aria-pressed="false">Keep front</button>
                </div>
                <div class="clip-actions">
                  <button type="button" data-action="apply-clip" disabled>Apply clip</button>
                  <button type="button" data-action="reset-clip">Reset points</button>
                </div>
                <p>Click two or three snapped points in any viewport. Drag to place two points or reposition an orange point; Shift locks its dominant axis in 2D. Double-click a face to match its plane.</p>
              </div>
              <div id="transform-tool-section" class="transform-tool-section inspector-section" hidden>
                <div class="section-heading"><h3 id="transform-tool-title">Transform</h3><button type="button" data-action="reset-transform-pivot">Reset pivot</button></div>
                <div class="transform-vector transform-pivot">
                  <label>X<input id="transform-pivot-x" type="number" step="1"></label>
                  <label>Y<input id="transform-pivot-y" type="number" step="1"></label>
                  <label>Z<input id="transform-pivot-z" type="number" step="1"></label>
                </div>
                <div data-transform-panel="rotate" hidden>
                  <div class="transform-fields">
                    <label>Axis<select id="rotate-axis"><option value="0">X</option><option value="1">Y</option><option value="2" selected>Z</option></select></label>
                    <label>Angle<input id="rotate-angle" type="number" value="15" step="5"></label>
                  </div>
                  <label class="transform-angle-toggle"><input id="rotate-update-entity-angles" type="checkbox" checked> Update entity angles</label>
                </div>
                <div data-transform-panel="scale" hidden>
                  <div class="transform-vector">
                    <label>X<input id="scale-x" type="number" value="1" step="0.05"></label>
                    <label>Y<input id="scale-y" type="number" value="1" step="0.05"></label>
                    <label>Z<input id="scale-z" type="number" value="1" step="0.05"></label>
                  </div>
                </div>
                <div data-transform-panel="shear" hidden>
                  <div class="transform-fields transform-shear-fields">
                    <label>Plane axis<select id="shear-source-axis"><option value="0">X</option><option value="1">Y</option><option value="2" selected>Z</option></select></label>
                    <label>Move axis<select id="shear-target-axis"><option value="0" selected>X</option><option value="1">Y</option><option value="2">Z</option></select></label>
                    <label>Offset<input id="shear-offset" type="number" value="16" step="16"></label>
                  </div>
                </div>
                <button class="transform-apply" type="button" data-action="apply-transform">Apply transform</button>
                <p id="transform-tool-help">Drag the viewport handle for a live snapped preview.</p>
              </div>
              <div id="topology-tool-section" class="topology-tool-section inspector-section" hidden>
                <div class="section-heading"><h3 id="topology-tool-title">Vertex editing</h3><span><b id="topology-selection-count">0</b> selected · Grid <b id="topology-grid-size">16</b></span></div>
                <p id="topology-tool-help">Click or lasso yellow handles across the selected brushes. Ctrl/Command adds handles or toggles absolute vertex snapping during a drag. Shift+Alt-click another vertex to quick-snap the selection; Arrow keys nudge it on the active viewport axes. In 3D, Alt moves vertically and Shift locks the dominant axis. Shift-drag a green surface handle to add a vertex. Delete remains hull-safe; Escape clears handles before leaving the tool.</p>
              </div>
              <div id="csg-section" class="csg-section inspector-section" hidden>
                <div class="section-heading"><h3>Constructive geometry</h3><span id="csg-selection-count"></span></div>
                <div class="csg-controls">
                  <button type="button" data-action="csg-merge">Convex merge</button>
                  <button type="button" data-action="csg-intersect">Intersect</button>
                  <button type="button" data-action="csg-subtract">Subtract</button>
                  <button type="button" data-action="csg-hollow">Hollow</button>
                </div>
                <p>Subtract uses the selection as cutters against every other brush. Hollow uses the current grid size for wall thickness.</p>
              </div>
              <div id="entity-section" class="entity-section inspector-section">
                <div class="section-heading"><h3>Entity properties</h3><span id="entity-classname"></span></div>
                <div id="brush-entity-actions" class="brush-entity-actions" hidden>
                  <input id="brush-entity-classname" type="text" value="func_detail" aria-label="Brush entity classname" autocomplete="off" spellcheck="false">
                  <button type="button" data-action="make-brush-entity">Make Entity</button>
                  <button type="button" data-action="make-structural">Make Structural</button>
                </div>
                <div id="entity-properties" class="entity-properties"></div>
                <div class="entity-property-add">
                  <input id="entity-property-key" type="text" placeholder="Key" autocomplete="off">
                  <input id="entity-property-value" type="text" placeholder="Value" autocomplete="off">
                  <label id="entity-property-protected-label" class="entity-property-protected" hidden><input id="entity-property-protected" type="checkbox"> Protected</label>
                  <button type="button" data-action="set-entity-property">Add</button>
                </div>
              </div>
              <div class="transform-section inspector-section">
                <h3>Nudge by grid</h3>
                <div class="nudge-grid">
                  <span>X</span><button type="button" data-nudge-axis="0" data-nudge-direction="-1">−</button><button type="button" data-nudge-axis="0" data-nudge-direction="1">+</button>
                  <span>Y</span><button type="button" data-nudge-axis="1" data-nudge-direction="-1">−</button><button type="button" data-nudge-axis="1" data-nudge-direction="1">+</button>
                  <span>Z</span><button type="button" data-nudge-axis="2" data-nudge-direction="-1">−</button><button type="button" data-nudge-axis="2" data-nudge-direction="1">+</button>
                </div>
              </div>
            </div>
          </section>

          <section data-inspector-panel="textures" hidden>
            <div class="panel-heading"><h2>Face</h2><span>Valve 220</span></div>
            <div class="texture-section inspector-section">
              <div class="uv-editor-heading"><h3>UV editor</h3><button id="uv-reset-pivot" type="button">Center origin</button></div>
              <div class="uv-editor-frame">
                <svg id="uv-editor" viewBox="0 0 320 220" role="application" aria-label="Selected face UV editor" tabindex="0"></svg>
              </div>
              <div class="uv-editor-status"><span id="uv-editor-status">No editable UV projection</span><span>U <b>red</b> · V <b>green</b></span></div>
              <p class="uv-editor-help">Drag the face to pan the material, the outer ring to rotate, or the red and green handles to scale U or V. Shift gives fine rotation or proportional scaling. Drag the yellow origin to set the transform pivot; it snaps to the face center and vertices. Escape cancels a live transform.</p>
              <h3>Texture projection</h3>
              <div class="texture-fields">
                <label>Shift U<input id="texture-shift-u" type="number" step="1"></label>
                <label>Shift V<input id="texture-shift-v" type="number" step="1"></label>
                <label>Scale U<input id="texture-scale-u" type="number" step="0.05"></label>
                <label>Scale V<input id="texture-scale-v" type="number" step="0.05"></label>
                <label>Rotation<input id="texture-rotation" type="number" step="1"></label>
                <button type="button" data-action="apply-texture-transform">Apply</button>
              </div>
              <dl class="texture-axes">
                <div><dt>U axis</dt><dd id="texture-u-axis"></dd></div>
                <div><dt>V axis</dt><dd id="texture-v-axis"></dd></div>
              </dl>
              <div class="texture-alignment-controls" role="group" aria-label="Texture alignment">
                <button type="button" data-texture-align="reset">Reset face</button>
                <button type="button" data-texture-align="world">Reset world</button>
                <button type="button" data-texture-align="flip-u">Flip U</button>
                <button type="button" data-texture-align="flip-v">Flip V</button>
                <button type="button" data-texture-align="rotate-ccw">Rotate +90°</button>
                <button type="button" data-texture-align="rotate-cw">Rotate −90°</button>
              </div>
              <h4 class="texture-layout-title">Face bounds</h4>
              <div class="texture-justify-controls" role="group" aria-label="Texture justification">
                <button type="button" data-texture-layout="justify-v-min">Top</button>
                <button type="button" data-texture-layout="justify-u-min">Left</button>
                <button type="button" data-texture-layout="auto-fit">Auto fit</button>
                <button type="button" data-texture-layout="justify-u-max">Right</button>
                <button type="button" data-texture-layout="justify-v-max">Bottom</button>
              </div>
              <div class="texture-fit-controls" role="group" aria-label="Texture edge alignment and fit">
                <button type="button" data-texture-layout="align-edge">Align edge</button>
                <button type="button" data-texture-layout="fit-u">Fit U</button>
                <button type="button" data-texture-layout="fit-v">Fit V</button>
              </div>
              <p class="texture-layout-help">Repeat to cycle edges, atlas slots, or integer fits. Shift cycles backward; Ctrl/Command fits 1/n subdivisions.</p>
              <p class="texture-transfer-help"><b>3D transfer:</b> select a source face, then Alt-click to project all attributes, Alt+Shift-click to rotate alignment onto the target, or Alt+Ctrl/Command-click for material only. Drag paints a chain; double-click affects the whole target brush.</p>
            </div>
            <div class="material-section inspector-section">
              <div class="section-heading"><h3>Materials</h3><span id="material-count">0 loaded</span></div>
              <div class="material-actions">
                <button type="button" data-action="load-wad">Load WAD</button>
                <button type="button" data-action="load-palette">Palette</button>
                <input id="wad-files" type="file" accept=".wad" multiple hidden>
                <input id="palette-file" type="file" accept=".lmp,.pal,.dat" hidden>
              </div>
              <input id="material-filter" class="tool-input" type="search" placeholder="Filter materials" autocomplete="off">
              <div class="material-browser-options">
                <label>Sort<select id="material-sort"><option value="name">Name</option><option value="usage">Usage</option></select></label>
                <label class="material-used-only"><input id="material-used-only" type="checkbox"> In use</label>
              </div>
              <div id="material-grid" class="material-grid" aria-label="Loaded materials"></div>
              <div class="material-apply">
                <input id="material-name" class="tool-input" type="text" placeholder="Material token" autocomplete="off">
                <button type="button" data-action="sample-material">Sample</button>
                <button type="button" data-action="apply-material">Apply</button>
              </div>
              <div class="material-usage-actions" role="group" aria-label="Material usage selection">
                <button type="button" data-action="select-material-faces">Select faces</button>
                <button type="button" data-action="select-material-brushes">Select brushes</button>
                <button type="button" data-action="set-material-replace-source">Use as find</button>
                <button type="button" data-action="set-material-replace-target">Use as replacement</button>
              </div>
              <div class="material-replace">
                <label>Find<input id="material-replace-source" class="tool-input" type="text" autocomplete="off"></label>
                <label>Replace<input id="material-replace-target" class="tool-input" type="text" autocomplete="off"></label>
                <button type="button" data-action="replace-material">Replace</button>
              </div>
              <p id="material-replace-scope" class="material-replace-scope">No selection: replace across the whole map.</p>
              <p id="material-coverage" class="material-coverage" hidden></p>
              <p id="material-message" class="material-message">WAD assets stay in memory and are not embedded in map source.</p>
            </div>
          </section>

          <section data-inspector-panel="map" hidden>
            <div class="panel-heading"><h2>Map</h2><span>Valve 220</span></div>
            <div class="layer-section inspector-section">
              <div class="section-heading"><h3>Layers</h3><span id="active-layer-name">Default Layer active</span></div>
              <div id="layer-list" class="layer-list" aria-label="Map layers"></div>
              <div class="layer-create">
                <input id="layer-name" type="text" value="Layer" autocomplete="off" spellcheck="false" aria-label="New layer name">
                <button type="button" data-action="add-layer">Add layer</button>
              </div>
              <div class="layer-selection-actions">
                <button type="button" data-action="move-selection-to-layer">Move selection</button>
                <button type="button" data-action="select-layer">Select contents</button>
                <button type="button" data-action="isolate-layer">Isolate</button>
                <button type="button" data-action="remove-layer">Remove</button>
                <button type="button" data-action="layer-up" aria-label="Move selected layer up">Move up</button>
                <button type="button" data-action="layer-down" aria-label="Move selected layer down">Move down</button>
              </div>
              <div class="layer-global-actions">
                <button type="button" data-action="show-all-layers">Show all</button>
                <button type="button" data-action="hide-all-layers">Hide all</button>
                <button type="button" data-action="unlock-all-layers">Unlock all</button>
                <button type="button" data-action="lock-all-layers">Lock all</button>
              </div>
              <p>New and pasted top-level objects go to the active layer. Hidden and locked layers are excluded from picking; omitted layers stay in source but are removed from compile export.</p>
            </div>
            <div class="document-section inspector-section">
              <h3>Document</h3>
              <dl class="property-list compact">
                <div><dt>Revision</dt><dd id="document-revision">0</dd></div>
                <div><dt>Entities</dt><dd id="entity-count">0</dd></div>
                <div><dt>Brushes</dt><dd id="brush-count">0</dd></div>
                <div><dt>Groups</dt><dd id="group-count">0</dd></div>
                <div><dt>Hidden</dt><dd id="hidden-object-count">0</dd></div>
                <div><dt>Locked</dt><dd id="locked-object-count">0</dd></div>
                <div><dt>Geometry</dt><dd id="geometry-state">valid</dd></div>
              </dl>
            </div>
            <div class="entity-link-section inspector-section">
              <div class="section-heading"><h3>Entity links</h3><span id="entity-link-count">0 / 0 shown</span></div>
              <label class="entity-link-mode">Visibility<select id="entity-link-mode"><option value="all">All</option><option value="transitive">Transitive selected</option><option value="direct" selected>Direct selected</option><option value="none">None</option></select></label>
              <p>Resolved target and killtarget links render as directed arrows. Links touching the selection are red; other visible links are green.</p>
            </div>
            <div class="reference-section inspector-section">
              <div class="section-heading"><h3>References</h3><span id="reference-count">0 loaded</span></div>
              <div class="reference-actions">
                <button type="button" data-action="load-reference">Load map</button>
                <button type="button" data-action="snapshot-reference">Snapshot</button>
                <button type="button" data-action="clear-references" disabled>Clear</button>
              </div>
              <div id="reference-list" class="reference-list"></div>
              <p>Reference maps render in blue and are excluded from selection and export.</p>
            </div>
          </section>
        </div>
      </aside>
    </section>

    <section id="issue-browser" class="issue-browser" aria-label="Issue browser" hidden>
      <header class="issue-browser-toolbar">
        <div class="issue-browser-title"><strong>Issues</strong><span id="issue-summary">0 findings</span></div>
        <details class="issue-filter-menu">
          <summary>Filter types</summary>
          <div id="issue-filters" class="issue-filter-list">
            ${EDITOR_ISSUE_TYPE_INFO.map((entry) => `<label><input type="checkbox" data-issue-filter="${entry.type}" checked><span>${entry.label}</span></label>`).join('')}
          </div>
        </details>
        <label class="show-hidden-issues"><input id="show-hidden-issues" type="checkbox"> Show hidden</label>
        <button type="button" data-action="close-issues" aria-label="Close issue browser">Close</button>
      </header>
      <div id="issue-list" class="issue-list" role="list"></div>
    </section>

    <footer class="statusbar">
      <span id="status-message" aria-live="polite">Starting WebGPU source renderer...</span>
      <button id="issue-status" type="button" data-action="toggle-issues" aria-expanded="false">Issues 0</button>
      <div class="compile-state" title="Compiler service state">COMPILER OFFLINE</div>
      <span id="pointer-context">Perspective / edit</span>
    </footer>

    <dialog id="source-dialog" class="source-dialog">
      <div class="dialog-shell">
        <header><div><strong>Map source</strong><span>Valve 220</span></div><button type="button" data-action="close-source" aria-label="Close source">Close</button></header>
        <textarea id="map-source" spellcheck="false" aria-describedby="source-message"></textarea>
        <footer>
          <p id="source-message" class="source-message">Normalized source is ready.</p>
          <button type="button" data-action="apply-source">Apply source</button>
        </footer>
      </div>
    </dialog>
    <aside id="viewport-context-menu" class="viewport-context-menu" role="menu" aria-label="Map view actions" tabindex="-1" hidden></aside>
  </main>
`;
}
