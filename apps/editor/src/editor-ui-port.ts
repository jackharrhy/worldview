import { SnapshotStore } from '@jackharrhy/worldview/runtime';

/** Snapshot publication and presenter lifetime shared by the editor's UI surfaces. */
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
    this.store.set(snapshot);
  }

  public update(update: Partial<Snapshot>): void {
    this.set({ ...this.getSnapshot(), ...update });
  }
}
