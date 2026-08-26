import { BUILTIN_POINT_ENTITY_DEFINITIONS } from '@jackharrhy/worldview-editor';

export function ObjectInspector() {
  return (
    <section data-inspector-panel="object">
      <div className="panel-heading">
        <h2>Selection</h2>
        <span id="selection-kind">None</span>
      </div>
      <div id="selection-empty" className="empty-selection">
        Select a brush or face in any view.
      </div>
      <div
        id="point-entity-tool-section"
        className="point-entity-tool-section inspector-section"
        hidden
      >
        <div className="section-heading">
          <h3>Point entity</h3>
          <span>Click to place</span>
        </div>
        <label>
          Preset
          <select id="point-entity-preset">
            {BUILTIN_POINT_ENTITY_DEFINITIONS.map((definition) => (
              <option key={definition.classname} value={definition.classname}>
                {definition.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Classname
          <input
            id="point-entity-classname"
            type="text"
            defaultValue="light"
            autoComplete="off"
            spellCheck="false"
          />
        </label>
        <p>
          Click a brush surface in 3D to drop the entity against it. In a 2D view, visible axes come
          from the click and the hidden axis follows the latest selection.
        </p>
      </div>
      <div
        id="simple-shape-tool-section"
        className="simple-shape-tool-section inspector-section"
        hidden
      >
        <div className="section-heading">
          <h3>Simple shape</h3>
          <span id="simple-shape-result">Drag to draw</span>
        </div>
        <div className="simple-shape-primary">
          <label>
            Shape
            <select id="simple-shape-kind">
              <option value="cuboid">Cuboid</option>
              <option value="stairs">Stairs</option>
              <option value="arch">Arch</option>
              <option value="cylinder">Cylinder</option>
              <option value="cone">Cone</option>
              <option value="uv-sphere">Spheroid (UV)</option>
              <option value="ico-sphere">Spheroid (Icosahedron)</option>
            </select>
          </label>
          <label data-shape-field="axis">
            Axis
            <select id="simple-shape-axis" defaultValue={2}>
              <option value={0}>X</option>
              <option value={1}>Y</option>
              <option value={2}>Z</option>
            </select>
          </label>
        </div>
        <div id="simple-shape-circle-fields" className="simple-shape-fields" hidden>
          <label>
            Sides
            <input
              id="simple-shape-sides"
              type="number"
              defaultValue={8}
              min={3}
              max={96}
              step={1}
            />
          </label>
          <label>
            Circle
            <select id="simple-shape-circle-mode">
              <option value="edge-aligned">Edge aligned</option>
              <option value="vertex-aligned">Vertex aligned</option>
              <option value="scalable">Scalable grid</option>
            </select>
          </label>
        </div>
        <div id="simple-shape-hollow-fields" className="simple-shape-fields" hidden>
          <label className="simple-shape-check">
            <input id="simple-shape-hollow" type="checkbox" /> Hollow
          </label>
          <label>
            Thickness
            <input
              id="simple-shape-thickness"
              type="number"
              defaultValue={16}
              min={1}
              max={1024}
              step={1}
            />
          </label>
        </div>
        <div id="simple-shape-uv-fields" className="simple-shape-fields" hidden>
          <label>
            Rings
            <input
              id="simple-shape-rings"
              type="number"
              defaultValue={8}
              min={1}
              max={32}
              step={1}
            />
          </label>
        </div>
        <div id="simple-shape-ico-fields" className="simple-shape-fields" hidden>
          <label>
            Accuracy
            <input
              id="simple-shape-accuracy"
              type="number"
              defaultValue={1}
              min={1}
              max={3}
              step={1}
            />
          </label>
        </div>
        <div id="simple-shape-stair-fields" className="simple-shape-fields" hidden>
          <label>
            Step height
            <input
              id="simple-shape-step-height"
              type="number"
              defaultValue={16}
              min={1}
              max={1024}
              step={1}
            />
          </label>
          <label>
            Direction
            <select id="simple-shape-stair-direction">
              <option value="positive-x">+X</option>
              <option value="negative-x">−X</option>
              <option value="positive-y">+Y</option>
              <option value="negative-y">−Y</option>
            </select>
          </label>
        </div>
        <p>
          Drag in any viewport for a live preview. Shift makes the visible axes equal; Shift+Alt
          makes a cube in 3D. After starting a 3D drag, hold Alt to adjust only its height.
        </p>
      </div>
      <div id="hull-tool-section" className="hull-tool-section inspector-section" hidden>
        <div className="section-heading">
          <h3>Convex hull brush</h3>
          <span id="hull-point-count">0 points</span>
        </div>
        <div className="hull-actions">
          <button type="button" data-action="create-hull" disabled>
            Create hull
          </button>
          <button type="button" data-action="discard-hull" disabled>
            Discard points
          </button>
        </div>
        <p>
          Perspective only: click a reference face for one point, double-click for all face
          vertices, or drag a rectangle. Shift-drag a placed polygon along its normal. Enter
          creates; Escape discards everything.
        </p>
      </div>
      <div id="selection-inspector" hidden>
        <dl className="property-list">
          <div>
            <dt id="selection-id-label">Brush</dt>
            <dd id="brush-id" />
          </div>
          <div>
            <dt id="selection-revision-label">Revision</dt>
            <dd id="brush-revision" />
          </div>
          <div>
            <dt id="selection-faces-label">Faces</dt>
            <dd id="brush-faces" />
          </div>
          <div>
            <dt>Bounds</dt>
            <dd id="brush-bounds" />
          </div>
          <div>
            <dt id="selection-material-label">Material</dt>
            <dd id="face-material" />
          </div>
        </dl>
        <div id="group-section" className="group-section inspector-section" hidden>
          <div className="section-heading">
            <h3>Group</h3>
            <span id="group-state">Selection</span>
          </div>
          <label>
            Name
            <input
              id="group-name"
              type="text"
              defaultValue="Group"
              autoComplete="off"
              spellCheck="false"
            />
          </label>
          <div className="group-actions">
            <button type="button" data-action="create-group">
              Group selection
            </button>
            <button type="button" data-action="rename-group" hidden>
              Rename
            </button>
            <button type="button" data-action="open-group" hidden>
              Open
            </button>
            <button type="button" data-action="close-group" hidden>
              Close
            </button>
            <button type="button" data-action="create-linked-duplicate" hidden>
              Linked duplicate
            </button>
            <button type="button" data-action="unlink-group" hidden>
              Unlink
            </button>
            <button type="button" data-action="ungroup" hidden>
              Ungroup
            </button>
          </div>
          <p>
            Closed groups select and transform as one object. Linked duplicates keep reusable copies
            synchronized; purple arrows show affected siblings. Double-click or Open to edit
            members, with everything outside locked.
          </p>
        </div>
        <div
          id="selection-brush-section"
          className="selection-brush-section inspector-section"
          hidden
        >
          <div className="section-heading">
            <h3>Selection brush</h3>
            <span id="selection-brush-count">1 volume</span>
          </div>
          <div className="selection-brush-actions">
            <button type="button" data-selection-query="touching">
              Touching
            </button>
            <button type="button" data-selection-query="inside">
              Enclosed
            </button>
            <button type="button" data-selection-query="inside-projected">
              Enclosed in 2D
            </button>
          </div>
          <p>
            Consumes the selected structural brushes and selects editable objects touching them,
            fully enclosed by them, or enclosed by their projection in the last pointed 2D view.
          </p>
        </div>
        <div id="object-flip-section" className="object-flip-section inspector-section" hidden>
          <div className="section-heading">
            <h3>Mirror selection</h3>
            <span>Snapped center</span>
          </div>
          <div
            className="object-flip-controls"
            role="group"
            aria-label="Mirror selection by world axis"
          >
            <button type="button" data-flip-axis={0}>
              Flip X
            </button>
            <button type="button" data-flip-axis={1}>
              Flip Y
            </button>
            <button type="button" data-flip-axis={2}>
              Flip Z
            </button>
          </div>
        </div>
        <div id="face-extrude-section" className="face-extrude-section inspector-section" hidden>
          <div className="section-heading">
            <h3>Face extrusion</h3>
            <span id="face-normal" />
          </div>
          <div className="face-extrude-controls">
            <input
              id="face-extrude-distance"
              type="number"
              defaultValue={16}
              step={16}
              aria-label="Face extrusion distance"
            />
            <button type="button" data-action="extrude-inward">
              Inward
            </button>
            <button type="button" data-action="extrude-outward">
              Outward
            </button>
            <button type="button" data-action="extrude-exact">
              Apply
            </button>
            <button type="button" data-action="split-face">
              Split
            </button>
            <button type="button" data-action="stamp-face">
              Stamp
            </button>
          </div>
          <p>
            In Face, drag the center handle or use Arrow keys on the pointed viewport; Escape clears
            face handles before leaving the tool. In Select, Shift-drag a face of an already
            selected brush. Add Alt to move on the viewport plane, Ctrl/Command to split, or both to
            stamp.
          </p>
        </div>
        <div id="sweep-tool-section" className="sweep-tool-section inspector-section" hidden>
          <div className="section-heading">
            <h3>Sweep selected faces</h3>
            <span id="sweep-generated-count">0 brushes</span>
          </div>
          <h4>Destination translation</h4>
          <div className="transform-vector">
            <label>
              X<input id="sweep-translate-x" type="number" defaultValue={0} step={16} />
            </label>
            <label>
              Y<input id="sweep-translate-y" type="number" defaultValue={0} step={16} />
            </label>
            <label>
              Z<input id="sweep-translate-z" type="number" defaultValue={64} step={16} />
            </label>
          </div>
          <h4>Destination rotation</h4>
          <div className="transform-vector">
            <label>
              X<input id="sweep-rotate-x" type="number" defaultValue={0} step={5} />
            </label>
            <label>
              Y<input id="sweep-rotate-y" type="number" defaultValue={0} step={5} />
            </label>
            <label>
              Z<input id="sweep-rotate-z" type="number" defaultValue={0} step={5} />
            </label>
          </div>
          <div className="sweep-shape-fields">
            <label>
              Scale
              <input
                id="sweep-scale"
                type="number"
                defaultValue={1}
                min="0.05"
                max={20}
                step="0.05"
              />
            </label>
            <label>
              Path
              <select id="sweep-path">
                <option value="straight">Straight</option>
                <option value="arc">Arc</option>
                <option value="s-bend">S-bend</option>
              </select>
            </label>
            <label>
              Segments
              <input
                id="sweep-segments"
                type="number"
                defaultValue={4}
                min={1}
                max={128}
                step={1}
              />
            </label>
            <label>
              Iterations
              <input
                id="sweep-iterations"
                type="number"
                defaultValue={1}
                min={1}
                max={64}
                step={1}
              />
            </label>
          </div>
          <label className="sweep-snap-toggle">
            <input id="sweep-snap" type="checkbox" /> Snap generated vertices to integers
          </label>
          <div className="sweep-actions">
            <button type="button" data-action="reset-sweep">
              Reset
            </button>
            <button type="button" data-action="apply-sweep">
              Apply Sweep
            </button>
          </div>
          <p>
            3D only: drag the yellow center to move (Alt for Z), colored rings to rotate, or the
            green handle to scale. Shift constrains movement or rotates in 5° steps. Enter applies;
            Escape resets, then exits.
          </p>
        </div>
        <div id="clip-tool-section" className="clip-tool-section inspector-section" hidden>
          <div className="section-heading">
            <h3>Clip plane</h3>
            <span id="clip-point-count">0 / 3 points</span>
          </div>
          <p id="clip-point-positions">No clip points.</p>
          <div className="clip-mode-controls" role="group" aria-label="Clip result">
            <button className="active" type="button" data-clip-mode="back" aria-pressed="true">
              Keep back
            </button>
            <button type="button" data-clip-mode="split" aria-pressed="false">
              Split
            </button>
            <button type="button" data-clip-mode="front" aria-pressed="false">
              Keep front
            </button>
          </div>
          <div className="clip-actions">
            <button type="button" data-action="apply-clip" disabled>
              Apply clip
            </button>
            <button type="button" data-action="reset-clip">
              Reset points
            </button>
          </div>
          <p>
            Click two or three snapped points in any viewport. Drag to place two points or
            reposition an orange point; Shift locks its dominant axis in 2D. Double-click a face to
            match its plane.
          </p>
        </div>
        <div
          id="transform-tool-section"
          className="transform-tool-section inspector-section"
          hidden
        >
          <div className="section-heading">
            <h3 id="transform-tool-title">Transform</h3>
            <button type="button" data-action="reset-transform-pivot">
              Reset pivot
            </button>
          </div>
          <div className="transform-vector transform-pivot">
            <label>
              X<input id="transform-pivot-x" type="number" step={1} />
            </label>
            <label>
              Y<input id="transform-pivot-y" type="number" step={1} />
            </label>
            <label>
              Z<input id="transform-pivot-z" type="number" step={1} />
            </label>
          </div>
          <div data-transform-panel="rotate" hidden>
            <div className="transform-fields">
              <label>
                Axis
                <select id="rotate-axis" defaultValue={2}>
                  <option value={0}>X</option>
                  <option value={1}>Y</option>
                  <option value={2}>Z</option>
                </select>
              </label>
              <label>
                Angle
                <input id="rotate-angle" type="number" defaultValue={15} step={5} />
              </label>
            </div>
            <label className="transform-angle-toggle">
              <input id="rotate-update-entity-angles" type="checkbox" defaultChecked /> Update
              entity angles
            </label>
          </div>
          <div data-transform-panel="scale" hidden>
            <div className="transform-vector">
              <label>
                X<input id="scale-x" type="number" defaultValue={1} step="0.05" />
              </label>
              <label>
                Y<input id="scale-y" type="number" defaultValue={1} step="0.05" />
              </label>
              <label>
                Z<input id="scale-z" type="number" defaultValue={1} step="0.05" />
              </label>
            </div>
          </div>
          <div data-transform-panel="shear" hidden>
            <div className="transform-fields transform-shear-fields">
              <label>
                Plane axis
                <select id="shear-source-axis" defaultValue={2}>
                  <option value={0}>X</option>
                  <option value={1}>Y</option>
                  <option value={2}>Z</option>
                </select>
              </label>
              <label>
                Move axis
                <select id="shear-target-axis" defaultValue={0}>
                  <option value={0}>X</option>
                  <option value={1}>Y</option>
                  <option value={2}>Z</option>
                </select>
              </label>
              <label>
                Offset
                <input id="shear-offset" type="number" defaultValue={16} step={16} />
              </label>
            </div>
          </div>
          <button className="transform-apply" type="button" data-action="apply-transform">
            Apply transform
          </button>
          <p id="transform-tool-help">Drag the viewport handle for a live snapped preview.</p>
        </div>
        <div id="topology-tool-section" className="topology-tool-section inspector-section" hidden>
          <div className="section-heading">
            <h3 id="topology-tool-title">Vertex editing</h3>
            <span>
              <b id="topology-selection-count">0</b> selected · Grid{' '}
              <b id="topology-grid-size">16</b>
            </span>
          </div>
          <p id="topology-tool-help">
            Click or lasso yellow handles across the selected brushes. Ctrl/Command adds handles or
            toggles absolute vertex snapping during a drag. Shift+Alt-click another vertex to
            quick-snap the selection; Arrow keys nudge it on the active viewport axes. In 3D, Alt
            moves vertically and Shift locks the dominant axis. Shift-drag a green surface handle to
            add a vertex. Delete remains hull-safe; Escape clears handles before leaving the tool.
          </p>
        </div>
        <div id="csg-section" className="csg-section inspector-section" hidden>
          <div className="section-heading">
            <h3>Constructive geometry</h3>
            <span id="csg-selection-count" />
          </div>
          <div className="csg-controls">
            <button type="button" data-action="csg-merge">
              Convex merge
            </button>
            <button type="button" data-action="csg-intersect">
              Intersect
            </button>
            <button type="button" data-action="csg-subtract">
              Subtract
            </button>
            <button type="button" data-action="csg-hollow">
              Hollow
            </button>
          </div>
          <p>
            Subtract uses the selection as cutters against every other brush. Hollow uses the
            current grid size for wall thickness.
          </p>
        </div>
        <div id="entity-section" className="entity-section inspector-section">
          <div className="section-heading">
            <h3>Entity properties</h3>
            <span id="entity-classname" />
          </div>
          <div id="brush-entity-actions" className="brush-entity-actions" hidden>
            <input
              id="brush-entity-classname"
              type="text"
              defaultValue="func_detail"
              aria-label="Brush entity classname"
              autoComplete="off"
              spellCheck="false"
            />
            <button type="button" data-action="make-brush-entity">
              Make Entity
            </button>
            <button type="button" data-action="make-structural">
              Make Structural
            </button>
          </div>
          <div id="entity-properties" className="entity-properties" />
          <div className="entity-property-add">
            <input id="entity-property-key" type="text" placeholder="Key" autoComplete="off" />
            <input id="entity-property-value" type="text" placeholder="Value" autoComplete="off" />
            <label
              id="entity-property-protected-label"
              className="entity-property-protected"
              hidden
            >
              <input id="entity-property-protected" type="checkbox" /> Protected
            </label>
            <button type="button" data-action="set-entity-property">
              Add
            </button>
          </div>
        </div>
        <div className="transform-section inspector-section">
          <h3>Nudge by grid</h3>
          <div className="nudge-grid">
            <span>X</span>
            <button type="button" data-nudge-axis={0} data-nudge-direction={-1}>
              −
            </button>
            <button type="button" data-nudge-axis={0} data-nudge-direction={1}>
              +
            </button>
            <span>Y</span>
            <button type="button" data-nudge-axis={1} data-nudge-direction={-1}>
              −
            </button>
            <button type="button" data-nudge-axis={1} data-nudge-direction={1}>
              +
            </button>
            <span>Z</span>
            <button type="button" data-nudge-axis={2} data-nudge-direction={-1}>
              −
            </button>
            <button type="button" data-nudge-axis={2} data-nudge-direction={1}>
              +
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
