export type SnapshotStoreListener = () => void;

/** Minimal framework-neutral immutable snapshot store for browser application shells. */
export class SnapshotStore<T> {
  private readonly listeners = new Set<SnapshotStoreListener>();

  public constructor(private snapshot: T) {}

  public readonly getSnapshot = (): T => this.snapshot;

  public readonly subscribe = (listener: SnapshotStoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public set(next: T): void {
    if (Object.is(next, this.snapshot)) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  public update(updater: (current: T) => T): void {
    this.set(updater(this.snapshot));
  }
}
