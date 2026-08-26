export interface OnDemandRenderTarget {
  /** Returns true while another animation frame is required. */
  render(): boolean;
}

type RequestFrame = (callback: FrameRequestCallback) => number;

/** Coalesces renderer invalidations and sleeps completely while the editor is visually idle. */
export class OnDemandRenderScheduler {
  private target: OnDemandRenderTarget | null = null;
  private pendingFrame: number | null = null;

  public constructor(
    private readonly requestFrame: RequestFrame = (callback) => requestAnimationFrame(callback),
  ) {}

  public setTarget(target: OnDemandRenderTarget): void {
    this.target = target;
    this.request();
  }

  public request(): void {
    if (this.pendingFrame !== null) return;
    this.pendingFrame = this.requestFrame(() => {
      this.pendingFrame = null;
      if (this.target?.render()) this.request();
    });
  }
}
