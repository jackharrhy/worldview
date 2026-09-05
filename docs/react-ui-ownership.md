# Editor React UI ownership

React owns every visible editor DOM node and every user-visible property of those nodes. Presenters
translate editor, filesystem, network, and browser events into immutable snapshots; React renders
those snapshots through `useSyncExternalStore`.

## Boundaries

- Components create visible elements, lists, options, labels, classes, disabled/hidden state, and
  ARIA state. HTML string injection is forbidden by the architecture check.
- Presenters may call typed UI ports. They do not call `createElement`, `replaceChildren`, append
  visible nodes, or render through `textContent`, `classList`, `hidden`, or `disabled`.
- Stable refs are appropriate for canvas/WebGPU attachment, focus and selection, pointer capture,
  element measurement, resize observers, native file pickers, and native dialog methods.
- Effects synchronize those external browser systems. Ordinary derived UI does not need an effect.
- Portals are used for modal dialogs and floating overlays that must escape editor clipping or
  stacking contexts. A portal changes placement, not ownership: its contents remain React-rendered.
- High-frequency camera, pointer, and gesture state remains outside React. Only coarse readouts
  cross a narrow snapshot port. React creates viewport lasso/readout overlay roots, and the renderer
  may update geometry/text only through those explicit runtime refs; it may not discover or mutate
  viewport wrapper DOM. Canvas input listeners share the renderer's abort-owned lifetime so route
  remounts cannot leave stale input handlers attached to React-owned canvases. Async GPU
  construction checks the same lifetime before configuring those canvases.
- File inputs may be cleared imperatively after consumption because their value cannot be usefully
  controlled. Canvas pixel contents remain renderer-owned; the canvas element remains React-owned.

## Migration rule

When touching an imperative UI projection, add or extend a focused snapshot port and migrate the
whole projection. Do not add another DOM mutation as a temporary shortcut. Tests should assert the
React-visible result and the underlying editor or filesystem effect separately.
