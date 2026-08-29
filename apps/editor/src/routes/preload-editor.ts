let editorRoutePromise: Promise<unknown> | null = null;

/** Warm the editor route without constructing presenters or initializing WebGPU. */
export function preloadEditorRoute(): Promise<unknown> {
  editorRoutePromise ??= import('./editor-route.js');
  return editorRoutePromise;
}
