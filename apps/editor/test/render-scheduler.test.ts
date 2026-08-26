import { describe, expect, it, vi } from 'vitest';

import { OnDemandRenderScheduler } from '../src/render-scheduler.js';

describe('on-demand renderer scheduling', () => {
  it('coalesces invalidations and sleeps after one idle frame', () => {
    const frames: FrameRequestCallback[] = [];
    const scheduler = new OnDemandRenderScheduler((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const render = vi.fn(() => false);

    scheduler.setTarget({ render });
    scheduler.request();
    scheduler.request();
    expect(frames).toHaveLength(1);

    frames.shift()!(0);
    expect(render).toHaveBeenCalledOnce();
    expect(frames).toHaveLength(0);

    scheduler.request();
    expect(frames).toHaveLength(1);
  });

  it('continues only while the renderer reports active camera animation', () => {
    const frames: FrameRequestCallback[] = [];
    const scheduler = new OnDemandRenderScheduler((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const render = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);

    scheduler.setTarget({ render });
    frames.shift()!(0);
    expect(frames).toHaveLength(1);
    frames.shift()!(16);

    expect(render).toHaveBeenCalledTimes(2);
    expect(frames).toHaveLength(0);
  });
});
