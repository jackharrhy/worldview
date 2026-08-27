import type { PointerDrag } from './viewport-common.js';
import type { ViewportGestureController, ViewportGestureTracker } from './gesture-controller.js';

export interface PointerGestureTracker extends ViewportGestureTracker<PointerEvent, PointerEvent> {
  readonly drag: PointerDrag;
}

type PointerGesturePredicate = (drag: PointerDrag) => boolean;

export type PointerGestureKind =
  | 'camera'
  | 'clip'
  | 'hull'
  | 'face-transfer'
  | 'topology'
  | 'transform'
  | 'sweep'
  | 'face'
  | 'create'
  | 'entity'
  | 'selection';

export function pointerGestureKind(drag: PointerDrag): PointerGestureKind {
  if (drag.cameraMode !== null) return 'camera';
  if (drag.clipping) return 'clip';
  if (drag.hullBuilding) return 'hull';
  if (drag.faceTransferMode !== null) return 'face-transfer';
  if (drag.topologyKind !== null || drag.topologyLasso) return 'topology';
  if (drag.transform !== null) return 'transform';
  if (drag.sweep !== null) return 'sweep';
  if (drag.faceSelection !== null || drag.facePainting || drag.faceLassoEligible) return 'face';
  if (drag.creating) return 'create';
  if (drag.placingEntity) return 'entity';
  return 'selection';
}

class FocusedPointerGestureController implements ViewportGestureController<
  PointerDrag,
  PointerEvent,
  PointerEvent,
  PointerGestureTracker
> {
  public constructor(
    public readonly id: string,
    private readonly accepts: PointerGesturePredicate,
  ) {}

  public begin(drag: PointerDrag): PointerGestureTracker | null {
    if (!this.accepts(drag)) return null;
    return {
      pointerId: drag.pointerId,
      drag,
      update: () => {},
      commit: () => {},
      cancel: () => {},
    };
  }
}

/** Ordered from modal/specialized tools through ordinary selection as the fallback. */
export function createPointerGestureControllers(): readonly ViewportGestureController<
  PointerDrag,
  PointerEvent,
  PointerEvent,
  PointerGestureTracker
>[] {
  return (
    [
      'camera',
      'clip',
      'hull',
      'face-transfer',
      'topology',
      'transform',
      'sweep',
      'face',
      'create',
      'entity',
      'selection',
    ] as const
  ).map(
    (kind) =>
      new FocusedPointerGestureController(kind, (drag) => pointerGestureKind(drag) === kind),
  );
}
