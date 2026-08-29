# Compile and preview

## Sub-features

Logical build profiles, compiler binding, diagnostics/logs, BSP/portal/leak artifacts, build
history, and compiled BSP preview. Compile and launch capabilities are game-matched before binding.
Quake II uses an explicitly configured q2tools-220 capability. Successful BSP38 artifacts install
as compiled previews; missing retail WAL textures use the visible missing-material fallback.

## How to get to it (user POV)

Open a configured project, choose a profile and quality, compile the current revision, inspect
artifacts, and switch to the compiled preview.

## Driving it with Playwright

Start the real configured loopback service in isolated scratch state, drive accessible build
controls, and capture request/result logs, visible status, artifact state, and rendered preview.
For Quake II, prove the helper advertises `game: quake2`, preserves the requested document revision,
returns an `IBSP` version 38 artifact, and installs that artifact through the same revision-safe
preview boundary as BSP29/30. The editor must report the matching compiled revision and show visible
rendered geometry on the compiled canvas without a viewport error.

## Gotchas

WebMCP intentionally cannot compile, launch software, save files, or accept commands. Do not mock a
successful compile and call it end-to-end proof. Never launch an external game without explicit
authorization.
