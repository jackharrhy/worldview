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
