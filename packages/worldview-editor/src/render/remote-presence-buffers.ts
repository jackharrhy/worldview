import {
  deriveBrush,
  findBrush,
  pointEntitiesInDocument,
  pointEntityBounds,
  type Bounds,
  type BrushId,
  type EntityDefinitionCatalog,
  type Vec3,
} from '../core/index.js';
import type { EditorRemotePresenceOverlay } from './types.js';
import type { SceneBuffers } from './scene-buffers.js';
import { brushSolidSignature, SolidBatchBuilder, type SolidBatch } from './scene-solid-batches.js';

function appendBounds(lines: number[], bounds: Bounds, color: readonly number[]): void {
  const [x0, y0, z0] = bounds.min;
  const [x1, y1, z1] = bounds.max;
  const corners: readonly Vec3[] = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  for (const [start, end] of [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ] as const)
    lines.push(...corners[start]!, ...color, ...corners[end]!, ...color);
}

function vertices(
  presenceEntries: readonly EditorRemotePresenceOverlay[],
  entityDefinitions?: EntityDefinitionCatalog,
): number[] {
  const lines: number[] = [];
  for (const presence of presenceEntries) {
    const ids = new Set([...presence.selectedObjectIds, ...presence.previewObjectIds]);
    for (const id of ids) {
      const brush = findBrush(presence.document, id as BrushId);
      const derived = brush ? deriveBrush(brush) : null;
      if (!derived?.valid) continue;
      for (const edge of derived.edges)
        lines.push(...edge.start, ...presence.color, ...edge.end, ...presence.color);
    }
    for (const entity of pointEntitiesInDocument(presence.document, entityDefinitions)) {
      if (!ids.has(entity.id)) continue;
      const bounds = pointEntityBounds(entity, entityDefinitions);
      if (bounds) appendBounds(lines, bounds, presence.color);
    }
    if (!presence.pointer) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      const start: [number, number, number] = [...presence.pointer];
      const end: [number, number, number] = [...presence.pointer];
      start[axis] = start[axis]! - 6;
      end[axis] = end[axis]! + 6;
      lines.push(...start, ...presence.color, ...end, ...presence.color);
    }
  }
  return lines;
}

export function buildRemotePresenceBuffer(
  device: GPUDevice,
  presence: readonly EditorRemotePresenceOverlay[],
  entityDefinitions?: EntityDefinitionCatalog,
): { readonly buffer: GPUBuffer; readonly count: number; readonly solids: readonly SolidBatch[] } {
  const data = new Float32Array(vertices(presence, entityDefinitions));
  const buffer = device.createBuffer({
    size: Math.max(4, data.byteLength),
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  if (data.byteLength > 0) device.queue.writeBuffer(buffer, 0, data);
  const solidBatches = new SolidBatchBuilder();
  for (const participant of presence) {
    for (const id of participant.previewObjectIds) {
      const brush = findBrush(participant.document, id as BrushId);
      const derived = brush ? deriveBrush(brush) : null;
      if (!brush || !derived?.valid || !derived.bounds) continue;
      const solid = solidBatches.vertices(
        '__worldview_reference__',
        derived.bounds,
        [0, 0, 0],
        `${participant.actorId}:${brushSolidSignature(brush, [0, 0, 0])}`,
      );
      for (const face of derived.faces) {
        for (let index = 1; index < face.vertices.length - 1; index += 1) {
          for (const vertexIndex of [0, index, index + 1])
            solid.push(...face.vertices[vertexIndex]!, ...participant.color, 0, 0);
        }
      }
    }
  }
  return { buffer, count: data.length / 6, solids: solidBatches.finish(device) };
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
    remoteLines: remote.buffer,
    remoteLineCount: remote.count,
    remoteSolids: remote.solids,
  };
}
