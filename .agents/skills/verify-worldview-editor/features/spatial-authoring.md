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

Resize targeting falls back to the nearest selected-brush silhouette edge without a distance cutoff. Verify this with a
pointer well outside the projected edge: Shift-hover must propose the hidden adjacent face and a
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

Performance diagnostics: activate Performance in the status bar. Verify live browser FPS, the
frame-time graph, and editor CPU timing in an empty map; idle render-call counts may be zero.
Record a short camera navigation, stop recording, then Show capture JSON and inspect the summary
and bounded samples. Hidden-tab intervals are excluded. Closing the panel stops monitoring;
these diagnostics do not measure GPU execution time. Do not automate the camera while a user
is navigating the shared browser.

Camera responsiveness regression coverage lives in `editor-performance-diagnostics.spec.ts`: hold
W in an empty map, verify movement and unchanged map revision, then inspect the capture. The graph
must update at its 250 ms publication interval rather than on each camera event. Keep the live
camera/pointer readout subscriptions below inspector and status-control component boundaries.

The diagnostics regression also draws a brush with many pointer samples: preview feedback must
remain visible, map revision stays unchanged until release, and the diagnostics graph must remain
at its publication cadence. Issue-list updates must not propagate through the editor shell when
the issue panel open/closed state is unchanged.

Toolbar and selection-driven inspector coverage is in `editor-toolbar.spec.ts`. Tools live in the
horizontal `.topbar`; `.workspace` begins at the left window edge. Open the `Worldview document menu`
for New, Open, Project, Save, Export normalized, and recovery actions. Secondary selection commands
live in `More edit actions`. Grid choices display only the number (`16`, etc.), beside texture lock. Shift-click a face and require Face
to become active without moving focus from the canvas; selecting a brush/entity activates Entity.
Hover must preserve a manually chosen inspector tab. Verify both menu downloads and narrow-width
horizontal access to the tools, and keep camera-performance regression coverage passing.

The cube document menu also owns Collaboration, Appearance theme choices, and the Build submenu.
Viewport labels are 3D, XY, XZ, and YZ; accessible canvas names remain descriptive. Verify these
controls through `editor-toolbar.spec.ts`, including theme changes and opening collaboration.

Fast-drag regression coverage in `editor-navigation.spec.ts` suppresses the last movement sample
and requires the native release position to commit, with and without an earlier preview. One undo
must restore the original geometry.

Perspective drag coverage also blocks target-level pointerup delivery for rapid brush creation and
movement. Window capture must still commit both gestures and restore their geometry on undo.

The rapid perspective regression reproduces the live browser order `lostpointercapture` then
`pointerup`. Both creation and movement must commit, including when target-level pointerup is
suppressed. `editor-face-geometry.spec.ts` separately verifies genuine capture loss and pointercancel
still cancel previews and leave the next gesture usable.

Invalid face resizing retains the last valid preview and commits it on release. The focused face
geometry regressions cover both invalid release and returning to the valid range, including undo.

The perspective header FOV popup edits vertical FOV from 20–120 degrees. `editor-toolbar.spec.ts`
verifies current/default indicators, reset, persisted preferred default, factory 60-degree reset, and
Shift-scroll updates through the real camera.

Selection switches inspector tabs only when the inspector is already open. A closed inspector stays
closed for face and object selection and retains its previously chosen tab when reopened.

Hull verification in `editor-brush-construction.spec.ts` checks the selected volumetric preview
during Shift-drag, retained bounds after release, unchanged canonical WebMCP revision before commit,
and selection/bounds after Enter plus undo. Screenshots go to `artifacts/verification/hull/`.

`B` activates Hull (`G` is an alias). Verify hull draft undo/redo via toolbar and Ctrl/Command+Z,
then verify committed brush undo/redo. Tooltips show bracketed shortcuts; controls with no
registered shortcut omit the suffix.

Hull construction previews use yellow circular handles and wire edges rather than shaded brush
selection. Verify Shift press/release over the planar interior toggles `data-hull-face` even with
no mouse movement, then extrusion removes the fill and expands `data-hull-handles` from 4 to 8.
Capture the planar, Shift-highlighted, extruding, and committed frames; commit clears construction
handles and restores normal brush selection. Geometry and undo assertions remain unchanged.

