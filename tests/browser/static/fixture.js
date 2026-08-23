function align4(value) {
  return (value + 3) & ~3;
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
let readyCount = 0;
for (let index = 0; index < 2; index += 1) {
  const element = document.createElement('world-view');
  element.setAttribute('controls', 'none');
  if (index === 0) {
    element.setAttribute('audio', 'false');
    element.setAttribute('audio-volume', '0.35');
    element.setAttribute('music-volume', '0.45');
  }
  element.addEventListener(
    'ready',
    (event) => {
      element.dataset.triangles = String(event.detail.diagnostics.triangles);
      element.dataset.audioVolume = String(element.viewer.audio.volume);
      element.dataset.audioEnabled = String(element.viewer.audio.enabled);
      element.dataset.musicVolume = String(element.viewer.audio.musicVolume);
      readyCount += 1;
      document.body.dataset.ready = String(readyCount);
    },
    { once: true },
  );
  element.addEventListener('error', (event) => {
    document.body.dataset.error = event.detail.error.message;
  });
  document.body.append(element);
  element.setAttribute('src', bspUrl);
}
