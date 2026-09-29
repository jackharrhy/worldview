# Linked local and hosted projects

Status: implemented. Sync requires a writable Chromium directory handle and a same-origin 4orm
session for hosted access.

## User model

A local project remains a directory selected through Chromium's File System Access API. Its
`worldview.project.json` names map and resource roots. Opening the project lists every `.map` under
those roots; the mapper can switch maps without reopening the directory. Saving writes the active
local map to its file handle after checking for external changes.

The manifest may link selected local map paths to maps in one hosted Worldview project. The mapper
edits the local file while in the local project, and uses explicit **Pull** or **Push** to transfer
source. A hosted map opened from the hosted project remains a live collaborative map. Opening one
does not silently attach a local file handle or start filesystem writes.

The project menu lists local maps and opens Project sync. The sync dialog lists linked paths,
source status, and a link to each hosted map. Switching away from an
unsaved local document offers Save, Discard, or Cancel. A browser without directory write access
keeps the existing download workflow and cannot claim a completed local sync.

## Portable configuration

Add an optional `hosted` section to the existing version 1 manifest. Existing manifests remain
valid. Example for Gower Complex:

```json
{
  "schemaVersion": 1,
  "name": "Gower Complex",
  "game": "gower",
  "mapRoots": ["assets/maps"],
  "resources": {
    "wads": [],
    "gameRoots": ["assets"],
    "spriteRoots": [],
    "entityDefinitions": [{ "path": "trenchbroom/GowerComplex.fgd", "format": "fgd" }]
  },
  "buildProfiles": [],
  "hosted": {
    "origin": "https://worldview.harrhy.xyz",
    "projectId": "8v4qjva5vyxk",
    "maps": [
      { "path": "assets/maps/home.map", "mapId": "a1jnagpqeyzq" },
      { "path": "assets/maps/lobby.map", "mapId": "nym16wtv7szj" },
      { "path": "assets/maps/dev_course.map", "mapId": "xnkjmq6ze1c5" }
    ]
  }
}
```

The manifest contains stable identities, never cookies, tokens, directory handles, map source,
last-synced versions, or machine paths. Validate paths with the existing contained-relative-path
rules; require unique local paths and unique hosted map IDs. Verify that every linked path is a
discovered map under a configured root, that the hosted project and map IDs exist, and that their
game and map format match the local project. Treat `origin` as a guard: sync is available only when
the app runs at that origin, using its ordinary same-origin 4orm session. The folder still opens
offline or while signed out.

The Project sync dialog accepts a hosted project ID from its URL, loads its maps, and pairs them
with local paths. Saving writes the updated manifest only if its disk content is unchanged.

## Sync state and decisions

Keep each link's last confirmed local content hash, hosted `mapVersion`, hosted source SHA-256, and
base source in browser-local IndexedDB. Key it by origin, project ID, map ID, and project-relative
path. Update it only after a successful Pull or Push. Git may preserve the manifest across machines;
each browser establishes its own baseline. The bounded base source makes a three-way comparison
possible without adding mutable sync data to the portable manifest.

Before every transfer, read the current file and fetch the authoritative hosted snapshot. Compare
both with the confirmed baseline:

| Local source     | Hosted source    | Action                                       |
| ---------------- | ---------------- | -------------------------------------------- |
| Same as baseline | Same as baseline | Up to date                                   |
| Changed          | Same as baseline | Offer Push                                   |
| Same as baseline | Changed          | Offer Pull                                   |
| Changed          | Changed          | Show a conflict and local versus hosted diff |

On first link, equal source establishes a baseline. Unequal source requires an explicit first Pull
or Push after a diff; neither side is assumed newer. Content equality wins over version-only
changes. Unsaved editor changes must be saved or discarded before sync. An offline or unauthorized
remote is shown as unavailable, not as up to date.

Pull writes the hosted source bytes through the existing guarded file-save path, using the file
hash read immediately before the write. If the file changes meanwhile, stop. Refresh an open local
document from the written file, then record the new baseline. Push reads the saved local file and
submits its exact source with the expected hosted version and source hash. If another hosted edit
lands first, the server returns a conflict and no source is replaced. Only a server acknowledgement
updates the baseline. Neither direction silently chooses a winner or normalizes the `.map` text.

The review UI shows the map path, hosted version, a readable source diff, and the specific file or
hosted map that will change. For a conflict, the mapper explicitly chooses Pull or Push after
review. Transfers are disabled if the diff is shortened; there is no automatic merge.

## Hosted write boundary

Add a member-editor-only conditional source-replacement endpoint scoped to the hosted project and
map. The service validates same-origin mutation and the `.map` size/format, then asks the MapCell to
compare expected version and source hash and replace source atomically. The MapCell remains the
only hosted source authority. It records a pre-replacement checkpoint, parses the new document,
increments map version, and closes active sockets so connected editors reconnect and fetch the
new snapshot and reconcile pending operations through the existing recovery path; conflicts remain
visible rather than being discarded. Builds requested for older versions remain stale.

The sync adapter belongs in the browser application. The DOM-free editor core owns the
portable manifest schema. Filesystem handles, HTTP authorization,
IndexedDB baselines, and dialogs stay in `apps/editor`; service admission stays in
`apps/worldview-service`; atomic replacement stays in the MapCell.

## Verification

The browser journey opens an unlinked local directory, writes project links, reviews a first-link
diff, Pulls to the real directory handle, Pushes an external disk edit, and shows a two-sided
conflict. Service and MapCell tests cover authenticated conditional replacement, stale version
rejection, and a pre-replacement checkpoint. A download is never counted as a synced local file.
