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
  limits. The intended initial time bound is 15 minutes.
- Exceeding a bound creates a durable, editable local working copy and quarantines the stale outbox.
  Rejoining intentionally adopts the authoritative MapCell snapshot; V0 does not promise indefinite
  multi-master merge.
- Leaving multiplayer retains an ordinary local `.map` working copy.

The operation/outbox foundation exists. Durable enforcement of every disconnect bound and the
automatic quarantined-copy transition remain cleanup C7.

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
or celld 0.4.0. It provides one `MapCell` per map, private SQLite, RPC initialization/snapshot/submit,
hibernating WebSockets, actor-bound sockets, persist-before-ack operations, and non-durable presence.
Clients see no celld-specific types.

Local celld development persists beneath `apps/collaboration-service/.celld/dev`:

```sh
npm run dev:collaboration:celld
```

Newport runs one celld node with persistent loopback-only Azurite, an idempotent deployer bootstrap,
and Traefik routing only for `/sync/maps/*`. The Worldview service mints short-lived signed map
tickets after 4orm session and project-role authorization; the cell trusts the ticket principal and
never client-supplied identity.

This is a suitable small single-host deployment, not a qualified fleet. Remaining deployment work:

- multi-node ownership handoff and split/failure behavior;
- bucket throttling/outage and conditional-write drills;
- backup/restore verification and documented recovery objectives;
- upgrade drills and a qualified object store outside the same host failure domain;
- ingress/security review for a hostile multi-tenant deployment.

Back up both `worldview_azurite` and `worldview_celld`. A future object-store adapter must not change
the Worker or browser protocol.

## Verification

```sh
npm run test:collaboration-bakeoff
npm run test:collaboration-celld-compat
npm run test:collaboration-celld-live
```

The live gate starts/reuses loopback Azurite, deploys the real Worker through celld, submits a real
WebSocket operation, kills celld, deletes local replica state, and requires recovery from blob
storage. It remains opt-in because it needs Docker and host infrastructure.

Collaboration is dependable only while solo editing works with the service absent, short dirty
disconnects survive restart and reconcile within their bounds, detached work survives locally,
connected replicas converge, accepted geometry stays valid, personalized undo preserves remote
work, and room state exports to source-safe `.map`.
