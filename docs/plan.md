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

The following boundaries are enforced:

- `packages/worldview/src/core` has no DOM, WebGPU, or TypeGPU imports.
- `packages/worldview-editor/src/core` has no DOM imports.
- Applications consume public package entrypoints instead of package internals.
- React is an application dependency, not an editor-engine or viewer-core dependency.
- TypeGPU owns schemas, shaders, pipelines, bindings, textures, and samplers. Raw WebGPU is limited
  to command encoding and bulk immutable buffer upload.
- npm workspaces and the committed `package-lock.json` define the dependency graph.
- Hand-written TypeScript, TSX, and CSS under the editor app and package stay below the repository's
  enforced file ceiling.

## Editor architecture

### State and transactions

`EditorSession` is the only authority for document changes and history. It is a stable facade over
one session kernel and focused command domains for organization, selection, transforms, topology,
entities, clipboard operations, materials, and commits. Direct actions, repeated commands, remote
operations, and WebMCP calls all reach the same validation and transaction boundary.

Pointer gestures have one owner at a time. The viewport gesture router selects a focused camera,
selection, transform, topology, face, clip, hull, sweep, creation, or placement controller. The
accepted controller owns begin, update, commit, and cancel. Gesture controllers do not own GPU
resources or bypass the session.

High-frequency camera, pointer, preview, and GPU state stays outside React. Immutable application
snapshots cross into React through narrow external-store ports. The initiating client renders a
preview immediately; collaboration transport never sits in the local feedback path.

### React and routing

React owns visible application DOM. Presenters expose immutable snapshots and typed commands; they
do not create elements, query controls, or project state by mutating DOM nodes. Stable refs are
reserved for canvases, renderer overlays, focus and selection, pointer capture, measurement, native
file inputs, and dialog lifetimes. The detailed rules live in
[the React ownership contract](./react-ui-ownership.md).

The editor uses React Router v7 Data Mode. The home route loads local and authorized hosted work
without importing the editor, renderer, WebMCP, compiler, collaboration, or editor styles. The
new-map route may warm the lazy editor graph, but only an editor route constructs presenters or asks
for WebGPU. The editor bundle may be substantial; keeping it out of the landing route matters more
than an arbitrary size target once editing begins.

React Aria Components provide conventional control behavior. Worldview owns component composition,
semantic CSS variables, density, iconography, and renderer colors. The canonical visual and control
rules live in [the interface system](./interface-system.md).

### Source rendering

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
state.

Quake II assets use logical, case-insensitive paths below a game root. An embedding application can
provide explicit sources, a resolver, or a base URL. Archive mounting and installation policy stay
outside the renderer. [Viewer API](./viewer-api.md) owns consumer examples, while
[Quake II compatibility](./quake2-compatibility.md) owns format evidence and the exact supported
boundary.

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
logs, diagnostics, artifacts, and the source fingerprint. A stale result remains inspectable but
cannot replace the current compiled preview. Browsers never provide arbitrary executable paths,
commands, or hosted build source.

### Browser persistence

One typed IndexedDB database owns local projects, recovery, checkpoints, resource metadata, and the
hosted operation outbox. Browser persistence is authoritative for local work and recovery-only for
hosted work. Viewport cameras, pane sizes, and expanded-pane state are small per-map local
preferences and never enter source, history, or collaboration.

Zod schemas validate data at network, storage, clipboard, project-file, compiler, WebMCP, and other
trust boundaries. Owned formats reject unknown fields. External OAuth and asset-provider responses
may discard provider additions while preserving bounded required fields. Validation does not run in
document, gesture, or render hot paths.

## Hosted projects

Hosted projects are peers of local projects, not a replacement. The same-origin service owns
application sessions, project metadata, membership, resource mounts, build admission, and signed
realtime tickets. It authorizes a request before touching a map cell, compiler, Artbin, or blob
store.

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

Repository-wide test tiers and host requirements live in
[the verification guide](./verification.md). GPU performance, local game corpora, and live celld
recovery drills run explicitly on hosts that can provide meaningful evidence.

The current user-visible result and its verification entrypoints are summarized in
[editor capabilities](./editor-capabilities.md). Local viewer fixture setup belongs in the
[development viewer README](../apps/viewer/README.md).

Adapted source must be license-compatible and recorded in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) with focused source comments. Commercial or
shareware BSP, WAD, PAK, palette, sprite, model, texture, and sound data stays in ignored local
directories and never enters repository gates or release artifacts.
