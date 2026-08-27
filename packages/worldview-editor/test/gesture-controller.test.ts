import { describe, expect, it } from 'vitest';

import {
  ViewportGestureRouter,
  type ViewportGestureController,
} from '../src/render/gesture-controller.js';
import {
  createPointerGestureControllers,
  pointerGestureKind,
} from '../src/render/viewport-gesture-controllers.js';
import type { PointerDrag } from '../src/render/viewport-common.js';

const pointerDrag = (overrides: Partial<PointerDrag> = {}): PointerDrag =>
  ({
    pointerId: 1,
    cameraMode: null,
    clipping: false,
    hullBuilding: false,
    faceTransferMode: null,
    topologyKind: null,
    topologyLasso: false,
    transform: null,
    sweep: null,
    faceSelection: null,
    facePainting: false,
    faceLassoEligible: false,
    creating: false,
    placingEntity: false,
    ...overrides,
  }) as PointerDrag;

describe('ViewportGestureRouter', () => {
  it('uses controller order and gives one tracker the complete lifecycle', () => {
    const calls: string[] = [];
    const controller = (
      id: string,
      accepts: boolean,
    ): ViewportGestureController<{ pointerId: number }, number, string> => ({
      id,
      begin: ({ pointerId }) => {
        calls.push(`${id}:begin`);
        if (!accepts) return null;
        return {
          pointerId,
          update: (value) => calls.push(`${id}:update:${value}`),
          commit: (value) => calls.push(`${id}:commit:${value}`),
          cancel: () => calls.push(`${id}:cancel`),
        };
      },
    });
    const router = new ViewportGestureRouter([
      controller('camera', false),
      controller('selection', true),
      controller('fallback', true),
    ]);

    expect(router.begin({ pointerId: 4 })).toBe('selection');
    expect(router.update(9, 1)).toBe(false);
    expect(router.update(4, 2)).toBe(true);
    expect(router.commit(4, 'done')).toBe(true);
    expect(calls).toEqual([
      'camera:begin',
      'selection:begin',
      'selection:update:2',
      'selection:commit:done',
    ]);
    expect(router.state).toEqual({
      phase: 'committed',
      controllerId: 'selection',
      pointerId: 4,
      updateCount: 1,
    });
  });

  it('cancels the active tracker and rejects duplicate controller IDs', () => {
    let cancelled = 0;
    const controller: ViewportGestureController<{ pointerId: number }, never, never> = {
      id: 'camera',
      begin: ({ pointerId }) => ({
        pointerId,
        update: () => {},
        commit: () => {},
        cancel: () => {
          cancelled += 1;
        },
      }),
    };
    const router = new ViewportGestureRouter([controller]);
    router.begin({ pointerId: 7 });
    expect(() => router.begin({ pointerId: 8 })).toThrow(/already owns/);
    expect(router.cancel(8)).toBe(false);
    expect(router.cancel()).toBe(true);
    expect(cancelled).toBe(1);
    expect(() => new ViewportGestureRouter([controller, controller])).toThrow(/Duplicate/);
  });
});

describe('viewport pointer gesture controllers', () => {
  it('classifies modal gestures ahead of ordinary tool and selection gestures', () => {
    expect(pointerGestureKind(pointerDrag())).toBe('selection');
    expect(pointerGestureKind(pointerDrag({ creating: true }))).toBe('create');
    expect(pointerGestureKind(pointerDrag({ topologyKind: 'vertex', creating: true }))).toBe(
      'topology',
    );
    expect(pointerGestureKind(pointerDrag({ cameraMode: 'pan', clipping: true }))).toBe('camera');
  });

  it('routes the live drag object into its focused tracker', () => {
    const value = pointerDrag({ clipping: true });
    const router = new ViewportGestureRouter(createPointerGestureControllers());
    expect(router.begin(value)).toBe('clip');
    expect(router.activeTracker?.drag).toBe(value);
  });
});
