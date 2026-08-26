export function TextureInspector() {
  return (
    <section data-inspector-panel="textures" hidden>
      <div className="panel-heading">
        <h2>Face</h2>
        <span>Valve 220</span>
      </div>
      <div className="texture-section inspector-section">
        <div className="uv-editor-heading">
          <h3>UV editor</h3>
          <button id="uv-reset-pivot" type="button">
            Center origin
          </button>
        </div>
        <div className="uv-editor-frame">
          <svg
            id="uv-editor"
            viewBox="0 0 320 220"
            role="application"
            aria-label="Selected face UV editor"
            tabIndex={0}
          />
        </div>
        <div className="uv-editor-status">
          <span id="uv-editor-status">No editable UV projection</span>
          <span>
            U <b>red</b> · V <b>green</b>
          </span>
        </div>
        <p className="uv-editor-help">
          Drag the face to pan the material, the outer ring to rotate, or the red and green handles
          to scale U or V. Shift gives fine rotation or proportional scaling. Drag the yellow origin
          to set the transform pivot; it snaps to the face center and vertices. Escape cancels a
          live transform.
        </p>
        <h3>Texture projection</h3>
        <div className="texture-fields">
          <label>
            Shift U<input id="texture-shift-u" type="number" step={1} />
          </label>
          <label>
            Shift V<input id="texture-shift-v" type="number" step={1} />
          </label>
          <label>
            Scale U<input id="texture-scale-u" type="number" step="0.05" />
          </label>
          <label>
            Scale V<input id="texture-scale-v" type="number" step="0.05" />
          </label>
          <label>
            Rotation
            <input id="texture-rotation" type="number" step={1} />
          </label>
          <button type="button" data-action="apply-texture-transform">
            Apply
          </button>
        </div>
        <dl className="texture-axes">
          <div>
            <dt>U axis</dt>
            <dd id="texture-u-axis" />
          </div>
          <div>
            <dt>V axis</dt>
            <dd id="texture-v-axis" />
          </div>
        </dl>
        <div className="texture-alignment-controls" role="group" aria-label="Texture alignment">
          <button type="button" data-texture-align="reset">
            Reset face
          </button>
          <button type="button" data-texture-align="world">
            Reset world
          </button>
          <button type="button" data-texture-align="flip-u">
            Flip U
          </button>
          <button type="button" data-texture-align="flip-v">
            Flip V
          </button>
          <button type="button" data-texture-align="rotate-ccw">
            Rotate +90°
          </button>
          <button type="button" data-texture-align="rotate-cw">
            Rotate −90°
          </button>
        </div>
        <h4 className="texture-layout-title">Face bounds</h4>
        <div className="texture-justify-controls" role="group" aria-label="Texture justification">
          <button type="button" data-texture-layout="justify-v-min">
            Top
          </button>
          <button type="button" data-texture-layout="justify-u-min">
            Left
          </button>
          <button type="button" data-texture-layout="auto-fit">
            Auto fit
          </button>
          <button type="button" data-texture-layout="justify-u-max">
            Right
          </button>
          <button type="button" data-texture-layout="justify-v-max">
            Bottom
          </button>
        </div>
        <div
          className="texture-fit-controls"
          role="group"
          aria-label="Texture edge alignment and fit"
        >
          <button type="button" data-texture-layout="align-edge">
            Align edge
          </button>
          <button type="button" data-texture-layout="fit-u">
            Fit U
          </button>
          <button type="button" data-texture-layout="fit-v">
            Fit V
          </button>
        </div>
        <p className="texture-layout-help">
          Repeat to cycle edges, atlas slots, or integer fits. Shift cycles backward; Ctrl/Command
          fits 1/n subdivisions.
        </p>
        <p className="texture-transfer-help">
          <b>3D transfer:</b> select a source face, then Alt-click to project all attributes,
          Alt+Shift-click to rotate alignment onto the target, or Alt+Ctrl/Command-click for
          material only. Drag paints a chain; double-click affects the whole target brush.
        </p>
      </div>
      <div className="material-section inspector-section">
        <div className="section-heading">
          <h3>Materials</h3>
          <span id="material-count">0 loaded</span>
        </div>
        <div className="material-actions">
          <button type="button" data-action="load-wad">
            Load WAD
          </button>
          <button type="button" data-action="load-palette">
            Palette
          </button>
          <input id="wad-files" type="file" accept=".wad" multiple hidden />
          <input id="palette-file" type="file" accept=".lmp,.pal,.dat" hidden />
        </div>
        <input
          id="material-filter"
          className="tool-input"
          type="search"
          placeholder="Filter materials"
          autoComplete="off"
        />
        <div className="material-browser-options">
          <label>
            Sort
            <select id="material-sort">
              <option value="name">Name</option>
              <option value="usage">Usage</option>
            </select>
          </label>
          <label className="material-used-only">
            <input id="material-used-only" type="checkbox" /> In use
          </label>
        </div>
        <div id="material-grid" className="material-grid" aria-label="Loaded materials" />
        <div className="material-apply">
          <input
            id="material-name"
            className="tool-input"
            type="text"
            placeholder="Material token"
            autoComplete="off"
          />
          <button type="button" data-action="sample-material">
            Sample
          </button>
          <button type="button" data-action="apply-material">
            Apply
          </button>
        </div>
        <div className="material-usage-actions" role="group" aria-label="Material usage selection">
          <button type="button" data-action="select-material-faces">
            Select faces
          </button>
          <button type="button" data-action="select-material-brushes">
            Select brushes
          </button>
          <button type="button" data-action="set-material-replace-source">
            Use as find
          </button>
          <button type="button" data-action="set-material-replace-target">
            Use as replacement
          </button>
        </div>
        <div className="material-replace">
          <label>
            Find
            <input
              id="material-replace-source"
              className="tool-input"
              type="text"
              autoComplete="off"
            />
          </label>
          <label>
            Replace
            <input
              id="material-replace-target"
              className="tool-input"
              type="text"
              autoComplete="off"
            />
          </label>
          <button type="button" data-action="replace-material">
            Replace
          </button>
        </div>
        <p id="material-replace-scope" className="material-replace-scope">
          No selection: replace across the whole map.
        </p>
        <p id="material-coverage" className="material-coverage" hidden />
        <p id="material-message" className="material-message">
          WAD assets stay in memory and are not embedded in map source.
        </p>
      </div>
    </section>
  );
}
