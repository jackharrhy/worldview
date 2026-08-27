import type { Bounds, MapBrush, Vec3 } from '../core/index.js';

export interface SolidBatch {
  readonly cacheKey: string;
  readonly signature: string;
  readonly materialName: string;
  readonly buffer: GPUBuffer;
  readonly count: number;
  readonly bounds: Bounds;
}

interface PendingSolidBatch {
  readonly cacheKey: string;
  readonly materialName: string;
  readonly vertices: number[];
  readonly signatures: Set<string>;
  bounds: Bounds;
}

const SPATIAL_BATCH_SIZE = 512;
const floatBits = new DataView(new ArrayBuffer(8));

/** Identifies the actual GPU input, including same-revision transient drag previews. */
export function brushSolidSignature(brush: MapBrush, offset: Vec3): string {
  let hash = 2166136261;
  const mixInteger = (value: number) => {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  };
  const mixString = (value: string) => {
    for (const character of value) mixInteger(character.charCodeAt(0));
  };
  const mixNumber = (value: number) => {
    floatBits.setFloat64(0, value, true);
    mixInteger(floatBits.getUint32(0, true));
    mixInteger(floatBits.getUint32(4, true));
  };
  mixString(brush.id);
  mixInteger(brush.revision);
  for (const component of offset) mixNumber(component);
  for (const face of brush.faces) {
    mixString(face.id);
    mixString(face.material);
    for (const point of face.planePoints) for (const component of point) mixNumber(component);
    for (const component of face.projection.uAxis) mixNumber(component);
    for (const component of face.projection.vAxis) mixNumber(component);
    for (const component of face.projection.offset) mixNumber(component);
    mixNumber(face.projection.rotationDegrees);
    for (const component of face.projection.scale) mixNumber(component);
  }
  return `${brush.id}:${brush.revision}:${(hash >>> 0).toString(16)}`;
}

function translatedBounds(bounds: Bounds, offset: Vec3): Bounds {
  return {
    min: [bounds.min[0] + offset[0], bounds.min[1] + offset[1], bounds.min[2] + offset[2]],
    max: [bounds.max[0] + offset[0], bounds.max[1] + offset[1], bounds.max[2] + offset[2]],
  };
}

function includeBounds(target: Bounds, source: Bounds): Bounds {
  return {
    min: [
      Math.min(target.min[0], source.min[0]),
      Math.min(target.min[1], source.min[1]),
      Math.min(target.min[2], source.min[2]),
    ],
    max: [
      Math.max(target.max[0], source.max[0]),
      Math.max(target.max[1], source.max[1]),
      Math.max(target.max[2], source.max[2]),
    ],
  };
}

function upload(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buffer = device.createBuffer({
    size: Math.max(4, data.byteLength),
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

/** Collects material batches in stable world-space cells so viewports can frustum-cull dense maps. */
export class SolidBatchBuilder {
  private readonly batches = new Map<string, PendingSolidBatch>();

  public constructor(private readonly previous: readonly SolidBatch[] = []) {}

  public vertices(
    materialName: string,
    bounds: Bounds,
    offset: Vec3,
    sourceSignature: string,
  ): number[] {
    const translated = translatedBounds(bounds, offset);
    const center = translated.min.map((minimum, axis) => (minimum + translated.max[axis]!) / 2);
    const cell = center.map((value) => Math.floor(value / SPATIAL_BATCH_SIZE));
    const key = `${materialName.trim().toLowerCase()}\0${cell.join(',')}`;
    const existing = this.batches.get(key);
    if (existing) {
      existing.bounds = includeBounds(existing.bounds, translated);
      existing.signatures.add(sourceSignature);
      return existing.vertices;
    }
    const created: PendingSolidBatch = {
      cacheKey: key,
      materialName,
      vertices: [],
      signatures: new Set([sourceSignature]),
      bounds: translated,
    };
    this.batches.set(key, created);
    return created.vertices;
  }

  public finish(device: GPUDevice): readonly SolidBatch[] {
    const previousByKey = new Map(this.previous.map((batch) => [batch.cacheKey, batch]));
    return [...this.batches.values()].map(
      ({ cacheKey, materialName, vertices, signatures, bounds }) => {
        const signature = [...signatures].join('\0');
        const count = vertices.length / 8;
        const previous = previousByKey.get(cacheKey);
        return {
          cacheKey,
          signature,
          materialName,
          buffer:
            previous?.signature === signature && previous.count === count
              ? previous.buffer
              : upload(device, new Float32Array(vertices)),
          count,
          bounds,
        };
      },
    );
  }
}
