import { EditorAuxiliary } from './editor-shell/editor-auxiliary.js';
import { EditorChrome } from './editor-shell/editor-chrome.js';
import { EditorDialogs } from './editor-shell/editor-dialogs.js';
import { EditorWorkspace } from './editor-shell/editor-workspace.js';
import type { RefCallback } from 'react';

import type { EditorShellState } from '../editor-shell-state.js';

interface EditorShellProps {
  readonly shellState: EditorShellState;
  readonly onReady: RefCallback<HTMLElement>;
}

export function EditorShell({ shellState, onReady }: EditorShellProps) {
  return (
    <main ref={onReady} className="editor-shell">
      <EditorChrome shellState={shellState} />
      <EditorDialogs shellState={shellState} />
      <EditorWorkspace shellState={shellState} />
      <EditorAuxiliary shellState={shellState} />
    </main>
  );
}
