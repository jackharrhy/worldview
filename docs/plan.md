# Worldview product and architecture plan

## Product direction

Worldview is an explicitly unstable, local-first browser toolchain for Quake and GoldSrc maps. It
has two related products:

- A WebGPU static-exhibit viewer for Quake BSP29 and GoldSrc BSP30 maps.
- A serious solo map editor whose canonical authoring format is `.map` source.

The editor opens and creates new maps as an empty `worldspawn`, with no sample brushes or point
entities. New maps default to Valve 220. Classic Quake face syntax remains classic until the user
explicitly converts it. An optional loopback helper provides configured native compilation and
external-game launch; the browser remains useful without it through import/download, local browser
resources, and recovery.

When the host browser supports WebMCP site tools, people and agents can also inspect and author the
same live map through semantic Worldview operations. This is a first-class authoring surface over
the visible editor, not a hidden test protocol; browser-driven tests are one consumer of it.

There is no release-number target or semantic-compatibility promise while the editor is hot magma.
App, package, helper, documentation, and consumer tests may change atomically. The detailed list of
delivered interactions lives in [`editor-capabilities.md`](./editor-capabilities.md).

## Product boundaries

- `.map` is authoritative geometry. Compiled BSPs are previews and artifacts, never editor state.
- `worldview.project.json` is optional, portable project configuration, not a geometry container.
- Chromium provides the full directory-handle workflow. Other WebGPU browsers keep safe
  import/download and IndexedDB recovery fallbacks.
- Quake and GoldSrc are the only delivered game profiles. Quake II is the next profile expansion;
  Quake III and Source follow through the staged format roadmap below.
- Browser-only/WASM compilation, Quake/GoldSrc model previews, three-way external source merge,
  native editor-owned geometry containers, and format support beyond the staged Quake II, Quake III,
  and VMF work are deferred. Optional local-first collaboration does not alter the solo editor
  boundary.
- The existing viewer remains a bounded static-world exhibit. Conveyor pushing, trigger state, and
  full game simulation are out of scope.
- Site-tool availability is browser- and account-dependent. Its absence never disables or changes
  the ordinary visual editor, and a separate remote MCP service is not required.

## Source and licensing policy

[noclip.website](https://github.com/magcius/noclip.website/tree/37b351452e7157996d645ee5e6502c5d9c54e090/src/Common/IdTech2)
is the only implementation source currently adapted by Worldview. Its MIT notice is retained in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) and focused source comments.

Compatibility work starts with published format information and clearly licensed independent
implementations. GPL engine/editor releases may be behavior and architecture oracles, but their
code does not enter this MIT repository. A renderer used for visual comparison is a test oracle,
not an implementation source. New adapted sources must be license-compatible and recorded before
merge. Commercial or shareware BSP, WAD, PAK, palette, sprite, or sound data must never be
committed; ignored local data belongs in `apps/viewer/public/local`.

Pinned editor references:

