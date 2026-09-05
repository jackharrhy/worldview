import { EditorUiPort } from './editor-ui-port.js';
import {
  DEFAULT_SIMPLE_SHAPE_OPTIONS,
  type SimpleShapeOptions,
  type SweepOptions,
  type SweepTransform,
} from '@jackharrhy/worldview-editor';

export interface SimpleShapeToolSnapshot {
  readonly visible: boolean;
  readonly result: string;
  readonly options: SimpleShapeOptions;
}

export interface SimpleShapeToolActions {
  updateOptions(update: Partial<SimpleShapeOptions>): void;
}

export class SimpleShapeToolPort extends EditorUiPort<
  SimpleShapeToolSnapshot,
  SimpleShapeToolActions
> {
  public constructor() {
    super({
      visible: true,
      result: 'cuboid ready',
      options: DEFAULT_SIMPLE_SHAPE_OPTIONS,
    });
  }
  public updateOptions(update: Partial<SimpleShapeOptions>): void {
    this.actions?.updateOptions(update);
  }
}

export interface SweepToolSnapshot {
  readonly visible: boolean;
  readonly generatedLabel: string;
  readonly canApply: boolean;
  readonly transform: SweepTransform;
  readonly options: SweepOptions;
  readonly gridSize: number;
}

export interface SweepToolActions {
  setTransform(transform: SweepTransform): void;
  setOptions(update: Partial<SweepOptions>): void;
  reset(): void;
  apply(): void;
}

export class SweepToolPort extends EditorUiPort<SweepToolSnapshot, SweepToolActions> {
  public constructor() {
    super({
      visible: false,
      generatedLabel: '0 brushes',
      canApply: false,
      transform: {
        translation: [0, 0, 64],
        rotationDegrees: [0, 0, 0],
        scale: 1,
      },
      options: {
        path: 'straight',
        segments: 4,
        iterations: 1,
        snapToInteger: false,
        textureLock: true,
      },
      gridSize: 16,
    });
  }
  public setTransform(transform: SweepTransform): void {
    this.actions?.setTransform(transform);
  }
  public setOptions(update: Partial<SweepOptions>): void {
    this.actions?.setOptions(update);
  }
  public reset(): void {
    this.actions?.reset();
  }
  public apply(): void {
    this.actions?.apply();
  }
}
