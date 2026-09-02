# Worldview editor capabilities

This is the current behavior reference for the editor. [`plan.md`](./plan.md) owns product scope and
architecture; [`cleanup-plan.md`](./cleanup-plan.md) owns unfinished work. This document
describes what a user can do now, without preserving the order in which features were implemented.

Status terms:

- **Delivered** — implemented with focused automated coverage.
- **Partial** — useful today, with a named missing boundary below.
- **Deferred** — intentionally outside the current baseline.

## Workspace and source

| Capability                 | Status    | Current behavior                                                                                                                                                           |
| -------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New maps                   | Delivered | Creates an empty `worldspawn`; Valve 220 is the default and classic Quake syntax is preserved until explicit conversion.                                                   |
| Map parsing and saving     | Delivered | Structure-preserving source state retains comments, whitespace, property order, syntax, and opaque constructs. Unsafe rewrites are blocked; normalized export is separate. |
| Local projects             | Delivered | `worldview.project.json` describes profile, map/resource roots, definitions, and logical build profiles. Directory handles and executable bindings stay browser-local.     |
| Hosted projects            | Delivered | Private 4orm-authenticated projects and maps use short readable routes, role enforcement, authoritative room persistence, Artbin mounts, and server-owned builds.          |
| Recent work                | Delivered | The home route lists browser-local and authorized hosted work without loading the editor bundle.                                                                           |
| Recovery                   | Delivered | Debounced IndexedDB recovery, protected checkpoints, retention, quota handling, and external-file conflict checks avoid destructive overwrite.                             |
| View workspace persistence | Delivered | Per-map 2D/3D cameras, pane layout, inspector width, and expanded perspective state persist as local view preferences.                                                     |

## Interface and viewports

| Capability             | Status    | Current behavior                                                                                                                                                                            |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application UI         | Delivered | React owns visible DOM through typed snapshots and commands. React Aria Components supply interaction behavior; Worldview CSS and semantic variables supply dark/light presentation.        |
| Layout                 | Delivered | Perspective, Top, Front, and Side use a resizable 2×2 layout. Shared splitter intersections move both axes; the perspective pane can expand alone without rendering hidden panes.           |
| Rendering              | Delivered | Native TypeGPU renders textured perspective geometry, orthographic wireframes, grids, axes, entities, references, diagnostics, and tool overlays through one command submission per frame.  |
| Scheduling             | Delivered | Rendering is invalidation-driven and continues only for active camera or animated-material work. Visibility and device-loss lifetimes are explicit.                                         |
| Navigation             | Delivered | TrenchBroom-style right-drag look, Alt-right orbit, middle pan, wheel travel, fly keys, focus, linked 2D pan/zoom, pointer-centered zoom, and persisted cameras.                            |
| Grid                   | Delivered | Power-of-two grid selection uses number keys and brackets. Creation, movement, implicit 2D depth, vertex/face snapping, perspective face grids, and world-axis lines share the active grid. |
| Themes and icons       | Delivered | Dark and light themes drive DOM and renderer colors through semantic CSS variables. A typed Phosphor registry is the single browser icon source.                                            |
| Shortcut customization | Deferred  | Shortcuts are currently fixed and browser-safe. A preference system must resolve conflicts by viewport and tool context.                                                                    |

## Selection and object transforms

| Capability         | Status    | Current behavior                                                                                                                                                                                   |
| ------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Object picking     | Delivered | Perspective uses depth; orthographic views use smallest projected face/bounds with depth as a tie-breaker. Point entities, groups, hidden, locked, and filtered objects participate consistently.  |
| Candidate drilling | Delivered | Modifier-wheel cycles object candidates; an additional modifier cycles faces. Candidate order wraps without moving the camera.                                                                     |
| Set selection      | Delivered | Add/toggle, paint, rectangle/lasso, Select All, Invert, brush-entity sibling expansion, and touching/enclosed selection volumes are supported.                                                     |
| Transform preview  | Delivered | Move, duplicate-move, rotate, mirror, scale, shear, and nudge update locally before one validated transaction. Multi-object pivots, exact controls, grid snapping, and texture lock are supported. |
| Repeat             | Delivered | A sequence of duplicate and affine object operations can replay with fresh IDs as one undoable transaction.                                                                                        |
| Visibility state   | Delivered | Hide, isolate, show all, lock, unlock, and viewport filters are non-source view state and are respected by picking and geometry operations.                                                        |

## Brush and topology tools

