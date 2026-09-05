import { SnapshotStore } from '@jackharrhy/worldview/runtime';

export interface ReferenceSceneSnapshot {
  readonly id: string;
  readonly label: string;
  readonly visible: boolean;
  readonly offset: readonly [number, number, number];
}

export interface ReferenceScenesActions {
  setVisible(id: string, visible: boolean): void;
  setOffset(id: string, axis: 0 | 1 | 2, value: number): void;
  remove(id: string): void;
  clear(): void;
}

export class ReferenceScenesPort {
  private readonly store = new SnapshotStore<readonly ReferenceSceneSnapshot[]>([]);
  private actions: ReferenceScenesActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: ReferenceScenesActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
    this.store.set([]);
  }
  public set(scenes: readonly ReferenceSceneSnapshot[]): void {
    this.store.set(scenes);
  }
  public get commands(): ReferenceScenesActions | null {
    return this.actions;
  }
}
