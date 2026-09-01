function align4(value) {
  return (value + 3) & ~3;
}

function walkabilityFingerprint(world) {
  const FNV_OFFSET = 0x811c_9dc5;
  const FNV_PRIME = 0x0100_0193;
  const mixByte = (hash, value) => Math.imul(hash ^ value, FNV_PRIME) >>> 0;
  const mixString = (hash, value) => {
    for (const byte of new TextEncoder().encode(value)) hash = mixByte(hash, byte);
    return hash;
  };
  const mixNumber = (hash, value, integer) => {
    const bytes = new Uint8Array(8);
    const view = new DataView(bytes.buffer);
    if (integer) view.setInt32(0, value, true);
    else view.setFloat64(0, value, true);
    for (let index = 0; index < (integer ? 4 : 8); index += 1) {
      hash = mixByte(hash, bytes[index]);
    }
    return hash;
  };
  let hash = mixString(FNV_OFFSET, `${world.format}:${world.version}`);
  for (const value of [...world.bounds.min, ...world.bounds.max]) {
    hash = mixNumber(hash, value, false);
  }
  hash = mixNumber(hash, world.vertices.length, true);
  hash = mixNumber(hash, world.indices.length, true);
  if (world.collision) {
    for (const value of world.collision.planes) hash = mixNumber(hash, value, false);
    for (const value of world.collision.clipnodes) hash = mixNumber(hash, value, true);
  }
  for (const model of world.models) {
    for (const value of [...model.bounds.min, ...model.bounds.max]) {
      hash = mixNumber(hash, value, false);
    }
    for (const headnode of model.headnodes) hash = mixNumber(hash, headnode, true);
    hash = mixByte(hash, model.collidable ? 1 : 0);
  }
  for (const entity of world.entities) {
    for (const key of Object.keys(entity).toSorted()) {
      hash = mixString(hash, key);
      const value = entity[key];
      if (value === undefined) continue;
      for (const part of Array.isArray(value) ? value : [value]) hash = mixString(hash, part);
    }
  }
  return `wv1-${hash.toString(16).padStart(8, '0')}`;
}

function mipTexture() {
  const offsets = [40, 296, 360, 376];
  const pixelEnd = 380;
  const result = new Uint8Array(pixelEnd + 2 + 768);
  const view = new DataView(result.buffer);
  new TextEncoder().encodeInto('wv_grid', result.subarray(0, 16));
  view.setUint32(16, 16, true);
  view.setUint32(20, 16, true);
  offsets.forEach((offset, index) => view.setUint32(24 + index * 4, offset, true));
  for (let index = 40; index < pixelEnd; index += 1) {
    const x = (index - 40) % 16;
    const y = Math.floor((index - 40) / 16);
    result[index] = ((x >> 2) + (y >> 2)) % 2 === 0 ? 38 : 94;
  }
  view.setUint16(pixelEnd, 256, true);
  for (let index = 0; index < 256; index += 1) {
    result[pixelEnd + 2 + index * 3] = Math.min(255, index * 2);
    result[pixelEnd + 3 + index * 3] = Math.min(255, 48 + index);
    result[pixelEnd + 4 + index * 3] = Math.min(255, 20 + index / 2);
  }
  return result;
}

