import { SnapshotStore } from '@jackharrhy/worldview';

export interface EditorToolSettingsSnapshot {
  readonly gridSize: number;
  readonly textureLock: boolean;
}

export interface EditorToolSettingsActions {
  setGridSize(size: number): void;
  setTextureLock(enabled: boolean): void;
}

export class EditorToolSettingsPort {
  private readonly store = new SnapshotStore<EditorToolSettingsSnapshot>({
    gridSize: 16,
    textureLock: true,
  });
  private actions: EditorToolSettingsActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: EditorToolSettingsActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
  }
  public update(update: Partial<EditorToolSettingsSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
  public setGridSize(size: number): void {
    this.actions?.setGridSize(size);
  }
  public setTextureLock(enabled: boolean): void {
    this.actions?.setTextureLock(enabled);
  }
}
