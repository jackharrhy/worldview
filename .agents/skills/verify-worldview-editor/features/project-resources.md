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

Hosted source materials and builds share the included Worldview development pack and pinned project
WADs. Prove an actual native compile embeds the used developer/project textures, and reject missing
or hash-mismatched pinned bytes and unresolved texture names before invoking the compiler. Check
that hosted resource controls link to project packs and do not expose browser-only WAD imports.

Quake previews, WAD2 imports, and builds use the included standard palette by default. Custom
project or standalone palettes override it; never use a diagnostic palette as an implicit fallback.
The standard 768-byte table is the explicitly approved exception to the game-data exclusion rule.
GoldSrc uses per-texture WAD3 palettes without an external palette. The
editor's generated swatches are decoded from the exact target WAD. `editor-game-textures.spec.ts`
checks known default swatch colors, custom palette replacement and reload with imported WADs, and
atomic rejection of malformed or wrong-game packs. Its ordinary startup must not upload a palette
to make the test pass.
