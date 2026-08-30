import type { Bounds } from '../core/index.js';
import type { SolidBatch } from './scene-solid-batches.js';
import type { LineBatch } from './scene-line-batches.js';

export interface SceneBuffers {
  readonly solids: readonly SolidBatch[];
  readonly lineBatches: readonly LineBatch[];
  readonly lines: GPUBuffer;
  readonly lineCount: number;
  readonly overlayLines: GPUBuffer;
  readonly overlayLineCount: number;
  readonly selectionLines: GPUBuffer;
  readonly selectionLineCount: number;
  readonly selectionSolids: readonly SolidBatch[];
  readonly remoteLines: GPUBuffer;
  readonly remoteLineCount: number;
  readonly remoteSolids: readonly SolidBatch[];
  readonly perspectiveGrid: GPUBuffer;
  readonly perspectiveGridCount: number;
  readonly selectionGuideLines: GPUBuffer;
  readonly selectionGuideLineCount: number;
  readonly scaleBounds: Bounds | null;
}
