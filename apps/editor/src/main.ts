import type { WorldviewViewer } from '@jackharrhy/worldview';
import { TextureUvEditor } from './uv-editor.js';
import {
  EditorSession,
  EditorMaterialCatalog,
  MapCompileCoordinator,
  RemoteMapCompiler,
  EditorSourceRenderer,
  BUILTIN_POINT_ENTITY_DEFINITIONS,
  brushesInDocument,
  createBrushSelection,
  createObjectSelection,
  createConvexHullBrush,
  createSimpleShapeBrushes,
  createStarterDocument,
  DEFAULT_SIMPLE_SHAPE_OPTIONS,
  EDITOR_ISSUE_TYPE_INFO,
  EDITOR_SPECIAL_BRUSH_FILTER_INFO,
  createSequentialIdFactory,
  deriveBrush,
  deriveEditorGroups,
  deriveEditorLayers,
  deriveEntityLinks,
  documentWithoutOmittedLayers,
  editorGroupForObject,
  encodeQuakeWad2,
  entityClassFiltersInDocument,
  findBrush,
  isEditorGroupEntity,
  isEditorLayerEntity,
  linkedGroupSiblings,
  materialUsageInDocument,
  matchingBrushFaces,
  objectClipboardPasteOffset,
  parseFaceAttributeClipboard,
  parseMap,
  pointEntityBounds,
  pointEntityDefinition,
  protectedEntityProperties,
  selectedBrushIds,
  selectedEntityIdsForLinks,
  selectedEditorGroup,
  selectedFaceReferences,
  selectedPointEntityIds,
  selectionForEditorGroup,
  visibleEntityLinks,
  serializeMap,
  serializeFaceAttributeClipboard,
  serializeObjectClipboard,
  type BrushEditCandidate,
  type BrushBatchEditCandidate,
  type BrushSelection,
  type BrushBatchClipCandidate,
  type BrushClipCandidate,
  type BrushClipMode,
  type BrushCreationCandidate,
  type BrushBatchCreationCandidate,
  type DocumentEditCandidate,
  type SweepCandidate,
  type SweepOptions,
  type SweepPath,
  type SweepTransform,
  type EditorBrushCreateEvent,
  type EditorBrushDragEvent,
  type EditorCameraChangeEvent,
  type EditorClipPlaneEvent,
  type EditorFaceDragEvent,
  type EditorFaceTransferEvent,
  type FaceTextureAlignmentOperation,
  type CircleMode,
  type EditorHullCreateEvent,
  type EditorIssue,
  type EditorIssueType,
  type EditorLayerId,
  type EditorMaterial,
  type EditorObjectViewState,
  type EntityLinkMode,
  type EditorPointerPositionEvent,
  type EditorSelection,
  type EditorReferenceScene,
  type EditorSweepDragEvent,
  type EditorSpecialBrushFilter,
  type EditorViewportCanvases,
  type EditorViewportContextMenuEvent,
  type EditorTool,
  type EditorTopologyDragEvent,
  type EditorTopologyKind,
  type EditorTransformDragEvent,
  type EditorTransformPivotDragEvent,
  type MapCompileResult,
  type MapDocument,
  type SelectionBrushQueryMode,
  type SimpleShapeKind,
  type SimpleShapeOptions,
  type StairDirection,
  type TransformAxis,
  type Vec3,
} from '@jackharrhy/worldview-editor';

import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Editor root is missing');

app.innerHTML = `
  <main class="editor-shell">
    <header class="topbar">
      <div class="brand-lockup">
        <div class="wordmark">WORLDVIEW</div>
        <span id="document-name" class="document-name">untitled.map</span>
      </div>
      <nav class="top-actions" aria-label="Document actions">
        <button type="button" data-action="new">New</button>
        <button type="button" data-action="open-file">Open</button>
        <button type="button" data-action="download">Save</button>
        <button type="button" data-action="show-source">Source</button>
        <span class="topbar-rule" aria-hidden="true"></span>
        <button type="button" data-action="compile">Compile</button>
        <button type="button" data-action="toggle-preview" disabled>Preview</button>
      </nav>
      <button class="inspector-toggle" type="button" data-action="toggle-inspector" aria-pressed="true">Inspector</button>
      <div class="compile-state" title="Compiler service state">COMPILER OFFLINE</div>
      <input id="map-file" type="file" accept=".map,.txt" hidden>
      <input id="reference-files" type="file" accept=".map" multiple hidden>
    </header>

    <section class="toolrail" aria-label="Editor tools">
      <button class="tool-button active" type="button" data-tool="select" aria-pressed="true">Select</button>
      <button class="tool-button" type="button" data-tool="create" aria-pressed="false">Brush</button>
      <button class="tool-button" type="button" data-tool="entity" aria-pressed="false">Entity</button>
      <button class="tool-button" type="button" data-tool="hull" aria-pressed="false">Hull</button>
      <button class="tool-button" type="button" data-tool="face" aria-pressed="false">Face</button>
      <button class="tool-button" type="button" data-tool="sweep" aria-pressed="false">Sweep</button>
      <button class="tool-button" type="button" data-tool="clip" aria-pressed="false">Clip</button>
      <button class="tool-button" type="button" data-tool="vertex" aria-pressed="false">Vertex</button>
      <button class="tool-button" type="button" data-tool="edge" aria-pressed="false">Edge</button>
      <button class="tool-button" type="button" data-tool="rotate" aria-pressed="false">Rotate</button>
      <button class="tool-button" type="button" data-tool="scale" aria-pressed="false">Scale</button>
      <button class="tool-button" type="button" data-tool="shear" aria-pressed="false">Shear</button>
      <span class="toolrail-rule" aria-hidden="true"></span>
      <button type="button" data-action="focus-selection" title="Frame the selection in every viewport (Home)" disabled>Focus</button>
      <button type="button" data-action="select-all" title="Select every visible, unlocked object (Ctrl/Command+A)">All</button>
      <button type="button" data-action="invert-selection" title="Invert the visible, unlocked object selection (Ctrl/Command+Shift+A)">Invert</button>
      <button type="button" data-action="undo" disabled>Undo</button>
      <button type="button" data-action="redo" disabled>Redo</button>
      <button type="button" data-action="repeat-commands" title="Repeat recorded object commands (Ctrl/Command+Shift+R)" disabled>Repeat</button>
      <button type="button" data-action="clear-repeat-commands" title="Start a new command-repetition sequence" disabled>Clear repeat</button>
      <button type="button" data-action="duplicate" disabled>Duplicate</button>
      <button type="button" data-action="copy" title="Copy selected objects or face attributes (Ctrl/Command+C)" disabled>Copy</button>
      <button type="button" data-action="paste" title="Paste objects or face attributes (Ctrl/Command+V)">Paste</button>
      <button type="button" data-action="paste-here" title="Paste copied bounds at the viewport pointer (Ctrl/Command+Shift+V)" disabled>Paste here</button>
      <button type="button" data-action="delete" disabled>Delete</button>
      <span class="toolrail-rule" aria-hidden="true"></span>
      <button type="button" data-action="hide-selection" title="Hide selected objects" disabled>Hide</button>
      <button type="button" data-action="isolate-selection" title="Hide every object except the selection" disabled>Isolate</button>
      <button type="button" data-action="show-all" title="Show all hidden objects" disabled>Show all</button>
      <button type="button" data-action="lock-selection" title="Lock selected objects against picking and editing" disabled>Lock</button>
      <button type="button" data-action="unlock-all" title="Unlock all objects" disabled>Unlock all</button>
      <span class="toolrail-rule" aria-hidden="true"></span>
      <label class="tool-select">Grid
        <select id="grid-size" aria-label="Grid size">
          <option value="1">1</option><option value="2">2</option><option value="4">4</option>
          <option value="8">8</option><option value="16" selected>16</option>
          <option value="32">32</option><option value="64">64</option>
        </select>
      </label>
      <label class="tool-toggle"><input id="texture-lock" type="checkbox" checked> Texture lock</label>
      <button class="view-filter-toggle" type="button" data-action="toggle-view-filters" aria-expanded="false" title="Filter entity definitions and special brush types without changing map source">View <span id="view-filter-count">0</span></button>
      <span class="toolrail-spacer"></span>
      <span class="tool-help">RMB look · Alt+RMB orbit · MMB pan · WASD/QX fly · Home focus</span>
    </section>

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
      <span id="status-message">Starting WebGPU source renderer...</span>
      <button id="issue-status" type="button" data-action="toggle-issues" aria-expanded="false">Issues 0</button>
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

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing editor element: ${selector}`);
  return element;
}

const source = required<HTMLTextAreaElement>('#map-source');
const sourceMessage = required<HTMLParagraphElement>('#source-message');
const sourceDialog = required<HTMLDialogElement>('#source-dialog');
const viewportContextMenu = required<HTMLElement>('#viewport-context-menu');
const statusMessage = required<HTMLSpanElement>('#status-message');
const cameraPointerContext = required<HTMLSpanElement>('#pointer-context');
const editorShell = required<HTMLElement>('.editor-shell');
const issueBrowser = required<HTMLElement>('#issue-browser');
const issueSummary = required<HTMLElement>('#issue-summary');
const issueList = required<HTMLDivElement>('#issue-list');
const issueStatus = required<HTMLButtonElement>('#issue-status');
const showHiddenIssues = required<HTMLInputElement>('#show-hidden-issues');
const viewFilterToggle = required<HTMLButtonElement>('[data-action="toggle-view-filters"]');
const viewFilterPopover = required<HTMLElement>('#view-filter-popover');
const viewFilterCount = required<HTMLElement>('#view-filter-count');
const viewFilterStatus = required<HTMLElement>('#view-filter-status');
const showWorldBrushes = required<HTMLInputElement>('#show-world-brushes');
const entityClassFilterSearch = required<HTMLInputElement>('#entity-class-filter-search');
const entityClassFilterSummary = required<HTMLElement>('#entity-class-filter-summary');
const entityClassFilterList = required<HTMLDivElement>('#entity-class-filter-list');
const focusSelectionButton = required<HTMLButtonElement>('[data-action="focus-selection"]');
const selectAllButton = required<HTMLButtonElement>('[data-action="select-all"]');
const invertSelectionButton = required<HTMLButtonElement>('[data-action="invert-selection"]');
const undoButton = required<HTMLButtonElement>('[data-action="undo"]');
const redoButton = required<HTMLButtonElement>('[data-action="redo"]');
const repeatCommandsButton = required<HTMLButtonElement>('[data-action="repeat-commands"]');
const clearRepeatCommandsButton = required<HTMLButtonElement>(
  '[data-action="clear-repeat-commands"]',
);
const duplicateButton = required<HTMLButtonElement>('[data-action="duplicate"]');
const copyButton = required<HTMLButtonElement>('[data-action="copy"]');
const pasteButton = required<HTMLButtonElement>('[data-action="paste"]');
const pasteHereButton = required<HTMLButtonElement>('[data-action="paste-here"]');
const deleteButton = required<HTMLButtonElement>('[data-action="delete"]');
const hideSelectionButton = required<HTMLButtonElement>('[data-action="hide-selection"]');
const isolateSelectionButton = required<HTMLButtonElement>('[data-action="isolate-selection"]');
const showAllButton = required<HTMLButtonElement>('[data-action="show-all"]');
const lockSelectionButton = required<HTMLButtonElement>('[data-action="lock-selection"]');
const unlockAllButton = required<HTMLButtonElement>('[data-action="unlock-all"]');
const entityLinkModeSelect = required<HTMLSelectElement>('#entity-link-mode');
const entityLinkCount = required<HTMLElement>('#entity-link-count');
const activeLayerName = required<HTMLElement>('#active-layer-name');
const layerList = required<HTMLDivElement>('#layer-list');
const layerNameInput = required<HTMLInputElement>('#layer-name');
const addLayerButton = required<HTMLButtonElement>('[data-action="add-layer"]');
const moveSelectionToLayerButton = required<HTMLButtonElement>(
  '[data-action="move-selection-to-layer"]',
);
const selectLayerButton = required<HTMLButtonElement>('[data-action="select-layer"]');
const isolateLayerButton = required<HTMLButtonElement>('[data-action="isolate-layer"]');
const removeLayerButton = required<HTMLButtonElement>('[data-action="remove-layer"]');
const layerUpButton = required<HTMLButtonElement>('[data-action="layer-up"]');
const layerDownButton = required<HTMLButtonElement>('[data-action="layer-down"]');
const compileButton = required<HTMLButtonElement>('[data-action="compile"]');
const togglePreviewButton = required<HTMLButtonElement>('[data-action="toggle-preview"]');
const compileState = required<HTMLDivElement>('.compile-state');
const perspectiveMode = required<HTMLElement>('#perspective-mode');
const compiledCanvas = required<HTMLCanvasElement>('.compiled-canvas');
const selectionKind = required<HTMLSpanElement>('#selection-kind');
const selectionEmpty = required<HTMLDivElement>('#selection-empty');
const selectionInspector = required<HTMLDivElement>('#selection-inspector');
const groupSection = required<HTMLElement>('#group-section');
const groupState = required<HTMLElement>('#group-state');
const groupName = required<HTMLInputElement>('#group-name');
const createGroupButton = required<HTMLButtonElement>('[data-action="create-group"]');
const renameGroupButton = required<HTMLButtonElement>('[data-action="rename-group"]');
const openGroupButton = required<HTMLButtonElement>('[data-action="open-group"]');
const closeGroupButton = required<HTMLButtonElement>('[data-action="close-group"]');
const createLinkedDuplicateButton = required<HTMLButtonElement>(
  '[data-action="create-linked-duplicate"]',
);
const unlinkGroupButton = required<HTMLButtonElement>('[data-action="unlink-group"]');
const ungroupButton = required<HTMLButtonElement>('[data-action="ungroup"]');
const selectionBrushSection = required<HTMLElement>('#selection-brush-section');
const selectionBrushCount = required<HTMLElement>('#selection-brush-count');
const pointEntityToolSection = required<HTMLElement>('#point-entity-tool-section');
const pointEntityPreset = required<HTMLSelectElement>('#point-entity-preset');
const pointEntityClassname = required<HTMLInputElement>('#point-entity-classname');
const simpleShapeToolSection = required<HTMLElement>('#simple-shape-tool-section');
const simpleShapeResult = required<HTMLElement>('#simple-shape-result');
const simpleShapeKind = required<HTMLSelectElement>('#simple-shape-kind');
const simpleShapeAxis = required<HTMLSelectElement>('#simple-shape-axis');
const simpleShapeSides = required<HTMLInputElement>('#simple-shape-sides');
const simpleShapeCircleMode = required<HTMLSelectElement>('#simple-shape-circle-mode');
const simpleShapeHollow = required<HTMLInputElement>('#simple-shape-hollow');
const simpleShapeThickness = required<HTMLInputElement>('#simple-shape-thickness');
const simpleShapeRings = required<HTMLInputElement>('#simple-shape-rings');
const simpleShapeAccuracy = required<HTMLInputElement>('#simple-shape-accuracy');
const simpleShapeStepHeight = required<HTMLInputElement>('#simple-shape-step-height');
const simpleShapeStairDirection = required<HTMLSelectElement>('#simple-shape-stair-direction');
const simpleShapeCircleFields = required<HTMLElement>('#simple-shape-circle-fields');
const simpleShapeHollowFields = required<HTMLElement>('#simple-shape-hollow-fields');
const simpleShapeUvFields = required<HTMLElement>('#simple-shape-uv-fields');
const simpleShapeIcoFields = required<HTMLElement>('#simple-shape-ico-fields');
const simpleShapeStairFields = required<HTMLElement>('#simple-shape-stair-fields');
const hullToolSection = required<HTMLElement>('#hull-tool-section');
const hullPointCount = required<HTMLElement>('#hull-point-count');
const createHullButton = required<HTMLButtonElement>('[data-action="create-hull"]');
const discardHullButton = required<HTMLButtonElement>('[data-action="discard-hull"]');
const brushId = required<HTMLElement>('#brush-id');
const brushRevision = required<HTMLElement>('#brush-revision');
const brushFaces = required<HTMLElement>('#brush-faces');
const brushBounds = required<HTMLElement>('#brush-bounds');
const faceMaterial = required<HTMLElement>('#face-material');
const faceExtrudeSection = required<HTMLElement>('#face-extrude-section');
const faceNormal = required<HTMLElement>('#face-normal');
const faceExtrudeDistance = required<HTMLInputElement>('#face-extrude-distance');
const sweepToolSection = required<HTMLElement>('#sweep-tool-section');
const sweepGeneratedCount = required<HTMLElement>('#sweep-generated-count');
const sweepTranslateInputs = [
  required<HTMLInputElement>('#sweep-translate-x'),
  required<HTMLInputElement>('#sweep-translate-y'),
  required<HTMLInputElement>('#sweep-translate-z'),
] as const;
const sweepRotateInputs = [
  required<HTMLInputElement>('#sweep-rotate-x'),
  required<HTMLInputElement>('#sweep-rotate-y'),
  required<HTMLInputElement>('#sweep-rotate-z'),
] as const;
const sweepScale = required<HTMLInputElement>('#sweep-scale');
const sweepPath = required<HTMLSelectElement>('#sweep-path');
const sweepSegments = required<HTMLInputElement>('#sweep-segments');
const sweepIterations = required<HTMLInputElement>('#sweep-iterations');
const sweepSnap = required<HTMLInputElement>('#sweep-snap');
const applySweepButton = required<HTMLButtonElement>('[data-action="apply-sweep"]');
const clipToolSection = required<HTMLElement>('#clip-tool-section');
const clipPointCount = required<HTMLElement>('#clip-point-count');
const clipPointPositions = required<HTMLElement>('#clip-point-positions');
const applyClipButton = required<HTMLButtonElement>('[data-action="apply-clip"]');
const transformToolSection = required<HTMLElement>('#transform-tool-section');
const objectFlipSection = required<HTMLElement>('#object-flip-section');
const topologyToolSection = required<HTMLElement>('#topology-tool-section');
const csgSection = required<HTMLElement>('#csg-section');
const csgSelectionCount = required<HTMLElement>('#csg-selection-count');
const csgMergeButton = required<HTMLButtonElement>('[data-action="csg-merge"]');
const csgIntersectButton = required<HTMLButtonElement>('[data-action="csg-intersect"]');
const topologyToolTitle = required<HTMLElement>('#topology-tool-title');
const topologySelectionCount = required<HTMLElement>('#topology-selection-count');
const topologyGridSize = required<HTMLElement>('#topology-grid-size');
const transformToolTitle = required<HTMLElement>('#transform-tool-title');
const transformToolHelp = required<HTMLElement>('#transform-tool-help');
const transformPivotX = required<HTMLInputElement>('#transform-pivot-x');
const transformPivotY = required<HTMLInputElement>('#transform-pivot-y');
const transformPivotZ = required<HTMLInputElement>('#transform-pivot-z');
const rotateAxis = required<HTMLSelectElement>('#rotate-axis');
const rotateAngle = required<HTMLInputElement>('#rotate-angle');
const rotateUpdateEntityAngles = required<HTMLInputElement>('#rotate-update-entity-angles');
const scaleX = required<HTMLInputElement>('#scale-x');
const scaleY = required<HTMLInputElement>('#scale-y');
const scaleZ = required<HTMLInputElement>('#scale-z');
const shearSourceAxis = required<HTMLSelectElement>('#shear-source-axis');
const shearTargetAxis = required<HTMLSelectElement>('#shear-target-axis');
const shearOffset = required<HTMLInputElement>('#shear-offset');
const entityClassname = required<HTMLElement>('#entity-classname');
const entitySection = required<HTMLElement>('#entity-section');
const entityProperties = required<HTMLDivElement>('#entity-properties');
const entityPropertyKey = required<HTMLInputElement>('#entity-property-key');
const entityPropertyValue = required<HTMLInputElement>('#entity-property-value');
const entityPropertyProtected = required<HTMLInputElement>('#entity-property-protected');
const entityPropertyProtectedLabel = required<HTMLElement>('#entity-property-protected-label');
const brushEntityActions = required<HTMLElement>('#brush-entity-actions');
const brushEntityClassname = required<HTMLInputElement>('#brush-entity-classname');
const makeBrushEntityButton = required<HTMLButtonElement>('[data-action="make-brush-entity"]');
const makeStructuralButton = required<HTMLButtonElement>('[data-action="make-structural"]');
const textureShiftU = required<HTMLInputElement>('#texture-shift-u');
const textureShiftV = required<HTMLInputElement>('#texture-shift-v');
const textureScaleU = required<HTMLInputElement>('#texture-scale-u');
const textureScaleV = required<HTMLInputElement>('#texture-scale-v');
const textureRotation = required<HTMLInputElement>('#texture-rotation');
const textureUAxis = required<HTMLElement>('#texture-u-axis');
const textureVAxis = required<HTMLElement>('#texture-v-axis');
const uvEditorSvg = required<SVGSVGElement>('#uv-editor');
const uvEditorStatus = required<HTMLElement>('#uv-editor-status');
const uvResetPivot = required<HTMLButtonElement>('#uv-reset-pivot');
const applyTextureTransformButton = required<HTMLButtonElement>(
  '[data-action="apply-texture-transform"]',
);
const documentRevision = required<HTMLElement>('#document-revision');
const entityCount = required<HTMLElement>('#entity-count');
const brushCount = required<HTMLElement>('#brush-count');
const groupCount = required<HTMLElement>('#group-count');
const hiddenObjectCount = required<HTMLElement>('#hidden-object-count');
const lockedObjectCount = required<HTMLElement>('#locked-object-count');
const geometryState = required<HTMLElement>('#geometry-state');
const materialCount = required<HTMLElement>('#material-count');
const materialGrid = required<HTMLDivElement>('#material-grid');
const materialFilter = required<HTMLInputElement>('#material-filter');
const materialSort = required<HTMLSelectElement>('#material-sort');
const materialUsedOnly = required<HTMLInputElement>('#material-used-only');
const materialName = required<HTMLInputElement>('#material-name');
const materialMessage = required<HTMLParagraphElement>('#material-message');
const applyMaterialButton = required<HTMLButtonElement>('[data-action="apply-material"]');
const selectMaterialFacesButton = required<HTMLButtonElement>(
  '[data-action="select-material-faces"]',
);
const selectMaterialBrushesButton = required<HTMLButtonElement>(
  '[data-action="select-material-brushes"]',
);
const setMaterialReplaceSourceButton = required<HTMLButtonElement>(
  '[data-action="set-material-replace-source"]',
);
const setMaterialReplaceTargetButton = required<HTMLButtonElement>(
  '[data-action="set-material-replace-target"]',
);
const materialReplaceSource = required<HTMLInputElement>('#material-replace-source');
const materialReplaceTarget = required<HTMLInputElement>('#material-replace-target');
const materialReplaceButton = required<HTMLButtonElement>('[data-action="replace-material"]');
const materialReplaceScope = required<HTMLParagraphElement>('#material-replace-scope');
const wadFiles = required<HTMLInputElement>('#wad-files');
const paletteFile = required<HTMLInputElement>('#palette-file');
const mapFile = required<HTMLInputElement>('#map-file');
const referenceFiles = required<HTMLInputElement>('#reference-files');
const referenceCount = required<HTMLElement>('#reference-count');
const referenceList = required<HTMLDivElement>('#reference-list');
const clearReferencesButton = required<HTMLButtonElement>('[data-action="clear-references"]');
const viewportGrid = required<HTMLElement>('.viewport-grid');
const viewportError = required<HTMLDivElement>('.viewport-error');
const inspector = required<HTMLElement>('.inspector');
const inspectorToggle = required<HTMLButtonElement>('[data-action="toggle-inspector"]');
const gridSizeSelect = required<HTMLSelectElement>('#grid-size');
const textureLock = required<HTMLInputElement>('#texture-lock');
const documentName = required<HTMLElement>('#document-name');

const canvases = Object.fromEntries(
  [...document.querySelectorAll<HTMLElement>('[data-viewport]')].map((pane) => [
    pane.dataset.viewport,
    pane.querySelector('.source-canvas'),
  ]),
) as unknown as EditorViewportCanvases;

let session = new EditorSession(createStarterDocument());
let renderer: EditorSourceRenderer | null = null;
let stopSubscription: (() => void) | null = null;
let moveCandidate: DocumentEditCandidate | null = null;
let duplicationBase: DocumentEditCandidate | null = null;
let duplicationCandidate: DocumentEditCandidate | null = null;
let faceCandidate:
  | BrushEditCandidate
  | BrushBatchEditCandidate
  | BrushClipCandidate
  | BrushBatchClipCandidate
  | BrushBatchCreationCandidate
  | null = null;
let faceTransferCandidate: BrushEditCandidate | BrushBatchEditCandidate | null = null;
let uvTextureCandidate: BrushEditCandidate | BrushBatchEditCandidate | null = null;
let faceSplitSequence = 0;
let faceStampSequence = 0;
let faceTranslationSequence = 0;
let sweepCandidate: SweepCandidate | null = null;
let sweepTransform: SweepTransform = {
  translation: [0, 0, 64],
  rotationDegrees: [0, 0, 0],
  scale: 1,
};
let sweepDefaultTransform: SweepTransform = sweepTransform;
let sweepOptions: SweepOptions = {
  path: 'straight',
  segments: 4,
  iterations: 1,
  snapToInteger: false,
  textureLock: true,
};
let sweepDragBase: SweepTransform | null = null;
let sweepEscapeReset = false;
let sweepSequence = 0;
let transformCandidate:
  | BrushEditCandidate
  | BrushBatchEditCandidate
  | DocumentEditCandidate
  | null = null;
