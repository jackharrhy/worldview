# Worldview v0.1

## Scope

Worldview renders a static Quake or GoldSrc map in an existing canvas or a `<world-view>` custom
element.

Rendering is WebGPU-only.
Audio uses the Web Audio API.

No commercial or shareware game assets are part of the repository or npm package.
Numbered ambient preset IDs are retained for diagnostics but are not interpreted; explicit
modulation keys remain supported. Sprite loading accepts standard version 2 single and grouped
frames, without engine-specific format extensions.

## Source policy

[noclip.website](https://github.com/magcius/noclip.website/tree/37b351452e7157996d645ee5e6502c5d9c54e090/src/Common/IdTech2)
is the only codebase currently adapted by Worldview. Its MIT notice and the relevant source comments
record that provenance.

Further compatibility work should start with published format information and clearly licensed,
independent reimplementations. id Software's GPL engine releases may be used to check behavior, but
their code cannot be copied into this MIT package. Any new adapted source must be documented before
it lands. A renderer used for visual comparison is a test oracle, not an implementation source.

## Workspace

- `apps/viewer`: full-screen Vite and vanilla TypeScript viewer with a Tweakpane control dock.
- `packages/worldview`: ESM package published as `@jackharrhy/worldview`.

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
