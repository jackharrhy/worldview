import { EditorUiPort } from './editor-ui-port.js';

export interface EditorToolSettingsSnapshot {
  readonly gridSize: number;
  readonly textureLock: boolean;
}

export interface EditorToolSettingsActions {
  setGridSize(size: number): void;
  setTextureLock(enabled: boolean): void;
}

export class EditorToolSettingsPort extends EditorUiPort<
  EditorToolSettingsSnapshot,
  EditorToolSettingsActions
> {
  public constructor() {
    super({
      gridSize: 16,
      textureLock: true,
    });
  }
  public setGridSize(size: number): void {
    this.actions?.setGridSize(size);
  }
  public setTextureLock(enabled: boolean): void {
    this.actions?.setTextureLock(enabled);
  }
}
