const LUMP_COUNT = 15;

interface FixtureOptions {
  readonly version?: 29 | 30;
  readonly textureName?: string;
  readonly entityText?: string;
  readonly firstSurfedge?: number;
  readonly embeddedTexture?: boolean;
  readonly faceCopies?: number;
  readonly brushEntity?: string;
  readonly trace?: boolean;
  readonly visibility?: boolean;
  readonly collision?: boolean;
}

interface Bsp38FixtureOptions {
  readonly surfaceFlags?: number;
  readonly textureName?: string;
  readonly lightOffset?: number;
}

interface WaveFixtureOptions {
  readonly bitsPerSample?: 8 | 16;
  readonly channels?: 1 | 2;
  readonly frames?: readonly number[];
  readonly loopStart?: number;
  readonly loopLength?: number;
  readonly sampleLoop?: readonly [number, number];
}

interface SpriteFixtureOptions {
  readonly textureFormat?: 0 | 1 | 2 | 3;
  readonly orientation?: 0 | 1 | 2 | 3 | 4;
  readonly frameType?: 0 | 1 | 2;
  readonly groupFrames?: number;
  readonly pixels?: readonly number[];
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

export function makePalette(): Uint8Array {
  const palette = new Uint8Array(768);
  for (let index = 0; index < 256; index += 1) {
    palette[index * 3] = index;
    palette[index * 3 + 1] = 255 - index;
    palette[index * 3 + 2] = (index * 7) & 255;
  }
  return palette;
}

function riffChunk(id: string, payload: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(8 + payload.length + (payload.length & 1));
  new TextEncoder().encodeInto(id, chunk.subarray(0, 4));
  new DataView(chunk.buffer).setUint32(4, payload.length, true);
  chunk.set(payload, 8);
  return chunk;
}

export function makeWave(options: WaveFixtureOptions = {}): Uint8Array {
  const bitsPerSample = options.bitsPerSample ?? 8;
  const channels = options.channels ?? 1;
  const frames = options.frames ?? [0, 64, 128, 255];
  const bytesPerSample = bitsPerSample / 8;
  const format = new Uint8Array(16);
  const formatView = new DataView(format.buffer);
  formatView.setUint16(0, 1, true);
  formatView.setUint16(2, channels, true);
  formatView.setUint32(4, 22_050, true);
  formatView.setUint32(8, 22_050 * channels * bytesPerSample, true);
  formatView.setUint16(12, channels * bytesPerSample, true);
  formatView.setUint16(14, bitsPerSample, true);
  const pcm = new Uint8Array(frames.length * channels * bytesPerSample);
  const pcmView = new DataView(pcm.buffer);
  frames.forEach((value, frame) => {
    for (let channel = 0; channel < channels; channel += 1) {
      const offset = (frame * channels + channel) * bytesPerSample;
      if (bitsPerSample === 8) pcm[offset] = value & 255;
      else pcmView.setInt16(offset, value, true);
    }
  });
  const chunks = [riffChunk('fmt ', format)];
  if (options.sampleLoop) {
    const sample = new Uint8Array(60);
    const sampleView = new DataView(sample.buffer);
    sampleView.setUint32(28, 1, true);
    sampleView.setUint32(44, options.sampleLoop[0], true);
    sampleView.setUint32(48, options.sampleLoop[1] - 1, true);
    chunks.push(riffChunk('smpl', sample));
  }
  if (options.loopStart !== undefined) {
    const cue = new Uint8Array(28);
    const cueView = new DataView(cue.buffer);
    cueView.setUint32(0, 1, true);
    cueView.setUint32(4, 1, true);
    new TextEncoder().encodeInto('data', cue.subarray(12, 16));
    cueView.setUint32(24, options.loopStart, true);
    chunks.push(riffChunk('cue ', cue));
    if (options.loopLength !== undefined) {
      const text = new Uint8Array(20);
      new TextEncoder().encodeInto('adtl', text.subarray(0, 4));
      new TextEncoder().encodeInto('ltxt', text.subarray(4, 8));
      const textView = new DataView(text.buffer);
      textView.setUint32(8, 8, true);
      textView.setUint32(12, 1, true);
      textView.setUint32(16, options.loopLength, true);
      chunks.push(riffChunk('LIST', text));
    }
  }
  chunks.push(riffChunk('data', pcm));
  const payloadSize = 4 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(8 + payloadSize);
  const view = new DataView(result.buffer);
  new TextEncoder().encodeInto('RIFF', result.subarray(0, 4));
  view.setUint32(4, payloadSize, true);
  new TextEncoder().encodeInto('WAVE', result.subarray(8, 12));
  let offset = 12;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function makeTga(rle = false): Uint8Array {
  const result = new Uint8Array(18 + (rle ? 4 : 6));
  const view = new DataView(result.buffer);
  result[2] = rle ? 10 : 2;
  view.setUint16(12, 2, true);
  view.setUint16(14, 1, true);
  result[16] = 24;
  result[17] = 0x20;
  if (rle) result.set([0x81, 30, 20, 10], 18);
  else result.set([0, 0, 255, 0, 255, 0], 18);
  return result;
}

export function makeSprite(options: SpriteFixtureOptions = {}): Uint8Array {
  const textureFormat = options.textureFormat ?? 3;
  const frameType = options.frameType ?? 0;
  const groupFrames = frameType === 0 ? 1 : (options.groupFrames ?? 2);
  const palette = makePalette();
  const groupBytes = frameType === 0 ? 0 : 4 + groupFrames * 4;
  const frameBytes = 16 + 4;
  const result = new Uint8Array(
    40 + 2 + palette.length + 4 + groupBytes + groupFrames * frameBytes,
  );
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x5053_4449, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, options.orientation ?? 2, true);
  view.setUint32(12, textureFormat, true);
  view.setFloat32(16, Math.SQRT2, true);
  view.setInt32(20, 2, true);
  view.setInt32(24, 2, true);
  view.setInt32(28, 1, true);
  view.setUint32(32, 0, true);
  view.setUint32(36, 1, true);
  view.setUint16(40, 256, true);
  result.set(palette, 42);
  let offset = 42 + palette.length;
  view.setUint32(offset, frameType, true);
  offset += 4;
  if (frameType !== 0) {
    view.setInt32(offset, groupFrames, true);
    offset += 4;
    for (let index = 0; index < groupFrames; index += 1) {
      view.setFloat32(offset, (index + 1) / 10, true);
      offset += 4;
    }
  }
  for (let index = 0; index < groupFrames; index += 1) {
    view.setInt32(offset, -1, true);
    view.setInt32(offset + 4, 1, true);
    view.setInt32(offset + 8, 2, true);
    view.setInt32(offset + 12, 2, true);
    offset += 16;
    result.set(options.pixels ?? [0, 1, 255, 2], offset);
    offset += 4;
  }
  return result;
}

export function makeMipTexture(
  version: 29 | 30,
  name = version === 29 ? 'stone' : 'brick',
): Uint8Array {
  const widths = [16, 8, 4, 2];
  const heights = [16, 8, 4, 2];
  const offsets: number[] = [];
  let length = 40;
  for (let index = 0; index < 4; index += 1) {
    offsets.push(length);
    length += (widths[index] ?? 0) * (heights[index] ?? 0);
  }
  const palette = makePalette();
  const result = new Uint8Array(length + (version === 30 ? 2 + palette.length : 0));
  const view = new DataView(result.buffer);
  new TextEncoder().encodeInto(name, result.subarray(0, 16));
  view.setUint32(16, 16, true);
  view.setUint32(20, 16, true);
  offsets.forEach((offset, index) => view.setUint32(24 + index * 4, offset, true));
  for (let index = 40; index < length; index += 1) result[index] = (index - 40) & 255;
  if (version === 30) {
    view.setUint16(length, 256, true);
    result.set(palette, length + 2);
  }
  return result;
}

export function makeWad(
  version: 2 | 3,
  texture = makeMipTexture(version === 2 ? 29 : 30),
  lumpName = 'fixture',
): Uint8Array {
  const directoryOffset = 12 + texture.length;
  const result = new Uint8Array(directoryOffset + 32);
  const view = new DataView(result.buffer);
  new TextEncoder().encodeInto(`WAD${version}`, result.subarray(0, 4));
  view.setUint32(4, 1, true);
  view.setUint32(8, directoryOffset, true);
  result.set(texture, 12);
  view.setUint32(directoryOffset, 12, true);
  view.setUint32(directoryOffset + 4, texture.length, true);
  view.setUint32(directoryOffset + 8, texture.length, true);
  view.setUint8(directoryOffset + 12, version === 2 ? 0x44 : 0x43);
  new TextEncoder().encodeInto(
    lumpName,
    result.subarray(directoryOffset + 16, directoryOffset + 32),
  );
  return result;
}

export function makeBsp(options: FixtureOptions = {}): Uint8Array {
  const version = options.version ?? 30;
  const hasTrace = options.trace || options.visibility;
  const texture = makeMipTexture(version, options.textureName);
  if (options.embeddedTexture === false) {
    new DataView(texture.buffer, texture.byteOffset, texture.byteLength).setUint32(24, 0, true);
  }
  const entities = new TextEncoder().encode(
    options.entityText ??
      `{\n"classname" "worldspawn"\n"wad" "C:\\games\\valve\\fixture.wad;custom.wad"\n}\n${options.brushEntity ? `{\n"model" "*1"\n${options.brushEntity}\n}\n` : ''}\0`,
  );

  const textureLump = new Uint8Array(8 + texture.length);
  new DataView(textureLump.buffer).setUint32(0, 1, true);
  new DataView(textureLump.buffer).setUint32(4, 8, true);
  textureLump.set(texture, 8);

  const vertices = new Uint8Array(48);
  const vertexView = new DataView(vertices.buffer);
  const points = [
    [0, 0, 0],
    [16, 0, 0],
    [16, 16, 0],
    [0, 16, 0],
  ];
  points.flat().forEach((value, index) => vertexView.setFloat32(index * 4, value, true));

  const texinfo = new Uint8Array(40);
  const texinfoView = new DataView(texinfo.buffer);
  texinfoView.setFloat32(0, 1, true);
  texinfoView.setFloat32(20, 1, true);

  const faceCopies = options.brushEntity ? 2 : (options.faceCopies ?? 1);
  const face = new Uint8Array(20 * faceCopies);
  const faceView = new DataView(face.buffer);
  for (let index = 0; index < faceCopies; index += 1) {
    const offset = index * 20;
    faceView.setUint32(offset + 4, 0, true);
    faceView.setUint16(offset + 8, 4, true);
    faceView.setUint16(offset + 10, 0, true);
    faceView.setUint8(offset + 12, 0);
    faceView.setUint8(offset + 13, 255);
    faceView.setUint8(offset + 14, 255);
    faceView.setUint8(offset + 15, 255);
    faceView.setInt32(offset + 16, 0, true);
  }

  const lighting = new Uint8Array(version === 29 ? 4 : 12).fill(128);
  const edges = new Uint8Array(16);
  const edgeView = new DataView(edges.buffer);
  [0, 1, 1, 2, 2, 3, 3, 0].forEach((value, index) => edgeView.setUint16(index * 2, value, true));
  const surfedges = new Uint8Array(16);
  const surfedgeView = new DataView(surfedges.buffer);
  [options.firstSurfedge ?? 0, 1, 2, 3].forEach((value, index) =>
    surfedgeView.setInt32(index * 4, value, true),
  );

  const modelCount = options.brushEntity ? 2 : 1;
  const model = new Uint8Array(64 * modelCount);
  const modelView = new DataView(model.buffer);
  for (let modelIndex = 0; modelIndex < modelCount; modelIndex += 1) {
    const offset = modelIndex * 64;
    [0, 0, -1, 16, 16, 1].forEach((value, index) =>
      modelView.setFloat32(offset + index * 4, value, true),
    );
    for (let index = 0; index < 4; index += 1) {
      const headnode = (hasTrace && index === 0) || (options.collision && index === 1) ? 0 : -1;
      modelView.setInt32(offset + 36 + index * 4, headnode, true);
    }
    if (modelIndex === 0 && options.visibility) modelView.setInt32(offset + 52, 1, true);
    modelView.setUint32(offset + 56, modelIndex, true);
    modelView.setUint32(offset + 60, options.brushEntity ? 1 : faceCopies, true);
  }

  const lumps: Uint8Array[] = Array.from({ length: LUMP_COUNT }, () => new Uint8Array());
  if (hasTrace || options.collision) {
    const planeCount = Number(Boolean(hasTrace)) + Number(Boolean(options.collision));
    const planes = new Uint8Array(20 * planeCount);
    const planeView = new DataView(planes.buffer);
    if (hasTrace) {
      planeView.setFloat32(0, 1, true);
      planeView.setFloat32(12, 8, true);
    }
    if (options.collision) {
      const offset = hasTrace ? 20 : 0;
      planeView.setFloat32(offset + 8, 1, true);
      planeView.setFloat32(offset + 12, 36, true);
    }
    lumps[1] = planes;
  }
  if (hasTrace) {
    const nodes = new Uint8Array(24);
    const nodeView = new DataView(nodes.buffer);
    nodeView.setUint32(0, 0, true);
    nodeView.setInt16(4, -2, true);
    nodeView.setInt16(6, -1, true);
    const leaves = new Uint8Array(56);
    const leafView = new DataView(leaves.buffer);
    leafView.setInt32(0, -2, true);
    leafView.setInt32(28, -1, true);
    if (options.visibility) {
      leafView.setInt32(32, 0, true);
      leafView.setUint16(48, 0, true);
      leafView.setUint16(50, 1, true);
      lumps[4] = new Uint8Array([1]);
      lumps[11] = new Uint8Array([0, 0]);
    }
    lumps[5] = nodes;
    lumps[10] = leaves;
  }
  if (options.collision) {
    const clipnodes = new Uint8Array(8);
    const clipnodeView = new DataView(clipnodes.buffer);
    clipnodeView.setInt32(0, hasTrace ? 1 : 0, true);
    clipnodeView.setInt16(4, -1, true);
    clipnodeView.setInt16(6, -2, true);
    lumps[9] = clipnodes;
  }
  lumps[0] = entities;
  lumps[2] = textureLump;
  lumps[3] = vertices;
  lumps[6] = texinfo;
  lumps[7] = face;
  lumps[8] = lighting;
  lumps[12] = edges;
  lumps[13] = surfedges;
  lumps[14] = model;

  const headerSize = 4 + LUMP_COUNT * 8;
  let size = headerSize;
  const offsets: number[] = [];
  for (const lump of lumps) {
    size = align4(size);
    offsets.push(size);
    size += lump.length;
  }
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  view.setUint32(0, version, true);
  lumps.forEach((lump, index) => {
    const offset = offsets[index] ?? headerSize;
    view.setUint32(4 + index * 8, offset, true);
    view.setUint32(8 + index * 8, lump.length, true);
    result.set(lump, offset);
  });
  return result;
}

export function makeBsp38(options: Bsp38FixtureOptions = {}): Uint8Array {
  const entities = new TextEncoder().encode('{\n"classname" "worldspawn"\n"sky" "unit1_"\n}\n\0');
  const vertices = new Uint8Array(48);
  const vertexView = new DataView(vertices.buffer);
  [0, 0, 0, 16, 0, 0, 16, 16, 0, 0, 16, 0].forEach((value, index) =>
    vertexView.setFloat32(index * 4, value, true),
  );
  const texinfo = new Uint8Array(76);
  const texinfoView = new DataView(texinfo.buffer);
  texinfoView.setFloat32(0, 1, true);
  texinfoView.setFloat32(20, 1, true);
  texinfoView.setUint32(32, options.surfaceFlags ?? 0, true);
  new TextEncoder().encodeInto(options.textureName ?? 'e1u1/fixture', texinfo.subarray(40, 72));
  texinfoView.setInt32(72, -1, true);
  const face = new Uint8Array(20);
  const faceView = new DataView(face.buffer);
  faceView.setInt32(4, 0, true);
  faceView.setInt16(8, 4, true);
  faceView.setInt16(10, 0, true);
  faceView.setUint8(12, 0);
  faceView.setUint8(13, 255);
  faceView.setUint8(14, 255);
  faceView.setUint8(15, 255);
  faceView.setInt32(16, options.lightOffset ?? 0, true);
  const lighting = new Uint8Array(12).fill(128);
  const edges = new Uint8Array(16);
  const edgeView = new DataView(edges.buffer);
  [0, 1, 1, 2, 2, 3, 3, 0].forEach((value, index) => edgeView.setUint16(index * 2, value, true));
  const surfedges = new Uint8Array(16);
  const surfedgeView = new DataView(surfedges.buffer);
  [0, 1, 2, 3].forEach((value, index) => surfedgeView.setInt32(index * 4, value, true));
  const model = new Uint8Array(48);
  const modelView = new DataView(model.buffer);
  [0, 0, -1, 16, 16, 1].forEach((value, index) => modelView.setFloat32(index * 4, value, true));
  modelView.setInt32(36, 0, true);
  modelView.setInt32(40, 0, true);
  modelView.setInt32(44, 1, true);

  const lumps: Uint8Array[] = Array.from({ length: 19 }, () => new Uint8Array());
  lumps[0] = entities;
  lumps[2] = vertices;
  lumps[5] = texinfo;
  lumps[6] = face;
  lumps[7] = lighting;
  lumps[11] = edges;
  lumps[12] = surfedges;
  lumps[13] = model;
  const headerSize = 8 + lumps.length * 8;
  let size = headerSize;
  const offsets = lumps.map((lump) => {
    size = align4(size);
    const offset = size;
    size += lump.length;
    return offset;
  });
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  new TextEncoder().encodeInto('IBSP', result.subarray(0, 4));
  view.setUint32(4, 38, true);
  lumps.forEach((lump, index) => {
    const offset = offsets[index] ?? headerSize;
    view.setUint32(8 + index * 8, offset, true);
    view.setUint32(12 + index * 8, lump.length, true);
    result.set(lump, offset);
  });
  return result;
}
