# Worldview Editor Capabilities

This document records the delivered viewer and editor behavior in detail. It is intentionally
descriptive rather than directional: the canonical product scope, architecture, data flow,
milestones, and acceptance gates live in [`plan.md`](./plan.md). The capability groups below are
covered by the DOM-free unit suites in `packages/worldview-editor/test`, application service tests
in `apps/editor/test`, and end-to-end interaction tests in `tests/browser/editor.spec.ts`.

## Capability evidence

| Capability group                                                                  | Primary automated evidence                                                                                                                                           |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source structure, syntax preservation, save blocking, normalized export           | `packages/worldview-editor/test/map-source.test.ts`                                                                                                                  |
| Geometry, commands, history, selections, CSG, entities, groups, layers, materials | `packages/worldview-editor/test/core.test.ts` and `tests/browser/editor.spec.ts`                                                                                     |
| Explicit pointer gesture lifecycle                                                | `packages/worldview-editor/test/gesture-controller.test.ts`                                                                                                          |
| Projects, ordered resources, filesystem conflicts, and browser-local bindings     | `packages/worldview-editor/test/worldview-project.test.ts`, `apps/editor/test/project-files.test.ts`, `project-local-state.test.ts`, and `project-workspace.test.ts` |
| Recovery, checkpoints, pruning, and quota/storage failures                        | `apps/editor/test/document-recovery.test.ts`                                                                                                                         |
| FGD, DEF, ENT, definition inheritance, and sprite fallback                        | `packages/worldview-editor/test/entity-definitions.test.ts` and `apps/editor/test/project-workspace.test.ts`                                                         |
| Compile/launch capabilities, diagnostics, artifacts, cancellation, and history    | `packages/worldview-editor/test/build-artifacts.test.ts`, `apps/compiler-service/test/compiler.test.ts`, and `apps/editor/test/build-history.test.ts`                |
| Spatial queries and 8,000-brush behavior                                          | `packages/worldview-editor/test/spatial-index.test.ts`, `scale-benchmark.test.ts`, and `tests/browser/editor-performance.spec.ts`                                    |
| WebMCP live authoring and unsupported-browser fallback                            | `WebMCP site authoring` scenarios in `tests/browser/editor.spec.ts`                                                                                                  |
| Complete browser interaction contract                                             | 71 Chromium scenarios in `tests/browser/editor.spec.ts`                                                                                                              |

## Scope

Worldview renders a static Quake or GoldSrc map in an existing canvas or a `<world-view>` custom
element.

Rendering is WebGPU-only.
Audio uses the Web Audio API.

No commercial or shareware game assets are part of the repository or npm package.
Numbered ambient preset IDs are retained for diagnostics but are not interpreted; explicit
modulation keys remain supported. Sprite loading accepts standard version 2 single and grouped
frames, without engine-specific format extensions.
GoldSrc brush entities animate `scroll*` textures from conveyor speed or the format's encoded render
color. Conveyor pushing and trigger state remain outside the static-exhibit scope.

## Source policy

