import type { Bounds } from '../core/index.js';
import type { SolidBatch } from './scene-solid-batches.js';

export interface SceneBuffers {
  readonly solids: readonly SolidBatch[];
  readonly lines: GPUBuffer;
  readonly lineCount: number;
  readonly overlayLines: GPUBuffer;
  readonly overlayLineCount: number;
  readonly remoteLines: GPUBuffer;
  readonly remoteLineCount: number;
  readonly remoteSolids: readonly SolidBatch[];
  readonly perspectiveGrid: GPUBuffer;
  readonly perspectiveGridCount: number;
  readonly scaleBounds: Bounds | null;
}
