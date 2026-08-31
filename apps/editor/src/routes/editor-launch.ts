import type { EditorApplicationLaunch } from '../editor-application-contracts.js';

export type PendingEditorLaunch = Extract<
  EditorApplicationLaunch,
  { readonly kind: 'project' | 'recent-project' | 'map' }
>;

let pending: PendingEditorLaunch | null = null;

export function setPendingEditorLaunch(launch: PendingEditorLaunch): void {
  pending = launch;
}

export function takePendingEditorLaunch(): PendingEditorLaunch | null {
  const launch = pending;
  pending = null;
  return launch;
}
