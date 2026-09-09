import { SnapshotStore } from '@jackharrhy/worldview/runtime';

/** UI snapshots are immutable records; compare fields, never walk scene/document graphs. */
export function equalUiSnapshot<T extends object>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true;
  const keys = Object.keys(left) as (keyof T)[];
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && Object.is(left[key], right[key]))
  );
}

export class EditorUiPort<Snapshot extends object, Actions = never> {
  protected readonly store: SnapshotStore<Snapshot>;
  protected actions: Actions | null = null;

  public constructor(snapshot: Snapshot) {
    this.store = new SnapshotStore(snapshot);
  }

  public readonly getSnapshot = (): Snapshot => this.store.getSnapshot();
  public readonly subscribe = (listener: () => void): (() => void) =>
    this.store.subscribe(listener);

  public get commands(): Actions | null {
    return this.actions;
  }

  public bind(actions: Actions): void {
    this.actions = actions;
  }

  public unbind(): void {
    this.actions = null;
  }

  public set(snapshot: Snapshot): void {
    if (equalUiSnapshot(this.getSnapshot(), snapshot)) return;
    this.store.set(snapshot);
  }

  public update(update: Partial<Snapshot>): void {
    this.set({ ...this.getSnapshot(), ...update });
  }
}
