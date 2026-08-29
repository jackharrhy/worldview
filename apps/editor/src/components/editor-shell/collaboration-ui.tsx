import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type {
  CollaborationParticipantSnapshot,
  CollaborationUiPort,
} from '../../editor-shell-state.js';

function participantIcon(participant: CollaborationParticipantSnapshot): string {
  return participant.moving
    ? 'arrows-out-cardinal'
    : participant.selectedCount
      ? 'selection'
      : participant.viewport === '3D'
        ? 'cube'
        : 'square-split-horizontal';
}

export function CollaborationPresence({ port }: { readonly port: CollaborationUiPort }) {
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot);
  return (
    <div className="collaboration-presence" aria-label="Live collaborators">
      <div id="collaboration-presence-strip" className="collaboration-presence-strip">
        {state.participants.map((participant) => (
          <span
            className="collaborator-badge"
            data-color={participant.color}
            key={participant.actorId}
            title={`${participant.displayName} · ${participant.viewport}${participant.selectedCount ? ` · ${participant.selectedCount} selected` : ''}`}
            aria-label={`${participant.displayName} · ${participant.viewport}`}
          >
            <strong>{participant.displayName.charAt(0).toUpperCase()}</strong>
            <i className={`ph ph-${participantIcon(participant)}`} aria-hidden="true" />
          </span>
        ))}
      </div>
      <button
        id="collaboration-toggle"
        className="collaboration-toggle icon-button"
        type="button"
        aria-pressed={state.live}
        title="Live collaboration"
        onClick={() => port.invoke('open')}
      >
        <i className="ph ph-users-three" aria-hidden="true" />
        <span className="toolbar-label">Share</span>
      </button>
    </div>
  );
}

export function CollaborationDialog({ port }: { readonly port: CollaborationUiPort }) {
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot);
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (state.dialogOpen && !dialog.open) dialog.showModal();
    else if (!state.dialogOpen && dialog.open) dialog.close();
  }, [state.dialogOpen]);
  return createPortal(
    <dialog
      ref={ref}
      id="collaboration-dialog"
      className="collaboration-dialog"
      aria-labelledby="collaboration-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        port.invoke('close');
      }}
    >
      <header>
        <div>
          <strong id="collaboration-dialog-title">Live collaboration</strong>
          <span id="collaboration-state">{state.state}</span>
        </div>
        <button type="button" onClick={() => port.invoke('close')}>
          Close
        </button>
      </header>
      <div className="collaboration-body">
        <p id="collaboration-description">{state.description}</p>
        <label>
          Your name
          <input
            id="collaboration-display-name"
            type="text"
            maxLength={48}
            autoComplete="nickname"
            spellCheck="false"
            value={state.displayName}
            disabled={state.live}
            onChange={(event) => port.invoke('setDisplayName', event.currentTarget.value)}
          />
        </label>
        <div
          id="collaboration-share-fields"
          className="collaboration-share-fields"
          hidden={!state.live}
        >
          <label>
            Share link
            <input id="collaboration-share-link" type="url" readOnly value={state.shareLink} />
          </label>
          <button
            type="button"
            data-action="copy-collaboration-link"
            onClick={() => port.invoke('copyLink')}
          >
            Copy link
          </button>
        </div>
        <div
          id="collaboration-participants"
          className="collaboration-participants"
          hidden={!state.live}
        >
          <strong>People here</strong>
          <ul id="collaboration-participant-list">
            {state.participants.map((participant) => (
              <li key={participant.actorId} data-color={participant.color}>
                <span className="collaborator-dot" />
                <strong>
                  {participant.displayName}
                  {participant.isLocal ? ' (you)' : ''}
                </strong>
                <small>
                  {participant.viewport} ·{' '}
                  {participant.selectedCount
                    ? `${participant.selectedCount} selected`
                    : 'No selection'}
                  {participant.moving ? ' · Moving' : ''}
                </small>
              </li>
            ))}
          </ul>
        </div>
        <p id="collaboration-error" className="error-text" hidden={!state.error}>
          {state.error}
        </p>
        <div className="collaboration-actions">
          <button
            type="button"
            data-action="leave-collaboration"
            hidden={!state.live}
            onClick={() => port.invoke('stop')}
          >
            Stop session
          </button>
          <button
            type="button"
            data-action="start-collaboration"
            hidden={state.live}
            disabled={state.joining}
            onClick={() => port.invoke('start')}
          >
            {state.joining ? 'Joining…' : 'Start session'}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
