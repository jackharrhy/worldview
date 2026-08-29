# Collaboration architecture research

Worldview remains a local-first solo editor. Collaboration is an optional mode around committed
`EditorSession` transactions; it does not replace `.map` as the portable authoring format, require
a network for ordinary editing, or move pointer, camera, preview, renderer, or asset state into a
remote service.

This note records the current collaboration direction and implemented foundation. The editor now
ships an accountless live-link mode over the semantic operation layer, convergence buffer, offline
outbox, multi-tab transport, and portable `MapRoom` service. Game-inspired generated aliases and
colored badges make each participant's active viewport and selection state visible without an
account profile.

## Reference systems

- [Figma multiplayer](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) informs
  stable object IDs, property-granular conflicts, offline-generated identities, authoritative room
  ordering, and personalized undo.
- [Local-First Software](https://martin.kleppmann.com/papers/local-first.pdf) supplies the product
  principle: the local copy remains primary and useful without the service.
- [Yjs updates](https://docs.yjs.dev/api/document-updates),
  [offline persistence](https://docs.yjs.dev/getting-started/allowing-offline-editing),
  [awareness](https://docs.yjs.dev/getting-started/adding-awareness), and
  [selective undo](https://docs.yjs.dev/api/undo-manager) are the first CRDT comparison target.
- [Automerge](https://automerge.org/docs/reference/concepts/) is the second comparison target for
  immutable snapshots, explicit conflicts, history, branching, and transport-independent offline
  synchronization.
- [WAD Together](https://github.com/Donitzo/wad-together) is the closest game-map-editor reference:
  authoritative rooms, primitive operations and inverses, per-user undo, locally derived geometry,
  and resources that remain local to each participant.
- [tldraw sync-core](https://github.com/tldraw/tldraw/blob/main/packages/sync-core/DOCS.md) informs
  optimistic record diffs, server validation, room/session separation, and distinct durable and
  presence channels.
- [celld](https://celld.dev/docs/) is the preferred room-runtime experiment: self-hosted Workers and
  Durable Objects semantics, one named cell and private SQLite database per room, hibernating
  WebSockets, and state replicated to an operator-owned object-storage bucket.

These are behavior and architecture references. No implementation enters this MIT repository
without a separate license review and provenance record. celld is Apache-2.0 licensed.

## Runtime direction: portable Durable Object rooms

The collaboration service will target the Cloudflare Workers and Durable Objects programming
model, with celld as the preferred self-hosted runtime and workerd/Cloudflare as compatibility
oracles and optional deployment targets. Client and package APIs must not expose celld-specific
types or assume a particular hosting vendor.

One collaborative map room is one named Durable Object/cell:

```text
room ID
  └─ MapRoom cell / Durable Object
       ├─ private SQLite
       │    ├─ room metadata and schema version
       │    ├─ chunked baseline/checkpoints
       │    ├─ committed operation ledger
       │    ├─ actor acknowledgements and outbox cursors
       │    └─ conflicts and audit metadata
       ├─ hibernatable client WebSockets
       └─ in-memory derived document and connection cache
```

The room is the authoritative online sequencer and validator. It persists an accepted operation
and resulting checkpoint metadata before acknowledging or broadcasting it. In-memory state is only
a cache and must be reconstructible after hibernation, eviction, process restart, or node loss.

Large source baselines and checkpoints are chunked in SQLite behind a storage port so the same
program respects the portable Durable Objects per-value boundary. Commercial/shareware resources,
WADs, PAKs, palettes, sprites, sounds, compiled BSPs, and browser file handles never enter room
storage. Participants resolve the project resource stack locally.

celld uses an S3-compatible, Google Cloud Storage, or Azure Blob bucket as fleet authority and
durability storage. Its current alpha has no local-filesystem mode, managed ingress, public TLS,
user authentication, or hostile multi-tenant security boundary. Therefore:

- local development uses an explicit test bucket or a local object store proven to implement the
  required conditional writes;
- public TLS, authentication, authorization, rate limits, and room-token validation live at the
  application ingress;
- the internal celld listener stays on a private network or encrypted overlay;
- bucket credentials are fleet-root credentials and receive one narrowly scoped bucket/prefix;
- production use waits for fault, upgrade, backup/restore, and security drills rather than relying
  on alpha status or benchmark claims;
- every room conformance fixture runs against workerd/Cloudflare-compatible local execution and
  celld, with equivalent observable results.

## Client and transaction boundary

`EditorSession` remains the only local mutation coordinator. Solo mode has no collaboration
dependency. Multiplayer mode adds a collaboration adapter after validation and at atomic commit:

```text
visible control / WebMCP
  → EditorSession command and preview
  → validated local commit
  → CollaborationOperation in local IndexedDB outbox
  → optimistic local presentation
  → optional MapRoom WebSocket
  → persist, validate, order, acknowledge, broadcast
```

The durable unit is a semantic operation, not a `PointerEvent`, drag preview, React store update,
GPU buffer, full replacement document, or raw canvas state. Each operation carries a globally
unique operation/transaction ID, actor ID, base room version, target object revisions, schema
version, label, and typed semantic edits. Application of an operation is deterministic and
idempotent.

Disconnect never disables editing. Committed local operations remain in the IndexedDB outbox and
reconcile when a room becomes available. Leaving multiplayer produces an ordinary local `.map`
working copy; joining multiplayer imports or forks a deliberate room baseline rather than silently
changing the current document's authority.

## Durable state versus presence

Durable state contains only canonical semantic edits, ordering, acknowledgements, checkpoints, and
conflict/audit records. Presence is an independent, lossy, non-historical channel for participant
identity/color, cursor or pointer ray, active viewport/tool, selection IDs, camera pose, advisory
object occupancy, drag previews, and follow/present state.

Presence is throttled and coalesced, does not enter SQLite, does not dirty `.map`, and disappears on
disconnect. Durable operation frames may be batched for transport but retain transaction boundaries.

## Geometry and conflict policy

Replica convergence alone does not guarantee valid convex geometry. For the first collaboration
version, validated brush geometry is an atomic object-level value:

- independent edits to different brushes or properties merge normally;
- concurrent edits to the same brush geometry do not merge plane-by-plane;
- the room accepts, rebases, rejects, or records a same-brush conflict using base object revisions;
- deletion versus edit, clip versus transform, and group restructuring have explicit domain rules;
- every accepted result passes the same document and brush validation as a local commit.

Advisory presence can warn that another participant is editing a brush, but it is not a correctness
lock. Later experiments may add leases or more granular geometry operations only with convergence,
validity, and undo evidence.

## Personalized undo

Undo in a room commits a new inverse operation for the latest still-applicable transaction authored
by that participant. It never rewinds the global room snapshot or blindly restores a historical
whole document over remote work. Redo is derived from the state observed when undo occurred.

Existing `HistoryEntry` before/after values and insertions are the starting material, but room undo
also needs author/transaction IDs, stable target revisions, conditional inversion, and explicit
partial/conflict results. Yjs selective origins and WAD Together's primitive inverses are research
references; neither replaces Worldview's domain-aware rules.

## CRDT decision gate

celld is not a CRDT and does not decide offline merge semantics. Before selecting Yjs, Automerge,
or a custom operation/rebase layer, implement the same collaboration schema behind a replaceable
port and measure it with the generated 8,000-brush fixture.

The comparison must cover initial and incremental encoded size, IndexedDB/storage size, hydration,
heap/Wasm memory, 1,000 committed operations, reconnect traffic, checkpoint/compaction cost,
selective undo, explicit conflict inspection, and invalid-geometry prevention. Yjs is the first
prototype because it supplies awareness, IndexedDB providers, transaction origins, and selective
undo; Automerge remains a required comparison for offline history and inspectable conflicts.

## Bake-off result

`npm run test:collaboration-bakeoff` runs the same generated 8,000-brush baseline and 1,000-operation
ledger through plain semantic JSON, Yjs 13.6, and Automerge 3.4. The first checked run on the
headless development host produced this directional result (timings vary by machine):

| Engine                    | Initial bytes | Increment bytes | Initial encode | 1,000 edits |    Hydrate |
| ------------------------- | ------------: | --------------: | -------------: | ----------: | ---------: |
| semantic operation ledger |    12,932,897 |       1,854,439 |        38.7 ms |      4.8 ms |    33.9 ms |
| Yjs                       |    11,716,868 |       1,674,510 |        61.7 ms |     16.5 ms |   100.5 ms |
| Automerge                 |       696,456 |       1,850,682 |    15,156.3 ms |  1,862.6 ms | 9,171.1 ms |

The fixture uses the editor's real six-face box brushes and encodes each complete brush as the atomic
geometry value required by the conflict policy. The custom semantic ledger is the V0 collaboration
engine. It is substantially easier to validate before acceptance, produces inspectable domain
conflicts, and wins this workload's CPU envelope. Yjs remains the leading future option if
decentralized peer merge becomes more important; its wire size is competitive. Automerge's compact
baseline and inspectable conflicts are useful, but its current edit and hydration costs do not fit
the editor's 8,000-brush target.

## Implemented foundation

- `@jackharrhy/worldview-editor/core` exports typed semantic edits, atomic validation/application,
  semantic before/after diffing, inverse edit derivation, and an ordered idempotent replica buffer.
- The seeded three-replica test covers delay, reverse ordering, and duplicate delivery. A geometry
  policy test proves stale same-brush edits conflict atomically.
- The editor app contains an opt-in `CollaborationController`: IndexedDB is written before
  `BroadcastChannel` announcement, and server acknowledgement clears only its matching outbox row.
  Its WebSocket client replays the outbox after room readiness, applies acknowledgements and remote
  commits, keeps presence lossy, and reconnects with bounded exponential backoff.
- Personalized undo is a new conditional inverse operation authored by the original participant;
  applying it through the session bridge does not rewind remote history or create a second local
  collaboration transaction.
- `EditorApplication.joinCollaboration()` deliberately initializes or adopts a room baseline and
  owns the bridge/socket lifetime; `leaveCollaboration()` disconnects them while retaining the
  ordinary local document. Neither the constructor nor `start()` enables multiplayer implicitly.
- The editor's Live collaboration dialog creates a 144-bit room token, places it only in the URL
  fragment, initializes the current map as the room baseline, and exposes a copyable link. Opening
  that link automatically joins with a stable browser-local actor ID and an editable guest name.
  Leaving retains an ordinary local working copy. Presence carries colored selections, world-space
  pointers, viewport/tool state, and sequenced gesture previews. Candidate documents are reduced to
  bounded semantic edit patches and rendered as remote solid-and-wireframe overlays; they never enter room
  history, source serialization, hit testing, SQLite, or the offline outbox. A durable commit or
  cancellation clears its matching preview.
- `apps/collaboration-service` is a Wrangler and celld-compatible Worker with one SQLite-backed
  `MapRoom` per room, generated binding types, RPC baseline/snapshot/submit methods, hibernating
  WebSockets, persist-before-ack operations, actor-bound sockets, and non-durable presence.
- Workers-runtime tests verify SQLite recovery after Durable Object eviction. `wrangler deploy
--dry-run` verifies the executable bundle without making a remote deployment.

Local development is pinned to celld 0.4.0. Run `npm run dev:collaboration:celld`; celld's local
development mode rebuilds the Worker and persists its object store beneath
`apps/collaboration-service/.celld/dev`, without Cloudflare credentials, Docker, or a remote bucket.
The editor's unconfigured localhost endpoint is `http://127.0.0.1:8787`, matching this command.
`npm run dev:collaboration` remains the workerd compatibility path through Wrangler.

The accountless room token is a possession capability, not an account or authorization system.
Rooms are not end-to-end encrypted, revocable, permissioned, or suitable for public hostile ingress;
the current service remains Tailnet/private-ingress only. Authentication, permissions, room
revocation, rate limits, and richer conflict presentation remain subsequent delivery work.

The hosted-project phase closes that public-ingress limitation without changing the semantic
operation engine. 4orm-backed Worldview sessions and revocable guest grants mint short-lived map
tickets; the Worker validates a ticket before routing the connection to the room. Hosted
membership, personal folders, source ownership, resources, and builds live outside the room as
described in [`server-side-projects.md`](./server-side-projects.md). The existing accountless flow
remains available for deliberately local maps.
`npm run test:collaboration-celld-compat` enforces celld's supported Wrangler-key and binding
boundary locally. `npm run test:collaboration-celld-live` is the opt-in, infrastructure-backed gate:
it starts or reuses loopback-only Azurite with a persistent Docker volume, creates an isolated test
container, runs celld's conditional-write diagnostics, deploys the real Worker, submits a real
WebSocket operation, kills celld with `SIGKILL`, deletes its local replica, and requires a clean
node to recover the exact room version and brush from Azure Blob state. It requires Docker, celld,
and the pinned Azurite image and intentionally remains outside the ordinary hermetic `check` gate.
The supported self-hosted baseline is celld 0.4.0. Upgrades from a 0.3.x fleet require a complete
fleet stop before starting 0.4.0 because their peer tunnel and large-value protocols cannot mix.

Newport's initial public deployment deliberately uses a single celld 0.4.0 node and persistent
Azurite on the same host. This is an availability tradeoff for a small, non-critical service, not a
qualified production fleet: losing the host or its data volume can lose collaboration rooms.
Traefik sends only `https://worldview.harrhy.xyz/rooms/*` to celld; its operator listener remains on
loopback. The Worldview service and celld read the same realtime-ticket secret, while accountless
rooms remain possession-capability links.

After starting Newport's `worldview-azurite` service, deploy the Worker explicitly from a clean
Worldview checkout with `npm run deploy:collaboration:celld-azurite`. The command creates the fixed
`worldview-celld` blob container when absent, runs celld's storage diagnostic, and commits the
real collaboration Worker deployment. The `worldview-celld` service then loads that deployment from
Azurite. Back up both `worldview_azurite` and `worldview_celld`; moving to a qualified object store
replaces this operator command and the celld storage environment without changing the Worker or
browser protocol.

## Delivery experiments and gates

1. **Done:** Define typed, deterministic, idempotent collaboration operations and domain conflict rules.
2. **Foundation done:** Build a seeded three-replica simulator with delayed, duplicated, reordered, and disconnected
   delivery; assert convergence, brush validity, unique IDs, personalized undo, and parseable save
   output.
3. **Done:** Add a local multi-tab `BroadcastChannel` transport and IndexedDB outbox with no server.
4. **Foundation done:** Implement one `MapRoom` Worker/Durable Object with SQLite, hibernatable WebSockets, chunked
   checkpoints, schema migration, acknowledgements, and ephemeral presence.
5. **Done for the portable contract:** Run the room contract against local workerd/Cloudflare tooling and live celld with Azurite.
6. **Single-node kill/restore done; fleet hardening pending:** Exercise multi-node ownership handoff, bucket
   throttling/outage, kill -9, restore, rolling/stop-the-world upgrade policy, and backup recovery.
7. **Accountless V0 done:** Add live-link room creation, automatic join, leave-with-local-copy,
   browser-local guest identity, connection state, participant names, colored selections and
   pointers, live transform/face/topology/creation previews, and conflict feedback. Authenticated
   identity, permissions, and revocation remain deferred.
8. **Done for V0:** Select the replication engine only after the Yjs/Automerge/custom-operation bake-off and fixed
   real-map performance gates pass.

Collaboration is not delivered until ordinary solo editing remains fully functional with the
collaboration service absent, offline commits survive a restart, all replicas converge after
reconnection, accepted geometry is valid, personalized undo preserves remote work, and room state
can be exported to a portable source-safe `.map`.
