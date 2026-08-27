/** One focused input controller in an ordered viewport routing chain. */
export interface ViewportGestureController<
  BeginInput,
  UpdateInput,
  EndInput,
  Tracker extends ViewportGestureTracker<UpdateInput, EndInput> = ViewportGestureTracker<
    UpdateInput,
    EndInput
  >,
> {
  readonly id: string;
  begin(input: BeginInput): Tracker | null;
}

/** Owns all mutable state and lifecycle behavior for one accepted gesture. */
export interface ViewportGestureTracker<UpdateInput, EndInput> {
  readonly pointerId: number;
  update(input: UpdateInput): void;
  commit(input: EndInput): void;
  cancel(): void;
}

export type ViewportGestureRouterState =
  | { readonly phase: 'idle' }
  | {
      readonly phase: 'active';
      readonly controllerId: string;
      readonly pointerId: number;
      readonly updateCount: number;
    }
  | {
      readonly phase: 'committed' | 'cancelled';
      readonly controllerId: string;
      readonly pointerId: number;
      readonly updateCount: number;
    };

/** Routes input to the first focused controller that accepts it and owns at most one tracker. */
export class ViewportGestureRouter<
  BeginInput,
  UpdateInput,
  EndInput,
  Tracker extends ViewportGestureTracker<UpdateInput, EndInput> = ViewportGestureTracker<
    UpdateInput,
    EndInput
  >,
> {
  private active: {
    readonly controllerId: string;
    readonly tracker: Tracker;
    updateCount: number;
  } | null = null;
  private value: ViewportGestureRouterState = { phase: 'idle' };

  public constructor(
    private readonly controllers: readonly ViewportGestureController<
      BeginInput,
      UpdateInput,
      EndInput,
      Tracker
    >[],
  ) {
    const ids = new Set<string>();
    for (const controller of controllers) {
      if (!controller.id.trim()) throw new Error('Viewport gesture controllers require an ID');
      if (ids.has(controller.id)) {
        throw new Error(`Duplicate viewport gesture controller ID ${controller.id}`);
      }
      ids.add(controller.id);
    }
  }

  public get state(): ViewportGestureRouterState {
    return this.value;
  }

  public get activePointerId(): number | null {
    return this.active?.tracker.pointerId ?? null;
  }

  public get activeTracker(): Tracker | null {
    return this.active?.tracker ?? null;
  }

  public begin(input: BeginInput): string | null {
    if (this.active) {
      throw new Error(`Pointer ${this.active.tracker.pointerId} already owns the active gesture`);
    }
    for (const controller of this.controllers) {
      const tracker = controller.begin(input);
      if (!tracker) continue;
      this.active = { controllerId: controller.id, tracker, updateCount: 0 };
      this.value = {
        phase: 'active',
        controllerId: controller.id,
        pointerId: tracker.pointerId,
        updateCount: 0,
      };
      return controller.id;
    }
    return null;
  }

  public update(pointerId: number, input: UpdateInput): boolean {
    if (!this.active || this.active.tracker.pointerId !== pointerId) return false;
    this.active.tracker.update(input);
    this.active.updateCount += 1;
    this.value = {
      phase: 'active',
      controllerId: this.active.controllerId,
      pointerId,
      updateCount: this.active.updateCount,
    };
    return true;
  }

  public commit(pointerId: number, input: EndInput): boolean {
    if (!this.active || this.active.tracker.pointerId !== pointerId) return false;
    const active = this.active;
    active.tracker.commit(input);
    this.active = null;
    this.value = {
      phase: 'committed',
      controllerId: active.controllerId,
      pointerId,
      updateCount: active.updateCount,
    };
    return true;
  }

  public cancel(pointerId = this.active?.tracker.pointerId): boolean {
    if (pointerId === undefined || !this.active || this.active.tracker.pointerId !== pointerId) {
      return false;
    }
    const active = this.active;
    active.tracker.cancel();
    this.active = null;
    this.value = {
      phase: 'cancelled',
      controllerId: active.controllerId,
      pointerId,
      updateCount: active.updateCount,
    };
    return true;
  }
}
