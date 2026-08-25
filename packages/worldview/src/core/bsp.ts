import { BinaryView } from './binary.js';
import { parseGoldSrcAudioEntities } from './audio.js';
import { validateBspCollision, type ParsedBspCollision } from './collision.js';
import { entityValue, parseEntities, wadReferences } from './entities.js';
import { invalidData, invariant, WorldviewError } from './errors.js';
import { LightmapPacker, LIGHTMAP_PAGE_SIZE } from './lightmaps.js';
import { classifyMaterial } from './materials.js';
import { readMipTextureHeader } from './miptex.js';
import { validateBspTrace, type ParsedBspTrace } from './trace.js';
import type { ParsedBspVisibility } from './visibility.js';
import type {
  Bounds,
  DrawBatch,
  GoldSrcRenderMode,
  MaterialKind,
  ParsedFace,
  ParsedLightmap,
  ParsedMaterial,
  ParsedMipTexture,
  ParsedModel,
  ParsedWorld,
  Vec3Tuple,
} from './types.js';

const enum LumpType {
  Entities = 0,
  Planes = 1,
  Textures = 2,
  Vertices = 3,
  Visibility = 4,
  Nodes = 5,
  Texinfo = 6,
  Faces = 7,
  Lighting = 8,
  Clipnodes = 9,
  Leaves = 10,
  Marksurfaces = 11,
  Edges = 12,
  Surfedges = 13,
  Models = 14,
}

const LUMP_COUNT = 15;
const HEADER_SIZE = 4 + LUMP_COUNT * 8;

export interface ParseBspOptions {
  readonly lightmapPageSize?: number;
}

interface TextureMapping {
  readonly s: readonly [number, number, number, number];
  readonly t: readonly [number, number, number, number];
  readonly materialIndex: number;
}

interface RawModel {
  readonly bounds: Bounds;
  readonly headnodes: readonly number[];
  readonly visLeafCount: number;
  readonly firstFace: number;
  readonly faceCount: number;
}

