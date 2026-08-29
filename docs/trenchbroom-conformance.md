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

### Visual selection audit

| TrenchBroom convention                                 | Worldview status |
| ------------------------------------------------------ | ---------------- |
| Selected object edges remain red                       | Matched          |
| Prospective face perimeter overlays the red brush edge | Matched          |
| Selected 3D faces receive a subtle tint                | Open             |
| Locked objects use blue edges and tint                 | Matched          |
| Hovered selection bounds show corner spikes            | Open             |
| Selected bounds show viewport dimensions               | Partial          |
| XYZ compass appears in each viewport                   | Open             |

The prospective face overlay does not replace or recolor its material or projected grid. It is
submitted after the selected brush wireframe so its amber perimeter wins on coincident edges while
all other edges remain red.

The default dark wireframe palette follows the same contrast hierarchy as TrenchBroom's current
preferences: a 38/255 neutral background, 0.9 ordinary brush edges, red selected edges, blue locked
edges, and subordinate minor/major grids. Worldview retains entity-definition colors, cyan
reference geometry, and yellow hover feedback so different semantic object kinds remain legible.

TrenchBroom's render views request repaints after input, resource, document, and view changes. They
do not run a permanent idle frame loop. Its perspective view requests the next frame only while fly
keys remain down. Worldview now uses the same scheduling contract: invalidations coalesce into one
animation frame, and the renderer reports whether active fly input requires another.

TrenchBroom's `BrushRenderer` keeps per-brush allocation records, invalidates individual brushes or
materials, and prepares shared vertex/index arrays through dirty-range-tracked VBO holders before a
render batch draws them. Worldview does not copy that GPL implementation. Its WebGPU analogue keeps
immutable brush derivations, material-and-spatial-cell solid batches, structural signatures, and
unchanged GPU buffers across document revisions. Scene updates encode every invalidated viewport
pass into one command buffer and submit once. This retains the simple per-viewport render policy
while avoiding four queue submissions for an ordinary shared-scene update.

Worldview also follows the static/dynamic distinction without adopting TrenchBroom's allocation
tracker: ordinary, locked, and reference world edges live in a retained buffer, while selection,
hover, active-face, group, entity-link, diagnostic, and tool feedback use a compact overlay buffer
drawn afterward. Immutable document identity memoizes entity-link anchors. Selection-only changes
therefore neither regenerate world-edge vertices nor walk every brush to rediscover entity links;
document edits still rebuild edges but preserve unchanged spatial solid batches.

## Camera behavior

The current camera interactions conform closely:

| Interaction                | TrenchBroom behavior                             | Worldview status |
| -------------------------- | ------------------------------------------------ | ---------------- |
| Orthographic wheel         | Zoom around the cursor's world point             | Matched          |
| Orthographic linked zoom   | Keep the same zoom across visible 2D panes       | Matched          |
| Orthographic linked pan    | Share the axes common to visible 2D panes        | Matched          |
| Perspective right drag     | Look while preserving the camera eye             | Matched          |
| Perspective Alt-right drag | Orbit around a hit point, with a fallback pivot  | Matched          |
| Perspective middle drag    | Pan on the camera plane                          | Matched          |
| Perspective wheel          | Move forward/back                                | Matched          |
| Perspective Shift-wheel    | Change field of view                             | Matched          |
| Wheel while looking        | Change fly speed                                 | Matched          |
| First fly key              | Reset the frame timer to prevent a movement jump | Matched          |
| Focus follows pointer      | Transfer focus after a viewport was focused      | Matched          |

TrenchBroom also applies fast/slow modifiers to keyboard fly motion and offers an alternate vertical
middle-drag behavior. Those are useful follow-ups, but they should enter through the focused camera
controller rather than adding more branches to the inherited viewport implementation.

Viewport focus also follows TrenchBroom's pointer policy: after any source viewport receives focus,
crossing into another source viewport transfers keyboard focus there. Merely hovering the editor
from an inspector or dialog does not steal focus.

