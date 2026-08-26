# TrenchBroom source-view conformance notes

This note records behavior and architecture research against TrenchBroom commit
[`a4ec188`](https://github.com/TrenchBroom/TrenchBroom/tree/a4ec1886bf997ff73a18b2bf3d54e32c2020ce2a).
TrenchBroom is GPL software: it is a behavior and ownership oracle only. No implementation code is
adapted into Worldview's MIT sources.

## Rendering policy

TrenchBroom separates render policy from brush drawing. Its 2D map views select a 2D render mode,
its perspective view selects a 3D render mode, and the render context resolves those modes to the
following defaults:

| View        | Material faces | Brush edges | Grid and tool overlays |
| ----------- | -------------- | ----------- | ---------------------- |
| Perspective | Yes            | Yes         | Yes                    |
| XY, XZ, YZ  | No             | Yes         | Yes                    |

Worldview now follows that default. Solid material batches are submitted only in the perspective
viewport; orthographic panes draw the shared projected edge buffer and their own grid/tool overlays.
A future view preference may make faces configurable, but the default stays wireframe.

TrenchBroom's render views request repaints after input, resource, document, and view changes. They
do not run a permanent idle frame loop. Its perspective view requests the next frame only while fly
keys remain down. Worldview now uses the same scheduling contract: invalidations coalesce into one
animation frame, and the renderer reports whether active fly input requires another.

## Camera behavior

The current camera interactions conform closely:

| Interaction                | TrenchBroom behavior                             | Worldview status |
| -------------------------- | ------------------------------------------------ | ---------------- |
| Orthographic wheel         | Zoom around the cursor's world point             | Matched          |
| Orthographic drag          | Pan in projected world space                     | Matched          |
| Perspective right drag     | Look while preserving the camera eye             | Matched          |
| Perspective Alt-right drag | Orbit around a hit point, with a fallback pivot  | Matched          |
| Perspective middle drag    | Pan on the camera plane                          | Matched          |
| Perspective wheel          | Move forward/back                                | Matched          |
| Perspective Shift-wheel    | Change field of view                             | Matched          |
| Wheel while looking        | Change fly speed                                 | Matched          |
| First fly key              | Reset the frame timer to prevent a movement jump | Matched          |

TrenchBroom also applies fast/slow modifiers to keyboard fly motion and offers an alternate vertical
middle-drag behavior. Those are useful follow-ups, but they should enter through the focused camera
controller rather than adding more branches to the inherited viewport implementation.

## Controller ownership

TrenchBroom builds an ordered chain of focused tool controllers for each view. A controller may
accept an input and return a gesture tracker. One toolbox owns the active tracker and routes its
update, end, cancel, scroll, and modifier lifecycle. GPU scene ownership and gesture ownership do
not overlap.

Worldview has an explicit gesture lifecycle, but its input routing is not yet equivalent. Five
classes (`ViewportBase`, `ViewportTools`, `ViewportPointerDown`, `ViewportPointerMove`, and
`Viewport`) form an inheritance chain of roughly 3,000 lines sharing one large mutable
`PointerDrag`. Splitting that object below the file-size ceiling moved code without removing its
conditional complexity.

The replacement boundary is composition:

1. `ViewportSurface` owns the canvas, camera state, projection, GPU targets, and render policy.
2. `ViewportGestureRouter` owns at most one active tracker and the pointer/modifier lifecycle.
3. An ordered controller chain accepts typed input: camera, selection/move, transforms, topology,
   face/material, clipping, hull/shape, and sweep.
4. Each accepted gesture owns only its mode's state and implements update, commit, and cancel.
5. Scene and material resources remain outside those controllers.

Camera is the first migration slice because it is independently testable and removes look, orbit,
pan, wheel, and fly branches from the shared drag object. Tool controllers follow one capability at
a time; the old inheritance chain is removed rather than retained as a permanent fallback.

## Renderer and application debt

The 2026-08-26 thermonuclear pass found four related structural issues:

- `source-renderer.ts` still combines scene state, spatial queries, viewport interaction adapters,
  and viewport construction. Material GPU ownership has moved to `SourceMaterialResources`; the
  next extraction must own interaction policy rather than merely forward methods.
- `scene-buffers.ts` combines solids, object lines, tool overlays, entity overlays, links, bounds,
  and diagnostics. It should become an assembler over independent scene contributions so a change
  invalidates only the affected buffers, like TrenchBroom's focused renderer invalidation.
- The app's presenters all receive `EditorApplication`, creating a service locator and 18
  type-level import cycles. Presenters need narrow constructor dependencies and explicit event
  ports even though there are currently no runtime import cycles.
- `apps/editor/src`, `core`, and `render` have 36, 45, and 18 top-level source files respectively.
  Subdirectories should follow the ownership changes above (`viewport`, `scene`, `materials`,
  project/persistence, and focused core domains), not serve as cosmetic buckets around the same
  coupling.

The architecture gate will grow beyond a per-file line ceiling after these migrations: it should
reject the old viewport inheritance shape, new dependency cycles, and renewed top-level fanout.
