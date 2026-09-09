# Worldview product and architecture

This is the canonical record of Worldview's product scope, system boundaries, and data ownership.
It describes the design we intend to preserve, not the order in which it was built.

- [Editor capabilities](./editor-capabilities.md) records current user-visible behavior.
- [Viewer API](./viewer-api.md) documents the published package.
- [Cleanup backlog](./cleanup-plan.md) is the only list of unfinished work.
- [Documentation index](./README.md) explains the role of every other document.

## Product

Worldview has two related products:

- A browser map editor for Quake, GoldSrc, and Quake II `.map` projects. `.map` source is the
  authoring format and compiled BSPs are previews or build artifacts.
- An embeddable WebGPU viewer for Quake BSP29, sanitized BSP2, GoldSrc BSP30, and Quake II BSP38
  maps.

Local projects remain fully useful without an account or server. Hosted projects add 4orm identity,
remote resources and builds, and optional multiplayer. A hosted map tolerates short offline periods,
but the architecture does not promise indefinite multi-master editing. Work that exceeds the
reconnect bounds becomes an independent local map.

The project is pre-1.0. Internal and public contracts may change together without compatibility
adapters or migrations unless a release explicitly promises otherwise.

## Product boundaries

- `.map` is authoritative geometry. `worldview.project.json` is portable configuration, not a
  geometry container.
- New maps contain an empty `worldspawn`. Valve 220 is the default; classic Quake face syntax stays
  classic until the user converts it.
- Chromium provides the full directory-handle workflow. Other WebGPU browsers keep import,
  download, and IndexedDB recovery paths.
- Local compilation is optional and uses explicitly configured native tools. Hosted compilation is
  authenticated, queued, and sandboxed by the operator.
- WebMCP is another authoring surface over the visible editor. Its availability never changes the
  ordinary UI or the map transaction model.
- The viewer is a static-world exhibit, not a game engine. It does not own trigger simulation,
  game rules, or arbitrary engine behavior.
- Commercial and shareware game data is never part of the repository or npm package.

## Repository boundaries

