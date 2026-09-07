import { afterEach, describe, expect, it, vi } from 'vitest';
import { editorPerformance, summarizeTimings } from './editor-performance.js';

describe('performance summaries', () => {
  it('separates browser cadence from on-demand rendering and weights CPU by calls', () => {
    const summary = summarizeTimings([
      { at: 10, frameMs: 10, renderCalls: 0, renderCpuMs: 0 },
      { at: 30, frameMs: 20, renderCalls: 1, renderCpuMs: 2 },
      { at: 90, frameMs: 60, renderCalls: 2, renderCpuMs: 10 },
    ]);
    expect(summary.fps).toBeCloseTo(1000 / 30);
    expect(summary.renderCalls).toBe(3);
    expect(summary.meanRenderCpuMs).toBe(4);
    expect(summary.over33Ms).toBe(1);
    expect(summary.over50Ms).toBe(1);
    expect(summary.p95Ms).toBe(60);
    expect(summarizeTimings([]).fps).toBe(0);
  });
});

describe('performance capture lifecycle', () => {
  afterEach(() => {
    editorPerformance.setEnabled(false);
    vi.unstubAllGlobals();
  });
  it('ignores hidden intervals, stops at 30 seconds, and cancels monitoring', () => {
    let nextFrame!: FrameRequestCallback;
    const target = new EventTarget();
    const page = Object.assign(target, { visibilityState: 'visible' });
    const cancel = vi.fn();
    vi.stubGlobal('document', page);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      nextFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', cancel);
    editorPerformance.setEnabled(true);
    editorPerformance.startCapture();
    const start = performance.now();
    nextFrame(start);
    editorPerformance.recordRender(3);
    nextFrame(start + 16);
    expect(editorPerformance.capture).toHaveLength(1);
    expect(editorPerformance.capture[0]?.renderCpuMs).toBe(3);
    page.visibilityState = 'hidden';
    page.dispatchEvent(new Event('visibilitychange'));
    page.visibilityState = 'visible';
    page.dispatchEvent(new Event('visibilitychange'));
    nextFrame(start + 20_000);
    nextFrame(start + 20_016);
    expect(editorPerformance.capture[1]?.frameMs).toBe(16);
    nextFrame(start + 30_001);
    expect(editorPerformance.recording).toBe(false);
    const length = editorPerformance.capture.length;
    nextFrame(start + 30_017);
    expect(editorPerformance.capture).toHaveLength(length);
    editorPerformance.setEnabled(false);
    expect(cancel).toHaveBeenCalled();
  });
});
