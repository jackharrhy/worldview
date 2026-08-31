import { SnapshotStore } from '@jackharrhy/worldview';
import type {
  SimpleShapeOptions,
  SweepOptions,
  SweepTransform,
} from '@jackharrhy/worldview-editor';

export interface SimpleShapeToolSnapshot {
  readonly visible: boolean;
  readonly result: string;
  readonly options: SimpleShapeOptions;
}

export interface SimpleShapeToolActions {
  updateOptions(update: Partial<SimpleShapeOptions>): void;
}

export class SimpleShapeToolPort {
  private readonly store = new SnapshotStore<SimpleShapeToolSnapshot>({
    visible: true,
    result: 'cuboid ready',
    options: {
      kind: 'cuboid',
      axis: 2,
      sides: 8,
      circleMode: 'edge-aligned',
      hollow: false,
      thickness: 16,
      rings: 8,
      accuracy: 1,
      stepHeight: 16,
      stairDirection: 'positive-x',
    },
  });
  private actions: SimpleShapeToolActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: SimpleShapeToolActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
  }
  public update(update: Partial<SimpleShapeToolSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
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

export class SweepToolPort {
  private readonly store = new SnapshotStore<SweepToolSnapshot>({
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
  private actions: SweepToolActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: SweepToolActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
  }
  public update(update: Partial<SweepToolSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
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