| Capability                    | Status    | Current behavior                                                                                                                                                                 |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unified Select/Create         | Delivered | The default selection tool creates a grid-aligned cuboid when an empty drag begins and otherwise performs selection or movement.                                                 |
| Brush creation                | Delivered | Cuboid, stairs, arches, cylinders, cones, UV spheroids, icospheres, and perspective box creation share cancellable previews and one commit.                                      |
| Face resize/extrude           | Delivered | Selected-brush faces have priority over neighboring geometry. Multi-brush face drags transform the selected set; face extrusion, split/partition, and prism stamping are atomic. |
| Vertex and edge editing       | Delivered | Multi-handle picking, lasso, target snapping, axis constraints, nudging, affine transforms, insertion, deletion, and convex-hull reconstruction work across selected brushes.    |
| Clip                          | Delivered | Two/three-point and face-matched planes support keep-front, keep-back, and split across a selection, including direct point repositioning.                                       |
| CSG                           | Delivered | Convex merge, intersection, multi-cutter subtraction, and grid-thickness hollow preserve matching face attributes and undo atomically.                                           |
| Hull and Sweep                | Delivered | Perspective hull creation and multi-face Straight/Arc/S-bend sweeps provide live handles, exact controls, repeated segments, texture inheritance, and one commit.                |
| Patches and brush definitions | Partial   | `patchDef2` and idTech 3 `brushDef` parse, normalize, clone, derive geometry, render, and survive source-safe property edits. Selection and editing remain deferred.             |

## Faces and materials

| Capability           | Status    | Current behavior                                                                                                                                                                       |
| -------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Face selection       | Delivered | Direct, additive, brush-wide, connected-coplanar, under-pointer context, and depth-drilled selection share stable face IDs.                                                            |
| Active face feedback | Delivered | Selected objects keep red tint and always-visible outlines; the active manipulated face receives a distinct amber border without replacing its material.                               |
| Projection editing   | Delivered | Material, offset, scale, angle, Valve 220 axes, flags, value, contents, and batch mixed states are editable through one transaction authority.                                         |
| UV workspace         | Delivered | A persistent tiled plane supports pointer-centered zoom, pan, offset, pivot, rotation, and axis-scale gestures with immediate frame-coalesced preview and one commit/cancel lifecycle. |
| Alignment            | Delivered | Reset, world/face alignment, flips, quarter rotation, edge alignment, justification, fit, subdivisions, and auto-fit are always available through named icon commands.                 |
| Face transfer        | Delivered | Projection, material-only, rotated, chained paint, brush-wide transfer, and versioned face-attribute copy/paste preserve target contents.                                              |
| Material browser     | Delivered | Virtualized cells support search, source grouping, usage filtering/sorting, active/in-use states, selection of consumers, context actions, and scoped/global replacement.              |
| Resource ownership   | Delivered | Ordered WADs, palettes, loose roots, and Artbin mounts live in project/map resources rather than the routine Face workflow.                                                            |

## Entities and organization

| Capability     | Status    | Current behavior                                                                                                                                                                              |
| -------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definitions    | Delivered | FGD, DEF, and ENT sources produce one catalog with inheritance, bounds, colors, defaults, choices, flags, angles, targets, and resource references. Unknown classes and keys remain editable. |
| Point entities | Delivered | Definition-aware browsing, surface/2D placement, wireframe rendering, picking, transforms, properties, copy/paste, duplication, deletion, and orientation visualization are supported.        |
| Brush entities | Delivered | Structural brushes can become custom brush entities and return to worldspawn without losing atomic history.                                                                                   |
| Entity links   | Delivered | Target and killtarget arrows support all/selection/transitive modes, selection coloring, and hidden-endpoint filtering.                                                                       |
| Layers         | Delivered | TrenchBroom-compatible default/custom layers support active insertion, ordering, visibility, isolation, locking, compile omission, movement, selection, and safe removal.                     |
| Groups         | Delivered | Regular/nested groups support aggregate picking, transforms, open-group editing, rename, ungroup, copy/paste, duplication, deletion, and compatible metadata.                                 |
| Linked groups  | Delivered | Copies retain independent transforms while member edits synchronize. Protected properties, nesting, unlinking, singleton normalization, bounds, and arrows are supported.                     |
| Issues         | Delivered | Structure, geometry, entity, link, and metadata findings can be filtered, suppressed, selected, revealed, and repaired with one-entry undo.                                                   |
| Model previews | Deferred  | GoldSrc sprites render where available. Quake MDL and GoldSrc studio-model rendering are not part of the current baseline.                                                                    |

