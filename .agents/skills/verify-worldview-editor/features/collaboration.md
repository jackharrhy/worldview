# Authenticated hosted collaboration

## Sub-features

Keep local maps offline, join a hosted map using a short-lived server-issued ticket, show connection
state, generated game-inspired aliases, colored participant badges, active viewport and selection
presence, synchronize committed operations, and stop while retaining a local working copy.

## How to get to it (user POV)

Open a hosted project map after signing in through 4orm. The editor joins the map session
automatically. Choose **Stop session** to disconnect without closing or replacing the local map.
The MapCell snapshot is the only hosted document/source/version authority and must populate both
the initial HTTP load and the live socket. There is no separate saved-source snapshot to reconcile.
For a local map, opening **Live collaboration** explains that it remains offline and links back to
hosted projects; it must not create or join a map session.

## Driving it with Playwright

Run the real Worldview application and collaboration service with two authenticated browser
contexts that are project members. Open the same hosted map and require both
`#collaboration-state` elements to reach `Live`. Require the first participant list to include the
second member. Commit a semantic edit in one context and inspect the resulting document in the
other; then stop and prove subsequent local edits do not enter the map. Separately open `/editor`
without a session, invoke `#collaboration-toggle`, and prove no `/sync/maps/` request occurs.

For persistence, make multiple edits and wait for their durable acknowledgements, then reload.
Require the final acknowledged MapCell version, source hash, and visible document to reopen
unchanged. Kill and recreate the runtime with an empty local replica and require the same snapshot
to recover from object storage before making the persistence claim.

Persistence coverage must include a point entity and a brush entity, not only worldspawn brushes.
After reload, require point properties and brush ownership to match the acknowledged document.

For gesture presence, hold an actual canvas drag before pointer-up. Require the remote participant
row to report **Moving**, capture the colored remote wireframe/cursor, and prove the remote WebMCP
inspection still reports the old canonical revision. Release the pointer, require the durable
revision to advance, and require **Moving** to clear. Repeat from an empty map with a brush-creation
drag to prove a not-yet-canonical object is visible without entering the remote document early.

For face extrusion and topology changes, verify the remote perspective viewport shows the colored
candidate solid mesh as well as its wireframe. An outline alone is insufficient because the
canonical textured brush can occlude a moved face.

## Gotchas

The default endpoint is `127.0.0.1:8787` for local editor development and the sibling Tailnet port
8443 when the editor is served on 8444. Other deployments must set
`VITE_WORLDVIEW_COLLABORATION_ENDPOINT` or provide a same-origin collaboration service.

All public `/sync/maps/` requests require a valid hosted-map ticket. An arbitrary map ID, stale
ticket, wrong-map ticket, or absent ticket must receive `401`; a viewer ticket must not initialize a
map or submit a durable edit. Service access tests must prove that owner, editor, viewer, outsider,
and unauthenticated principals receive the declared project role at the ticket boundary.
