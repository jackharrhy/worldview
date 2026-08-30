import { useSyncExternalStore } from 'react';
import type {
  CollaborationParticipantSnapshot,
  CollaborationUiPort,
} from '../../editor-shell-state.js';
import { Button } from '../ui/button.js';
import { Dialog } from '../ui/dialog.js';
import { TextField } from '../ui/text-field.js';

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
  return (
    <Dialog
      id="collaboration-dialog"
      className="collaboration-dialog"
      title="Live collaboration"
      detail={<span id="collaboration-state">{state.state}</span>}
      isOpen={state.dialogOpen}
      isDismissable
      onOpenChange={(open) => {
        if (!open) port.invoke('close');
      }}
    >
      <div className="collaboration-body">
        <p id="collaboration-description">{state.description}</p>
        <TextField
          label="Your name"
          value={state.displayName}
          isDisabled={state.live}
          onChange={(value) => port.invoke('setDisplayName', value)}
          input={{
            id: 'collaboration-display-name',
            maxLength: 48,
            autoComplete: 'nickname',
            spellCheck: false,
          }}
        />
        <div
          id="collaboration-share-fields"
          className="collaboration-share-fields"
          hidden={!state.live}
        >
          <TextField
            label="Share link"
            value={state.shareLink}
            isReadOnly
            input={{ id: 'collaboration-share-link', type: 'url' }}
          />
          <Button
            size="compact"
            data-action="copy-collaboration-link"
            onPress={() => port.invoke('copyLink')}
          >
            Copy link
          </Button>
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
          <Button
            tone="danger"
            size="compact"
            data-action="leave-collaboration"
            hidden={!state.live}
            onPress={() => port.invoke('stop')}
          >
            Stop session
          </Button>
          <Button
            tone="primary"
            size="compact"
            data-action="start-collaboration"
            hidden={state.live}
            isDisabled={state.joining}
            onPress={() => port.invoke('start')}
          >
            {state.joining ? 'Joining…' : 'Open hosted projects'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
