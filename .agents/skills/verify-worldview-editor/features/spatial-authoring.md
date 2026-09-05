# Spatial viewport authoring

## Sub-features

Four-view picking, camera navigation, brush/face/vertex/edge manipulation, lasso and paint
selection, resize, clip, sweep, hull, shape, UV, and contextual 3D actions.
Construction-grid coverage includes number-key selection, bracket stepping, snapped creation bounds,
undoable selected-brush or selected-face vertex snapping, and a fine screen-space perspective grid
that remains visually subordinate to ordinary and selected brush edges while zooming.
The world coordinate system spans the source viewports in theme-owned colors: red X, green Y, and
blue Z. Perspective shows all three axes; XY, XZ, and YZ show only the axes in their visible plane.
Hovering an object in the current selection shows its combined bounds and outward, fading corner
guides in the perspective viewport only.
Selection drilling uses Ctrl/Command+wheel for objects in every viewport and adds Shift for faces;
both directions wrap through overlapping candidates beneath the pointer.

## How to get to it (user POV)

Choose the visible tool, then interact directly with perspective, XY, XZ, or YZ canvases using the
documented mouse/modifier gestures.

The default Select tool owns TrenchBroom's permanent interaction stack: click to select, drag a
selection to move it, and drag with no selection to create the configured simple shape. Brush
creation is not a separate modal toolbar tool.

Ordinary Paste (`Ctrl/Command+V`) places copied object bounds at the active viewport cursor. In 3D
they rest on the pointed surface or appear 256 units along the empty-space cursor ray; in 2D their
hidden side aligns with the far side of the current selection. `Ctrl/Command+Alt+V` is the explicit
Paste at Original Position command.

Shift-dragging a face of a multi-brush object selection resizes every compatible selected face as
one undoable operation. Same-facing faces need only share the plane; opposing faces must overlap the
grabbed polygon so only a genuine shared seam participates.

The desktop workspace follows TrenchBroom's default balanced 2×2 layout: Perspective is upper-left,
XY upper-right, XZ lower-left, and YZ lower-right. Drag the shared row or column separator, or the
separator immediately left of the inspector, to resize them. Dragging the central row/column
junction changes both viewport splits in one gesture. Focused separators and the junction also
respond to arrow keys.

Camera positions for all four viewports, pane and inspector splits, and Perspective-only mode are
remembered per map in the current browser. Returning to the same hosted, project, standalone, or
new-map workspace restores that local view without changing the map or another participant's view.

## Driving it with Playwright

Reuse the projection and selector helpers in `tests/browser/editor/support` and the focused spatial
specs under `tests/browser/editor`. Seed or inspect state through WebMCP first, then perform only the
spatial gesture with Playwright. Capture before, action, and result screenshots and verify the
resulting source or WebMCP object state.

## Gotchas

Compute canvas points from bounds and world projection; do not record desktop screen coordinates.
A DOM click is not proof of a GPU pick—verify selection or source state afterward.

Grid keys follow Radiant's mapping: `1` through `9` select 1 through 256 units and `[` / `]` step
the current power-of-two size. After drawing in an orthographic pane, inspect every component of the
created bounds, including the implicit depth axis. For Snap to grid, inspect derived vertices after
the command and restore the original off-grid bounds with Undo.

For layout verification, assert relative viewport bounds before interacting. Drag each one-axis
separator and require its `aria-valuenow` and the corresponding pane bounds to change; also exercise
an arrow key on a focused separator. Drag the `viewport-cross` junction diagonally and require both
the row and column values and pane bounds to change from that single gesture; its combined position
is exposed through `aria-valuetext`. Minimum-size clamps are intentional.
Toggle `Show Perspective only` and require the Perspective pane to match the viewport-grid bounds,
all orthographic panes and internal separators to be hidden, and their canvases to publish
`data-rendering="false"`. Restore the four-view layout before continuing multi-viewport gestures.

For viewport-workspace persistence, move both a Perspective and orthographic camera, change all
three workspace split values, enable Perspective-only mode, and reload the same map route. Require
the published camera snapshots, separator values, expanded layout, and suspended orthographic
canvases to match before reload. Use a fresh map identity when testing defaults so earlier local
snapshots cannot influence the result.

The React-owned viewport context menu also owns native-menu suppression. Keep the document capture
listener scoped to viewport targets or the short interval while the Worldview menu is open, and
remove it when the component unmounts. This covers Windows browsers that dispatch `contextmenu`
after `pointerup`, when React Aria has made the original canvas inert and retargeted the event to the
document body. Browser proof must require that late event to be cancelled while preserving native
context menus on ordinary inputs outside the viewport.

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

Camera drags defer editing-cursor surface picks until release. After looking around, paste without
another mouse move and compare its destination with a fresh hover at the same screen coordinate.
This catches stale paste positions while keeping surface raycasts out of camera motion.

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

Coordinate-axis verification should open an empty map so geometry cannot hide the lines, then
capture the full four-pane workspace. Require the Perspective viewport to contain the X, Y, and Z
theme colors and each orthographic viewport to contain only its plane's pair (XY, XZ, or YZ). Check
the generated coordinate-system vertices separately so screenshots are visual evidence rather than
the sole proof of axis mapping.

Perspective-grid width verification must dolly the camera through the grid's near-plane crossing,
not merely frame a brush at a comfortable distance. Sample several vertical pixel columns in the
lower viewport and reject sustained grid-colored bands; this catches screen-space line expansion
performed before homogeneous clipping.

Selection-guide verification should select through WebMCP, capture the perspective canvas while the
pointer is in empty space, then hover the selected object and require a changed GPU image. Moving
the pointer onto the selected object in an orthographic canvas keeps the guides visible in
Perspective but never draws them in the orthographic canvas itself. Moving to empty space removes
them; hover state is shared by the linked viewports just as selection is. The canvases publish the
submitted guide state through `data-selection-guide`; require Perspective to switch between `true`
and `false` while every orthographic canvas remains `false`. Keep a full-page GPU capture as visual
evidence because Chromium can omit WebGPU pixels from element-clipped screenshots.

Theme selection is a React Aria select rooted at `#editor-theme` with System, Dark, and Light
options. Open its labelled button and choose the named option rather than calling native
`selectOption`. Verify a runtime switch by requiring the root `data-theme`, computed `color-scheme`, persisted
`worldview.editor.theme` value, and a new viewport screenshot. Reload to prove persistence. A theme
switch must not change the document revision, selection, camera state, or undo history.

Inspector Map, Entity, and Face pages are React Aria tabs. Verify arrow-key selection from a focused
tab and require the matching `[data-inspector-panel]` to be visible while forced-mounted inactive
panels are inert and hidden. Quake II surface checkboxes should be toggled with keyboard Space on the
named checkbox (their native inputs are visually hidden); verify the serialized face flags/value,
not only the visual control state.
