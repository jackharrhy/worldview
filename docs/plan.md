# Worldview product and architecture plan

## Product direction

Worldview is an explicitly unstable, local-first browser toolchain for Quake and GoldSrc maps. It
has two related products:

- A WebGPU static-exhibit viewer for Quake BSP29 and GoldSrc BSP30 maps.
- A serious solo map editor whose canonical authoring format is `.map` source.

The editor defaults new maps to Valve 220. Classic Quake face syntax remains classic until the user
explicitly converts it. An optional loopback helper provides configured native compilation and
external-game launch; the browser remains useful without it through import/download, local browser
resources, and recovery.

There is no release-number target or semantic-compatibility promise while the editor is hot magma.
App, package, helper, documentation, and consumer tests may change atomically. The detailed list of
delivered interactions lives in [`editor-capabilities.md`](./editor-capabilities.md).

## Product boundaries

- `.map` is authoritative geometry. Compiled BSPs are previews and artifacts, never editor state.
- `worldview.project.json` is optional, portable project configuration, not a geometry container.
- Chromium provides the full directory-handle workflow. Other WebGPU browsers keep safe
  import/download and IndexedDB recovery fallbacks.
- Quake and GoldSrc are the only current game profiles.
- Browser-only/WASM compilation, Quake/GoldSrc model previews, collaboration, three-way source
  merge, Q2/Q3 formats, and native editor-owned geometry containers are deferred.
- The existing viewer remains a bounded static-world exhibit. Conveyor pushing, trigger state, and
  full game simulation are out of scope.

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

