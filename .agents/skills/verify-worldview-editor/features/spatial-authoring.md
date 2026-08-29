# Spatial viewport authoring

## Sub-features

Four-view picking, camera navigation, brush/face/vertex/edge manipulation, lasso and paint
selection, resize, clip, sweep, hull, shape, UV, and contextual 3D actions.
Construction-grid coverage includes number-key selection, bracket stepping, snapped creation bounds,
undoable selected-brush or selected-face vertex snapping, and a fine screen-space perspective grid
that remains visually subordinate to ordinary and selected brush edges while zooming.
Selection drilling uses Ctrl/Command+wheel for objects in every viewport and adds Shift for faces;
both directions wrap through overlapping candidates beneath the pointer.

## How to get to it (user POV)

Choose the visible tool, then interact directly with perspective, XY, XZ, or YZ canvases using the
documented mouse/modifier gestures.

The default Select tool owns TrenchBroom's permanent interaction stack: click to select, drag a
selection to move it, and drag with no selection to create the configured simple shape. Brush
creation is not a separate modal toolbar tool.

The desktop workspace follows TrenchBroom's default balanced 2×2 layout: Perspective is upper-left,
XY upper-right, XZ lower-left, and YZ lower-right. Drag the shared row or column separator, or the
separator immediately left of the inspector, to resize them. Focused separators also respond to
arrow keys.

## Driving it with Playwright

Reuse the projection and selector helpers in `tests/browser/editor.spec.ts`. Seed or inspect state
through WebMCP first, then perform only the spatial gesture with Playwright. Capture before, action,
and result screenshots and verify the resulting source or WebMCP object state.

## Gotchas

Compute canvas points from bounds and world projection; do not record desktop screen coordinates.
A DOM click is not proof of a GPU pick—verify selection or source state afterward.

Grid keys follow Radiant's mapping: `1` through `9` select 1 through 256 units and `[` / `]` step
the current power-of-two size. After drawing in an orthographic pane, inspect every component of the
created bounds, including the implicit depth axis. For Snap to grid, inspect derived vertices after
the command and restore the original off-grid bounds with Undo.

For layout verification, assert relative viewport bounds before interacting. Drag every
`[data-resize]` separator and require its `aria-valuenow` and the corresponding pane bounds to
change; also exercise an arrow key on a focused separator. Minimum-size clamps are intentional.

Drag previews are transient candidates and may share the same next document and brush revision.
Their solid-buffer cache identity must include actual geometry and texture projection. For stale-mesh
regressions, select semantically through WebMCP, hold a real pointer drag open, capture at least two
different pointer-move frames before pointer-up, and require the perspective solid and projected
outline to move together. Then compare the committed frame without clearing the selection. Run
`scene-solid-batches.test.ts` with the browser `brush dragging` case for the focused regression pair.

Camera navigation regressions need combined input, not only isolated gestures. To verify fly/look
continuity, hold a right-button look gesture open, move far enough to activate it, fly with WASD,
release the key while keeping the button held, then send another pointer move. The eye position must
remain at the flown destination while yaw or pitch changes; a return toward the pointer-down eye is
a stale camera-anchor failure. Perspective look and Alt+right-button orbit use direct vertical
controls: dragging upward raises pitch and dragging downward lowers it.

For Shift-hover face targeting on a selected brush, capture the same perspective region before and
after holding Shift and moving across a visible face. The prospective face must retain its existing
texture and grid treatment and gain only an amber face boundary on top of the brush's otherwise red
selection outline. Confirm the other brush edges stay red and the document selection and revision do
not change until the actual drag or click begins.

Resize targeting extends ten CSS pixels beyond selected-brush silhouette edges. Verify this with a
pointer just outside the projected edge: Shift-hover must propose the hidden adjacent face and a
Shift-drag must commit a face move. Direct face hits retain priority, and edges between two equally
front-facing or equally back-facing faces are not eligible.

Viewport color evidence must be interpreted through the active CSS theme. Inspect the computed
`--renderer-*` custom properties and capture both ordinary and selected/hovered states. Renderer
colors are resolved from those properties at startup; hard-coded RGB expectations belong only in a
purpose-built theme fixture, not in general visual checks.

Theme selection is available through `#editor-theme` with System, Dark, and Light values. Verify a
runtime switch by requiring the root `data-theme`, computed `color-scheme`, persisted
`worldview.editor.theme` value, and a new viewport screenshot. Reload to prove persistence. A theme
switch must not change the document revision, selection, camera state, or undo history.
