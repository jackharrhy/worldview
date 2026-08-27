---
name: verify-worldview-editor
description: Verify the Worldview browser map editor through its real WebMCP authoring surface and Playwright, including map loading, edits, undo, visible state, and headless WebGPU evidence. Use after editor changes or when investigating editor behavior; use the existing focused tests for narrow unit-only checks.
---

# Verify Worldview Editor

Drive the visible editor semantically through its registered WebMCP tools. Use Playwright for the
browser transport, readiness assertions, screenshots, and interactions that are inherently spatial.
Do not replace a WebMCP operation with canvas coordinates.

Read the relevant file under `features/` before verifying a mapped feature. Keep that map aligned
when user-visible editor behavior or the WebMCP contract changes.

## Launch

From the repository root, install the committed workspace once with `npm ci`. This checkout
requires Node 24 or newer; stop and report the version mismatch if install or build behavior differs
under an older runtime.

For a managed isolated run, use:

```bash
node .agents/skills/verify-worldview-editor/scripts/verify-editor.mjs
```

The helper builds the two editor packages, chooses an unused loopback port, starts the editor Vite
server, waits for HTTP readiness, launches headless Chromium with SwiftShader WebGPU, and tears down
only the process group it started. To drive an already-running instance, pass
`--url http://127.0.0.1:5174`; the helper will not stop it. Never double-drive a shared interactive
editor instance.

## Doctor

Before manual driving, confirm the instance belongs to this app and is render-ready:

```bash
curl -fsS http://127.0.0.1:5174/ >/dev/null
```

Then require `#status-message` to contain `Source renderer ready`, `.viewport-error` to be hidden,
and `<html data-worldview-site-tools="ready" data-worldview-site-tool-count="21">` after installing
the registration shim before navigation. The helper performs all four checks. If WebGPU does not
initialize, inspect `console.json` and `report.json` before changing launch flags.

## Drive

The helper injects only the browser-proposed `document.modelContext.registerTool` registration
surface. It executes the real definitions registered by `WebMcpPresenter`; it does not expose app
internals or test-only setters.

Useful invocations:

```bash
# Starter-map inspection, edit, visible proof, and exact undo
node .agents/skills/verify-worldview-editor/scripts/verify-editor.mjs

# A real local .map source, including a LibreQuake mapper source
node .agents/skills/verify-worldview-editor/scripts/verify-editor.mjs --map /absolute/path/to/map.map

# Skip unchanged package builds during iteration
node .agents/skills/verify-worldview-editor/scripts/verify-editor.mjs --no-build
```

For additional operations, follow the same optimistic-concurrency contract: call
`worldview_inspect_editor`, carry its `documentId` and `revision` into the edit, and use the returned
revision for the next edit. Prefer the query, selection, transform, create, material, entity, and
history tools. Use `worldview_replace_map_source` to load a caller-supplied `.map`; it is
intentionally destructive and requires `confirmDestructive: true`. Site tools never save to disk.

Use the existing Playwright selectors in `tests/browser/editor.spec.ts` for UI-only paths. Prefer
roles, labels, IDs, and `data-action` attributes; canvas coordinates are appropriate only for
camera, picking, and direct manipulation behavior.

## Evidence

By default, durable proof goes under `artifacts/verification/editor/<UTC timestamp>/`:

- `01-loaded.png`, `02-edited.png`, and `03-undone.png` show action and resulting visible state.
- `report.json` records the input-map SHA-256, WebMCP inspections, selected object, edit, history
  result, and before/after source hashes.
- `console.json` records browser console messages and page errors.

Pass `--evidence /absolute/path` to choose another location. Keep evidence after cleanup. A passing
semantic edit requires a visible revision change and exact save-source hash restoration after undo.
For file/project/build features, additionally prove the filesystem or service-side effect; the
generic helper deliberately does not claim disk writes.

Run the narrow existing tests alongside the user-path proof when relevant:

```bash
npx playwright test tests/browser/editor.spec.ts --project=chromium --grep 'WebMCP site authoring'
npm test --workspace @worldview/editor
npm test --workspace @jackharrhy/worldview-editor
```

## Cleanup

The helper handles signals, failures, and normal completion, and terminates the exact Vite process
group it spawned. It closes its browser and preserves evidence. With `--url`, cleanup is the
caller's responsibility: stop the exact PID or shell job that launched that server, never by process
name. Temporary downloaded third-party maps belong outside the repository and can be removed after
proof; never commit BSP, WAD, PAK, palette, sprite, sound, or third-party map data.

## Helpers

`scripts/verify-editor.mjs` is the executable end-to-end verification driver. Run `--help` for its
complete arguments. It accepts source `.map` files, not compiled BSPs; compiled BSP loading belongs
to viewer verification or the editor compile-preview path.