let topologyCandidate: BrushEditCandidate | BrushBatchEditCandidate | null = null;
let topologySequence = 0;
let topologySelectedVertices: readonly Vec3[] = [];
let topologySelectionKind: EditorTopologyKind | null = null;
let topologyTransformSequence = 0;
let transformPivot: Vec3 | null = null;
let transformPivotSelectionKey: string | null = null;
let clipCandidate: BrushClipCandidate | BrushBatchClipCandidate | null = null;
let clipPlanePoints: readonly [Vec3, Vec3, Vec3] | null = null;
let clipMode: BrushClipMode = 'back';
let clipSequence = 0;
let csgSequence = 0;
let creationCandidate: BrushBatchCreationCandidate | null = null;
let creationSequence = 0;
let simpleShapeOptions: SimpleShapeOptions = { ...DEFAULT_SIMPLE_SHAPE_OPTIONS };
let hullCandidate: BrushCreationCandidate | null = null;
let hullBuildPoints: readonly Vec3[] = [];
let hullSequence = 0;
let duplicateSequence = 0;
let clipboardSequence = 0;
let editorClipboardText: string | null = null;
let lastPointerPosition: EditorPointerPositionEvent | null = null;
let perspectiveCamera: EditorCameraChangeEvent['camera'] | null = null;
let activeGridSize = Number(gridSizeSelect.value);
let currentDocumentName = 'untitled.map';
let activeEntityId: MapDocument['entities'][number]['id'] | null = null;
let activeTool: EditorTool = 'select';
let compiledViewer: WorldviewViewer | null = null;
let compiledRevision: number | null = null;
let showingCompiled = false;
let referenceScenes: EditorReferenceScene[] = [];
let referenceSequence = 0;
let entityLinkMode: EntityLinkMode = 'direct';
let openGroupId: string | null = null;
let selectedLayerId: EditorLayerId = null;
let layerPanelSignature = '';
let issueBrowserOpen = false;
let viewFilterPopoverOpen = false;
const hiddenIssueIds = new Set<string>();
const enabledIssueTypes = new Set<EditorIssueType>(
  EDITOR_ISSUE_TYPE_INFO.map((entry) => entry.type),
);
const compilerEndpoint =
  new URLSearchParams(window.location.search).get('compiler') ?? 'http://127.0.0.1:8788/compile';