| Reference                                                                                                                                                                                  | Adopt                                                                                                                                       | Do not adopt                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [TrenchBroom `a4ec188`](https://github.com/TrenchBroom/TrenchBroom/tree/a4ec1886bf997ff73a18b2bf3d54e32c2020ce2a) and its [manual](https://trenchbroom.github.io/manual/latest/index.html) | Singular transaction ownership, focused tool controllers, game/entity configuration, compilation profiles, map-compatible groups and layers | GPL implementation or a desktop-only architecture                                                  |
| [Q3Edit `02f8764`](https://github.com/drdator/q3edit/tree/02f87647162e5bf5e39fe61968f904efe8e19675)                                                                                        | IndexedDB recovery, worker-ready boundaries, source-loss diagnostics, browser-local resources, version history                              | Normalize-after-first-edit behavior; Worldview preserves source structure                          |
| [WifeRadiant `7cc620a`](https://github.com/erysdren/WifeRadiant/tree/7cc620a891888257cd93ef076a07d54d53e807ae)                                                                             | Format/gamepack separation, idTech brush and patch coverage, VMF boundary cases, and compatibility-corpus ideas                             | GPL-family implementation code, global format switches, or claims of support based only on parsing |
| [WAD Together `e015027`](https://github.com/Donitzo/wad-together/tree/e0150270a33f25ea9428cd0b5e7f628822bdcf95)                                                                            | Later operation/inverse-operation collaboration with assets local to each participant                                                       | Collaboration before the solo workflow is dependable                                               |
| [celld](https://celld.dev/docs/)                                                                                                                                                           | Self-hosted Workers/Durable Objects runtime, one SQLite-backed cell per map room, hibernating WebSockets, operator-owned bucket durability  | Treating an alpha runtime as the collaboration algorithm, auth boundary, or only deployment target |
| [J.A.C.K. JMF](https://jack.hlfx.ru/en/articles/1/faq.html) and [Hammer VMF](https://developer.valvesoftware.com/wiki/VMF_%28Valve_Map_Format%29)                                          | Evidence for keeping editor/project metadata outside compiler-facing map geometry                                                           | A native geometry container that weakens `.map` interoperability                                   |
| [ericw-tools](https://ericw-tools.readthedocs.io/en/latest/qbsp.html)                                                                                                                      | Structured stages and BSP, portal, and leak artifacts behind safe configured profiles                                                       | Browser-supplied executable paths, commands, or arbitrary arguments                                |

The editor and runtime projects above are research references, not package contents, so they are
not third-party distributions listed in `THIRD_PARTY_NOTICES.md`.

## Workspace and dependency boundaries

- `packages/worldview`: published viewer, GPU-independent BSP core, custom element, and walkability
  APIs.
- `apps/viewer`: React development/static viewer, framework-neutral viewer controller/store bridge,
  and generated license-compatible fixtures.
- `packages/worldview-editor`: DOM-free map document, source preservation, project, definition,
  build contracts, commands, sessions, gesture controllers, spatial queries, and WebGPU rendering.
- `packages/worldview-protocol`: private DOM-free Zod schemas shared by browser and service
  runtimes for collaboration frames, realtime tickets, and hosted project/map/build wire data.
- `apps/editor`: React browser composition root and shell components, focused presenters,
  filesystem/project and WebMCP adapters, IndexedDB services, dialogs, and four-view authoring UI.
- `apps/compiler-service`: loopback adapter around explicitly configured compile and launch
  profiles.
- `apps/collaboration-service`: portable Workers/Durable Objects map service, verified through
  local Workers tooling and celld 0.4.0's persistent, bucket-free local development mode, with
  celld as the preferred self-hosted runtime; it does not enter the published editor
  core.

`packages/worldview/src/core` remains free of DOM, WebGPU, and TypeGPU imports. The viewer consumes
public package entrypoints. `packages/worldview-editor/src/core` remains DOM-free. The editor app
does not bypass package entrypoints. npm workspaces and the committed `package-lock.json` define the
dependency graph.

Runtime validation lives at trust boundaries rather than in document, render, or gesture hot paths.
Owned formats use strict Zod 4 schemas and reject unknown fields; external OAuth and Artbin
responses accept and strip provider additions while retaining bounded required fields. The schema
that owns a wire or persisted shape also supplies or statically verifies its TypeScript contract.
Worldview currently defines only its present baseline shapes: there are no compatibility adapters
or schema migrations while the project has no version-compatibility promise.

Every hand-written production TypeScript, TSX, or CSS file beneath `apps/editor/src` and
`packages/worldview-editor/src` is limited to 1,000 physical lines by
`scripts/check-editor-architecture.mjs`.

React is an application-shell dependency, not an engine dependency. Published viewer and editor
packages remain framework-independent. Stable canvas elements outlive shell-state updates; pointer,
camera, gesture, and per-frame GPU state do not flow through React. Immutable external snapshots
cross into React through `useSyncExternalStore`. Both application roots run in React Strict Mode.
External-system lifetimes attach through stable callback refs with explicit cleanup. Focused layout
effects are reserved for synchronizing native dialog and measurement lifetimes.
The editor route owns one application `AbortSignal`; renderer/scheduler resources, DOM and media
listeners, recovery hooks, shell command ports, compiler work, WebMCP tools, and collaboration all
terminate through that boundary. Each live collaboration room has a nested abort generation so a
leave or rejoin also invalidates unfinished authorization, reconciliation, presence, and socket
work without ending the solo editor lifetime.

The editor application uses React Router v7 in Data Mode (`createBrowserRouter` and
`RouterProvider`), without the Framework Mode Vite plugin. `/` loads the browser-local workspace
library, `/new-map` owns validated map-creation form actions, and `/editor` is a lazy route boundary.
The pathless application root owns a themed error boundary for unmatched routes and loader/render
failures. Authenticated route loaders use a full-document `/auth/login` redirect so the server, not
the SPA router, performs the 4orm handoff while retaining the requested same-origin return path.
Validated new-map options cross that boundary in browser history state, keeping the editor URL clean
while preserving reload and back/forward behavior.
The home route does not import or initialize the editor package, WebGPU renderer, presenters,
WebMCP registration, compiler probes, collaboration UI, TanStack Query, or editor icon/style
assets. Because new-map creation always enters the editor, `/new-map` warms its lazy module graph
during idle time and on submit intent, but presenter construction and WebGPU initialization remain
exclusive to `/editor`. Route isolation and initialization cost—not an arbitrary maximum editor
chunk size—are the performance boundary. Once a person opens the editor, its substantial parser,
tooling, and GPU module graph is expected; size remains observable, but clarity and capability take
priority unless measurement shows a user-facing loading regression. Home loaders read recent local
workspaces; future remote workspace providers can join that loader boundary without changing editor
document ownership.

Hosted projects are the next delivery slice and remain peers of local projects rather than a
replacement. Their identity, persistence, asset, realtime, and build boundaries are specified in
[`4orm-oauth.md`](./4orm-oauth.md), [`server-side-projects.md`](./server-side-projects.md), and
[`artbin-integration.md`](./artbin-integration.md).

The first hosted-project slice is delivered on Newport: 4orm PKCE login, private project/map
routes, authoritative MapCell source persistence, named checkpoint storage, signed short-lived map
tickets, 4orm session and project-role enforcement, Artbin search and pinned mounts,
cached WAD delivery into the editor, and queued server-owned compiler jobs all cross explicit
service boundaries. Artbin access uses a distinct confidential `worldview-service` principal,
short-lived 4orm client-credentials tokens, general `/api/assets` resources, and asset ID plus
SHA-256 pins; the public `worldview` PKCE client remains human-only. The filesystem `BlobStore`,
SQLite metadata store, and local compiler worker
are deployment adapters rather than browser authority. Project owners can manage editor and viewer
access from the project route for every 4orm user known to Worldview; only owners may enumerate
those users or mutate membership, and ownership transfer is deliberately outside this surface.
Hosted project and map identities are 12-character lowercase Nano IDs stored as their primary keys.
Browser routes use singular `/project/{id}-{name}/map/{id}-{name}` references: the bounded name
suffix is decorative and non-unique, while lookup and authorization use only the fixed ID prefix.
Renames therefore need no slug migration, and stale or omitted suffixes continue to resolve.
Personal folders,
checkpoint/history UI, deterministic loose-image WAD3 packing, build controls/history UI, and a
production multi-node room fleet remain follow-up hosted-product work; their tables and service
boundaries exist but they are not claimed as delivered UI.

Every visible editor DOM node and user-visible DOM property is React-owned. Presenters project
external state through typed snapshot ports rather than constructing or mutating UI. Stable refs
remain the boundary for canvases, focus/selection, pointer capture, measurement, native file inputs,
and dialog lifetimes; portals place modal and floating UI outside clipped layout without changing
React ownership. The detailed boundary and migration rule live in
[`react-ui-ownership.md`](./react-ui-ownership.md).

TanStack React Query owns pending/error lifecycle for asynchronous commands initiated by React UI.
It does not replace editor document, selection, history, camera, gesture, or GPU state. The viewer's
load, overview, walkability, and audio commands are mutations over its framework-neutral controller.
The editor root provides the same async boundary for project/build UI as those presenter surfaces
migrate; existing IndexedDB and compiler services remain outside React and cross through explicit
ports. React Doctor's cache-invalidation rule is disabled for these command mutations because they
do not read or own query-cached server data; adding fictional invalidations would obscure that
boundary. `npm run doctor` remains the reproducible advisory React audit.

The viewer and editor share GPU-independent Quake-family camera vectors and the same on-demand
`AnimationFrameScheduler`. The development viewer also uses the package-level `SnapshotStore` for
coarse application state. Public framework-neutral `SnapshotReader` and `selectSnapshot` contracts
derive lazy narrow subscriptions without adding React to the package; camera readout changes do not
wake the viewer's full control tree. The standalone viewer owns compiled BSP spawn and fallback
camera policy, including Quake and GoldSrc eye heights; the editor's compiled preview delegates to
that policy. Editable source rendering stays in `worldview-editor` because its four cameras, picking
IDs, tool overlays, and mutable source geometry have different ownership from the BSP/lightmap
renderer.

Both rendering packages use the same native TypeGPU boundary: TypeScript-authored GPU functions,
typed vertex and bind-group schemas, TypeGPU pipelines, uniforms, textures, samplers, and bind
groups. Raw WebGPU remains only at the deliberate command-encoding and bulk immutable vertex-buffer
upload boundary. The editor architecture gate rejects reintroduction of raw WGSL strings, shader
modules, pipeline layouts, bind-group layouts, or raw render-pipeline construction.

## Editor architecture

The ordered structural remediation work is tracked in
[`cleanup-plan.md`](./cleanup-plan.md). This product plan remains authoritative for intended
behavior and boundaries; the cleanup plan is the canonical execution and handoff document for
bringing the implementation into conformance.

The application entrypoint is composition-only. The Vanilla-to-React shell translation is
complete: React shell components are split into chrome,
dialogs, workspace, status, and focused inspector panels. React exclusively renders the live
document name, status/error message, compiler state, pointer context, and read-only document summary
from five narrow immutable stores. Presenters write those stores through typed ports; they never
also mutate the corresponding DOM nodes. Focused adapters intentionally retain direct ownership of
canvas input, project/files, commands, tool forms, materials, organization, build dialogs, WebMCP
registration, and session-to-view presentation. Those imperative seams are browser/controller
boundaries beneath the React shell, not a second UI framework or an unfinished vanilla application.
The resizable right inspector uses a compact Map, Entity, Face hierarchy: editable key/value data
and face projection controls lead each view, while operation groups and asset browsers remain flat,
dense, and separated by functional dividers instead of nested cards. The Face tab is a React-owned,
split workspace: a persistent tiled UV plane and always-visible projection controls sit above a
virtualized material browser, while WAD and palette sources live under Map resources. UV camera
movement is machine-local view state; projection gestures update locally on the next frame, publish
bounded collaboration previews independently, and commit exactly one `EditorSession` transaction.
The delivered behavior, ownership contract, and product-wide icon system are recorded in
[`face-inspector-plan.md`](./face-inspector-plan.md).

`EditorSession` is the singular transaction and history coordinator. Focused DOM-free domains own
selection/view state, object transforms, topology, geometry/CSG, entities/materials, and
organization. Viewport pointer input is routed through an ordered set of composed gesture
controllers for camera, clip, hull, face transfer, topology, transform, sweep, face, creation,
entity placement, and selection. One router owns the active gesture's explicit `begin`, `update`,
`commit`, and `cancel` lifecycle; GPU scene ownership stays outside controllers.
Document mutations, validation, derived queries, source parsing, and serialization remain separate
DOM-free modules.

Scene construction will become an assembler over focused solid, object-line, tool, entity, and
diagnostic contributions so invalidation can rebuild only affected buffers. Presenters already
receive narrow state, UI, collaborator, and callback dependencies from `EditorApplication`; an
architecture check prevents a presenter from importing that composition container again. Physical
`viewport`, `scene`, `materials`, project/persistence, and core-domain subdirectories follow those
ownership changes. The pinned behavior and architecture comparison is recorded in
[`trenchbroom-conformance.md`](./trenchbroom-conformance.md).

The browser shell gives the viewports visual priority. A compact top command bar keeps frequent
Home, New, Save, Undo, Redo, Source, and Compile actions visible, while short accessible menus hold
open/create, recovery, build-result, and other document commands. Editing modes occupy a single
vertical rail beside the viewports; applicable selection commands appear contextually, with grid,
texture-lock, visibility, and uncommon edit controls anchored at the rail's foot. Document and
build-profile selectors retain text where context matters. Every icon action keeps an accessible
text name, keyboard path, focus treatment, descriptive tooltip, and stable presenter action
contract. Phosphor is the one application-wide icon family behind a typed semantic registry; raw
library names and copied or unrelated icon dialects do not leak into feature components. Original
map-editor-specific icons are permitted only when the family has no suitable semantic symbol and
must follow the same optical, accessibility, theme, and license rules. The hierarchy simplifies
scanning without removing editor capability.

Source viewport navigation follows the TrenchBroom editing model: once a viewport has keyboard
focus, focus follows the pointer between source panes; orthographic panes share zoom and synchronize
their common pan axes. Inspector and dialog focus is never stolen merely by crossing a viewport.
The desktop four-view layout uses TrenchBroom's default balanced 2×2 arrangement with Perspective
in the upper-left, Top in the upper-right, Front in the lower-left, and Side in the lower-right. Its
row, column, and inspector boundaries are directly resizable with pointer or keyboard handles and
enforce usable minimum sizes. A two-axis handle at the central row/column junction adjusts both
viewport splits in one pointer drag, with directional arrow-key control as its keyboard equivalent.
The Perspective header can expand its pane across the full viewport workspace; while expanded, the
renderer suspends all orthographic render passes instead of merely hiding their canvases.
Each map has a machine-local viewport workspace snapshot containing all four cameras, the row,
column, and inspector splits, and Perspective-only mode. This small, non-authoritative display state
is validated and written to `localStorage` after a short debounce, flushed when leaving the page,
and restored synchronously after that map opens. It never enters map source, recovery history, or
the collaboration protocol, so another collaborator retains their own viewpoint and layout.
The default Select tool is likewise a permanent controller stack: clicks select, selected objects
move or resize, and a left drag creates the configured simple shape whenever the selection is empty.
Orthographic and perspective construction bounds align component-wise to the active power-of-two
grid. Radiant-compatible number keys 1–9 select 1–256 unit grids, brackets step the grid, and an
undoable Snap to grid command repairs all selected brush vertices or the vertices of selected faces
while rejecting degenerate convex results.
All four source viewports render the world coordinate system through the shared theme: X is red, Y
is green, and Z is blue. Perspective shows all three origin axes, while each orthographic viewport
shows the two axes in its visible plane above the ordinary construction grid.
Brush drawing is not exposed as a separate modal toolbar mode. Shift-resize can acquire the hidden
adjacent face from a narrow screen-space band outside a selected brush's silhouette, while direct
face hits and ordinary internal edges retain their normal priority.
Ctrl/Command-wheel reversibly drills through overlapping object candidates in every viewport;
adding Shift drills through depth-ordered face candidates. Candidate traversal wraps, retains the
normal perspective-depth or orthographic-smallest-area ordering, and does not alter the document.
Hovering an object in the current selection adds the combined selection bounds and outward,
softly-fading corner guides in the perspective viewport only. Orthographic panes keep their
continuous construction grid instead of duplicating these guides.

Editor theming has one CSS-owned color source. Shell, panel, inspector, dialog, border, SVG, and
viewport-chrome colors consume custom properties whose concrete palette values use OKLCH. The app
uses semantic surface, border, text, state, overlay, and focused UV roles rather than encoded source
color names; translucent states derive from those roles with OKLCH color mixing. The app
resolves semantic `--renderer-*` properties through the browser color engine and injects a typed RGB
theme into the framework-neutral WebGPU renderer; source rendering and compiled-preview clear colors
therefore follow the same theme without importing DOM or CSS APIs into the package. The shell exposes
persistent System, Dark, and Light choices; runtime changes rebuild color-dependent GPU buffers but
preserve the document, selection, camera state, and undo history.

Pre-editor routes and editor chrome share the same compact, geometric interface language through
React-owned Worldview primitives backed by React Aria Components for conventional control,
focus/keyboard, menu, overlay, and dialog behavior. Worldview retains its two-pixel visual language
and semantic CSS variables; React Spectrum styling is not used. The development-only `/design`
specimen shows both palettes and every control state alongside forms, menus, project states, and
representative editor chrome. Inspector tabs, theme selection, surface flags and values, and live
collaboration are the first editor surfaces using the tabs, listbox, number-field, checkbox, and
modal primitives through typed snapshot ports. Native CSS remains the styling foundation so the UI and WebGPU theme
bridge use one inspectable token model rather than parallel utility or CSS-in-JS systems. The full
control contract and ordered rollout live in [`interface-system.md`](./interface-system.md).

Renderer solids are partitioned by material and spatial cell. Structural-sharing signatures reuse
unchanged GPU buffers across revisions, conservative frustum tests skip invisible batches, and an
immutable median-split AABB index supplies broad-phase picking and region queries. Dense documents
avoid generating unselected projected face grids. Immutable-document query indexes memoize brush,
group, layer, and entity-link geometry. Static world edges remain resident across selection, hover,
tool, group, link-mode, and diagnostic changes; those states draw through a separate compact overlay
buffer. Document/reference/visibility/theme changes rebuild the scene index, but immutable per-brush
edge and solid sources survive document revisions. The renderer repacks and uploads only the
512-unit spatial batches containing changed brushes, then frustum-culls those batches per viewport.
This stays inside the native TypeGPU architecture: TypeGPU owns schemas, shaders, bind groups, and
pipelines, while immutable batch uploads use the deliberate raw WebGPU interoperability boundary.
Each viewport redraws only when its camera, dimensions,
grid, or the shared scene version changes. Material catalog changes retain GPU textures and bind groups for
unchanged immutable material entries and replace only changed or removed names. Editor viewports
render into four-sample color and depth targets before resolving to each canvas. World and overlay
segments expand into pixel-width triangle strips in the TypeGPU vertex stage, giving stable
antialiased edges independently of camera distance. Grid, ordinary-edge, and interaction-overlay
draws use distinct screen-space widths so construction lines stay subordinate during close camera
movement. The line vertex stage clips segments against the camera near plane before screen-space
expansion, preventing long perspective-grid segments from becoming oversized quads during a close
dolly. Orthographic grids are generated directly in a
derivative-antialiased fragment pass; the displayed interval promotes by powers of two below an
eight-pixel readability threshold without changing the active snap size. The application schedules
frames on demand and runs continuously only
during fly-camera movement. All invalidated viewport passes encode into one command buffer and use
one queue submission per editor frame. Pipeline compilation uses WebGPU's asynchronous API, the
editor requests the high-performance adapter preference, and unexpected device loss becomes a
visible recoverable-by-reload error instead of a silently frozen canvas. Performance measures cover
scene rebuild, change presentation, and material-catalog reconciliation.

## Public editor contracts

### Format-ready document model

The editor distinguishes game profiles, document formats, and face syntax. `MapDocument.format`
identifies the source container (`quake-map` today), while `MapDocument.faceSyntax` records the
classic Quake or Valve 220 serialization policy. Face texture projections carry an explicit
`axial` or `valve-220` kind even though both currently expose the canonical world-space axes used
by geometry and texture tools. This prevents future Quake 2, idTech 3, and VMF support from turning
a texture-projection choice into a false document-format abstraction.

Game-profile labels, accepted face syntaxes, WAD versions, definition formats, and defaults have
one canonical typed registry in `worldview-editor`. Application routes and compiler/project
decoders consume its validation functions rather than repeating Quake/GoldSrc string branches.
Entities own a closed `MapPrimitive` union rather than a brush-only collection. Convex brushes,
idTech 3 `patchDef2` surfaces, and idTech 3 `brushDef` brushes are semantic variants with stable IDs.
Patches tessellate through a format-neutral geometry boundary and brush definitions adapt into the
canonical convex geometry view for rendering. Selection, CSG, face editing, topology tools, and the
collaboration baseline remain deliberately brush-only; each boundary narrows by primitive kind
instead of pretending every command applies to every primitive. Primitive IDs share one document
namespace so lookup, cloning, and future cross-format references cannot collide by variant.

Document source lifecycles are routed through a closed, typed codec registry keyed by
`MapDocumentFormat`. The Quake-map codec owns normalized parsing, retained-source parsing,
serialization, structure-preserving save planning, and source rebasing. Adding another container
therefore creates one compile-time registry obligation instead of scattering profile or extension
checks through application code. The registry is deliberately static; runtime codec plugins are
not part of the current product contract.

Editor session behavior is layered by responsibility. Entity creation and brush/entity ownership
live above brush geometry operations, so future non-brush primitives do not force entity-definition
and layer policy into the geometry implementation.

### Source-safe map model

`@jackharrhy/worldview-editor/core` exports `parseMapSource`, `MapSourceState`,
`MapSourceDiagnostic`, `planMapSave`, and the discriminated `MapSavePlan`. Existing `parseMap` and
`serializeMap` remain available for deliberately normalized workflows.

The source state retains original bytes, tokens/spans, comments, whitespace, property ordering,
face syntax, and opaque unsupported constructs beside the semantic `MapDocument`. The tokenizer
accepts `//` and QuArK-style semicolon line comments and treats recognized format headers as syntax
metadata. Full-document parsing accepts structurally valid entity collections; playable-world
requirements such as a first, unique `worldspawn` are live editor issues rather than grammar rules.
An explicit fragment parser handles root-level primitive blocks used by clipboard/interchange paths.
Unknown nested primitive families remain opaque and byte-preserved instead of being mistaken for
classic brushes.

A save plan patches changed regions and preserves untouched bytes. Unedited files round-trip
byte-for-byte; new nodes infer enclosing style; new files use Valve 220. Unchanged `patchDef2` and
`brushDef` blocks survive structure-preserving property edits, while unsafe mutation or deletion is
blocked until those primitives have retained subspans. Normalized export serializes their semantic
forms. Classic axial projection uses a small deterministic dominant-axis tolerance so harmless
plane rounding cannot flip texture bases. Normal Save is blocked when an opaque construct cannot be
safely reanchored. **Export normalized copy** is separate and never overwrites the original.

### Projects and local state

`WorldviewProjectManifest`, `parseWorldviewProject`, and `serializeWorldviewProject` define
versioned `worldview.project.json` files. Version 1 contains project name, `quake`, `goldsrc`, or
`quake2` profile, relative map roots, ordered relative WADs and loose material roots, optional
palette/sprite roots, ordered FGD/DEF/ENT definition files, logical preview/final build profiles,
and defaults.

Absolute/executable paths, directory handles, credentials, binary assets, UI layout, cameras, and
helper bindings are machine-local. Chromium directory handles and logical-profile-to-capability
mappings live in IndexedDB. Relative paths are containment-checked before access, and project
resource order is deterministic.

Recovery records committed changes after a 500 ms debounce and flushes on page hide. It retains 20
unprotected automatic versions plus protected manual checkpoints, pruning oldest unprotected
records under normal and quota-pressure writes. A newer recovery record prompts restore/discard;
restore is one undoable document replacement and never writes a `.map`. Persistent storage failure
is visible and non-destructive.

Before file-handle writes, the editor compares the original source fingerprint with current disk
bytes. External changes block overwrite and offer reload or Save Copy. Downloads do not claim a
confirmed filesystem write.

### Game-aware entities and resources

FGD, Quake DEF, and ENT inputs converge on `EntityDefinitionCatalog`: point/brush class,
inheritance, descriptions, bounds, colors, defaults, choices, spawnflags, angle/vector/target
fields, and resource references. Malformed definitions produce located diagnostics. Unknown
classes and keys remain raw-editable. Ordered WAD/definition resolution is deterministic and
missing or moved resources remain visible diagnostics. Independent browser file reads may run in
parallel, but catalog imports and returned sprite order still follow manifest precedence.

Available GoldSrc SPR2 resources render in source view. Missing or corrupt sprites fall back to
definition-colored bounds. Quake MDL and GoldSrc studio-model rendering remain deferred.

Version 1 projects resolve loose WADs, palettes, definition files, and sprite roots. They do not
mount PAK archives or extract textures embedded in BSPs. A project built from an installed Quake
game therefore needs a loose mapper WAD or an explicit external extraction step; that limitation
must stay visible rather than being mistaken for a missing-texture parsing failure.

### Builds and launch

`MapBuildService`, `MapBuildCapabilities`, compile/launch request and result contracts, and typed
BSP/portal/leak artifacts form the browser/helper boundary. Results include status, build ID,
structured diagnostics, complete bounded logs with truncation metadata, expected revision, and
available artifacts.

The helper advertises configured compile and launch capabilities. Browser requests contain safe
profile IDs, source/assets, and expected revision—never commands or filesystem/executable paths.
Origins and profiles are validated; cancellation, timeouts, and stale revisions are explicit.
Failed or stale builds never replace the active BSP preview. Successful current builds can be
launched externally through a configured launch capability. IndexedDB retains a quota-aware 20
build records per map, and the diagnostics dialog can inspect historical records.

### Live site authoring tools

When `document.modelContext.registerTool` exists, the editor registers semantic WebMCP tools for
live inspection, bounded object/material/source queries, selection and framing, tool activation,
undoable transforms, material and entity-property edits, object creation/duplication/deletion,
history, explicit source replacement, and opening a map from an already authorized project. Tool
handlers call the same presenters and `EditorSession` commands as visible controls; they do not
duplicate geometry logic or expose renderer internals.
Tool registration receives the editor application's abort signal, which unregisters the native
tools when the route is released; guarded handlers and abort-aware project reads prevent stale or
in-flight calls from mutating a disposed editor.

Every document edit carries the document ID and revision observed by the caller and rejects stale
requests. Results return the new identity/revision and enough live state to verify the visible change. Source replacement
detaches file ownership and requires an explicit destructive confirmation; project-map switching
requires explicit permission to discard dirty state. These tools do not save files, launch external
programs, accept executable paths, or bypass normal browser safety review. Unsupported browsers
feature-detect to a no-op while keeping the complete visual workflow.

## Data flow

1. A new/imported/file-backed `.map` is parsed into source state plus semantic `MapDocument`.
2. Visible controls or a registered site tool call focused presenters; `EditorSession` commands
   derive and validate candidates, then atomically commit one document and history entry.
3. Presenters update narrow React shell stores, remaining imperative inspectors, site-tool
   verification state, and renderer state; derived geometry, spatial indexes, and GPU batches are
   disposable caches.
4. Recovery snapshots source state after commits. Save planning patches original source regions;
   a file-backed save first rechecks disk fingerprint.
5. A project manifest resolves ordered browser-local resources and logical build profiles.
6. A build request sends a compile snapshot and expected revision to a configured local
   capability. Only successful, current results replace preview; diagnostics and artifacts remain
   inspectable in history.
7. In optional collaboration mode, a validated local commit first enters the IndexedDB outbox and
   then the map protocol. An available `MapCell` persists, validates, orders, acknowledges, and
   broadcasts the semantic operation. Local maps remain fully offline without a service. A dirty
   hosted map automatically reconciles only within a bounded reconnect grace window; once elapsed
   time, operation count, or encoded bytes exceed that window, the browser preserves the work as a
   detached local copy and stops automatic room replay.

No compiled artifact, renderer cache, browser handle, or machine-local helper binding flows back
into canonical `.map` geometry or the portable project manifest.

## Optional collaboration mode

Collaboration wraps validated `EditorSession` commits and leaves solo editing unchanged. Local maps
and projects remain fully functional offline for an unbounded duration. A hosted team map remains
editable through a short interruption and keeps committed work in a local IndexedDB outbox. The
initial dirty-reconnect grace is 15 minutes and is also bounded by queued operation count and encoded
bytes. A clean disconnected hosted tab may adopt the latest room at any later time; a dirty tab that
exceeds a bound becomes an explicit local working copy whose stale outbox is not replayed
automatically. Worldview preserves and exports that work but does not distort the room architecture
to promise indefinite multi-master hosted reconciliation.

Durable semantic operations and ephemeral presence use separate channels; pointer/drag previews,
cameras, selections, GPU state, and local commercial/shareware resources are never canonical room
state. Local gesture candidates render before any network acknowledgement. Multiplayer presence
retains only the newest immutable candidate and derives its semantic preview at a bounded 30 Hz, so
collaboration work cannot create an unbounded pointer-event backlog.

Public collaboration is available only to hosted maps. A 4orm-backed Worldview session must have a
project role before the application service issues its short-lived room ticket; the room Worker
rejects non-hosted rooms and invalid tickets. Local maps remain offline and never contact the room
service. Local and remote brush selections share one renderer treatment: real materials remain
visible beneath a restrained participant-colored face tint, visible edges remain crisp, and a
translucent depth-independent edge pass preserves the complete silhouette behind other geometry.
Colored presence overlays show selections, world-space pointers, active viewports, and
in-progress transform, face, topology, and creation candidates. Those candidates travel as lossy
sequenced semantic patches and never become document, history, outbox, or persisted room state.

The preferred room-runtime experiment targets the Cloudflare Workers/Durable Objects API with one
named `MapCell` per collaborative map, private SQLite, and hibernatable WebSockets. [celld](https://celld.dev/)
is the preferred self-hosted runtime; workerd/Cloudflare execution remains a compatibility oracle
and optional target so the protocol is not vendor- or celld-specific. The room persists accepted
operations before acknowledgement/broadcast and reconstructs all important state after hibernation.

celld supplies placement, single-writer room coordination, SQLite durability, and WebSocket
lifecycle; it is not a CRDT or conflict policy. The fixed 8,000-brush bake-off selected the domain
operation/rebase layer for V0 over Yjs and Automerge; the benchmark remains executable so that
decision can be revisited. Brush geometry begins as an atomic validated conflict boundary, and
personalized undo commits conditional inverse operations instead of rewinding global state.

The complete architecture, alpha-runtime caveats, security boundary, research references, and
delivery gates are recorded in [`collaboration.md`](./collaboration.md).

## Format expansion direction

Format expansion is an end-to-end product capability, not a parser checkbox. A format or game is
delivered only when its licensed corpus coverage, semantic document model, source-safe lifecycle,
rendering, project resources, definitions, editing boundaries, and build/preview workflow agree.
Source `.map` authoring and compiled BSP viewing are separate milestones: supporting one never
implies the other.

### Current baseline

- Quake source authoring is delivered in classic axial and Valve 220 face syntax. GoldSrc authoring
  and Quake BSP29/GoldSrc BSP30 static preview are delivered.
- `MapDocumentFormat`, `MapFaceSyntax`, game profiles, the document-codec registry, and the closed
  `MapPrimitive` union are the extension boundaries. Format branches must not leak into generic
  geometry, history, project, or application-shell code.
- idTech 3 `patchDef2` and `brushDef` are semantic, stable-ID primitives. They parse, preserve,
  normalize, clone, derive render geometry, and render. They are not yet selectable or editable,
  and Quake III is therefore not a delivered game profile.
- Unknown nested primitive families remain opaque and byte-preserved. Unchanged patch and brush
  definition blocks survive surrounding source edits; unsafe primitive mutation remains blocked
  until retained subspans make it structure-preserving.

### Ordered delivery

1. **Quake II profile and source compatibility.** Add Quake II surface/content/value semantics,
   entity definitions, texture/resource conventions, project defaults, compiler profiles, and
   licensed corpus fixtures. Reuse the Quake-map codec unless evidence requires a distinct syntax;
   do not create a nominal codec for a game-profile difference. Acceptance requires exact no-op
   saves, normalized reparse, representative editable brushes, resource resolution, and a configured
   compile/preview loop.
2. **Quake III source authoring.** Add the Quake III profile, shader/material discovery, definitions,
   project/build conventions, and corpus coverage. Promote patches and brush definitions into honest
   editor objects: picking, selection, transforms, duplication, deletion, visibility/locking,
   layers/groups, clipboard, undo/redo, source-safe mutation, and collaboration must either support
   each primitive or reject it through an explicit typed boundary. Patch control-point editing is a
   focused tool, not a special case inside brush topology code.
3. **Quake III compiled preview.** Add BSP46 parsing, materials, visibility, lightmaps, and collision
   to the viewer as a separate capability. Editor source state must never depend on compiled BSP
   structures. Openly licensed BSP fixtures and visual/test-oracle comparisons are required.
4. **VMF and Source profile.** Add a distinct VMF document codec rather than translating VMF text
   through Quake-map syntax. First deliver solids, sides, entities, stable IDs, connections, and
   source-safe round trips; then add Source-specific variants such as displacements and visgroups.
   Unsupported VMF blocks remain retained and saving stays blocked when safe reanchoring is
   impossible. Source BSP support is a later, independent viewer milestone.
5. **Cross-format surface tools.** Only after Quake III patches and VMF displacements have separate,
   correct semantics should shared control-surface UI or geometry abstractions be extracted. Similar
   rendering does not justify erasing their different topology, material, and serialization rules.

### Format acceptance gates

- Every corpus fixture has confirmed redistribution terms; ignored local corpora may broaden smoke
  coverage but cannot become package contents accidentally.
- Exact-source no-op, normalized serialize/reparse, stable-ID rebase, malformed-input diagnostics,
  and unsupported-construct preservation have focused tests.
- All generic traversals use the primitive union; brush-only commands narrow by `kind` without casts.
- New adapted implementation sources are license-compatible and recorded before merge. GPL editor
  and engine repositories—including WifeRadiant—remain behavior, architecture, and test oracles only.
- The full `npm run check` gate passes, along with real-browser loading/rendering evidence for every
  newly claimed authored or compiled format.

## Delivery milestones

| Milestone                         | Status      | Delivered evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Architecture hardening         | In progress | The Vanilla-to-React shell translation, Strict Mode roots, effect-free callback-ref lifetimes, React Query command state, narrow shell stores/ports, presenter dependency injection, composed viewport gesture routing, shared frame/camera runtime, domain modules, declarative runtime schemas, split document/CSS/TSX, and architecture gates are delivered; focused scene contributions remain                                                                                                                                                                                                                                              |
| 2. Source and persistence safety  | Complete    | Source-backed save planner, project manifest/directory workflow, external-change guard, recovery/checkpoints, safe fallback exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3. Game-aware authoring           | Complete    | Quake/GoldSrc profiles, ordered resources, FGD/DEF/ENT catalog, typed inspectors/browser, definition bounds/colors, SPR2 previews                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4. Daily build loop               | Complete    | Safe helper capability protocol, structured diagnostics/logs, revision-safe BSP preview, leak/portal overlays, retained history, configured launch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5. Scale and dependable-solo gate | Complete    | Indexed document queries, per-viewport invalidation, incremental solid-buffer reuse, frustum culling, dense-grid limits, runtime measures, generated 8,000-brush CPU and Chromium gates                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 6. Collaboration foundation       | Complete    | Typed domain operations, seeded three-replica convergence, IndexedDB outbox, multi-tab and reconnect transport, conditional personalized undo, ticketed hosted-map UI, participant presence, Yjs/Automerge/custom bake-off, and a bounded SQLite-backed hibernating `MapCell` pass local Workers-runtime gates plus a live celld/Azurite deploy, WebSocket operation, `SIGKILL`, empty-local-state recovery drill; multi-node/outage/backup fleet hardening remains; solo mode has no service dependency                                                                                                                                        |
| 7. Hosted project foundation      | In progress | Newport deployment, 4orm identity, short readable project/map references, owner-only editor/viewer membership management for Worldview-known users, role-matrix integration tests, single-authority MapCell source/checkpoints, signed hosted-map access, Artbin pinned mounts and cached WAD loading, editor-integrated hosted BSP builds with authenticated content-addressed artifacts, persistent per-user/global build admission, bounded queues/payloads/artifacts, ingress throttles, collaboration socket/frame/edit limits, and compiler cgroup/time limits are delivered; folder/history UI and multi-node map-fleet hardening remain |
| 8. Format expansion               | In progress | The Quake II profile, WAL decoding/resource resolution, profile-aware surface authoring, project material roots, DEF/ENT loading, q2tools helper compilation, DOM-free BSP38 static geometry/lightmaps/materials, revision-safe compiled preview, synthetic source-lifecycle coverage, and pinned local corpus smokes are delivered. BSP38 collision/PVS and packaged WAL lookup remain; Quake III authoring, BSP46 preview, and VMF follow in the ordered stages above                                                                                                                                                                         |
| 9. After dependable solo          | Deferred    | Collision-aware editor walk mode and the remaining explicitly deferred features listed under Product boundaries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Worker parsing/catalog work and list virtualization remain available optimizations rather than
mandatory architecture: the fixed scale gate passes without them, so the roadmap's “as required”
condition has not been met.

## Acceptance and regression gates

`npm run check` is the required static, architecture, formatting, lint, type, unit, build, consumer,
and package gate. Editor behavior is exercised by 71 Chromium scenarios in
`tests/browser/editor.spec.ts`.

Focused suites cover:

- Source preservation and unsafe reanchoring: `packages/worldview-editor/test/map-source.test.ts`.
- Project validation and ordered resources: `worldview-project.test.ts` and
  `apps/editor/test/project-workspace.test.ts`.
- Filesystem conflicts and machine-local handles: `project-files.test.ts` and
  `project-local-state.test.ts`.
- Recovery, quota pressure, and protected checkpoints: `document-recovery.test.ts`.
- Definitions and malformed inputs: `entity-definitions.test.ts`.
- Build contracts and artifacts: `build-artifacts.test.ts`, `build-history.test.ts`, and
  `apps/compiler-service/test/compiler.test.ts`.
- Gesture state ownership: `gesture-controller.test.ts`.
- Spatial correctness and generated scale: `spatial-index.test.ts` and
  `scale-benchmark.test.ts`.
- Real-map viewport safety: file-open document framing, sub-threshold orbit stability, and explicit
  missing-material coverage in `tests/browser/editor.spec.ts`.
- WebMCP authoring: native-API fallback, registration, inspection, visible selection/tool/camera
  changes, undoable edits, stale-revision rejection, and history in `tests/browser/editor.spec.ts`.

The generated fixtures are supplemented by an ignored, local compatibility corpus. On 2026-08-25,
all 63 GPL-republished [original Quake map sources](https://rome.ro/resources) parsed without
diagnostics and round-tripped byte-for-byte (43,988 brushes total). All 54 maps in the
[LibreQuake mapper archive](https://github.com/lavenderdotpet/LibreQuake/releases) also parsed and
round-tripped byte-for-byte (92,492 brushes total); its largest production map contains 7,710
brushes. That 8,082,853-byte map opened visibly in 0.90 seconds with 1,928 resolved textures and
110 entity definitions; its only issue was a genuine empty layer, and a brush edit followed by undo
restored the exact original source hash and byte count. The pinned TrenchBroom Quake FGD parsed all
111 declarations without diagnostics.

GoldSrc coverage includes 42 maps from the MIT-licensed
[Half-Life Unified SDK assets](https://github.com/twhl-community/halflife-unified-sdk-assets/tree/38d1718cae8a1b867fa0f1e65a11f6ec74a1dc2f)
(1,883 brushes and 321 primary FGD definitions). A local PrimeXT checkout at `46fb05b4` adds 15 maps,
6,589 brushes, a 6,150-brush terrain map, 290 unique FGD definitions, and 80 textures from three
WADs as a behavior-only oracle because no repository license was identified. These third-party test
assets remain outside the repository under `apps/viewer/public/local`.

The fixed performance command is `npm run test:editor-performance`. It generates an 8,000
six-face-brush map, runs Chromium at 2560×1440/DPR 1 on the reference development Mac, and asserts:

- editable within 3 seconds;
- common translate, material, and undo commits below 100 ms each;
- 180 interactive frames with p95 frame time no worse than 33 ms.

The gate passed on 2026-08-25. The Playwright test attaches its measured JSON report and remains
opt-in so ordinary browser tests do not pretend that shared CI hardware is the recorded reference
machine.

The same gate also runs as a headless portability drill. On 2026-08-28, Linux Chromium 149 with
SwiftShader loaded the 8,000-brush map in 2.25 seconds, kept translate/material/undo dispatch at
0.6/43.4/33.3 ms, and sustained a 16.8 ms p95 frame interval. The drill found and removed a
SwiftShader mapped-buffer size failure: immutable scene vertices now use ordinary
`VERTEX | COPY_DST` buffers with `queue.writeBuffer`, consistent with the renderer's dynamic upload
paths. Encoding the four viewport passes into one command buffer reduced dense-map material and undo
presentation by roughly 20–25% in the same local before/after drill. This remains a portability data
point rather than a replacement for the reference-hardware gate.

A follow-up retained-edge drill measured single-brush selection in the same 8,000-brush document at
12.0 ms versus 19.4 ms with world-buffer reuse disabled. The performance gate now records and caps
selection independently so future scene refactors cannot hide selection latency inside load timing.

On 2026-08-29, spatial source retention removed full-map edge and solid reconstruction from
single-brush document edits. The native Linux GPU drill loaded the 8,000-brush fixture in 2.19
seconds, measured selection/translate/material/undo at 12.5/0.7/56.0/37.0 ms, and sustained a 16.8
ms p95 frame interval. Focused batch tests assert that unchanged CPU vertex sources and GPU buffers
are retained, while a changed source replaces only its containing spatial batch.

GitHub-hosted CI keeps browser coverage deliberately bounded: `npm run test:browser:ci` runs a
serial smoke set for routing and a real WebGPU-backed WebMCP edit/undo after the complete static,
unit, build, package, and collaboration gate. Serial execution avoids competing SwiftShader devices
on the small shared runner. `npm run test:browser` remains the full 90-test editor and viewer suite
for the prepared Linux GPU host, while `npm run test:editor-performance`, local compatibility
corpora, and `npm run test:collaboration-celld-live` remain explicit host verification rather than
pretending shared CI hardware is a renderer or infrastructure reference machine.
