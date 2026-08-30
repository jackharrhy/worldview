# Worldview cleanup plan

This is the canonical execution plan for structural cleanup identified by the August 2026
architecture review. [`plan.md`](./plan.md) remains the authority for product scope and intended
architecture; this document records the ordered work needed to make the implementation match that
architecture. If the two disagree, stop and update both documents as part of the same change.

The cleanup is not a rewrite. Worldview's package boundaries, editor/viewer split, source-authoring
model, transaction ownership, and native TypeGPU direction are sound. The work below tightens
lifetime, UI, state, and rendering ownership before more features make those seams harder to
recover.

## How to use this plan

An agent taking cleanup work must:

1. Read `AGENTS.md`, [`plan.md`](./plan.md), and this document before editing.
2. Select the first `ready` workstream unless the user explicitly chooses another.
3. Change its status to `in progress` before a substantial implementation begins.
4. Keep the slice behavior-preserving unless its acceptance criteria explicitly say otherwise.
5. Run the focused tests for the changed domain and the architecture checks before marking it
   `complete`.
6. Record the verification commands and any intentionally deferred follow-up in this document.

Statuses are `ready`, `blocked`, `in progress`, and `complete`. Only one structural workstream should
normally be `in progress`; narrowly independent test or documentation work may proceed alongside it.

## Invariants

- Do not merge the editable-source renderer with the compiled BSP viewer renderer. They have
  different data lifetimes, interaction requirements, and frame inputs.