The four-view workspace matches TrenchBroom's default balanced 2×2 arrangement: Perspective is
upper-left, Top upper-right, Front lower-left, and Side lower-right. The shared row and column
boundaries and the inspector boundary have visible-on-interaction drag targets, keyboard arrow
support, and minimum-size constraints.

### Selection and manipulation audit

| Interaction                                    | Worldview status |
| ---------------------------------------------- | ---------------- |
| Click object; click void to clear              | Matched          |
| Drag with an empty selection to create a shape | Matched          |
| Modifier-click adds or removes objects         | Matched          |
| Modifier-click selects a face in perspective   | Matched          |
| Modifier-double-click selects all brush faces  | Matched          |
| Paint/lasso object and face selection          | Matched          |
| Selection drilling beneath the pointer         | Matched          |
| Drag selected objects on the viewport plane    | Matched          |
| Vertical modifier-drag in perspective          | Matched          |
| Near-silhouette selected-face acquisition      | Matched          |
| Duplicate-and-move feedback flash              | Partial          |
| Configurable keyboard shortcut preferences     | Deferred         |

Worldview keeps browser-safe fixed shortcuts for now. A future shortcut preference surface must
resolve conflicts by viewport/tool context rather than adding global window handlers.

## Controller ownership

TrenchBroom builds an ordered chain of focused tool controllers for each view. A controller may
accept an input and return a gesture tracker. One toolbox owns the active tracker and routes its
update, end, cancel, scroll, and modifier lifecycle. GPU scene ownership and gesture ownership do
not overlap.

Worldview now has an ordered `ViewportGestureRouter` and focused camera, clip, hull, face-transfer,
topology, transform, sweep, face, creation, entity-placement, and selection controllers. The first
accepting controller owns the live `PointerDrag` tracker through update, commit, or cancel, and the
router rejects a second pointer while that tracker is active. GPU scene ownership remains outside
the controller chain.

The delivered routing boundary is composition:

1. The viewport surface layer owns the canvas, camera state, projection, GPU targets, and render
   policy.
2. `ViewportGestureRouter` owns at most one active tracker and the pointer/modifier lifecycle.
3. An ordered controller chain accepts typed input: camera, selection/move, transforms, topology,
   face/material, clipping, hull/shape, and sweep.
4. Each accepted tracker owns its mode classification and mutable drag state and implements the
   routed update, commit, and cancel lifecycle.
5. Scene and material resources remain outside those controllers.

The existing viewport host files still separate hit testing and mode-specific movement math through
an inheritance chain. That is physical source-layout debt, not gesture ownership: new routing modes
must enter through the ordered controller factory, and the architecture tests cover ordering,
single-pointer ownership, and lifecycle behavior. Extracting those host calculations can proceed
without changing the public gesture boundary.

## Renderer and application debt

The 2026-08-26 thermonuclear pass found four related structural issues:

- `source-renderer.ts` still combines scene state, spatial queries, viewport interaction adapters,
  and viewport construction. Material GPU ownership has moved to `SourceMaterialResources`; the
  next extraction must own interaction policy rather than merely forward methods.
- `scene-buffers.ts` combines solids, object lines, tool overlays, entity overlays, links, bounds,
  and diagnostics. It should become an assembler over independent scene contributions so a change
  invalidates only the affected buffers, like TrenchBroom's focused renderer invalidation.
- Presenter service-locator coupling is removed. `EditorApplication` is the composition root and
  injects state, UI, focused collaborators, and callbacks; presenter imports of the container are
  rejected by the architecture gate.
- `apps/editor/src`, `core`, and `render` have 36, 45, and 18 top-level source files respectively.
  Subdirectories should follow the ownership changes above (`viewport`, `scene`, `materials`,
  project/persistence, and focused core domains), not serve as cosmetic buckets around the same
  coupling.

The architecture gate now covers the per-file ceiling and presenter/container boundary. It should
grow with scene ownership work to reject dependency cycles and renewed top-level fanout.
