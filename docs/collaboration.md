# Collaboration contract

Worldview is a local-first solo editor with optional multiplayer. Collaboration wraps committed
`EditorSession` transactions; it does not replace `.map`, make local editing network-dependent, or
move pointer, preview, renderer, camera, or asset state into a remote service.

Public rooms belong only to authorized hosted maps. Local projects never contact the collaboration
service. The broader hosted-project and permission model lives in
[`server-side-projects.md`](./server-side-projects.md).

## Authority and data flow

One hosted map has one named SQLite-backed `MapCell`. It is the only hosted source/document
authority and atomically persists the accepted semantic operation, resulting source and document,
hash, receipt, and next map version before acknowledgement or broadcast. In-memory state is a
reconstructible cache.

```text
visible control / WebMCP
  → EditorSession preview and validated local commit
  → IndexedDB outbox
  → optimistic local presentation
  → ticketed MapCell WebSocket
  → validate, persist, order, acknowledge, broadcast
```

Operations—not pointer events or replacement snapshots—are the durable unit. Each has globally
unique operation/transaction and actor IDs, base map version, target object revisions, schema
version, label, and typed edits. Application is deterministic and idempotent.

Hosted source is bounded to 2 MiB. Commercial resources, WADs, PAKs, palettes, sprites, sounds,
compiled BSPs, and browser handles never enter room storage. Participants resolve the project
resource stack through the ordinary project services.

## Durable edits, conflicts, and undo

Validated brush geometry is atomic for V0:

- independent objects/properties merge normally;
- same-brush geometry edits are accepted, rebased, rejected, or recorded as an explicit conflict
  against the target revision rather than merged plane-by-plane;
- delete/edit, clip/transform, ownership, and group restructuring use named domain rules;
- every accepted result passes the same document and convex-brush checks as a solo commit.

Undo authors a conditional inverse operation for the participant's latest still-applicable
transaction. It never rewinds the global room or restores a whole historical document over remote
work. Partial or conflicting inversion is explicit.

`@jackharrhy/worldview-editor/core` owns semantic edits, validation/application, before/after diff,
inverse derivation, and the ordered idempotent replica buffer. `@worldview/protocol` owns bounded
wire schemas shared by the browser and service.

## Presence and local responsiveness

Presence is lossy, throttled, coalesced, and non-historical. It carries participant identity/color,
pointer ray, viewport/tool, selections, camera, advisory occupancy, and sequenced gesture previews.
It never enters SQLite, source, history, or the outbox and disappears on disconnect.

One transport-independent lifecycle owns `solo`, `connecting`, `live`, `reconnecting`,
`detached-local`, `conflict`, and `leaving`. React renders that readonly lifecycle snapshot; the
socket runtime reports events but cannot infer UI state, and late callbacks cannot overwrite a
conflict or leave transition. A focused collaboration session owns join, leave, room lifetime,
presence cadence, and remote-preview cleanup outside the application composition root.

The initiating client renders its candidate immediately. Remote transform, face, topology, and
creation previews use bounded semantic patches and participant-colored overlays. Network delay
cannot delay local feedback, and a commit/cancel clears the matching preview.

## Offline policy

- Local maps and projects remain fully editable offline for an unbounded duration.
- A clean hosted tab may reconnect at any time by adopting the latest room snapshot.
- A dirty hosted tab may reconcile only inside bounded elapsed-time, operation-count, and encoded-byte
  limits: initially 15 minutes, 200 operations, and 4 MiB of encoded operation frames.
- The durable dirty clock uses the first observed disconnect, falling back to the oldest pending
  edit after a crash. Reaching a WebSocket handshake does not reset it; acknowledgement removes
  durable queue entries, and the clock disappears only when the queue is clean.
- Exceeding a bound atomically creates a durable, editable local working copy and removes the stale
  operations from the replay queue. The home screen and `/local-map/:copyId` route reopen that copy,
  including later recovery snapshots. Rejoining intentionally adopts the authoritative MapCell
  snapshot; V0 does not promise indefinite multi-master merge.
