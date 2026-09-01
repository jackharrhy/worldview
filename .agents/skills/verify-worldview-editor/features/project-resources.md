# Project resources and LibreQuake

## Sub-features

`worldview.project.json`, authorized directory traversal, map enumeration, ordered WAD, game-root,
and entity-definition loading, remembered browser-local handles, project map switching, and
authenticated content-addressed mounts for hosted projects. Quake II game roots expose bounded
`textures/`, `pics/colormap.pcx`, and `env/` assets to both source materials and compiled preview.

## How to get to it (user POV)

Choose Open project, authorize a directory containing `worldview.project.json`, select a map, and
inspect materials, definitions, sprites, diagnostics, and project status.

## Driving it with WebMCP and Playwright

Use Playwright's File System Access support or a production-compatible handle shim to authorize a
temporary project directory, then use inspection, material listing, and project-map WebMCP tools.
For parser/editor regression coverage without resources, pass a LibreQuake mapper `.map` directly
to the generic helper.

## Gotchas

LibreQuake's `dev.zip` is a useful GPL-republished external corpus, but download and unpack it into
a temporary directory and do not commit it. Material resolution requires its project layout; a
standalone `.map` load correctly reports unresolved materials.

Hosted resource tests must prove that all project roles can read a mounted resource, outsiders and
unauthenticated users cannot, and only the owner can begin an Artbin mount. Reject authorization
before Artbin metadata/content or blob-cache work so forbidden requests cannot consume upstream
resources.
