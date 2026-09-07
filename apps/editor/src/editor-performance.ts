/** Opt-in, bounded local diagnostics. Contains timing data only, never map contents. */
export interface TimingSample {
  readonly at: number;
  readonly frameMs: number;
  readonly renderCalls: number;
  readonly renderCpuMs: number;
}

class EditorPerformance {
  enabled = false;
  recording = false;
  samples: TimingSample[] = [];
  capture: TimingSample[] = [];
  private frame = 0;
  private previous = 0;
  private started = 0;
  private calls = 0;
  private cpu = 0;
  private listeners = new Set<() => void>();
  private version = 0;
  private published = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.version;
  private publish() {
    this.version++;
    for (const listener of this.listeners) listener();
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    cancelAnimationFrame(this.frame);
    document.removeEventListener('visibilitychange', this.resetBaseline);
    this.previous = 0;
    this.calls = 0;
    this.cpu = 0;
    this.samples = [];
    if (enabled) {
      document.addEventListener('visibilitychange', this.resetBaseline);
      this.frame = requestAnimationFrame(this.tick);
    } else this.recording = false;
    this.publish();
  }
  private resetBaseline = () => {
    this.previous = 0;
    this.calls = 0;
    this.cpu = 0;
  };
  recordRender(cpuMs: number) {
    if (!this.enabled) return;
    this.calls++;
    this.cpu += cpuMs;
  }
  startCapture() {
    this.capture = [];
    this.started = performance.now();
    this.recording = true;
    this.publish();
  }
  stopCapture() {
    this.recording = false;
    this.publish();
  }
  private tick = (now: number) => {
    // Hidden-tab throttling is not an editor frame drop. Resume with a fresh baseline.
    if (document.visibilityState === 'visible' && this.previous) {
      const sample = {
        at: now,
        frameMs: now - this.previous,
        renderCalls: this.calls,
        renderCpuMs: this.cpu,
      };
      this.samples.push(sample);
      if (this.samples.length > 240) this.samples.shift();
      if (this.recording) {
        this.capture.push(sample);
        if (now - this.started >= 30_000 || this.capture.length >= 10_000) this.recording = false;
      }
    }
    this.previous = document.visibilityState === 'visible' ? now : 0;
    this.calls = 0;
    this.cpu = 0;
    if (now - this.published >= 250) {
      this.published = now;
      this.publish();
    }
    this.frame = requestAnimationFrame(this.tick);
  };
}

export const editorPerformance = new EditorPerformance();

export function summarizeTimings(samples: readonly TimingSample[]) {
  const sorted = samples.map((sample) => sample.frameMs).toSorted((a, b) => a - b);
  const elapsed = sorted.reduce((sum, ms) => sum + ms, 0);
  const calls = samples.reduce((sum, sample) => sum + sample.renderCalls, 0);
  return {
    frames: samples.length,
    fps: elapsed ? (samples.length * 1000) / elapsed : 0,
    p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
    maxMs: sorted.at(-1) ?? 0,
    over33Ms: sorted.filter((ms) => ms > 33.34).length,
    over50Ms: sorted.filter((ms) => ms > 50).length,
    renderCalls: calls,
    meanRenderCpuMs: calls
      ? samples.reduce((sum, sample) => sum + sample.renderCpuMs, 0) / calls
      : 0,
  };
}
