import { HostedErrorResponseSchema, HostedRealtimeTicketResponseSchema } from '@worldview/protocol';

import type { CollaborationPresence, JoinCollaborationOptions } from './collaboration.js';
import type { EditorShellState } from './editor-shell-state.js';

type CollaborationUi = Pick<EditorShellState, 'collaborationUi'>;

const ACTOR_KEY = 'worldview.collaboration.actor';
const NAME_KEY = 'worldview.collaboration.name';
const COLLABORATOR_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'violet',
  'pink',
] as const;
const CHARACTERS = [
  'shambler',
  'scrag',
  'fiend',
  'ranger',
  'headcrab',
  'houndeye',
  'vortigaunt',
  'scientist',
  'imp',
  'cacodemon',
  'revenant',
  'mancubus',
] as const;

function identityIndex(actorId: string): number {
  let hash = 2_166_136_261;
  for (const character of actorId) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return hash >>> 0;
}

function generatedName(actorId: string): string {
  const index = identityIndex(actorId);
  return `${COLLABORATOR_COLORS[index % COLLABORATOR_COLORS.length]}-${CHARACTERS[Math.floor(index / COLLABORATOR_COLORS.length) % CHARACTERS.length]}`;
}

function collaboratorColor(actorId: string): (typeof COLLABORATOR_COLORS)[number] {
  return COLLABORATOR_COLORS[identityIndex(actorId) % COLLABORATOR_COLORS.length]!;
}

function viewportLabel(viewport: CollaborationPresence['viewport']): string {
  return viewport === 'xy'
    ? 'Top'
    : viewport === 'xz'
      ? 'Front'
      : viewport === 'yz'
        ? 'Side'
        : viewport === 'perspective'
          ? '3D'
          : 'Idle';
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Accountless collaboration still works without durable browser storage.
  }
}

function collaborationEndpoint(): string {
  const configured = import.meta.env.VITE_WORLDVIEW_COLLABORATION_ENDPOINT as string | undefined;
  if (configured) return configured;
  const endpoint = new URL(window.location.origin);
  if (endpoint.hostname === '127.0.0.1' || endpoint.hostname === 'localhost') {
    endpoint.protocol = 'http:';
    endpoint.hostname = '127.0.0.1';
    endpoint.port = '8787';
  } else if (endpoint.port === '8444') {
    endpoint.protocol = 'https:';
    endpoint.port = '8443';
  }
  return endpoint.toString();
}

export class CollaborationPresenter {
  private readonly actorId = stored(ACTOR_KEY) ?? crypto.randomUUID();
  private readonly participants = new Map<string, CollaborationPresence>();
  private mapId: string | null = null;

  public constructor(
    private readonly ui: CollaborationUi,
    private readonly joinCollaboration: (options: JoinCollaborationOptions) => Promise<void>,
    private readonly leaveCollaboration: () => void,
    private readonly signal: AbortSignal,
  ) {
    persist(ACTOR_KEY, this.actorId);
  }

  public async connect(): Promise<void> {
    const previousName = stored(NAME_KEY);
    const displayName =
      previousName && !/^Guest [A-Z0-9]{4}$/.test(previousName)
        ? previousName
        : generatedName(this.actorId);
    this.ui.collaborationUi.update({ displayName });
    this.ui.collaborationUi.bind({
      open: () => this.ui.collaborationUi.update({ dialogOpen: true }),
      close: () => this.ui.collaborationUi.update({ dialogOpen: false }),
      setDisplayName: (name) => {
        this.ui.collaborationUi.update({ displayName: name });
        persist(NAME_KEY, name.trim().slice(0, 48));
      },
      start: () => location.assign('/'),
      stop: () => this.stopSession(),
      copyLink: () => void this.copyLink(),
    });
  }

