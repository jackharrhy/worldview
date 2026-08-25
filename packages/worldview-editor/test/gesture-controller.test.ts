import { describe, expect, it } from 'vitest';

import { GestureController } from '../src/render/gesture-controller.js';

interface TestGesture {
  readonly pointerId: number;
  value: number;
}

describe('GestureController', () => {
  it('owns the explicit begin, update, and commit lifecycle', () => {
    const controller = new GestureController<TestGesture>();
    const gesture = controller.begin({ pointerId: 7, value: 1 });

    expect(controller.state).toEqual({ phase: 'active', gesture, updateCount: 0 });
    expect(controller.update(99)).toBeNull();
    expect(controller.update(7)).toBe(gesture);
    gesture.value = 2;
    expect(controller.commit(7)).toBe(gesture);
    expect(controller.current).toBeNull();
    expect(controller.state).toEqual({ phase: 'committed', pointerId: 7, updateCount: 1 });
  });

  it('cancels only the active pointer and permits the next gesture', () => {
    const controller = new GestureController<TestGesture>();
    const first = controller.begin({ pointerId: 3, value: 1 });

    expect(controller.cancel(4)).toBeNull();
    expect(() => controller.begin({ pointerId: 4, value: 2 })).toThrow(/already owns/);
    expect(controller.cancel()).toBe(first);
    expect(controller.state).toEqual({ phase: 'cancelled', pointerId: 3, updateCount: 0 });

    expect(controller.begin({ pointerId: 4, value: 2 }).pointerId).toBe(4);
  });
});
