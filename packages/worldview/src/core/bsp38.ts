import { BinaryView } from './binary.js';
import {
  buildBspRenderGeometry,
  type BspRenderFace,
  type BspTextureMapping,
} from './bsp-render-geometry.js';
import { entityValue, parseEntities } from './entities.js';
import { invalidData, invariant, WorldviewError } from './errors.js';
import { LightmapPacker, LIGHTMAP_PAGE_SIZE } from './lightmaps.js';
import { classifyMaterial } from './materials.js';
import type {
  Bounds,
  ParsedLightmap,
  ParsedMaterial,
  ParsedModel,
  ParsedWorld,
  Vec3Tuple,
} from './types.js';

const IBSP_MAGIC = 0x50534249;
const BSP38_VERSION = 38;
const LUMP_COUNT = 19;
const HEADER_SIZE = 8 + LUMP_COUNT * 8;

const enum LumpType {
  Entities = 0,
  Vertices = 2,
  Texinfo = 5,
  Faces = 6,
  Lighting = 7,
  Edges = 11,
  Surfedges = 12,
  Models = 13,
}

export interface ParseBsp38Options {
  readonly lightmapPageSize?: number;
}

interface RawModel {
  readonly bounds: Bounds;
  readonly headnode: number;
  readonly firstFace: number;
  readonly faceCount: number;
}

interface MutableAllocation {
  width: number;
  height: number;
  pageIndex: number;
  pageX: number;
  pageY: number;
}

function recordCount(lump: BinaryView, size: number, label: string): number {
  invariant(lump.byteLength % size === 0, `${label} lump has a partial record`);
  return lump.byteLength / size;
}

function checkedProduct(left: number, right: number, label: string): number {
  const product = left * right;
  invariant(Number.isSafeInteger(product) && product >= 0, `${label} allocation overflows`);
  return product;
}

function dotMapping(position: Vec3Tuple, mapping: readonly number[]): number {
  return (
    position[0] * (mapping[0] ?? 0) +
    position[1] * (mapping[1] ?? 0) +
    position[2] * (mapping[2] ?? 0) +
    (mapping[3] ?? 0)
  );
}