function syntheticGoldSrcBsp() {
  const texture = mipTexture();
  const entities = new TextEncoder().encode(
    '{\n"classname" "worldspawn"\n}\n{\n"classname" "info_player_start"\n"origin" "8 -48 12"\n"angle" "90"\n}\n\0',
  );
  const textureLump = new Uint8Array(8 + texture.length);
  const textureView = new DataView(textureLump.buffer);
  textureView.setUint32(0, 1, true);
  textureView.setUint32(4, 8, true);
  textureLump.set(texture, 8);

  const plane = new Uint8Array(20);
  new DataView(plane.buffer).setFloat32(8, 1, true);

  const vertices = new Uint8Array(48);
  const vertexView = new DataView(vertices.buffer);
  [
    [-128, -128, 0],
    [128, -128, 0],
    [128, 128, 0],
    [-128, 128, 0],
  ]
    .flat()
    .forEach((value, index) => vertexView.setFloat32(index * 4, value, true));
  const texinfo = new Uint8Array(40);
  const texinfoView = new DataView(texinfo.buffer);
  texinfoView.setFloat32(0, 0.125, true);
  texinfoView.setFloat32(20, 0.125, true);
  const face = new Uint8Array(20);
  const faceView = new DataView(face.buffer);
  faceView.setUint16(8, 4, true);
  faceView.setUint8(12, 0);
  faceView.setUint8(13, 255);
  faceView.setUint8(14, 255);
  faceView.setUint8(15, 255);
  const lighting = new Uint8Array(27).fill(112);
  const edges = new Uint8Array(16);
  const edgeView = new DataView(edges.buffer);
  [0, 3, 3, 2, 2, 1, 1, 0].forEach((value, index) => edgeView.setUint16(index * 2, value, true));
  const surfedges = new Uint8Array(16);
  const surfedgeView = new DataView(surfedges.buffer);
  [0, 1, 2, 3].forEach((value, index) => surfedgeView.setInt32(index * 4, value, true));
  const model = new Uint8Array(64);
  const modelView = new DataView(model.buffer);
  [-128, -128, -1, 128, 128, 1].forEach((value, index) =>
    modelView.setFloat32(index * 4, value, true),
  );
  for (let index = 0; index < 4; index += 1) modelView.setInt32(36 + index * 4, -1, true);
  modelView.setUint32(60, 1, true);

  const lumps = Array.from({ length: 15 }, () => new Uint8Array());
  lumps[0] = entities;
  lumps[1] = plane;
  lumps[2] = textureLump;
  lumps[3] = vertices;
  lumps[6] = texinfo;
  lumps[7] = face;
  lumps[8] = lighting;
  lumps[12] = edges;
  lumps[13] = surfedges;
  lumps[14] = model;
  let size = 124;
  const offsets = [];
  for (const lump of lumps) {
    size = align4(size);
    offsets.push(size);
    size += lump.length;
  }
  const bsp = new Uint8Array(size);
  const bspView = new DataView(bsp.buffer);
  bspView.setUint32(0, 30, true);
  lumps.forEach((lump, index) => {
    const offset = offsets[index] ?? 124;
    bspView.setUint32(4 + index * 8, offset, true);
    bspView.setUint32(8 + index * 8, lump.length, true);
    bsp.set(lump, offset);
  });
  return bsp.buffer;
}

if (!navigator.gpu) document.body.dataset.error = 'WebGPU unavailable';

await customElements.whenDefined('world-view');
const bspUrl = URL.createObjectURL(
  new Blob([syntheticGoldSrcBsp()], { type: 'application/octet-stream' }),
);
const worldSource = () => ({
  bsp: bspUrl,
  wads: [],
  resolveWad: () => null,
});
let readyCount = 0;
const elements = [];
const readyPromises = [];
for (let index = 0; index < 2; index += 1) {
  const element = document.createElement('world-view');
  element.dataset.kind = 'source';
  elements.push(element);
  element.setAttribute('controls', 'none');
  if (index === 0) {
    element.setAttribute('audio', 'false');
    element.setAttribute('audio-volume', '0.35');
    element.setAttribute('music-volume', '0.45');
  }
  readyPromises.push(
    new Promise((resolve) => {
      element.addEventListener('ready', (event) => {
        const elementReadyCount = Number(element.dataset.readyCount ?? 0) + 1;
        element.dataset.readyCount = String(elementReadyCount);
        if (elementReadyCount > 1) return;
        element.dataset.triangles = String(event.detail.diagnostics.triangles);
        element.dataset.audioVolume = String(element.viewer.audio.volume);
        element.dataset.audioEnabled = String(element.viewer.audio.enabled);
        element.dataset.musicVolume = String(element.viewer.audio.musicVolume);
        readyCount += 1;
        document.body.dataset.ready = String(readyCount);
        resolve();
      });
    }),
  );
  element.addEventListener('error', (event) => {
    document.body.dataset.error = event.detail.error.message;
  });
  if (index === 0) element.source = worldSource();
  document.body.append(element);
  if (index === 1) element.source = worldSource();
}

await Promise.all(readyPromises);

const world = elements[0].viewer.world;
const walkability = {
  format: 'worldview-walkability',
  version: 1,
  worldFingerprint: walkabilityFingerprint(world),
  parameters: {
    spacing: 32,
    mergeDistance: 10,
    directions: 4,
    maximumNodes: 1,
    allowJump: false,
    jumpSeconds: 0.4,
    fixedDeltaSeconds: 0.01,
    movement: {
      gravity: 800,
      stopSpeed: 100,
      maxSpeed: 320,
      accelerate: 10,
      airAccelerate: 10,
      friction: 4,
      edgeFriction: 2,
      stepSize: 18,
    },
  },
  seeds: [],
  nodes: [],
  edges: [],
  boundaries: [],
  statistics: {
    nodes: 0,
    edges: 0,
    walkEdges: 0,
    jumpEdges: 0,
    dropEdges: 0,
    boundaries: 0,
    components: 0,
    truncated: false,
  },
};
const serializedWalkability = `${JSON.stringify(walkability)}\n`;

