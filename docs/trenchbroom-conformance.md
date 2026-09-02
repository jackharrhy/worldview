# TrenchBroom source-view conformance

This is a behavior and architecture comparison against TrenchBroom commit
[`a4ec188`](https://github.com/TrenchBroom/TrenchBroom/tree/a4ec1886bf997ff73a18b2bf3d54e32c2020ce2a).
TrenchBroom is GPL software: it is an oracle only. No implementation code or artwork is adapted into
Worldview's MIT sources.

[`editor-capabilities.md`](./editor-capabilities.md) describes all current behavior. This file keeps
only the TrenchBroom-derived defaults, intentional differences, and current comparison status.

## Rendering defaults

| View             | Faces    | Edges | Grid/tools |
| ---------------- | -------- | ----- | ---------- |
| Perspective      | Textured | Yes   | Yes        |
| Top, Front, Side | No fill  | Yes   | Yes        |

Worldview matches TrenchBroom's default balanced 2×2 layout: Perspective upper-left, Top upper-right,
Front lower-left, and Side lower-right. Row, column, inspector, and intersection splitters are
resizable; Perspective can expand alone and hidden panes stop encoding passes.

Native TypeGPU implements the equivalent browser renderer boundary: typed shaders/resources and
pipelines, with raw WebGPU limited to command encoding and bulk buffer upload. Rendering is
invalidation-driven and continues frame-to-frame only while fly input or animated materials require
it. World, overlay, and viewport work is submitted once per editor frame.

| Visual behavior                                                            | Status                       |
| -------------------------------------------------------------------------- | ---------------------------- |
| Fine perspective grid at every camera distance                             | Matched                      |
| Major/minor 2D grid hierarchy                                              | Matched                      |
| X/Y/Z origin axes in perspective and visible 2D pairs                      | Matched                      |
| Red selected-object tint and always-visible occluded outline               | Matched                      |
| Amber active-face border while the rest of the object remains selected     | Matched                      |
| Participant-colored remote tint, outline, cursor, camera, and live preview | Matched, Worldview extension |
| Infinite selected/hovered face grid guides                                 | Matched                      |
| Entity-definition colors and reference geometry                            | Matched in purpose           |

Worldview's source renderer retains world solids and structural edges separately from selection,
hover, face, group, entity-link, diagnostic, tool, and collaboration overlays. Its implementation is
original; TrenchBroom's allocation tracker is not copied.

## Camera and layout

| Interaction                                        | Status  |
| -------------------------------------------------- | ------- |
| Orthographic pointer-centered wheel zoom           | Matched |
| Linked 2D pan and zoom                             | Matched |
| Perspective right-drag look                        | Matched |
| Alt-right orbit around hit/fallback pivot          | Matched |
| Perspective middle-drag pan                        | Matched |
| Perspective wheel travel                           | Matched |
| Shift-wheel field of view                          | Matched |
| Wheel during look changes fly speed                | Matched |
| First fly key prevents a large delta-time jump     | Matched |
| Pointer transfer between already-focused viewports | Matched |
| Fast/slow fly modifiers                            | Open    |
| Alternate vertical middle-drag mode                | Open    |

Open camera behavior belongs in the focused camera controller, not in a global viewport event
branch. Viewport cameras and expanded-pane state persist per map as machine-local preferences.

## Selection and manipulation

| Interaction                                     | Status                        |
| ----------------------------------------------- | ----------------------------- |
| Click object; click void to clear               | Matched                       |
| Orthographic smallest-visible-face picking      | Matched                       |
| Empty drag creates a brush in the default tool  | Matched                       |
| Add/toggle, paint, lasso, and face selection    | Matched                       |
| Object and face candidate drilling              | Matched with wheel vocabulary |
| Brush-entity sibling expansion                  | Matched                       |
| Selected-object movement and duplicate movement | Matched                       |
| Selected-brush face priority for resize/extrude | Matched                       |
| Multi-brush face extrusion                      | Matched                       |
| Creation and manipulation snap to active grid   | Matched                       |
| Number keys/brackets select grid size           | Matched                       |
| Snap selected brushes or face vertices          | Matched                       |
| Duplicate-and-move completion flash             | Partial                       |
| User-configurable shortcuts                     | Deferred                      |

Perspective object picking remains depth-ordered. Orthographic picking collects editable candidates
under the pointer and prefers the smallest projected face or point-entity bounds, using depth only
as a tie-breaker. This makes a small brush behind a wall directly selectable without changing the
geometric hit policy of clip, hull, face, or topology tools.

Modifier-wheel cycles the ordered object candidates in either direction; an additional modifier
cycles depth-ordered faces. This combines TrenchBroom's reversible object drilling with Radiant's
explicit face/orthographic cycling into one browser-safe vocabulary.

Resize and extrusion resolve faces from the current brush selection before considering unrelated
geometry. A direct selected face wins first, followed by a near-silhouette selected face. A closer
unselected brush cannot steal the gesture.

## Controller translation

TrenchBroom's useful architectural lesson is singular gesture ownership, not its desktop class
layout. Worldview implements an original ordered `ViewportGestureRouter`:

1. The viewport surface owns canvas, camera, projection, GPU targets, and render policy.
2. The router owns at most one pointer/modifier tracker.
3. Focused camera, selection, transform, topology, face, clip, hull, sweep, creation, and placement
   controllers accept typed input in priority order.
4. The accepting tracker exclusively owns update, commit, and cancel.
5. `EditorSession` remains the only document/history commit authority; render resources remain
   outside gesture controllers.

## Follow-up ownership

Unmatched interactions and structural work are tracked only in
[the backlog](./cleanup-plan.md#editor-conformance). New conformance work must record the reference
behavior and commit, implement an original license-compatible design, and add focused tests. A
matching screenshot alone is not evidence of a sound ownership boundary.
