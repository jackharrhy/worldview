# Worldview cleanup backlog

This is the canonical backlog for structural cleanup. [`plan.md`](./plan.md) owns product scope and
architecture; this file contains only unfinished cleanup, ordering, and acceptance criteria. Current
editor behavior belongs in [`editor-capabilities.md`](./editor-capabilities.md), not in completion
diaries here.

## Rules

- Select the first `ready` item unless the user chooses another.
- Keep one structural workstream `in progress` at a time.
- Preserve the editor/viewer split, DOM-free core packages, `EditorSession` as the sole document and
  history authority, React-owned application DOM, and native TypeGPU boundaries.
- Prefer focused domain interfaces over event buses, service locators, universal caches, or cosmetic
  file moves.
- This project is pre-release. Change internal contracts atomically instead of adding legacy shims.
- Mark work complete only when its acceptance criteria and focused verification pass. Git history
  records the implementation narrative; this file records the resulting state.

## Completed foundations

| ID  | Result                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C0  | One abort-owned editor lifetime disposes renderer, WebMCP, recovery, collaboration, listeners, and interrupted startup safely.                                                                                                                     |
| C1  | React owns visible editor DOM through typed snapshots and commands. Runtime refs are limited to canvases, overlays, focus, measurement, resize, and native file boundaries. React Aria Components and the semantic Phosphor registry are enforced. |
| C6  | Zod 4 schemas own project, document, collaboration, ticket, hosted wire, compiler, persistence, walkability, and WebMCP ingress. `@worldview/protocol` is the shared browser/service wire contract.                                                |

These are invariants, not future work. Their focused tests and architecture checks must remain green.

## Active order

| ID  | Priority | Status | Workstream                                            | Depends on                    |
| --- | -------- | ------ | ----------------------------------------------------- | ----------------------------- |
| C2  | P1       | ready  | Presenter state and command boundaries                | C1                            |
| C3  | P1       | ready  | `EditorSession` composition                           | C2                            |
| C4  | P1       | ready  | Retained scene contributions                          | C2                            |
| C7  | P1       | ready  | IndexedDB infrastructure and bounded hosted reconnect | C6                            |
| C5  | P2       | ready  | Route isolation and optional loading                  | —                             |
| C8  | P2       | ready  | Test-suite decomposition                              | Follow changed domains        |
| C9  | P2       | ready  | Viewer renderer decomposition                         | C5 decision                   |
| C10 | P2       | ready  | Hosted service handler boundaries                     | C6                            |
| C11 | P2       | ready  | Broaden architecture enforcement                      | Established C2–C10 boundaries |

## C2 — Presenter state and command boundaries

**Problem:** Presenter DOM dependencies are narrow, but several presenters still receive broad
`EditorState` access or coordinate peer presenters directly.

**Direction:**

- Split document/session, selection, tools, project, build, collaboration, and renderer presentation
  into owned readonly snapshots plus explicit commands.
- Give collaboration one discriminated lifecycle: `solo`, `connecting`, `live`, `reconnecting`,
  `detached-local`, `conflict`, and `leaving`.
- Put cross-domain orchestration in named application commands. Do not replace direct coupling with a
  generic event bus or dependency-injection framework.
- Introduce a focused tool-controller registry where global conditional adapters are still growing.

**Done when:** No presenter receives the complete application state or DOM registry; document
replacement, tool changes, and collaboration join/leave each have one owner; collaboration reconnect
policy is testable without React or transport; domain tests do not construct the whole application.

## C3 — `EditorSession` composition

**Problem:** `EditorSession` is a large inherited implementation spread across state, selection,
transforms, geometry, entities, objects, and history. Replay reconstructs dynamic subclass state.

**Direction:**

- Define a small `SessionKernel` for document, selection, history, and commit mechanics.
- Compose topology, transforms, entities/materials, organization, clipboard, and object commands from
  explicit kernel capabilities.
- Use the same explicit command/state model for direct execution and history replay.
- Keep one commit point, undo/redo stack, source-identity policy, and collaboration-operation emitter.

**Done when:** Behavior no longer depends on inheritance order or `this.constructor`; domain modules
declare their dependencies; direct and replayed commands produce identical document, selection,
history, serialization, and collaboration results.

## C4 — Retained scene contributions

**Problem:** Source scene assembly still uses broad positional inputs and reuse booleans. This makes
invalidation hard to reason about and leaves document-size special paths in performance-sensitive
code.

**Direction:**

- Assemble immutable scene input from named contributions: world solids, object lines, local
  selection, tool/face previews, grids/references, diagnostics, and remote presence/previews.
- Give each contribution a dependency key, retained buffers, and explicit disposal.
- Preserve one command encoder/submission per frame and the on-demand scheduler.
- Measure camera-only, selection-only, local drag, remote preview, and document changes before and
  after the cutover.

**Done when:** Camera changes rebuild no document geometry; local and remote previews touch only
their contribution; selection does not reconstruct world lines; the 8,000-brush stress fixture has
no count-based behavior cliff; all four viewports retain selection, active-face, grid, reference,
and multiplayer visuals.

