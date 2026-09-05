import { useSyncExternalStore } from 'react';
import type {
  CollaborationParticipantSnapshot,
  CollaborationUiPort,
} from '../../editor-shell-state.js';
import { Button } from '../ui/button.js';
import { Dialog } from '../ui/dialog.js';
import { Icon, IconButton, type IconName } from '../ui/icon.js';
import { TextField } from '../ui/text-field.js';

function participantIcon(participant: CollaborationParticipantSnapshot): IconName {
  return participant.moving
    ? 'viewport-move'
    : participant.selectedCount
      ? 'selection-active'
      : participant.viewport === '3D'
        ? 'viewport-3d'
        : 'viewport-2d';
}

function hasJoinedSession(
  status: ReturnType<CollaborationUiPort['getSnapshot']>['lifecycle']['status'],
) {
  return (
    status === 'live' || status === 'reconnecting' || status === 'conflict' || status === 'leaving'
  );
}

export function CollaborationPresence({ port }: { readonly port: CollaborationUiPort }) {
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot);
  const live = hasJoinedSession(state.lifecycle.status);
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
            <Icon name={participantIcon(participant)} />
          </span>
        ))}
      </div>
      <IconButton
        icon="collaborate"
        label="Share"
        tooltip="Live collaboration"
        id="collaboration-toggle"
        className="collaboration-toggle icon-button"
        aria-pressed={live}
        onPress={() => port.commands?.open()}
      />
    </div>
  );
}

export function CollaborationDialog({ port }: { readonly port: CollaborationUiPort }) {
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot);
  const live = hasJoinedSession(state.lifecycle.status);
  const joining = state.lifecycle.status === 'connecting';
  return (
    <Dialog
      id="collaboration-dialog"
      className="collaboration-dialog"
      title="Live collaboration"
      detail={<span id="collaboration-state">{state.state}</span>}
      isOpen={state.dialogOpen}
      isDismissable
      onOpenChange={(open) => {
        if (!open) port.commands?.close();
      }}
    >
      <div className="collaboration-body">
        <p id="collaboration-description">{state.description}</p>
        <TextField
          label="Your name"
          value={state.displayName}
          isDisabled={live}
          onChange={(value) => port.commands?.setDisplayName(value)}
          input={{
            id: 'collaboration-display-name',
            maxLength: 48,
            autoComplete: 'nickname',
            spellCheck: false,
          }}
        />
        <div id="collaboration-share-fields" className="collaboration-share-fields" hidden={!live}>
          <TextField
            label="Share link"
            value={state.shareLink}
            isReadOnly
            input={{ id: 'collaboration-share-link', type: 'url' }}
          />
          <Button
            size="compact"
            data-action="copy-collaboration-link"
            onPress={() => port.commands?.copyLink()}
          >
            Copy link
          </Button>
        </div>
        <div id="collaboration-participants" className="collaboration-participants" hidden={!live}>
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
            hidden={!live}
            onPress={() => port.commands?.stop()}
          >
            Stop session
          </Button>
          <Button
            tone="primary"
            size="compact"
            data-action="start-collaboration"
            hidden={live}
            isDisabled={joining}
            onPress={() => port.commands?.start()}
          >
            {joining ? 'Joining…' : 'Open hosted projects'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