export function parseBsp38(
  input: ArrayBuffer | ArrayBufferView,
  options: ParseBsp38Options = {},
): ParsedWorld {
  const source = new BinaryView(input);
  invariant(source.byteLength >= HEADER_SIZE, 'BSP38 header is truncated');
  invariant(source.u32(0) === IBSP_MAGIC, 'BSP38 has an invalid IBSP identifier');
  const version = source.u32(4);
  if (version !== BSP38_VERSION) {
    throw new WorldviewError(
      'unsupported-bsp',
      `Worldview supports IBSP version 38, received ${version}`,
    );
  }
  const lump = (type: LumpType): BinaryView => {
    const header = 8 + type * 8;
    const offset = source.u32(header);
    const length = source.u32(header + 4);
    source.require(offset, length, `BSP38 lump ${type}`);
    return source.slice(offset, length);
  };

  const entityLump = lump(LumpType.Entities);
  const entities = parseEntities(entityLump.string(0, entityLump.byteLength));
  const worldspawn = entities.find(
    (entity) => entityValue(entity, 'classname')?.toLowerCase() === 'worldspawn',
  );
  const skyName = entityValue(worldspawn ?? {}, 'sky')?.trim() || null;

  const vertexLump = lump(LumpType.Vertices);
  const positions: Vec3Tuple[] = [];
  for (let index = 0; index < recordCount(vertexLump, 12, 'vertex'); index += 1) {
    const offset = index * 12;
    positions.push([
      vertexLump.f32(offset),
      vertexLump.f32(offset + 4),
      vertexLump.f32(offset + 8),
    ]);
  }

  const edgeLump = lump(LumpType.Edges);
  const edges: Array<readonly [number, number]> = [];
  for (let index = 0; index < recordCount(edgeLump, 4, 'edge'); index += 1) {
    const offset = index * 4;
    const edge = [edgeLump.u16(offset), edgeLump.u16(offset + 2)] as const;
    invariant(
      edge[0] < positions.length && edge[1] < positions.length,
      `edge ${index} references an invalid vertex`,
    );
    edges.push(edge);
  }

  const surfedgeLump = lump(LumpType.Surfedges);
  const surfedgeCount = recordCount(surfedgeLump, 4, 'surfedge');
  const surfaceVertexIndices = new Uint32Array(surfedgeCount);
  for (let index = 0; index < surfedgeCount; index += 1) {
    const value = surfedgeLump.i32(index * 4);
    invariant(value !== -2_147_483_648, `surfedge ${index} has an invalid index`);
    const edge = edges[Math.abs(value)];
    invariant(edge !== undefined, `surfedge ${index} references a missing edge`);
    surfaceVertexIndices[index] = value >= 0 ? edge[0] : edge[1];
  }

  const texinfoLump = lump(LumpType.Texinfo);
  const mappings: BspTextureMapping[] = [];
  const materials: ParsedMaterial[] = [];
  for (let index = 0; index < recordCount(texinfoLump, 76, 'texinfo'); index += 1) {
    const offset = index * 76;
    const flags = texinfoLump.u32(offset + 32);
    const name = texinfoLump.string(offset + 40, 32, true);
    materials.push({ name, kind: classifyMaterial(name, 'quake2-bsp38', flags) });
    mappings.push({
      s: [
        texinfoLump.f32(offset),
        texinfoLump.f32(offset + 4),
        texinfoLump.f32(offset + 8),
        texinfoLump.f32(offset + 12),
      ],
      t: [
        texinfoLump.f32(offset + 16),
        texinfoLump.f32(offset + 20),
        texinfoLump.f32(offset + 24),
        texinfoLump.f32(offset + 28),
      ],
      materialIndex: index,
    });
  }

  const modelLump = lump(LumpType.Models);
  const rawModels: RawModel[] = [];
  for (let index = 0; index < recordCount(modelLump, 48, 'model'); index += 1) {
    const offset = index * 48;
    const firstFace = modelLump.i32(offset + 40);
    const faceCount = modelLump.i32(offset + 44);
    invariant(firstFace >= 0 && faceCount >= 0, `model ${index} has an invalid face range`);
    rawModels.push({
      bounds: {
        min: [modelLump.f32(offset), modelLump.f32(offset + 4), modelLump.f32(offset + 8)],
        max: [modelLump.f32(offset + 12), modelLump.f32(offset + 16), modelLump.f32(offset + 20)],
      },
      headnode: modelLump.i32(offset + 36),
      firstFace,
      faceCount,
    });
  }
  invariant(rawModels.length > 0, 'BSP38 has no world model');

  const faceLump = lump(LumpType.Faces);
  const faceCount = recordCount(faceLump, 20, 'face');
  const faceToModel = new Int32Array(faceCount).fill(-1);
  rawModels.forEach((model, modelIndex) => {
    invariant(
      model.firstFace + model.faceCount <= faceCount,
      `model ${modelIndex} face range is invalid`,
    );
    for (let face = model.firstFace; face < model.firstFace + model.faceCount; face += 1) {
      invariant(faceToModel[face] === -1, `face ${face} belongs to multiple models`);
      faceToModel[face] = modelIndex;
    }
  });

  const lighting = lump(LumpType.Lighting);
  const pageSize = options.lightmapPageSize ?? LIGHTMAP_PAGE_SIZE;
  invariant(
    Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 65_535,
    'invalid lightmap page size',
  );
  const packer = new LightmapPacker(pageSize, pageSize);
  const lightmaps: ParsedLightmap[] = [];
  const rawFaces: BspRenderFace[] = [];
  for (let sourceIndex = 0; sourceIndex < faceCount; sourceIndex += 1) {
    const offset = sourceIndex * 20;
    const firstEdge = faceLump.i32(offset + 4);
    const edgeCount = faceLump.i16(offset + 8);
    const mappingIndex = faceLump.i16(offset + 10);
    invariant(firstEdge >= 0 && edgeCount >= 3, `face ${sourceIndex} has invalid edges`);
    invariant(
      firstEdge + edgeCount <= surfaceVertexIndices.length,
      `face ${sourceIndex} surfedge range is invalid`,
    );
    const mapping = mappings[mappingIndex];
    invariant(mapping !== undefined, `face ${sourceIndex} references texinfo ${mappingIndex}`);
    const material = materials[mapping.materialIndex];
    invariant(material !== undefined, `face ${sourceIndex} references a missing material`);
    const modelIndex = faceToModel[sourceIndex] ?? -1;
    invariant(modelIndex >= 0, `face ${sourceIndex} does not belong to a model`);

    let minimumS = Number.POSITIVE_INFINITY;
    let minimumT = Number.POSITIVE_INFINITY;
    let maximumS = Number.NEGATIVE_INFINITY;
    let maximumT = Number.NEGATIVE_INFINITY;
    for (let edge = 0; edge < edgeCount; edge += 1) {
      const position = positions[surfaceVertexIndices[firstEdge + edge] ?? positions.length];
      invariant(position !== undefined, `face ${sourceIndex} references a missing vertex`);
      const s = dotMapping(position, mapping.s);
      const t = dotMapping(position, mapping.t);
      minimumS = Math.min(minimumS, s);
      minimumT = Math.min(minimumT, t);
      maximumS = Math.max(maximumS, s);
      maximumT = Math.max(maximumT, t);
    }
    const width = Math.ceil(maximumS / 16) - Math.floor(minimumS / 16) + 1;
    const height = Math.ceil(maximumT / 16) - Math.floor(minimumT / 16) + 1;
    invariant(width > 0 && height > 0, `face ${sourceIndex} has invalid lightmap dimensions`);
    const styles: number[] = [];
    for (let style = 0; style < 4; style += 1) {
      const value = faceLump.u8(offset + 12 + style);
      if (value === 255) break;
      invariant(value < 64, `face ${sourceIndex} references lightstyle ${value}`);
      styles.push(value);
    }
    const lightOffset = faceLump.i32(offset + 16);
    let samples: Uint8Array | null = null;
    const allocation: MutableAllocation = { width, height, pageIndex: -1, pageX: 0, pageY: 0 };
    if (lighting.byteLength > 0 && lightOffset !== -1 && styles.length > 0) {
      invariant(lightOffset >= 0, `face ${sourceIndex} has an invalid light offset`);
      const sampleLength = checkedProduct(
        checkedProduct(width, height, `face ${sourceIndex} lightmap`),
        styles.length * 3,
        `face ${sourceIndex} styled lightmap`,
      );
      lighting.require(lightOffset, sampleLength, `face ${sourceIndex} light samples`);
      samples = lighting.uint8Array(lightOffset, sampleLength).slice();
      packer.allocate(allocation);
    }
    const lightmap: ParsedLightmap = {
      faceIndex: sourceIndex,
      width,
      height,
      styles,
      samples,
      pageIndex: allocation.pageIndex,
      pageX: allocation.pageX,
      pageY: allocation.pageY,
    };
    lightmaps.push(lightmap);
    rawFaces.push({
      sourceIndex,
      modelIndex,
      materialIndex: mapping.materialIndex,
      kind: material.kind,
      firstEdge,
      edgeCount,
      mapping,
      lightmap,
      minimumS,
      minimumT,
    });
  }

  const geometry = buildBspRenderGeometry(positions, surfaceVertexIndices, materials, rawFaces);
  const models: ParsedModel[] = rawModels.map((model, modelIndex) => {
    const entityIndex = entities.findIndex(({ model: value }) => value === `*${modelIndex}`);
    const entity = entityIndex >= 0 ? entities[entityIndex] : undefined;
    const classname =
      entityValue(entity ?? {}, 'classname')?.toLowerCase() ??
      (modelIndex === 0 ? 'worldspawn' : 'unknown');
    return {
      bounds: model.bounds,
      headnodes: [model.headnode],
      faceIndices: Array.from({ length: model.faceCount }, (_, index) => model.firstFace + index),
      visible: !classname.startsWith('trigger_'),
      entityIndex: entityIndex >= 0 ? entityIndex : null,
      classname,
      collidable: modelIndex === 0,
      renderMode: 0,
      renderAmount: 255,
      renderColor: [255, 255, 255],
      textureScrollSpeed: 0,
    };
  });
  const worldModel = models[0];
  if (!worldModel) invalidData('BSP38 has no world model');
  return {
    format: 'quake2-bsp38',
    version: 38,
    bounds: worldModel.bounds,
    entities,
    skyName,
    wadReferences: [],
    ambientSounds: [],
    envSounds: [],
    musicTracks: [],
    trace: null,
    visibility: null,
    collision: null,
    vertices: geometry.vertices,
    indices: geometry.indices,
    materials,
    faces: geometry.faces,
    batches: geometry.batches,
    models,
    lightmapPages: packer.finish(lightmaps),
    lightmapBytesPerTexel: 3,
    hasAnimatedLightmaps: lightmaps.some((lightmap) =>
      lightmap.styles.some((style) => style !== 0),
    ),
  };
}