const compilerCoordinator = new MapCompileCoordinator(
  new RemoteMapCompiler({ endpoint: compilerEndpoint }),
);
const materialCatalog = new EditorMaterialCatalog();
const builtInMaterials = [
  createDeveloperMaterial('DEV_FLOOR', [99, 126, 103], [137, 164, 140]),
  createDeveloperMaterial('DEV_PILLAR', [111, 87, 116], [151, 117, 155]),
] as const;
for (const material of builtInMaterials) materialCatalog.set(material);
const uvEditor = new TextureUvEditor({
  svg: uvEditorSvg,
  status: uvEditorStatus,
  resetPivotButton: uvResetPivot,
  onStatus(message) {
    statusMessage.textContent = message;
  },
  onTransform(event) {
    if (event.phase === 'cancel') {
      uvTextureCandidate = null;
      renderer?.setDocument(session.document, session.selection, effectiveObjectViewState());
      updateInspector();
      statusMessage.textContent = 'UV transform cancelled.';
      return;
    }
    try {
      const candidate = session.createTextureTransformDeltaCandidate(
        event.transform,
        event.selection,
        event.pivot,
      );
      if (!candidate) return;
      if (event.phase === 'preview') {
        uvTextureCandidate = candidate;
        renderer?.setDocument(
          candidate.document,
          session.selection,
          effectiveObjectViewState(candidate.document),
        );
        updateInspector(candidate.document, session.selection);
        statusMessage.textContent = `${candidate.label} preview. Release to commit.`;
        return;
      }
      session.commitCandidate(uvTextureCandidate ?? candidate);
      uvTextureCandidate = null;
    } catch (error) {
      uvTextureCandidate = null;
      renderer?.setDocument(session.document, session.selection, effectiveObjectViewState());
      updateInspector();
      statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  },
});
const loadedWadSources = new Map<string, ArrayBuffer>();
let quakePalette: Uint8Array | undefined;
let activeMaterialName = '';
let viewportContext: EditorViewportContextMenuEvent | null = null;
const diagnosticQuakePalette = createDiagnosticQuakePalette();
let compiledPreviewWarning: string | null = null;

interface CompileAssetEntry {
  readonly name: string;
  readonly data: ArrayBuffer;
}

function compileAssetName(name: string, index: number): string {
  const stem = name
    .replace(/\.wad$/i, '')
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .slice(0, 112);
  return `${stem || `textures_${index}`}.wad`;
}

function compileAssets(): readonly CompileAssetEntry[] {
  const assets: CompileAssetEntry[] = [
    {
      name: 'worldview_dev.wad',
      data: encodeQuakeWad2(builtInMaterials, diagnosticQuakePalette),
    },
  ];
  let index = 0;
  for (const [name, data] of loadedWadSources) {
    let safeName = compileAssetName(name, index++);
    while (assets.some((asset) => asset.name.toLowerCase() === safeName.toLowerCase())) {
      safeName = compileAssetName(`${index}_${name}`, index++);
    }
    assets.push({ name: safeName, data });
  }
  return assets;
}

function serializeCompileDocument(assets: readonly CompileAssetEntry[]): string {
  const document = documentWithoutOmittedLayers(session.document);
  const worldspawn = document.entities.find(
    (entity) => entity.properties.classname?.toLowerCase() === 'worldspawn',
  );
  if (!worldspawn) throw new Error('The map document has no worldspawn entity');
  const compileWorldspawn = {
    ...worldspawn,
    properties: {
      ...worldspawn.properties,
      wad: assets.map((asset) => asset.name).join(';'),
    },
  };
  return serializeMap({
    ...document,
    entities: document.entities.map((entity) =>
      entity.id === worldspawn.id ? compileWorldspawn : entity,
    ),
  });
}

function updateSourceFromDocument(): void {
  source.value = serializeMap(session.document);
}

function setDocumentName(name: string): void {
  currentDocumentName = name.toLowerCase().endsWith('.map') ? name : `${name}.map`;
  documentName.textContent = currentDocumentName;
  documentName.title = currentDocumentName;
}

function setInspectorOpen(open: boolean): void {
  inspector.classList.toggle('closed', !open);
  inspector.parentElement?.classList.toggle('inspector-closed', !open);
  inspectorToggle.setAttribute('aria-pressed', String(open));
}

function duplicateSelection(): void {
  duplicateSequence += 1;
  const duplicated = session.duplicateSelected(
    createSequentialIdFactory(`duplicate-${duplicateSequence}`),
    [activeGridSize, activeGridSize, 0],
    textureLock.checked,
    openGroupId,
  );
  if (!duplicated) statusMessage.textContent = 'Select a brush before duplicating.';
}

function repeatRecordedCommands(): void {
  try {
    if (!session.repeatLastCommands()) {
      statusMessage.textContent = 'Record object commands before repeating them.';
    }
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function copySelectionText(selection: EditorSelection | null = session.selection): string | null {
  try {
    return selection?.faceId
      ? serializeFaceAttributeClipboard(session.document, selection)
      : serializeObjectClipboard(session.document, selection);
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
    return null;
  }
}

async function copySelection(selection: EditorSelection | null = session.selection): Promise<void> {
  const text = copySelectionText(selection);
  if (!text) {
    statusMessage.textContent = 'Select one or more objects or a face before copying.';
    return;
  }
  const faceAttributes = Boolean(selection?.faceId);
  editorClipboardText = text;
  try {
    await navigator.clipboard?.writeText(text);
    statusMessage.textContent = faceAttributes
      ? 'Copied face material and attributes.'
      : 'Copied selected objects as map text.';
  } catch {
    statusMessage.textContent = faceAttributes
      ? 'Copied face material and attributes inside Worldview.'
      : 'Copied selected objects inside Worldview.';
  }
}

async function readClipboardText(): Promise<string | null> {
  try {
    const systemText = await navigator.clipboard?.readText();
    if (systemText?.trim()) return systemText;
  } catch {
    // Browser clipboard permission is optional; the in-editor copy remains available.
  }
  return editorClipboardText;
}

function pasteClipboardText(
  text: string,
  atPointer: boolean,
  targetFace: EditorSelection | null = null,
): boolean {
  try {
    const faceAttributes = parseFaceAttributeClipboard(text);
    if (faceAttributes) {
      if (targetFace?.brushId && targetFace.faceId) {
        session.selectFace({ brushId: targetFace.brushId, faceId: targetFace.faceId });
      }
      const targets = selectedFaceReferences(session.selection);
      if (targets.length === 0 || !session.pasteFaceAttributes(faceAttributes)) {
        statusMessage.textContent =
          'Select one or more target faces before pasting face attributes.';
        return false;
      }
      editorClipboardText = text;
      statusMessage.textContent = `Pasted ${faceAttributes.material} and its attributes onto ${targets.length} ${targets.length === 1 ? 'face' : 'faces'} as one undo step.`;
      return true;
    }
    clipboardSequence += 1;
    const clipboard = parseMap(
      text,
      createSequentialIdFactory(`clipboard-source-${clipboardSequence}`),
    );
    const pointer = atPointer ? lastPointerPosition : null;
    if (atPointer && !pointer) {
      statusMessage.textContent =
        'Move the pointer over a source viewport before using Paste here.';
      return false;
    }
    const offset = pointer
      ? objectClipboardPasteOffset(clipboard, pointer.point, pointer.surfaceNormal)
      : ([0, 0, 0] as const);
    if (!offset) {
      statusMessage.textContent = 'The clipboard map contains no pasteable objects.';
      return false;
    }
    if (activeTool !== 'select') setEditorTool('select');
    const changed = session.pasteObjects(
      clipboard,
      createSequentialIdFactory(`clipboard-paste-${clipboardSequence}`),
      offset,
      textureLock.checked,
      openGroupId,
    );
    if (!changed) {
      statusMessage.textContent = 'The clipboard map contains no pasteable objects.';
      return false;
    }
    editorClipboardText = text;
    statusMessage.textContent = pointer
      ? `Pasted objects at the ${pointer.viewport.toUpperCase()} pointer as one undo step.`
      : 'Pasted objects at their copied position as one undo step.';
    return true;
  } catch (error) {
    statusMessage.textContent = `Clipboard: ${error instanceof Error ? error.message : String(error)}`;
    return false;
  }
}

async function pasteFromClipboard(
  atPointer: boolean,
  targetFace: EditorSelection | null = null,
): Promise<void> {
  const text = await readClipboardText();
  if (!text) {
    statusMessage.textContent = 'The clipboard does not contain map text or face attributes.';
    return;
  }
  pasteClipboardText(text, atPointer, targetFace);
}

function deleteSelection(): void {
  if (!session.deleteSelected()) statusMessage.textContent = 'Select a brush before deleting.';
}

function selectAllEditableObjects(): void {
  if (activeTool !== 'select') setEditorTool('select');
  const selection = session.selectAllEditable();
  const count = selectedBrushIds(selection).length + selectedPointEntityIds(selection).length;
  statusMessage.textContent =
    count > 0
      ? `Selected all ${count} visible, unlocked ${count === 1 ? 'object' : 'objects'}.`
      : 'There are no editable objects to select.';
}

function invertEditableObjectSelection(): void {
  if (activeTool !== 'select') setEditorTool('select');
  const selection = session.invertObjectSelection();
  const count = selectedBrushIds(selection).length + selectedPointEntityIds(selection).length;
  statusMessage.textContent =
    count > 0
      ? `Inverted the selection to ${count} ${count === 1 ? 'object' : 'objects'}.`
      : 'Inverting the selection cleared it.';
}

function applySelectionBrushQuery(mode: SelectionBrushQueryMode): void {
  try {
    const viewport = lastPointerPosition?.viewport;
    const projection =
      mode === 'inside-projected' && (viewport === 'xy' || viewport === 'xz' || viewport === 'yz')
        ? viewport
        : undefined;
    if (mode === 'inside-projected' && !projection) {
      throw new Error('Point at an XY, XZ, or YZ viewport before using Enclosed in 2D');
    }
    if (activeTool !== 'select') setEditorTool('select');
    const result = session.selectWithSelectionBrushes(mode, projection);
    if (!result) {
      statusMessage.textContent = 'Select one or more ordinary structural brushes first.';
      return;
    }
    const selected = result.selectedBrushCount + result.selectedEntityCount;
    const relationship =
      mode === 'touching' ? 'touching' : mode === 'inside' ? 'enclosed' : `${projection} enclosed`;
    statusMessage.textContent = `Consumed ${result.removedBrushCount} selection ${result.removedBrushCount === 1 ? 'brush' : 'brushes'} and selected ${selected} ${relationship} ${selected === 1 ? 'object' : 'objects'}.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function openGroupEntityId(
  document: MapDocument = session.document,
): MapDocument['entities'][number]['id'] | undefined {
  return deriveEditorGroups(document).find((group) => group.id === openGroupId)?.entityId;
}

function applyCsgOperation(operation: 'merge' | 'intersect' | 'subtract' | 'hollow'): void {
  try {
    csgSequence += 1;
    const ids = createSequentialIdFactory(`csg-${operation}-${csgSequence}`);
    const changed =
      operation === 'merge'
        ? session.csgConvexMergeSelected(ids, activeMaterialName || undefined)
        : operation === 'intersect'
          ? session.csgIntersectSelected(ids)
          : operation === 'subtract'
            ? session.csgSubtractSelected(ids)
            : session.csgHollowSelected(activeGridSize, ids);
    if (!changed) {
      statusMessage.textContent =
        operation === 'merge' || operation === 'intersect'
          ? 'Select at least two brushes for this CSG operation.'
          : 'Select one or more brushes for this CSG operation.';
      return;
    }
    statusMessage.textContent =
      operation === 'hollow'
        ? `Hollowed selection with ${activeGridSize}-unit walls.`
        : `CSG ${operation} committed as one undo step.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function deleteTopologySelection(): void {
  if (!isTopologyTool(activeTool) || topologySelectedVertices.length === 0) {
    statusMessage.textContent = `Select ${activeTool === 'edge' ? 'edge' : 'vertex'} handles before deleting.`;
    return;
  }
  try {
    const changed = session.deleteSelectedVertices(
      topologySelectedVertices,
      createSequentialIdFactory(`topology-delete-${topologySequence + 1}`),
      textureLock.checked,
    );
    if (!changed) return;
    topologySequence += 1;
    topologyCandidate = null;
    renderer?.clearTopologySelection();
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function clearActiveHandleSelection(): boolean {
  if (isTopologyTool(activeTool) && topologySelectedVertices.length > 0) {
    const count = Number(topologySelectionCount.textContent) || topologySelectedVertices.length;
    topologyCandidate = null;
    renderer?.clearTopologySelection();
    statusMessage.textContent = `Cleared ${count} selected ${activeTool} ${count === 1 ? 'handle' : 'handles'}. Press Escape again to leave the tool.`;
    return true;
  }
  if (activeTool !== 'face') return false;
  const faces = selectedFaceReferences(session.selection);
  if (faces.length === 0) return false;
  const brushIds = [...new Set(faces.map((face) => face.brushId))];
  session.select(createBrushSelection(brushIds, session.selection?.brushId ?? null));
  statusMessage.textContent = `Cleared ${faces.length} selected face ${faces.length === 1 ? 'handle' : 'handles'}. Press Escape again to leave the tool.`;
  return true;
}

function extrudeSelectedFaceBy(distance: number): void {
  if (!Number.isFinite(distance) || Math.abs(distance) <= Number.EPSILON) {
    statusMessage.textContent = 'Enter a non-zero face extrusion distance.';
    return;
  }
  try {
    if (!session.extrudeSelectedFace(distance)) {
      statusMessage.textContent = 'Select a face before extruding.';
    }
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function splitSelectedFaceBy(distance: number): void {
  if (!Number.isFinite(distance) || Math.abs(distance) <= Number.EPSILON) {
    statusMessage.textContent = 'Enter a non-zero face split distance.';
    return;
  }
  try {
    const changed = session.splitSelectedFace(
      distance,
      createSequentialIdFactory(`face-split-${faceSplitSequence + 1}`),
    );
    if (!changed) {
      statusMessage.textContent = 'Select an extrudable face before splitting.';
      return;
    }
    faceSplitSequence += 1;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function stampSelectedFaceBy(distance: number): void {
  if (!Number.isFinite(distance) || Math.abs(distance) <= Number.EPSILON) {
    statusMessage.textContent = 'Enter a non-zero face stamp distance.';
    return;
  }
  try {
    const changed = session.stampSelectedFace(
      distance,
      createSequentialIdFactory(`face-stamp-${faceStampSequence + 1}`),
      textureLock.checked,
    );
    if (!changed) {
      statusMessage.textContent = 'Select a stampable face first.';
      return;
    }
    faceStampSequence += 1;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function refreshClipPreview(): void {
  clipCandidate = null;
  applyClipButton.disabled = true;
  if (activeTool !== 'clip' || !clipPlanePoints) {
    renderer?.setDocument(session.document, session.selection);
    updateInspector();
    return;
  }
  const selection = session.selection;
  if (!selection || selection.faceId) {
    renderer?.setDocument(session.document, session.selection);
    updateInspector();
    statusMessage.textContent = 'Select one or more brushes before defining a clip plane.';
    return;
  }
  try {
    clipSequence += 1;
    const candidate = session.createBrushSetClipCandidate(
      selectedBrushIds(selection),
      clipPlanePoints,
      clipMode,
      createSequentialIdFactory(`clip-${clipSequence}`),
      activeMaterialName || undefined,
    );
    if (!candidate) {
      renderer?.setDocument(session.document, session.selection);
      updateInspector();
      statusMessage.textContent =
        'The clip plane does not affect the selected brushes in this mode.';
      return;
    }
    clipCandidate = candidate;
    applyClipButton.disabled = false;
    renderer?.setDocument(candidate.document, session.selection);
    updateInspector(candidate.document, session.selection);
    statusMessage.textContent = `${clipMode === 'split' ? 'Split' : 'Clip'} preview ready. Press Enter or Apply clip to commit.`;
  } catch (error) {
    renderer?.setDocument(session.document, session.selection);
    updateInspector();
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function handleClipPlaneChange(event: EditorClipPlaneEvent): void {
  clipPlanePoints = event.planePoints;
  clipPointCount.textContent = `${event.points.length} / 3 points`;
  clipPointPositions.textContent =
    event.points.length === 0
      ? 'No clip points.'
      : event.points.map((point, index) => `${index + 1}: ${formatVector(point)}`).join(' · ');
  refreshClipPreview();
}

function setClipMode(mode: BrushClipMode): void {
  clipMode = mode;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-clip-mode]')) {
    const active = button.dataset.clipMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  refreshClipPreview();
}

function applyClip(): void {
  if (!clipCandidate) {
    statusMessage.textContent = 'Place a clip plane that affects the selected brushes first.';
    return;
  }
  try {
    const candidate = clipCandidate;
    clipCandidate = null;
    session.commitClipCandidate(candidate);
    renderer?.clearClipPlane();
    statusMessage.textContent = `${candidate.label}. Document revision ${session.document.revision}.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function readSimpleShapeKind(value: string): SimpleShapeKind {
  if (
    value === 'cuboid' ||
    value === 'stairs' ||
    value === 'arch' ||
    value === 'cylinder' ||
    value === 'cone' ||
    value === 'uv-sphere' ||
    value === 'ico-sphere'
  ) {
    return value;
  }
  throw new Error(`Unknown simple shape ${value}`);
}

function readCircleMode(value: string): CircleMode {
  if (value === 'edge-aligned' || value === 'vertex-aligned' || value === 'scalable') {
    return value;
  }
  throw new Error(`Unknown circle mode ${value}`);
}

function readStairDirection(value: string): StairDirection {
  if (
    value === 'positive-x' ||
    value === 'negative-x' ||
    value === 'positive-y' ||
    value === 'negative-y'
  ) {
    return value;
  }
  throw new Error(`Unknown stair direction ${value}`);
}

function readSimpleShapeOptions(): SimpleShapeOptions {
  const axis = Number(simpleShapeAxis.value);
  if (axis !== 0 && axis !== 1 && axis !== 2) throw new Error('Simple-shape axis is invalid');
  const sides = Number(simpleShapeSides.value);
  const rings = Number(simpleShapeRings.value);
  const accuracy = Number(simpleShapeAccuracy.value);
  const thickness = Number(simpleShapeThickness.value);
  const stepHeight = Number(simpleShapeStepHeight.value);
  if (![sides, rings, accuracy, thickness, stepHeight].every(Number.isFinite)) {
    throw new Error('Simple-shape controls must be finite');
  }
  return {
    kind: readSimpleShapeKind(simpleShapeKind.value),
    axis,
    sides,
    circleMode: readCircleMode(simpleShapeCircleMode.value),
    hollow: simpleShapeHollow.checked,
    thickness,
    rings,
    accuracy,
    stepHeight,
    stairDirection: readStairDirection(simpleShapeStairDirection.value),
  };
}

function simpleShapeLabel(kind: SimpleShapeKind): string {
  return kind === 'uv-sphere' ? 'UV spheroid' : kind === 'ico-sphere' ? 'icosphere spheroid' : kind;
}

function updateSimpleShapeFields(): void {
  const kind = readSimpleShapeKind(simpleShapeKind.value);
  const circular =
    kind === 'arch' || kind === 'cylinder' || kind === 'cone' || kind === 'uv-sphere';
  simpleShapeCircleFields.hidden = !circular;
  simpleShapeHollowFields.hidden = kind !== 'arch' && kind !== 'cylinder';
  simpleShapeUvFields.hidden = kind !== 'uv-sphere';
  simpleShapeIcoFields.hidden = kind !== 'ico-sphere';
  simpleShapeStairFields.hidden = kind !== 'stairs';
  simpleShapeAxis.closest<HTMLElement>('label')!.hidden = !circular;
  simpleShapeHollow.closest<HTMLElement>('label')!.hidden = kind === 'arch';
  simpleShapeThickness.disabled = kind === 'cylinder' && !simpleShapeHollow.checked;
  if (simpleShapeCircleMode.value === 'scalable') {
    const sides = Number(simpleShapeSides.value);
    if (![12, 24, 48, 96].includes(sides)) simpleShapeSides.value = '12';
  }
  simpleShapeOptions = readSimpleShapeOptions();
  simpleShapeResult.textContent = `${simpleShapeLabel(kind)} ready`;
}

function cloneSweepTransform(transform: SweepTransform): SweepTransform {
  return {
    translation: [...transform.translation] as [number, number, number],
    rotationDegrees: [...transform.rotationDegrees] as [number, number, number],
    scale: transform.scale,
  };
}

function initialSweepTransform(): SweepTransform {
  const primary = selectedFaceReferences(session.selection)[0];
  const brush = primary ? findBrush(session.document, primary.brushId) : null;
  const face =
    brush && primary
      ? deriveBrush(brush).faces.find((candidate) => candidate.faceId === primary.faceId)
      : null;
  const distance = activeGridSize * 4;
  return {
    translation: face
      ? [face.normal[0] * distance, face.normal[1] * distance, face.normal[2] * distance]
      : [0, 0, distance],
    rotationDegrees: [0, 0, 0],
    scale: 1,
  };
}

function syncSweepControls(): void {
  sweepTranslateInputs.forEach((input, axis) => {
    input.value = String(sweepTransform.translation[axis]);
    input.step = String(activeGridSize);
  });
  sweepRotateInputs.forEach((input, axis) => {
    input.value = String(sweepTransform.rotationDegrees[axis]);
  });
  sweepScale.value = String(sweepTransform.scale);
  sweepPath.value = sweepOptions.path;
  sweepSegments.value = String(sweepOptions.segments);
  sweepIterations.value = String(sweepOptions.iterations);
  sweepSnap.checked = sweepOptions.snapToInteger;
}

function readSweepPath(value: string): SweepPath {
  if (value === 'straight' || value === 'arc' || value === 's-bend') return value;
  throw new Error(`Unknown Sweep path ${value}`);
}

function readSweepControls(): void {
  const translation = sweepTranslateInputs.map((input) => Number(input.value)) as unknown as Vec3;
  const rotationDegrees = sweepRotateInputs.map((input) => Number(input.value)) as unknown as Vec3;
  const scale = Number(sweepScale.value);
  const segments = Number(sweepSegments.value);
  const iterations = Number(sweepIterations.value);
  if (![...translation, ...rotationDegrees, scale].every(Number.isFinite) || scale <= 0) {
    throw new Error('Sweep destination values must be finite and scale must be positive');
  }
  if (!Number.isInteger(segments) || segments < 1 || segments > 128) {
    throw new Error('Sweep segments must be an integer from 1 to 128');
  }
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 64) {
    throw new Error('Sweep iterations must be an integer from 1 to 64');
  }
  sweepTransform = { translation, rotationDegrees, scale };
  sweepOptions = {
    path: readSweepPath(sweepPath.value),
    segments,
    iterations,
    snapToInteger: sweepSnap.checked,
    textureLock: textureLock.checked,
  };
}

function refreshSweepPreview(announce = true): void {
  if (activeTool !== 'sweep') return;
  const faces = selectedFaceReferences(session.selection);
  if (faces.length === 0) {
    sweepCandidate = null;
    renderer?.setDocument(session.document, session.selection);
    renderer?.setSweepCaps([]);
    applySweepButton.disabled = true;
    sweepGeneratedCount.textContent = '0 brushes';
    if (announce) statusMessage.textContent = 'Select one or more brush faces before sweeping.';
    return;
  }
  try {
    const candidate = session.createSweepCandidate(
      faces,
      sweepTransform,
      { ...sweepOptions, textureLock: textureLock.checked },
      createSequentialIdFactory(`sweep-${sweepSequence + 1}`),
    );
    if (!candidate) throw new Error('Sweep did not produce a candidate');
    sweepCandidate = candidate;
    renderer?.setDocument(candidate.document, session.selection);
    renderer?.setSweepCaps(candidate.destinationCaps);
    applySweepButton.disabled = false;
    sweepGeneratedCount.textContent = `${candidate.insertions.length} ${candidate.insertions.length === 1 ? 'brush' : 'brushes'}`;
    updateInspector(candidate.document, session.selection);
    if (announce) {
      statusMessage.textContent = `Sweep preview: ${faces.length} ${faces.length === 1 ? 'face' : 'faces'} → ${candidate.insertions.length} brushes. Move the destination cap or press Enter to apply.`;
    }
  } catch (error) {
    sweepCandidate = null;
    renderer?.setDocument(session.document, session.selection);
    renderer?.setSweepCaps([]);
    applySweepButton.disabled = true;
    sweepGeneratedCount.textContent = 'invalid';
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
    updateInspector();
  }
}

function resetSweep(markEscapeReset = false): void {
  sweepTransform = cloneSweepTransform(sweepDefaultTransform);
  sweepOptions = {
    path: 'straight',
    segments: 4,
    iterations: 1,
    snapToInteger: false,
    textureLock: textureLock.checked,
  };
  sweepDragBase = null;
  sweepEscapeReset = markEscapeReset;
  syncSweepControls();
  refreshSweepPreview(false);
}

function applySweep(): void {
  if (!sweepCandidate) {
    statusMessage.textContent = 'Create a valid Sweep preview first.';
    return;
  }
  try {
    const candidate = sweepCandidate;
    sweepCandidate = null;
    session.commitBatchCreationCandidate(candidate);
    sweepSequence += 1;
    renderer?.setSweepCaps([]);
    setEditorTool('select');
    statusMessage.textContent = `${candidate.label}. Created ${candidate.insertions.length} brushes in one undoable step.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function handleSweepDrag(event: EditorSweepDragEvent): void {
  if (event.phase === 'cancel') {
    if (sweepDragBase) sweepTransform = cloneSweepTransform(sweepDragBase);
    sweepDragBase = null;
    syncSweepControls();
    refreshSweepPreview(false);
    statusMessage.textContent = 'Sweep destination adjustment cancelled.';
    return;
  }
  if (!sweepDragBase) sweepDragBase = cloneSweepTransform(sweepTransform);
  const base = sweepDragBase;
  if (event.mode === 'translate') {
    sweepTransform = {
      ...base,
      translation: base.translation.map((component, axis) => component + event.delta[axis]!) as [
        number,
        number,
        number,
      ],
    };
  } else if (event.mode === 'rotate') {
    const rotationDegrees = [...base.rotationDegrees] as [number, number, number];
    rotationDegrees[event.axis] += event.angleDegrees;
    sweepTransform = { ...base, rotationDegrees };
  } else {
    sweepTransform = { ...base, scale: Math.max(0.05, Math.min(20, base.scale * event.factor)) };
  }
  sweepEscapeReset = false;
  syncSweepControls();
  refreshSweepPreview(false);
  const detail =
    event.mode === 'translate'
      ? formatVector(event.delta)
      : event.mode === 'rotate'
        ? `${['X', 'Y', 'Z'][event.axis]} ${event.angleDegrees}°`
        : `×${event.factor}`;
  required<HTMLElement>('#pointer-context').textContent =
    `PERSPECTIVE / sweep ${event.mode} ${detail}`;
  statusMessage.textContent =
    event.phase === 'commit'
      ? `Sweep destination ${event.mode} set. Press Enter to generate the brushes.`
      : `Sweep ${event.mode} preview: ${detail}. Release to place the destination cap.`;
  if (event.phase === 'commit') sweepDragBase = null;
}

function isTransformTool(tool: EditorTool): tool is 'rotate' | 'scale' | 'shear' {
  return tool === 'rotate' || tool === 'scale' || tool === 'shear';
}

function isTopologyTool(tool: EditorTool): tool is 'vertex' | 'edge' {
  return tool === 'vertex' || tool === 'edge';
}

function handleTopologyDrag(event: EditorTopologyDragEvent): void {
  const pointerContext = required<HTMLElement>('#pointer-context');
  const insertion = event.operation === 'insert';
  const snapping = event.operation === 'snap';
  const label = insertion
    ? 'Vertex insertion'
    : snapping
      ? 'Vertex snap'
      : event.kind === 'vertex'
        ? 'Vertex'
        : 'Edge';
  const hasMovement = event.delta.some((component) => Math.abs(component) > Number.EPSILON);
  if (event.phase === 'cancel' || !hasMovement) {
    topologyCandidate = null;
    renderer?.setDocument(session.document, session.selection);
    updateInspector();
    if (event.phase === 'cancel') statusMessage.textContent = `${label} move cancelled.`;
    pointerContext.textContent = `${event.viewport.toUpperCase()} / ${event.kind}`;
    return;
  }
  try {
    const ids = createSequentialIdFactory(`topology-${topologySequence + 1}`);
    const candidate = insertion
      ? event.vertices[0]
        ? session.createVertexInsertionCandidate(
            event.brushIds[0] ?? event.selection.brushId,
            event.vertices[0],
            event.delta,
            ids,
            textureLock.checked,
          )
        : null
      : snapping && event.anchor && event.target
        ? session.createVertexSnapCandidate(
            selectedBrushIds(event.selection),
            event.vertices,
            event.anchor,
            event.target,
            ids,
            textureLock.checked,
          )
        : session.createBrushSetVertexMoveCandidate(
            selectedBrushIds(event.selection),
            event.vertices,
            event.delta,
            ids,
            textureLock.checked,
          );
    if (!candidate) return;
    if (event.phase === 'preview') {
      topologyCandidate = candidate;
      renderer?.setDocument(candidate.document, session.selection);
      updateInspector(candidate.document, session.selection);
      statusMessage.textContent = `${label} preview: ${formatVector(event.delta)} (${event.snapMode} snap; ${movementDescription(event)}). Release to commit.`;
      pointerContext.textContent = `${event.viewport.toUpperCase()} / ${insertion ? 'insert' : event.kind} ${formatVector(event.delta)}`;
      return;
    }
    session.commitCandidate(topologyCandidate ?? candidate);
    topologyCandidate = null;
    topologySequence += 1;
    pointerContext.textContent = `${event.viewport.toUpperCase()} / ${event.kind}`;
  } catch (error) {
    topologyCandidate = null;
    renderer?.setDocument(session.document, session.selection);
    updateInspector();
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
    pointerContext.textContent = `${event.viewport.toUpperCase()} / ${event.kind} invalid`;
  }
}

function commitTopologyNudge(
  delta: Vec3,
  viewport: EditorPointerPositionEvent['viewport'],
): boolean {
  if (!topologySelectionKind || topologySelectedVertices.length === 0) return false;
  const selection = session.selection;
  if (!selection?.brushId || selection.faceId) return false;
  try {
    const candidate = session.createBrushSetVertexMoveCandidate(
      selectedBrushIds(selection),
      topologySelectedVertices,
      delta,
      createSequentialIdFactory(`topology-${topologySequence + 1}`),
      textureLock.checked,
    );
    if (!candidate) return false;
    const label = topologySelectionKind === 'vertex' ? 'Nudge vertices' : 'Nudge edges';
    renderer?.translateTopologySelection(delta);
    session.commitCandidate({ ...candidate, label });
    topologySequence += 1;
    required<HTMLElement>('#pointer-context').textContent =
      `${viewport.toUpperCase()} / ${topologySelectionKind} ${formatVector(delta)}`;
    return true;
  } catch (error) {
    renderer?.setDocument(session.document, session.selection);
    updateInspector();
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
    return true;
  }
}

function commitFaceNudge(delta: Vec3, viewport: EditorPointerPositionEvent['viewport']): boolean {
  if (activeTool !== 'face') return false;
  const faces = selectedFaceReferences(session.selection);
  if (faces.length === 0) return false;
  try {
    const candidate = session.createFaceSetTranslationCandidate(
      faces,
      delta,
      createSequentialIdFactory(`face-move-${faceTranslationSequence + 1}`),
      textureLock.checked,
    );
    if (!candidate) return false;
    const label = faces.length === 1 ? 'Nudge face' : 'Nudge faces';
    session.commitCandidate({ ...candidate, label });
    faceTranslationSequence += 1;
    required<HTMLElement>('#pointer-context').textContent =
      `${viewport.toUpperCase()} / face ${formatVector(delta)}`;
    return true;
  } catch (error) {
    renderer?.setDocument(session.document, session.selection);
    updateInspector();
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
    return true;
  }
}

function viewportKeyboardNudge(
  key: string,
  viewport: EditorPointerPositionEvent['viewport'],
  verticalPerspective: boolean,
): Vec3 | null {
  const delta: [number, number, number] = [0, 0, 0];
  const horizontalDirection = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  const verticalDirection = key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0;
  if (horizontalDirection === 0 && verticalDirection === 0) return null;
  if (viewport === 'xy') {
    delta[horizontalDirection === 0 ? 1 : 0] =
      activeGridSize * (horizontalDirection || verticalDirection);
    return delta;
  }
  if (viewport === 'xz') {
    delta[horizontalDirection === 0 ? 2 : 0] =
      activeGridSize * (horizontalDirection || verticalDirection);
    return delta;
  }
  if (viewport === 'yz') {
    delta[horizontalDirection === 0 ? 2 : 1] =
      activeGridSize * (horizontalDirection || verticalDirection);
    return delta;
  }
  if (verticalPerspective && verticalDirection !== 0) {
    delta[2] = activeGridSize * verticalDirection;
    return delta;
  }
  const yaw = perspectiveCamera?.yaw ?? 0;
  const basis: readonly [number, number] =
    horizontalDirection !== 0 ? [-Math.sin(yaw), Math.cos(yaw)] : [Math.cos(yaw), Math.sin(yaw)];
  const axis = Math.abs(basis[0]) >= Math.abs(basis[1]) ? 0 : 1;
  const direction = horizontalDirection || verticalDirection;
  delta[axis] = activeGridSize * direction * (basis[axis] >= 0 ? 1 : -1);
  return delta;
}

function selectedObjectBounds(document: MapDocument = session.document) {
  const selection = session.selection;
  if (!selection || selection.faceId) return null;
  const selectionBrushBounds = selectedBrushIds(selection).flatMap((selectedBrushId) => {
    const brush = findBrush(document, selectedBrushId);
    const derived = brush ? deriveBrush(brush) : null;
    return derived?.bounds ? [derived.bounds] : [];
  });
  const entityIds = new Set(selectedPointEntityIds(selection));
  const bounds = [
    ...selectionBrushBounds,
    ...document.entities.flatMap((entity) => {
      if (!entityIds.has(entity.id)) return [];
      const entityBounds = pointEntityBounds(entity);
      return entityBounds ? [entityBounds] : [];
    }),
  ];
  if (bounds.length === 0) return null;
  return {
    min: [
      Math.min(...bounds.map((entry) => entry.min[0])),
      Math.min(...bounds.map((entry) => entry.min[1])),
      Math.min(...bounds.map((entry) => entry.min[2])),
    ] as Vec3,
    max: [
      Math.max(...bounds.map((entry) => entry.max[0])),
      Math.max(...bounds.map((entry) => entry.max[1])),
      Math.max(...bounds.map((entry) => entry.max[2])),
    ] as Vec3,
  };
}

function selectedTopologyBounds() {
  if (topologySelectedVertices.length === 0) return null;
  return {
    min: [
      Math.min(...topologySelectedVertices.map((point) => point[0])),
      Math.min(...topologySelectedVertices.map((point) => point[1])),
      Math.min(...topologySelectedVertices.map((point) => point[2])),
    ] as Vec3,
    max: [
      Math.max(...topologySelectedVertices.map((point) => point[0])),
      Math.max(...topologySelectedVertices.map((point) => point[1])),
      Math.max(...topologySelectedVertices.map((point) => point[2])),
    ] as Vec3,
  };
}

function selectedTransformBounds(document: MapDocument = session.document) {
  return topologySelectionKind && topologySelectedVertices.length > 0
    ? selectedTopologyBounds()
    : selectedObjectBounds(document);
}

function selectedObjectKey(selection = session.selection): string | null {
  const brushIds = selectedBrushIds(selection);
  const entityIds = selectedPointEntityIds(selection);
  return brushIds.length + entityIds.length > 0
    ? `b:${brushIds.join('\u0000')}|e:${entityIds.join('\u0000')}`
    : null;
}

function selectedTransformKey(selection = session.selection): string | null {
  if (topologySelectionKind && topologySelectedVertices.length > 0) {
    return `${topologySelectionKind}:${topologySelectedVertices
      .map((point) => point.join(','))
      .toSorted()
      .join('|')}`;
  }
  return selectedObjectKey(selection);
}

function resetTransformPivot(): void {
  const selection = session.selection;
  const bounds = selectedTransformBounds();
  if (!selection || !bounds) {
    transformPivot = null;
    transformPivotSelectionKey = null;
    renderer?.setTransformPivot(null);
    return;
  }
  transformPivot = bounds.min.map(
    (component, axis) =>
      Math.round((component + bounds.max[axis]!) / 2 / activeGridSize) * activeGridSize,
  ) as [number, number, number];
  transformPivotSelectionKey = selectedTransformKey(selection);
  renderer?.setTransformPivot(transformPivot);
  updateInspector();
}

function readTransformPivot(): Vec3 {
  const pivot = [
    Number(transformPivotX.value),
    Number(transformPivotY.value),
    Number(transformPivotZ.value),
  ] as const;
  if (!pivot.every(Number.isFinite)) throw new Error('Transform pivot must contain finite values');
  transformPivot = pivot;
  renderer?.setTransformPivot(pivot);
  return pivot;
}

function readTransformAxis(input: HTMLSelectElement): TransformAxis {
  const axis = Number(input.value);
  if (axis !== 0 && axis !== 1 && axis !== 2) throw new Error('Invalid transform axis');
  return axis;
}

function candidateForTransformEvent(
  event: EditorTransformDragEvent,
): BrushEditCandidate | BrushBatchEditCandidate | DocumentEditCandidate | null {
  const brushIds = selectedBrushIds(event.selection);
  const componentIds = createSequentialIdFactory(
    `topology-transform-${topologyTransformSequence + 1}`,
  );
  const transformComponents = Boolean(topologySelectionKind && topologySelectedVertices.length > 0);
  if (event.tool === 'rotate') {
    if (transformComponents) {
      return session.createBrushSetVertexRotationCandidate(
        brushIds,
        topologySelectedVertices,
        event.pivot,
        event.axis,
        event.angleDegrees,
        componentIds,
        textureLock.checked,
      );
    }
    return session.createObjectRotationCandidate(
      event.selection,
      event.pivot,
      event.axis,
      event.angleDegrees,
      textureLock.checked,
      rotateUpdateEntityAngles.checked,
    );
  }
  if (event.tool === 'scale') {
    if (transformComponents) {
      return session.createBrushSetVertexScaleCandidate(
        brushIds,
        topologySelectedVertices,
        event.pivot,
        event.factors,
        componentIds,
        textureLock.checked,
      );
    }
    return session.createObjectScaleCandidate(
      event.selection,
      event.pivot,
      event.factors,
      textureLock.checked,
      rotateUpdateEntityAngles.checked,
    );
  }
  if (transformComponents) {
    return session.createBrushSetVertexShearCandidate(
      brushIds,
      topologySelectedVertices,
      event.pivot,
      event.sourceAxis,
      event.targetAxis,
      event.factor,
      componentIds,
      textureLock.checked,
    );
  }
  return session.createObjectShearCandidate(
    event.selection,
    event.pivot,
    event.sourceAxis,
    event.targetAxis,
    event.factor,
    textureLock.checked,
    rotateUpdateEntityAngles.checked,
  );
}

function commitTransformCandidate(
  candidate: BrushEditCandidate | BrushBatchEditCandidate | DocumentEditCandidate,
): void {
  if ('selectionAfter' in candidate) session.commitDocumentCandidate(candidate);
  else session.commitCandidate(candidate);
}

function handleTransformDrag(event: EditorTransformDragEvent): void {
  const pointerContext = required<HTMLElement>('#pointer-context');
  if (event.phase === 'cancel') {
    transformCandidate = null;
    renderer?.setDocument(session.document, session.selection);
    updateInspector();
    statusMessage.textContent = `${event.tool[0]!.toUpperCase()}${event.tool.slice(1)} cancelled.`;
    pointerContext.textContent = `${event.viewport.toUpperCase()} / ${event.tool}`;
    return;
  }
  try {
    const candidate = candidateForTransformEvent(event);
    if (!candidate) return;
    if (event.phase === 'preview') {
      transformCandidate = candidate;
      renderer?.setDocument(candidate.document, session.selection);
      updateInspector(candidate.document, session.selection);
      const detail =
        event.tool === 'rotate'
          ? `${event.angleDegrees}°`
          : event.tool === 'scale'
            ? formatVector(event.factors)
            : `${event.offset > 0 ? '+' : ''}${event.offset}`;
      statusMessage.textContent = `${topologySelectionKind ? 'Component ' : ''}${event.tool} preview: ${detail}. Release to commit.`;
      pointerContext.textContent = `${event.viewport.toUpperCase()} / ${event.tool} ${detail}`;
      return;
    }
    const transformedComponents = Boolean(
      topologySelectionKind && topologySelectedVertices.length > 0,
    );
    commitTransformCandidate(transformCandidate ?? candidate);
    if (transformedComponents) {
      renderer?.remapTopologySelection(event);
      topologyTransformSequence += 1;
      updateInspector();
    }
    transformCandidate = null;
    pointerContext.textContent = `${event.viewport.toUpperCase()} / ${event.tool}`;
  } catch (error) {
    transformCandidate = null;
    renderer?.setDocument(session.document, session.selection);
    updateInspector();
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function handleTransformPivotDrag(event: EditorTransformPivotDragEvent): void {
  const pointerContext = required<HTMLElement>('#pointer-context');
  const nextPivot = event.phase === 'cancel' ? event.startPivot : event.pivot;
  transformPivot = [...nextPivot] as Vec3;
  transformPivotSelectionKey = selectedTransformKey();
  renderer?.setTransformPivot(transformPivot);
  updateInspector();
  const constraint =
    event.axisRestriction === null ? '' : ` / ${['X', 'Y', 'Z'][event.axisRestriction]} locked`;
  if (event.phase === 'preview') {
    statusMessage.textContent = `Rotate pivot preview: ${formatVector(nextPivot)}${constraint}. Release to place it.`;
  } else if (event.phase === 'commit') {
    statusMessage.textContent = `Rotate pivot moved to ${formatVector(nextPivot)}${constraint}.`;
  } else {
    statusMessage.textContent = `Rotate pivot move cancelled at ${formatVector(nextPivot)}.`;
  }
  pointerContext.textContent = `${event.viewport.toUpperCase()} / rotate pivot ${formatVector(nextPivot)}${constraint}`;
}

function applyExactTransform(): void {
  const selection = session.selection;
  if (!selection || selection.faceId || !isTransformTool(activeTool)) {
    statusMessage.textContent = 'Select one or more objects and activate a transform tool first.';
    return;
  }
  try {
    const pivot = readTransformPivot();
    let candidate: BrushEditCandidate | BrushBatchEditCandidate | DocumentEditCandidate | null;
    let remapEvent: EditorTransformDragEvent | null = null;
    const brushIds = selectedBrushIds(selection);
    const transformComponents = Boolean(
      topologySelectionKind && topologySelectedVertices.length > 0,
    );
    const componentIds = createSequentialIdFactory(
      `topology-transform-${topologyTransformSequence + 1}`,
    );
    if (activeTool === 'rotate') {
      const axis = readTransformAxis(rotateAxis);
      const angleDegrees = Number(rotateAngle.value);
      remapEvent = {
        phase: 'commit',
        viewport: 'perspective',
        selection,
        pivot,
        tool: 'rotate',
        axis,
        angleDegrees,
      };
      candidate = transformComponents
        ? session.createBrushSetVertexRotationCandidate(
            brushIds,
            topologySelectedVertices,
            pivot,
            axis,
            angleDegrees,
            componentIds,
            textureLock.checked,
          )
        : session.createObjectRotationCandidate(
            selection,
            pivot,
            axis,
            angleDegrees,
            textureLock.checked,
            rotateUpdateEntityAngles.checked,
          );
    } else if (activeTool === 'scale') {
      const brushSelection = selection as BrushSelection;
      const factors = [Number(scaleX.value), Number(scaleY.value), Number(scaleZ.value)] as Vec3;
      remapEvent = {
        phase: 'commit',
        viewport: 'perspective',
        selection: brushSelection,
        pivot,
        tool: 'scale',
        factors,
      };
      candidate = transformComponents
        ? session.createBrushSetVertexScaleCandidate(
            brushIds,
            topologySelectedVertices,
            pivot,
            factors,
            componentIds,
            textureLock.checked,
          )
        : session.createObjectScaleCandidate(
            selection,
            pivot,
            factors,
            textureLock.checked,
            rotateUpdateEntityAngles.checked,
          );
    } else {
      const brushSelection = selection as BrushSelection;
      const sourceAxis = readTransformAxis(shearSourceAxis);
      const targetAxis = readTransformAxis(shearTargetAxis);
      const bounds = selectedTransformBounds();
      if (!bounds) return;
      const span = bounds.max[sourceAxis] - bounds.min[sourceAxis];
      if (span <= 1e-6) throw new Error('Cannot shear along a collapsed selection axis');
      const offset = Number(shearOffset.value);
      const factor = offset / span;
      remapEvent = {
        phase: 'commit',
        viewport: 'perspective',
        selection: brushSelection,
        pivot,
        tool: 'shear',
        sourceAxis,
        targetAxis,
        factor,
        offset,
      };
      candidate = transformComponents
        ? session.createBrushSetVertexShearCandidate(
            brushIds,
            topologySelectedVertices,
            pivot,
            sourceAxis,
            targetAxis,
            factor,
            componentIds,
            textureLock.checked,
          )
        : session.createObjectShearCandidate(
            selection,
            pivot,
            sourceAxis,
            targetAxis,
            factor,
            textureLock.checked,
            rotateUpdateEntityAngles.checked,
          );
    }
    if (!candidate) {
      statusMessage.textContent = 'The transform leaves the selection unchanged.';
      return;
    }
    commitTransformCandidate(candidate);
    if (transformComponents && remapEvent) {
      renderer?.remapTopologySelection(remapEvent);
      topologyTransformSequence += 1;
      updateInspector();
    }
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function flipSelectedObjects(axis: TransformAxis): void {
  const selection = session.selection;
  const bounds = selectedObjectBounds();
  if (!selection || selection.faceId || !bounds) {
    statusMessage.textContent = 'Select one or more objects before flipping.';
    return;
  }
  try {
    const pivot = bounds.min.map(
      (component, index) =>
        Math.round((component + bounds.max[index]!) / 2 / activeGridSize) * activeGridSize,
    ) as [number, number, number];
    const candidate = session.createObjectFlipCandidate(
      selection,
      pivot,
      axis,
      textureLock.checked,
      rotateUpdateEntityAngles.checked,
    );
    if (!candidate) return;
    session.commitDocumentCandidate(candidate);
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function setEntityProperty(key: string, value: string | null, protect = false): void {
  if (!activeEntityId) {
    statusMessage.textContent = 'Select a brush or point entity before editing entity properties.';
    return;
  }
  try {
    if (!session.setEntityProperty(activeEntityId, key, value, protect)) {
      statusMessage.textContent = 'Entity property is already up to date.';
    }
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function renderEntityProperties(mapDocument: MapDocument, selection: EditorSelection | null): void {
  const entity = selection?.entityId
    ? mapDocument.entities.find((candidate) => candidate.id === selection.entityId)
    : selection?.brushId
      ? mapDocument.entities.find((candidate) =>
          candidate.brushes.some((brush) => brush.id === selection.brushId),
        )
      : undefined;
  activeEntityId = entity?.id ?? null;
  entityClassname.textContent = entity?.properties.classname ?? '';
  entityProperties.replaceChildren();
  entityPropertyProtectedLabel.hidden = true;
  entityPropertyProtected.checked = false;
  if (!entity) return;

  const groups = deriveEditorGroups(mapDocument);
  const openGroup = groups.find((group) => group.id === openGroupId);
  let containingGroup = groups.find((group) => group.id === entity.properties['_tb_group']) ?? null;
  let insideOpenGroup = containingGroup?.id === openGroup?.id;
  while (!insideOpenGroup && containingGroup?.parentGroupId) {
    containingGroup = groups.find((group) => group.id === containingGroup!.parentGroupId) ?? null;
    insideOpenGroup = containingGroup?.id === openGroup?.id;
  }
  const canProtectProperties = Boolean(
    openGroup?.linkedGroupId &&
    linkedGroupSiblings(mapDocument, openGroup.id).length > 1 &&
    insideOpenGroup,
  );
  entityPropertyProtectedLabel.hidden = !canProtectProperties;
  const protectedProperties = new Set(protectedEntityProperties(entity));

  for (const [key, value] of Object.entries(entity.properties)) {
    if (key === '_tb_group' || key === '_tb_protected_properties') continue;
    const row = window.document.createElement('div');
    row.className = 'entity-property-row';
    const keyLabel = document.createElement('span');
    keyLabel.textContent = key;
    keyLabel.title = key;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.setAttribute('aria-label', `${key} value`);
    input.addEventListener('change', () => setEntityProperty(key, input.value));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.disabled = key === 'classname';
    remove.title = remove.disabled ? 'Every map entity needs a classname' : `Remove ${key}`;
    remove.addEventListener('click', () => setEntityProperty(key, null));
    if (canProtectProperties) {
      const protection = document.createElement('input');
      protection.type = 'checkbox';
      protection.checked = protectedProperties.has(key);
      protection.className = 'entity-property-protection';
      protection.setAttribute('aria-label', `Protect ${key}`);
      protection.title = 'Keep this value independent in this linked copy';
      protection.addEventListener('change', () => {
        try {
          session.setEntityPropertyProtected(entity.id, key, protection.checked);
        } catch (error) {
          statusMessage.textContent = error instanceof Error ? error.message : String(error);
        }
      });
      row.append(keyLabel, input, protection, remove);
    } else row.append(keyLabel, input, remove);
    entityProperties.append(row);
  }
}

function createDeveloperMaterial(
  name: string,
  base: readonly [number, number, number],
  grid: readonly [number, number, number],
): EditorMaterial {
  const size = 64;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const gridLine = x % 16 === 0 || y % 16 === 0;
      const checker = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
      const color = gridLine ? grid : base;
      rgba[offset] = Math.min(255, color[0] + checker * 7);
      rgba[offset + 1] = Math.min(255, color[1] + checker * 7);
      rgba[offset + 2] = Math.min(255, color[2] + checker * 7);
      rgba[offset + 3] = 255;
    }
  }
  return {
    name,
    sourceName: 'Built-in editor material',
    width: size,
    height: size,
    rgba,
    alphaTest: false,
  };
}

function createDiagnosticQuakePalette(): Uint8Array {
  const palette = new Uint8Array(768);
  for (let index = 0; index < 256; index += 1) {
    palette[index * 3] = (index & 7) * 36;
    palette[index * 3 + 1] = ((index >> 3) & 7) * 36;
    palette[index * 3 + 2] = ((index >> 6) & 3) * 85;
  }
  return palette;
}

function formatVector(value: readonly number[]): string {
  return value.map((component) => Number(component.toFixed(2))).join(' ');
}

function movementDescription(
  event: Pick<EditorBrushDragEvent, 'movementPlane' | 'axisRestriction'>,
): string {
  const plane =
    event.movementPlane === 'z'
      ? 'vertical Z'
      : event.movementPlane === 'xy'
        ? 'XY plane'
        : 'viewport plane';
  return event.axisRestriction === null
    ? plane
    : `${plane}, ${['X', 'Y', 'Z'][event.axisRestriction]} locked`;
}

function setCompileState(label: string, state: 'offline' | 'ready' | 'busy' | 'stale'): void {
  compileState.textContent = label;
  compileState.dataset.state = state;
}

function compiledPreviewCamera(document: MapDocument): {
  readonly position: Vec3;
  readonly yaw: number;
  readonly pitch: number;
} {
  const playerStart = document.entities.find((entity) => {
    const classname = entity.properties.classname?.toLowerCase();
    return classname === 'info_player_start' || classname === 'info_player_deathmatch';
  });
  const origin = playerStart?.properties.origin?.trim().split(/\s+/).map(Number);
  if (origin?.length === 3 && origin.every(Number.isFinite)) {
    const yawDegrees = Number(playerStart?.properties.angle ?? 0);
    return {
      position: [origin[0]!, origin[1]!, origin[2]! + 22],
      yaw: (Number.isFinite(yawDegrees) ? yawDegrees : 0) * (Math.PI / 180),
      pitch: -0.12,
    };
  }
  const bounds = brushesInDocument(document)
    .map((brush) => deriveBrush(brush).bounds)
    .filter((candidate) => candidate !== null);
  if (bounds.length === 0) return { position: [-256, -256, 192], yaw: Math.PI / 4, pitch: -0.35 };
  const minimum: [number, number, number] = [...bounds[0]!.min];
  const maximum: [number, number, number] = [...bounds[0]!.max];
  for (const bound of bounds.slice(1)) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis]!, bound.min[axis]!);
      maximum[axis] = Math.max(maximum[axis]!, bound.max[axis]!);
    }
  }
  const center: Vec3 = [
    (minimum[0] + maximum[0]) / 2,
    (minimum[1] + maximum[1]) / 2,
    (minimum[2] + maximum[2]) / 2,
  ];
  const distance = Math.max(
    maximum[0] - minimum[0],
    maximum[1] - minimum[1],
    maximum[2] - minimum[2],
    128,
  );
  return {
    position: [center[0] - distance * 1.8, center[1] - distance * 1.8, center[2] + distance * 1.1],
    yaw: Math.PI / 4,
    pitch: -0.38,
  };
}

function showCompiledPreview(show: boolean): void {
  showingCompiled = show && Boolean(compiledViewer);
  canvases.perspective.hidden = showingCompiled;
  compiledCanvas.hidden = !showingCompiled;
  perspectiveMode.textContent = showingCompiled ? 'COMPILED · FLY' : 'EDIT';
  togglePreviewButton.textContent = showingCompiled ? 'Show source' : 'Show compiled';
  if (showingCompiled) compiledViewer?.start();
  else compiledViewer?.stop();
}

async function installCompiledPreview(result: MapCompileResult): Promise<void> {
  const artifact = result.artifacts.find(
    (candidate) =>
      candidate.mediaType === 'application/x-quake-bsp' ||
      candidate.name.toLowerCase().endsWith('.bsp'),
  );
  if (!artifact) throw new Error('Compiler completed without returning a BSP artifact');
  const bspVersion =
    artifact.data.byteLength >= 4 ? new DataView(artifact.data).getInt32(0, true) : null;
  const needsDiagnosticPalette = bspVersion === 29 && !quakePalette;
  compiledPreviewWarning = needsDiagnosticPalette
    ? ' Using the diagnostic palette; load the map’s Quake palette for exact texture colors.'
    : null;
  compiledViewer?.dispose();
  compiledViewer = null;
  compiledCanvas.hidden = false;
  const { createWorldview } = await import('@jackharrhy/worldview');
  compiledViewer = await createWorldview({
    canvas: compiledCanvas,
    source: {
      bsp: artifact.data,
      wads: [...loadedWadSources.values()],
      ...(bspVersion === 29 ? { palette: quakePalette ?? diagnosticQuakePalette } : {}),
    },
    controls: 'fly',
    autoStart: true,
    audio: false,
    textureFiltering: 'nearest',
    clearColor: [0.105, 0.12, 0.145, 1],
  });
  compiledViewer.setCamera(compiledPreviewCamera(session.document));
  compiledRevision = result.sourceDocumentRevision;
  togglePreviewButton.disabled = false;
  showCompiledPreview(true);
}

async function compilePreview(): Promise<void> {
  compileButton.disabled = true;
  setCompileState('COMPILING PREVIEW', 'busy');
  statusMessage.textContent = `Sending document revision ${session.document.revision} to the compiler.`;
  try {
    const assets = compileAssets();
    const outcome = await compilerCoordinator.compile(
      {
        mapName: 'worldview_preview',
        mapText: serializeCompileDocument(assets),
        quality: 'preview',
        expectedDocumentRevision: session.document.revision,
        assets: assets.map(({ name, data }) => ({
          name,
          mediaType: 'application/x-wad',
          data,
        })),
      },
      () => session.document.revision,
    );
    if (outcome.status === 'cancelled') {
      setCompileState('COMPILE CANCELLED', 'offline');
      statusMessage.textContent = 'Compile cancelled.';
      return;
    }
    if (outcome.status === 'stale') {
      setCompileState('RESULT STALE', 'stale');
      statusMessage.textContent =
        'Compile finished, but the source changed. Result was not installed.';
      return;
    }
    await installCompiledPreview(outcome.result);
    setCompileState(`COMPILED R${outcome.result.sourceDocumentRevision}`, 'ready');
    statusMessage.textContent = `Compiled preview installed in ${Math.round(outcome.result.elapsedMilliseconds)} ms.${compiledPreviewWarning ?? ''}`;
  } catch (error) {
    showCompiledPreview(false);
    setCompileState('COMPILER ERROR', 'offline');
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    compileButton.disabled = false;
  }
}

async function checkCompilerService(): Promise<void> {
  try {
    const health = new URL('/health', compilerEndpoint);
    const response = await fetch(health);
    if (response.ok) setCompileState('COMPILER READY', 'ready');
    else setCompileState('COMPILER UNCONFIGURED', 'offline');
  } catch {
    setCompileState('COMPILER OFFLINE', 'offline');
  }
}

function effectiveObjectViewState(document: MapDocument = session.document): EditorObjectViewState {
  const base = session.objectViewStateFor(document);
  if (!openGroupId) return base;
  const group = deriveEditorGroups(document).find((candidate) => candidate.id === openGroupId);
  if (!group) {
    openGroupId = null;
    session.setEditingGroup(null);
    renderer?.setOpenGroupId(null);
    return base;
  }
  const editableBrushes = new Set(group.brushIds);
  const editableEntities = new Set(group.pointEntityIds);
  return {
    ...base,
    lockedBrushIds: [
      ...new Set([
        ...base.lockedBrushIds,
        ...brushesInDocument(document)
          .map((brush) => brush.id)
          .filter((candidateBrushId) => !editableBrushes.has(candidateBrushId)),
      ]),
    ],
    lockedEntityIds: [
      ...new Set([
        ...base.lockedEntityIds,
        ...document.entities
          .filter((entity) => pointEntityBounds(entity) !== null)
          .map((entity) => entity.id)
          .filter((entityId) => !editableEntities.has(entityId)),
      ]),
    ],
  };
}

function openEditorGroup(groupId: string, selection: EditorSelection | null = null): boolean {
  const group = deriveEditorGroups(session.document).find((candidate) => candidate.id === groupId);
  if (!group) return false;
  openGroupId = groupId;
  session.setEditingGroup(groupId);
  renderer?.setOpenGroupId(groupId);
  session.select(selection);
  renderer?.setDocument(session.document, session.selection, effectiveObjectViewState());
  statusMessage.textContent = `Opened group ${group.name}. Objects outside it are locked.`;
  return true;
}

function closeEditorGroup(selectGroup = true): boolean {
  if (!openGroupId) return false;
  const group = deriveEditorGroups(session.document).find(
    (candidate) => candidate.id === openGroupId,
  );
  openGroupId = null;
  session.setEditingGroup(null);
  renderer?.setOpenGroupId(null);
  session.select(group && selectGroup ? selectionForEditorGroup(group) : null);
  renderer?.setDocument(session.document, session.selection, effectiveObjectViewState());
  statusMessage.textContent = group ? `Closed group ${group.name}.` : 'Closed the missing group.';
  return true;
}

function updateEntityLinkSummary(
  document: MapDocument = session.document,
  selection = session.selection,
): void {
  const links = deriveEntityLinks(document);
  const shown = visibleEntityLinks(
    links,
    selectedEntityIdsForLinks(document, selection),
    entityLinkMode,
  );
  entityLinkCount.textContent = `${shown.length} / ${links.length} shown`;
}

const DEFAULT_LAYER_TOKEN = '__default__';

function layerToken(layerId: EditorLayerId): string {
  return layerId ?? DEFAULT_LAYER_TOKEN;
}

function updateLayerActionButtons(
  layers: ReturnType<typeof deriveEditorLayers>,
  selection: EditorSelection | null,
): void {
  const selectedIndex = layers.findIndex((layer) => layer.id === selectedLayerId);
  const selected = layers[selectedIndex] ?? layers[0];
  if (!selected) return;
  const selectedCustomIndex = layers
    .filter((layer) => layer.id !== null)
    .findIndex((layer) => layer.id === selected.id);
  const customCount = layers.filter((layer) => layer.id !== null).length;
  const hasObjectSelection = Boolean(
    selection &&
    !selection.faceId &&
    selectedBrushIds(selection).length + selectedPointEntityIds(selection).length > 0,
  );
  moveSelectionToLayerButton.disabled = !hasObjectSelection;
  selectLayerButton.disabled =
    selected.hidden ||
    selected.locked ||
    selected.brushIds.length + selected.pointEntityIds.length === 0;
  isolateLayerButton.disabled = layers.length < 2;
  removeLayerButton.disabled = selected.id === null;
  layerUpButton.disabled = selectedCustomIndex <= 0;
  layerDownButton.disabled = selectedCustomIndex < 0 || selectedCustomIndex >= customCount - 1;
}

function selectLayerInPanel(
  layerId: EditorLayerId,
  layers: ReturnType<typeof deriveEditorLayers>,
  selection: EditorSelection | null,
): void {
  selectedLayerId = layerId;
  for (const row of layerList.querySelectorAll<HTMLElement>('[data-layer-id]')) {
    const selected = row.dataset.layerId === layerToken(layerId);
    row.classList.toggle('selected', selected);
    row.setAttribute('aria-selected', String(selected));
  }
  updateLayerActionButtons(layers, selection);
}

function renderLayers(
  document: MapDocument = session.document,
  selection: EditorSelection | null = session.selection,
): void {
  const layers = deriveEditorLayers(document);
  if (!layers.some((layer) => layer.id === selectedLayerId)) selectedLayerId = null;
  const active = layers.find((layer) => layer.id === session.activeLayerId) ?? layers[0];
  activeLayerName.textContent = `${active?.name ?? 'Default Layer'} active`;
  const signature = JSON.stringify({
    active: session.activeLayerId,
    selected: selectedLayerId,
    selection: selection
      ? {
          brushes: selectedBrushIds(selection),
          entities: selectedPointEntityIds(selection),
          face: selection.faceId,
        }
      : null,
    layers: layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      sort: layer.sortIndex,
      hidden: layer.hidden,
      locked: layer.locked,
      omit: layer.omitFromExport,
      brushes: layer.brushIds,
      entities: layer.pointEntityIds,
    })),
  });
  if (signature === layerPanelSignature) {
    updateLayerActionButtons(layers, selection);
    return;
  }
  layerPanelSignature = signature;
  layerList.replaceChildren();

  for (const layer of layers) {
    const row = window.document.createElement('div');
    row.className = 'layer-row';
    row.dataset.layerId = layerToken(layer.id);
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(layer.id === selectedLayerId));
    row.classList.toggle('selected', layer.id === selectedLayerId);
    row.classList.toggle('hidden-layer', layer.hidden);
    row.classList.toggle('locked-layer', layer.locked);
    row.classList.toggle('omitted-layer', layer.omitFromExport);
    row.addEventListener('click', () =>
      selectLayerInPanel(layer.id, deriveEditorLayers(session.document), session.selection),
    );

    const activeButton = window.document.createElement('button');
    activeButton.type = 'button';
    activeButton.className = 'layer-active';
    activeButton.textContent = layer.id === session.activeLayerId ? 'A' : '·';
    activeButton.setAttribute('aria-pressed', String(layer.id === session.activeLayerId));
    activeButton.setAttribute('aria-label', `Make ${layer.name} active`);
    activeButton.title =
      layer.id === session.activeLayerId ? 'Active insertion layer' : 'Make active layer';
    activeButton.addEventListener('click', () => {
      if (openGroupId) closeEditorGroup(false);
      selectedLayerId = layer.id;
      session.setActiveLayer(layer.id);
    });

    const name = window.document.createElement('input');
    name.className = 'layer-row-name';
    name.type = 'text';
    name.value = layer.name;
    name.readOnly = layer.id === null;
    name.setAttribute('aria-label', layer.id === null ? 'Default Layer' : `Rename ${layer.name}`);
    name.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      name.blur();
    });
    name.addEventListener('change', () => {
      if (layer.id === null || name.value.trim() === layer.name) return;
      try {
        selectedLayerId = layer.id;
        session.renameLayer(layer.id, name.value);
      } catch (error) {
        name.value = layer.name;
        statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });

    const count = window.document.createElement('span');
    count.className = 'layer-object-count';
    count.textContent = String(layer.brushIds.length + layer.pointEntityIds.length);
    count.title = `${layer.brushIds.length} brushes · ${layer.pointEntityIds.length} point entities`;

    const flagButton = (
      text: string,
      label: string,
      activeFlag: boolean,
      flag: 'hidden' | 'locked' | 'omit-from-export',
    ) => {
      const button = window.document.createElement('button');
      button.type = 'button';
      button.className = 'layer-flag';
      button.textContent = text;
      button.classList.toggle('active', activeFlag);
      button.setAttribute('aria-pressed', String(activeFlag));
      button.setAttribute('aria-label', label);
      button.title = label;
      button.addEventListener('click', () => {
        selectedLayerId = layer.id;
        session.setLayerFlag(layer.id, flag, !activeFlag);
      });
      return button;
    };

    row.append(
      activeButton,
      name,
      count,
      flagButton('V', `${layer.hidden ? 'Show' : 'Hide'} ${layer.name}`, layer.hidden, 'hidden'),
      flagButton('L', `${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`, layer.locked, 'locked'),
      flagButton(
        'X',
        `${layer.omitFromExport ? 'Include' : 'Omit'} ${layer.name} in compile export`,
        layer.omitFromExport,
        'omit-from-export',
      ),
    );
    layerList.append(row);
  }
  updateLayerActionButtons(layers, selection);
}

function setIssueBrowserOpen(open: boolean): void {
  issueBrowserOpen = open;
  issueBrowser.hidden = !open;
  editorShell.classList.toggle('issues-open', open);
  issueStatus.setAttribute('aria-expanded', String(open));
}

function setViewFilterPopoverOpen(open: boolean): void {
  viewFilterPopoverOpen = open;
  viewFilterPopover.hidden = !open;
  viewFilterToggle.setAttribute('aria-expanded', String(open));
  if (open) renderViewFilters();
}

function renderViewFilters(): void {
  const state = session.viewFilters;
  const hiddenClassnames = new Set(state.hiddenEntityClassnames);
  const hiddenSpecialTypes = new Set(state.hiddenSpecialBrushTypes);
  showWorldBrushes.checked = state.worldBrushesVisible;
  for (const input of document.querySelectorAll<HTMLInputElement>('[data-special-brush-filter]')) {
    input.checked = !hiddenSpecialTypes.has(
      input.dataset.specialBrushFilter as EditorSpecialBrushFilter,
    );
  }

  const filters = entityClassFiltersInDocument(session.document);
  const queryTerms = entityClassFilterSearch.value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const displayed = filters.filter(({ classname }) =>
    queryTerms.every((term) => classname.includes(term)),
  );
  entityClassFilterSummary.textContent = `${filters.length} ${filters.length === 1 ? 'class' : 'classes'}`;
  entityClassFilterList.replaceChildren();
  if (displayed.length === 0) {
    const empty = window.document.createElement('p');
    empty.className = 'entity-class-filter-empty';
    empty.textContent = filters.length === 0 ? 'No entity definitions in this map.' : 'No matches.';
    entityClassFilterList.append(empty);
  }
  for (const filter of displayed) {
    const row = window.document.createElement('label');
    row.className = 'view-filter-row entity-class-filter-row';
    row.dataset.entityClassname = filter.classname;
    const input = window.document.createElement('input');
    input.type = 'checkbox';
    input.checked = !hiddenClassnames.has(filter.classname);
    input.setAttribute('aria-label', `Show ${filter.classname}`);
    input.addEventListener('change', () => {
      session.setEntityClassVisible(filter.classname, input.checked);
    });
    const copy = window.document.createElement('span');
    const classname = window.document.createElement('b');
    classname.textContent = filter.classname;
    const count = window.document.createElement('small');
    const parts = [];
    if (filter.pointEntityCount > 0) parts.push(`${filter.pointEntityCount} point`);
    if (filter.brushEntityCount > 0) parts.push(`${filter.brushEntityCount} brush`);
    count.textContent = `${parts.join(' · ')} ${filter.pointEntityCount + filter.brushEntityCount === 1 ? 'entity' : 'entities'}`;
    copy.append(classname, count);
    row.append(input, copy);
    entityClassFilterList.append(row);
  }

  const filtered = session.filteredObjectIds;
  const filteredCount = filtered.brushIds.length + filtered.entityIds.length;
  viewFilterCount.textContent = String(filteredCount);
  viewFilterCount.hidden = filteredCount === 0;
  viewFilterToggle.classList.toggle('active-filter', filteredCount > 0);
  viewFilterStatus.textContent = `${filteredCount} ${filteredCount === 1 ? 'object' : 'objects'} filtered · map source unchanged`;
}

function issueTypeLabel(type: EditorIssueType): string {
  return EDITOR_ISSUE_TYPE_INFO.find((entry) => entry.type === type)?.label ?? type;
}

function selectEditorIssue(issue: EditorIssue, reveal: boolean): void {
  if (reveal) {
    session.showAll();
    const brushIds = new Set(issue.brushIds);
    const entityIds = new Set(issue.entityIds);
    for (const layer of deriveEditorLayers(session.document)) {
      const containsIssue =
        (layer.entityId ? entityIds.has(layer.entityId) : false) ||
        layer.brushIds.some((candidateBrushId) => brushIds.has(candidateBrushId)) ||
        layer.pointEntityIds.some((entityId) => entityIds.has(entityId));
      if (containsIssue && layer.hidden) session.setLayerFlag(layer.id, 'hidden', false);
    }
  }
  const selection = session.selectIssue(issue.id);
  if (!selection) {
    statusMessage.textContent = `${issue.message} This finding is document-wide.`;
    return;
  }
  const focused = reveal ? renderer?.focusSelection() : false;
  statusMessage.textContent = reveal
    ? focused
      ? `Revealed and focused: ${issue.message}`
      : `Revealed: ${issue.message}`
    : `Selected: ${issue.message}`;
}

function renderIssues(): void {
  const issues = session.issues;
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  const hiddenCount = issues.filter((issue) => hiddenIssueIds.has(issue.id)).length;
  issueSummary.textContent = `${errors} ${errors === 1 ? 'error' : 'errors'} · ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}${hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}`;
  issueStatus.textContent = `Issues ${issues.length}`;
  issueStatus.dataset.state = errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'clean';

  const visible = issues.filter(
    (issue) =>
      enabledIssueTypes.has(issue.type) &&
      (showHiddenIssues.checked || !hiddenIssueIds.has(issue.id)),
  );
  issueList.replaceChildren();
  if (visible.length === 0) {
    const empty = window.document.createElement('div');
    empty.className = 'issue-list-empty';
    empty.textContent =
      issues.length === 0
        ? 'No issues found. The document is clean.'
        : 'No findings match the current filters.';
    issueList.append(empty);
    return;
  }

  for (const issue of visible) {
    const row = window.document.createElement('article');
    row.className = `issue-row ${issue.severity}`;
    row.dataset.issueId = issue.id;
    row.dataset.issueType = issue.type;
    row.classList.toggle('hidden-issue', hiddenIssueIds.has(issue.id));
    row.setAttribute('role', 'listitem');

    const select = window.document.createElement('button');
    select.type = 'button';
    select.className = 'issue-description';
    select.title = 'Select the implicated objects; use Reveal to show and frame them';
    const severity = window.document.createElement('span');
    severity.className = 'issue-severity';
    severity.textContent = issue.severity === 'error' ? 'ERROR' : 'WARN';
    const copy = window.document.createElement('span');
    copy.className = 'issue-copy';
    const message = window.document.createElement('strong');
    message.textContent = issue.message;
    const meta = window.document.createElement('small');
    const objectCount = issue.brushIds.length + issue.entityIds.length;
    meta.textContent = `${issueTypeLabel(issue.type)}${objectCount > 0 ? ` · ${objectCount} ${objectCount === 1 ? 'object' : 'objects'}` : ' · document'}`;
    copy.append(message, meta);
    select.append(severity, copy);
    select.addEventListener('click', () => selectEditorIssue(issue, false));
    select.addEventListener('dblclick', () => selectEditorIssue(issue, true));

    const actions = window.document.createElement('div');
    actions.className = 'issue-actions';
    const reveal = window.document.createElement('button');
    reveal.type = 'button';
    reveal.textContent = 'Reveal';
    reveal.addEventListener('click', () => selectEditorIssue(issue, true));
    actions.append(reveal);

    if (issue.fix) {
      const fix = window.document.createElement('button');
      fix.type = 'button';
      fix.className = 'issue-fix';
      fix.textContent = 'Fix';
      fix.title = issue.fix.label;
      fix.addEventListener('click', () => {
        try {
          if (!session.fixIssue(issue.id)) {
            statusMessage.textContent = 'That issue changed before its fix could be applied.';
          }
        } catch (error) {
          statusMessage.textContent = error instanceof Error ? error.message : String(error);
        }
      });
      actions.append(fix);
    }

    const hide = window.document.createElement('button');
    hide.type = 'button';
    const hidden = hiddenIssueIds.has(issue.id);
    hide.textContent = hidden ? 'Show' : 'Hide';
    hide.addEventListener('click', () => {
      if (hidden) hiddenIssueIds.delete(issue.id);
      else hiddenIssueIds.add(issue.id);
      renderIssues();
    });
    actions.append(hide);
    row.append(select, actions);
    issueList.append(row);
  }
}

function updateInspector(
  document: MapDocument = session.document,
  selection = session.selection,
): void {
  const brushes = brushesInDocument(document);
  const invalid = brushes
    .flatMap((brush) => deriveBrush(brush).diagnostics)
    .filter((diagnostic) => diagnostic.severity === 'error');
  documentRevision.textContent = String(document.revision);
  entityCount.textContent = String(
    document.entities.filter(
      (entity) => !isEditorGroupEntity(entity) && !isEditorLayerEntity(entity),
    ).length,
  );
  brushCount.textContent = String(brushes.length);
  const groups = deriveEditorGroups(document);
  groupCount.textContent = String(groups.length);
  geometryState.textContent = invalid.length === 0 ? 'valid' : `${invalid.length} errors`;
  geometryState.classList.toggle('error-text', invalid.length > 0);
  renderIssues();
  renderViewFilters();
  const objectViewState = effectiveObjectViewState(document);
  hiddenObjectCount.textContent = String(
    objectViewState.hiddenBrushIds.length + objectViewState.hiddenEntityIds.length,
  );
  lockedObjectCount.textContent = String(
    objectViewState.lockedBrushIds.length + objectViewState.lockedEntityIds.length,
  );
  renderLayers(document, selection);
  updateEntityLinkSummary(document, selection);
  undoButton.disabled = !session.canUndo;
  undoButton.title = session.undoLabel ? `Undo ${session.undoLabel}` : 'Nothing to undo';
  redoButton.disabled = !session.canRedo;
  redoButton.title = session.redoLabel ? `Redo ${session.redoLabel}` : 'Nothing to redo';
  const repeatLabels = session.repeatCommandLabels;
  repeatCommandsButton.disabled = !session.canRepeatCommands;
  repeatCommandsButton.textContent =
    repeatLabels.length > 0 ? `Repeat ${repeatLabels.length}` : 'Repeat';
  repeatCommandsButton.title =
    repeatLabels.length > 0
      ? `Repeat ${repeatLabels.join(' → ')} (Ctrl/Command+Shift+R)`
      : 'Record duplicate, move, rotate, flip, scale, or shear commands first';
  clearRepeatCommandsButton.disabled = repeatLabels.length === 0;
  clearRepeatCommandsButton.title =
    repeatLabels.length > 0
      ? `Clear ${repeatLabels.join(' → ')} and start a new sequence`
      : 'No recorded command sequence';
  simpleShapeToolSection.hidden = activeTool !== 'create';
  pointEntityToolSection.hidden = activeTool !== 'entity';
  hullToolSection.hidden = activeTool !== 'hull';
  hullPointCount.textContent = `${hullBuildPoints.length} ${hullBuildPoints.length === 1 ? 'point' : 'points'}`;
  createHullButton.disabled = !hullCandidate;
  discardHullButton.disabled = hullBuildPoints.length === 0;

  const objectBrushIds = selection?.faceId
    ? [...new Set(selectedFaceReferences(selection).map((reference) => reference.brushId))]
    : selectedBrushIds(selection);
  const objectBrushes = objectBrushIds.flatMap((selectedBrushId) => {
    const candidate = findBrush(document, selectedBrushId);
    return candidate ? [candidate] : [];
  });
  const objectEntityIds = selectedPointEntityIds(selection);
  const pointEntity = selection?.entityId
    ? (document.entities.find((entity) => entity.id === selection.entityId) ?? null)
    : null;
  const brush = selection?.brushId ? findBrush(document, selection.brushId) : null;
  const selectedFaces = selectedFaceReferences(selection).flatMap((reference) => {
    const owner = findBrush(document, reference.brushId);
    const face = owner?.faces.find((candidate) => candidate.id === reference.faceId);
    return face ? [{ reference, face }] : [];
  });
  const objectSelected = Boolean(
    selectedFaces.length === 0 && objectBrushIds.length + objectEntityIds.length > 0,
  );
  const selectedGroup = selectedEditorGroup(document, selection);
  const openGroup = groups.find((group) => group.id === openGroupId) ?? null;
  const presentedGroup = selectedGroup ?? openGroup;
  const linkedCopies = presentedGroup ? linkedGroupSiblings(document, presentedGroup.id).length : 0;
  groupSection.hidden = !objectSelected && !openGroup;
  groupState.textContent = openGroup
    ? openGroup.linkedGroupId
      ? `Editing linked · ${linkedCopies} copies`
      : `Editing ${openGroup.name}`
    : selectedGroup
      ? selectedGroup.linkedGroupId
        ? `Linked · ${linkedCopies} copies`
        : `${selectedGroup.brushIds.length + selectedGroup.pointEntityIds.length} objects`
      : 'Selection';
  if (presentedGroup && window.document.activeElement !== groupName) {
    groupName.value = presentedGroup.name;
  }
  createGroupButton.hidden = Boolean(selectedGroup && !openGroup);
  renameGroupButton.hidden = !presentedGroup;
  openGroupButton.hidden = !selectedGroup || selectedGroup.id === openGroupId;
  closeGroupButton.hidden = !openGroup;
  createLinkedDuplicateButton.hidden = !selectedGroup || Boolean(openGroup);
  unlinkGroupButton.hidden = !selectedGroup?.linkedGroupId || Boolean(openGroup);
  ungroupButton.hidden = !selectedGroup;
  const brushObjectSelected = Boolean(brush && selectedFaces.length === 0 && !selectedGroup);
  const selectionBrushOwners = objectBrushIds.flatMap((selectedBrushId) => {
    const owner = document.entities.find((entity) =>
      entity.brushes.some((candidate) => candidate.id === selectedBrushId),
    );
    return owner ? [owner] : [];
  });
  const selectionBrushEligible = Boolean(
    brushObjectSelected &&
    objectEntityIds.length === 0 &&
    !selection?.groupId &&
    selectionBrushOwners.length === objectBrushIds.length &&
    selectionBrushOwners.every(
      (owner) =>
        owner.properties.classname === 'worldspawn' ||
        isEditorGroupEntity(owner) ||
        isEditorLayerEntity(owner),
    ),
  );
  selectionBrushSection.hidden = !selectionBrushEligible;
  selectionBrushCount.textContent = `${objectBrushIds.length} ${objectBrushIds.length === 1 ? 'volume' : 'volumes'}`;
  const primaryBrushOwner = selection?.brushId
    ? document.entities.find((entity) =>
        entity.brushes.some((candidate) => candidate.id === selection.brushId),
      )
    : null;
  entitySection.hidden = Boolean(
    selectedGroup || (primaryBrushOwner && isEditorGroupEntity(primaryBrushOwner)),
  );
  renderEntityProperties(document, selection);
  duplicateButton.disabled = !objectSelected;
  copyButton.disabled = !objectSelected && selectedFaces.length === 0;
  copyButton.title =
    selectedFaces.length > 0
      ? 'Copy the primary face material and attributes (Ctrl/Command+C)'
      : 'Copy selected objects as map text (Ctrl/Command+C)';
  pasteHereButton.disabled = !lastPointerPosition;
  deleteButton.disabled = !objectSelected;
  focusSelectionButton.disabled = !selection;
  hideSelectionButton.disabled = !objectSelected;
  isolateSelectionButton.disabled = !objectSelected;
  showAllButton.disabled = !session.canShowAll;
  lockSelectionButton.disabled = !objectSelected;
  unlockAllButton.disabled = !session.canUnlockAll;
  selectionEmpty.hidden = Boolean(brush || pointEntity);
  selectionInspector.hidden = !brush && !pointEntity;
  applyMaterialButton.disabled = !brush || materialName.value.trim().length === 0;
  const face =
    brush && selection?.faceId
      ? brush.faces.find((candidate) => candidate.id === selection.faceId)
      : undefined;
  const faceSelectionKeys = new Set(
    selectedFaces.map(({ reference }) => `${reference.brushId}\u0000${reference.faceId}`),
  );
  const matchingFaces = selection?.faceId
    ? matchingBrushFaces(
        document,
        { brushId: selection.brushId, faceId: selection.faceId },
        selectedFaces.map(({ reference }) => reference.brushId),
      )
    : [];
  const faceSetExtrudable =
    faceSelectionKeys.size > 0 &&
    matchingFaces.length === faceSelectionKeys.size &&
    matchingFaces.every((candidate) =>
      faceSelectionKeys.has(`${candidate.brushId}\u0000${candidate.faceId}`),
    );
  selectionKind.textContent = selectedGroup
    ? selectedGroup.linkedGroupId
      ? 'Linked Group'
      : 'Group'
    : selectedFaces.length > 1
      ? `${selectedFaces.length} Faces`
      : face
        ? 'Face'
        : brush
          ? objectEntityIds.length > 0
            ? `${objectBrushIds.length + objectEntityIds.length} Objects`
            : objectBrushIds.length > 1
              ? `${objectBrushIds.length} Brushes`
              : 'Brush'
          : pointEntity
            ? objectBrushIds.length > 0
              ? `${objectBrushIds.length + objectEntityIds.length} Objects`
              : objectEntityIds.length > 1
                ? `${objectEntityIds.length} Entities`
                : 'Entity'
            : 'None';
  faceExtrudeSection.hidden = !faceSetExtrudable;
  sweepToolSection.hidden = activeTool !== 'sweep' || selectedFaces.length === 0;
  applySweepButton.disabled = !sweepCandidate;
  if (activeTool === 'sweep') {
    sweepGeneratedCount.textContent = sweepCandidate
      ? `${sweepCandidate.insertions.length} ${sweepCandidate.insertions.length === 1 ? 'brush' : 'brushes'}`
      : '0 brushes';
  }
  clipToolSection.hidden = activeTool !== 'clip' || !brushObjectSelected;
  const transformActive = isTransformTool(activeTool);
  const topologyActive = isTopologyTool(activeTool);
  const transformSelectionSupported = transformActive && objectSelected;
  transformToolSection.hidden = !transformSelectionSupported;
  objectFlipSection.hidden = !objectSelected;
  rotateUpdateEntityAngles.disabled = objectEntityIds.length === 0;
  topologyToolSection.hidden = !topologyActive || !brushObjectSelected;
  csgSection.hidden = !brushObjectSelected;
  brushEntityActions.hidden = !brushObjectSelected;
  const worldspawn = document.entities.find(
    (entity) => entity.properties.classname?.toLowerCase() === 'worldspawn',
  );
  const selectedBrushOwners = objectBrushIds.flatMap((selectedBrushId) => {
    const owner = document.entities.find((entity) =>
      entity.brushes.some((candidate) => candidate.id === selectedBrushId),
    );
    return owner ? [owner] : [];
  });
  makeStructuralButton.disabled =
    !brushObjectSelected ||
    !worldspawn ||
    selectedBrushOwners.every((owner) => owner.id === worldspawn.id);
  makeBrushEntityButton.disabled = !brushObjectSelected || brushEntityClassname.value.trim() === '';
  csgSelectionCount.textContent = `${objectBrushIds.length} selected`;
  csgMergeButton.disabled = objectBrushIds.length < 2;
  csgIntersectButton.disabled = objectBrushIds.length < 2;
  if (topologyActive) {
    topologyToolTitle.textContent = activeTool === 'vertex' ? 'Vertex editing' : 'Edge editing';
    topologyGridSize.textContent = String(activeGridSize);
  }
  for (const panel of window.document.querySelectorAll<HTMLElement>('[data-transform-panel]')) {
    panel.hidden = !transformActive || panel.dataset.transformPanel !== activeTool;
  }
  if (transformSelectionSupported) {
    const selectionKey = selectedTransformKey(selection);
    const selectionBounds = selectedTransformBounds(document);
    if (selectionBounds && (!transformPivot || transformPivotSelectionKey !== selectionKey)) {
      transformPivot = selectionBounds.min.map(
        (component, axis) =>
          Math.round((component + selectionBounds.max[axis]!) / 2 / activeGridSize) *
          activeGridSize,
      ) as [number, number, number];
      transformPivotSelectionKey = selectionKey;
    }
    const objectCount = objectBrushIds.length + objectEntityIds.length;
    transformToolTitle.textContent =
      topologySelectionKind && topologySelectedVertices.length > 0
        ? `${activeTool === 'rotate' ? 'Rotate' : activeTool === 'scale' ? 'Scale' : 'Shear'} selected ${topologySelectionKind === 'vertex' ? 'vertices' : 'edges'}`
        : activeTool === 'rotate'
          ? objectBrushIds.length > 0 && objectEntityIds.length > 0
            ? `Rotate ${objectCount} objects`
            : objectEntityIds.length > 0
              ? objectEntityIds.length > 1
                ? 'Rotate entities'
                : 'Rotate entity'
              : objectBrushIds.length > 1
                ? 'Rotate brushes'
                : 'Rotate brush'
          : activeTool === 'scale'
            ? objectBrushIds.length > 1
              ? 'Scale brushes'
              : 'Scale brush'
            : objectBrushIds.length > 1
              ? 'Shear brushes'
              : 'Shear brush';
    transformToolHelp.textContent =
      activeTool === 'scale'
        ? 'Drag a side, edge, or corner handle. Alt anchors at center; Shift scales proportional axes.'
        : activeTool === 'rotate' && objectEntityIds.length > 0
          ? 'Drag the yellow center to move the pivot (Alt for Z, Shift to lock an axis), or a ring to rotate. Supported entity headings rotate with their origins.'
          : activeTool === 'rotate'
            ? 'Drag the yellow center to move the pivot (Alt for Z, Shift to lock an axis), or a ring to rotate.'
            : 'Drag the viewport handle for a live snapped preview.';
    if (transformPivot) {
      renderer?.setTransformPivot(transformPivot);
      transformPivotX.value = String(transformPivot[0]);
      transformPivotY.value = String(transformPivot[1]);
      transformPivotZ.value = String(transformPivot[2]);
    }
  }
  faceExtrudeDistance.step = String(activeGridSize);
  shearOffset.step = String(activeGridSize);
  for (const input of [
    textureShiftU,
    textureShiftV,
    textureScaleU,
    textureScaleV,
    textureRotation,
  ]) {
    input.disabled = !face;
  }
  applyTextureTransformButton.disabled = !face;
  for (const button of window.document.querySelectorAll<HTMLButtonElement>(
    '[data-texture-align], [data-texture-layout]',
  )) {
    button.disabled = !brush;
  }
  if (!brush) {
    uvEditor.setFace(null);
    textureUAxis.textContent = 'Select a face';
    textureVAxis.textContent = 'Select a face';
    if (pointEntity) {
      const bounds = pointEntityBounds(pointEntity);
      brushId.textContent =
        objectEntityIds.length > 1
          ? `${pointEntity.id} · ${objectEntityIds.length} selected`
          : pointEntity.id;
      brushRevision.textContent = 'entity';
      brushFaces.textContent = '0';
      brushBounds.textContent = bounds
        ? `${formatVector(bounds.min)} to ${formatVector(bounds.max)}`
        : 'invalid origin';
      faceMaterial.textContent = pointEntity.properties.classname ?? 'entity';
    }
    return;
  }
  const derived = deriveBrush(brush);
  const derivedFace = face
    ? derived.faces.find((candidate) => candidate.faceId === face.id)
    : undefined;
  uvEditor.setFace(
    face && derivedFace
      ? {
          selection: { brushId: brush.id, faceId: face.id },
          face,
          vertices: derivedFace.vertices,
          selectedFaceCount: selectedFaces.length,
          material: materialCatalog.find(face.material),
        }
      : null,
  );
  const objectBounds = brushObjectSelected ? selectedObjectBounds(document) : derived.bounds;
  brushId.textContent =
    objectBrushIds.length > 1 ? `${brush.id} · ${objectBrushIds.length} selected` : brush.id;
  const revisions = new Set(objectBrushes.map((candidate) => candidate.revision));
  brushRevision.textContent = revisions.size === 1 ? String(brush.revision) : 'mixed';
  brushFaces.textContent = String(
    brushObjectSelected
      ? objectBrushes.reduce((total, candidate) => total + candidate.faces.length, 0)
      : brush.faces.length,
  );
  brushBounds.textContent = objectBounds
    ? `${formatVector(objectBounds.min)} to ${formatVector(objectBounds.max)}`
    : 'invalid';
  const selectedMaterials = new Set(selectedFaces.map((entry) => entry.face.material));
  const objectMaterials = new Set(
    objectBrushes.flatMap((candidate) => candidate.faces.map((entry) => entry.material)),
  );
  faceMaterial.textContent =
    selectedFaces.length === 0
      ? objectMaterials.size === 1
        ? (objectBrushes[0]?.faces[0]?.material ?? 'multiple')
        : 'multiple'
      : selectedMaterials.size === 1
        ? selectedFaces[0]!.face.material
        : 'mixed';
  faceNormal.textContent = derivedFace ? `N ${formatVector(derivedFace.normal)}` : '';
  if (face) {
    textureShiftU.value = String(face.projection.offset[0]);
    textureShiftV.value = String(face.projection.offset[1]);
    textureScaleU.value = String(face.projection.scale[0]);
    textureScaleV.value = String(face.projection.scale[1]);
    textureRotation.value = String(face.projection.rotationDegrees);
    textureUAxis.textContent = formatVector(face.projection.uAxis);
    textureVAxis.textContent = formatVector(face.projection.vAxis);
  }
}

function selectedMaterialToken(): string {
  return materialName.value.trim() || activeMaterialName;
}

function updateMaterialBrowserControls(): void {
  const material = selectedMaterialToken();
  const hasMaterial = material.length > 0;
  selectMaterialFacesButton.disabled = !hasMaterial;
  selectMaterialBrushesButton.disabled = !hasMaterial;
  setMaterialReplaceSourceButton.disabled = !hasMaterial;
  setMaterialReplaceTargetButton.disabled = !hasMaterial;

  const sourceMaterial = materialReplaceSource.value.trim();
  const targetMaterial = materialReplaceTarget.value.trim();
  materialReplaceButton.disabled =
    !sourceMaterial ||
    !targetMaterial ||
    sourceMaterial.toLowerCase() === targetMaterial.toLowerCase();

  const selectedFaces = selectedFaceReferences(session.selection);
  if (selectedFaces.length > 0) {
    materialReplaceScope.textContent = `${selectedFaces.length} selected ${selectedFaces.length === 1 ? 'face' : 'faces'} · replacement selects changed faces.`;
    return;
  }
  const selectedBrushes = selectedBrushIds(session.selection);
  if (selectedBrushes.length > 0) {
    materialReplaceScope.textContent = `${selectedBrushes.length} selected ${selectedBrushes.length === 1 ? 'brush' : 'brushes'} · replacement affects their matching faces.`;
    return;
  }
  materialReplaceScope.textContent = session.selection
    ? 'Selection has no brush faces to replace.'
    : 'No selection · replacement affects the whole map and selects changed faces.';
}

function renderMaterialCatalog(): void {
  const queryTokens = materialFilter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const usages = materialUsageInDocument(session.document);
  const usageByName = new Map(usages.map((usage) => [usage.material.toLowerCase(), usage]));
  const materials = materialCatalog
    .materials()
    .filter((material) => queryTokens.every((token) => material.name.toLowerCase().includes(token)))
    .filter((material) => !materialUsedOnly.checked || usageByName.has(material.name.toLowerCase()))
    .toSorted((left, right) => {
      if (materialSort.value === 'usage') {
        const usageDifference =
          (usageByName.get(right.name.toLowerCase())?.faceCount ?? 0) -
          (usageByName.get(left.name.toLowerCase())?.faceCount ?? 0);
        if (usageDifference !== 0) return usageDifference;
      }
      return left.name.localeCompare(right.name);
    });
  materialCount.textContent = `${materialCatalog.size} loaded · ${usages.length} in use`;
  materialGrid.replaceChildren();
  for (const material of materials) {
    const usage = usageByName.get(material.name.toLowerCase());
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'material-tile';
    button.classList.toggle(
      'active',
      material.name.toLowerCase() === activeMaterialName.toLowerCase(),
    );
    button.classList.toggle('in-use', Boolean(usage));
    button.title = usage
      ? `${material.name} · ${material.width}×${material.height} · ${usage.faceCount} ${usage.faceCount === 1 ? 'face' : 'faces'} in ${usage.brushCount} ${usage.brushCount === 1 ? 'brush' : 'brushes'} · ${material.sourceName}`
      : `${material.name} · ${material.width}×${material.height} · unused · ${material.sourceName}`;

    const canvas = document.createElement('canvas');
    canvas.width = material.width;
    canvas.height = material.height;
    const context = canvas.getContext('2d');
    context?.putImageData(
      new ImageData(new Uint8ClampedArray(material.rgba), material.width, material.height),
      0,
      0,
    );
    const label = document.createElement('span');
    label.textContent = material.name;
    button.append(canvas, label);
    button.addEventListener('click', () => {
      activeMaterialName = material.name;
      materialName.value = material.name;
      applyMaterialButton.disabled = !session.selection;
      renderMaterialCatalog();
    });
    button.addEventListener('dblclick', () => applySelectedMaterial());
    materialGrid.append(button);
  }
  updateMaterialBrowserControls();
}

function updateReferenceScene(id: string, update: Partial<EditorReferenceScene>): void {
  referenceScenes = referenceScenes.map((reference) =>
    reference.id === id ? { ...reference, ...update } : reference,
  );
  renderer?.setReferenceScenes(referenceScenes);
  renderReferenceScenes();
}

function renderReferenceScenes(): void {
  referenceCount.textContent = `${referenceScenes.length} loaded`;
  clearReferencesButton.disabled = referenceScenes.length === 0;
  referenceList.replaceChildren();
  for (const reference of referenceScenes) {
    const row = document.createElement('div');
    row.className = 'reference-row';
    const heading = document.createElement('div');
    heading.className = 'reference-row-heading';
    const visible = document.createElement('input');
    visible.type = 'checkbox';
    visible.checked = reference.visible;
    visible.title = 'Show reference';
    visible.addEventListener('change', () =>
      updateReferenceScene(reference.id, { visible: visible.checked }),
    );
    const label = document.createElement('span');
    label.textContent = reference.label;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      referenceScenes = referenceScenes.filter((candidate) => candidate.id !== reference.id);
      renderer?.setReferenceScenes(referenceScenes);
      renderReferenceScenes();
    });
    heading.append(visible, label, remove);

    const offsets = document.createElement('div');
    offsets.className = 'reference-offsets';
    for (const [axis, value] of reference.offset.entries()) {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '16';
      input.value = String(value);
      input.title = `${['X', 'Y', 'Z'][axis]} offset`;
      input.addEventListener('change', () => {
        const next = [...reference.offset] as [number, number, number];
        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) return;
        next[axis] = parsed;
        updateReferenceScene(reference.id, { offset: next });
      });
      offsets.append(input);
    }
    row.append(heading, offsets);
    referenceList.append(row);
  }
}

function addReferenceDocument(label: string, document: MapDocument): void {
  referenceSequence += 1;
  referenceScenes = [
    ...referenceScenes,
    {
      id: `reference-${referenceSequence}`,
      label,
      document,
      offset: [referenceSequence * 384, 0, 0],
      visible: true,
    },
  ];
  renderer?.setReferenceScenes(referenceScenes);
  renderReferenceScenes();
  statusMessage.textContent = `Loaded reference ${label}.`;
}

function applySelectedMaterial(): void {
  const name = materialName.value.trim();
  if (!name || !session.selection) {
    statusMessage.textContent = 'Select a face and choose or enter a material first.';
    return;
  }
  try {
    if (!session.applyMaterial(name)) {
      statusMessage.textContent = `Face already uses ${name}.`;
    }
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function selectFacesUsingCurrentMaterial(): void {
  const material = selectedMaterialToken();
  if (!material) {
    statusMessage.textContent = 'Choose or enter a material first.';
    return;
  }
  const selection = session.selectFacesUsingMaterial(material);
  const faceCount = selectedFaceReferences(selection).length;
  if (faceCount === 0) {
    statusMessage.textContent = `No visible, editable faces use ${material}.`;
    return;
  }
  setEditorTool('face');
  statusMessage.textContent = `Selected ${faceCount} ${faceCount === 1 ? 'face' : 'faces'} using ${material}.`;
}

function selectBrushesUsingCurrentMaterial(): void {
  const material = selectedMaterialToken();
  if (!material) {
    statusMessage.textContent = 'Choose or enter a material first.';
    return;
  }
  const selection = session.selectBrushesUsingMaterial(material);
  const selectedBrushCount = selectedBrushIds(selection).length;
  if (selectedBrushCount === 0) {
    statusMessage.textContent = `No visible, editable brushes use ${material}.`;
    return;
  }
  setEditorTool('select');
  statusMessage.textContent = `Selected ${selectedBrushCount} ${selectedBrushCount === 1 ? 'brush' : 'brushes'} using ${material}.`;
}

function replaceSelectedMaterialUsage(): void {
  const sourceMaterial = materialReplaceSource.value.trim();
  const targetMaterial = materialReplaceTarget.value.trim();
  if (
    !sourceMaterial ||
    !targetMaterial ||
    sourceMaterial.toLowerCase() === targetMaterial.toLowerCase()
  ) {
    statusMessage.textContent = 'Enter two different material names first.';
    return;
  }
  try {
    const changedFaceCount = session.replaceMaterial(sourceMaterial, targetMaterial);
    if (changedFaceCount === 0) {
      statusMessage.textContent = `No ${sourceMaterial} faces match the current replacement scope.`;
      return;
    }
    activeMaterialName = targetMaterial;
    materialName.value = targetMaterial;
    setEditorTool('face');
    renderMaterialCatalog();
    statusMessage.textContent = `Replaced ${sourceMaterial} with ${targetMaterial} on ${changedFaceCount} ${changedFaceCount === 1 ? 'face' : 'faces'}. Undo restores the previous materials.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
}

function connectSession(): void {
  stopSubscription?.();
  stopSubscription = session.subscribe((change) => {
    renderer?.setDocument(session.document, session.selection, effectiveObjectViewState());
    updateInspector();
    if (change.kind !== 'selection' && change.kind !== 'view') updateSourceFromDocument();
    if (change.kind === 'document' || change.kind === 'history') renderMaterialCatalog();
    else updateMaterialBrowserControls();
    if (
      change.kind !== 'selection' &&
      compiledRevision !== null &&
      compiledRevision !== session.document.revision
    ) {
      showCompiledPreview(false);
      setCompileState(`PREVIEW R${compiledRevision} STALE`, 'stale');
    }
    statusMessage.textContent = `${change.label}. Document revision ${change.documentRevision}.`;
  });
}

function replaceDocument(document: MapDocument, label: string, name?: string): void {
  openGroupId = null;
  selectedLayerId = null;
  layerPanelSignature = '';
  hiddenIssueIds.clear();
  renderer?.setOpenGroupId(null);
  moveCandidate = null;
  duplicationBase = null;
  duplicationCandidate = null;
  faceCandidate = null;
  faceTransferCandidate = null;
  uvTextureCandidate = null;
  uvEditor.cancel();
  sweepCandidate = null;
  sweepDragBase = null;
  sweepEscapeReset = false;
  transformCandidate = null;
  topologyCandidate = null;
  topologySelectedVertices = [];
  topologySelectionKind = null;
  transformPivot = null;
  transformPivotSelectionKey = null;
  renderer?.setTransformPivot(null);
  clipCandidate = null;
  clipPlanePoints = null;
  creationCandidate = null;
  hullCandidate = null;
  hullBuildPoints = [];
  lastPointerPosition = null;
  pasteHereButton.disabled = true;
  renderer?.clearClipPlane();
  renderer?.clearHullPoints();
  renderer?.setSweepCaps([]);
  session.replaceDocument(document, label);
  if (name) setDocumentName(name);
  sourceMessage.textContent = 'Source parsed and normalized successfully.';
  sourceMessage.classList.remove('error-text');
}

function setEditorTool(tool: EditorTool): void {
  const previousTool = activeTool;
  if (previousTool === 'sweep' && tool !== 'sweep') {
    sweepCandidate = null;
    sweepDragBase = null;
    renderer?.setDocument(session.document, session.selection);
    renderer?.setSweepCaps([]);
  }
  if (
    (tool === 'clip' || isTransformTool(tool) || isTopologyTool(tool)) &&
    session.selection?.faceId
  ) {
    session.select({ brushId: session.selection.brushId });
  }
  if (isTransformTool(tool) && tool !== activeTool) {
    transformPivot = null;
    transformPivotSelectionKey = null;
    renderer?.setTransformPivot(null);
  }
  activeTool = tool;
  renderer?.setTool(tool);
  if (tool === 'sweep' && previousTool !== 'sweep') {
    sweepDefaultTransform = initialSweepTransform();
    sweepTransform = cloneSweepTransform(sweepDefaultTransform);
    sweepEscapeReset = false;
    resetSweep(false);
  }
  if (tool === 'create') updateSimpleShapeFields();
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    const active = button.dataset.tool === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  required<HTMLElement>('#pointer-context').textContent =
    `${tool === 'create' ? 'CREATE' : tool === 'entity' ? 'ENTITY' : tool === 'hull' ? 'HULL' : tool === 'face' ? 'FACE' : tool === 'sweep' ? 'SWEEP' : tool === 'clip' ? 'CLIP' : isTopologyTool(tool) || isTransformTool(tool) ? tool.toUpperCase() : 'PERSPECTIVE'} / edit`;
  statusMessage.textContent =
    tool === 'create'
      ? `Simple Shape tool active. Drag in any viewport to draw a ${simpleShapeLabel(simpleShapeOptions.kind)}; use the Object inspector for shape options.`
      : tool === 'entity'
        ? `Entity tool active. Click a surface or 2D viewport to place ${pointEntityClassname.value.trim() || 'a point entity'}.`
        : tool === 'hull'
          ? 'Hull tool active in perspective. Place points on reference faces; Enter creates their convex hull and Escape discards the point set.'
          : tool === 'face'
            ? 'Face tool active. Drag a center handle to extrude, Alt-drag it on the viewport plane, or use Arrow keys on the pointed viewport. Ctrl/Command-drag splits and Ctrl/Command+Alt-drag stamps. Escape clears handles before leaving.'
            : tool === 'sweep'
              ? selectedFaceReferences(session.selection).length > 0
                ? 'Sweep tool active. Move, rotate, or scale the green destination cap in 3D; tune its path in the inspector and press Enter to generate the gap.'
                : 'Sweep tool needs one or more selected brush faces. Select faces with the Face tool or Shift-click in Select, then activate Sweep again.'
              : tool === 'clip'
                ? 'Clip tool active. Click two or three points, drag to place two, or drag an orange point to move it. Shift locks moved points to one axis in 2D; double-click matches a face plane.'
                : tool === 'vertex'
                  ? 'Vertex tool active. Shift+Alt-click a target vertex to snap; Arrow keys nudge on the pointed viewport. Ctrl/Command adds corners or toggles absolute drag snapping. Escape clears handles before leaving.'
                  : tool === 'edge'
                    ? 'Edge tool active. Ctrl/Command selects multiple edge centers; Arrow keys nudge them on the pointed viewport. Escape clears handles before leaving.'
                    : tool === 'rotate'
                      ? 'Rotate tool active. Drag around the pivot; angles snap to 15°, or hold Shift for 5°. Selected vertex or edge handles take priority over brushes.'
                      : tool === 'scale'
                        ? 'Scale tool active. Drag a side, edge, or corner handle. The opposite handle stays fixed; hold Alt to anchor at center or Shift for proportional axes. Selected vertex or edge handles take priority over brushes.'
                        : tool === 'shear'
                          ? 'Shear tool active. Drag horizontally to offset the viewport plane by snapped grid units. Selected vertex or edge handles take priority over brushes.'
                          : 'Select tool active. Drag on XY in 3D; Alt moves vertically and Shift locks an axis. Shift-drag a selected brush face to resize it; add Ctrl/Command to split, Alt to move the face freely, or both to stamp. Ctrl/Command-drag duplicates selected brushes or paint-selects unselected ones; Ctrl/Command-wheel drills through 3D hits. Shift-click selects a face.';
  updateInspector(
    tool === 'sweep' && sweepCandidate ? sweepCandidate.document : session.document,
    session.selection,
  );
}

connectSession();
updateSourceFromDocument();
updateInspector();
renderMaterialCatalog();
renderReferenceScenes();
setInspectorOpen(!window.matchMedia('(max-width: 760px)').matches);
void checkCompilerService();

function focusCurrentSelection(): void {
  if (!renderer?.focusSelection()) {
    statusMessage.textContent = 'Select an object or component to focus.';
    return;
  }
  statusMessage.textContent = 'Framed the selection in every viewport.';
}

function focusContextViewport(context = viewportContext): void {
  if (!context) return;
  const canvas = canvases[context.viewport];
  if (canvas instanceof HTMLCanvasElement) canvas.focus({ preventScroll: true });
}

function hideViewportContextMenu(restoreFocus = false): void {
  if (viewportContextMenu.hidden) return;
  viewportContextMenu.hidden = true;
  viewportContextMenu.replaceChildren();
  if (restoreFocus) focusContextViewport();
  viewportContext = null;
}

function contextMenuHeading(text: string, detail?: string): HTMLElement {
  const heading = document.createElement('div');
  heading.className = 'viewport-context-heading';
  const label = document.createElement('strong');
  label.textContent = text;
  heading.append(label);
  if (detail) {
    const description = document.createElement('span');
    description.textContent = detail;
    heading.append(description);
  }
  return heading;
}

function contextMenuSection(label: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'viewport-context-section';
  const heading = document.createElement('h3');
  heading.textContent = label;
  section.append(heading);
  return section;
}

function contextMenuAction(
  container: HTMLElement,
  label: string,
  action: () => void,
  disabled = false,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.role = 'menuitem';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', () => {
    const context = viewportContext;
    hideViewportContextMenu();
    try {
      action();
    } catch (error) {
      statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
    focusContextViewport(context);
  });
  container.append(button);
  return button;
}

function contextMenuSubmenu(
  container: HTMLElement,
  label: string,
  actions: readonly { readonly label: string; readonly action: () => void }[],
  disabled = false,
): void {
  const details = document.createElement('details');
  details.className = 'viewport-context-submenu';
  const summary = document.createElement('summary');
  summary.textContent = label;
  summary.ariaDisabled = String(disabled);
  if (disabled) summary.tabIndex = -1;
  const items = document.createElement('div');
  items.className = 'viewport-context-submenu-items';
  for (const action of actions) {
    contextMenuAction(items, action.label, action.action, disabled);
  }
  details.addEventListener('toggle', () => {
    if (disabled && details.open) details.open = false;
  });
  details.append(summary, items);
  container.append(details);
}

function selectContextObject(hit: EditorSelection): void {
  const objectSelection: EditorSelection | null = hit.brushId
    ? { brushId: hit.brushId }
    : hit.entityId
      ? { entityId: hit.entityId }
      : null;
  if (!objectSelection) return;
  const containingGroup = editorGroupForObject(session.document, objectSelection, openGroupId);
  if (!containingGroup) {
    session.select(objectSelection);
    return;
  }
  session.select(
    selectionForEditorGroup(
      containingGroup,
      objectSelection.brushId
        ? { kind: 'brush', brushId: objectSelection.brushId }
        : objectSelection.entityId
          ? { kind: 'entity', entityId: objectSelection.entityId }
          : null,
    ),
  );
}

function createPointEntityFromContext(
  context: EditorViewportContextMenuEvent,
  classname: string,
): void {
  if (!context.pointEntityOrigin) throw new Error('No valid placement point under the cursor');
  const definition = pointEntityDefinition(classname);
  const origin = [...context.pointer.point] as [number, number, number];
  if (context.viewport === 'perspective') {
    const normal = context.pointer.surfaceNormal ?? ([0, 0, 1] as const);
    const axis = normal
      .map((component, index) => [Math.abs(component), index] as const)
      .toSorted((left, right) => right[0] - left[0])[0]![1] as 0 | 1 | 2;
    const relativeSide =
      normal[axis] >= 0 ? definition.bounds.min[axis] : definition.bounds.max[axis];
    origin[axis] =
      Math.round((context.pointer.point[axis] - relativeSide) / activeGridSize) * activeGridSize;
  }
  const ids = createSequentialIdFactory(`context-point-entity-${session.document.revision + 1}`);
  session.createPointEntity(classname, origin, ids, openGroupId ? { _tb_group: openGroupId } : {});
  pointEntityPreset.value = classname;
  pointEntityClassname.value = classname;
  renderer?.setEntityPlacementBounds(definition.bounds);
  statusMessage.textContent = `Created ${classname} at ${formatVector(origin)}.`;
}

function createBrushEntityFromContext(classname: string): void {
  const ids = createSequentialIdFactory(`context-brush-entity-${session.document.revision + 1}`);
  if (!session.createBrushEntity(classname, ids)) {
    statusMessage.textContent = 'Select one or more brushes before creating a brush entity.';
    return;
  }
  brushEntityClassname.value = classname;
  statusMessage.textContent = `Created ${classname} from the selected brushes.`;
}

function revealContextMaterial(material: string): void {
  activeMaterialName = material;
  materialName.value = material;
  materialFilter.value = material;
  required<HTMLButtonElement>('[data-inspector-tab="textures"]').click();
  renderMaterialCatalog();
  window.requestAnimationFrame(() => {
    const tile = [...materialGrid.querySelectorAll<HTMLButtonElement>('.material-tile')].find(
      (button) => button.textContent?.trim().toLowerCase() === material.toLowerCase(),
    );
    (tile ?? required<HTMLElement>('.material-section')).scrollIntoView({ block: 'nearest' });
  });
  statusMessage.textContent = materialCatalog.find(material)
    ? `Revealed ${material} in the material browser.`
    : `${material} is used by the map but is not loaded in the material catalog.`;
}

function showViewportContextMenu(context: EditorViewportContextMenuEvent): void {
  viewportContext = context;
  lastPointerPosition = context.pointer;
  pasteHereButton.disabled = false;
  viewportContextMenu.replaceChildren();
  viewportContextMenu.append(
    contextMenuHeading(
      `${context.viewport === 'perspective' ? '3D' : context.viewport.toUpperCase()} view`,
      formatVector(context.pointer.point),
    ),
  );

  const hitSection = contextMenuSection('Under cursor');
  const hit = context.hit;
  if (hit?.brushId && hit.faceId) {
    const brush = findBrush(session.document, hit.brushId);
    const face = brush?.faces.find((candidate) => candidate.id === hit.faceId);
    contextMenuAction(hitSection, 'Select object', () => selectContextObject(hit));
    contextMenuAction(hitSection, 'Select face', () =>
      session.selectFace({ brushId: hit.brushId!, faceId: hit.faceId! }),
    );
    contextMenuAction(hitSection, 'Select all brush faces', () =>
      session.selectBrushFaces(hit.brushId!, false, hit.faceId!),
    );
    contextMenuAction(hitSection, 'Select coplanar surface', () =>
      session.selectConnectedCoplanarFaces({ brushId: hit.brushId!, faceId: hit.faceId! }),
    );
    contextMenuAction(hitSection, 'Copy face attributes', () => void copySelection(hit));
    contextMenuAction(
      hitSection,
      'Paste face attributes here',
      () => void pasteFromClipboard(false, hit),
    );
    if (face) {
      contextMenuAction(hitSection, `Reveal ${face.material}`, () =>
        revealContextMaterial(face.material),
      );
    }
  } else if (hit?.entityId) {
    contextMenuAction(hitSection, 'Select point entity', () => selectContextObject(hit));
  } else {
    const empty = document.createElement('p');
    empty.textContent = 'No editable object';
    hitSection.append(empty);
  }
  viewportContextMenu.append(hitSection);

  const selectedBrushCount = selectedBrushIds(session.selection).length;
  const selectedEntityCount = selectedPointEntityIds(session.selection).length;
  const objectSelected = !session.selection?.faceId && selectedBrushCount + selectedEntityCount > 0;
  const selectedGroup = selectedEditorGroup(session.document, session.selection);
  const selectionSection = contextMenuSection('Selection');
  contextMenuAction(selectionSection, 'Focus selection', focusCurrentSelection, !objectSelected);
  contextMenuAction(
    selectionSection,
    'Hide selection',
    () => session.hideSelected(),
    !objectSelected,
  );
  contextMenuAction(
    selectionSection,
    'Isolate selection',
    () => session.isolateSelected(),
    !objectSelected,
  );
  contextMenuAction(
    selectionSection,
    selectedGroup ? `Ungroup ${selectedGroup.name}` : 'Group selection',
    () => {
      if (selectedGroup) session.ungroupSelected(selectedGroup.id);
      else {
        const ids = createSequentialIdFactory(`context-group-${session.document.revision + 1}`);
        if (!session.groupSelected('Group', ids, openGroupId)) {
          throw new Error('Select one or more objects before grouping');
        }
      }
    },
    !objectSelected,
  );
  const layer = selectedLayerForPanel();
  if (layer) {
    contextMenuAction(
      selectionSection,
      `Move to ${layer.name}`,
      () => {
        if (!session.moveSelectedToLayer(layer.id)) {
          throw new Error(`The selection is already in ${layer.name}`);
        }
      },
      !objectSelected,
    );
  }
  if (selectedBrushCount > 0) {
    contextMenuSubmenu(
      selectionSection,
      'Create brush entity',
      ['func_detail', 'func_door', 'trigger_once'].map((classname) => ({
        label: classname,
        action: () => createBrushEntityFromContext(classname),
      })),
    );
    contextMenuAction(selectionSection, 'Make structural', () => {
      if (!session.makeSelectedStructural()) throw new Error('The selection is already structural');
    });
  }
  contextMenuAction(
    selectionSection,
    'Show all hidden',
    () => session.showAll(),
    !session.canShowAll,
  );
  viewportContextMenu.append(selectionSection);

  const createSection = contextMenuSection('Create here');
  contextMenuSubmenu(
    createSection,
    'Create point entity',
    BUILTIN_POINT_ENTITY_DEFINITIONS.map((definition) => ({
      label: definition.label,
      action: () => createPointEntityFromContext(context, definition.classname),
    })),
    !context.pointEntityOrigin,
  );
  contextMenuAction(
    createSection,
    'Paste here',
    () => pasteFromClipboard(true),
    pasteHereButton.disabled,
  );
  viewportContextMenu.append(createSection);

  viewportContextMenu.hidden = false;
  viewportContextMenu.style.left = `${context.clientX}px`;
  viewportContextMenu.style.top = `${context.clientY}px`;
  const bounds = viewportContextMenu.getBoundingClientRect();
  viewportContextMenu.style.left = `${Math.max(8, Math.min(context.clientX, window.innerWidth - bounds.width - 8))}px`;
  viewportContextMenu.style.top = `${Math.max(8, Math.min(context.clientY, window.innerHeight - bounds.height - 8))}px`;
  const initialButton = [
    ...viewportContextMenu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
  ].find((button) => button.offsetParent !== null);
  (initialButton ?? viewportContextMenu).focus({ preventScroll: true });
}

viewportContextMenu.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    hideViewportContextMenu(true);
    return;
  }
  if (
    event.key !== 'ArrowDown' &&
    event.key !== 'ArrowUp' &&
    event.key !== 'Home' &&
    event.key !== 'End'
  )
    return;
  const buttons = [
    ...viewportContextMenu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
  ].filter((button) => button.offsetParent !== null);
  if (buttons.length === 0) return;
  event.preventDefault();
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowDown'
          ? (current + 1 + buttons.length) % buttons.length
          : (current - 1 + buttons.length) % buttons.length;
  buttons[nextIndex]?.focus({ preventScroll: true });
});
window.addEventListener(
  'pointerdown',
  (event) => {
    if (!viewportContextMenu.hidden && !viewportContextMenu.contains(event.target as Node)) {
      hideViewportContextMenu();
    }
  },
  { capture: true },
);
window.addEventListener('blur', () => hideViewportContextMenu());
window.addEventListener('resize', () => hideViewportContextMenu());

try {
  renderer = await EditorSourceRenderer.create({
    canvases,
    document: session.document,
    selection: session.selection,
    objectViewState: effectiveObjectViewState(),
    materials: materialCatalog.materials(),
    referenceScenes,
    entityLinkMode,
    openGroupId,
    tool: activeTool,
    gridSize: activeGridSize,
    entityPlacementBounds: pointEntityDefinition(pointEntityClassname.value).bounds,
    onCameraChange(event: EditorCameraChangeEvent) {
      if (event.viewport !== 'perspective') return;
      perspectiveCamera = event.camera;
      perspectiveMode.dataset.camera = JSON.stringify(event.camera);
      perspectiveMode.title = `Position ${formatVector(event.camera.position)} · ${Math.round(event.camera.fieldOfViewDegrees)}° FOV · ${Math.round(event.camera.flySpeed)} units/s`;
      if (compiledCanvas.hidden) {
        perspectiveMode.textContent =
          event.mode === 'initial' ? 'EDIT' : `EDIT · ${event.mode.toUpperCase()}`;
      }
      const position = event.camera.position.map((value) => Math.round(value));
      cameraPointerContext.textContent =
        `PERSPECTIVE / ${event.mode} ${formatVector(position)}` +
        (event.mode === 'fly' ? ` · speed ${Math.round(event.camera.flySpeed)}` : '');
    },
    onPick(selection, viewport, intent) {
      const objectSelectionIds = selectedBrushIds(session.selection);
      if (!selection?.faceId) {
        if (!selection && intent.objectExpansion === 'activate' && openGroupId) {
          closeEditorGroup();
          return;
        }
        if (!selection && intent.objectAdditive) return;
        const containingGroup = selection
          ? editorGroupForObject(session.document, selection, openGroupId)
          : null;
        if (selection && intent.objectExpansion === 'activate' && containingGroup) {
          openEditorGroup(containingGroup.id, selection);
          required<HTMLElement>('#pointer-context').textContent =
            `${viewport.toUpperCase()} / editing group`;
          return;
        }
        if (selection && containingGroup) {
          if (intent.objectAdditive) {
            const currentBrushes = new Set(selectedBrushIds(session.selection));
            const currentEntities = new Set(selectedPointEntityIds(session.selection));
            const allSelected =
              containingGroup.brushIds.every((groupBrushId) => currentBrushes.has(groupBrushId)) &&
              containingGroup.pointEntityIds.every((entityId) => currentEntities.has(entityId));
            for (const groupBrushId of containingGroup.brushIds) {
              if (allSelected) currentBrushes.delete(groupBrushId);
              else currentBrushes.add(groupBrushId);
            }
            for (const entityId of containingGroup.pointEntityIds) {
              if (allSelected) currentEntities.delete(entityId);
              else currentEntities.add(entityId);
            }
            session.select(
              createObjectSelection(
                [...currentBrushes],
                [...currentEntities],
                selection.brushId
                  ? { kind: 'brush', brushId: selection.brushId }
                  : selection.entityId
                    ? { kind: 'entity', entityId: selection.entityId }
                    : null,
              ),
            );
          } else {
            session.select(
              selectionForEditorGroup(
                containingGroup,
                selection.brushId
                  ? { kind: 'brush', brushId: selection.brushId }
                  : selection.entityId
                    ? { kind: 'entity', entityId: selection.entityId }
                    : null,
              ),
            );
          }
        } else if (selection?.entityId) {
          if (intent.objectAdditive) session.selectPointEntity(selection.entityId, true);
          else session.select(selection);
        } else if (
          selection?.brushId &&
          (intent.objectExpansion === 'siblings' || intent.objectExpansion === 'activate')
        ) {
          const owner = session.document.entities.find((entity) =>
            entity.brushes.some((brush) => brush.id === selection.brushId),
          );
          const siblingIds =
            owner && owner.properties.classname !== 'worldspawn' && owner.brushes.length > 1
              ? owner.brushes.map((brush) => brush.id)
              : [selection.brushId];
          session.select(
            createBrushSelection(
              intent.objectAdditive
                ? [...selectedBrushIds(session.selection), ...siblingIds]
                : siblingIds,
              selection.brushId,
            ),
          );
        } else if (selection?.brushId && intent.objectAdditive) {
          session.selectBrush(selection.brushId, true);
        } else {
          session.select(selection);
        }
      } else if (intent.expansion === 'brush') {
        session.selectBrushFaces(selection.brushId, intent.additive, selection.faceId);
      } else if (intent.expansion === 'coplanar') {
        session.selectConnectedCoplanarFaces(
          { brushId: selection.brushId, faceId: selection.faceId },
          intent.additive,
        );
      } else if (activeTool === 'face' && !intent.additive && objectSelectionIds.length > 1) {
        session.selectMatchingBrushFaces(
          { brushId: selection.brushId, faceId: selection.faceId },
          objectSelectionIds,
        );
      } else {
        session.selectFace(
          { brushId: selection.brushId, faceId: selection.faceId },
          intent.additive,
        );
      }
      if (intent.paint) {
        const faces = selectedFaceReferences(session.selection);
        const selectedBrushCount = selectedBrushIds(session.selection).length;
        const selectedEntityCount = selectedPointEntityIds(session.selection).length;
        const count = faces.length > 0 ? faces.length : selectedBrushCount + selectedEntityCount;
        const subject =
          faces.length > 0
            ? count === 1
              ? 'face'
              : 'faces'
            : selectedBrushCount > 0 && selectedEntityCount === 0
              ? count === 1
                ? 'brush'
                : 'brushes'
              : selectedEntityCount > 0 && selectedBrushCount === 0
                ? count === 1
                  ? 'entity'
                  : 'entities'
                : count === 1
                  ? 'object'
                  : 'objects';
        statusMessage.textContent = `Paint selected ${count} ${subject}.`;
        required<HTMLElement>('#pointer-context').textContent =
          `${viewport.toUpperCase()} / ${faces.length > 0 ? 'face' : 'object'} paint ${count}`;
      } else if (intent.drill) {
        statusMessage.textContent = `Drilled selection ${intent.drill} in the 3D view.`;
        required<HTMLElement>('#pointer-context').textContent =
          `PERSPECTIVE / drill ${intent.drill}`;
      } else if (
        selection &&
        !selection.faceId &&
        editorGroupForObject(session.document, selection, openGroupId)
      ) {
        const group = editorGroupForObject(session.document, selection, openGroupId)!;
        statusMessage.textContent = `Selected group ${group.name}.`;
        required<HTMLElement>('#pointer-context').textContent =
          `${viewport.toUpperCase()} / group ${group.name}`;
      } else if (
        selection?.brushId &&
        (intent.objectExpansion === 'siblings' || intent.objectExpansion === 'activate')
      ) {
        const count = selectedBrushIds(session.selection).length;
        statusMessage.textContent =
          count > 1 ? `Selected ${count} sibling brushes.` : 'Selected brush.';
        required<HTMLElement>('#pointer-context').textContent =
          `${viewport.toUpperCase()} / siblings ${count}`;
      } else {
        required<HTMLElement>('#pointer-context').textContent = `${viewport.toUpperCase()} / edit`;
      }
    },
    onPointEntityPlace(event) {
      const classname = pointEntityClassname.value.trim();
      if (!classname) {
        statusMessage.textContent = 'Enter a point-entity classname before placing it.';
        return;
      }
      try {
        const ids = createSequentialIdFactory(`point-entity-${session.document.revision + 1}`);
        session.createPointEntity(
          classname,
          event.origin,
          ids,
          openGroupId ? { _tb_group: openGroupId } : {},
        );
        statusMessage.textContent = `Placed ${classname} at ${formatVector(event.origin)}.`;
        required<HTMLElement>('#pointer-context').textContent =
          `${event.viewport.toUpperCase()} / placed ${classname}`;
      } catch (error) {
        statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    },
    onPointerPosition(event) {
      lastPointerPosition = event;
      pasteHereButton.disabled = false;
    },
    onContextMenu(event) {
      showViewportContextMenu(event);
      required<HTMLElement>('#pointer-context').textContent =
        `${event.viewport.toUpperCase()} / context ${formatVector(event.pointer.point)}`;
    },
    onFaceLasso(faces, viewport, ensureSelected) {
      if (faces.length === 0) {
        statusMessage.textContent = 'Face lasso did not contain any handles.';
        return;
      }
      session.selectFacesWithLasso(faces, ensureSelected);
      const count = selectedFaceReferences(session.selection).length;
      required<HTMLElement>('#pointer-context').textContent =
        `${viewport.toUpperCase()} / face lasso ${count}`;
    },
    onClipPlaneChange(event: EditorClipPlaneEvent) {
      handleClipPlaneChange(event);
      if (event.movingPointIndex !== undefined) {
        const constraint =
          event.axisRestriction === undefined || event.axisRestriction === null
            ? ''
            : ` · ${['X', 'Y', 'Z'][event.axisRestriction]} locked`;
        statusMessage.textContent =
          event.pointMovePhase === 'commit'
            ? `Moved clip point ${event.movingPointIndex + 1}${constraint}.`
            : event.pointMovePhase === 'cancel'
              ? `Clip point ${event.movingPointIndex + 1} move cancelled.`
              : `Clip point ${event.movingPointIndex + 1} preview${constraint}. Release to place it.`;
      }
      required<HTMLElement>('#pointer-context').textContent =
        `${event.viewport.toUpperCase()} / clip ${event.points.length}`;
    },
    onTransformDrag(event: EditorTransformDragEvent) {
      handleTransformDrag(event);
    },
    onTransformPivotDrag(event: EditorTransformPivotDragEvent) {
      handleTransformPivotDrag(event);
    },
    onSweepDrag(event: EditorSweepDragEvent) {
      handleSweepDrag(event);
    },
    onTopologyDrag(event: EditorTopologyDragEvent) {
      handleTopologyDrag(event);
    },
    onTopologySelectionChange(kind, selectedCount, vertices) {
      topologySelectionCount.textContent = String(selectedCount);
      topologySelectedVertices = vertices;
      topologySelectionKind = selectedCount > 0 ? kind : null;
      if (isTransformTool(activeTool)) updateInspector();
    },
    onBrushDrag(event: EditorBrushDragEvent) {
      const pointerContext = required<HTMLElement>('#pointer-context');
      if (event.phase === 'cancel') {
        moveCandidate = null;
        duplicationBase = null;
        duplicationCandidate = null;
        renderer?.setDocument(session.document, session.selection);
        updateInspector();
        statusMessage.textContent = event.duplicate
          ? 'Duplicate-and-move cancelled.'
          : 'Brush move cancelled.';
        pointerContext.textContent = `${event.viewport.toUpperCase()} / edit`;
        return;
      }

      const hasMovement = event.delta.some((component) => Math.abs(component) > Number.EPSILON);
      if (!hasMovement) {
        moveCandidate = null;
        duplicationBase = null;
        duplicationCandidate = null;
        renderer?.setDocument(session.document, session.selection);
        updateInspector();
        if (event.phase === 'commit') {
          statusMessage.textContent = event.duplicate
            ? 'Duplicate remained on the original grid position; nothing was created.'
            : 'Brush remained on its original grid position.';
          pointerContext.textContent = `${event.viewport.toUpperCase()} / edit`;
        }
        return;
      }

      try {
        if (event.duplicate) {
          if (!duplicationBase) {
            duplicateSequence += 1;
            duplicationBase = session.createObjectDuplicationCandidate(
              event.selection,
              createSequentialIdFactory(`drag-duplicate-${duplicateSequence}`),
              openGroupId,
            );
          }
          if (!duplicationBase) return;
          const candidate = session.translateObjectDuplicationCandidate(
            duplicationBase,
            event.delta,
            textureLock.checked,
            duplicationBase.label.replace('Duplicate', 'Duplicate and move'),
          );
          if (event.phase === 'preview') {
            duplicationCandidate = candidate;
            renderer?.setDocument(candidate.document, candidate.selectionAfter);
            updateInspector(candidate.document, candidate.selectionAfter);
            statusMessage.textContent = `Duplicate-and-move preview: ${formatVector(event.delta)} (${movementDescription(event)}). Release to commit.`;
            pointerContext.textContent = `${event.viewport.toUpperCase()} / duplicate move`;
            return;
          }
          session.commitDocumentCandidate(duplicationCandidate ?? candidate);
          duplicationBase = null;
          duplicationCandidate = null;
          pointerContext.textContent = `${event.viewport.toUpperCase()} / edit`;
          return;
        }
        const candidate = session.createObjectTranslationCandidate(
          event.selection,
          event.delta,
          textureLock.checked,
        );
        if (!candidate) return;
        if (event.phase === 'preview') {
          moveCandidate = candidate;
          renderer?.setDocument(candidate.document, session.selection);
          updateInspector(candidate.document);
          statusMessage.textContent = `Move preview: ${formatVector(event.delta)} (${movementDescription(event)}). Release to commit.`;
          pointerContext.textContent = `${event.viewport.toUpperCase()} / move`;
          return;
        }
        session.commitDocumentCandidate(moveCandidate ?? candidate);
        moveCandidate = null;
        pointerContext.textContent = `${event.viewport.toUpperCase()} / edit`;
      } catch (error) {
        moveCandidate = null;
        duplicationBase = null;
        duplicationCandidate = null;
        renderer?.setDocument(session.document, session.selection);
        updateInspector();
        statusMessage.textContent = error instanceof Error ? error.message : String(error);
        pointerContext.textContent = `${event.viewport.toUpperCase()} / edit`;
      }
    },
    onFaceTransfer(event: EditorFaceTransferEvent) {
      const pointerContext = required<HTMLElement>('#pointer-context');
      if (event.phase === 'cancel') {
        faceTransferCandidate = null;
        renderer?.setDocument(session.document, session.selection);
        updateInspector();
        statusMessage.textContent = 'Face attribute transfer cancelled.';
        pointerContext.textContent = `${event.viewport.toUpperCase()} / transfer cancelled`;
        return;
      }

      try {
        const candidate = session.createFaceAttributeTransferCandidate(
          event.source,
          event.targets,
          event.mode,
        );
        if (!candidate) return;
        const modeLabel =
          event.mode === 'material'
            ? 'material only'
            : event.mode === 'rotate'
              ? 'rotated attributes'
              : 'projected attributes';
        if (event.phase === 'preview') {
          faceTransferCandidate = candidate;
          renderer?.setDocument(candidate.document, session.selection);
          updateInspector(candidate.document, session.selection);
          statusMessage.textContent = `Transfer preview: ${modeLabel} across ${event.targets.length} ${event.targets.length === 1 ? 'face' : 'faces'}. Release to commit.`;
          pointerContext.textContent = `${event.viewport.toUpperCase()} / transfer ${event.targets.length}`;
          return;
        }
        session.commitCandidate(faceTransferCandidate ?? candidate);
        faceTransferCandidate = null;
        pointerContext.textContent = `${event.viewport.toUpperCase()} / transfer`;
      } catch (error) {
        faceTransferCandidate = null;
        renderer?.setDocument(session.document, session.selection);
        updateInspector();
        statusMessage.textContent = error instanceof Error ? error.message : String(error);
        pointerContext.textContent = `${event.viewport.toUpperCase()} / transfer invalid`;
      }
    },
    onFaceDrag(event: EditorFaceDragEvent) {
      const pointerContext = required<HTMLElement>('#pointer-context');
      const hasMovement =
        event.mode === 'translate'
          ? event.delta.some((component) => Math.abs(component) > Number.EPSILON)
          : Math.abs(event.distance) > Number.EPSILON;
      if (event.phase === 'cancel' || !hasMovement) {
        faceCandidate = null;
        renderer?.setDocument(session.document, session.selection);
        updateInspector();
        statusMessage.textContent =
          event.phase === 'cancel'
            ? event.mode === 'translate'
              ? 'Face move cancelled.'
              : event.stamp
                ? 'Face stamp cancelled.'
                : event.split
                  ? 'Face split cancelled.'
                  : 'Face extrusion cancelled.'
            : 'Face stayed on its plane.';
        pointerContext.textContent = `${event.viewport.toUpperCase()} / face`;
        return;
      }

      try {
        const selectedFaces = selectedFaceReferences(session.selection);
        const eventFace = { brushId: event.selection.brushId, faceId: event.selection.faceId };
        const faces = selectedFaces.some(
          (face) => face.brushId === eventFace.brushId && face.faceId === eventFace.faceId,
        )
          ? selectedFaces
          : [eventFace];
        const candidate =
          event.mode === 'translate'
            ? session.createFaceSetTranslationCandidate(
                faces,
                event.delta,
                createSequentialIdFactory(`face-move-${faceTranslationSequence + 1}`),
                textureLock.checked,
              )
            : event.stamp
              ? session.createFaceStampCandidate(
                  faces,
                  eventFace,
                  event.distance,
                  createSequentialIdFactory(`face-stamp-${faceStampSequence + 1}`),
                  textureLock.checked,
                )
              : event.split
                ? session.createFaceSetSplitCandidate(
                    faces,
                    eventFace,
                    event.distance,
                    createSequentialIdFactory(`face-split-${faceSplitSequence + 1}`),
                  )
                : session.createFaceSetExtrusionCandidate(faces, eventFace, event.distance);
        if (!candidate) return;
        if (event.phase === 'preview') {
          faceCandidate = candidate;
          renderer?.setDocument(candidate.document, session.selection);
          updateInspector(candidate.document, session.selection);
          statusMessage.textContent =
            event.mode === 'translate'
              ? `Face move preview: ${formatVector(event.delta)}. Release to commit.`
              : `${event.stamp ? 'Face stamp' : event.split ? 'Face split' : 'Face extrusion'} preview: ${event.distance > 0 ? '+' : ''}${event.distance}. Release to commit.`;
          pointerContext.textContent =
            event.mode === 'translate'
              ? `${event.viewport.toUpperCase()} / face move ${formatVector(event.delta)}`
              : `${event.viewport.toUpperCase()} / face ${event.stamp ? 'stamp ' : event.split ? 'split ' : ''}${event.distance}`;
          return;
        }
        const committed = faceCandidate ?? candidate;
        if ('insertions' in committed) {
          session.commitBatchCreationCandidate(committed);
          faceStampSequence += 1;
        } else if ('mode' in committed) {
          session.commitClipCandidate(committed);
          faceSplitSequence += 1;
        } else {
          session.commitCandidate(committed);
          if (event.mode === 'translate') faceTranslationSequence += 1;
        }
        faceCandidate = null;
        pointerContext.textContent = `${event.viewport.toUpperCase()} / face`;
      } catch (error) {
        faceCandidate = null;
        renderer?.setDocument(session.document, session.selection);
        updateInspector();
        statusMessage.textContent = error instanceof Error ? error.message : String(error);
        pointerContext.textContent = `${event.viewport.toUpperCase()} / face invalid`;
      }
    },
    onHullCreate(event: EditorHullCreateEvent) {
      const pointerContext = required<HTMLElement>('#pointer-context');
      hullBuildPoints = event.points;
      pointerContext.textContent = 'PERSPECTIVE / hull';
      if (event.phase === 'cancel') {
        hullCandidate = null;
        renderer?.setDocument(session.document, session.selection);
        updateInspector();
        statusMessage.textContent = 'Hull point set discarded.';
        return;
      }
      try {
        const brush = createConvexHullBrush(
          event.points,
          activeMaterialName || 'DEV_PILLAR',
          createSequentialIdFactory(`hull-${hullSequence + 1}`),
        );
        const candidate = {
          ...session.createBrushCandidate(brush, openGroupEntityId()),
          label: 'Create hull brush',
        };
        if (event.phase === 'preview') {
          hullCandidate = candidate;
          renderer?.setDocument(session.document, session.selection);
          updateInspector();
          statusMessage.textContent = `${event.points.length} hull points enclose a valid brush. Press Enter or Create hull.`;
          return;
        }
        hullBuildPoints = [];
        session.commitCreationCandidate(hullCandidate ?? candidate);
        hullCandidate = null;
        hullSequence += 1;
      } catch (error) {
        hullCandidate = null;
        renderer?.setDocument(session.document, session.selection);
        updateInspector();
        if (event.phase === 'commit') throw error;
        statusMessage.textContent =
          event.points.length < 4
            ? `${event.points.length} hull points placed. Add at least four non-coplanar points.`
            : error instanceof Error
              ? error.message
              : String(error);
      }
    },
    onBrushCreate(event: EditorBrushCreateEvent) {
      const pointerContext = required<HTMLElement>('#pointer-context');
      if (event.phase === 'cancel' || !event.bounds) {
        creationCandidate = null;
        creationSequence += 1;
        simpleShapeResult.textContent = 'Drag to draw';
        renderer?.setDocument(session.document, session.selection);
        updateInspector();
        statusMessage.textContent = 'Brush creation cancelled.';
        pointerContext.textContent = `${event.viewport.toUpperCase()} / create`;
        return;
      }

      try {
        const ids = createSequentialIdFactory(`created-${creationSequence + 1}`);
        const brushes = createSimpleShapeBrushes(
          event.bounds,
          activeMaterialName || 'DEV_PILLAR',
          simpleShapeOptions,
          ids,
        );
        const label = `Create ${simpleShapeLabel(simpleShapeOptions.kind)}`;
        const candidate = session.createBrushesCandidate(brushes, label, openGroupEntityId());
        if (event.phase === 'preview') {
          creationCandidate = candidate;
          const selection = createBrushSelection(candidate.selectionAfter);
          renderer?.setDocument(candidate.document, selection);
          updateInspector(candidate.document, selection);
          simpleShapeResult.textContent = `${brushes.length} ${brushes.length === 1 ? 'brush' : 'brushes'}`;
          statusMessage.textContent = `${simpleShapeLabel(simpleShapeOptions.kind)} preview${event.constraint === 'none' ? '' : ` (${event.constraint})`}: ${brushes.length} ${brushes.length === 1 ? 'brush' : 'brushes'}, ${formatVector(event.bounds.min)} to ${formatVector(event.bounds.max)}. Release to commit.`;
          pointerContext.textContent = `${event.viewport.toUpperCase()} / create`;
          return;
        }
        session.commitBatchCreationCandidate(creationCandidate ?? candidate);
        creationCandidate = null;
        creationSequence += 1;
        simpleShapeResult.textContent = `${brushes.length} created`;
        pointerContext.textContent = `${event.viewport.toUpperCase()} / create`;
      } catch (error) {
        creationCandidate = null;
        creationSequence += 1;
        simpleShapeResult.textContent = 'Invalid bounds';
        renderer?.setDocument(session.document, session.selection);
        updateInspector();
        statusMessage.textContent = error instanceof Error ? error.message : String(error);
        pointerContext.textContent = `${event.viewport.toUpperCase()} / create`;
      }
    },
  });
  statusMessage.textContent = 'Source renderer ready. Select a brush in any viewport.';
  const frame = () => {
    renderer?.render();
    if (renderer) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
} catch (error) {
  viewportError.hidden = false;
  viewportError.textContent = error instanceof Error ? error.message : String(error);
  statusMessage.textContent = 'WebGPU renderer could not start.';
}

required<HTMLButtonElement>('[data-action="new"]').addEventListener('click', () => {
  replaceDocument(createStarterDocument(), 'Create starter map', 'untitled.map');
});

required<HTMLButtonElement>('[data-action="show-source"]').addEventListener('click', () => {
  updateSourceFromDocument();
  sourceDialog.showModal();
  source.focus();
});
required<HTMLButtonElement>('[data-action="close-source"]').addEventListener('click', () => {
  sourceDialog.close();
});
required<HTMLButtonElement>('[data-action="apply-source"]').addEventListener('click', () => {
  try {
    replaceDocument(parseMap(source.value), 'Apply map source');
    sourceDialog.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sourceMessage.textContent = message;
    sourceMessage.classList.add('error-text');
    statusMessage.textContent = 'Source contains a parse error.';
  }
});

required<HTMLButtonElement>('[data-action="open-file"]').addEventListener('click', () => {
  mapFile.click();
});
mapFile.addEventListener('change', async () => {
  const file = mapFile.files?.[0];
  if (!file) return;
  try {
    replaceDocument(
      parseMap(await file.text(), createSequentialIdFactory(`opened-${Date.now()}`)),
      'Open map',
      file.name,
    );
    statusMessage.textContent = `Opened ${file.name}.`;
  } catch (error) {
    statusMessage.textContent = `${file.name}: ${error instanceof Error ? error.message : String(error)}`;
  }
  mapFile.value = '';
});

required<HTMLButtonElement>('[data-action="download"]').addEventListener('click', () => {
  const url = URL.createObjectURL(
    new Blob([serializeMap(session.document)], { type: 'text/plain' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = currentDocumentName;
  anchor.click();
  URL.revokeObjectURL(url);
  statusMessage.textContent = 'Downloaded normalized Valve 220 map source.';
});

required<HTMLButtonElement>('[data-action="load-reference"]').addEventListener('click', () => {
  referenceFiles.click();
});
required<HTMLButtonElement>('[data-action="snapshot-reference"]').addEventListener('click', () => {
  addReferenceDocument(`Document revision ${session.document.revision}`, session.document);
});
clearReferencesButton.addEventListener('click', () => {
  referenceScenes = [];
  renderer?.setReferenceScenes(referenceScenes);
  renderReferenceScenes();
  statusMessage.textContent = 'Cleared reference scenes.';
});

entityLinkModeSelect.addEventListener('change', () => {
  const mode = entityLinkModeSelect.value;
  if (mode !== 'all' && mode !== 'transitive' && mode !== 'direct' && mode !== 'none') return;
  entityLinkMode = mode;
  renderer?.setEntityLinkMode(mode);
  updateEntityLinkSummary();
  statusMessage.textContent = `Entity links: ${entityLinkModeSelect.selectedOptions[0]?.textContent ?? mode}.`;
});

function selectedLayerForPanel() {
  return deriveEditorLayers(session.document).find((layer) => layer.id === selectedLayerId) ?? null;
}

addLayerButton.addEventListener('click', () => {
  try {
    const name = layerNameInput.value.trim();
    const layerId = session.createLayer(
      name,
      createSequentialIdFactory(`layer-${session.document.revision + 1}`),
    );
    selectedLayerId = layerId;
    layerPanelSignature = '';
    updateInspector();
    layerNameInput.select();
    statusMessage.textContent = `Created and activated ${name}.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
});
layerNameInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  addLayerButton.click();
});
moveSelectionToLayerButton.addEventListener('click', () => {
  try {
    const layer = selectedLayerForPanel();
    if (!layer || !session.moveSelectedToLayer(layer.id)) {
      statusMessage.textContent = 'Select top-level objects in a different layer first.';
      return;
    }
    statusMessage.textContent = `Moved the selection to ${layer.name}.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
});
selectLayerButton.addEventListener('click', () => {
  const layer = selectedLayerForPanel();
  if (!layer) return;
  if (!session.selectAllInLayer(layer.id)) {
    statusMessage.textContent = `${layer.name} has no selectable contents.`;
    return;
  }
  statusMessage.textContent = `Selected all contents of ${layer.name}.`;
});
isolateLayerButton.addEventListener('click', () => {
  const layer = selectedLayerForPanel();
  if (!layer || !session.isolateLayer(layer.id)) {
    statusMessage.textContent = layer ? `${layer.name} is already isolated.` : 'Select a layer.';
    return;
  }
  statusMessage.textContent = `Isolated ${layer.name}.`;
});
removeLayerButton.addEventListener('click', () => {
  const layer = selectedLayerForPanel();
  if (!layer?.id || !session.removeLayer(layer.id)) return;
  selectedLayerId = null;
  layerPanelSignature = '';
  updateInspector();
  statusMessage.textContent = `Removed ${layer.name}; its contents moved to Default Layer. Undo restores it.`;
});
layerUpButton.addEventListener('click', () => {
  const layer = selectedLayerForPanel();
  if (layer?.id) session.reorderLayer(layer.id, -1);
});
layerDownButton.addEventListener('click', () => {
  const layer = selectedLayerForPanel();
  if (layer?.id) session.reorderLayer(layer.id, 1);
});
required<HTMLButtonElement>('[data-action="show-all-layers"]').addEventListener('click', () => {
  if (!session.setAllLayersFlag('hidden', false)) {
    statusMessage.textContent = 'All layers are already shown.';
  }
});
required<HTMLButtonElement>('[data-action="hide-all-layers"]').addEventListener('click', () => {
  session.setAllLayersFlag('hidden', true);
});
required<HTMLButtonElement>('[data-action="unlock-all-layers"]').addEventListener('click', () => {
  if (!session.setAllLayersFlag('locked', false)) {
    statusMessage.textContent = 'All layers are already unlocked.';
  }
});
required<HTMLButtonElement>('[data-action="lock-all-layers"]').addEventListener('click', () => {
  session.setAllLayersFlag('locked', true);
});

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
      setEditorTool(tool);
    }
  });
}
referenceFiles.addEventListener('change', async () => {
  const files = [...(referenceFiles.files ?? [])];
  for (const file of files) {
    try {
      const document = parseMap(
        await file.text(),
        createSequentialIdFactory(`reference-source-${referenceSequence + 1}`),
      );
      addReferenceDocument(file.name, document);
    } catch (error) {
      statusMessage.textContent = `${file.name}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  referenceFiles.value = '';
});

undoButton.addEventListener('click', () => session.undo());
redoButton.addEventListener('click', () => session.redo());
repeatCommandsButton.addEventListener('click', repeatRecordedCommands);
clearRepeatCommandsButton.addEventListener('click', () => {
  if (!session.clearRepeatableCommands()) {
    statusMessage.textContent = 'No recorded command sequence to clear.';
  }
});
selectAllButton.addEventListener('click', selectAllEditableObjects);
invertSelectionButton.addEventListener('click', invertEditableObjectSelection);
duplicateButton.addEventListener('click', duplicateSelection);
copyButton.addEventListener('click', () => void copySelection());
pasteButton.addEventListener('click', () => void pasteFromClipboard(false));
pasteHereButton.addEventListener('click', () => void pasteFromClipboard(true));
deleteButton.addEventListener('click', deleteSelection);
focusSelectionButton.addEventListener('click', focusCurrentSelection);
hideSelectionButton.addEventListener('click', () => session.hideSelected());
isolateSelectionButton.addEventListener('click', () => session.isolateSelected());
showAllButton.addEventListener('click', () => session.showAll());
lockSelectionButton.addEventListener('click', () => session.lockSelected());
unlockAllButton.addEventListener('click', () => session.unlockAll());
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-selection-query]')) {
  button.addEventListener('click', () => {
    const mode = button.dataset.selectionQuery;
    if (mode === 'touching' || mode === 'inside' || mode === 'inside-projected') {
      applySelectionBrushQuery(mode);
    }
  });
}
compileButton.addEventListener('click', () => void compilePreview());
togglePreviewButton.addEventListener('click', () => showCompiledPreview(!showingCompiled));

issueStatus.addEventListener('click', () => setIssueBrowserOpen(!issueBrowserOpen));
required<HTMLButtonElement>('[data-action="close-issues"]').addEventListener('click', () =>
  setIssueBrowserOpen(false),
);
showHiddenIssues.addEventListener('change', renderIssues);
for (const input of document.querySelectorAll<HTMLInputElement>('[data-issue-filter]')) {
  input.addEventListener('change', () => {
    const type = input.dataset.issueFilter as EditorIssueType | undefined;
    if (!type) return;
    if (input.checked) enabledIssueTypes.add(type);
    else enabledIssueTypes.delete(type);
    renderIssues();
  });
}

viewFilterToggle.addEventListener('click', () => setViewFilterPopoverOpen(!viewFilterPopoverOpen));
required<HTMLButtonElement>('[data-action="close-view-filters"]').addEventListener('click', () =>
  setViewFilterPopoverOpen(false),
);
showWorldBrushes.addEventListener('change', () => {
  session.setWorldBrushesVisible(showWorldBrushes.checked);
});
for (const input of document.querySelectorAll<HTMLInputElement>('[data-special-brush-filter]')) {
  input.addEventListener('change', () => {
    const type = input.dataset.specialBrushFilter as EditorSpecialBrushFilter | undefined;
    if (type) session.setSpecialBrushFilterVisible(type, input.checked);
  });
}
entityClassFilterSearch.addEventListener('input', renderViewFilters);
required<HTMLButtonElement>('[data-action="show-all-entity-classes"]').addEventListener(
  'click',
  () => session.setAllEntityClassesVisible(true),
);
required<HTMLButtonElement>('[data-action="hide-all-entity-classes"]').addEventListener(
  'click',
  () => session.setAllEntityClassesVisible(false),
);

inspectorToggle.addEventListener('click', () => {
  setInspectorOpen(inspector.classList.contains('closed'));
});

for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-inspector-tab]')) {
  tab.addEventListener('click', () => {
    const target = tab.dataset.inspectorTab;
    for (const candidate of document.querySelectorAll<HTMLButtonElement>('[data-inspector-tab]')) {
      const active = candidate === tab;
      candidate.classList.toggle('active', active);
      candidate.setAttribute('aria-selected', String(active));
    }
    for (const panel of document.querySelectorAll<HTMLElement>('[data-inspector-panel]')) {
      panel.hidden = panel.dataset.inspectorPanel !== target;
    }
  });
}

for (const control of [
  simpleShapeKind,
  simpleShapeAxis,
  simpleShapeSides,
  simpleShapeCircleMode,
  simpleShapeHollow,
  simpleShapeThickness,
  simpleShapeRings,
  simpleShapeAccuracy,
  simpleShapeStepHeight,
  simpleShapeStairDirection,
]) {
  control.addEventListener('change', () => {
    try {
      updateSimpleShapeFields();
      if (activeTool === 'create') {
        statusMessage.textContent = `${simpleShapeLabel(simpleShapeOptions.kind)} selected. Drag a bounding box in any viewport.`;
      }
    } catch (error) {
      statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  });
}

gridSizeSelect.addEventListener('change', () => {
  activeGridSize = Number(gridSizeSelect.value);
  renderer?.setGridSize(activeGridSize);
  faceExtrudeDistance.step = String(activeGridSize);
  faceExtrudeDistance.value = String(activeGridSize);
  shearOffset.step = String(activeGridSize);
  sweepTranslateInputs.forEach((input) => {
    input.step = String(activeGridSize);
  });
  statusMessage.textContent = `Grid size set to ${activeGridSize}.`;
});

required<HTMLButtonElement>('[data-action="extrude-inward"]').addEventListener('click', () => {
  extrudeSelectedFaceBy(-activeGridSize);
});
required<HTMLButtonElement>('[data-action="extrude-outward"]').addEventListener('click', () => {
  extrudeSelectedFaceBy(activeGridSize);
});
required<HTMLButtonElement>('[data-action="extrude-exact"]').addEventListener('click', () => {
  extrudeSelectedFaceBy(Number(faceExtrudeDistance.value));
});
required<HTMLButtonElement>('[data-action="split-face"]').addEventListener('click', () => {
  splitSelectedFaceBy(Number(faceExtrudeDistance.value));
});
required<HTMLButtonElement>('[data-action="stamp-face"]').addEventListener('click', () => {
  stampSelectedFaceBy(Number(faceExtrudeDistance.value));
});
const updateSweepFromControls = (): void => {
  if (activeTool !== 'sweep') return;
  try {
    readSweepControls();
    sweepEscapeReset = false;
    refreshSweepPreview();
  } catch (error) {
    sweepCandidate = null;
    applySweepButton.disabled = true;
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
};
for (const input of [
  ...sweepTranslateInputs,
  ...sweepRotateInputs,
  sweepScale,
  sweepSegments,
  sweepIterations,
]) {
  input.addEventListener('input', updateSweepFromControls);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    updateSweepFromControls();
    applySweep();
  });
}
sweepPath.addEventListener('change', updateSweepFromControls);
sweepSnap.addEventListener('change', updateSweepFromControls);
textureLock.addEventListener('change', () => {
  sweepOptions = { ...sweepOptions, textureLock: textureLock.checked };
  refreshSweepPreview(false);
});
required<HTMLButtonElement>('[data-action="reset-sweep"]').addEventListener('click', () => {
  resetSweep(true);
  statusMessage.textContent = 'Sweep destination and path controls reset.';
});
applySweepButton.addEventListener('click', applySweep);
createHullButton.addEventListener('click', () => {
  try {
    if (!renderer?.commitHullBrush()) statusMessage.textContent = 'Place hull points first.';
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
});
discardHullButton.addEventListener('click', () => {
  if (!renderer?.clearHullPoints())
    statusMessage.textContent = 'There are no hull points to discard.';
});
csgMergeButton.addEventListener('click', () => applyCsgOperation('merge'));
csgIntersectButton.addEventListener('click', () => applyCsgOperation('intersect'));
required<HTMLButtonElement>('[data-action="csg-subtract"]').addEventListener('click', () =>
  applyCsgOperation('subtract'),
);
required<HTMLButtonElement>('[data-action="csg-hollow"]').addEventListener('click', () =>
  applyCsgOperation('hollow'),
);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-clip-mode]')) {
  button.addEventListener('click', () => {
    const mode = button.dataset.clipMode;
    if (mode === 'back' || mode === 'split' || mode === 'front') setClipMode(mode);
  });
}
applyClipButton.addEventListener('click', applyClip);
required<HTMLButtonElement>('[data-action="reset-clip"]').addEventListener('click', () => {
  renderer?.clearClipPlane();
});
required<HTMLButtonElement>('[data-action="reset-transform-pivot"]').addEventListener(
  'click',
  resetTransformPivot,
);
for (const input of [transformPivotX, transformPivotY, transformPivotZ]) {
  input.addEventListener('input', () => {
    try {
      readTransformPivot();
    } catch (error) {
      statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  });
}
required<HTMLButtonElement>('[data-action="apply-transform"]').addEventListener(
  'click',
  applyExactTransform,
);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-flip-axis]')) {
  button.addEventListener('click', () => {
    const axis = Number(button.dataset.flipAxis);
    if (axis === 0 || axis === 1 || axis === 2) flipSelectedObjects(axis);
  });
}

required<HTMLButtonElement>('[data-action="load-wad"]').addEventListener('click', () => {
  wadFiles.click();
});
required<HTMLButtonElement>('[data-action="load-palette"]').addEventListener('click', () => {
  paletteFile.click();
});
required<HTMLButtonElement>('[data-action="apply-material"]').addEventListener('click', () => {
  applySelectedMaterial();
});
applyTextureTransformButton.addEventListener('click', () => {
  try {
    const changed = session.applyTextureTransform({
      offset: [Number(textureShiftU.value), Number(textureShiftV.value)],
      rotationDegrees: Number(textureRotation.value),
      scale: [Number(textureScaleU.value), Number(textureScaleV.value)],
    });
    if (!changed) statusMessage.textContent = 'Select a face before adjusting its texture.';
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
});
for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-texture-align], [data-texture-layout]',
)) {
  button.addEventListener('click', (event) => {
    const operation = (button.dataset.textureAlign ?? button.dataset.textureLayout) as
      | FaceTextureAlignmentOperation
      | undefined;
    if (
      !operation ||
      ![
        'reset',
        'world',
        'flip-u',
        'flip-v',
        'rotate-ccw',
        'rotate-cw',
        'align-edge',
        'justify-u-min',
        'justify-u-max',
        'justify-v-min',
        'justify-v-max',
        'fit-u',
        'fit-v',
        'auto-fit',
      ].includes(operation)
    )
      return;
    try {
      if (
        !session.alignTexture(operation, {
          direction: event.shiftKey ? -1 : 1,
          fitMode: event.ctrlKey || event.metaKey ? 'subdivide' : 'repeat',
          textureSizeForMaterial(materialToken) {
            const material = materialCatalog.find(materialToken);
            return material ? [material.width, material.height] : null;
          },
        })
      ) {
        statusMessage.textContent = 'Select a brush or face before aligning its texture.';
      }
    } catch (error) {
      statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  });
}
required<HTMLButtonElement>('[data-action="set-entity-property"]').addEventListener('click', () => {
  const key = entityPropertyKey.value.trim();
  if (!key) {
    statusMessage.textContent = 'Enter an entity property key first.';
    entityPropertyKey.focus();
    return;
  }
  setEntityProperty(key, entityPropertyValue.value, entityPropertyProtected.checked);
  entityPropertyKey.value = '';
  entityPropertyValue.value = '';
  entityPropertyProtected.checked = false;
  entityPropertyKey.focus();
});
for (const input of [entityPropertyKey, entityPropertyValue]) {
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    required<HTMLButtonElement>('[data-action="set-entity-property"]').click();
  });
}

pointEntityPreset.addEventListener('change', () => {
  pointEntityClassname.value = pointEntityPreset.value;
  renderer?.setEntityPlacementBounds(pointEntityDefinition(pointEntityClassname.value).bounds);
  if (activeTool === 'entity') setEditorTool('entity');
});
pointEntityClassname.addEventListener('input', () => {
  renderer?.setEntityPlacementBounds(pointEntityDefinition(pointEntityClassname.value).bounds);
  if (activeTool === 'entity') {
    statusMessage.textContent = pointEntityClassname.value.trim()
      ? `Entity tool active. Click to place ${pointEntityClassname.value.trim()}.`
      : 'Enter a point-entity classname before placing it.';
  }
});

brushEntityClassname.addEventListener('input', () => updateInspector());
createGroupButton.addEventListener('click', () => {
  try {
    const name = groupName.value.trim() || 'Group';
    const ids = createSequentialIdFactory(`group-${session.document.revision + 1}`);
    const groupId = session.groupSelected(name, ids, openGroupId);
    if (!groupId) {
      statusMessage.textContent = 'Select one or more objects before grouping.';
      return;
    }
    statusMessage.textContent = `Grouped the selection as ${name}.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
});
renameGroupButton.addEventListener('click', () => {
  try {
    const group =
      selectedEditorGroup(session.document, session.selection) ??
      deriveEditorGroups(session.document).find((candidate) => candidate.id === openGroupId);
    if (!group) throw new Error('Select or open a group before renaming it');
    const name = groupName.value.trim();
    if (!name) throw new Error('Enter a group name');
    session.renameGroup(group.id, name);
    statusMessage.textContent = `Renamed group to ${name}.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
});
openGroupButton.addEventListener('click', () => {
  const group = selectedEditorGroup(session.document, session.selection);
  if (!group) {
    statusMessage.textContent = 'Select a group before opening it.';
    return;
  }
  const memberSelection: EditorSelection | null = session.selection?.brushId
    ? { brushId: session.selection.brushId }
    : session.selection?.entityId
      ? { entityId: session.selection.entityId }
      : null;
  openEditorGroup(group.id, memberSelection);
});
closeGroupButton.addEventListener('click', () => closeEditorGroup());
createLinkedDuplicateButton.addEventListener('click', () => {
  try {
    duplicateSequence += 1;
    const groupId = session.linkedDuplicateSelected(
      createSequentialIdFactory(`linked-duplicate-${duplicateSequence}`),
      [activeGridSize, activeGridSize, 0],
      textureLock.checked,
    );
    if (!groupId) {
      statusMessage.textContent = 'Select a closed group before creating a linked duplicate.';
      return;
    }
    const group = deriveEditorGroups(session.document).find(
      (candidate) => candidate.id === groupId,
    );
    statusMessage.textContent = `Created linked duplicate${group ? ` of ${group.name}` : ''}. Move or transform this copy independently.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
});
unlinkGroupButton.addEventListener('click', () => {
  try {
    const group = selectedEditorGroup(session.document, session.selection);
    if (!group || !session.unlinkGroup(group.id)) {
      statusMessage.textContent = 'Select a linked group before unlinking it.';
      return;
    }
    statusMessage.textContent = `Unlinked ${group.name}. Its contents are now independent.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
});
ungroupButton.addEventListener('click', () => {
  try {
    const group = selectedEditorGroup(session.document, session.selection);
    if (!group || !session.ungroupSelected(group.id)) {
      statusMessage.textContent = 'Select a closed group before ungrouping it.';
      return;
    }
    if (openGroupId === group.id) closeEditorGroup(false);
    statusMessage.textContent = `Ungrouped ${group.name} without deleting its objects.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
});
groupName.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (!renameGroupButton.hidden) renameGroupButton.click();
  else createGroupButton.click();
});
makeBrushEntityButton.addEventListener('click', () => {
  try {
    const classname = brushEntityClassname.value.trim();
    if (!classname) throw new Error('Enter a brush-entity classname first');
    const ids = createSequentialIdFactory(`brush-entity-${session.document.revision + 1}`);
    if (!session.createBrushEntity(classname, ids)) {
      statusMessage.textContent = 'Select one or more brushes first.';
    }
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
});
makeStructuralButton.addEventListener('click', () => {
  try {
    if (!session.makeSelectedStructural()) {
      statusMessage.textContent = 'Select one or more brushes first.';
    }
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  }
});
required<HTMLButtonElement>('[data-action="sample-material"]').addEventListener('click', () => {
  const selection = session.selection;
  const brush = selection?.brushId ? findBrush(session.document, selection.brushId) : null;
  const face = selection?.faceId
    ? brush?.faces.find((candidate) => candidate.id === selection.faceId)
    : undefined;
  if (!face) {
    statusMessage.textContent = 'Select a face before sampling its material.';
    return;
  }
  activeMaterialName = face.material;
  materialName.value = face.material;
  applyMaterialButton.disabled = false;
  renderMaterialCatalog();
  statusMessage.textContent = `Sampled ${face.material}.`;
});

materialFilter.addEventListener('input', () => renderMaterialCatalog());
materialSort.addEventListener('change', () => renderMaterialCatalog());
materialUsedOnly.addEventListener('change', () => renderMaterialCatalog());
materialName.addEventListener('input', () => {
  activeMaterialName = materialName.value.trim();
  applyMaterialButton.disabled = !session.selection || activeMaterialName.length === 0;
  renderMaterialCatalog();
});
selectMaterialFacesButton.addEventListener('click', () => selectFacesUsingCurrentMaterial());
selectMaterialBrushesButton.addEventListener('click', () => selectBrushesUsingCurrentMaterial());
setMaterialReplaceSourceButton.addEventListener('click', () => {
  materialReplaceSource.value = selectedMaterialToken();
  updateMaterialBrowserControls();
  materialReplaceTarget.focus();
});
setMaterialReplaceTargetButton.addEventListener('click', () => {
  materialReplaceTarget.value = selectedMaterialToken();
  updateMaterialBrowserControls();
});
materialReplaceSource.addEventListener('input', () => updateMaterialBrowserControls());
materialReplaceTarget.addEventListener('input', () => updateMaterialBrowserControls());
materialReplaceButton.addEventListener('click', () => replaceSelectedMaterialUsage());

paletteFile.addEventListener('change', async () => {
  const file = paletteFile.files?.[0];
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength < 768) {
    materialMessage.textContent = `${file.name} is ${bytes.byteLength} bytes; a Quake palette needs at least 768.`;
    materialMessage.classList.add('error-text');
  } else {
    quakePalette = bytes.slice(0, 768);
    for (const [name, data] of loadedWadSources) {
      materialCatalog.importWad(name, data, quakePalette);
    }
    renderMaterialCatalog();
    renderer?.setMaterials(materialCatalog.materials());
    materialMessage.textContent = `Loaded ${file.name}. Existing and future WAD2 imports use this palette.`;
    materialMessage.classList.remove('error-text');
  }
  paletteFile.value = '';
});

wadFiles.addEventListener('change', async () => {
  const files = [...(wadFiles.files ?? [])];
  if (files.length === 0) return;
  const summaries: string[] = [];
  let hasErrors = false;
  for (const file of files) {
    try {
      const data = await file.arrayBuffer();
      const result = materialCatalog.importWad(file.name, data, quakePalette);
      loadedWadSources.set(file.name, data);
      summaries.push(
        `${file.name}: ${result.added} added, ${result.replaced} replaced, ${result.skipped} skipped`,
      );
      hasErrors ||= result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
      if (result.diagnostics[0]) summaries.push(result.diagnostics[0].message);
    } catch (error) {
      hasErrors = true;
      summaries.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  renderMaterialCatalog();
  renderer?.setMaterials(materialCatalog.materials());
  materialMessage.textContent = summaries.join(' · ');
  materialMessage.classList.toggle('error-text', hasErrors);
  statusMessage.textContent = `Material catalog now contains ${materialCatalog.size} textures.`;
  wadFiles.value = '';
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-nudge-axis]')) {
  button.addEventListener('click', () => {
    const axis = Number(button.dataset.nudgeAxis);
    const direction = Number(button.dataset.nudgeDirection);
    if (!Number.isInteger(axis) || axis < 0 || axis > 2 || !Number.isFinite(direction)) return;
    const delta: [number, number, number] = [0, 0, 0];
    delta[axis] = activeGridSize * direction;
    if (activeTool === 'sweep') {
      const translation = [...sweepTransform.translation] as [number, number, number];
      translation[axis] = translation[axis]! + delta[axis]!;
      sweepTransform = { ...sweepTransform, translation };
      sweepEscapeReset = false;
      syncSweepControls();
      refreshSweepPreview();
      return;
    }
    if (
      activeTool === 'face' &&
      commitFaceNudge(delta, lastPointerPosition?.viewport ?? 'perspective')
    ) {
      return;
    }
    if (
      isTopologyTool(activeTool) &&
      commitTopologyNudge(delta, lastPointerPosition?.viewport ?? 'perspective')
    ) {
      return;
    }
    try {
      if (!session.translateSelected(delta, textureLock.checked)) {
        statusMessage.textContent = 'Select a brush before nudging.';
      }
    } catch (error) {
      statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  });
}

for (const pane of document.querySelectorAll<HTMLElement>('.viewport-pane')) {
  pane.querySelector('header')?.addEventListener('dblclick', () => {
    const maximized = pane.classList.toggle('maximized');
    viewportGrid.classList.toggle('has-maximized', maximized);
    if (!maximized) return;
    for (const other of document.querySelectorAll<HTMLElement>('.viewport-pane')) {
      if (other !== pane) other.classList.remove('maximized');
    }
  });
}

window.addEventListener('copy', (event) => {
  if (isTextEditingTarget(event.target)) return;
  const text = copySelectionText();
  if (!text) return;
  event.preventDefault();
  editorClipboardText = text;
  event.clipboardData?.setData('text/plain', text);
  statusMessage.textContent = session.selection?.faceId
    ? 'Copied face material and attributes.'
    : 'Copied selected objects as map text.';
});

window.addEventListener('paste', (event) => {
  if (isTextEditingTarget(event.target)) return;
  const text = event.clipboardData?.getData('text/plain');
  if (!text?.trim()) return;
  event.preventDefault();
  pasteClipboardText(text, false);
});

window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return;
  const editingText = isTextEditingTarget(event.target);
  if (event.key === 'Escape' && viewFilterPopoverOpen) {
    event.preventDefault();
    setViewFilterPopoverOpen(false);
    viewFilterToggle.focus();
    return;
  }
  if (!editingText && event.key === 'Home') {
    event.preventDefault();
    focusCurrentSelection();
    return;
  }
  if (!editingText && event.key === 'Escape' && uvEditor.cancel()) {
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
    if (event.shiftKey) invertEditableObjectSelection();
    else selectAllEditableObjects();
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
    repeatRecordedCommands();
    return;
  }
  if (
    !editingText &&
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'c'
  ) {
    event.preventDefault();
    void copySelection();
    return;
  }
  if (
    !editingText &&
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'v'
  ) {
    event.preventDefault();
    void pasteFromClipboard(false);
    return;
  }
  if (
    !editingText &&
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    event.key.toLowerCase() === 'v'
  ) {
    event.preventDefault();
    void pasteFromClipboard(true);
    return;
  }
  if (!editingText && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') {
    event.preventDefault();
    if (event.shiftKey) ungroupButton.click();
    else createGroupButton.click();
    return;
  }
  if (
    !editingText &&
    (event.metaKey || event.ctrlKey) &&
    event.altKey &&
    event.key.toLowerCase() === 'd'
  ) {
    event.preventDefault();
    createLinkedDuplicateButton.click();
    return;
  }
  if (activeTool === 'sweep' && event.key === 'Escape') {
    event.preventDefault();
    if (!sweepEscapeReset) {
      resetSweep(true);
      statusMessage.textContent = 'Sweep destination reset. Press Escape again to leave the tool.';
    } else {
      setEditorTool('select');
    }
    return;
  }
  if (!editingText && activeTool === 'sweep' && event.key.startsWith('Arrow')) {
    event.preventDefault();
    const translation = [...sweepTransform.translation] as [number, number, number];
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      translation[2] += event.key === 'ArrowUp' ? activeGridSize : -activeGridSize;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      translation[0] += event.key === 'ArrowRight' ? activeGridSize : -activeGridSize;
    } else {
      translation[1] += event.key === 'ArrowUp' ? activeGridSize : -activeGridSize;
    }
    sweepTransform = { ...sweepTransform, translation };
    sweepEscapeReset = false;
    syncSweepControls();
    refreshSweepPreview();
    return;
  }
  if (
    !editingText &&
    isTopologyTool(activeTool) &&
    topologySelectedVertices.length > 0 &&
    event.key.startsWith('Arrow')
  ) {
    const viewport = lastPointerPosition?.viewport ?? 'perspective';
    const delta = viewportKeyboardNudge(event.key, viewport, event.altKey);
    if (delta) {
      event.preventDefault();
      commitTopologyNudge(delta, viewport);
      return;
    }
  }
  if (
    !editingText &&
    activeTool === 'face' &&
    selectedFaceReferences(session.selection).length > 0 &&
    event.key.startsWith('Arrow')
  ) {
    const viewport = lastPointerPosition?.viewport ?? 'perspective';
    const delta = viewportKeyboardNudge(event.key, viewport, event.altKey);
    if (delta) {
      event.preventDefault();
      commitFaceNudge(delta, viewport);
      return;
    }
  }
  if (!editingText && activeTool === 'sweep' && (event.key === '[' || event.key === ']')) {
    event.preventDefault();
    const rotationDegrees = [...sweepTransform.rotationDegrees] as [number, number, number];
    rotationDegrees[2] += event.key === ']' ? 15 : -15;
    sweepTransform = { ...sweepTransform, rotationDegrees };
    sweepEscapeReset = false;
    syncSweepControls();
    refreshSweepPreview();
    return;
  }
  if (!editingText && activeTool === 'sweep' && (event.key === '-' || event.key === '=')) {
    event.preventDefault();
    sweepTransform = {
      ...sweepTransform,
      scale: Math.max(
        0.05,
        Math.min(20, sweepTransform.scale + (event.key === '=' ? 0.05 : -0.05)),
      ),
    };
    sweepEscapeReset = false;
    syncSweepControls();
    refreshSweepPreview();
    return;
  }
  if (!editingText && event.key.toLowerCase() === 'b' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    setEditorTool('create');
    return;
  }
  if (!editingText && event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    setEditorTool(activeTool === 'entity' ? 'select' : 'entity');
    return;
  }
  if (!editingText && event.key.toLowerCase() === 'g' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    setEditorTool(activeTool === 'hull' ? 'select' : 'hull');
    return;
  }
  if (!editingText && event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    setEditorTool(activeTool === 'face' ? 'select' : 'face');
    return;
  }
  if (!editingText && event.key.toLowerCase() === 'w' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    setEditorTool(activeTool === 'sweep' ? 'select' : 'sweep');
    return;
  }
  if (!editingText && event.key.toLowerCase() === 'v' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    setEditorTool(activeTool === 'vertex' ? 'select' : 'vertex');
    return;
  }
  if (!editingText && event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    setEditorTool(activeTool === 'edge' ? 'select' : 'edge');
    return;
  }
  if (!editingText && event.key.toLowerCase() === 'c' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    setEditorTool(activeTool === 'clip' ? 'select' : 'clip');
    return;
  }
  if (!editingText && event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    setEditorTool(activeTool === 'rotate' ? 'select' : 'rotate');
    return;
  }
  if (!editingText && event.key.toLowerCase() === 's' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    setEditorTool(activeTool === 'scale' ? 'select' : 'scale');
    return;
  }
  if (!editingText && event.key.toLowerCase() === 'h' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    setEditorTool(activeTool === 'shear' ? 'select' : 'shear');
    return;
  }
  if (!editingText && activeTool === 'clip' && event.key === 'Enter') {
    event.preventDefault();
    applyClip();
    return;
  }
  if (!editingText && activeTool === 'sweep' && event.key === 'Enter') {
    event.preventDefault();
    applySweep();
    return;
  }
  if (!editingText && activeTool === 'hull' && event.key === 'Enter') {
    event.preventDefault();
    try {
      if (!renderer?.commitHullBrush()) statusMessage.textContent = 'Place hull points first.';
    } catch (error) {
      statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
    return;
  }
  if (!editingText && event.key === 'Escape' && clearActiveHandleSelection()) {
    event.preventDefault();
    return;
  }
  if (!editingText && event.key === 'Escape' && activeTool !== 'select') {
    event.preventDefault();
    if (activeTool === 'clip' && renderer?.removeLastClipPoint()) {
      statusMessage.textContent = 'Removed the most recent clip point.';
      return;
    }
    if (activeTool === 'hull' && renderer?.clearHullPoints()) {
      statusMessage.textContent = 'Discarded all hull points.';
      return;
    }
    setEditorTool('select');
    return;
  }
  if (!editingText && event.key === 'Escape' && openGroupId) {
    event.preventDefault();
    closeEditorGroup();
    return;
  }
  if (!editingText && event.key === 'Escape' && session.selection) {
    event.preventDefault();
    session.select(null);
    statusMessage.textContent = 'Cleared the object selection.';
    return;
  }
  if (!editingText && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    duplicateSelection();
    return;
  }
  if (!editingText && (event.key === 'Delete' || event.key === 'Backspace')) {
    event.preventDefault();
    if (activeTool === 'clip' && renderer?.removeLastClipPoint()) {
      statusMessage.textContent = 'Removed the most recent clip point.';
      return;
    }
    if (isTopologyTool(activeTool)) {
      deleteTopologySelection();
      return;
    }
    deleteSelection();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    mapFile.click();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    required<HTMLButtonElement>('[data-action="download"]').click();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) session.redo();
    else session.undo();
  }
});

window.addEventListener('beforeunload', () => {
  compilerCoordinator.cancel();
  compiledViewer?.dispose();
  stopSubscription?.();
  renderer?.dispose();
});