| Reference                                                                                                                                                                                  | Adopt                                                                                                                                       | Do not adopt                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [TrenchBroom `a4ec188`](https://github.com/TrenchBroom/TrenchBroom/tree/a4ec1886bf997ff73a18b2bf3d54e32c2020ce2a) and its [manual](https://trenchbroom.github.io/manual/latest/index.html) | Singular transaction ownership, focused tool controllers, game/entity configuration, compilation profiles, map-compatible groups and layers | GPL implementation or a desktop-only architecture                         |
| [Q3Edit `02f8764`](https://github.com/drdator/q3edit/tree/02f87647162e5bf5e39fe61968f904efe8e19675)                                                                                        | IndexedDB recovery, worker-ready boundaries, source-loss diagnostics, browser-local resources, version history                              | Normalize-after-first-edit behavior; Worldview preserves source structure |
| [WAD Together `e015027`](https://github.com/Donitzo/wad-together/tree/e0150270a33f25ea9428cd0b5e7f628822bdcf95)                                                                            | Later operation/inverse-operation collaboration with assets local to each participant                                                       | Collaboration before the solo workflow is dependable                      |
| [J.A.C.K. JMF](https://jack.hlfx.ru/en/articles/1/faq.html) and [Hammer VMF](https://developer.valvesoftware.com/wiki/VMF_%28Valve_Map_Format%29)                                          | Evidence for keeping editor/project metadata outside compiler-facing map geometry                                                           | A native geometry container that weakens `.map` interoperability          |
| [ericw-tools](https://ericw-tools.readthedocs.io/en/latest/qbsp.html)                                                                                                                      | Structured stages and BSP, portal, and leak artifacts behind safe configured profiles                                                       | Browser-supplied executable paths, commands, or arbitrary arguments       |

The three editor repositories above are research references, not package contents, so they are not
third-party distributions listed in `THIRD_PARTY_NOTICES.md`.

## Workspace and dependency boundaries

- `packages/worldview`: published viewer, GPU-independent BSP core, custom element, and walkability
  APIs.
- `apps/viewer`: development/static viewer and generated license-compatible fixtures.
- `packages/worldview-editor`: DOM-free map document, source preservation, project, definition,
  build contracts, commands, sessions, gesture controllers, spatial queries, and WebGPU rendering.
- `apps/editor`: browser composition root, focused presenters, filesystem/project adapters,
  IndexedDB services, dialogs, and four-view authoring UI.
- `apps/compiler-service`: loopback adapter around explicitly configured compile and launch
  profiles.

`packages/worldview/src/core` remains free of DOM, WebGPU, and TypeGPU imports. The viewer consumes
public package entrypoints. `packages/worldview-editor/src/core` remains DOM-free. The editor app
does not bypass package entrypoints. npm workspaces and the committed `package-lock.json` define the
dependency graph.

Every hand-written production TypeScript or CSS file beneath `apps/editor/src` and
`packages/worldview-editor/src` is limited to 1,000 physical lines by
`scripts/check-editor-architecture.mjs`.

## Editor architecture

The application entrypoint is composition-only. Presenters own project/files, commands, tools,
inspectors, materials, organization, build UI, dialogs, and session-to-view presentation.

`EditorSession` is the singular transaction and history coordinator. Focused DOM-free domains own
selection/view state, object transforms, topology, geometry/CSG, entities/materials, and
organization. Renderer gesture controllers implement explicit `begin`, `update`, `commit`, and
`cancel` states; GPU scene ownership stays outside controllers. Document mutations, validation,
derived queries, source parsing, and serialization are separate modules without circular domain
dependencies.

Renderer solids are partitioned by material and spatial cell. Structural-sharing signatures reuse
unchanged GPU buffers across revisions, conservative frustum tests skip invisible batches, and an
immutable median-split AABB index supplies broad-phase picking and region queries. Dense documents
avoid generating unselected projected face grids. Performance measures are published as
`worldview.editor.scene-rebuild` and `worldview.editor.change-presentation` entries.

## Public editor contracts

### Source-safe map model

`@jackharrhy/worldview-editor/core` exports `parseMapSource`, `MapSourceState`,
`MapSourceDiagnostic`, `planMapSave`, and the discriminated `MapSavePlan`. Existing `parseMap` and
`serializeMap` remain available for deliberately normalized workflows.

The source state retains original bytes, tokens/spans, comments, whitespace, property ordering,
face syntax, and opaque unsupported constructs beside the semantic `MapDocument`. A save plan
patches changed regions and preserves untouched bytes. Unedited files round-trip byte-for-byte;
new nodes infer enclosing style; new files use Valve 220. Normal Save is blocked when an opaque
construct cannot be safely reanchored. **Export normalized copy** is separate and never overwrites
the original.

### Projects and local state

`WorldviewProjectManifest`, `parseWorldviewProject`, and `serializeWorldviewProject` define
versioned `worldview.project.json` files. Version 1 contains project name, `quake` or `goldsrc`
profile, relative map roots, ordered relative WADs, optional palette/sprite roots, ordered FGD/DEF/
ENT definition files, logical preview/final build profiles, and defaults.

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
missing or moved resources remain visible diagnostics.

Available GoldSrc SPR2 resources render in source view. Missing or corrupt sprites fall back to
definition-colored bounds. Quake MDL and GoldSrc studio-model rendering remain deferred.

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

## Data flow

1. A new/imported/file-backed `.map` is parsed into source state plus semantic `MapDocument`.
2. `EditorSession` commands derive and validate candidates, then atomically commit one document and
   history entry.
3. Presenters update inspectors and renderer state; derived geometry, spatial indexes, and GPU
   batches are disposable caches.
4. Recovery snapshots source state after commits. Save planning patches original source regions;
   a file-backed save first rechecks disk fingerprint.
5. A project manifest resolves ordered browser-local resources and logical build profiles.
6. A build request sends a compile snapshot and expected revision to a configured local
   capability. Only successful, current results replace preview; diagnostics and artifacts remain
   inspectable in history.

No compiled artifact, renderer cache, browser handle, or machine-local helper binding flows back
into canonical `.map` geometry or the portable project manifest.

## Delivery milestones

| Milestone                         | Status   | Delivered evidence                                                                                                                                  |
| --------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Architecture hardening         | Complete | Composition root, focused presenters/domain modules, explicit gesture lifecycle, split renderer/document/CSS, enforced 1,000-line ceiling           |
| 2. Source and persistence safety  | Complete | Source-backed save planner, project manifest/directory workflow, external-change guard, recovery/checkpoints, safe fallback exports                 |
| 3. Game-aware authoring           | Complete | Quake/GoldSrc profiles, ordered resources, FGD/DEF/ENT catalog, typed inspectors/browser, definition bounds/colors, SPR2 previews                   |
| 4. Daily build loop               | Complete | Safe helper capability protocol, structured diagnostics/logs, revision-safe BSP preview, leak/portal overlays, retained history, configured launch  |
| 5. Scale and dependable-solo gate | Complete | Spatial picking, incremental solid-buffer reuse, frustum culling, dense-grid limits, runtime measures, generated 8,000-brush CPU and Chromium gates |
| 6. After dependable solo          | Deferred | Collision-aware editor walk mode first; then the explicitly deferred features listed under Product boundaries                                       |

Worker parsing/catalog work and list virtualization remain available optimizations rather than
mandatory architecture: the fixed scale gate passes without them, so the roadmap's “as required”
condition has not been met.

## Acceptance and regression gates

`npm run check` is the required static, architecture, formatting, lint, type, unit, build, consumer,
and package gate. Editor behavior is exercised by 68 Chromium scenarios in
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

The fixed performance command is `npm run test:editor-performance`. It generates an 8,000
six-face-brush map, runs Chromium at 2560×1440/DPR 1 on the reference development Mac, and asserts:

- editable within 3 seconds;
- common translate, material, and undo commits below 100 ms each;
- 180 interactive frames with p95 frame time no worse than 33 ms.

The gate passed on 2026-08-25. The Playwright test attaches its measured JSON report and remains
opt-in so ordinary browser tests do not pretend that shared CI hardware is the recorded reference
machine.
