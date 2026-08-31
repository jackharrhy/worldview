import { SnapshotStore } from '@jackharrhy/worldview';

export interface PointEntityPresetSnapshot {
  readonly id: string;
  readonly label: string;
}

export interface PointEntityToolSnapshot {
  readonly visible: boolean;
  readonly classname: string;
  readonly presets: readonly PointEntityPresetSnapshot[];
}

export interface PointEntityToolActions {
  setClassname(classname: string): void;
}

export class PointEntityToolPort {
  private readonly store = new SnapshotStore<PointEntityToolSnapshot>({
    visible: false,
    classname: 'light',
    presets: [],
  });
  private actions: PointEntityToolActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: PointEntityToolActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
  }
  public update(update: Partial<PointEntityToolSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
  public setClassname(classname: string): void {
    this.actions?.setClassname(classname);
  }
}