| Workspace                     | Responsibility                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/worldview`          | Published viewer, GPU-independent BSP core, custom element, runtime helpers, and walkability APIs                      |
| `packages/worldview-editor`   | DOM-free map model, source preservation, projects, commands, sessions, gestures, spatial queries, and source rendering |
| `packages/worldview-protocol` | Private Zod schemas shared by browser and service runtimes                                                             |
| `apps/viewer`                 | React development viewer and local compatibility fixture host                                                          |
| `apps/editor`                 | React routes, shell, presenters, browser storage, filesystem adapters, dialogs, and viewport composition               |
| `apps/compiler-service`       | Adapter around configured native compile and launch profiles                                                           |
| `apps/collaboration-service`  | Portable Workers/Durable Objects map-room service                                                                      |
| `apps/worldview-service`      | Same-origin application backend for auth, projects, resources, builds, and realtime admission                          |

The following boundaries are enforced by `npm run check:architecture`; the
[verification guide](./verification.md#architecture-contracts) records the automated and human
review boundary:

- `packages/worldview/src/core` has no DOM, WebGPU, or TypeGPU imports.
- `packages/worldview-editor/src/core` has no DOM imports.
- Applications consume public package entrypoints instead of package internals.
- React is an application dependency, not an editor-engine or viewer-core dependency.
- TypeGPU owns schemas, shaders, pipelines, bindings, textures, and samplers. Raw WebGPU is limited
  to command encoding, canvas and capture interop, and explicit bulk buffer transfers.
- npm workspaces and the committed `package-lock.json` define the dependency graph.
  Development uses Node 24.15+ and the npm 12 version pinned in `package.json`, including CI and
  Docker. Dependency install scripts use explicit versioned approvals. Vitest remains on v4
  until the Cloudflare and fast-check integrations support v5; Node types follow the Node 24
  runtime. A scoped Miniflare override selects `sharp` 0.35.4 for GHSA-rgj7-g3m4-5g8c until its
  upstream pin includes the fix. Playwright stays on 1.62.1 because 1.63's bundled Chromium
  crashes when restoring OPFS directory handles from IndexedDB, breaking project and export tests.
- Production modules stay below the repository ceiling, with tighter limits for named coordination
  roots. Hand-written TypeScript, TSX, and CSS under the editor app and package remain covered.

## Editor architecture

### State and transactions

`EditorSession` is the only authority for document changes and history. It is a stable facade over
one session kernel and focused command domains for organization, selection, transforms, topology,
entities, clipboard operations, materials, and commits. Command domains read narrow, readonly
kernel views and use shared candidate assembly for single-brush and batch previews. Direct actions,
repeated commands, remote operations, and WebMCP calls all reach the same validation and transaction
boundary.

Each viewport owns one active pointer drag. Pointer handlers select and update camera, selection,
transform, topology, face, clip, hull, sweep, creation, and placement operations directly. Only the
owning pointer may update or commit the drag; commit and cancellation release ownership before
notifying the application. Gesture previews and commits reach the same editor session boundary.

High-frequency camera, pointer, preview, and GPU state stays outside React. Immutable application
snapshots cross into React through narrow external-store ports. The initiating client renders a
preview immediately; collaboration transport never sits in the local feedback path.

Scene feedback subscriptions belong at the smallest consuming UI component. Composition roots
select layout values (such as issue-panel visibility), not entire issue or camera snapshots.
Status and shape-result readouts update independently of sibling controls. Editor UI ports preserve
snapshot identity for shallow-equal immutable fields, and command updates retain unchanged action
identities. Equality must not recursively traverse map or geometry data. These publication contracts
and camera/brush-preview isolation have focused unit and browser regression coverage.

The editor uses one horizontal top toolbar. The Worldview document menu contains new/open,
saving, source export, recovery, collaboration, and theme controls. Build has its own menu at the right beside the inspector toggle. Its compact cube trigger
opens the current map name above separated file, recovery, and application action groups without headings, aligned flush beneath the button with larger labels and fixed icon/text columns; scene tools, grid, view, and history sit alongside it. Compact dividers group editing concerns, and the numeric grid control sits beside texture lock. The toolbar scrolls horizontally when space is limited and has no left rail.
Original SVG geometry glyphs combine neutral structure with colored faces, edges, handles, and transforms; general UI actions retain Phosphor. The neutral zinc dark theme, 18px axis-only viewport headers, and 20px status bar prioritize canvas space. Idle compiler status is omitted from the footer and zero issues use neutral text. Explicit nonempty selection changes
switch an already-open inspector to Face for faces or Entity for brushes/entities without stealing viewport focus; a closed inspector stays closed and keeps its chosen tab;
hover, camera updates, and empty selections do not change the user's chosen inspector tab.
Drag release is handled in the window capture phase. Capture-loss cancellation allows a bounded 250ms recovery window and checks gesture identity: browsers that emit lostpointercapture before pointerup can finish the release, while genuine interruptions still cancel without affecting a newer drag. It processes any final pointer position through the same preview constraints before committing; object moves commit the candidate calculated for that release rather than a cached preview. Face resizing retains the latest valid candidate across invalid pointer samples, commits it on release outside the valid range, and resumes normal previews when the pointer returns to valid geometry; explicit cancellation still restores the pre-drag document.

The perspective header includes a vertical FOV control (20–120°, factory default 60°). A modified
indicator compares the current lens to a browser-local preferred default; users can reset, save the
current lens as default, or restore 60°. Stored per-map cameras still restore their own lens. The
control subscribes only to FOV/default/compiled-state values, not camera motion. The renderer public
`setPerspectiveFieldOfView` method changes only the perspective lens and preserves camera pose.

### React and routing

React owns visible application DOM. Presenters expose immutable snapshots and typed commands; they
do not create elements, query controls, or project state by mutating DOM nodes. Stable refs are
reserved for canvases, renderer overlays, focus and selection, pointer capture, measurement, native
file inputs, and dialog lifetimes. The detailed rules live in
[the React ownership contract](./react-ui-ownership.md).

Object-shaped UI snapshots share one small application-local port for publication and presenter
binding over the viewer package's `SnapshotStore`. Surface-specific defaults, command guards, and
reset behavior remain explicit. React calls named, typed commands directly; no string-based generic
dispatcher reconstructs their parameter types.

The editor uses React Router v8 Data Mode. The home route loads local and authorized hosted work
without importing the editor, renderer, WebMCP, compiler, collaboration, or editor styles. The
new-map route may warm the lazy editor graph, but only an editor route constructs presenters or asks
for WebGPU. The editor bundle may be substantial; keeping it out of the landing route matters more
than an arbitrary size target once editing begins.

React Aria Components provide conventional control behavior. Worldview owns component composition,
semantic CSS variables, density, iconography, and renderer colors. The canonical visual and control
rules live in [the interface system](./interface-system.md).

### Source rendering

The editor status bar exposes opt-in Performance diagnostics: visible-tab browser frame cadence,
a bounded frame-time graph, slow-frame counts, and CPU time around editor render calls. A local
30-second capture retains timing samples and exposes JSON for inspection while the user navigates,
including empty maps. Idle on-demand rendering is distinguished from browser FPS; these are not GPU
execution timings. Monitoring is disabled by default and stops when the editor unmounts.
Camera and pointer readouts subscribe below the workspace and status controls. Camera-only changes
do not reconcile the inspector trees or diagnostics panel; workspace subscriptions select only
compiled-preview visibility and renderer errors. The navigation diagnostics browser test guards
against updating the graph at camera-event frequency while preserving camera movement and map revision.

The source renderer keeps committed world geometry separate from local previews, local selection,
tool overlays, face grids, references, diagnostics, and remote presence. Each retained contribution
has explicit dependencies and disposal. Camera or selection changes do not rebuild world geometry;
document edits replace only affected spatial batches.

All invalidated viewports encode into one command buffer and use one queue submission per editor
frame. Rendering runs on demand except while camera movement or animated materials require another
frame. Perspective and orthographic panes share scene data but keep independent cameras, grids, and
render targets. The [TrenchBroom conformance record](./trenchbroom-conformance.md) owns reference
behavior and intentional differences.

## Viewer architecture

The published viewer separates binary parsing and world data from browser and GPU lifetimes.
`createWorldview()` and `<world-view>` use the same `WorldSource` model; the custom element owns one
atomic source rather than assembling a second URL-only loading contract. Optional walkability is a
fingerprinted sidecar with its own cancellation generation and does not delay the base map's ready
state. The viewer app cancels pending GPU initialization when its canvas detaches, preventing a
stale attachment from configuring or disposing the active canvas during React remounts.

`TypeGpuWorldRenderer` is a small lifecycle facade for one loaded world. Focused internal owners
hold scene and material resources, canvas and capture targets, and pass encoding; GPU-independent
frame planning decides visibility, ordering, and which passes are needed. This keeps disposal
explicit without changing the public viewer API or merging the compiled-world and source-editor
renderers.

Quake II assets use logical, case-insensitive paths below a game root. An embedding application can
provide explicit sources, a resolver, or a base URL. Archive mounting and installation policy stay
outside the renderer. [Viewer API](./viewer-api.md) owns consumer examples, while
[Quake II compatibility](./quake2-compatibility.md) owns format evidence and the exact supported
boundary.

The GPU-independent format core is also the canonical inspection layer. Cheap BSP and WAD
identification, focused embedded-texture parsing, resilient WAD records, and external asset
planning reuse the same parsers and lookup policy as the viewer. The viewer fetches from the
exported asset plan; indexers and asset services may consume it without importing browser or GPU
code. [Format core](./format-core.md) owns that public contract.

The viewer and editor share only low-level, GPU-independent runtime helpers and Quake-family camera
math. Their renderers remain separate because compiled BSP visibility, lightmaps, and entities do
not have the same lifecycle as mutable source geometry, four editing cameras, picking, and tools.

## Document and project contracts

### Formats and source safety

Game profiles, document formats, face syntax, and primitive kinds are separate types. The document
codec registry owns parse, retained-source parse, serialization, source-safe save planning, and
rebasing for each container format. Format-specific behavior must enter through that registry or a
profile boundary rather than through branches in generic history, geometry, or application code.

The retained source model keeps original bytes, spans, comments, whitespace, property order, face
syntax, and unsupported opaque constructs beside the semantic document. No-op saves preserve bytes.
A changed document is written only when every affected source region can be reanchored safely;
normalized export is an explicit alternative.

Entities contain a closed primitive union. Commands narrow to the primitive kinds they support
instead of pretending that brushes, patches, and future surface types share editing semantics.
Stable IDs occupy one document namespace.

### Projects, resources, and builds

Portable project configuration names the game profile, maps, resource roots, definition sources,
and logical build profiles. Browser handles, executable paths, recovery snapshots, view state,
resource-cache entries, and local compiler endpoints are machine-local records.

Resources resolve in declared order and use stable logical identities. Hosted mounts pin provider
asset IDs and SHA-256 hashes; provider changes never silently replace project content. Entity
definitions use the same catalog boundary regardless of whether they came from FGD, DEF, or ENT
sources.

Build requests name a source revision, fixed profile, and preview or final quality. Results carry
logs, diagnostics, artifacts, and the source fingerprint. Worldview development textures are an
explicitly listed default pack shared by editor and compiler. Hosted maps inherit pinned project
WADs; browser-only WAD imports are unavailable in hosted workspaces. Builds verify pinned bytes and
used non-tool texture names, attach the WADs, and rewrite only transient compile-source references.
Later project packs override earlier packs and defaults, matching sidebar resolution. Missing,
corrupt, or oversized inputs stop the build. The public editor core exports development-material
generators and `serializeMapForCompile` to share validation, omitted-layer handling, and precedence.
The public `developmentTexturePack` generates target-specific WAD bytes and decodes editor previews
from those same bytes. The standard 768-byte Quake palette is bundled as an explicitly approved
compatibility-data exception, exposed by the viewer core's `createQuakePalette`. Quake authoring,
WAD2 imports, hosted builds, and BSP29/BSP2 viewing use it by default. Explicit palettes and
game-root palettes override it for mods. Generated WAD2 colours use the selected palette's
non-emissive range (0–223), with index 255 reserved for masked pixels. No diagnostic palette is
silently substituted. Custom standalone palette uploads persist alongside the document's WAD mounts.
GoldSrc development textures use WAD3 with per-texture palettes, preserving their original colours.
Imported WAD bytes, authored mipmaps, and intentional Quake fullbrights remain untouched. Invalid
or wrong-game WADs are rejected before changing the live catalog, and texture-resource changes
during compilation make its result stale. Quake II requires its own game resources rather than a
generated WAD.
GoldSrc compiler profiles explicitly request `qbsp -hlbsp` and validate BSP30 output; the hosted
queue also rejects successful worker results with the wrong game's BSP format.

A stale result remains inspectable but
cannot replace the current compiled preview. Browsers never provide arbitrary executable paths,
commands, or hosted build source. A newly installed preview starts in fly mode from the perspective
camera captured with the request; camera position, orientation, and field of view are applied before
the compiled viewer's first frame and remain separate from source viewport state afterward.
Native launch reports success after the configured process spawns; spawn failures return through
the launch request instead of escaping as unhandled process errors.
Missing BSP29/30/BSP2 texture-table entries remain drawable using diagnostic fallback materials and
emit warnings; missing artwork must not silently discard compiled geometry as tool surfaces.
The standalone viewer and compiled editor preview share lighting behavior. `ParsedWorld.hasLighting`
records whether the BSP lighting lump is present. In Quake/GoldSrc maps with baked lighting,
sampleless opaque and masked faces stay dark; maps without baked lighting remain viewable unlit.
Quake II retains its sampleless-surface behavior. Lightmaps always use linear filtering independently
of the diffuse-texture filtering setting. The compiled editor preview uses the same default linear
texture filtering as the standalone viewer.
Format-specific lighting rules live in `render/world-lighting.ts`: Quake BSP29/BSP2 follows QSS-M's
neutral gamma/contrast baseline, including normal lightstyle scaling and palette-index fullbrights;
GoldSrc BSP30 (Half-Life and Counter-Strike) keeps its separate neutral preview; Quake II retains
its own sampleless-face rule. GoldSrc engine/user texgamma, lightgamma, brightness, and display
settings are not yet emulated. A game's name does not override the loaded BSP's texture format.
Decoded Quake mip levels optionally expose `fullbrightRgba` for indices 224–255, excluding masked
index 255. The original `rgba` remains intact for texture previews. Rendering lights the ordinary
color separately from the fullbright contribution, with matching UVs, mip levels, and filtering.
Imported WAD bytes and palettes remain unchanged; WAD3 palette indices do not inherit this rule.
The old Quake-only 1.4× color boost and 0.9 power curve are removed. See
[rendering compatibility](./rendering-compatibility.md) for the reference checks and their limits.
Local native-engine capture tooling runs pinned QSS-M and Xash3D FWGS in Docker with Xvfb and
software OpenGL, using read-only game installations. It saves engine screenshots, settings, input
hashes and camera readbacks. Xash uses CS16Client with the supplied original CS server library;
scratch spawn overrides and native entity commands position the camera without altering BSP bytes.
Both engines have captured the hosted test map; Xash has also captured the installed BSP30
`de_dust` at a verified camera. These are optional local comparison tools, independent of the
browser renderer and normal CI. See [native engine captures](./engine-capture.md).
Build results offers Download BSP for the selected build, including retained history. Downloads
preserve the compiler's filename and exact artifact bytes for use in a compatible local engine.

The Build menu offers Build & preview, remembered Preview/Final quality, Export latest build,
Build & export, Export settings, Build results, and the source/compiled view switch. Leak paths,
portals, and native launch live in Build results. Export uses the last successful build in the current
session and rejects a changed document or revision. Historical builds remain available as raw BSPs.
Automatic export returns a BSP when the supported map resources are embedded, otherwise a ZIP with
engine-root paths (`maps/<name>.bsp`, WADs at the root, and referenced sounds, sprites, skyboxes, and
Quake II WAL textures). Quake BSPs with missing embedded textures must be rebuilt; GoldSrc may use
external WADs. Missing resources, unsafe paths, and model formats whose secondary dependencies cannot
yet be resolved stop automatic packaging instead of producing an incomplete archive. The normal game
installation still supplies engine/game data such as palettes and entity-class resources.
An optional source checkbox includes the compile-time `.map` and WAD snapshot, never later edits.
One machine-local setting set per project remembers quality, source inclusion, a download or selected
directory destination, and export after successful builds. The directory receives one BSP or ZIP,
replacing that map's same-named export; it does not unpack into arbitrary game directories.
Native directory handles are stored in IndexedDB schema v2. Browsers without directory access use
downloads. Revoked directory permission requires choosing the directory again; background builds
never prompt for filesystem access. Export settings and directory handles never enter collaboration.

### Browser persistence

One typed IndexedDB database owns local projects, recovery, checkpoints, resource metadata, and the
hosted operation outbox. Browser persistence is authoritative for local work and recovery-only for
hosted work. Viewport cameras, pane sizes, and expanded-pane state are small per-map local
preferences and never enter source, history, or collaboration.

Zod schemas validate data at network, storage, clipboard, project-file, compiler, WebMCP, and other
trust boundaries. Owned formats reject unknown fields. External OAuth and asset-provider responses
may discard provider additions while preserving bounded required fields. Validation does not run in
document, gesture, or render hot paths.

The editor core owns the native compiler wire schemas used by its browser adapter, the native
compiler service, and the hosted build queue. The hosted queue rejects results for a different
source revision. Hosted browser APIs share response decoding while retaining their endpoint-specific
schemas. Every workspace uses the shared strict TypeScript options, including unit-test fixtures;
the collaboration Worker substitutes its own runtime libraries and generated bindings.

## Hosted projects

Hosted projects are peers of local projects, not a replacement. The same-origin service owns
application sessions, project metadata, membership, resource mounts, build admission, and signed
realtime tickets. It authorizes a request before touching a map cell, compiler, Artbin, or blob
store.

The service dispatches a small, named route table into focused authentication, project, resource,
map, and build handlers. Each handler receives only its domain dependencies and keeps mutation
origin checks, authentication, authorization, version checks, and calls into transactional
database operations visible at the route boundary. Request and JSON response bodies use the same
shared Zod contracts as browser consumers; binary resources and artifacts remain explicit streamed
responses. The HTTP request context contains transport state only and is not a service locator.

Each hosted map has one named SQLite-backed `MapCell`. It is the only hosted source authority and
persists an accepted semantic operation, resulting source and document, receipt, conflict state,
and next version before acknowledgement. Service metadata points to the cell but does not duplicate
its source. Initial loads, live joins, checkpoints, reloads, and builds all resolve the same cell.

The focused contracts are:

- [4orm OAuth](./4orm-oauth.md) for identity and application-session boundaries.
- [Server-side projects](./server-side-projects.md) for storage, permissions, routes, and builds.
- [Artbin integration](./artbin-integration.md) for remote assets and reproducible mounts.
- [Collaboration](./collaboration.md) for map authority, operations, presence, and reconnect rules.

## Data authority

| Data                                        | Authority                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Local map source                            | Retained source and document in the local editor session, with IndexedDB recovery |
| Hosted map source                           | The named `MapCell`                                                               |
| Document history                            | The current editor session; hosted undo emits a conditional inverse operation     |
| Viewports and pane layout                   | Per-browser, per-map local preference                                             |
| Local project handles and compiler paths    | Browser-local records                                                             |
| Hosted project metadata and membership      | Worldview service database                                                        |
| Hosted immutable assets and build artifacts | Content-addressed blob store                                                      |
| Presence and gesture previews               | Ephemeral collaboration transport                                                 |
| Compiled preview                            | Revision-tagged build result, never authoring state                               |

Local edit flow:

```text
React control / viewport gesture / WebMCP
  -> EditorSession preview
  -> validated transaction
  -> retained source save plan
  -> local project file and IndexedDB recovery
