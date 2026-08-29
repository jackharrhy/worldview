# Workspace startup and new maps

## Production path

- `/` shows the React-owned Worldview Editor home view without importing or initializing the editor.
- **New map** navigates to `/new-map` without opening a dialog.
- Browser back and forward restore the corresponding setup view.
- Its Data Mode action validates the game profile and compatible map format, then the setup route
  navigates to the lazy `/editor` route with that payload in browser history state. The visible URL
  stays clean, and the history entry preserves setup across reloads and back/forward navigation.
  WebGPU, presenters, WebMCP, compiler checks, and collaboration initialize only in the editor.
- New-map choices come from the package game-profile registry. Quake II exposes classic axial syntax
  only; Quake retains classic and Valve 220, while GoldSrc remains Valve 220-only.
- `/new-map` warms the lazy editor modules during browser idle time and on submit-button intent;
  this downloads code only and does not construct presenters or initialize WebGPU. The selected
  empty document is installed before renderer startup so the renderer initializes it once.
- The submit button remains disabled and explicitly busy throughout the action and route load, with
  primary-button contrast retained in both themes.
- Legacy collaboration room hashes have no routing behavior.

## Proof

The managed verifier follows **New map** before expecting renderer readiness, requires the
`/new-map` path and dedicated heading, submits its action, waits for `/editor` and renderer/site-tool
readiness, then continues its ordinary WebMCP empty-map inspection/edit/undo proof. UI-focused
Playwright tests additionally cover profile-dependent format choices, reloads, and browser history.
