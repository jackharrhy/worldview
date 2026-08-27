# Compile and preview

## Sub-features

Logical build profiles, compiler binding, diagnostics/logs, BSP/portal/leak artifacts, build
history, and compiled BSP preview.

## How to get to it (user POV)

Open a configured project, choose a profile and quality, compile the current revision, inspect
artifacts, and switch to the compiled preview.

## Driving it with Playwright

Start the real configured loopback service in isolated scratch state, drive accessible build
controls, and capture request/result logs, visible status, artifact state, and rendered preview.

## Gotchas

WebMCP intentionally cannot compile, launch software, save files, or accept commands. Do not mock a
successful compile and call it end-to-end proof. Never launch an external game without explicit
authorization.