```

Hosted edit flow:

```text
React control / viewport gesture / WebMCP
  -> immediate local preview and validated transaction
  -> IndexedDB outbox
  -> ticketed MapCell operation
  -> persist, order, acknowledge, broadcast
  -> source-safe MapCell snapshot
```

## Format extension rules

New source formats receive a document codec and honest primitive semantics. New game profiles supply
their own materials, definition formats, resource roots, build profiles, and surface attributes.
Compiled preview support is a separate viewer capability and cannot become editor state.

Every claimed format requires licensed or ignored-local corpus evidence, exact no-op preservation,
normalized serialize/reparse coverage, malformed-input diagnostics, stable-ID behavior, and explicit
handling for unsupported constructs. GPL engines and editors may be compatibility and interaction
oracles, but their implementation and artwork do not enter this MIT repository.

The ordered implementation work for additional formats lives only in
[the cleanup backlog](./cleanup-plan.md#format-expansion).

## Verification and provenance

Collaboration packages the Worker and the maintained Celld fork in one `:latest` application image.
It diagnoses a SQLite object store and deploys the Worker before starting the runtime, without an
Azurite or bootstrap container. Authoritative objects and disposable replicas occupy separate
paths under the existing persistent Celld volume. The web/compiler service and its project data
remain separate. The storage transition preserves MapCell identity and the browser protocol;
see [the collaboration deployment notes](./collaboration.md#newport-migration).

Repository-wide test tiers and host requirements live in
[the verification guide](./verification.md). GPU performance, local game corpora, and live celld
recovery drills run explicitly on hosts that can provide meaningful evidence.

Source viewport camera drags defer surface picking and collaboration cursor publication until
release; the final camera refreshes the paste destination. Multisampled color and depth attachments
are discarded after each resolved frame. Hardware performance verification records the adapter and
GPU submissions and rejects renderer failures; Windows/GTX 1070 responsiveness still needs direct
verification on the affected machine.

The current user-visible result and its verification entrypoints are summarized in
[editor capabilities](./editor-capabilities.md). Local viewer fixture setup belongs in the
[development viewer README](../apps/viewer/README.md).

Adapted source must be license-compatible and recorded in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) with focused source comments. Commercial or
shareware BSP, WAD, PAK, palette, sprite, model, texture, and sound data stays in ignored local
directories and never enters repository gates or release artifacts.

Convex hull authoring renders planar construction perimeters and a complete wireframe brush candidate
as soon as points enclose a volume, including during Shift-drag and after release. The candidate is
transient until Enter/Create Hull, which selects the committed brush as one undoable edit. Escape
discards the candidate and restores the original scene. This follows TrenchBroom behavior using
Worldview-owned geometry and renderer code.

Hull assembly has tool-local undo/redo for each point placement and completed polygon drag.
Toolbar and keyboard history use that draft while it is active; committing clears the draft
history and records one selected brush in document history. `B` activates Hull (`G` remains an
alias). Toolbar tooltips display available keyboard shortcuts in brackets.

Hull assembly uses a dedicated GPU construction overlay: constant screen-size yellow circular
handles (6 CSS pixels across), connected yellow perimeter/volume edges, and a double-sided 50% yellow planar face only
while Shift targets its interior. Extrusion retains yellow wire edges over translucent neutral surfaces through release; committing
restores the normal textured, selected brush appearance. A contrasting grid clipped to the preview surfaces
uses the current construction-grid spacing, including the Shift-highlighted planar face. Modifier/hover feedback stays inside the
viewport renderer, without React state updates or rebuilding geometry buffers on Shift changes.

Shift-resize targets selected brush faces even through other geometry and falls back to the nearest
projected silhouette edge when the cursor misses the selection, without a fixed distance cutoff.
The hidden adjacent face remains available to pull. Shift press/release refreshes targeting at a
stationary pointer; the proposed/dragged face has an opaque yellow outline rendered through
occlusion while ordinary brush selection remains red.

All source viewport tools share `viewport/drag-lifecycle.ts` for input termination. Window-capture
pointer release and mouse compatibility release feed the same final-position sampling/commit path,
with pointer/button matching and cleared-gesture deduplication. Capture loss allows a bounded 250 ms
release-recovery window before cancellation; pointercancel, window blur, and explicit cancellation
remain cancellation paths. Deferred loss never cancels a newer gesture and is cleared on disposal.

Holding Shift during perspective keyboard flight temporarily multiplies movement speed by four.
Release or focus loss restores normal speed; the stored base fly speed remains unchanged.

The perspective source renderer applies a passive world-aligned grid in its textured surface shader,
including unselected brushes. Spacing follows the active construction grid, with stronger eight-cell
major lines, antialiased screen-space coverage, and subpixel-density fading. Line contrast adapts to
the underlying material. This adds no per-brush grid geometry, draw calls, or React updates; saved
materials, UVs, and exported maps are unchanged.

Face extrusion now prototypes magnetic alignment to parallel faces on other visible brushes with
projected footprint overlap or shared edges (including a supporting platform side). A renderer-owned AABB tree indexes canonical brush faces and queries the moving face’s padded
world-space bounds; only nearby results undergo parallel-plane and footprint filtering. The index
is reused across previews and rebuilt for a different committed document (including undo). A 7 CSS-pixel attraction zone
and 14-pixel release zone let continued dragging break free. Exact face alignment overrides grid
spacing, including off-grid targets. All matching target outlines are cyan; snap feedback has no text popup. Holding
Ctrl/Command after starting a drag bypasses magnetism. This prototype applies to normal face drags;
free face translation is unchanged. The playground is `tests/browser/editor/support/face-magnet.map`.

The yellow Shift-extrusion outline includes every coplanar/shared-seam face returned by the same
`extrudableBrushFaces` resolver used by the edit, before and during dragging. This resolver scans
only the selected brush set, using cached ID lookup and derived geometry; separated selected
coplanar faces remain eligible, so a nearby-only query would change the intended behavior.
Cyan hover alignment checks the complete yellow face set and deduplicates shared targets.

Split extrusion (Shift+Ctrl/Command drag in Select) resolves the same selected coplanar face set
as normal extrusion, without requiring identical polygons. Outward splits select only the newly
added pieces, so another extrusion continues from them; inward partitions retain both pieces.
`createFaceSetSplitCandidate` returns a batch clip candidate even for one face, keeping selection
and undo/redo atomic. Opposing shared faces remain unsupported for split extrusion.
Renderer preview documents can supply explicit `faceOutlines`: split previews track the moving
caps by plane after their face/brush IDs change, while geometry invalidation still includes every
replacement, independently of which pieces will be selected.

Cyan face alignment feedback is independent of magnetic capture, but only appears alongside the
yellow resize-face outline during Shift targeting or extrusion. Every matching face is included,
including edge contacts with multiple neighboring brushes; the drag still chooses one snap distance. Grid alignment still shows the cue
while Ctrl/Command bypasses magnetism. Re-entering Shift targeting recalculates alignment from the
current geometry. Leaving the face-targeting state hides it; the cyan outline uses full opacity for clear visibility through geometry.

Magnet candidates include faces already aligned at gesture start, so returning to zero displacement
restores cyan feedback. Once a face drag has started, its preview continues updating inside the
initial movement threshold, including an exact return to the pointer-down position.

World edges, construction lines, selection outlines, and tool/snap guides share
`gpu-line-shaders.ts`. Stroke expansion uses physical pixel coordinates (avoiding aspect-ratio and
angle-dependent widths), with analytic edge/cap coverage composed through each style's opacity.
Existing 4× MSAA remains enabled. Procedural surface/2D grids keep their derivative-based shader
coverage; no additional rendering pass or per-tool line implementation is introduced.

Distant editor rendering filters detail at its source: the perspective ground grid uses a
world-space procedural plane with derivative-based density fading instead of thousands of
individually expanded lines. Shared strokes clip projected endpoints to the viewport before
pixel-distance coverage calculations, preserving precision on long coordinate axes. Opaque editor
materials build an original box-filtered mip chain once on upload, use linear minification and mip
transitions, and retain nearest magnification. Alpha-tested materials keep a single level to preserve
cutout coverage. No additional per-frame CPU work or render pass is introduced.

Selection-brush queries are exposed as a leading section in the viewport context menu rather than
an inspector panel: Select touching, Select enclosed, and Select enclosed in 2D. They appear for
eligible structural-brush selections, work with the inspector closed, and use the viewport that
opened the menu for projected queries (disabled in perspective). They reuse the existing command
path, consuming the query brushes and changing selection in one undoable transaction.

Viewport context menus use compact action rows and separators without view/coordinate headers,
visible section titles, or empty-section placeholders. Selection actions omit objects/faces already
in the current selection. The document menu retains file, recovery, and application action groups
as separators only, with left-aligned text in a shared icon/text column including iconless entries.

The `/design` kitchen sink is the V2 interface reference: zinc surfaces, compact top-toolbar editor
specimen, axis-only viewport labels, separator-only menus, restrained 2–3px corners, and shorter
popover shadows. It uses the shared runtime geometry-icon styles. Bespoke geometry uses 24-unit
view boxes, 1.5-unit structure and handle radii, and semantic color accents.

`apps/editor/public/design/worldview-icons-v2.svg` is the canonical external-editing working sheet,
linked and previewed on `/design` alongside editing notes. It contains all 84 semantic glyphs as
named editable groups, including path-based Phosphor utility artwork and license metadata. The
exporter `scripts/export-editor-icons.mjs` reads runtime sources and installed MIT Phosphor path
data; it refuses to overwrite external edits without `--replace`. Edited SVG proposals must be
ported into the runtime icon component/registry explicitly; the sheet is not an automatic import
surface. Design-specific specimen styles live in `routes/design.css`.

The reviewed implementation keeps transient hull history in `HullDraft` and tool-specific feedback
in `ViewportToolOverlays`, rather than adding hull/alignment state to general viewport rendering.
Visible canonical snap-target queries live with the source-renderer queries. The stateless
`face-drag.ts` policy separates candidate construction from preview/commit handling and permits
last-valid fallback only at the same canonical document revision. Source and base viewport modules
remain below 1,000 lines; no architecture thresholds were raised for these changes.
