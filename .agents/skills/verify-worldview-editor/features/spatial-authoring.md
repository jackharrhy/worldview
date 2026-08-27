# Spatial viewport authoring

## Sub-features

Four-view picking, camera navigation, brush/face/vertex/edge manipulation, lasso and paint
selection, resize, clip, sweep, hull, shape, UV, and contextual 3D actions.

## How to get to it (user POV)

Choose the visible tool, then interact directly with perspective, XY, XZ, or YZ canvases using the
documented mouse/modifier gestures.

## Driving it with Playwright

Reuse the projection and selector helpers in `tests/browser/editor.spec.ts`. Seed or inspect state
through WebMCP first, then perform only the spatial gesture with Playwright. Capture before, action,
and result screenshots and verify the resulting source or WebMCP object state.

## Gotchas

Compute canvas points from bounds and world projection; do not record desktop screen coordinates.
A DOM click is not proof of a GPU pick—verify selection or source state afterward.

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

Viewport color evidence must be interpreted through the active CSS theme. Inspect the computed
`--renderer-*` custom properties and capture both ordinary and selected/hovered states. Renderer
colors are resolved from those properties at startup; hard-coded RGB expectations belong only in a
purpose-built theme fixture, not in general visual checks.