Verify hull surface visibility in the dark theme: the volumetric preview has translucent neutral
faces and a contrasting surface grid, including after release. Require nonzero submitted
`data-hull-grid-segments` and `data-hull-surface-triangles`, then inspect the GPU screenshot.

Resize browser coverage also presses/releases Shift without pointer movement, checks the submitted
`data-resize-face-edges`, and captures the hidden-face outline before and during extrusion.

The shared drag lifecycle regression delays native pointerup after capture loss while retaining
compatibility mouseup. Face resize must commit once, survive the delayed duplicate release and
capture-loss recovery window, and undo exactly. Keep the rapid perspective creation/move and genuine
pointercancel/capture-loss cancellation tests passing alongside it.

`editor-surface-grid.spec.ts` checks that grid axes remain visible across perspective zoom levels
and rejects GPU errors. Inspect its screenshots under `artifacts/verification/surface-grid/` for
face-aligned lines and distance fading; those visual details require inspection.

Magnetic face extrusion: `editor-face-magnet.spec.ts` loads the dedicated playground, snaps to its
75-unit off-grid plane, continues beyond the attraction zone, returns and commits exactly, then
undoes. `data-face-magnet` reports the current snapped distance during a gesture. Unit tests cover
footprint filtering and separate attraction/release thresholds.

The face-magnet regression also checks cyan alignment while Ctrl bypasses magnetism, removal on Shift release, recalculation on Shift re-entry after an aligned commit, and removal after Undo. `data-face-alignment` lists the displayed face IDs independently of `data-face-magnet`;
`data-face-alignment-count` reports the number of cyan faces. The regression adds a second
edge-touching neighbor and requires both faces during a drag, Ctrl bypass, Shift re-entry, and
return to zero displacement. `face-snap-query.test.ts` covers the canonical spatial query, distant
geometry exclusion, hidden targets, reuse, and rebuilding after document changes.

The face-magnet browser regression starts a second drag from an aligned position, moves away, then
returns exactly to the original pointer position. Require zero-distance magnetism and cyan feedback,
unchanged final bounds, and no extra undo step.

Shared stroke rendering uses pixel-space expansion plus analytic coverage with 4× MSAA. After line
shader changes, run the near-plane grid, selection-guide, face-magnet and surface-grid browser
regressions; inspect diagonal outlines and thin grids in the saved GPU images.

Distant rendering checks in `editor-surface-grid.spec.ts` capture multiple perspective distances and
reject GPU/console errors. Inspect `distant-*.png` for dense-grid moiré and texture minification;
`material-mipmaps.test.ts` verifies checkerboard averaging and non-power-of-two edge coverage. Keep
near-plane and selection/magnet stroke checks when changing homogeneous clipping.

Selection-brush queries now live in the viewport right-click menu. The selection browser regression
checks Touching, Enclosed, and Enclosed in 2D with undo, including invoking Enclosed with the
inspector closed. The 2D query must use the menu's originating viewport; perspective disables it.

Context-menu browser coverage checks that selected objects and faces omit redundant selection
commands, while other commands and keyboard navigation remain available. Toolbar coverage checks
that document-menu section headings are absent and iconless labels align with icon-bearing labels.

The design-route browser specimen check verifies both themes and the downloadable SVG, including
that it contains vector artwork rather than embedded images or font glyphs.
Keep previews using the shared runtime icon styles;
external sheet edits are explicitly ported back to the runtime components, not auto-imported.

Multi-face extrusion: `editor-select-resize-and-sweep.spec.ts` verifies that one selected brush
shows one yellow face, selecting its coplanar neighbor shows both before and during Shift-drag,
both move in one undoable edit, and releasing Shift hides the preview. The renderer reports
`data-resize-face-count` and `data-resize-face-edges`; inspect the screenshot under
`artifacts/verification/extrusion/`. The selected-only resolver intentionally includes separated
coplanar selected faces, and the core face-selection tests cover opposing shared seams.

Split-extrusion continuation: the select/resize regression Shift+Ctrl-drags two yellow coplanar
faces twice, verifies both new pieces become the only selected brushes, and checks undo/redo
selection restoration. Inspect `artifacts/verification/extrusion/split-0.png` and `split-1.png` for
yellow outlines on the moving caps rather than the original face planes. Core face-selection
coverage additionally uses different polygon sizes and verifies the originals remain unselected.
