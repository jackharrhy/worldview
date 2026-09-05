import { useSyncExternalStore } from 'react';

import type { EditorShellState } from '../../editor-shell-state.js';
import { Button } from '../ui/button.js';

interface StatusBarProps {
  readonly shellState: EditorShellState;
}

export function StatusBar({ shellState }: StatusBarProps) {
  const status = useSyncExternalStore(
    shellState.statusMessage.subscribe,
    shellState.statusMessage.getSnapshot,
    shellState.statusMessage.getSnapshot,
  );
  const compile = useSyncExternalStore(
    shellState.compileState.subscribe,
    shellState.compileState.getSnapshot,
    shellState.compileState.getSnapshot,
  );
  const pointerContext = useSyncExternalStore(
    shellState.pointerContext.subscribe,
    shellState.pointerContext.getSnapshot,
    shellState.pointerContext.getSnapshot,
  );
  const issues = useSyncExternalStore(
    shellState.issueBrowser.subscribe,
    shellState.issueBrowser.getSnapshot,
  );

  return (
    <footer className="statusbar">
      <span
        id="status-message"
        className={status.tone === 'error' ? 'error-text' : undefined}
        aria-live="polite"
      >
        {status.message}
      </span>
      <Button
        id="issue-status"
        tone="quiet"
        size="compact"
        data-action="toggle-issues"
        aria-expanded={issues.open}
        data-state={issues.status}
        onPress={() => shellState.issueBrowser.commands?.setOpen(!issues.open)}
      >
        {issues.statusLabel}
      </Button>
      <div className="compile-state" title="Compiler service state" data-state={compile.state}>
        {compile.label}
      </div>
      <span id="pointer-context">{pointerContext}</span>
    </footer>
  );
}
