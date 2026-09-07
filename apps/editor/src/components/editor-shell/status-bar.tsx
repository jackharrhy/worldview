import { useSyncExternalStore } from 'react';

import type { EditorShellState } from '../../editor-shell-state.js';
import { Button } from '../ui/button.js';
import { PerformancePanel } from './performance-panel.js';

interface StatusBarProps {
  readonly shellState: EditorShellState;
}

// Frequent scene feedback subscribes at its text leaf, never above sibling controls.
function PointerReadout({ shellState }: StatusBarProps) {
  const pointerContext = useSyncExternalStore(
    shellState.pointerContext.subscribe,
    shellState.pointerContext.getSnapshot,
    shellState.pointerContext.getSnapshot,
  );
  return <span id="pointer-context">{pointerContext}</span>;
}

function StatusMessage({ shellState }: StatusBarProps) {
  const status = useSyncExternalStore(
    shellState.statusMessage.subscribe,
    shellState.statusMessage.getSnapshot,
  );
  return (
    <span
      id="status-message"
      className={status.tone === 'error' ? 'error-text' : undefined}
      aria-live="polite"
    >
      {status.message}
    </span>
  );
}

function IssueStatus({ shellState }: StatusBarProps) {
  const open = useSyncExternalStore(
    shellState.issueBrowser.subscribe,
    () => shellState.issueBrowser.getSnapshot().open,
  );
  const status = useSyncExternalStore(
    shellState.issueBrowser.subscribe,
    () => shellState.issueBrowser.getSnapshot().status,
  );
  const label = useSyncExternalStore(
    shellState.issueBrowser.subscribe,
    () => shellState.issueBrowser.getSnapshot().statusLabel,
  );
  return (
    <Button
      id="issue-status"
      tone="quiet"
      size="compact"
      data-action="toggle-issues"
      aria-expanded={open}
      data-state={status}
      onPress={() => shellState.issueBrowser.commands?.setOpen(!open)}
    >
      {label}
    </Button>
  );
}

export function StatusBar({ shellState }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <StatusMessage shellState={shellState} />
      <IssueStatus shellState={shellState} />
      <PointerReadout shellState={shellState} />
      <PerformancePanel />
    </footer>
  );
}