- Leaving multiplayer retains an ordinary local `.map` working copy.

## Replication decision

The V0 engine is Worldview's semantic operation ledger. Yjs and Automerge were evaluated behind the
same 8,000-brush/1,000-operation harness; celld is a room runtime, not a CRDT.

| Engine          | Initial bytes | Increment bytes | Initial encode | 1,000 edits |    Hydrate |
| --------------- | ------------: | --------------: | -------------: | ----------: | ---------: |
| Semantic ledger |    12,932,897 |       1,854,439 |        38.7 ms |      4.8 ms |    33.9 ms |
| Yjs 13.6        |    11,716,868 |       1,674,510 |        61.7 ms |     16.5 ms |   100.5 ms |
| Automerge 3.4   |       696,456 |       1,850,682 |    15,156.3 ms |  1,862.6 ms | 9,171.1 ms |

These are directional measurements from the development host, not general benchmarks. The semantic
ledger won because it is cheap, inspectable, and validates domain conflicts before acceptance. Yjs
remains the leading option if decentralized merge becomes a real product requirement; Automerge's
cost did not fit this fixture.

Reference systems informing behavior are Figma multiplayer, Local-First Software, Yjs, Automerge,
WAD Together, and tldraw sync-core. Their implementation does not enter this MIT repository without
a separate license review.

## Runtime and deployment

`apps/collaboration-service` targets Workers/Durable Objects semantics and runs on Wrangler/workerd
or the maintained `jackharrhy/celld` fork. It provides one `MapCell` per map, private SQLite,
RPC initialization/snapshot/submit, hibernating WebSockets, actor-bound sockets,
persist-before-ack operations, and non-durable presence. Clients see no Celld-specific types.

Local development remains available through `npm run dev:collaboration:celld`.
Production uses one `ghcr.io/jackharrhy/worldview-celld:latest` container (`Dockerfile` target
`collaboration`), built with `ghcr.io/jackharrhy/celld:latest`. On each start it diagnoses the
store, deploys its bundled Worker, and execs Celld. No Azurite or bootstrap container is needed.
The web/compiler application stays separate and also publishes a `:latest` image.

The existing `/var/lib/celld` volume holds authoritative objects at
`object-store/objects.sqlite3`; `state-sqlite` contains disposable replicas. The default bucket is
`sqlite:///var/lib/celld/object-store/objects.sqlite3` with `CELLD_DURABILITY=bucket`.
Run one runtime per store. Back up the authoritative SQLite database consistently, including its
WAL when present; deleting a replica cache must never delete `object-store`.

Traefik exposes only `/sync/maps/*`. The Worldview service mints short-lived signed map tickets
after 4orm session and project-role authorization; the cell trusts the ticket principal and never
client-supplied identity. Hosted project metadata and resource files remain in the web service's
existing data volume. Collaboration has no R2 or asset binding.

This is a single-host deployment. Fleet recovery and multi-host operation remain outside this
configuration; related work is tracked in [the backlog](./cleanup-plan.md#h2-collaboration-fleet-hardening).

### Newport migration

The earlier 2026-09-05 rollout combined Worker preparation and runtime while retaining Azurite.
The SQLite transition preserves that workflow and the `/var/lib/celld` mount. During its maintenance
window, stop writers, retain consistent Azurite and runtime backups, copy the complete object
namespace with the fork's verified migration tool, and start with a fresh `state-sqlite` directory.
Compare every existing map's version, source hash, document, and checkpoints before resuming work.
The preserved source snapshot is only a rollback point before new writes.

Routine updates use `docker compose pull` and recreate the existing service with `:latest`.
`npm run deploy:collaboration:celld` remains available for an explicit deployment to `CELLD_BUCKET`.

## Verification

The collaboration commands and live-infrastructure requirements live in
[the verification guide](./verification.md#collaboration).

Collaboration is dependable only while solo editing works with the service absent, short dirty
disconnects survive restart and reconcile within their bounds, detached work survives locally,
connected replicas converge, accepted geometry stays valid, personalized undo preserves remote
work, and room state exports to source-safe `.map`.
