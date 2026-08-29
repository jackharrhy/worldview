# Server-side projects

Hosted projects are a peer to browser-local projects. A hosted project needs no filesystem handle:
maps, source ownership, resource mounts, checkpoints, collaboration operations, build records, and
artifacts are remote. IndexedDB remains an offline cache and outbox, not the server authority.

## Services and storage

`apps/worldview-service` is the same-origin Node application backend. It serves the built editor,
owns 4orm callbacks and Worldview sessions, exposes project/build/resource APIs, and authorizes
realtime entry. Newport is the first deployment target.

SQLite in WAL mode stores relational metadata: users, sessions, projects, memberships, personal
folders, map identities, resource mounts, builds, and artifact references. Large
immutable values use a content-addressed `BlobStore`; the first implementation is an atomic-write
filesystem directory on a backed-up server volume. The interface does not expose filesystem paths
and can later target S3 or Azure Blob without changing editor contracts.

Each hosted map keeps one named `MapCell` Durable Object/cell as its coordination atom. The room
persists original `MapSourceState`, the validated `MapDocument`, ordered semantic operations,
versions, checkpoints, acknowledgements, and conflicts before acknowledging edits. Presence and
gesture previews remain ephemeral. Project metadata does not move into the map room.

## Project and permission model

- Owners manage project configuration, members, resource mounts, maps, builds, and archive
  or deletion.
- Member editors edit maps, create maps, use resources, and run builds.
- Member viewers inspect, preview, view history, and export.
- Personal folders organize references to accessible projects. Their arrangement is never shared.

Only 4orm-backed Worldview sessions receive short-lived, signed map connection tickets after
project authorization. The collaboration Worker rejects accountless rooms, verifies the ticket
before routing to the room, and treats the attached principal and role—not client frames—as
authoritative.

## Editor behavior

The home screen presents Local and Hosted sections with equal weight. Hosted routes are stable
`/projects/:projectId` and `/projects/:projectId/maps/:mapId` URLs. Project access crosses a common
workspace port with local-filesystem and remote implementations; core map/session code remains
free of DOM, HTTP, and filesystem concepts.

Every hosted edit is a semantic MapCell operation. UI state is `Saving`, `Saved`, or `Offline`;
acknowledged operations are durable, named checkpoints are explicit, and `.map` export remains available.
Source snapshots are produced through the source-preserving save planner, so untouched source
round-trips exactly and unsafe opaque edits remain blocked.

Remote maps cache their last snapshot, map version, resource manifest, and pending operations in
IndexedDB. Reconnection uses the existing deterministic operation/rebase rules. Resources use a
SHA-256 browser cache and never silently update when a remote provider changes.

The application database never stores hosted source text, a source blob pointer, a second source
version, or map checkpoints. Initial HTTP loads, live joins, reloads, checkpoints, and builds all
resolve the same named MapCell and its single monotonically increasing `mapVersion`.

## Remote builds

Build creation names a map version, fixed server profile, and preview/final quality. The service
retrieves the canonical source and pinned resources itself, queues the job, and stores bounded logs,
diagnostics, source fingerprint, and content-addressed artifacts. Local helpers and hosted builds
implement the same editor build contract; hosted artifacts are downloaded through authenticated,
membership-checked content-addressed routes. Browser-provided source or executable paths are not
accepted.

Hosted map source is limited to 2 MiB. One user may have one active build and submit at most six
builds per hour; the process admits no more than four active/queued jobs globally and retains only
three pending jobs behind its single worker. Interrupted jobs fail closed on service restart.
Ingress request limits, compiler request/asset/artifact ceilings, stage timeouts, and container
CPU/memory/scratch/PID/file-descriptor limits provide independent containment layers.

Collaboration rooms accept at most 32 live sockets and four sockets for one actor. Durable edits
are limited to 240 per connection per minute, and individual WebSocket frames are capped at 512
KiB. Ephemeral cursor and gesture presence remains separate from durable edit admission.

Quake and GoldSrc use separate constrained internal compiler profiles with operator-provided,
read-only toolchains. Successful current BSPs may enter the compiled preview. Stale results remain
inspectable but never replace it.

The authenticated queue, admission limits, canonical MapCell source lookup, and artifact storage
are implemented. Connecting the hosted editor controls to build polling and authenticated artifact
download remains delivery work; until that adapter lands, public deployments do not probe a
visitor's loopback interface and keep the compile control disabled. Explicitly configured local
helpers retain the existing direct preview workflow.