const sidecarElement = document.createElement('world-view');
sidecarElement.dataset.kind = 'sidecar';
sidecarElement.setAttribute('controls', 'none');
sidecarElement.source = worldSource();
sidecarElement.walkabilitySource = new Blob([serializedWalkability], {
  type: 'application/json',
});
const sidecarEvents = [];
const sidecarReady = new Promise((resolve) => {
  sidecarElement.addEventListener('ready', () => {
    sidecarEvents.push('ready');
    resolve();
  });
});
const sidecarApplied = new Promise((resolve) => {
  sidecarElement.addEventListener('walkabilitychange', (event) => {
    if (!event.detail.walkability) return;
    if (event.detail.visible) sidecarEvents.push('visible');
    else if (!sidecarEvents.includes('applied')) {
      sidecarEvents.push('applied');
      resolve();
    }
  });
});
sidecarElement.addEventListener('progress', (event) => {
  if (event.detail.phase === 'walkability' && !sidecarEvents.includes('progress')) {
    sidecarEvents.push('progress');
  }
});
document.body.append(sidecarElement);
await Promise.all([sidecarReady, sidecarApplied]);
sidecarElement.walkabilityVisible = true;
document.body.dataset.sidecarOrder = sidecarEvents.join(',');
document.body.dataset.sidecarReady = 'true';

const invalidElement = document.createElement('world-view');
invalidElement.dataset.kind = 'invalid-sidecar';
invalidElement.setAttribute('controls', 'none');
invalidElement.setAttribute('walkability-visible', '');
invalidElement.setAttribute('src', bspUrl);
invalidElement.setAttribute(
  'walkability-src',
  `data:application/json,${encodeURIComponent('not valid walkability')}`,
);
const invalidReady = new Promise((resolve) => {
  invalidElement.addEventListener('ready', resolve, { once: true });
});
const invalidWarning = new Promise((resolve) => {
  invalidElement.addEventListener(
    'warning',
    (event) => {
      invalidElement.dataset.warningCode = event.detail.code;
      resolve();
    },
    { once: true },
  );
});
invalidElement.addEventListener('error', (event) => {
  invalidElement.dataset.error = event.detail.error.message;
});
document.body.append(invalidElement);
await Promise.all([invalidReady, invalidWarning]);
invalidElement.dataset.ready = 'true';

const originalFetch = globalThis.fetch.bind(globalThis);
const delayedSidecarUrl = 'https://worldview.test/delayed-walkability';
let releaseDelayedSidecar;
let markDelayedRequested;
let markDelayedSettled;
const delayedRequested = new Promise((resolve) => {
  markDelayedRequested = resolve;
});
const delayedSettled = new Promise((resolve) => {
  markDelayedSettled = resolve;
});
globalThis.fetch = (input, init) => {
  if (String(input) !== delayedSidecarUrl) return originalFetch(input, init);
  return new Promise((resolve, reject) => {
    markDelayedRequested();
    const signal = init?.signal;
    const settle = () => markDelayedSettled();
    const abort = () => {
      settle();
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    releaseDelayedSidecar = () => {
      signal?.removeEventListener('abort', abort);
      settle();
      resolve(new Response(serializedWalkability, { status: 200 }));
    };
  });
};

const staleElement = document.createElement('world-view');
staleElement.dataset.kind = 'stale-sidecar';
staleElement.setAttribute('controls', 'none');
staleElement.source = worldSource();
staleElement.walkabilitySource = delayedSidecarUrl;
let staleReadyCount = 0;
let staleApplications = 0;
const staleReloaded = new Promise((resolve) => {
  staleElement.addEventListener('ready', () => {
    staleReadyCount += 1;
    if (staleReadyCount === 2) resolve();
  });
});
staleElement.addEventListener('walkabilitychange', (event) => {
  if (event.detail.walkability) staleApplications += 1;
});
document.body.append(staleElement);
await delayedRequested;
staleElement.walkabilitySource = null;
staleElement.source = worldSource();
releaseDelayedSidecar?.();
await Promise.all([delayedSettled, staleReloaded]);
globalThis.fetch = originalFetch;
staleElement.dataset.readyCount = String(staleReadyCount);
staleElement.dataset.walkabilityApplications = String(staleApplications);
document.body.dataset.elementContractReady = 'true';
