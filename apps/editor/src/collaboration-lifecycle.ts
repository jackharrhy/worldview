export type CollaborationLifecycleSnapshot =
  | { readonly status: 'solo' }
  | { readonly status: 'connecting'; readonly mapId: string }
  | { readonly status: 'live'; readonly mapId: string }
  | { readonly status: 'reconnecting'; readonly mapId: string }
  | { readonly status: 'detached-local'; readonly mapId: string; readonly reason: string }
  | { readonly status: 'conflict'; readonly mapId: string; readonly reason: string }
  | { readonly status: 'leaving'; readonly mapId: string };

export type CollaborationLifecycleListener = (snapshot: CollaborationLifecycleSnapshot) => void;

/** Transport- and UI-independent owner of collaboration lifecycle transitions. */
export class CollaborationLifecycle {
  private snapshot: CollaborationLifecycleSnapshot = { status: 'solo' };
  private readonly listeners = new Set<CollaborationLifecycleListener>();

  public getSnapshot(): CollaborationLifecycleSnapshot {
    return this.snapshot;
  }

  public subscribe(listener: CollaborationLifecycleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public beginConnect(mapId: string): void {
    if (!mapId) throw new Error('A collaboration map ID is required');
    this.publish({ status: 'connecting', mapId });
  }

  public connected(mapId: string): void {
    const current = this.currentFor(mapId);
    if (current.status !== 'connecting' && current.status !== 'reconnecting') return;
    this.publish({ status: 'live', mapId });
  }

  public disconnected(mapId: string): void {
    const current = this.currentFor(mapId);
    if (
      current.status !== 'connecting' &&
      current.status !== 'live' &&
      current.status !== 'reconnecting'
    )
      return;
    this.publish({ status: 'reconnecting', mapId });
  }

  public conflicted(mapId: string, reason: string): void {
    const current = this.currentFor(mapId);
    if (current.status === 'leaving' || current.status === 'detached-local') return;
    this.publish({ status: 'conflict', mapId, reason });
  }

  public detach(mapId: string, reason: string): void {
    const current = this.currentFor(mapId);
    if (current.status === 'leaving') return;
    this.publish({ status: 'detached-local', mapId, reason });
  }

  public beginLeave(): void {
    if (this.snapshot.status === 'solo') return;
    this.publish({ status: 'leaving', mapId: this.snapshot.mapId });
  }

  public left(): void {
    this.publish({ status: 'solo' });
  }

  private currentFor(mapId: string): Exclude<CollaborationLifecycleSnapshot, { status: 'solo' }> {
    if (this.snapshot.status === 'solo' || this.snapshot.mapId !== mapId) {
      throw new Error(`Collaboration lifecycle is not active for map ${mapId}`);
    }
    return this.snapshot;
  }

  private publish(snapshot: CollaborationLifecycleSnapshot): void {
    if (
      this.snapshot.status === snapshot.status &&
      ('mapId' in this.snapshot ? this.snapshot.mapId : null) ===
        ('mapId' in snapshot ? snapshot.mapId : null) &&
      ('reason' in this.snapshot ? this.snapshot.reason : null) ===
        ('reason' in snapshot ? snapshot.reason : null)
    ) {
      return;
    }
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