[noclip.website](https://github.com/magcius/noclip.website/tree/37b351452e7157996d645ee5e6502c5d9c54e090/src/Common/IdTech2)
is the only codebase currently adapted by Worldview. Its MIT notice and the relevant source comments
record that provenance.

Further compatibility work should start with published format information and clearly licensed,
independent reimplementations. id Software's GPL engine releases may be used to check behavior, but
their code cannot be copied into this MIT package. Any new adapted source must be documented before
it lands. A renderer used for visual comparison is a test oracle, not an implementation source.

Editor interaction research uses three local, ignored reference clones. TrenchBroom at
[`a4ec1886`](https://github.com/TrenchBroom/TrenchBroom/tree/a4ec1886bf997ff73a18b2bf3d54e32c2020ce2a)
is a GPL-3.0 design oracle for its document/tool/controller boundaries and robust brush workflow.
Q3Edit at
[`02f87647`](https://github.com/drdator/q3edit/tree/02f87647162e5bf5e39fe61968f904efe8e19675)
is a GPL-2.0-or-later browser-delivery oracle for four-view editing, local game-data handling, and
WebAssembly compilation. WAD Together at
[`e0150270`](https://github.com/Donitzo/wad-together/tree/e0150270a33f25ea9428cd0b5e7f628822bdcf95)
is an MIT reference for browser-local resource stacks and operation-based collaboration. No code
from these repositories is currently adapted into Worldview, so they are not third-party package
contents and do not belong in `THIRD_PARTY_NOTICES.md`.

## Workspace

- `apps/viewer`: full-screen Vite and React viewer with an accessible native control dock.
- `packages/worldview`: ESM package published as `@jackharrhy/worldview`.
- `apps/editor`: React browser authoring shell with synchronized perspective, XY, XZ, and YZ views.
- `apps/compiler-service`: local native compile adapter for explicitly configured ericw-tools
  executables; it is not an Internet-facing sandbox.
- `packages/worldview-editor`: DOM-free source-map document, geometry, command, tool, and editor
  rendering package published as `@jackharrhy/worldview-editor`.

The viewer is deployed to GitHub Pages from `main`. Its Pages build uses the `/worldview/` base
path and includes only the synthetic fixtures; visitors can provide other maps through URLs or the
local file picker.

The package includes its main viewer API, a GPU-independent `./core` subpath, an `./element`
registration subpath, a GPU-independent `./walkability` subpath, and a self-contained browser module
that registers `<world-view>`.
Its npm README and third-party notice point to the canonical monorepo documents, while the package
retains its own MIT license.

## Public API

`createWorldview(options)` asynchronously initializes a viewer for an existing canvas. The returned
viewer is an `EventTarget` with `load`, `start`, `stop`, `render`, `resize`, `setCamera`,
`captureOverview`, `setMovementMode`, runtime movement tuning, separate master, player-audio, and
music controls, `playMusic`, `stopMusic`, walkability generation and display controls, and an
idempotent `dispose` method. It emits progress, ready, warning, error, `audiochange`,
`movementchange`, and `walkabilitychange` events.

`captureOverview(options)` reuses loaded GPU resources to render an orthographic PNG or WebP without
changing the live camera. It automatically fits and optionally rotates renderable map bounds,
disables PVS culling, freezes animated materials at time zero, and supports vertical slicing,
lightmapped or fullbright output, transparent or colored backgrounds, and optional sky and sprites.
When a walkability graph is loaded, the default `auto` cutaway removes ceilings near proven
reachable space using a local height field. `cutaway: 'none'` returns to the ordinary global height
slice, while `cutaway: 'walkability'` requires a graph rather than falling back.
The result includes the image `Blob` and a GPU-independent layout containing its origin, bounds,
rotation, height range, and world-units-per-pixel scale. `planOverview` exposes that layout work from
both the main and `./core` entrypoints.

A world source requires a BSP. Its optional `gameBaseUrl` names the Quake or GoldSrc game
or mod directory. Relative BSP paths resolve under that root. WAD basenames resolve at the root,
Quake palettes at `gfx/palette.lmp`, GoldSrc skyboxes at `gfx/env`, sprite references beneath the
root, and sounds beneath `sound`. Callers can override each derived location with explicit assets,
specific base URLs, or resolver callbacks.

`defineWorldViewElement()` registers `<world-view>`; the standalone entry calls it automatically.
The element supports `src`, `game-base-url`, `palette-src`, `wad-base-url`, `skybox-base-url`,
`sprite-base-url`, `sound-base-url`, `controls`, `autostart`, `audio`, `audio-volume`,
`music-volume`, and `max-dpr` attributes. It owns a responsive shadow-DOM canvas and status overlay,
mirrors viewer events, exposes its current viewer, accepts explicit WADs, sprites, and sounds
through JavaScript properties, aborts stale loads, and disposes when disconnected.

## Walkability

Walkability graph generation and persistence form a separate, GPU-independent concern under
`packages/worldview/src/walkability`. It samples the BSP standing-player collision hull from player
start entities and produces a directed graph rather than a conventional engine navigation mesh.
Nodes contain grounded player origins, floor normals, local ceiling heights, seed and component
information. Edges distinguish ordinary walking, jumps, and drops. Failed walking and jumping
probes are retained as boundaries.

The broad pass uses a velocity-free drive toward nearby samples. This follows the testing split
described in Casey Muratori's
[Walk Monster](https://caseymuratori.com/blog_0005): collision and traversal coverage should not be
limited by the speed of a simulated player. Jump candidates are then checked with Worldview's
fixed-step GoldSrc-style movement controller so that reported jump connections remain reachable by
the public player controller. No source code from the article or engine SDKs is used.

`generateWalkability`, `serializeWalkability`, `parseWalkability`, `planWalkabilityCutaway`,
compatibility checks, types, and the map fingerprint are exported from
`@jackharrhy/worldview/walkability`. Generation is deterministic for a map and parameter set,
accepts an abort signal, yields cooperatively, and reports progress. Sampling spacing ranges from 8
to 256 world units, and generation stops at no more than 200,000 nodes. The format is versioned
JSON. Its fingerprint is a fast stale sidecar check, not a security hash.

The development viewer can generate, display, load, clear, and download this graph. A file named
`<map>.worldview-walkability.json` beside a local `<map>.bsp` is discovered and loaded automatically.
These local files remain ignored and must not be committed when they derive from commercial maps.
The overlay is depth-tested and uses separate colors for two-way walking, one-way walking, jumps,
drops, and blocked probes. The debug lines are excluded from captured overviews.

Automatic overviews rasterize nearby node and ceiling heights into a sparse cutaway field capped at
1024 cells per axis. Fragments above the local cutoff are removed in the overview shader. Empty
cells retain the original map geometry, so unexplored areas are not presented as known playable
space. At overlapping floors, the nearest sampled standing height wins; this gives a useful upper
level rather than compositing incompatible floors. V0.1 does not claim nav-mesh-quality path
planning or a perfect representation of every stacked-floor map.

## Editor direction

The editor is a separate package and application rather than an editing mode added to the static
BSP viewer. Its authoritative document is source `.map` geometry. Compiled `ParsedWorld` data is a
preview or reference result and is never used as the authoring representation.

Valve 220 is the first canonical source format. Brushes retain plane-defining face points, stable
brush and face IDs, logical material names, and world-to-texture projections. Convex vertices,
edges, polygons, render meshes, bounds, picking acceleration, and collision are derived data.
Candidate edits are derived and validated before an atomic document transaction is committed.

The DOM-free editor session owns the document revision, selection, transactions, undo and redo,
and normalized tool state. Perspective and orthographic viewports adapt pointer and keyboard input
to the same tool controllers. The default application layout has perspective, XY, XZ, and YZ panes.
An explicit Perspective-header control expands that pane to the full viewport workspace and restores
the four-view layout; hidden orthographic panes stop encoding GPU render passes. Source geometry,
materials, and GPU buffers are shared across the
viewports while camera, grid, depth target, and tool overlays remain per viewport. Immutable
documents cache their brush, group, and layer indexes by identity, and independent viewport dirty
versions prevent a moving perspective camera from redrawing three unchanged orthographic panes.
Like TrenchBroom's render-mode policy, the perspective view renders material faces and edges while
XY, XZ, and YZ render projected wireframes and tool overlays without textured face fill. Rendering
is invalidation-driven and continues frame-to-frame only while fly-camera input remains active; this
uses TrenchBroom's behavior and ownership boundaries as an oracle without adapting GPL code.
History stack ownership and directional entry application are isolated from `EditorSession`, so
undo and redo use one mutation path instead of mirrored command trees. Renderer scene-buffer
assembly and reusable viewport geometry live outside the input-heavy viewport controller, while the
browser application keeps its React shell and clipboard workflow outside the command coordinator.
These are internal boundaries: the public editor entrypoints and authored map data flow are
unchanged.

Both application shells are React composition roots over framework-independent packages. The
viewer bridges an immutable package-level snapshot store with `useSyncExternalStore`; React owns
its load/map controls and readouts but never per-frame camera or GPU state. Package-level selected
snapshot readers isolate the 100 ms camera readout from the rest of the control tree. User-initiated
async commands use React Query mutations. The editor renders its chrome, dialogs, viewports, and
inspector panels as focused TSX components, then binds the existing presenters while their state
surfaces migrate incrementally. Document name, live status, compiler state, pointer context, and the
read-only document summary already flow through narrow immutable stores and `useSyncExternalStore`;
the presenters reach them through typed ports instead of mutating React-owned nodes. Both roots run
in Strict Mode, and stable callback refs own external canvas/application startup without component
effects. Canvas identity remains stable for the lifetime of either application.

Both render paths use the package's on-demand animation-frame scheduler and Quake-family camera
vector helpers. The editor's compiled BSP preview uses the standalone viewer's version-aware spawn
camera directly instead of maintaining a second Quake-only approximation. Editable `.map` scene
rendering remains editor-specific because it owns four views, picking, tool geometry, and source
revisions rather than compiled visibility, lightmaps, and audio.
The application chrome uses one icon family and fixed-size grouped actions so modes and common
commands remain scannable without competing with the viewports. Context-bearing map, grid, and
build-profile controls stay textual. Icon actions retain accessible names, tooltips, keyboard
routes, and visible focus state.

The visible editor is also a first-class WebMCP site-tool host when the built-in browser provides
`document.modelContext.registerTool`. Twenty-one semantic tools cover live editor inspection,
bounded object/material/source queries, selection and camera framing, tool activation, transforms,
material and raw entity-property edits, box and point-entity creation, duplication, deletion,
history, explicit source replacement, and maps from an already authorized project. They call the
same presenters and `EditorSession` transactions used by direct interaction. Every document edit
requires the caller's observed document identity and revision, reports the resulting state, stays undoable when it is an
ordinary editing command, and visibly updates the normal canvas, inspector, history controls, and
live status message. Source replacement and dirty project-map switching are explicitly destructive;
site tools do not save to disk, launch external software, or accept arbitrary paths or commands.
When the experimental browser API is missing or disabled, registration is a no-op and the full
visual editor remains unchanged. Browser coverage injects only the proposed registration surface,
then executes the real registered definitions and existing application logic.

The active grid size rebuilds the orthographic and horizontal construction grids immediately. In
the perspective pane, a DOM-free dominant-axis projection clips world-aligned grid lines to every
visible convex brush face; sloped faces therefore stretch the grid while every generated endpoint
remains on the exact source plane. Per-face and global line budgets coarsen pathological spans
without changing snapping semantics, and selected or hovered faces receive a stronger grid tint.

Source-view camera navigation follows the
[TrenchBroom camera workflow](https://trenchbroom.github.io/manual/latest/#camera-navigation) as a
behavior oracle. Plain right-drag changes yaw and pitch around a stationary eye, Alt+right-drag
orbits a hit point, middle-drag pans, and the perspective wheel translates the camera along its
viewing direction. W/S/A/D fly forward, back, left, and right while Q/X move along world Z; wheel
input held during a right drag tunes bounded fly speed, and Shift+wheel changes bounded field of
view. Orthographic right- or middle-drag pans, while zoom compensates the view center so the world
coordinate under the pointer remains invariant. Focus or Home fits the current object or topology
selection into every source viewport without rotating the perspective camera or advancing the
document revision. The renderer reports immutable camera snapshots, including eye position, field
of view, and fly speed, through `onCameraChange`, and exposes `focusSelection()` for application
shells. Opening a new file fits the whole document into all four panes, so distant real-map
geometry does not begin outside a fixed starter view. Orbit hit-point retargeting is deferred until
the pointer crosses the five-pixel gesture threshold; a stationary or accidental Alt+right press
therefore cannot move the camera. No TrenchBroom implementation source is adapted.

Stationary right-click is disambiguated from camera look, orbit, and pan with the same five-pixel
gesture threshold used by viewport editing. The renderer publishes an immutable context event with
the viewport, browser anchor, snapped world pointer, exact editable brush face or point entity, and
a bounds-adjusted placement origin. The application-owned menu routes face, all-face, and connected
coplanar selection; material reveal; object focus/hide/isolate/group/layer operations; common brush
entity conversion; make-structural; point-entity creation; and Paste Here through the existing
session commands. Menu selection does not mutate source, while creation and organizational actions
retain their ordinary atomic history semantics. This follows the current manual's
[Map View Context Menu](https://trenchbroom.github.io/manual/latest/#map-view-context-menu) and
[point-entity creation](https://trenchbroom.github.io/manual/latest/#point-entities) workflows as
behavior oracles; no TrenchBroom source is adapted.

Read-only source-map references are separate scene records with their own label, visibility, and
world offset. Their derived brush geometry is batched into every source viewport with a distinct
blue treatment, but references never participate in picking, authoring transactions, source
serialization, or export. A mapper can load external `.map` files or snapshot the current revision
for side-by-side comparison.

The perspective viewport is a first-class authoring surface. Brush, point-entity, and face
selection, snapped object dragging, texture application and sampling, and explicit texture-axis
editing work directly in it. The permanently active resize path follows the
[TrenchBroom tool model](https://trenchbroom.github.io/manual/latest/#working-with-tools): while the
Select tool is active, Shift-dragging a visible face of an already selected brush routes into the
same revision-safe face candidate path as the modal Face tool. Ctrl/Command changes that gesture
to split extrusion, Alt changes it to viewport-plane face translation, and Ctrl/Command+Alt stamps
an independent prism in perspective. A click without a drag retains Shift face selection, and
modifier-driven material transfer remains available when a face—not an object—is the current
selection. Object movement maps to the horizontal XY plane by default; Alt switches live gestures to
vertical Z movement, while Shift retains only the dominant grid-snapped axis. Orthographic drags
use the viewport plane with the same Shift restriction. Shift-resize targeting also considers a
ten-CSS-pixel screen-space band around selected-brush silhouette edges. When there is no direct face
hit, the horizon edge chooses its back-facing adjacent face, making hidden side faces reachable
without letting arbitrary internal edges become sticky. A yellow trace connects the original and
current drag reference points, becomes visually heavier under Shift restriction, and is cleared on
commit or cancellation without entering document state. Vertex and Edge movement draws the same
guide from every selected handle. Construction-plane shape creation works in perspective and
orthographic views as a permanently available part of the default Select tool whenever the
document selection is empty. A click still selects the object under the pointer; crossing the drag
threshold instead gives the Simple Shape controller ownership and begins creation. This matches
TrenchBroom's no-modal-tool controller stack rather than requiring a separate brush-creation mode.
The drag is a derived preview and the final valid brush is one undoable transaction. Plain clicks
select one brush, Ctrl/Command-click toggles brushes in a normalized object set, Shift-click selects
the intersected source face, and the modal Face tool exposes
face outlines and directly pickable center handles on every selected brush, including handles for
back-facing and internal surfaces that are hidden by the rendered mesh. Face selections are normalized sets that
may span several brushes: Shift-click toggles one face, double-click selects every face of the hit
brush, and Alt-double-click flood selects the connected component of same-facing coplanar polygons.
The flood query requires polygon contact, so a disconnected surface on the same plane is not swept
into the selection. Dragging a rectangle from empty viewport space toggles every projected face
handle inside it; holding Shift makes the lasso idempotently add every enclosed handle. This works
in perspective and orthographic views and can include back-facing handles. Holding
Ctrl/Command+Shift while dragging paint-selects each previously
unselected frontmost face crossed by the pointer, in either perspective or orthographic views, and
can accumulate faces across brush boundaries without toggling a face again when the path doubles
back. Materials and texture transforms apply to the entire face set as one atomic, revision-checked
transaction. Dragging a face from the Face tool, or Shift-dragging a face of an already selected
brush from the Select tool, in either perspective or orthographic views maps the pointer onto the
face normal, snaps the absolute plane distance to the current grid, previews a derived brush, and
commits one extrusion transaction only if the result is still a valid convex volume. Alt-dragging
a face handle instead maps the pointer onto the active viewport plane and applies a component-wise,
relative grid-snapped delta to every derived vertex of the selected face set. This route rebuilds
each affected convex hull, clumps shared vertices across brushes, and honors Valve 220 texture lock
before one atomic commit. Arrow keys apply one active-grid step to the selected face set on the last
pointed XY, XZ, or YZ viewport axes; perspective uses the camera's dominant horizontal axes and
Alt+Up/Down uses Z. Inspector nudge buttons use the same candidate path. Escape first normalizes the
face set back to its owner brush selection, then deactivates Face on a second press, and finally
clears the retained object selection. Exact, inward, and outward face extrusion controls expose the normal-move
session command in the inspector. When the
object selection contains adjacent brushes, picking a face automatically selects every face in the
set with the identical derived vertex polygon. A shared extrusion applies the primary face distance
with its sign reversed for opposing normals, so the common plane moves together and all affected
brushes commit atomically. Non-matching face sets are rejected rather than producing divergent
geometry. Holding Ctrl/Command when a face drag starts changes the candidate into a split
extrusion. An outward split retains the original volume and adds the dragged slab; an inward split
partitions the original volume at the destination plane. The inspector exposes the same operation
for an exact signed distance. Both pieces are validated and replace the source sequence in one undo
transaction. Identical, same-facing face sets can split atomically, while opposing shared faces are
rejected because their generated slabs would overlap. Ctrl/Command+Alt-dragging a perspective face
center instead creates a stamped brush: a one-segment convex prism between the unchanged source
polygon and a copy translated along its normal. Stamp candidates retain the source entity owner,
material and non-contents surface attributes, rotate Valve 220 projections across their new sides
when texture lock is active, and commit the independently selected brush as one reversible
creation. The inspector exposes the same operation at an exact signed distance. This follows the
[TrenchBroom development manual's stamping workflow](https://github.com/TrenchBroom/TrenchBroom/blob/a4ec1886bf997ff73a18b2bf3d54e32c2020ce2a/app/TrenchBroom/resources/documentation/manual/index.md#stamping-brushes)
as a behavior oracle; no TrenchBroom implementation source is adapted. Collision-aware walk
navigation remains planned.

Object selection retains every editable hit beneath the pointer. Ctrl/Command-wheel replaces the
primary object with the next candidate without moving the camera and wraps at either end. Perspective
uses distance order; orthographic views use the same smallest-projected-area order as ordinary
clicking. Adding Shift drills the depth-ordered brush-face candidates instead, making otherwise
occluded faces reachable in every viewport. Ctrl/Command-drag beginning on
an unselected object paint-selects each previously unselected brush or point entity crossed by the
pointer and never toggles the same object twice when the path doubles back. Double-clicking a brush owned by a
non-world brush entity selects all of that entity's sibling brushes, with Ctrl/Command preserving
the existing object set.

Object-wide selection queries follow the same editable-object boundary. Select All (Ctrl/Command+A)
selects every visible, unlocked brush and point entity in the current group context, while Invert
(Ctrl/Command+Shift+A) replaces the current set with its visible, unlocked complement; neither
operation changes source or enters document history. One or more selected structural brushes can
instead be consumed as temporary selection volumes. Touching uses a complete convex
separating-axis test, including edge-cross-edge axes, so boundary contact counts while disjoint
slanted solids do not produce false positives. Enclosed requires every target brush vertex or point
entity bounds corner to lie inside one query brush. Enclosed in 2D projects each query volume to the
last pointed XY, XZ, or YZ viewport, builds its convex hull, and requires the complete projected
target to lie inside it. Hidden and locked objects are excluded, closed-group hits expand to their
editable aggregate, and the temporary brushes disappear together with the resulting object
selection in one document transaction; undo restores both the brushes and their original
selection. This follows TrenchBroom's
[selection-brush workflow](https://trenchbroom.github.io/manual/latest/#selecting-objects) as a
behavior oracle; no TrenchBroom implementation source is adapted.

The same Ctrl/Command-drag beginning on a selected object performs duplicate-and-move rather than
translating the originals. The session creates in-place clones once, retains fresh brush, face, and
entity IDs across every movement preview, and translates that batch with the normal XY, Alt-for-Z,
Shift-axis-lock, grid-snap, and texture-lock rules. Releasing inserts every clone into its original
owning entity as one document revision and selects the clone set; undo removes the whole batch and
restores the source selection. This follows the
[TrenchBroom object-selection workflow](https://trenchbroom.github.io/manual/latest/#selecting-objects)
and [duplicate-and-move workflow](https://trenchbroom.github.io/manual/latest/#duplicating-objects)
as behavior oracles; no TrenchBroom implementation source is adapted.

Command repetition records committed object-level duplicate, translate, rotate, mirror, scale, and
shear commands after the latest manual selection change or explicit sequence clear. Each descriptor
retains its exact pivot, axis, delta or factors, texture-lock choice, entity-angle choice, and group
destination without retaining a stale preview document. Repeat replays the complete descriptor list
through an isolated DOM-free session, uses fresh stable IDs for every duplicated brush, face,
entity, and group, and then applies the result to the live session as one document revision and one
undo entry. This supports staircase-style duplicate/move/rotate construction as well as mixed
brush/entity selections and open-group workflows without introducing an editor-private map format.
Undo, redo, document replacement, and a manual selection change clear the sequence; the tool strip
shows its ordered command names, provides Repeat and Clear Repeat controls, and binds
Ctrl/Command+Shift+R to replay. This follows TrenchBroom's
[command-repetition workflow](https://trenchbroom.github.io/manual/latest/#command-repetition) as a
behavior oracle; no TrenchBroom implementation source is adapted.

Live issue diagnostics are a pure derivation of the current map document. The public core API
reports stable issue IDs, severity and category, implicated brush/entity IDs, and an optional quick
fix for missing, duplicate, or misplaced worldspawn entities; invalid brushes; missing classnames;
missing or invalid point origins; empty brush entities, groups, or layers; unresolved target links;
orphaned group/layer membership; and duplicate persistent metadata IDs. The editor session can
select an issue even when its objects are hidden or locked, and applies an advertised repair as one
revision-checked document replacement and one undo entry. Fixes that remove objects clear the
selection; property repairs retain it. Diagnostics, filters, and hidden-finding state do not enter
Valve 220 source.

The application exposes those diagnostics in a status-bar **Issues** drawer. Errors sort before
warnings, type checkboxes filter the live list, and hiding a finding is non-serialized per-document
view state. Selecting a row locates all implicated objects; Reveal also shows transiently hidden
objects, unhides their layer, and frames the selection when it has valid bounds. Every repair is
explicitly labeled and remains individually undoable. This follows TrenchBroom's
[Issue Browser workflow](https://trenchbroom.github.io/manual/latest/#issue-browser) as a behavior
oracle; no TrenchBroom implementation source is adapted.

Viewport clutter and edit protection live in a non-serialized object view state owned by the
DOM-free session. Hide removes the current brush, point-entity, or mixed object selection from every
source viewport and clears the selection; Isolate hides every other document object while retaining
the selected set; Show All reveals every hidden object. Lock clears the selected set and leaves the
objects visible with blue solids or wireframes, but excludes them from picking, component handles,
and editing; Unlock All restores normal rendering and picking. Each command and its selection change
is one undoable history entry without advancing the document revision or rewriting normalized map
source, and opening or replacing a map clears the view state. Hidden and locked brushes are also
excluded from CSG subtraction targets. This follows TrenchBroom's
[hiding and isolation](https://trenchbroom.github.io/manual/latest/#hiding-and-isolation) and
[locking](https://trenchbroom.github.io/manual/latest/#locking) behavior as design oracles.

Persistent viewport filters form a second, non-history visibility layer. The DOM-free filter module
derives every non-structural entity classname and its point/brush usage counts from the current
document, then resolves hidden classnames into the same brush/entity ID contract used by rendering,
picking, selection, component tools, CSG, and open-group editing. A world-brush toggle covers
structural brushes owned by worldspawn, regular groups, and layers. Special brush filters recognize
detail and trigger owners plus trigger, clip, hint/skip, Quake/GoldSrc liquid, and sky face-material
conventions. Overlapping filters are set-unioned, so enabling one category cannot accidentally
reveal an object still excluded by another.

The tool strip's **View** menu exposes searchable live classname checkboxes, All/None entity
controls, every special brush category, source-unchanged status, and a filtered-object badge.
Applying a filter immediately clears a selection that became invisible but never advances the map
revision or creates an undo entry; the settings carry across document replacement as editor view
preferences. `objectViewStateFor(document)` applies the same settings to preview documents, so a
newly duplicated or transformed filtered entity cannot flash into view during a drag. This follows
TrenchBroom's [Filtering workflow](https://trenchbroom.github.io/manual/latest/#filtering) as a
behavior oracle; no TrenchBroom implementation source is adapted.

Layers use TrenchBroom's map-compatible representation rather than editor-private side data. The
implicit Default Layer stores its structural brushes and `_tb_layer_hidden`, `_tb_layer_locked`, and
`_tb_layer_omit_from_export` flags on `worldspawn`. Each custom layer is a `func_group` metadata
entity with `_tb_type "_tb_layer"`, `_tb_name`, `_tb_id`, `_tb_layer_sort_index`, and the same
optional flags. Top-level point entities, brush entities, and regular groups reference a custom
layer with `_tb_layer`; structural brushes in that layer live directly on its metadata entity.
Nested groups inherit the root group's layer. The DOM-free layer module derives ordered recursive
brush, entity, point-entity, group, and bounds membership without adding another document tree.

One non-serialized active-layer ID controls insertion. New top-level brushes and point entities,
new root groups, and pasted top-level map-text objects enter the active layer; an open group takes
precedence over it. Duplicates and face-derived geometry retain source ownership. Copy strips source
layer metadata so a cross-document paste uses the destination's active layer. Converting structural
brushes to a brush entity and back preserves their layer, and grouping or ungrouping routes
structural brushes through that layer's metadata entity instead of always through `worldspawn`.

The Map inspector lists Default plus ordered custom layers, distinguishes the selected row from the
active insertion layer, and supports create, inline rename, activate, move selection, select all
contents, hide/show, isolate, lock/unlock, omit/include in compile export, reorder, and remove. It
also exposes show/hide-all and lock/unlock-all layer commands. Layer visibility and locking merge
with per-object view state for rendering, picking, selection brushes, CSG targets, and editing.
Removing a custom layer moves all of its top-level contents to Default; undo restores the exact
metadata and ownership. Every metadata or ownership change is one document snapshot history entry.
Save and normalized source retain authoring metadata, while the compile snapshot removes every
object and nested group belonging to an omitted layer without mutating the session. This follows the
[TrenchBroom layer workflow](https://trenchbroom.github.io/manual/latest/#layers) and documented map
representation as behavior and compatibility oracles; no TrenchBroom implementation source is
adapted.

Regular groups use TrenchBroom's map-compatible `func_group` representation with `_tb_type
"_tb_group"`, `_tb_name`, `_tb_id`, and `_tb_group` parent references. The DOM-free group module
derives recursive child-group, brush, brush-entity, and point-entity membership plus combined bounds
without adding a second serialized document tree. Grouping a mixed selection moves structural
brushes onto the metadata entity, retains brush-entity ownership, attaches point entities by
reference, and creates one undoable document revision. A closed group expands any member hit into
one aggregate selection, so movement, rotation, scaling, mirroring, hide/isolate/lock, duplication,
copy, and deletion operate on the group as one object. Blue bounds identify groups in all four
viewports; selected bounds are yellow and the currently open group is cyan. Double-clicking a group
or using Open enters its editing context, where direct members remain individually selectable,
nested child groups still select atomically, and everything outside the open group is rendered
locked and removed from picking. Double-clicking empty space, Close, or Escape closes the context.
The Object inspector creates, renames, opens, closes, and ungroups containers; ungrouping preserves
all objects and child groups, while deleting removes the complete recursive contents. New brushes,
point entities, and pasted objects are attached to the open group. Copy/paste and duplication retain
complete regular or nested group structure while remapping both runtime IDs and persistent group
IDs. This follows the [TrenchBroom group workflow](https://trenchbroom.github.io/manual/latest/#groups)
and its documented map representation as behavior and compatibility oracles; no TrenchBroom
implementation source is adapted.

Linked groups extend that same flat, map-compatible representation with TrenchBroom's documented
`_tb_linked_group_id` and row-major `_tb_transformation` properties. Creating a linked duplicate
assigns a shared opaque link ID, clones the complete regular/entity/brush/nested-group tree with
fresh runtime and persistent IDs, and selects an independently transformable copy. Translation,
rotation, scale, shear, and flip update the selected copy's affine matrix (and those of nested
linked groups) while moving its actual map objects, so normalized source remains usable by ordinary
map tools. Purple bounds distinguish closed linked groups; selecting or opening one adds directed
purple arrows to every sibling copy.

Opening a linked group establishes a session edit context. Every committed member operation—face,
vertex, edge, clip, CSG, material, entity property, object creation/deletion, nested grouping, and
ordinary movement or transforms—copies the edited source tree into all siblings through each
sibling's `targetTransform * inverse(sourceTransform)` mapping. Brush planes, Valve 220 projections,
point origins and supported headings, brush-entity ownership, and nested group transforms are
rebuilt together. Synchronization and the initiating edit are one document snapshot and one undo
step; previews never mutate the session. Ordinary duplication of a linked group remains linked,
Unlink makes one copy independent, and deleting or unlinking down to a single member automatically
regularizes the survivor.

Entity properties inside an open linked group expose per-key protection. The compatible
`_tb_protected_properties` semicolon list supports escaped semicolons and deleted protected keys.
Protected source values do not propagate, protected target values survive sibling rebuilds, and
removing protection resets the value from the corresponding entity in another copy. New properties
can be protected atomically when added. This follows the
[TrenchBroom linked-group workflow](https://trenchbroom.github.io/manual/latest/#linked-groups),
protected-property behavior, visualization, and documented map representation as behavior and
compatibility oracles; no TrenchBroom implementation source is adapted.

Object clipboard operations exchange ordinary, parseable map text rather than an editor-private
payload. Copy extracts the selected structural brushes into a minimal `worldspawn`, retains selected
brush-entity properties and ownership, and includes selected point entities. Paste accepts that text
from Worldview or another map-text source, remaps every entity, brush, and face ID, preserves
properties and Valve 220 alignment, and selects the inserted mixed object set in one undoable
document revision. Complete regular-group selections retain nested group metadata and receive fresh
persistent group IDs at the destination. Paste Here uses the latest snapped viewport pointer: in perspective it rests the
copied axis-aligned bounds against the brush face under the pointer (including sloped faces), or the
active horizontal construction plane when no brush is hit; in an orthographic viewport it keeps the
visible center under the pointer and places the copy beyond the far side of the latest selection.
Buttons and native Ctrl/Command+C, Ctrl/Command+V, and Ctrl/Command+Shift+V shortcuts expose these
paths. A face selection changes Copy into a versioned, ID-free plain-text attribute payload containing
the primary face's material, source plane, Valve 220 projection, surface flags, and value. Contents
remain a destination-brush property and are intentionally omitted. Paste applies the fixed source
payload to every selected face as one revision-checked transaction, retains the target face set, and
undoes atomically; the map-view context menu can copy or paste directly at the pointed 3D face. This
complements the existing modifier-driven in-map projection/rotation/material transfer path and
follows TrenchBroom's documented
[face-attribute copy/paste workflow](https://trenchbroom.github.io/manual/latest/#assigning-materials-manually).
Object clipboard text remains ordinary map source, while the marked face payload is validated before
use. Object exchange follows TrenchBroom's
[copy-and-paste workflow](https://trenchbroom.github.io/manual/latest/#copy-and-paste) as a behavior
oracle; no TrenchBroom implementation source is adapted.

Point entities are first-class source objects rather than renderer-only markers. Built-in presets
cover Quake and GoldSrc lights, player starts, info targets, and ambient sounds, while a custom
classname uses a conservative default bounding box. The Entity tool drops the selected bounding
box against the hit brush face in perspective and grid-snaps it; orthographic placement takes its
visible axes from the click and retains the latest selection depth on the hidden axis. Colored
wireframe bounds, center markers, and horizontal heading arrows are visible and pickable in every
source viewport. Point entities participate in additive mixed selections, painting, drilling,
nudge and drag movement, stable-ID duplication, deletion, property inspection, rotation, axis
mirroring, and snapshot undo/redo with brush edits. Object rotation adapts Quake `angles` (`pitch
yaw roll`), light-prefixed `mangle` (`yaw pitch roll`), other `mangle` values as `angles`, and scalar
Z `angle`; the inspector can temporarily preserve those properties while still rotating origins.

Entity-link visualization is derived from authored properties and never enters document or history
state. Sources use exact non-empty `target` and `killtarget` values; every entity with an equal
`targetname` becomes a directed destination. Point anchors are the centers of their definition
bounds, while brush-entity anchors are the centers of their combined valid brush bounds. The line
overlay adds a world-space arrowhead at the destination in all four viewports. A link incident to
the current point, brush, or face owner's entity is red; other displayed links are green. The Map
inspector exposes All, Transitive selected, Direct selected, and None modes. Transitive mode walks
the complete undirected connected component containing the selected entities, while direct mode
shows only incident links. Hidden point entities and brush entities with no visible brushes suppress
their links. These rules follow the
[TrenchBroom entity-link visualization workflow](https://trenchbroom.github.io/manual/latest/#entity-link-visualization)
as a behavior oracle; no TrenchBroom source is adapted.

Selected structural brushes can be moved into a newly created brush entity with a custom
classname. Their document order and selection remain stable, and an emptied non-world source
entity is removed. Make Structural moves the brushes back to `worldspawn`, clears per-face contents
flags, removes the now-empty brush entity, and reverses as one history transaction. These workflows
follow the [TrenchBroom entity creation workflow](https://trenchbroom.github.io/manual/latest/#creating-entities)
as a behavior oracle; no TrenchBroom implementation source is adapted.

Brush creation includes a TrenchBroom-style Simple Shape palette. Cuboid creates one box; Cylinder
and Cone build a convex polygonal solid around a selectable X, Y, or Z axis; a hollow Cylinder
creates one validated wall brush per side. Stairs divides the authored bounds into tread brushes
using an exact step height and one of four horizontal rise directions. Arch treats its selected axis
as the tunnel direction and builds the upper half of an elliptical hollow cylinder as independent
wedge brushes. UV Sphere creates an axis-oriented stack of polygon rings between two poles, while
Ico Sphere recursively subdivides an icosahedron and fits the resulting spheroid to non-uniform
bounds. Circular shapes expose side count plus edge-aligned, vertex-aligned, and scalable profiles;
the scalable profile accepts the grid-friendly 12, 24, 48, and 96 side families. Cylinder adds
hollow thickness, Arch adds band thickness, UV Sphere adds ring count, and Ico Sphere adds
subdivision accuracy.

Creation gestures share one live batch candidate. In perspective, creation starts on the brush
surface under the pointer when available and receives one grid unit of initial height. Shift keeps
the two visible spans equal, Shift+Alt keeps all three spans equal, and Alt after a drag starts
changes only height. Orthographic creation uses the selected object bounds as its hidden-axis depth
when possible, retaining a useful construction volume instead of a one-grid-unit sliver. Every
generated brush receives fresh stable IDs and is derived and validated before the session accepts
the batch; committing a hollow cylinder, staircase, or arch therefore remains one document
revision, selection change, and undo entry. The core is DOM-free and bounds UV spheroids to 192
faces, icospheres to three accuracy levels, and stairs to 128 brushes so pointer previews remain
interactive. Known convex-builder vertices prime a weak derived-geometry cache rather than entering
the authoritative document. This follows the
[TrenchBroom simple-shape workflow](https://trenchbroom.github.io/manual/latest/#creating-simple-shapes)
as a behavior oracle; no TrenchBroom implementation source is adapted.

The separate Hull tool implements TrenchBroom's point-defined complex brush workflow in the
perspective viewport. Existing brushes are references rather than operands: a click places one
grid-snapped point on the hit face, a double-click captures every derived vertex of that face, and a
drag places the four corners of a rectangle on its plane. When the accumulated points form a
coplanar polygon, Shift-dragging that reference face previews and adds a translated copy along the
face normal. Green committed markers and cyan drag previews remain visible in every viewport, but
placement itself is intentionally 3D-only. Enter or the inspector action creates the smallest convex
volume containing the point cloud; points inside that hull do not become corners. Escape discards
the entire set, matching the manual's rule that individual construction points are not edited or
removed.

`createConvexHullBrush` is a DOM-free public core operation. It rejects non-finite, duplicate-only,
coplanar, and otherwise non-volumetric point sets, assigns fresh stable brush and face IDs, and uses
the current material with default Valve 220 projections on every new plane. A valid point set is
held as a revision-checked creation candidate and becomes one undoable document insertion only when
the mapper explicitly creates it. The behavior follows the
[TrenchBroom complex-shape workflow](https://trenchbroom.github.io/manual/latest/#creating-complex-shapes)
as an interaction oracle; no GPL implementation source is adapted.

Sweep is a separate perspective authoring tool over one or more normalized face selections. On
activation, each source face receives a destination cap offset four grid units along its derived
outward normal. The combined destination bounds draw a yellow translation center, X/Y/Z rotation
rings, and one green uniform-scale handle. Center dragging follows the editor's normal 3D movement
model (XY by default, Alt for vertical Z, and Shift for dominant-axis restriction); rings snap to 15
degrees or 5 degrees with Shift, and scale advances in 0.05 increments. The Object inspector exposes
the same destination as exact world translation, Euler rotation, and positive uniform scale, plus
Straight, Arc, and cubic-Hermite S-bend paths, segment count, repeated transform iterations, and
optional integer snapping. Arrow keys move the cap, Alt+Up/Down moves it vertically, brackets rotate
around Z, and minus/equals adjust scale. Reset restores the initial destination and path controls.
Enter or Apply Sweep fills the path; Escape first resets and a second press deactivates the tool.

The DOM-free `sweepBrushFace` operation samples the selected path into adjacent polygon caps and
creates one independently validated convex hull brush between each pair. Straight paths interpolate
the cap transform linearly. Arc paths derive a circular center around the dominant rotation axis and
advance any axial component, while S-bends use source- and destination-normal Hermite tangents.
Iterations repeat the rigid translation/rotation and compound uniform scale, and hard limits bound a
single source face to 512 generated brushes and a multi-face transaction to 1024. Every generated
brush and face receives a fresh stable ID. With texture lock enabled, the source face's material,
surface attributes, and rotated Valve 220 projection are transferred to all generated planes;
without it, hull construction uses the source material and default projections. The session returns
a revision-checked `SweepCandidate` containing the derived preview document, all insertions, the
source faces, and their final destination caps. The renderer consumes those caps for its manipulator,
while Enter commits every insertion and the generated object selection as one history transaction.
Undo removes the entire path and restores the original face set; redo restores the generated set.
This follows the [TrenchBroom sweeping workflow](https://trenchbroom.github.io/manual/latest/#sweeping)
as a behavior oracle; no TrenchBroom implementation source is adapted.

Vertex and Edge are modal shaping tools for the selected brushes. Yellow handles appear at derived
corners or edge centers in all four viewports; click selects one, Ctrl/Command-click toggles an
additive handle set, and starting a drag on an already-selected handle preserves the entire set.
Dragging an empty area draws a rectangle that toggles every enclosed handle, while Ctrl/Command
makes the rectangle additive. Perspective gestures move on XY by default and switch to vertical Z
while Alt is held; orthographic gestures move on the view plane. Shift dynamically retains the
dominant axis during an existing-handle move. Both produce component-wise, relative grid-snapped
deltas; holding Ctrl/Command gives Vertex an absolute grid-snap mode, while Edge remains relative.
When at least one vertex handle is selected, Shift+Alt-clicking a different existing vertex chooses
the nearest selected handle as an anchor and translates the entire selected set exactly onto that
target. This quick snap uses the ordinary validated hull candidate, so coincident vertices fuse and
the selection remaps to the surviving derived handle. Arrow keys nudge selected vertex or edge
handles by one active-grid step on the last pointed viewport: XY, XZ, and YZ follow their visible
axes, perspective uses the camera's dominant horizontal right/forward axes, and Alt+Up/Down uses Z.
Each key press is one revision-safe history transaction and preserves the resulting handle set.
All modes share one live candidate preview and undo transaction. The core applies the delta to the selected derived vertices
and rebuilds the brush as a supporting-plane convex hull. This lets an outward corner split formerly
planar faces, drops a corner moved inside the remaining hull, fuses coincident results, and rejects
collapsed three-dimensional results rather than serializing a concave or open brush. Coincident
vertices and identical edges from multiple selected brushes collapse into one shared handle.
Moving or deleting that handle rebuilds every owner brush in one document transaction and rejects
the entire operation if any affected hull would collapse. Delete or Backspace uses this same
all-or-nothing path for every vertex represented by the selected vertex or edge handles. In Vertex mode,
holding Shift over the selected brush exposes a green prospective handle at the nearest grid point
on the hit surface. Dragging that handle outward inserts a new hull point, previews the resulting
face chopping, and commits it as one undoable transaction only if the point survives on the convex
hull. Existing face IDs and attributes are retained where the supporting plane survives; split
planes receive fresh IDs and inherit the best matching source material, surface attributes, and
projection. With texture lock enabled, new Valve 220 projections are fitted from corresponding
pre-edit UVs, including the prospective insertion point on its source face. Edge and face
subdivision are not separate manual operations: this prospective-handle gesture is the documented
path that adds a hull point and splits incident edges or faces as needed. Escape first discards the
active vertex or edge handle set, a second press leaves the component tool, and a third clears the
retained brush selection. The interaction follows the
[TrenchBroom vertex-tool workflow](https://trenchbroom.github.io/manual/latest/#vertex-tool) as a
behavior oracle; no TrenchBroom implementation source is adapted.

An active vertex or edge handle set carries into Rotate, Scale, and Shear and changes those tools
from object transforms into component transforms. Their overlay and resettable pivot use the
selected component bounds; both direct viewport gestures and exact inspector controls transform
the represented derived vertices, then rebuild every owner brush through the same validated convex
hull path as component movement. Coincident multi-brush handles fan out atomically, texture lock
fits surviving and newly created planes, and a successful commit remaps the selection to the
resulting handles so switching back to Vertex or Edge preserves the workflow. A transform that
would invalidate any affected brush is rejected as a whole.

Rotate, Scale, and Shear are modal object tools backed by affine plane-point transforms in the
DOM-free core. A mixed brush and point-entity selection gets one combined bounds overlay and pivot;
every selected object participates in the same live derived preview, validated document
transaction, and undo step when no component handles are active. Rotation draws axis rings;
orthographic drags rotate about the view-normal axis, perspective ring picking selects X, Y, or Z,
and angles snap to 15 degrees or 5 degrees with Shift. The yellow center is directly draggable in
every viewport: perspective movement defaults to XY and Alt switches to Z, orthographic movement
uses the view plane, Shift locks the dominant axis, and the grid-snapped coordinates and a movement
trace are shown at the handle. Escape restores the starting pivot without touching the document or
undo history. Scale draws side, edge, and corner handles around the active object or component
bounds. In orthographic views a side stretches one axis and a corner scales both visible axes
independently; in perspective, sides, edges, and corners proportionally scale one, two, or three
axes. Direct factors advance in 0.05 increments from the opposite handle by default. Alt moves the
anchor to the bounds center, while Shift makes the two visible orthographic axes or all three
perspective axes proportional. Shear draws face-center markers and maps horizontal motion to a
grid-snapped offset from a fixed source plane.
The inspector complements those direct gestures with a grid-snapped resettable pivot, exact X/Y/Z
rotation axis and angle, an entity-angle update toggle, exact non-uniform scale factors, and an exact
shear axis pair and offset. Flip X/Y/Z mirrors a brush, entity, or mixed object selection about the
corresponding plane through its grid-snapped bounds center and adapts horizontal entity headings.
When texture lock is enabled, the affine transform applies the inverse-transpose mapping to Valve
220 texture covectors so corresponding transformed points retain their UV coordinates.

The projected grid and movement guides follow the
[TrenchBroom grid and axis-restriction workflow](https://trenchbroom.github.io/manual/latest/#the-grid)
as a behavior oracle. These rotation and mirroring rules follow the
[TrenchBroom rotation workflow](https://trenchbroom.github.io/manual/latest/#rotating-objects) and
[flipping workflow](https://trenchbroom.github.io/manual/latest/#flipping-objects) as behavior
oracles; no TrenchBroom implementation source is adapted.

The Clip tool is modal and operates on the object selection set. Two snapped points infer an
oriented plane from the viewport; a third point fully specifies it, and double-clicking a source
face matches its authored plane points exactly. Existing points can be dragged between viewports:
orthographic movement preserves depth, snaps to the visible grid, and supports live Shift
restriction to the dominant axis; perspective movement reattaches the point to the nearest snapped
position on the brush surface under the pointer. The inspector reports every point coordinate while
the tool previews keep-back, keep-front, and split
results across every affected selected brush while leaving brushes wholly on the retained side
unchanged. Core clipping adds the new half-space plane, removes source planes that no longer bound
the convex hull, and validates every remaining brush. A split retains each source brush ID on one
side, creates fresh brush and face IDs for the other, and replaces all affected sequences in one
undoable document transaction. Undo and redo restore document order and the corresponding object
selection set. Escape or Backspace removes the most recent point before deactivating the tool.

TrenchBroom-style constructive solid geometry is exposed contextually for object selections. The
DOM-free core exports convex merge, intersection, subtraction, and hollow operations over validated
half-space brushes. Convex merge builds the supporting-plane hull of every input vertex and may
therefore fill space between the inputs. Intersection keeps the common solid volume and removes all
inputs when that volume is empty. Subtraction treats the selected brushes as cutters, partitions
each intersecting non-selected brush into non-overlapping convex fragments, and removes the cutters;
hidden and locked brushes are excluded from the target set.
Hollow offsets every source plane inward by the current grid size and subtracts that inner brush,
producing wall, floor, and ceiling fragments. A thickness that collapses the inner volume rejects
the whole command.

Every CSG result receives fresh brush and face IDs. A result face on the same geometric plane as an
input face inherits its material, Valve 220 projection, and surface attributes; a new convex-merge
plane uses the current material and a default projection. Multi-entity sequence replacement retains
document order and commits all removals and fragments as one revision and one undo step. Undo and
redo restore both the original object set and the resulting selection. This behavior follows the
[TrenchBroom manual](https://trenchbroom.github.io/manual/latest/#csg-operations) as a design oracle;
no TrenchBroom implementation source is adapted.

The application shell follows a compact desktop-editor layout informed by TrenchBroom: document
commands and functional tools occupy two thin strips, and Perspective, Top, Front, and Side use the
default balanced 2×2 grid with Perspective in the upper-left. Pointer- and keyboard-operable
splitters resize both viewport rows and columns along with the collapsible
Object, Textures, and Map inspector. Minimum sizes keep every pane usable. At narrow widths the
inspector becomes an overlay rather than shrinking the viewports. Normalized source remains
authoritative but opens in a modal editor instead of consuming a permanent workspace column. Local
`.map` files can be opened and saved from the shell.

The top bar offers System, Dark, and Light theme selection. The preference persists locally and
System follows the operating-system color-scheme setting. Theme changes update the CSS shell and
the live WebGPU renderer together, including viewport backgrounds, grids, edges, selections, and
tool overlays; they do not reload or alter the map session. Theme CSS exposes semantic roles for
surfaces, borders, text, states, overlays, renderer colors, and the UV diagram instead of
color-value-encoded aliases.

Brush duplication and deletion, live grid-size changes, texture-lock control for movement, and
selected-entity key/value editing are revisioned session commands with undo and redo. Object-set
movement, material application, transforms, duplication, and deletion replace all affected brushes
atomically and advance the document once. Duplicate brushes receive fresh stable brush and face
IDs, deletion history retains each original entity and insertion index, and entity-property history
retains complete before and after property records.

WAD and palette data remain runtime assets and are not copied into a map document. Face projections
are expressed in texel space so missing texture dimensions do not corrupt authored alignment.
Source views are fullbright. Exact lightmaps, visibility, and compiled collision are shown by
loading compiler output through the existing BSP renderer.

The runtime material catalog accepts local WAD3 textures and WAD2 textures paired with an external
Quake palette. It stores decoded previews outside the document, resolves names case-insensitively,
and replaces earlier entries when a later WAD provides the same name. Applying a material or
changing face shift, scale, or rotation is a revision-checked transaction; multi-face edits can
replace several brushes while incrementing the document revision once and remain one undo step.
Rotation updates the explicit Valve 220 axes rather than treating its compatibility rotation field
as the authoritative mapping.

The DOM-free material-usage query groups tokens case-insensitively and reports deterministic face
and brush counts. The Textures inspector uses it to mark in-use catalog entries, restrict the grid
to used materials, and sort by descending face usage. It also compares every used token with the
loaded catalog and keeps an explicit missing-count and bounded name list visible; absent mapper
WADs are therefore reported as a resource problem instead of appearing to be a renderer failure.
A material query can select every visible,
editable matching face or containing brush without changing the map. Replacement is one atomic
document transaction: no selection means the whole map, a face selection means only those faces,
and an object selection means matching faces on its selected brushes. The resulting face selection
contains every changed face, and undo restores both the source materials and prior selection. This
matches the current manual's
[Material Browser](https://trenchbroom.github.io/manual/latest/#the-material-browser) and
[Replace Materials](https://trenchbroom.github.io/manual/latest/#replace-materials) behavior while
keeping the implementation independent.

The Textures inspector includes a graphical UV editor following
[TrenchBroom's UV Editor workflow](https://trenchbroom.github.io/manual/latest/#uv-editor). It draws
the primary selected polygon, vertices, decoded repeating material, texel grid, U/V axes, rotation
ring, and movable transform origin in one SVG surface. Dragging the face pans the material in
integer texels and magnetizes either coordinate to a texture boundary when a face vertex comes
within six display pixels. The ring rotates around the origin with 15-degree snapping or one-degree
fine motion while Shift is held. Red and green handles scale U or V independently; Shift scales
both axes proportionally. The origin moves without dirtying the map, can be reset to the face
center, and snaps to the center or any vertex. Every pan, rotation, and scale is derived from the
unchanged source revision, previews both the source view and numerical fields, commits as one undo
entry, and can be cancelled with Escape. The DOM-free core applies a relative Valve 220 transform
around a world-space pivot, preserving the pivot's UV coordinate; multi-face gestures preserve
each face's existing projection and use its own center for non-primary faces rather than replacing
the set with one absolute transform.

The perspective viewport also implements TrenchBroom-style face-attribute transfer. After
Shift-click selects a source face, Alt-click copies its material, Valve 220 axes, offsets, scale,
rotation, and surface flags to one target while preserving that target face's contents. Alt+Shift
rotates the source axes onto the target plane, while Alt+Ctrl/Command changes only the material.
Dragging paints an ordered path and makes each transferred target the source for the next face;
double-click applies the selected mode to every face of the target brush. The entire path or brush
transfer is one previewed, revision-checked history transaction. A click-sequence source is captured
before the first pointer press so an Alt-double-click that began without a selected source remains
available for connected-coplanar face selection. The texture inspector can reset face-parallel or
world alignment, flip either texture axis, and rotate the explicit axes by 90 degrees; a face set or
object selection applies the operation atomically. Face-bound controls rotate the U axis through
the polygon's edges, cycle texture-atlas justification slots against each side, fit integer texture
repeats horizontally or vertically, and auto-align/justify/fit both directions. Repeated clicks
advance the edge, slot, or repeat count; Shift reverses the cycle, while Ctrl/Command changes fitting
to integer 1/n subdivisions. Fit and justify resolve each selected face's runtime material
dimensions independently and reject the entire transaction if a required texture is unavailable.
These interactions follow the
[TrenchBroom material and UV workflows](https://trenchbroom.github.io/manual/latest/#assigning-materials-manually)
as a behavior oracle; no TrenchBroom source is adapted.

Compilation is behind an editor-facing asynchronous adapter that accepts source text and returns
diagnostics plus artifacts. A future implementation may run ericw-tools in WebAssembly or send the
same request to a non-browser build service. Neither backend is allowed to mutate editor state
outside the revision-checked result installation step.

The first remote implementation posts that request to the local compiler service and decodes
bounded base64 artifacts. A compile coordinator cancels superseded work and refuses results when
either the returned revision or the current document revision differs from the request. The service
runs `qbsp`, `vis`, and `light` without a shell in a per-request temporary directory; preview quality
uses `qbsp -nofill`, fast vis, and bounded light settings so open construction remains inspectable.
Final quality restores outside filling, detailed vis, and extra light sampling. Native executable
paths and any game directory are server configuration, never request fields. The Newport deployment
accepts only server-owned jobs from authenticated hosted maps, limits map source to 2 MiB, assets
and artifacts independently, admits one active build and six attempts per user per hour, and bounds
the global queue. Its private compiler container additionally constrains CPU, memory, scratch space,
PIDs, file descriptors, stage duration, and concurrency.

Compile assets are transient request inputs. The editor encodes its generated development textures
as an in-memory WAD2, uploads that WAD alongside any locally loaded WADs, and adds their safe
basenames only to the compile snapshot's worldspawn. The authoritative document is unchanged.
`qbsp` searches the isolated asset directory with `-wadpath` and embeds the resolved Quake textures
in BSP29. The returned artifact can therefore switch the perspective pane from source editing to a
lightmapped Worldview fly view without committing a WAD or compiled map.

The current ericw-tools build has no Emscripten target, globally requires C++20, TBB, and Embree 4,
and links `light` directly to Embree. This was checked against upstream commit
`8b70fce25558f2662ebee0855c12d35fe21e7beb`; all three native tools were built locally to validate
the adapter, but neither the GPL source nor binaries are part of this repository. A WebAssembly
backend therefore remains a separate GPL build and distribution effort rather than an
editor-package compilation flag. `qbsp` and `vis` are the more practical first port targets; full
light compilation must replace or port the Embree-backed trace path and define a browser
filesystem/worker model.

The first vertical slice is Valve 220 parsing and normalized serialization, convex brush derivation
and validation, synchronized perspective and XY/XZ/YZ source rendering, stable selection, and
grid-snapped direct brush movement in every viewport. Drag previews are derived from an unchanged
source revision and only the final validated candidate becomes one undoable transaction. Local WAD
material browsing, fullbright source-texture rendering, face application, and texture-projection
editing use those same document and rendering boundaries. Read-only offset reference scenes and
the revision-safe native compile preview are now part of that slice. A create tool draws a
grid-snapped Simple Shape on the active viewport's construction plane, keeps stable brush and face
IDs across previews, and commits or cancels through the same session boundary. Cuboids, axis-aware
cylinders and cones, hollow cylinders, directional stairs, arches, UV spheroids, and subdivided
icospheres now share that batch boundary with circle alignment and 3D equal-span or height-only
modifiers. Duplicate, delete, editable
entity properties, configurable grid size, and texture-lock-aware movement now use that session
boundary as well. Perspective-only point placement, face-vertex capture, rectangle placement, and
normal-duplicated polygons now create arbitrary validated convex hull brushes through that same
boundary. Additive cross-brush face sets, all-face and connected-coplanar expansion,
handle lasso and surface-paint selection, transactional face-set material editing, and
grid-snapped, convexity-checked face extrusion or viewport-plane face translation use the
same candidate-preview and history path. Modifier-driven outward and inward face split extrusion
uses an atomic two-brush replacement on that path. Two- or three-point front/back/split clipping across an
object selection set and exact face-plane matching now use it as well. Convex merge, intersection,
multi-cutter subtraction, and grid-thickness hollow now use the same atomic sequence-replacement
history. Additional geometry tools, project persistence, and multiplayer build on those
boundaries. Additive object selection and multi-brush
movement, material edits, duplication, deletion, rotation, scale, and shear now share the
candidate-preview boundary too, including combined bounds and pivots, direct snapped viewport
gestures, exact inspector controls, affine texture locking, and one-transaction undo.
Direct vertex and edge shaping now uses the same preview boundary and reconstructs a valid convex
hull when a moved corner requires face chopping, fusion, or removal. Shift+Alt target snapping and
viewport-aware arrow-key component nudging now reuse that hull path and remap the selected handles
after each atomic commit. Face handles now share the same keyboard movement mapping, and component,
tool, and object cancellation follow the manual's staged Escape behavior.
Continuous object paint selection, reversible object/face selection drilling, brush-entity sibling expansion,
and stable-ID duplicate-and-move gestures now extend the object-set boundary without adding derived
interaction state to the document.
Macro-like command repetition now records object duplicate, translate, rotate, mirror, scale, and
shear descriptors until a manual selection reset, then replays the sequence with fresh IDs as one
revision and one undo entry through both the DOM-free session and browser tool strip.
Live issue derivation and the bottom Issues drawer now add deterministic structure, geometry,
entity, link, and metadata diagnostics with filtering, local finding suppression, viewport
selection/reveal, and one-entry undoable quick fixes without serializing diagnostic state.
Material usage queries and the Textures inspector now add in-use filtering and sorting, visible
face/brush consumer selection, and selection-scoped or whole-map replacement. Replacement advances
the document once, selects all changed faces, and restores the previous selection and materials in
one undo entry.
The source renderer and application shell now expose a stationary-right-click map-view context
workflow in all four panes. Exact under-cursor face selection and material reveal sit beside
selection organization, visibility, point/brush-entity creation, structural conversion, and Paste
Here, while right-drag look/orbit/pan and right-button fly-speed adjustment remain camera gestures.
Select All and Invert now operate over the visible, unlocked editing context. Temporary structural
selection brushes add convex touching, full 3D containment, and orthographically projected
containment queries for brushes and point-entity bounds, consume their volumes atomically, and
restore both source and selection through undo/redo.
Named regular and nested groups now extend the object-set boundary with aggregate picking and
transforms, compatible `func_group` serialization, recursive blue bounds, group-aware
copy/paste/duplication/deletion, and an open-group context that locks the rest of the map while
members remain editable. Rename, ungroup, double-click activation, empty-space close, and Escape are
covered by the same document and interaction boundaries.
Map-compatible linked duplicates now extend regular groups with independent affine transforms,
purple sibling visualization and arrows, recursive content synchronization, nested linked trees,
protected per-copy entity values, unlink/singleton normalization, and atomic snapshot history.
Undoable hide, isolate, show-all, lock, and unlock-all commands now add non-serialized object view
state to that session boundary. Source rendering skips hidden objects, gives locked objects a blue
treatment, and excludes both sets from picking and CSG subtraction targets without dirtying the map.
Persistent viewport filters now derive live entity-class counts and world/detail/trigger/clip/
hint-skip/liquid/sky brush categories, resolve them into the shared hidden-ID contract for committed
and preview documents, and expose searchable View controls without map revisions or undo history.
Map-compatible Default and custom layers now add ordered recursive membership, active insertion,
move/select/isolate/remove/reorder workflows, serialized visibility and locking, compile-export
omission, Map-inspector controls, and atomic history on that boundary. Removing a layer reparents its
contents to Default, while new top-level groups and map-text paste honor the active destination.
Parseable map-text object copy/paste now crosses document boundaries with fresh stable IDs,
brush-entity ownership, mixed point entities, one-step undo, and surface-aware perspective Paste
Here placement. Orthographic Paste Here retains the visible pointer position and lines the copy up
past the latest selection depth.
Standalone face-attribute copy/paste now exchanges a validated, versioned plain-text payload through
the same toolbar, native shortcut, and in-editor fallback paths. It applies the primary source
material, Valve 220 projection, flags, and value to one or more selected or directly pointed faces
in one undoable transaction while retaining each target brush's contents.
Point-entity wireframe rendering and picking, surface/orthographic placement, mixed object
selection, movement, duplication, deletion, editable properties, and brush-entity/structural
conversion now use a whole-document preview transaction so cross-entity edits still undo in one
step. Mixed brush/entity rotation, Quake angle-property adaptation with a temporary opt-out,
heading visualization, and snapped-center X/Y/Z mirroring now use that same transaction boundary.
Directed target/killtarget overlays now resolve point- and brush-entity anchors with all four
TrenchBroom visibility modes, selection-sensitive coloring, hidden-endpoint filtering, and no map
revision changes.
Perspective attribute projection, rotated transfer, material-only transfer, chained paint transfer,
whole-brush transfer, and face-set or object-wide texture reset/flip/rotation, edge alignment,
atlas justification, repeat/subdivision fitting, and auto-fit now use that boundary as well while
preserving target contents. The graphical UV editor adds material-grid rendering, a snapped movable
pivot, relative pan/rotate/axis-scale previews, multi-face delta preservation, and cancellable
single-entry history on the same boundary.
Multi-face Sweep now extends the same boundary with Straight, Arc, and S-bend cap sampling,
segmentation and repeated transforms, integer snapping, texture inheritance, a live generated-brush
preview, perspective destination-cap movement/rotation/scale handles, exact inspector and keyboard
controls, and one atomic insertion history entry that restores source or generated selections.