  public async joinHostedMap(mapId: string, actorId: string, displayName: string): Promise<void> {
    const authorize = async (signal = this.signal) => {
      signal.throwIfAborted();
      const response = await fetch(`/api/maps/${encodeURIComponent(mapId)}/realtime-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const error = HostedErrorResponseSchema.safeParse(payload);
        throw new Error(
          error.success ? error.data.error : `Cannot authorize collaboration (${response.status})`,
        );
      }
      const payload: unknown = await response.json().catch(() => null);
      const ticket = HostedRealtimeTicketResponseSchema.safeParse(payload);
      if (!ticket.success)
        throw new Error('Collaboration authorization returned an invalid response');
      return ticket.data.ticket;
    };
    await this.join(mapId, false, { actorId, displayName, authorize, hosted: true });
  }

  private displayName(): string {
    return this.ui.collaborationUi.getSnapshot().displayName.trim().slice(0, 48) || 'Guest mapper';
  }

  private async join(
    mapId: string,
    fromLink: boolean,
    identity?: {
      readonly actorId: string;
      readonly displayName: string;
      readonly authorize: (signal?: AbortSignal) => Promise<string>;
      readonly hosted: true;
    },
  ): Promise<void> {
    const actorId = identity?.actorId ?? this.actorId;
    const displayName = identity?.displayName ?? this.displayName();
    this.mapId = mapId;
    persist(NAME_KEY, this.displayName());
    this.setState('Joining…');
    this.ui.collaborationUi.update({
      joining: true,
      error: null,
      ...(fromLink ? { dialogOpen: true } : {}),
    });
    try {
      this.signal.throwIfAborted();
      await this.joinCollaboration({
        endpoint: collaborationEndpoint(),
        mapId,
        actorId,
        displayName,
        color: collaboratorColor(actorId),
        ...(identity ? { authorize: identity.authorize } : {}),
        onPresence: (presence) => this.receivePresence(presence),
        onLocalPresence: (presence) => this.receivePresence(presence),
        onConflict: () => this.setError('A remote edit conflicted with this map.'),
        onConnectionChange: (state) => {
          if (this.signal.aborted) return;
          if (state === 'connected') this.renderLiveState();
          else if (state === 'disconnected') this.setState('Reconnecting…');
        },
      });
      this.signal.throwIfAborted();
      this.participants.set(actorId, {
        actorId,
        displayName,
        color: collaboratorColor(actorId),
        sentAt: Date.now(),
      });
      this.ui.collaborationUi.update({
        shareLink: window.location.href,
        live: true,
        joining: true,
        state: 'Connecting…',
        description: 'Connecting this hosted map to its live session.',
      });
      this.renderParticipants();
    } catch (error) {
      if (this.signal.aborted) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.leaveCollaboration();
      this.mapId = null;
      this.setError(error instanceof Error ? error.message : String(error));
      this.ui.collaborationUi.update({ joining: false });
    }
  }

  private receivePresence(presence: CollaborationPresence): void {
    if (this.signal.aborted) return;
    const previous = this.participants.get(presence.actorId);
    this.participants.set(presence.actorId, presence);
    const staleBefore = Date.now() - 10_000;
    let removedStale = false;
    for (const [actorId, participant] of this.participants) {
      if (participant.sentAt < staleBefore) {
        this.participants.delete(actorId);
        removedStale = true;
      }
    }
    if (
      !removedStale &&
      previous &&
      previous.displayName === presence.displayName &&
      previous.color === presence.color &&
      previous.viewport === presence.viewport &&
      previous.preview?.interactionId === presence.preview?.interactionId &&
      Boolean(previous.preview) === Boolean(presence.preview) &&
      (previous.selectedObjectIds?.join('\u0000') ?? '') ===
        (presence.selectedObjectIds?.join('\u0000') ?? '')
    )
      return;
    this.renderParticipants();
  }

  private renderLiveState(): void {
    if (this.signal.aborted) return;
    this.ui.collaborationUi.update({
      shareLink: window.location.href,
      live: true,
      joining: false,
      state: 'Live',
      description: 'This map is live. Share the link to invite another mapper.',
    });
    this.renderParticipants();
  }

  private renderParticipants(): void {
    const presences = [...this.participants.values()];
    this.ui.collaborationUi.update({
      participants: presences.map((presence) => ({
        actorId: presence.actorId,
        displayName: presence.displayName || generatedName(presence.actorId),
        color: presence.color ?? collaboratorColor(presence.actorId),
        viewport: viewportLabel(presence.viewport),
        selectedCount: presence.selectedObjectIds?.length ?? 0,
        moving: Boolean(presence.preview),
        isLocal: presence.actorId === this.actorId,
      })),
    });
  }

  private stopSession(): void {
    this.leaveCollaboration();
    this.mapId = null;
    this.participants.clear();
    this.ui.collaborationUi.update({
      live: false,
      joining: false,
      shareLink: '',
      participants: [],
      state: 'Local only',
      description:
        'Live collaboration requires a hosted project and a 4orm account. This local map stays offline.',
    });
  }

  private async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.ui.collaborationUi.getSnapshot().shareLink);
      this.setState('Link copied');
    } catch {
      this.setState('Copy the selected share link manually');
    }
  }

  private setState(value: string): void {
    if (this.signal.aborted) return;
    this.ui.collaborationUi.update({ state: value });
  }

  private setError(value: string): void {
    this.setState('Could not connect');
    this.ui.collaborationUi.update({ error: value, joining: false });
  }

  public dispose(): void {
    this.mapId = null;
    this.participants.clear();
    this.ui.collaborationUi.unbind();
  }
}
