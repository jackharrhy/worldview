import type { EditorDirectoryHandle } from '../project-workspace.js';

export type PendingEditorLaunch =
  | { readonly kind: 'project'; readonly handle: EditorDirectoryHandle }
  | { readonly kind: 'recent-project'; readonly projectKey: string }
  | { readonly kind: 'map'; readonly file: File };

let pending: PendingEditorLaunch | null = null;

export function setPendingEditorLaunch(launch: PendingEditorLaunch): void {
  pending = launch;
}

export function takePendingEditorLaunch(): PendingEditorLaunch | null {
  const launch = pending;
  pending = null;
  return launch;
}
