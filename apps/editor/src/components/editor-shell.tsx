import { EditorAuxiliary } from './editor-shell/editor-auxiliary.js';
import { EditorChrome } from './editor-shell/editor-chrome.js';
import { EditorDialogs } from './editor-shell/editor-dialogs.js';
import { EditorWorkspace } from './editor-shell/editor-workspace.js';

export function EditorShell() {
  return (
    <main className="editor-shell">
      <EditorChrome />
      <EditorDialogs />
      <EditorWorkspace />
      <EditorAuxiliary />
    </main>
  );
}
