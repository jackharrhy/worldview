import type { SceneBuffers } from './scene-buffers.js';

/** Releases only scene resources that were not structurally retained by the replacement. */
export function releaseReplacedSceneBuffers(previous: SceneBuffers, next: SceneBuffers): void {
  if (previous.lines !== next.lines) previous.lines.destroy();
  if (previous.overlayLines !== next.overlayLines) previous.overlayLines.destroy();
  if (previous.selectionLines !== next.selectionLines) previous.selectionLines.destroy();
  if (previous.perspectiveGrid !== next.perspectiveGrid) previous.perspectiveGrid.destroy();
  if (previous.selectionGuideLines !== next.selectionGuideLines) {
    previous.selectionGuideLines.destroy();
  }
  if (previous.remoteLines !== next.remoteLines) previous.remoteLines.destroy();
  const retainedLines = new Set(next.lineBatches.map(({ buffer }) => buffer));
  for (const batch of previous.lineBatches) {
    if (!retainedLines.has(batch.buffer)) batch.buffer.destroy();
  }
  const retained = new Set(next.solids.map(({ buffer }) => buffer));
  for (const batch of previous.solids) if (!retained.has(batch.buffer)) batch.buffer.destroy();
  const retainedRemote = new Set(next.remoteSolids.map(({ buffer }) => buffer));
  for (const batch of previous.remoteSolids) {
    if (!retainedRemote.has(batch.buffer)) batch.buffer.destroy();
  }
  const retainedSelection = new Set(next.selectionSolids.map(({ buffer }) => buffer));
  for (const batch of previous.selectionSolids) {
    if (!retainedSelection.has(batch.buffer)) batch.buffer.destroy();
  }
}
