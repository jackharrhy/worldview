# Accountless collaboration

## Sub-features

Start a live session from the current map, copy its fragment-based room link, automatically join as
a second browser-local guest, show connection state, generated game-inspired aliases, colored
participant badges, active viewport and selection presence, synchronize committed operations, and
stop while retaining a local working copy.

## How to get to it (user POV)

Choose **Live collaboration** in the top bar, enter a guest name, and choose **Start session**. Share
the generated URL. Opening it in another browser automatically joins the room. Choose **Stop
session** to disconnect without closing or replacing the local map.

## Driving it with Playwright

Run the real collaboration service and editor. Use two isolated browser contexts so they receive
different browser-local actor IDs. Start from the first context, read `#collaboration-share-link`,
open it in the second context, and require both `#collaboration-state` elements to reach `Live`.
Require the first participant list to include the second guest. Commit a semantic edit in one
context and inspect the resulting document in the other; then stop and prove subsequent local edits
do not enter the room.

For gesture presence, hold an actual canvas drag before pointer-up. Require the remote participant
row to report **Moving**, capture the colored remote wireframe/cursor, and prove the remote WebMCP
inspection still reports the old canonical revision. Release the pointer, require the durable
revision to advance, and require **Moving** to clear. Repeat from an empty room with a brush-creation
drag to prove a not-yet-canonical object is visible without entering the remote document early.

For face extrusion and topology changes, verify the remote perspective viewport shows the colored
candidate solid mesh as well as its wireframe. An outline alone is insufficient because the
canonical textured brush can occlude a moved face.

## Gotchas

The default endpoint is `127.0.0.1:8787` for local editor development and the sibling Tailnet port
8443 when the editor is served on 8444. Other deployments must set
`VITE_WORLDVIEW_COLLABORATION_ENDPOINT` or provide a same-origin collaboration service.

Room tokens are 144-bit possession capabilities stored in the URL fragment. This preview is not
end-to-end encrypted and has no accounts, permissions, revocation, or hostile-public-ingress
security boundary. Do not describe it as equivalent to Excalidraw's encryption model.
