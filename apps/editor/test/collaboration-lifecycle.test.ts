import { describe, expect, it, vi } from 'vitest';

import { CollaborationLifecycle } from '../src/collaboration-lifecycle.js';

describe('CollaborationLifecycle', () => {
  it('owns the connect, reconnect, conflict, and leave transitions', () => {
    const lifecycle = new CollaborationLifecycle();
    const listener = vi.fn();
    lifecycle.subscribe(listener);

    lifecycle.beginConnect('map-one');
    lifecycle.connected('map-one');
    lifecycle.disconnected('map-one');
    lifecycle.conflicted('map-one', 'brush changed remotely');
    lifecycle.beginLeave();
    lifecycle.left();

    expect(listener.mock.calls.map(([snapshot]) => snapshot)).toEqual([
      { status: 'connecting', mapId: 'map-one' },
      { status: 'live', mapId: 'map-one' },
      { status: 'reconnecting', mapId: 'map-one' },
      { status: 'conflict', mapId: 'map-one', reason: 'brush changed remotely' },
      { status: 'leaving', mapId: 'map-one' },
      { status: 'solo' },
    ]);
  });

  it('represents a hosted session that becomes a detached local copy', () => {
    const lifecycle = new CollaborationLifecycle();
    lifecycle.beginConnect('map-one');
    lifecycle.disconnected('map-one');
    lifecycle.detach('map-one', 'Offline edit limit reached');

    expect(lifecycle.getSnapshot()).toEqual({
      status: 'detached-local',
      mapId: 'map-one',
      reason: 'Offline edit limit reached',
    });
  });

  it('rejects stale transport callbacks for another map', () => {
    const lifecycle = new CollaborationLifecycle();
    lifecycle.beginConnect('map-one');

    expect(() => lifecycle.connected('map-two')).toThrow(
      'Collaboration lifecycle is not active for map map-two',
    );
  });

  it('does not notify subscribers for duplicate transitions', () => {
    const lifecycle = new CollaborationLifecycle();
    const listener = vi.fn();
    lifecycle.subscribe(listener);
    lifecycle.beginConnect('map-one');
    lifecycle.beginConnect('map-one');

    expect(listener).toHaveBeenCalledOnce();
  });

  it('does not let late transport callbacks overwrite conflict or leaving states', () => {
    const lifecycle = new CollaborationLifecycle();
    lifecycle.beginConnect('map-one');
    lifecycle.conflicted('map-one', 'conflict');
    lifecycle.connected('map-one');
    expect(lifecycle.getSnapshot().status).toBe('conflict');

    lifecycle.beginLeave();
    lifecycle.disconnected('map-one');
    expect(lifecycle.getSnapshot().status).toBe('leaving');
  });
});
