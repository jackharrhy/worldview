# Worldview backlog

This is the only repository document that tracks unfinished work. Product scope and durable design
belong in [the architecture plan](./plan.md); delivered editor behavior belongs in
[editor capabilities](./editor-capabilities.md). Git history records how completed work happened.

## Working rules

- Choose one structural workstream at a time unless the user sets another priority.
- Keep local editing independent of hosted services.
- Keep `EditorSession` as the only document and history authority.
- Keep visible DOM in React and per-frame pointer, camera, and GPU state outside React.
- Keep viewer and editor cores framework-independent and preserve the native TypeGPU boundary.
- Prefer focused domain interfaces over event buses, service locators, universal caches, and file
  moves that do not improve ownership.
- This project is pre-1.0. Change contracts atomically instead of adding legacy shims.
- Remove an item only after its acceptance criteria and focused verification pass.

## Structural cleanup

Work from the top unless another item is explicitly chosen.

| ID  | Status | Workstream                        | Dependency                                  |
| --- | ------ | --------------------------------- | ------------------------------------------- |
| C9  | Ready  | Viewer renderer decomposition     | Preserve the editor/viewer loading boundary |
| C10 | Ready  | Hosted service handler boundaries | Shared protocol schemas                     |
| C11 | Ready  | Broader architecture enforcement  | Encode boundaries only after they exist     |

### C9: Viewer renderer decomposition

The compiled-world renderer currently owns pipelines, materials, light styles, sprites,
walkability, capture, visibility, and lifecycle in one class.

- Extract resource and pipeline creation, material resources, pure frame planning, world-pass
  encoding, and capture targets behind a small lifecycle facade.
- Share only low-level runtime primitives with the editor. Do not create a universal renderer.

Done when resource ownership and disposal are obvious, frame planning is GPU-independent and
tested, and BSP29/BSP30/BSP38, light-style, sprite, transparency, overview, capture, custom-element,
and public API coverage remains intact.

### C10: Hosted service handler boundaries

The hosted service still has a large regular-expression and method route chain.

- Split focused route matchers and handlers without adopting a heavyweight framework.
- Keep authentication, authorization, version checks, and database transactions visible at each
  route boundary.
- Reuse shared protocol schemas and typed response constructors.

Done when route matching and handlers have focused tests, unauthorized and stale behavior remains
deterministic, browser and service compile against the same contracts, and container integration
tests pass.

### C11: Architecture enforcement

Existing checks cover editor DOM ownership, TypeGPU, package entrypoints, route isolation, and file
ceilings, but not every established boundary.

- Add checks for renderer packages, the viewer app, hosted service, dependency cycles, and
  coordination-file complexity.
- Keep exceptions narrow, documented, and actionable.
- Reject architectural violations, not harmless implementation details.

Done when each durable invariant in [the architecture plan](./plan.md) is enforced automatically or
has a documented review reason, and each failure names the governing contract.

## Hosted product

### H1: Hosted project workflows

The hosted foundation supports identity, memberships, maps, resources, live editing, and builds.
The remaining product surfaces are:

- personal folders for organizing accessible projects;
- checkpoint and version-history browsing;
- project archive and deletion workflows;
- deterministic WAD3 output from pinned loose Artbin images, including provenance and output hash.

Done when each surface uses the existing project permission model, preserves the `MapCell` as the
only map source authority, and has owner/editor/viewer authorization coverage.

### H2: Collaboration fleet hardening

The current celld/Azurite deployment is suitable for one small host, not a qualified fleet.

- Exercise multi-node ownership handoff, split-brain prevention, and node failure.
- Drill object-store throttling, outages, and conditional writes.
- Verify backup and restore, then document recovery objectives.
- Test upgrades and choose an object store outside the application host's failure domain.
- Review hostile multi-tenant ingress and room isolation.

Done when room ownership survives node loss without two writers, backup restoration is repeatable,
and the browser and Worker protocols remain storage-provider-neutral.

## Editor conformance

### E1: Remaining desktop workflow parity

- Add fast and slow fly modifiers.
- Decide whether to add the alternate vertical middle-drag mode.
- Add clear duplicate-and-move completion feedback.
- Design context-aware shortcut preferences that resolve conflicts by viewport and active tool.

Reference behavior and current differences remain in
[the TrenchBroom conformance record](./trenchbroom-conformance.md).

Done when each accepted interaction has an original, license-compatible implementation, focused
controller tests, and browser evidence without adding a global viewport event branch.

## Format expansion

### F1: Quake II viewer depth

Add BSP38 visibility and collision through layouts specific to that format. Treat direct PAK/PK3
mounting, alias models, sprites, and game audio as separate slices over the existing game-asset
resolver. Do not couple archive or installation policy to the BSP core.

Done when the supported boundary and real-corpus evidence are updated in
[Quake II compatibility](./quake2-compatibility.md), walking uses BSP38 collision safely, and the
full viewer gates pass.

### F2: Quake III source authoring

- Add the Quake III profile, shaders and materials, definitions, project conventions, and build
  profiles.
- Promote `patchDef2` and `brushDef` primitives into honest selectable and editable objects.
- Cover transforms, duplication, deletion, visibility, layers and groups, clipboard, undo and redo,
  source-safe mutation, and collaboration.
- Give patch control points a focused tool instead of adding branches to brush topology code.

Done when every generic traversal handles the primitive union, brush-only commands narrow by kind,
and source-preservation and corpus gates pass.

### F3: Quake III compiled preview

Add BSP46 parsing, materials, visibility, lightmaps, and collision as an independent viewer
capability. Editor source state must not depend on compiled structures.

Done when openly licensed fixtures, parser tests, real-browser rendering, and visual comparison
against a behavior oracle all pass.

### F4: VMF and Source profile

Add a VMF document codec rather than translating VMF through Quake map syntax. Start with solids,
sides, entities, stable IDs, connections, and source-safe round trips. Add displacements and
visgroups only through explicit Source semantics. Source BSP rendering is a later viewer slice.

Done when unsupported blocks remain retained, unsafe saves are blocked, and the same source and
licensing gates used by existing formats pass.

### F5: Cross-format surface tools

Consider shared surface UI only after Quake III patches and VMF displacements have separate,
correct models. Similar rendering is not enough reason to merge their topology or serialization.

Done when an extracted abstraction removes real duplication without weakening either format's
editing or source-preservation rules.

## Parking lot

These are outside the current baseline and have no scheduled order:

- browser or WASM compilation;
- Quake MDL and GoldSrc studio-model previews;
- three-way merge with externally changed source;
- collision-aware editor walk mode;
- full trigger, conveyor, and game simulation;
- source formats beyond the Quake III and VMF sequence above.

Move an item into a named workstream before implementing it.

## Verification

Use the smallest focused tests while iterating, then run the applicable tiers from
[the verification guide](./verification.md). Acceptance criteria in this backlog supplement those
gates; they do not replace them.
