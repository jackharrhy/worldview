import type { EntityDefinitionCatalog } from '../core/index.js';
import { buildSelectionOverlayBuffers } from './selection-overlay-buffers.js';
import type { SceneBuffers } from './scene-buffers.js';
import type { EditorRemotePresenceOverlay } from './types.js';

export function buildRemotePresenceBuffer(
  device: GPUDevice,
  presence: readonly EditorRemotePresenceOverlay[],
  entityDefinitions?: EntityDefinitionCatalog,
) {
  return buildSelectionOverlayBuffers(
    device,
    presence.map((participant) => ({
      key: participant.actorId,
      color: participant.color,
      document: participant.document,
      objectIds: [...new Set([...participant.selectedObjectIds, ...participant.previewObjectIds])],
      ...(participant.pointer ? { pointer: participant.pointer } : {}),
    })),
    entityDefinitions,
  );
}

export function replaceRemotePresenceBuffer(
  device: GPUDevice,
  scene: SceneBuffers,
  presence: readonly EditorRemotePresenceOverlay[],
  entityDefinitions?: EntityDefinitionCatalog,
): SceneBuffers {
  const remote = buildRemotePresenceBuffer(device, presence, entityDefinitions);
  scene.remoteLines.destroy();
  for (const batch of scene.remoteSolids) batch.buffer.destroy();
  return {
    ...scene,
    remoteLines: remote.lines,
    remoteLineCount: remote.lineCount,
    remoteSolids: remote.solids,
  };
}