## Clipboard, projects, and builds

| Capability               | Status    | Current behavior                                                                                                                                                                                         |
| ------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Object clipboard         | Delivered | Parseable map text preserves mixed brushes/entities/groups, remaps stable IDs, and inserts once. Paste Here uses the pointed perspective surface or 2D pointer/depth context.                            |
| Filesystem safety        | Delivered | Save compares source fingerprints, blocks external-change overwrite, offers reload or copy, and never treats a download as a confirmed filesystem write.                                                 |
| Native builds            | Delivered | A capability-negotiated helper runs configured Quake, GoldSrc, and Quake II toolchains with bounded input, logs, diagnostics, artifacts, cancellation, and optional game launch.                         |
| Hosted builds            | Delivered | Authenticated content-addressed BSP builds use bounded queues, per-user/global admission, payload/artifact limits, and compiler container limits. Only current successful results enter preview.         |
| Compiled preview         | Delivered | The public viewer renders a revision-safe BSP preview in fly mode, seeded before its first frame from the perspective camera captured when Compile was requested. Source geometry remains authoritative. |
| Browser/WASM compilation | Deferred  | Native helper and hosted compiler paths are the supported compilation boundaries.                                                                                                                        |

## Collaboration and hosted editing

| Capability              | Status     | Current behavior                                                                                                                                                                             |
| ----------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Solo mode               | Delivered  | Local projects never require the network and remain editable for an unbounded duration. Multiplayer is optional within a map.                                                                |
| Rooms                   | Delivered  | Hosted maps use one authoritative SQLite-backed `MapCell`, ticketed WebSockets, operation receipts, persisted source/checkpoints, and hibernating presence.                                  |
| Live editing            | Delivered  | Brushes/entities, in-progress transforms, face extrusion, cursors, selections, cameras, and participant-colored previews update without waiting for commit round trips.                      |
| Local authority         | Delivered  | The initiating client displays its candidate immediately. Remote presence and gesture previews are lossy and never enter source or undo history.                                             |
| Undo and convergence    | Delivered  | Seeded multi-replica tests cover deterministic operation ordering, conflict handling, conditional personalized undo, reconnect, and persisted acknowledgement.                               |
| Accountless sharing     | Superseded | Production hosted rooms require 4orm authentication and project membership. Offline/local editing remains available without an account.                                                      |
| Bounded dirty reconnect | Delivered  | One typed IndexedDB outbox permits indefinite clean reconnects, bounds dirty replay to 15 minutes/200 operations/4 MiB, and atomically detaches over-limit work into a reopenable local map. |
| Fleet hardening         | Deferred   | Single-node celld/Azurite persistence and kill/restore are verified. Multi-node ownership handoff, outage drills, backup/restore, and production object storage remain deployment work.      |

## Automation and evidence

| Capability            | Status    | Current behavior                                                                                                                                                                     |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WebMCP                | Delivered | The browser exposes semantic inspection, selection, creation, transform, material, entity, source, history, camera, and project-map operations against the same editor transactions. |
| Headless verification | Delivered | `.agents/skills/verify-worldview-editor` exercises real WebMCP authoring, Playwright, visible state, map loading, undo, and headless WebGPU evidence.                                |
| Performance gate      | Delivered | The opt-in 8,000-brush fixture measures load, selection, translate, material, undo, frame cadence, and named scene-contribution invalidation on capable hardware.                    |
| Compatibility corpora | Delivered | Ignored local Quake, LibreQuake, GoldSrc SDK, and PrimeXT corpora provide parsing, round-trip, resource, edit/undo, and renderer evidence without committing game data.              |

## Intentional limits

- `.map` remains authoritative; BSPs are previews and artifacts.
- Quake, GoldSrc, and Quake II source authoring are delivered. Quake II static BSP38 preview resolves
  loose game-root art; its remaining PVS, collision, archive-mount, model, and audio limits are
  described in [`quake2-compatibility.md`](./quake2-compatibility.md).
- Quake III editing, BSP46 preview, VMF, browser/WASM compilation, model previews, shortcut
  customization, and full game simulation are tracked in [the backlog](./cleanup-plan.md).
- Hosted team maps support short offline interruptions, not indefinite uncoordinated dirty forks.
  Local projects retain full offline behavior.

## Verification entrypoints

Repository-wide commands, browser tiers, performance gates, and test-data rules live in
[the verification guide](./verification.md).