## C7 — IndexedDB and hosted reconnect

**Problem:** Recovery, project-local state, asset mounts, build history, and collaboration repeat
native IndexedDB lifecycle code. Hosted offline policy also needs one bounded, durable owner.

**Decision:** Adopt `idb` in the editor app for typed requests, transactions, and upgrades. Keep
domain schemas, store layouts, retention, and errors in their owning services; do not add an ORM or
generic repository layer. Small non-authoritative display and per-map viewport preferences may stay
in validated, debounced `localStorage`.

**Direction:**

- Define typed `DBSchema` contracts and migrate services in focused slices.
- Start with the collaboration outbox and record elapsed disconnect time, operation count, encoded
  bytes, map version, and recovery metadata.
- A clean hosted map may reconnect after a long absence. Dirty replay is bounded; exceeding the
  elapsed/count/byte window creates a durable, editable quarantined local copy instead of pretending
  to merge indefinitely.

**Done when:** Native request/transaction boilerplate is gone; upgrades, aborts, quota failures, and
retention are covered; crash/reload tests prove bounded replay and durable detachment; solo/local
projects remain fully offline without time limits.

## C5 — Route isolation and optional loading

**Problem:** The public home route is already cheap, but shared runtime imports can defeat the
compiled-preview dynamic import inside the editor route.

**Direction:**

- Keep `/` isolated from editor packages, TypeGPU/WebGPU, WebMCP, compiler, collaboration, and editor
  assets.
- If it remains a clean boundary, expose snapshot/scheduler primitives from a small public runtime
  subpath so BSP parsing/rendering stays behind preview intent.
- Preserve `/new-map` idle/intent prewarming without initializing presenters or WebGPU.
- Measure route transfer and initialization. Do not impose an arbitrary editor chunk-size target.

**Done when:** The home route remains isolated; the editor initializes reliably; the production
build no longer reports an ineffective viewer dynamic import if the split is retained; route graphs
and before/after measurements are recorded.

## C8 — Test-suite decomposition

**Problem:** Core and browser suites contain valuable coverage but several files are too large for
clear ownership and focused execution.

**Decision:** Use `fast-check` and `@fast-check/vitest` only where generated sequences and shrinking
add value: session commands, collaboration ordering/reconnect, inverses, schema boundaries, and
persistence state machines.

**Direction:**

- Split tests by production domain and keep a small cross-domain browser suite.
- Extract deterministic builders and interaction helpers without hiding relevant state or actions.
- Add seeded properties for idempotence, ordering, convergence, conflict safety, personalized undo,
  persist-before-ack, and bounded reconnect/detachment.
- Keep GPU, visual, and performance suites explicitly runnable on capable hosts rather than diluting
  them for lightweight CI.

**Done when:** A domain change has an obvious focused command/file, coverage is retained or improved,
and ordinary CI remains bounded. The initial fixed-sleep and duplicate-service-test cleanup is
already complete; it does not complete this workstream.

## C9 — Viewer renderer decomposition

**Problem:** The compiled-world renderer owns pipelines, materials, lightstyles, sprites,
walkability, capture, visibility, and lifecycle in one class.

**Direction:** Extract resource/pipeline creation, material resources, pure frame planning,
world-pass encoding, and capture targets behind a small lifecycle facade. Share only low-level
runtime primitives with the editor; do not create a universal renderer abstraction.

**Done when:** Resource ownership/disposal is obvious, frame planning is GPU-independent and tested,
and BSP29/BSP30, lightstyle, sprite, transparency, overview, capture, custom-element, and public API
coverage remains intact.

## C10 — Hosted service handler boundaries

**Problem:** The hosted service has a large regex/method route chain despite C6 now providing shared
runtime contracts.

**Direction:** Split focused route handlers without adopting a heavyweight framework. Keep auth,
authorization, version checks, and database transactions visible at each route boundary; use shared
protocol schemas and typed response constructors.

**Done when:** Route matching and handlers have focused tests; unauthorized, stale, and server-error
behavior remains deterministic; browser and service compile against the same contracts; container
and integration tests pass.

## C11 — Architecture enforcement

**Problem:** Existing checks protect editor DOM, TypeGPU, package entrypoints, and file ceilings, but
the boundaries established by C2–C10 are not yet encoded.

**Direction:** Extend checks only after each target boundary exists. Cover renderer packages, the
viewer app, hosted service, route isolation, dependency cycles, and coordination-file complexity.
Keep exceptions narrow, documented, and actionable; do not encode implementation trivia.

**Done when:** Each invariant above is enforced automatically or has a documented review reason, and
violations fail with a useful message naming the governing contract.

## Verification

Use the smallest focused tests while iterating, then the applicable root gates:

```sh
npm run format:check
npm run lint
npm run typecheck
npm run check:architecture
npm test
npm run build
```

Editor interaction or rendering changes also use the repository's `verify-worldview-editor` skill.
GPU stress and visual checks run on a capable host when lightweight CI cannot provide meaningful
WebGPU evidence.
