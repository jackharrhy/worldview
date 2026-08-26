import { describe, expect, it, vi } from 'vitest';

import { SnapshotStore } from '../src/runtime/snapshot-store.js';

describe('snapshot store', () => {
  it('keeps stable snapshots and notifies only for a new identity', () => {
    const initial = { count: 0 };
    const store = new SnapshotStore(initial);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(store.getSnapshot()).toBe(initial);
    store.set(initial);
    expect(listener).not.toHaveBeenCalled();

    store.update((current) => ({ count: current.count + 1 }));
    expect(store.getSnapshot()).toEqual({ count: 1 });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    store.update((current) => ({ count: current.count + 1 }));
    expect(listener).toHaveBeenCalledOnce();
  });
});
