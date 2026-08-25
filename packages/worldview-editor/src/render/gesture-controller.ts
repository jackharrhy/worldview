export type GestureControllerState<T extends { readonly pointerId: number }> =
  | { readonly phase: 'idle' }
  | { readonly phase: 'active'; readonly gesture: T; readonly updateCount: number }
  | { readonly phase: 'committed'; readonly pointerId: number; readonly updateCount: number }
  | { readonly phase: 'cancelled'; readonly pointerId: number; readonly updateCount: number };

export class GestureController<T extends { readonly pointerId: number }> {
  private value: GestureControllerState<T> = { phase: 'idle' };

  public get state(): GestureControllerState<T> {
    return this.value;
  }

  public get current(): T | null {
    return this.value.phase === 'active' ? this.value.gesture : null;
  }

  public begin(gesture: T): T {
    if (this.value.phase === 'active') {
      throw new Error(`Pointer ${this.value.gesture.pointerId} already owns the active gesture`);
    }
    this.value = { phase: 'active', gesture, updateCount: 0 };
    return gesture;
  }

  public update(pointerId: number): T | null {
    if (this.value.phase !== 'active' || this.value.gesture.pointerId !== pointerId) return null;
    this.value = {
      phase: 'active',
      gesture: this.value.gesture,
      updateCount: this.value.updateCount + 1,
    };
    return this.value.gesture;
  }

  public commit(pointerId: number): T | null {
    if (this.value.phase !== 'active' || this.value.gesture.pointerId !== pointerId) return null;
    const { gesture, updateCount } = this.value;
    this.value = { phase: 'committed', pointerId, updateCount };
    return gesture;
  }

  public cancel(pointerId = this.current?.pointerId): T | null {
    if (
      pointerId === undefined ||
      this.value.phase !== 'active' ||
      this.value.gesture.pointerId !== pointerId
    ) {
      return null;
    }
    const { gesture, updateCount } = this.value;
    this.value = { phase: 'cancelled', pointerId, updateCount };
    return gesture;
  }
}
