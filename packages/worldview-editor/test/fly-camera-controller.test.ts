import { describe, expect, it, vi } from 'vitest';

import { FlyCameraController } from '../src/render/viewport/fly-camera-controller.js';

class FakeCanvas extends EventTarget {
  public readonly classes = new Set<string>();

  public closest(): Pick<Element, 'classList'> {
    return {
      classList: {
        add: (...tokens: string[]) => tokens.forEach((token) => this.classes.add(token)),
        remove: (...tokens: string[]) => tokens.forEach((token) => this.classes.delete(token)),
      } as DOMTokenList,
    };
  }
}

function keyboardEvent(type: 'keydown' | 'keyup', key: string): KeyboardEvent {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'key', { value: key });
  return event as KeyboardEvent;
}

describe('fly camera controller', () => {
  it('starts without turning idle time into a camera jump', () => {
    const canvas = new FakeCanvas();
    let now = 0;
    const translate = vi.fn();
    const changed = vi.fn();
    const requestFrame = vi.fn();
    const controller = new FlyCameraController({
      kind: 'perspective',
      canvas: canvas as unknown as HTMLCanvasElement,
      forward: () => [1, 0, 0],
      speed: () => 100,
      translate,
      changed,
      requestFrame,
      now: () => now,
    });

    now = 10_000;
    canvas.dispatchEvent(keyboardEvent('keydown', 'w'));
    controller.update();
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(translate).not.toHaveBeenCalled();

    now += 20;
    controller.update();
    expect(translate).toHaveBeenCalledWith([2, 0, 0]);
    expect(changed).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('normalizes combined movement and releases focus state on blur', () => {
    const canvas = new FakeCanvas();
    let now = 0;
    const translate = vi.fn();
    const controller = new FlyCameraController({
      kind: 'perspective',
      canvas: canvas as unknown as HTMLCanvasElement,
      forward: () => [1, 0, 0],
      speed: () => 100,
      translate,
      changed: vi.fn(),
      requestFrame: vi.fn(),
      now: () => now,
    });

    canvas.dispatchEvent(new Event('focus'));
    expect(canvas.classes.has('camera-focused')).toBe(true);
    canvas.dispatchEvent(keyboardEvent('keydown', 'w'));
    canvas.dispatchEvent(keyboardEvent('keydown', 'd'));
    now = 50;
    controller.update();
    const delta = translate.mock.calls[0]![0] as readonly number[];
    expect(Math.hypot(...delta)).toBeCloseTo(5);

    canvas.dispatchEvent(new Event('blur'));
    expect(controller.active).toBe(false);
    expect(canvas.classes.has('camera-focused')).toBe(false);
    controller.dispose();
  });
});
