import { EditorUiPort } from './editor-ui-port.js';

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

export class PointEntityToolPort extends EditorUiPort<
  PointEntityToolSnapshot,
  PointEntityToolActions
> {
  public constructor() {
    super({
      visible: false,
      classname: 'light',
      presets: [],
    });
  }
  public setClassname(classname: string): void {
    this.actions?.setClassname(classname);
  }
}