interface RawFace {
  readonly sourceIndex: number;
  readonly modelIndex: number;
  readonly materialIndex: number;
  readonly kind: MaterialKind;
  readonly firstEdge: number;
  readonly edgeCount: number;
  readonly mapping: TextureMapping;
  readonly lightmap: ParsedLightmap;
  readonly minimumS: number;
  readonly minimumT: number;
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

function parseTrace(
  planes: Float32Array,
  nodeLump: BinaryView,
  leafLump: BinaryView,
  headNode: number,
): ParsedBspTrace | null {
  if (nodeLump.byteLength === 0 && leafLump.byteLength === 0) return null;
  invariant(
    planes.byteLength > 0 && nodeLump.byteLength > 0 && leafLump.byteLength > 0,
    'BSP trace lumps must either all be present or all be empty',
  );
  const nodeCount = recordCount(nodeLump, 24, 'node');
  const leafCount = recordCount(leafLump, 28, 'leaf');
  const nodes = new Int32Array(nodeCount * 3);
  for (let index = 0; index < nodeCount; index += 1) {
    const sourceOffset = index * 24;
    const targetOffset = index * 3;
    nodes[targetOffset] = nodeLump.u32(sourceOffset);
    nodes[targetOffset + 1] = nodeLump.i16(sourceOffset + 4);
    nodes[targetOffset + 2] = nodeLump.i16(sourceOffset + 6);
  }
  const leafContents = new Int32Array(leafCount);
  for (let index = 0; index < leafCount; index += 1) leafContents[index] = leafLump.i32(index * 28);
  const trace = { planes, nodes, leafContents, headNode };
  validateBspTrace(trace);
  return trace;
}

function validateVisibilityRow(data: Uint8Array, offset: number, byteCount: number): void {
  let source = offset;
  let destination = 0;
  while (destination < byteCount) {
    invariant(source < data.length, 'BSP visibility row is truncated');
    const value = data[source++]!;
    if (value !== 0) {
      destination += 1;
      continue;
    }
    invariant(source < data.length, 'BSP visibility run is truncated');
    const length = data[source++]!;
    invariant(length > 0, 'BSP visibility contains an empty zero run');
    invariant(destination + length <= byteCount, 'BSP visibility run exceeds its row');
    destination += length;
  }
}

function parseVisibility(
  leafLump: BinaryView,
  markSurfaceLump: BinaryView,
  visibilityLump: BinaryView,
  visLeafCount: number,
  faceCount: number,
): ParsedBspVisibility | null {
  invariant(visLeafCount >= 0, 'world model has a negative visibility leaf count');
  if (visLeafCount === 0 || visibilityLump.byteLength === 0) return null;
  const leafCount = recordCount(leafLump, 28, 'leaf');
  invariant(visLeafCount < leafCount, 'world visibility references missing leaves');
  const markSurfaceCount = recordCount(markSurfaceLump, 2, 'marksurface');
  const leafVisOffsets = new Int32Array(leafCount);
  const leafMarkSurfaceStarts = new Uint32Array(leafCount);
  const leafMarkSurfaceCounts = new Uint32Array(leafCount);
  for (let leafIndex = 0; leafIndex < leafCount; leafIndex += 1) {
    const offset = leafIndex * 28;
    const visOffset = leafLump.i32(offset + 4);
    const first = leafLump.u16(offset + 20);
    const count = leafLump.u16(offset + 22);
    invariant(
      first + count <= markSurfaceCount,
      `BSP leaf ${leafIndex} has an invalid marksurface range`,
    );
    invariant(visOffset >= -1, `BSP leaf ${leafIndex} has an invalid visibility offset`);
    if (visOffset >= 0) {
      invariant(
        visOffset < visibilityLump.byteLength,
        `BSP leaf ${leafIndex} has an invalid visibility offset`,
      );
    }
    leafVisOffsets[leafIndex] = visOffset;
    leafMarkSurfaceStarts[leafIndex] = first;
    leafMarkSurfaceCounts[leafIndex] = count;
  }

  const markSurfaces = new Uint32Array(markSurfaceCount);
  for (let index = 0; index < markSurfaceCount; index += 1) {
    const faceIndex = markSurfaceLump.u16(index * 2);
    invariant(faceIndex < faceCount, `marksurface ${index} references missing face ${faceIndex}`);
    markSurfaces[index] = faceIndex;
  }
  const data = visibilityLump.uint8Array(0, visibilityLump.byteLength).slice();
  const rowByteCount = Math.ceil(visLeafCount / 8);
  for (let leafIndex = 1; leafIndex <= visLeafCount; leafIndex += 1) {
    const offset = leafVisOffsets[leafIndex]!;
    if (offset >= 0) validateVisibilityRow(data, offset, rowByteCount);
  }
  return {
    leafCount: visLeafCount,
    worldFaceCount: faceCount,
    leafVisOffsets,
    leafMarkSurfaceStarts,
    leafMarkSurfaceCounts,
    markSurfaces,
    data,
  };
}

function parsePlanes(lump: BinaryView): Float32Array {
  const planeCount = recordCount(lump, 20, 'plane');
  const planes = new Float32Array(planeCount * 4);
  for (let index = 0; index < planeCount; index += 1) {
    const sourceOffset = index * 20;
    const targetOffset = index * 4;
    for (let component = 0; component < 4; component += 1) {
      const value = lump.f32(sourceOffset + component * 4);
      invariant(Number.isFinite(value), `plane ${index} contains a non-finite value`);
      planes[targetOffset + component] = value;
    }
  }
  return planes;
}

function parseCollision(
  planes: Float32Array,
  lump: BinaryView,
  headNodes: readonly number[],
): ParsedBspCollision | null {
  if (lump.byteLength === 0) return null;
  invariant(planes.length > 0, 'BSP clipnodes require planes');
  const nodeCount = recordCount(lump, 8, 'clipnode');
  const clipnodes = new Int32Array(nodeCount * 3);
  for (let index = 0; index < nodeCount; index += 1) {
    const sourceOffset = index * 8;
    const targetOffset = index * 3;
    clipnodes[targetOffset] = lump.i32(sourceOffset);
    clipnodes[targetOffset + 1] = lump.i16(sourceOffset + 4);
    clipnodes[targetOffset + 2] = lump.i16(sourceOffset + 6);
  }
  const collision = { planes, clipnodes };
  validateBspCollision(collision, headNodes);
  return collision;
}

function dotMapping(
  position: Vec3Tuple,
  mapping: readonly [number, number, number, number],
): number {
  return Math.fround(
    position[0] * mapping[0] + position[1] * mapping[1] + position[2] * mapping[2] + mapping[3],
  );
}

function texturePayload(
  textures: BinaryView,
  offset: number,
  version: 29 | 30,
): ParsedMipTexture | undefined {
  textures.require(offset, 40, 'embedded MIPTEX header');
  const remainder = textures.slice(offset);
  const header = readMipTextureHeader(remainder.bytes);
  if (header.offsets[0] === 0) return undefined;
  let end = 40;
  for (let level = 0; level < 4; level += 1) {
    const width = Math.max(1, header.width >> level);
    const height = Math.max(1, header.height >> level);
    const mipOffset = header.offsets[level] ?? 0;
    invariant(mipOffset >= 40, `MIPTEX ${header.name} mip ${level} overlaps its header`);
    const mipEnd = mipOffset + checkedProduct(width, height, `MIPTEX ${header.name} mip ${level}`);
    remainder.require(mipOffset, width * height, `MIPTEX ${header.name} mip ${level}`);
    end = Math.max(end, mipEnd);
  }
  if (version === 30) {
    remainder.require(end, 2 + 256 * 3, `MIPTEX ${header.name} palette`);
    invariant(remainder.u16(end) === 256, `MIPTEX ${header.name} has an invalid palette size`);
    end += 2 + 256 * 3;
  }
  return { name: header.name, data: remainder.uint8Array(0, end).slice() };
}

const movingBrushClasses = new Set([
  'func_button',
  'func_door',
  'func_door_rotating',
  'func_pendulum',
  'func_plat',
  'func_pushable',
  'func_rotating',
  'func_trackautochange',
  'func_trackchange',
  'func_tracktrain',
  'func_train',
  'func_traincontrols',
  'func_water',
  'momentary_door',
  'momentary_rot_button',
]);

const staticSolidBrushClasses = new Set(['func_conveyor', 'func_detail', 'func_wall']);

function byteValue(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(255, Math.max(0, parsed)) : fallback;
}

function parseRenderColor(value: string | undefined): Vec3Tuple {
  const channels = value?.trim().split(/\s+/).map(Number);
  if (!channels || channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
    return [255, 255, 255];
  }
  return [
    Math.min(255, Math.max(0, channels[0] ?? 255)),
    Math.min(255, Math.max(0, channels[1] ?? 255)),
    Math.min(255, Math.max(0, channels[2] ?? 255)),
  ];
}

function textureScrollSpeed(entity: ReturnType<typeof parseEntities>[number], classname: string) {
  if (classname === 'func_conveyor') {
    const speed = Number(entityValue(entity, 'speed'));
    return Number.isFinite(speed) && speed !== 0 ? speed : 100;
  }

  const channels = entityValue(entity, 'rendercolor')?.trim().split(/\s+/).map(Number);
  if (!channels || channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
    return 0;
  }
  const magnitude = ((channels[1] ?? 0) * 256 + (channels[2] ?? 0)) / 16;
  return (channels[0] ?? 0) === 0 ? magnitude : -magnitude;
}

function modelRenderState(modelIndex: number, entities: ReturnType<typeof parseEntities>) {
  if (modelIndex === 0) {
    return {
      visible: true,
      entityIndex: null,
      classname: 'worldspawn',
      collidable: true,
      renderMode: 0 as GoldSrcRenderMode,
      renderAmount: 255,
      renderColor: [255, 255, 255] as Vec3Tuple,
      textureScrollSpeed: 0,
    };
  }

  const entityIndex = entities.findIndex(
    (entity) => entityValue(entity, 'model') === `*${modelIndex}`,
  );
  const entity = entities[entityIndex];
  if (!entity) {
    return {
      visible: false,
      entityIndex: null,
      classname: '',
      collidable: false,
      renderMode: 0 as GoldSrcRenderMode,
      renderAmount: 255,
      renderColor: [255, 255, 255] as Vec3Tuple,
      textureScrollSpeed: 0,
    };
  }

  const classname = entityValue(entity, 'classname')?.toLowerCase() ?? '';
  const rawMode = Number.parseInt(entityValue(entity, 'rendermode') ?? '0', 10);
  const renderMode = (rawMode >= 0 && rawMode <= 5 ? rawMode : 0) as GoldSrcRenderMode;
  const renderAmount = byteValue(
    entityValue(entity, 'renderamt'),
    renderMode === 0 || renderMode === 4 ? 255 : 0,
  );
  const visible =
    !classname.startsWith('trigger_') &&
    !movingBrushClasses.has(classname) &&
    !(
      (renderMode === 1 || renderMode === 2 || renderMode === 3 || renderMode === 5) &&
      renderAmount === 0
    );

  return {
    visible,
    entityIndex,
    classname,
    collidable: staticSolidBrushClasses.has(classname),
    renderMode,
    renderAmount,
    renderColor: parseRenderColor(entityValue(entity, 'rendercolor')),
    textureScrollSpeed: textureScrollSpeed(entity, classname),
  };
}

export function parseBsp(
  input: ArrayBuffer | ArrayBufferView,
  options: ParseBspOptions = {},
): ParsedWorld {
  const source = new BinaryView(input);
  invariant(source.byteLength >= HEADER_SIZE, 'BSP header is truncated');
  const version = source.u32(0);
  if (version !== 29 && version !== 30) {
    throw new WorldviewError(
      'unsupported-bsp',
      `Worldview supports BSP versions 29 and 30, received ${version}`,
    );
  }
  const format = version === 29 ? 'quake-bsp29' : 'goldsrc-bsp30';
  const bytesPerTexel = version === 29 ? 1 : 3;

  const lump = (type: LumpType): BinaryView => {
    const header = 4 + type * 8;
    const offset = source.u32(header);
    const length = source.u32(header + 4);
    source.require(offset, length, `BSP lump ${type}`);
    return source.slice(offset, length);
  };

  const entities = parseEntities(
    lump(LumpType.Entities).string(0, lump(LumpType.Entities).byteLength),
  );
  const audioEntities =
    version === 30
      ? parseGoldSrcAudioEntities(entities)
      : { ambientSounds: [], envSounds: [], musicTracks: [] };
  const worldspawn = entities.find(
    (entity) => entityValue(entity, 'classname')?.toLowerCase() === 'worldspawn',
  );
  const skyName = entityValue(worldspawn ?? {}, 'skyname')?.trim() || null;

  const textures = lump(LumpType.Textures);
  invariant(textures.byteLength >= 4, 'texture lump is truncated');
  const textureCount = textures.u32(0);
  invariant(textureCount <= 1_000_000, 'texture lump has an unreasonable record count');
  textures.require(4, textureCount * 4, 'texture offset table');
  const materials: ParsedMaterial[] = [];
  for (let index = 0; index < textureCount; index += 1) {
    const offset = textures.i32(4 + index * 4);
    if (offset < 0) {
      const name = `__invalid_${index}__`;
      materials.push({ name, kind: 'tool' });
      continue;
    }
    textures.require(offset, 40, `MIPTEX ${index}`);
    const name = textures.string(offset, 16, true);
    const kind = classifyMaterial(name, format);
    const embeddedTexture = texturePayload(textures, offset, version);
    materials.push(embeddedTexture ? { name, kind, embeddedTexture } : { name, kind });
  }

  const texinfoLump = lump(LumpType.Texinfo);
  const texinfoCount = recordCount(texinfoLump, 40, 'texinfo');
  const mappings: TextureMapping[] = [];
  for (let index = 0; index < texinfoCount; index += 1) {
    const offset = index * 40;
    const materialIndex = texinfoLump.u32(offset + 32);
    invariant(
      materialIndex < materials.length,
      `texinfo ${index} references texture ${materialIndex}`,
    );
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
      materialIndex,
    });
  }

  const vertexLump = lump(LumpType.Vertices);
  const vertexCount = recordCount(vertexLump, 12, 'vertex');
  const positions: Vec3Tuple[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * 12;
    positions.push([
      vertexLump.f32(offset),
      vertexLump.f32(offset + 4),
      vertexLump.f32(offset + 8),
    ]);
  }

  const edgeLump = lump(LumpType.Edges);
  const edgeCount = recordCount(edgeLump, 4, 'edge');
  const edges: Array<readonly [number, number]> = [];
  for (let index = 0; index < edgeCount; index += 1) {
    const offset = index * 4;
    const first = edgeLump.u16(offset);
    const second = edgeLump.u16(offset + 2);
    invariant(
      first < positions.length && second < positions.length,
      `edge ${index} references an invalid vertex`,
    );
    edges.push([first, second]);
  }

  const surfedgeLump = lump(LumpType.Surfedges);
  const surfedgeCount = recordCount(surfedgeLump, 4, 'surfedge');
  const surfaceVertexIndices = new Uint32Array(surfedgeCount);
  for (let index = 0; index < surfedgeCount; index += 1) {
    const value = surfedgeLump.i32(index * 4);
    invariant(value !== -2_147_483_648, `surfedge ${index} has an invalid index`);
    const edgeIndex = Math.abs(value);
    invariant(edgeIndex < edges.length, `surfedge ${index} references edge ${edgeIndex}`);
    const edge = edges[edgeIndex];
    invariant(edge !== undefined, `surfedge ${index} references a missing edge`);
    surfaceVertexIndices[index] = value >= 0 ? edge[0] : edge[1];
  }

  const modelLump = lump(LumpType.Models);
  const modelCount = recordCount(modelLump, 64, 'model');
  invariant(modelCount > 0, 'BSP has no world model');
  const rawModels: RawModel[] = [];
  for (let index = 0; index < modelCount; index += 1) {
    const offset = index * 64;
    rawModels.push({
      bounds: {
        min: [modelLump.f32(offset), modelLump.f32(offset + 4), modelLump.f32(offset + 8)],
        max: [modelLump.f32(offset + 12), modelLump.f32(offset + 16), modelLump.f32(offset + 20)],
      },
      headnodes: [
        modelLump.i32(offset + 36),
        modelLump.i32(offset + 40),
        modelLump.i32(offset + 44),
        modelLump.i32(offset + 48),
      ],
      visLeafCount: modelLump.i32(offset + 52),
      firstFace: modelLump.u32(offset + 56),
      faceCount: modelLump.u32(offset + 60),
    });
  }
  const planes = parsePlanes(lump(LumpType.Planes));
  const trace = parseTrace(
    planes,
    lump(LumpType.Nodes),
    lump(LumpType.Leaves),
    rawModels[0]!.headnodes[0]!,
  );
  const collision = parseCollision(
    planes,
    lump(LumpType.Clipnodes),
    rawModels.flatMap((model) => model.headnodes.slice(1, 2)),
  );

  const faceLump = lump(LumpType.Faces);
  const faceCount = recordCount(faceLump, 20, 'face');
  const visibility = parseVisibility(
    lump(LumpType.Leaves),
    lump(LumpType.Marksurfaces),
    lump(LumpType.Visibility),
    rawModels[0]!.visLeafCount,
    faceCount,
  );
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
  const rawFaces: RawFace[] = [];
  const lightmaps: ParsedLightmap[] = [];

  for (let sourceIndex = 0; sourceIndex < faceCount; sourceIndex += 1) {
    const offset = sourceIndex * 20;
    const firstEdge = faceLump.u32(offset + 4);
    const edgeCountForFace = faceLump.u16(offset + 8);
    const mappingIndex = faceLump.u16(offset + 10);
    invariant(edgeCountForFace >= 3, `face ${sourceIndex} has fewer than three edges`);
    invariant(
      firstEdge + edgeCountForFace <= surfaceVertexIndices.length,
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
    for (let edge = 0; edge < edgeCountForFace; edge += 1) {
      const positionIndex = surfaceVertexIndices[firstEdge + edge];
      const position = positions[positionIndex ?? positions.length];
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
    if (lightOffset !== -1 && styles.length > 0) {
      invariant(lightOffset >= 0, `face ${sourceIndex} has an invalid light offset`);
      const sampleLength = checkedProduct(
        checkedProduct(width, height, `face ${sourceIndex} lightmap`),
        styles.length * bytesPerTexel,
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
      edgeCount: edgeCountForFace,
      mapping,
      lightmap,
      minimumS,
      minimumT,
    });
  }

  const renderOrder = rawFaces.toSorted(
    (left, right) =>
      left.modelIndex - right.modelIndex ||
      left.kind.localeCompare(right.kind) ||
      left.materialIndex - right.materialIndex ||
      left.lightmap.pageIndex - right.lightmap.pageIndex ||
      left.sourceIndex - right.sourceIndex,
  );
  const vertexValues: number[] = [];
  const indexValues: number[] = [];
  const parsedFaces: ParsedFace[] = [];
  const batches: DrawBatch[] = [];

  for (const face of renderOrder) {
    const baseVertex = vertexValues.length / 7;
    const firstIndex = indexValues.length;
    for (let edge = 0; edge < face.edgeCount; edge += 1) {
      const positionIndex = surfaceVertexIndices[face.firstEdge + edge];
      const position = positions[positionIndex ?? positions.length];
      invariant(position !== undefined, `face ${face.sourceIndex} references a missing vertex`);
      const s = dotMapping(position, face.mapping.s);
      const t = dotMapping(position, face.mapping.t);
      const lightmapS =
        face.lightmap.pageIndex < 0
          ? 0.5
          : face.lightmap.pageX + s / 16 - Math.floor(face.minimumS / 16) + 0.5;
      const lightmapT =
        face.lightmap.pageIndex < 0
          ? 0.5
          : face.lightmap.pageY + t / 16 - Math.floor(face.minimumT / 16) + 0.5;
      vertexValues.push(position[0], position[1], position[2], s, t, lightmapS, lightmapT);
    }
    for (let edge = 2; edge < face.edgeCount; edge += 1) {
      indexValues.push(baseVertex, baseVertex + edge - 1, baseVertex + edge);
    }
    const indexCount = (face.edgeCount - 2) * 3;
    parsedFaces.push({
      sourceIndex: face.sourceIndex,
      modelIndex: face.modelIndex,
      materialIndex: face.materialIndex,
      kind: face.kind,
      firstIndex,
      indexCount,
      lightmap: face.lightmap,
    });

    if (face.kind === 'tool') continue;
    const previous = batches.at(-1);
    if (
      previous &&
      previous.modelIndex === face.modelIndex &&
      previous.materialIndex === face.materialIndex &&
      previous.kind === face.kind &&
      previous.lightmapPage === face.lightmap.pageIndex &&
      previous.firstIndex + previous.indexCount === firstIndex
    ) {
      batches[batches.length - 1] = {
        ...previous,
        indexCount: previous.indexCount + indexCount,
        faceIndices: [...previous.faceIndices, face.sourceIndex],
      };
    } else {
      batches.push({
        modelIndex: face.modelIndex,
        materialIndex: face.materialIndex,
        kind: face.kind,
        lightmapPage: face.lightmap.pageIndex,
        firstIndex,
        indexCount,
        faceIndices: [face.sourceIndex],
      });
    }
  }

  const sourceFaces = parsedFaces.toSorted((left, right) => left.sourceIndex - right.sourceIndex);
  const models: ParsedModel[] = rawModels.map((model, modelIndex) => {
    const state = modelRenderState(modelIndex, entities);
    return {
      bounds: model.bounds,
      headnodes: model.headnodes,
      faceIndices: Array.from({ length: model.faceCount }, (_, index) => model.firstFace + index),
      visible: state.visible,
      entityIndex: state.entityIndex,
      classname: state.classname,
      collidable: state.collidable,
      renderMode: state.renderMode,
      renderAmount: state.renderAmount,
      renderColor: state.renderColor,
      textureScrollSpeed: state.textureScrollSpeed,
    };
  });

  const worldModel = models[0];
  if (!worldModel) invalidData('BSP has no world model');
  return {
    format,
    version,
    bounds: worldModel.bounds,
    entities,
    skyName,
    wadReferences: wadReferences(entities),
    ambientSounds: audioEntities.ambientSounds,
    envSounds: audioEntities.envSounds,
    musicTracks: audioEntities.musicTracks,
    trace,
    visibility,
    collision,
    vertices: new Float32Array(vertexValues),
    indices: new Uint32Array(indexValues),
    materials,
    faces: sourceFaces,
    batches,
    models,
    lightmapPages: packer.finish(lightmaps),
    lightmapBytesPerTexel: bytesPerTexel,
    hasAnimatedLightmaps: lightmaps.some((lightmap) =>
      lightmap.styles.some((style) => style !== 0),
    ),
  };
}