- Preserve the DOM-free core boundaries and public package entrypoints described in `AGENTS.md` and
  [`plan.md`](./plan.md#workspace-and-dependency-boundaries).
- Keep `EditorSession` as the singular transaction and history authority. Composition may replace
  inheritance, but competing mutation or undo authorities must not be introduced.
- Keep React out of the editor and viewer packages. React owns application DOM; package renderers and
  controllers expose typed state and imperative canvas/runtime ports.
- Keep native TypeGPU as the GPU resource and pipeline boundary. Raw WebGPU remains limited to the
  deliberate command-encoding and bulk-upload seams documented in the product plan.
- Treat route isolation and startup work as the bundle-performance boundary. The public home route
  must not load the editor, renderer, WebMCP, compiler, collaboration, or editor asset graph. Once a
  person chooses the editor, a substantial authoring bundle is expected; track its size and startup
  cost, but do not trade clarity or useful capability for an arbitrary small-chunk target.
- Prefer explicit domain interfaces and data structures over generic event buses, service locators,
  dependency-injection frameworks, or universal caches.
- Do not introduce compatibility shims for the pre-cleanup internal architecture. This is an
  unstable new project, so callers and tests may change atomically.
- A workstream is not complete merely because code moved into more files. Ownership, dependencies,
  and acceptance criteria must improve measurably.

## Current assessment

The strongest foundations are:

- The viewer and editor use public package boundaries for genuinely shared runtime and core code.
- GPU-independent core directories remain free of DOM, WebGPU, and TypeGPU imports.
- Editable source rendering and compiled BSP rendering are correctly separate.
- The TypeGPU hot path already uses typed resources, retained batches, frustum rejection, on-demand
  scheduling, and one editor command encoder/submission per frame.
- Singular transaction/history ownership is the right semantic model.
- Existing architecture checks prevent several important regressions.

The primary liabilities are:

- The editor route creates a long-lived application without a complete teardown path.
- Visible DOM is split between React and imperative presenters despite the stated React ownership
  boundary.
- Presenter files are smaller than the old application entrypoint, but they still share a broad
  mutable `EditorState` and global `EditorElements` registry.
- `EditorSession` behaves as one large inherited class spread over several files.
- Editor scene invalidation is expressed through positional inputs and reuse booleans rather than
  independently cached scene contributions.
- The compiled-preview dynamic import is defeated by static imports from the same package root.
- Project manifests, collaboration frames, persisted browser records, WebMCP inputs, and hosted API
  payloads repeat handwritten `isRecord`/primitive narrowing instead of sharing declarative runtime
  schemas.
- IndexedDB mechanics, hosted service routing, and large test suites need smaller explicit
  boundaries.

## Workstream order

| ID  | Priority | Status      | Workstream                             | Depends on                  |
| --- | -------- | ----------- | -------------------------------------- | --------------------------- |
| C0  | P0       | ready       | Editor lifetime and teardown           | —                           |
| C1  | P0       | in progress | React DOM ownership boundary           | C0 cleanup conventions      |
| C2  | P1       | ready       | Presenter state and command boundaries | C1 snapshot conventions     |
| C3  | P1       | ready       | `EditorSession` composition            | C2 command boundaries       |
| C4  | P1       | ready       | Retained scene contributions           | C2 state boundaries         |
| C5  | P2       | ready       | Route isolation and optional loading   | —                           |
| C6  | P1       | ready       | Declarative runtime schemas            | —                           |
| C7  | P2       | ready       | IndexedDB infrastructure with `idb`    | C6 persisted-record schemas |
| C8  | P2       | ready       | Test-suite decomposition               | Follow changed domains      |
| C9  | P2       | ready       | Viewer renderer decomposition          | C5 shared-runtime decision  |
| C10 | P2       | ready       | Hosted service handler boundaries      | C6 hosted wire schemas      |
| C11 | P2       | ready       | Broaden architecture enforcement       | C0–C10 conventions          |

Dependencies describe the preferred design order, not a reason to create giant pull requests. C0,
C5, and C6 can be delivered as independent, reviewable changes.

## Initial focus — collaboration consistency

The first cleanup program applies the workstreams to multiplayer before broad editor decomposition.
This keeps the Figma-like experience coherent while making solo editing strictly independent of the
network:

1. Complete C0 so route teardown, interrupted startup, and leave/rejoin release every collaboration
   and GPU lifetime.
2. Apply C6 to project, collaboration, ticket, and hosted wire boundaries using shared Zod schemas.
3. Apply C7 to the collaboration outbox first, including durable reconnect timing/size metadata and
   quarantined local-copy recovery.
4. Apply the collaboration slice of C2: one owner for the explicit `solo`/connect/live/reconnect/
   detach/conflict/leave state machine, with transport and UI depending on its snapshots and
   commands.
5. Apply C4 to remote presence and gesture previews as independently retained, lossy renderer
   contributions that never enter document or history state.
6. Apply C1 with React Aria to participant, connection, conflict, and rejoin UI while keeping the
   collaboration domain outside React.
7. Apply C8's generated convergence, reordering, hibernation, bounded reconnect, and detachment
   properties before continuing the broad presenter/session cleanup.

Completing one focused slice does not mark its entire parent workstream complete. Record partial
delivery in the completion log until every acceptance criterion for that workstream is satisfied.

## C0 — Editor lifetime and teardown

**Problem:** [`editor-route.tsx`](../apps/editor/src/routes/editor-route.tsx) starts an
`EditorApplication` from a React callback ref but does not release it when the ref detaches. Global
input handlers, document recovery listeners, collaboration subscriptions/timers, asynchronous
startup, and renderer resources can outlive the route. The viewer controller already has a useful
generation-and-cleanup model.

**Target:** Mounting and unmounting an editor creates and destroys exactly one isolated application
lifetime. Late asynchronous completion cannot revive or mutate a disposed instance.

**Implementation direction:**

- Add an idempotent `EditorApplication.dispose()`.
- Give startup a generation token or shared `AbortSignal` so a detached route invalidates unfinished
  work.
- Make every subsystem connection return a cleanup function or register with the application-owned
  abort signal.
- Dispose collaboration subscriptions, intervals, animation frames, document/page listeners,
  recovery hooks, presenter listeners, and renderer resources.
- Have the editor callback ref return cleanup, following the viewer controller's established shape.
- Remove the document-level ready marker on teardown if the disposed application owns it.

**Acceptance criteria:**

- Repeated route mount/unmount cycles do not increase registered listeners, active timers, live
  collaboration connections, or GPU runtimes.
- Unmounting during asynchronous startup causes no late UI, document, or readiness mutation.
- `dispose()` is safe before, during, and after successful startup and is safe to call twice.
- Browser coverage exercises at least two editor mount/unmount cycles and a teardown during startup.
- Existing editor loading, local map, hosted map, and collaboration tests continue to pass.

## C1 — React DOM ownership boundary

**Problem:** [`plan.md`](./plan.md#editor-architecture) says visible DOM is React-owned while focused
presenters still construct and mutate materials, entity, organization, tool, context-menu, and
dialog UI. `EditorElements` is therefore both a stable-ref boundary and a broad DOM service locator.
The architecture gate rejects HTML-string injection but does not reject most imperative UI.

**Target:** React owns every user-visible node and property. Imperative code owns canvas/runtime
behavior and communicates through typed commands and immutable snapshots.

**Dependency decision:** Adopt
[`react-aria-components`](https://react-spectrum.adobe.com/react-aria/) for
conventional interactive mechanics such as menus, dialogs, tabs, listboxes, tooltips, and keyboard
navigation. It supplies behavior and accessibility, not Worldview's visual design. Keep the existing
theme variables, component styling, dense editor layout, canvas input, and domain state; do not
adopt React Spectrum styling or wrap every native element without a behavioral reason.

**Design direction:** Treat the editor as a dense desktop instrument with geometric two-pixel
controls, cool neutral surfaces, one restrained accent, crisp focus treatment, inset fields, and
compact menus with stable icon/label/shortcut columns. Worldview owns this appearance in native CSS;
React Aria owns semantics and interaction behavior. The exact variants, states, density rules, and
rollout live in [`interface-system.md`](./interface-system.md).

**Implementation direction:**

- Inventory each `document.createElement`, visible `textContent`, `classList`, style, attribute, and
  ARIA mutation under `apps/editor/src`.
- Classify the use as visible UI, canvas/runtime integration, focus/pointer capture, measurement,
  native file input, or dialog lifetime.
- Move visible materials, entities, organization, context menus, tool controls, build UI, and project
  UI into React components fed by narrow snapshot stores.
- Use portals for menus and dialogs that must escape clipped layout.
- Reduce `EditorElements` to stable canvas and native browser refs; do not replace it with a React
  service locator.
- Reconcile the contradictory ownership language in [`plan.md`](./plan.md) and
  [`react-ui-ownership.md`](./react-ui-ownership.md) as the migration lands.
- Keep `/design` as the visual contract for every primitive in dark and light themes, including
  focus-visible, disabled, invalid, selected/open, pressed, busy, and long-label states.

**First implementation slice:**

- Add the editor-app `react-aria-components` dependency and establish reusable button, field, menu,
  menu-item, section, and shortcut presentation primitives without importing Spectrum styling.
- Replace the viewport context menu's `createElement`, `replaceChildren`, manual roving focus,
  submenu `<details>`, outside-click, and escape handling with a React-owned React Aria menu/overlay.
- Keep context resolution and editor commands framework-neutral. Publish a menu snapshot containing
  position, heading/detail, sections, disabled state, nested actions, and stable command IDs; React
  invokes commands through a narrow port.
- Preserve cursor anchoring, viewport-edge collision handling, initial focus, arrow/home/end/escape
  behavior, focus restoration, disabled actions, submenus, async error reporting, and both themes.
- Add the resulting primitives and context-menu states to `/design`; do not attempt a global raw
  button/input rewrite in this first change.

**Delivered 2026-08-30:** The editor app now has Worldview-styled React Aria button, text-field,
menu, section, popover, and submenu primitives. Pre-editor action buttons use the shared button,
`/design` covers the first-slice states in both themes, and the viewport context menu is React-owned
through an immutable snapshot and opaque command port. Its React lifetime also owns narrowly scoped
native-menu suppression, including the Windows event order where `contextmenu` arrives after the
popover has made the canvas inert. C1 remains in progress: raw editor controls, inspectors,
catalogs, dialogs, and the imperative-UI architecture gate are intentionally separate slices.

**Delivered 2026-08-30 (second slice):** Worldview-styled React Aria tabs, select/listbox, number
field, checkbox, modal, and dialog primitives now join the initial set. The live inspector page and
theme preference use typed snapshot ports instead of imperative class, hidden, ARIA, value, and
change-listener mutation. Quake II surface flags/value use the shared checkbox and number field, and
collaboration uses a portal-backed modal with React Aria focus containment and dismissal instead of
`showModal()` synchronization. `/design` exercises every new primitive in both themes and exposes an
interactive dialog. C1 remains in progress for the remaining raw tool controls, catalogs, build and
project dialogs, and imperative-UI architecture gate.

**Acceptance criteria:**

- Presenters do not create or mutate user-visible DOM.
- All visible values, selected states, disabled states, labels, classes, and ARIA properties derive
  from React props or subscribed snapshots.
- Canvas pointer capture, focus, measurement, file input, and native dialog behavior remain explicit
  typed refs.
- The architecture gate rejects new imperative visible UI outside a short documented allowlist.
- Material, entity, face, organization, project, build, and context-menu interactions retain browser
  coverage.
- The first slice contains no imperative creation or visible mutation of viewport context-menu DOM,
  and its React tests query roles, names, and states rather than implementation class names.

## C2 — Presenter state and command boundaries

**Problem:** Most presenters receive broad `EditorState` and `EditorElements` objects. The files are
separated, but mutation and dependency ownership remain global. Some event adapters can reach the
entire application, and multi-step operations manually coordinate peer presenters.

**Target:** Each domain exposes a small immutable snapshot and explicit command interface. The
composition root wires domains together without allowing arbitrary cross-domain mutation.

**Implementation direction:**

- Divide application state into document/session, selection, tools, project, build, collaboration,
  and renderer-presentation slices.
- Give collaboration an explicit discriminated lifecycle such as `solo`, `connecting`, `live`,
  `reconnecting`, `detached-local`, `conflict`, and `leaving`; do not encode these transitions as a
  loose collection of booleans.
- Make state private to its owning domain and publish readonly snapshots.
- Replace presenter-to-presenter calls with atomic commands on the owning domain.
- Replace whole-application event adapters with the smallest command interface needed by each input
  surface.
- Introduce a focused tool-controller registry rather than conditional growth in global adapters.
- Keep cross-domain orchestration in named application commands with clear transaction boundaries.

**Acceptance criteria:**

- No presenter receives the complete application state or complete DOM registry.
- Replacing/opening a document, changing tools, and joining/leaving collaboration are atomic named
  operations with one owner each.
- Dirty hosted reconnect bounds and the transition to a detached local copy have one testable owner;
  transport, React, and renderer code do not independently infer that policy.
- Dependencies for a presenter or React bridge are understandable from its constructor/type alone.
- Domain tests can instantiate the relevant slice without constructing the entire editor app.

## C3 — `EditorSession` composition

**Problem:** `EditorSession` is one large inherited implementation distributed across state,
selection, transforms, geometry, entities, objects, and history modules. Later layers depend on
abstract operations supplied by subclasses, and history/replay reconstructs dynamic subclass state.

**Target:** One public session coordinator composes small DOM-free domains around an explicit kernel.
History and replay use the same command model as ordinary editing.

**Implementation direction:**

- Define a minimal `SessionKernel` containing authoritative document, selection, history, and commit
  mechanics.
- Move topology, transforms, entities/materials, organization, and object commands into composed
  modules with explicit kernel capabilities.
- Group the public facade by domain; do not expose every internal helper as another session method.
- Express history entries and replay through explicit commands and state snapshots rather than
  `this.constructor` reconstruction.
- Preserve one commit point, one undo/redo stack, source identity behavior, and collaboration
  operation emission.

**Acceptance criteria:**

- Session behavior no longer depends on inheritance order or dynamic subclass construction.
- Domain modules depend only on declared kernel capabilities.
- A command produces the same document, selection, history, serialization, and collaboration result
  in direct execution and replay.
- Existing source-preservation, undo/redo, geometry, entity, organization, clipboard, and
  collaboration tests remain authoritative.

## C4 — Retained scene contributions

**Problem:** The editable-source renderer holds a broad mutable state bag, builds scene buffers from a
large positional input list, and uses `reuseWorldBuffers`/`reuseSolidBuffers` booleans at many call
sites. A document-size threshold creates a performance cliff instead of expressing actual changes.

**Target:** Scene updates rebuild only the contributions whose dependency keys changed, with retained
GPU buffers and explicit lifetime ownership.

**Initial contribution model:**

- World solid geometry and material batches
- Object/wireframe lines
- Local selection tint and always-visible outline
- Active face/tool previews and handles
- Grid and reference images
- Diagnostics
- Remote selections, cursors, cameras, and live edit previews

**Implementation direction:**

- Introduce an immutable `SceneInput` assembled from named domain snapshots.
- Give each contribution a typed input, dependency key/version, retained buffers, and disposer.
- Replace positional buffer construction and reuse booleans with contribution-level invalidation.
- Keep one command encoder/submission per editor frame and the current on-demand scheduler.
- Measure local drag, remote preview, selection-only, camera-only, and full-document changes before
  and after the cutover.
- Remove document-size special paths once retained invalidation makes them unnecessary.

**Acceptance criteria:**

- Camera-only frames do not rebuild document geometry.
- Local or remote drag previews update only the affected overlay/geometry contribution.
- Selection changes do not reconstruct unrelated world line data.
- Visual verification covers all four viewports, occluded selection outlines, active-face styling,
  remote selection tint, grids, and reference images.
- Stress fixtures show smooth scaling without a hard document-count behavior cliff.

## C5 — Route isolation and optional loading

**Problem:** The compiled-preview presenter dynamically imports the viewer package root, but editor
shell/runtime code statically imports `SnapshotStore` and `AnimationFrameScheduler` from that same
root. The bundler therefore keeps the package in the main editor route and reports the dynamic import
as ineffective. This is worth correcting where the boundary remains simple, but the important
performance boundary is the public home route—not an arbitrary maximum size for the editor someone
has explicitly chosen to open.

**Target:** `/` remains a cheap workspace shell that does not download or initialize the editor
runtime. `/editor` may load the substantial parser, tool, and GPU graph it needs. Optional systems
such as compiled BSP preview should remain lazy when a clean public module boundary supports it.

**Implementation direction:**

- Add a small public runtime subpath for framework-neutral snapshot and scheduling primitives, or
  move those primitives to a deliberately shared runtime package.
- Keep BSP parsing/rendering and `createWorldview` behind the compiled-preview dynamic import.
- Do not expose package internals or create a second copy of shared runtime state.
- Measure transferred code, parse/evaluation work, and initialization by route. Do not use a single
  bundle-size number as a proxy for perceived performance.
- Preserve `/new-map` prewarming as an intentional optimization because its successful action always
  enters the editor; prewarming must still not initialize presenters or WebGPU.

**Acceptance criteria:**

- The production `/` route does not fetch or initialize editor packages, TypeGPU/WebGPU code,
  presenters, WebMCP, compiler probes, collaboration UI, or editor-only assets.
- Navigating to an editor loads and initializes the complete authoring runtime reliably without an
  artificial chunk-size gate.
- If the compiled-preview split remains clean, the editor production build no longer reports its
  viewer-root dynamic import as ineffective and compiled BSP code loads on preview intent.
- Viewer, editor compiled preview, and public package entrypoint tests pass.
- Record before/after route graphs and initialization measurements in the completion note; editor
  size growth alone is not a failure when it represents intentional capability.

## C6 — Declarative runtime schemas

**Problem:** Untrusted data is repeatedly decoded with local `isRecord`, `string`, array, primitive,
and `unknown as` checks. [`worldview-project.ts`](../packages/worldview-editor/src/core/worldview-project.ts)
is the clearest example, but the pattern also appears in collaboration frames, document recovery,
build history, project-local state, WebMCP inputs, and hosted API responses. These decoders are
verbose, easy to make inconsistent, and duplicate their TypeScript interfaces.

**Target:** Boundary data has one declarative runtime schema that also supplies or verifies its
TypeScript type. Internal trusted calls remain ordinarily typed and do not pay repeated validation
cost.

**Dependency decision:** Adopt regular [Zod 4](https://zod.dev/packages/zod) as an explicit
production dependency rather than relying on the copy currently present transitively through
Cloudflare tooling. Its readable schema API is the default for this substantial browser application.
Consider the tree-shakable [`zod/mini`](https://zod.dev/packages/mini) entrypoint only if measurement
shows validation code materially harming the public route or a published consumer. Declare the
dependency in every published/runtime workspace that imports it. Do not import it from a root-only
development dependency.

**Schema ownership:**

- Public project manifests, map operations, and other authoring-domain inputs belong with the
  DOM-free `worldview-editor` core contract that owns their meaning.
- Collaboration frame schemas must be imported by both the browser client and collaboration
  service; they must not be independently reconstructed on either side.
- Hosted account/project/map/build wire schemas belong in a small DOM-free shared protocol package,
  not in either private application and not in the general editor core.
- Browser-local recovery, build-history, and workspace schemas remain next to their owning service
  unless another runtime truly consumes the same record.
- WebMCP schemas remain at the public tool boundary and reuse domain schemas for nested values.

**Implementation direction:**

- Start with `WorldviewProjectManifest`, preserving contained POSIX-path checks, uniqueness,
  per-game definition-format validation, defaults, normalization, and stable
  `WorldviewProjectParseError` messages.
- Define types from schemas with `z.infer` when the schema is authoritative; otherwise make the
  schema statically satisfy the existing domain contract so the two cannot silently drift.
- Replace collaboration frame narrowing while retaining the pre-parse byte limit, bounded array and
  string lengths, finite-number checks, strict discriminated unions, and semantic operation checks.
- Replace unchecked hosted JSON casts with shared request/response schemas and structured protocol
  errors.
- Migrate persisted browser records and WebMCP inputs in focused slices with their existing invalid
  data behavior covered first.
- Convert schema issue paths into domain-specific errors at the boundary. Do not leak raw Zod errors
  into UI copy or public HTTP responses.
- Validate once at ingress. Do not scatter `.parse()` calls through render, gesture, document, or
  transaction hot paths.
- Do not use Zod to replace resource limits, authorization, transaction invariants, geometry
  validity, or other semantic checks that require domain context.

**Acceptance criteria:**

- Production boundary decoders contain no repeated generic `isRecord`/primitive validation helpers
  unless a documented performance measurement requires one.
- Project manifest, collaboration, hosted wire, persisted-record, and WebMCP schemas have focused
  valid/invalid/oversized fixtures.
- Unknown fields, normalization, optional/default values, and error paths have an explicit policy
  per external format.
- Collaboration and HTTP tests prove malformed values cannot reach domain operations.
- The package lock and importing workspace manifests declare the chosen Zod version directly.
- Completion records meaningful changes to public-route and published-package bundles for
  visibility. Schema readability and correctness take precedence unless measurement demonstrates a
  user-facing regression.

## C7 — IndexedDB infrastructure with `idb`

**Problem:** Request-to-promise, transaction completion, version/open handling, and error translation
are duplicated across build history, document recovery, project-local state, asset mounts, and parts
of collaboration state.

**Target:** The established [`idb`](https://github.com/jakearchibald/idb) package handles IndexedDB
promise, transaction, upgrade, and schema typing mechanics while each service retains its own schema
and domain policy.

**Dependency decision:** Adopt `idb` as an explicit editor-app production dependency. Do not build a
parallel generic promise wrapper around the native API, and do not turn `idb` into a repository/ORM
abstraction.

**Implementation direction:**

- Define typed `DBSchema` contracts and migrate services to `openDB`, enhanced requests, and
  `transaction.done`.
- Keep store names, records, retention policy, and recovery semantics in their domain services.
- Avoid a generic repository/ORM layer and avoid combining unrelated data merely to remove lines.
- Model collaboration outbox metadata needed for bounded hosted reconnect and quarantined local-copy
  recovery explicitly.

**Acceptance criteria:**

- Handwritten IndexedDB request/transaction lifecycle boilerplate is removed.
- Domain schemas and failure messages remain explicit.
- Recovery, recent-project, asset mount, collaboration outbox, and build-history tests cover upgrade,
  abort, quota/error, and successful persistence paths.
- Hosted outbox tests cover clean long disconnects, dirty in-window replay, time/count/byte limits,
  crash/reload across the reconnect bound, and durable transition to a quarantined local copy.

## C8 — Test-suite decomposition

**Problem:** The editor core and browser tests have grown into multi-thousand-line files. They contain
valuable coverage but make ownership, fixture cost, and focused execution difficult to understand.

**Target:** Tests follow production domains and share only intentional fixtures/helpers. A small
end-to-end suite retains cross-domain confidence.

**Dependency decision:** Add `fast-check` and `@fast-check/vitest` as development dependencies for
seeded property-based tests. Use them where generated sequences and shrinking provide value—session
commands, collaboration ordering/reconnect, undo/inverses, schema decoding, and persistence state
machines—not as a mechanical replacement for readable example and browser tests.

**Implementation direction:**

- Split core tests by document/source, history, selection, transforms, geometry/CSG, entities,
  organization, clipboard, gestures, and collaboration operations.
- Split browser tests by shell/routes, project persistence, editor interaction, materials/entities,
  collaboration, builds, and compiled preview.
- Extract deterministic map builders and interaction helpers; avoid a universal mutable fixture.
- Add properties for collaboration idempotence, deterministic ordering, non-conflicting convergence,
  same-brush conflict safety, personalized undo, persist-before-ack behavior, and the bounded
  reconnect/detach state machine.
- Keep expensive GPU/browser stress and visual suites separately invokable for capable hosts rather
  than weakening them to fit lightweight CI.

**Acceptance criteria:**

- A domain change has an obvious focused test command and file.
- Shared helpers do not hide the document state or user actions relevant to an assertion.
- Existing behavioral coverage is retained or strengthened, not silently discarded during moves.
- CI remains bounded while local/full verification remains documented and runnable.

## C9 — Viewer renderer decomposition

**Problem:** The compiled-world renderer owns pipelines, materials, lightstyles, sprites,
walkability, resize/capture, visibility, lifecycle, and draw encoding in one large class.

**Target:** A small renderer facade owns lifecycle while focused runtime objects own resources and
frame planning.

**Implementation direction:**

- Extract pipeline/resource creation, material resources, pure frame planning, world-pass encoding,
  and overview/capture targets.
- Keep draw ordering and TypeGPU resource schemas explicit.
- Share only low-level runtime primitives with the editor; do not build a universal renderer
  abstraction.

**Acceptance criteria:**

- The public viewer API and custom element behavior remain unchanged unless the product plan is
  intentionally updated.
- Resource ownership and disposal are visible from the facade.
- Frame planning can be tested without a GPU device.
- BSP29/BSP30, lightstyle, sprite, transparency, overview, and capture coverage remains intact.

## C10 — Hosted service handler boundaries

**Problem:** The hosted service keeps a large regex/method route chain and anonymous response
assembly in its main server module. Runtime payload correctness is addressed by C6; route and
transaction ownership still need their own boundary.

**Target:** Focused route handlers consume and produce C6's shared contracts while keeping security
and transaction policy visible.

**Implementation direction:**

- Break the service's regex/method chain into focused route handlers without adding a heavyweight
  framework solely for routing.
- Use the shared schema response types or typed response constructors on the service side.
- Keep authentication, authorization, version checks, and database transactions visible at each
  route boundary rather than hiding them in generic middleware.

**Acceptance criteria:**

- Route matching and handler modules have focused tests.
- Authentication, stale-version, unauthorized, and server-error behavior remains deterministic.
- Service handlers and editor callers compile against C6's same contract definitions.
- Root build, typecheck, service integration tests, and production container build continue to cover
  the service.

## C11 — Broaden architecture enforcement

**Problem:** Current checks focus on `apps/editor` and `packages/worldview-editor`, enforce a generous
file-size ceiling, and reject only a subset of DOM and GPU ownership regressions. The viewer,
services, visible imperative UI, broad state access, and route/build boundaries are under-enforced.

**Target:** Automated checks protect the boundaries established by completed cleanup work without
encoding fragile implementation trivia.

**Implementation direction:**

- Cover both rendering packages, viewer app, hosted service, and shared wire/runtime entrypoints.
- Reject imperative visible UI outside the documented ref allowlist.
- Reject core DOM/WebGPU/TypeGPU imports and app imports of package internals.
- Assert the public home/editor route separation in a build-level check.
- Introduce focused size/complexity budgets for coordination files rather than treating line count as
  the only quality signal.
- Keep exceptions documented, narrow, and owned next to the check.

**Acceptance criteria:**

- Each invariant in this document has either a test/check or a documented reason it requires review.
- A deliberate violation fails with an actionable message and a link to the governing document.
- Checks run from the root scripts used locally and in CI.

## Verification baseline

Every cleanup slice should choose the smallest sufficient subset first, followed by the relevant
root gates before completion:

```sh
npm run format:check
npm run lint
npm run typecheck
npm run check:architecture
npm test
npm run build
```

Editor interaction or rendering changes must also use the repository's
`verify-worldview-editor` skill and the focused browser/WebMCP workflow it documents. GPU stress and
visual checks should run on a capable host when lightweight CI cannot provide meaningful WebGPU
evidence.

## Completion log

Add one concise entry per completed workstream. Do not use this as a chronological development
journal; retain only verification and remaining intentional exceptions.

| Date | ID  | Result                              | Verification | Remaining exceptions |
| ---- | --- | ----------------------------------- | ------------ | -------------------- |
| —    | —   | No cleanup workstream completed yet | —            | —                    |
