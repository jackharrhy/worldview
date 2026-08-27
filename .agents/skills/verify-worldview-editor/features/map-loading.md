# Map loading and inspection

## Sub-features

Starter maps, standalone `.map` source replacement, Quake classic/Valve 220 parsing, visible
document framing, issue reporting, and exact source-preserving save text.

## How to get to it (user POV)

Open the editor, use Open map for a local source file, or open Source, paste map text, and apply it.
The document summary, four viewports, status, and issue indicator update together.

## Driving it with WebMCP and Playwright

Run `scripts/verify-editor.mjs --map /absolute/path/map.map`. It loads through
`worldview_replace_map_source`, inspects through `worldview_inspect_editor`, and hashes the complete
save text through bounded `worldview_get_map_source` calls. Assert render readiness, appropriate
nonzero counts, no unexpected page errors, and a loaded screenshot.

## Gotchas

The tool accepts `.map` source, not BSP. Replacement resets history and detaches file handles. A
project-directory open must instead exercise the browser File System Access boundary. Real game
content and downloaded compatibility corpora stay outside git.
