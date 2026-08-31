import { useSyncExternalStore } from 'react';
import { EDITOR_ISSUE_TYPE_INFO } from '@jackharrhy/worldview-editor';

import type { EditorShellState } from '../../editor-shell-state.js';
import { ViewportContextMenu } from '../ui/viewport-context-menu.js';
import { Button } from '../ui/button.js';
import { Checkbox } from '../ui/checkbox.js';
import { TextArea } from '../ui/text-area.js';
import { useModalDialog } from '../ui/use-modal-dialog.js';
import { StatusBar } from './status-bar.js';

interface EditorAuxiliaryProps {
  readonly shellState: EditorShellState;
}

function IssueBrowser({ shellState }: EditorAuxiliaryProps) {
  const browser = useSyncExternalStore(
    shellState.issueBrowser.subscribe,
    shellState.issueBrowser.getSnapshot,
  );
  const enabledTypes = new Set(browser.enabledTypes);
  return (
    <section
      id="issue-browser"
      className="issue-browser"
      aria-label="Issue browser"
      hidden={!browser.open}
    >
      <header className="issue-browser-toolbar">
        <div className="issue-browser-title">
          <strong>Issues</strong>
          <span id="issue-summary">{browser.summary}</span>
        </div>
        <details className="issue-filter-menu">
          <summary>Filter types</summary>
          <div id="issue-filters" className="issue-filter-list">
            {EDITOR_ISSUE_TYPE_INFO.map((entry) => (
              <Checkbox
                key={entry.type}
                isSelected={enabledTypes.has(entry.type)}
                onChange={(enabled) =>
                  shellState.issueBrowser.invoke('setTypeEnabled', entry.type, enabled)
                }
              >
                {entry.label}
              </Checkbox>
            ))}
          </div>
        </details>
        <Checkbox
          className="show-hidden-issues"
          isSelected={browser.showHidden}
          onChange={(show) => shellState.issueBrowser.invoke('setShowHidden', show)}
        >
          Show hidden
        </Checkbox>
        <Button
          size="compact"
          aria-label="Close issue browser"
          onPress={() => shellState.issueBrowser.invoke('setOpen', false)}
        >
          Close
        </Button>
      </header>
      <ul id="issue-list" className="issue-list">
        {browser.issues.length === 0 ? (
          <li className="issue-list-empty">{browser.emptyMessage}</li>
        ) : (
          browser.issues.map((issue) => (
            <li
              key={issue.id}
              className={`issue-row ${issue.severity}${issue.hidden ? ' hidden-issue' : ''}`}
              data-issue-id={issue.id}
              data-issue-type={issue.type}
            >
              <Button
                className="issue-description"
                tone="quiet"
                aria-label={`${issue.message}. Select implicated objects`}
                onPress={() => shellState.issueBrowser.invoke('select', issue.id, false)}
                onDoubleClick={() => shellState.issueBrowser.invoke('select', issue.id, true)}
              >
                <span className="issue-severity">
                  {issue.severity === 'error' ? 'ERROR' : 'WARN'}
                </span>
                <span className="issue-copy">
                  <strong>{issue.message}</strong>
                  <small>{issue.meta}</small>
                </span>
              </Button>
              <div className="issue-actions">
                <Button
                  size="compact"
                  onPress={() => shellState.issueBrowser.invoke('select', issue.id, true)}
                >
                  Reveal
                </Button>
                {issue.fixLabel ? (
                  <Button
                    className="issue-fix"
                    size="compact"
                    aria-label={issue.fixLabel}
                    onPress={() => shellState.issueBrowser.invoke('fix', issue.id)}
                  >
                    Fix
                  </Button>
                ) : null}
                <Button
                  size="compact"
                  onPress={() => shellState.issueBrowser.invoke('toggleHidden', issue.id)}
                >
                  {issue.hidden ? 'Show' : 'Hide'}
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function SourceDialog({ shellState }: EditorAuxiliaryProps) {
  const project = useSyncExternalStore(
    shellState.projectUi.subscribe,
    shellState.projectUi.getSnapshot,
  );
  const close = () => shellState.projectUi.updateSource({ open: false });
  const dialog = useModalDialog(project.source.open, close);
  return (
    <dialog
      {...dialog}
      id="source-dialog"
      className="source-dialog"
      aria-labelledby="source-dialog-title"
    >
      <div className="dialog-shell">
        <header>
          <div>
            <strong id="source-dialog-title">Map source</strong>
            <span>Valve 220</span>
          </div>
          <Button type="button" size="compact" aria-label="Close source" onPress={close}>
            Close
          </Button>
        </header>
        <TextArea
          label="Map source"
          value={project.source.value}
          onChange={(value) => shellState.projectUi.updateSource({ value })}
          input={{ id: 'map-source', spellCheck: false, 'aria-describedby': 'source-message' }}
        />
        <footer>
          <p
            id="source-message"
            className={`source-message${project.source.tone === 'error' ? ' error-text' : ''}`}
          >
            {project.source.message}
          </p>
          <Button
            type="button"
            tone="primary"
            onPress={() => shellState.projectUi.applySource(project.source.value)}
          >
            Apply source
          </Button>
        </footer>
      </div>
    </dialog>
  );
}

export function EditorAuxiliary({ shellState }: EditorAuxiliaryProps) {
  return (
    <>
      <IssueBrowser shellState={shellState} />
      <StatusBar shellState={shellState} />
      <SourceDialog shellState={shellState} />
      <ViewportContextMenu menu={shellState.viewportContextMenu} />
    </>
  );
}
