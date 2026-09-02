import { describe, expect, it, vi } from 'vitest';

import {
  bspPlayerProfile,
  buildLightmapPage,
  classifyMaterial,
  copyWaveChannel,
  decodeMipTexture,
  decodeQuakeSky,
  decodeTga,
  findMipTexture,
  LightmapPacker,
  createGoldSrcMovementState,
  moveGoldSrcPlayer,
  planOverview,
  parseBsp,
  parseEntities,
  parseGoldSrcSprite,
  parseWave,
  parseWad,
  soundReference,
  spriteReference,
  traceWorldSegment,
  tracePlayerHull,
  WorldviewError,
  visibleWorldFaceMask,
} from '../src/core/index.js';
import {
  ambientSoundLoops,
  ambientPlaybackState,
  goldSrcStereoGains,
  playerSurfaceMaterial,
  selectEnvSoundRoom,
} from '../src/viewer/audio.js';
import { roomPresetForType } from '../src/viewer/room-presets.js';
import { surfaceTextureBelow } from '../src/viewer/surface.js';
import { goldSrcBrushPipeline, goldSrcTextureScrollSpeed } from '../src/render/renderer.js';
import { WorldCamera } from '../src/viewer/camera.js';
import { WorldControls, type PlayerSoundEvent } from '../src/viewer/controls.js';
import {
  makeBsp,
  makeBsp38,
  makeMipTexture,
  makePalette,
  makeSprite,
  makeTga,
  makeWad,
  makeWave,
} from './fixtures.js';

describe('overview planning', () => {
  it('fits renderable geometry with deterministic padding', () => {
    const world = parseBsp(makeBsp());
    const overview = planOverview(world, {
      width: 200,
      height: 100,
      padding: 0.1,
    });
    expect(overview.bounds).toEqual({ min: [0, 0, 0], max: [16, 16, 0] });
    expect(overview.rotation).toBe(0);
    expect(overview.origin).toEqual([8, 8, 0]);
    expect(overview.worldUnitsPerPixel).toBeCloseTo(0.2);
    expect(overview.viewWidth).toBeCloseTo(40);
    expect(overview.viewHeight).toBeCloseTo(20);
  });

  it('rotates rectangular geometry when it improves the requested fit', () => {
    const world = parseBsp(makeBsp());
    const vertices = world.vertices.slice();
    for (let index = 0; index < vertices.length; index += 7) vertices[index]! *= 4;
    const overview = planOverview({ ...world, vertices }, { width: 100, height: 200 });
    expect(overview.rotation).toBe(90);
  });

  it('rejects inverted height slices', () => {
    const world = parseBsp(makeBsp());
    expect(() => planOverview(world, { zMin: 10, zMax: -10 })).toThrow(/zMin/);
    expect(() => planOverview(world, { width: 16_384 })).toThrow(/between 1 and 8192/);
  });
});

describe('BSP player profiles', () => {
  it('keeps format-owned spawn and eye-height behavior explicit', () => {
    expect(bspPlayerProfile('quake-bsp29').eyeHeight).toBe(22);
    expect(bspPlayerProfile('quake-bsp2')).toEqual(bspPlayerProfile('quake-bsp29'));
    expect(bspPlayerProfile('quake2-bsp38').eyeHeight).toBe(22);
    expect(bspPlayerProfile('goldsrc-bsp30').eyeHeight).toBe(28);
    expect(bspPlayerProfile('goldsrc-bsp30').spawnClasses.has('info_player_counterterrorist')).toBe(
      true,
    );
    expect(bspPlayerProfile('quake2-bsp38').spawnClasses.has('info_player_counterterrorist')).toBe(
      false,
    );
  });
});

describe('BSP visibility', () => {
  it('marks only faces referenced by leaves in the camera PVS', () => {
    const world = parseBsp(makeBsp({ faceCopies: 2, visibility: true }));
    expect(visibleWorldFaceMask(world.trace, world.visibility, [12, 0, 0])).toEqual(
      new Uint8Array([1, 0]),
    );
  });

  it('falls back to drawing everything when the camera is in the solid leaf', () => {
    const world = parseBsp(makeBsp({ visibility: true }));
    expect(visibleWorldFaceMask(world.trace, world.visibility, [0, 0, 0])).toBeNull();
  });
});

describe('Quake II BSP38', () => {
  it('parses IBSP geometry, RGB lightmaps, entities, and material identity', () => {
    const world = parseBsp(makeBsp38({ surfaceValue: -12 }));

    expect(world).toMatchObject({
      format: 'quake2-bsp38',
      version: 38,
      skyName: 'unit1_',
      lightmapBytesPerTexel: 3,
      trace: null,
      visibility: null,
      collision: null,
    });
    expect(world.vertices).toHaveLength(28);
    expect(world.indices).toEqual(new Uint32Array([0, 1, 2, 0, 2, 3]));
    expect(world.materials).toMatchObject([
      {
        name: 'e1u1/fixture',
        kind: 'opaque',
        opacity: 1,
        scrollSpeed: 0,
        nextMaterialIndex: null,
        surfaceFlags: 0,
        surfaceValue: -12,
      },
    ]);
    expect(world.lightmapPages).toHaveLength(1);
    expect(world.lightmapPages[0]?.lightmaps[0]?.samples).toHaveLength(12);
  });

  it('uses Quake II surface flags for render classification', () => {
    expect(parseBsp(makeBsp38({ surfaceFlags: 0x04 })).materials[0]?.kind).toBe('sky');
    expect(parseBsp(makeBsp38({ surfaceFlags: 0x08 })).materials[0]?.kind).toBe('water');
    expect(parseBsp(makeBsp38({ surfaceFlags: 0x10 })).materials[0]).toMatchObject({
      kind: 'opaque',
      opacity: 0.33,
    });
    expect(parseBsp(makeBsp38({ surfaceFlags: 0x20 })).materials[0]).toMatchObject({
      kind: 'opaque',
      opacity: 0.66,
    });
    expect(parseBsp(makeBsp38({ surfaceFlags: 0x40 })).materials[0]?.scrollSpeed).toBe(1.6);
    expect(parseBsp(makeBsp38({ surfaceFlags: 0x48 })).materials[0]?.scrollSpeed).toBe(32);
    expect(parseBsp(makeBsp38({ surfaceFlags: 0x80 })).materials[0]?.kind).toBe('tool');
  });

  it('omits lightmaps from Quake II sky, warp, translucent, and nodraw surfaces', () => {
    for (const surfaceFlags of [0x04, 0x08, 0x10, 0x20, 0x80]) {
      const world = parseBsp(makeBsp38({ surfaceFlags }));
      expect(world.faces[0]?.lightmap).toMatchObject({ pageIndex: -1, samples: null });
    }
  });

  it('rejects invalid IBSP versions and truncated lightmaps', () => {
    const unsupported = makeBsp38();
    new DataView(unsupported.buffer).setUint32(4, 46, true);
    expect(() => parseBsp(unsupported)).toThrow(/IBSP and QBSP version 38/);
    expect(() => parseBsp(makeBsp38({ lightOffset: 8 }))).toThrow(/light samples/);
  });
});

describe('entities', () => {
  it('preserves duplicate keys in source order', () => {
    expect(parseEntities('{ "key" "first" "key" "second" }')).toEqual([
      { key: ['first', 'second'] },
    ]);
  });

  it('normalizes declared WAD basenames without inventing a hosted layout', () => {
    const world = parseBsp(makeBsp());
    expect(world.wadReferences).toEqual([
      { declaredPath: 'C:/games/valve/fixture.wad', basename: 'fixture.wad' },
      { declaredPath: 'custom.wad', basename: 'custom.wad' },
    ]);
  });

  it('normalizes asset references and rejects parent traversal', () => {
    expect(soundReference('Ambience\\Wind.wav')).toMatchObject({
      declaredPath: 'Ambience/Wind.wav',
      normalizedPath: 'ambience/wind.wav',
    });
    expect(spriteReference('/Sprites\\Glow.spr')).toMatchObject({
      declaredPath: 'Sprites/Glow.spr',
      normalizedPath: 'sprites/glow.spr',
    });
    expect(soundReference('../outside.wav')).toBeUndefined();
    expect(spriteReference('sprites/../outside.spr')).toBeUndefined();
  });

  it('normalizes GoldSrc ambient and room-sound entities', () => {
    const world = parseBsp(
      makeBsp({
        entityText:
          '{ "classname" "worldspawn" }\n{ "classname" "ambient_generic" "message" "Ambience\\Hum.wav" "origin" "1 2 3" "health" "5" "pitch" "120" "spawnflags" "2" }\n{ "classname" "env_sound" "origin" "4 5 6" "radius" "256" "roomtype" "7" }',
      }),
    );
    expect(world.ambientSounds[0]).toMatchObject({
      origin: [1, 2, 3],
      attenuation: 2,
      looping: true,
      activeOnLoad: true,
      reference: {
        declaredPath: 'Ambience/Hum.wav',
        normalizedPath: 'ambience/hum.wav',
      },
      modulation: { runVolume: 0.5, runPitch: 120 },
    });
    expect(world.envSounds[0]).toMatchObject({
      origin: [4, 5, 6],
      radius: 256,
      roomType: 7,
    });
  });

  it('retains numbered ambient preset IDs without inferring their modulation', () => {
    const world = parseBsp(
      makeBsp({
        entityText:
          '{ "classname" "worldspawn" }\n{ "classname" "ambient_generic" "message" "machine.wav" "spawnflags" "48" "preset" "27" }',
      }),
    );
    expect(world.ambientSounds[0]).toMatchObject({
      startSilent: true,
      looping: false,
      activeOnLoad: false,
      modulation: { preset: 27, runPitch: 100, startPitch: 100, lfoType: 0 },
    });
  });

  it('normalizes Sven Co-op music flags without treating music as a spatial emitter', () => {
    const world = parseBsp(
      makeBsp({
        entityText:
          '{ "classname" "worldspawn" }\n{ "classname" "ambient_music" "message" "Music\\Track.mp3" "volume" "7" "spawnflags" "3" "targetname" "bgm_main" }',
      }),
    );
    expect(world.musicTracks[0]).toEqual({
      entityIndex: 1,
      reference: {
        declaredPath: 'Music/Track.mp3',
        normalizedPath: 'music/track.mp3',
        basename: 'track.mp3',
      },
      volume: 0.7,
      startSilent: true,
      looping: true,
      activatorOnly: false,
      activeOnLoad: false,
      targetName: 'bgm_main',
    });
    expect(world.ambientSounds).toHaveLength(0);
  });
});

describe('GoldSrc WAV and spatial audio', () => {
  it('decodes 8-bit PCM and retains cue/LIST loop points', () => {
    const wave = parseWave(makeWave({ frames: [0, 128, 255, 64], loopStart: 1, loopLength: 2 }));
    const samples = new Float32Array(wave.frameCount);
    copyWaveChannel(wave, 0, samples);
    expect(wave).toMatchObject({
      sampleRate: 22_050,
      channels: 1,
      bitsPerSample: 8,
      loopStartFrame: 1,
      loopEndFrame: 3,
    });
    expect([...samples]).toEqual([-1, 0, 127 / 128, -0.5]);
  });

  it('decodes signed 16-bit stereo channels', () => {
    const wave = parseWave(
      makeWave({
        bitsPerSample: 16,
        channels: 2,
        frames: [-32_768, 0, 16_384],
      }),
    );
    const samples = new Float32Array(wave.frameCount);
    copyWaveChannel(wave, 1, samples);
    expect([...samples]).toEqual([-1, 0, 0.5]);
  });

  it('retains standard WAV sample-loop boundaries', () => {
    expect(parseWave(makeWave({ sampleLoop: [1, 3] }))).toMatchObject({
      loopStartFrame: 1,
      loopEndFrame: 3,
    });
  });

  it('uses an ambient entity loop even when the WAV has no explicit loop range', () => {
    const looped = parseWave(makeWave({ sampleLoop: [1, 3] }));
    const oneShot = parseWave(makeWave());
    expect(ambientSoundLoops({ looping: true }, looped)).toBe(true);
    expect(ambientSoundLoops({ looping: true }, oneShot)).toBe(true);
    expect(ambientSoundLoops({ looping: false }, looped)).toBe(false);
    expect(ambientSoundLoops({ looping: false }, oneShot)).toBe(false);
  });

  it('evaluates authored startup envelopes and classic stereo attenuation', () => {
    const world = parseBsp(
      makeBsp({
        entityText:
          '{ "classname" "worldspawn" }\n{ "classname" "ambient_generic" "message" "hum.wav" "health" "10" "volstart" "0" "fadein" "1" "spawnflags" "2" }',
      }),
    );
    const ambient = world.ambientSounds[0]!;
    expect(ambientPlaybackState(ambient, 0).volume).toBe(0);
    expect(ambientPlaybackState(ambient, 1).volume).toBe(1);
    expect(goldSrcStereoGains([0, 0, 0], [0, -1, 0], [0, -100, 0], 1, 0.8)).toEqual({
      left: 0,
      right: 1,
    });
  });

  it('groups all numbered room types into audible approximate DSP presets', () => {
    expect(roomPresetForType(0)).toMatchObject({ dry: 1, wet: 0 });
    expect(roomPresetForType(6).wet).toBeGreaterThan(0);
    expect(roomPresetForType(15).lowpass).toBeLessThan(1_000);
    expect(roomPresetForType(24).duration).toBeGreaterThan(1);
  });

  it('classifies common GoldSrc texture names for player sample families', () => {
    expect([
      playerSurfaceMaterial('future_vent'),
      playerSurfaceMaterial('steel'),
      playerSurfaceMaterial('trrm_wood2'),
      playerSurfaceMaterial('-0out_dirt2'),
      playerSurfaceMaterial('court_tile'),
      playerSurfaceMaterial('acid_brick3'),
    ]).toEqual(['grate', 'metal', 'wood', 'dirt', 'tile', 'concrete']);
  });
});

describe('WAD and MIPTEX', () => {
  it.each([2, 3] as const)('parses WAD%s and finds its texture', (version) => {
    const wad = parseWad(makeWad(version));
    expect(wad.version).toBe(version);
    expect(findMipTexture(wad, 'FIXTURE')).toBeDefined();
  });

  it('retains compressed directory records as recoverable warnings', () => {
    const bytes = makeWad(3);
    const directory = new DataView(bytes.buffer).getUint32(8, true);
    bytes[directory + 13] = 1;
    const wad = parseWad(bytes);
    expect(wad.lumps[0]).toMatchObject({ sourceIndex: 0, compression: 1 });
    expect(wad.lumps[0]?.mipTexture).toBeUndefined();
    expect(wad.warnings).toContainEqual(
      expect.objectContaining({ code: 'unsupported-wad-compression', lumpIndex: 0 }),
    );
  });

  it('uses palette index 255 as transparency for decal textures', () => {
    const bytes = makeMipTexture(30, '{fence');
    bytes[40] = 255;
    const decoded = decodeMipTexture(bytes);
    expect(decoded.levels[0]?.rgba.slice(0, 4)).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it('decodes BSP29 textures with an external palette', () => {
    const decoded = decodeMipTexture(makeMipTexture(29), makePalette());
    expect(decoded.levels).toHaveLength(4);
    expect(decoded.levels[0]?.rgba.slice(0, 4)).toEqual(new Uint8Array([0, 255, 0, 255]));
  });

  it('rejects decoded textures wider than the portable WebGPU limit', () => {
    const texture = makeMipTexture(29);
    const view = new DataView(texture.buffer, texture.byteOffset, texture.byteLength);
    view.setUint32(16, 8_193, true);
    view.setUint32(20, 1, true);

    expect(() => decodeMipTexture(texture, makePalette())).toThrow(/portable WebGPU texture/u);
  });

  it('splits Quake sky textures into opaque and transparent scrolling layers', () => {
    const texture = makeMipTexture(29, 'sky_test');
    texture[40] = 0;
    texture[48] = 12;
    const decoded = decodeQuakeSky(texture, makePalette());
    expect(decoded.width).toBe(8);
    expect(decoded.solid.slice(0, 4)).toEqual(new Uint8Array([12, 243, 84, 255]));
    expect(decoded.alpha.slice(0, 4)).toEqual(new Uint8Array([12, 243, 84, 0]));
  });
});

describe('TGA', () => {
  it('decodes top-origin BGR true-color pixels to RGBA', () => {
    expect(decodeTga(makeTga()).rgba).toEqual(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]));
  });

  it('decodes run-length encoded true-color pixels', () => {
    expect(decodeTga(makeTga(true)).rgba).toEqual(
      new Uint8Array([10, 20, 30, 255, 10, 20, 30, 255]),
    );
  });

  it('rejects images that exceed the portable WebGPU dimensions before allocating them', () => {
    const oversized = makeTga();
    const view = new DataView(oversized.buffer, oversized.byteOffset, oversized.byteLength);
    view.setUint16(12, 65_535, true);
    view.setUint16(14, 65_535, true);
    expect(() => decodeTga(oversized)).toThrow(/portable WebGPU texture/u);
  });
});

describe('GoldSrc sprites', () => {
  it('decodes alpha-test index 255 as transparent', () => {
    const sprite = parseGoldSrcSprite(makeSprite({ textureFormat: 3 }));
    expect(sprite).toMatchObject({
      version: 2,
      orientation: 2,
      textureFormat: 3,
      maxWidth: 2,
      maxHeight: 2,
    });
    expect(sprite.frames[0]?.frames[0]?.rgba.slice(8, 12)).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it('uses the final palette color and the pixel index for index-alpha sprites', () => {
    const sprite = parseGoldSrcSprite(makeSprite({ textureFormat: 2, pixels: [128, 0, 255, 32] }));
    expect(sprite.frames[0]?.frames[0]?.rgba.slice(0, 4)).toEqual(
      new Uint8Array([255, 0, 249, 128]),
    );
  });

  it('retains cumulative frame-group intervals', () => {
    const sprite = parseGoldSrcSprite(makeSprite({ frameType: 1, groupFrames: 2 }));
    expect(sprite.frames[0]?.kind).toBe('group');
    expect(sprite.frames[0]?.intervals[0]).toBeCloseTo(0.1);
    expect(sprite.frames[0]?.intervals[1]).toBeCloseTo(0.2);
    expect(sprite.frames[0]?.frames).toHaveLength(2);
  });

  it('rejects nonstandard angled frame groups', () => {
    expect(() => parseGoldSrcSprite(makeSprite({ frameType: 2 }))).toThrow(/unknown type 2/);
  });

  it('rejects truncated frame pixels with a stable invalid-data error', () => {
    const bytes = makeSprite().slice(0, -1);
    expect(() => parseGoldSrcSprite(bytes)).toThrow(/pixels exceeds its source buffer/);
  });
});

describe('lightmaps and materials', () => {
  it('allocates deterministic additional lightmap pages', () => {
    const packer = new LightmapPacker(4, 4);
    const first = { width: 4, height: 4, pageIndex: -1, pageX: 0, pageY: 0 };
    const second = { width: 4, height: 4, pageIndex: -1, pageX: 0, pageY: 0 };
    packer.allocate(first);
    packer.allocate(second);
    expect([first.pageIndex, second.pageIndex]).toEqual([0, 1]);
  });

  it('combines multiple colored lightstyles', () => {
    const intensities = new Float32Array(64);
    intensities[0] = 0.5;
    intensities[1] = 1;
    const output = buildLightmapPage(
      {
        index: 0,
        width: 1,
        height: 1,
        lightmaps: [
          {
            faceIndex: 0,
            width: 1,
            height: 1,
            styles: [0, 1],
            samples: new Uint8Array([100, 40, 20, 30, 60, 90]),
            pageIndex: 0,
            pageX: 0,
            pageY: 0,
          },
        ],
      },
      3,
      intensities,
    );
    expect(output).toEqual(new Uint8Array([80, 80, 100, 255]));
  });

  it('classifies the v0.1 material pipeline families', () => {
    expect([
      classifyMaterial('brick', 'goldsrc-bsp30'),
      classifyMaterial('{fence', 'goldsrc-bsp30'),
      classifyMaterial('!water', 'goldsrc-bsp30'),
      classifyMaterial('sky_day', 'goldsrc-bsp30'),
      classifyMaterial('clip', 'quake-bsp29'),
    ]).toEqual(['opaque', 'alpha-test', 'water', 'sky', 'tool']);
  });

  it('keeps glow brush models on the translucent surface path', () => {
    expect(goldSrcBrushPipeline(3, 'alpha-test')).toBe('translucentTextureBrush');
  });
});

describe('BSP', () => {
  it('retains the GoldSrc worldspawn sky name', () => {
    const world = parseBsp(
      makeBsp({ entityText: '{ "classname" "worldspawn" "skyname" "space" }' }),
    );
    expect(world.skyName).toBe('space');
  });

  it.each([29, 30] as const)('parses a deterministic BSP%s scene', (version) => {
    const world = parseBsp(makeBsp({ version }));
    expect({
      format: world.format,
      skyName: world.skyName,
      vertices: world.vertices.length,
      indices: [...world.indices],
      faces: world.faces.length,
      batches: world.batches.length,
      pages: world.lightmapPages.map((page) => [page.width, page.height]),
      bytesPerTexel: world.lightmapBytesPerTexel,
    }).toEqual({
      format: version === 29 ? 'quake-bsp29' : 'goldsrc-bsp30',
      skyName: null,
      vertices: 28,
      indices: [0, 1, 2, 0, 2, 3],
      faces: 1,
      batches: 1,
      pages: [[2, 2]],
      bytesPerTexel: version === 29 ? 1 : 3,
    });
    expect(buildLightmapPage(world.lightmapPages[0]!, world.lightmapBytesPerTexel)).toEqual(
      new Uint8Array([
        128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255,
      ]),
    );
  });

  it('handles negative surfedges by using the edge endpoint', () => {
    const world = parseBsp(makeBsp({ firstSurfedge: -1 }));
    expect(world.vertices.slice(0, 3)).toEqual(new Float32Array([16, 16, 0]));
  });

  it('merges compatible draw batches while retaining each face boundary', () => {
    const world = parseBsp(makeBsp({ faceCopies: 2 }));
    expect(world.batches).toHaveLength(1);
    expect(world.batches[0]).toMatchObject({
      indexCount: 12,
      faceIndices: [0, 1],
    });
    expect(world.faces.map((face) => [face.sourceIndex, face.firstIndex, face.indexCount])).toEqual(
      [
        [0, 0, 6],
        [1, 6, 6],
      ],
    );
  });

  it('retains static brush render state for the renderer', () => {
    const world = parseBsp(
      makeBsp({
        brushEntity:
          '"classname" "func_illusionary"\n"rendermode" "2"\n"renderamt" "128"\n"rendercolor" "12 34 56"',
      }),
    );
    expect(world.models[1]).toMatchObject({
      visible: true,
      entityIndex: 1,
      classname: 'func_illusionary',
      collidable: false,
      renderMode: 2,
      renderAmount: 128,
      renderColor: [12, 34, 56],
      textureScrollSpeed: -547.5,
    });
  });

  it('retains GoldSrc scrolling-texture speed and scopes it to scroll materials', () => {
    const scrolling = parseBsp(
      makeBsp({
        textureName: 'scroll_fixture',
        brushEntity: '"classname" "func_conveyor"\n"speed" "512"',
      }),
    );
    const worldBatch = scrolling.batches.find((batch) => batch.modelIndex === 0)!;
    const conveyorBatch = scrolling.batches.find((batch) => batch.modelIndex === 1)!;
    expect(scrolling.models[1]).toMatchObject({ textureScrollSpeed: 512 });
    expect(goldSrcTextureScrollSpeed(scrolling, worldBatch)).toBe(0);
    expect(goldSrcTextureScrollSpeed(scrolling, conveyorBatch)).toBe(512);

    const ordinary = parseBsp(
      makeBsp({
        textureName: 'ordinary',
        brushEntity: '"classname" "func_conveyor"\n"speed" "512"',
      }),
    );
    expect(
      goldSrcTextureScrollSpeed(
        ordinary,
        ordinary.batches.find((batch) => batch.modelIndex === 1)!,
      ),
    ).toBe(0);
  });

  it('decodes the render-color scroll speed used by other GoldSrc brush entities', () => {
    const world = parseBsp(
      makeBsp({
        textureName: 'scroll_fixture',
        brushEntity: '"classname" "func_wall"\n"rendercolor" "1 4 0"',
      }),
    );
    const batch = world.batches.find((candidate) => candidate.modelIndex === 1)!;
    expect(world.models[1]).toMatchObject({ textureScrollSpeed: -64 });
    expect(goldSrcTextureScrollSpeed(world, batch)).toBe(-64);
  });

  it('marks supported static solid brush models as player collision', () => {
    const world = parseBsp(
      makeBsp({
        collision: true,
        brushEntity: '"classname" "func_wall"',
      }),
    );
    expect(world.models[0]).toMatchObject({ collidable: true });
    expect(world.models[1]).toMatchObject({
      classname: 'func_wall',
      collidable: true,
    });
  });

  it('hides moving func_water brush models from static exhibits', () => {
    const world = parseBsp(
      makeBsp({
        brushEntity: '"classname" "func_water"\n"rendermode" "0"\n"spawnflags" "1"',
      }),
    );
    expect(world.models[1]).toMatchObject({
      visible: false,
      classname: 'func_water',
    });
  });

  it('rejects unsupported versions with a stable error code', () => {
    const bytes = makeBsp();
    new DataView(bytes.buffer).setUint32(0, 31, true);
    try {
      parseBsp(bytes);
      expect.fail('parseBsp should reject BSP31');
    } catch (error) {
      expect(error).toBeInstanceOf(WorldviewError);
      expect((error as WorldviewError).code).toBe('unsupported-bsp');
    }
  });

  it('rejects out-of-bounds lump ranges', () => {
    const bytes = makeBsp();
    new DataView(bytes.buffer).setUint32(4, bytes.length + 1, true);
    expect(() => parseBsp(bytes)).toThrow(/exceeds its source buffer/);
  });

  it('retains and traverses the static BSP trace tree for sound obstruction', () => {
    const world = parseBsp(makeBsp({ trace: true }));
    expect(traceWorldSegment(world.trace, [12, 0, 0], [16, 0, 0])).toEqual({
      blocked: false,
      crossesWaterBoundary: false,
    });
    expect(traceWorldSegment(world.trace, [12, 0, 0], [0, 0, 0]).blocked).toBe(true);
  });

  it('retains and sweeps the authored standing collision hull', () => {
    const world = parseBsp(makeBsp({ collision: true }));
    expect(world.collision?.clipnodes).toEqual(new Int32Array([0, -1, -2]));
    const trace = tracePlayerHull(world, [8, 8, 50], [8, 8, 20]);
    expect(trace).toMatchObject({
      modelIndex: 0,
      startSolid: false,
      allSolid: false,
      planeNormal: [0, 0, 1],
    });
    expect(trace.fraction).toBeCloseTo(0.465_625);
    expect(trace.endPosition[2]).toBeCloseTo(36.031_25);
  });

  it('walks, jumps, and lands against a BSP standing hull at a fixed command step', () => {
    const world = parseBsp(makeBsp({ collision: true }));
    let state = createGoldSrcMovementState([8, 8, 36.031_25]);
    let result = moveGoldSrcPlayer(
      world,
      state,
      { forward: 1, side: 0, yaw: 0, jump: false },
      0.01,
    );
    state = result.state;
    expect(state.onGround).toBe(true);
    expect(state.origin[0]).toBeGreaterThan(8);

    result = moveGoldSrcPlayer(world, state, { forward: 1, side: 0, yaw: 0, jump: true }, 0.01);
    state = result.state;
    expect(result.jumped).toBe(true);
    expect(state.onGround).toBe(false);
    expect(state.velocity[2]).toBeGreaterThan(250);

    let landed = false;
    for (let index = 0; index < 100 && !landed; index += 1) {
      result = moveGoldSrcPlayer(world, state, { forward: 0, side: 0, yaw: 0, jump: false }, 0.01);
      state = result.state;
      landed = result.landed;
    }
    expect(landed).toBe(true);
    expect(state.onGround).toBe(true);
    expect(state.origin[2]).toBeCloseTo(36.031_25);
  });

  it('matches the stock GoldSrc ground acceleration and friction response', () => {
    const world = parseBsp(makeBsp({ collision: true }));
    let state = createGoldSrcMovementState([8, 8, 36.031_25]);
    let result = moveGoldSrcPlayer(
      world,
      state,
      { forward: 1, side: 0, yaw: 0, jump: false },
      0.01,
    );
    state = result.state;
    expect(state.velocity[0]).toBeCloseTo(32);

    result = moveGoldSrcPlayer(world, state, { forward: 0, side: 0, yaw: 0, jump: false }, 0.01);
    expect(result.state.velocity[0]).toBeCloseTo(28);
  });

  it('finds the rendered texture below the player for footstep material selection', () => {
    const world = parseBsp(makeBsp({ collision: true, textureName: 'court_tile' }));
    expect(surfaceTextureBelow(world, [8, 8, 36])).toBe('court_tile');
  });

  it('detects open-to-liquid sound trace boundaries', () => {
    const trace = {
      planes: new Float32Array([1, 0, 0, 0]),
      nodes: new Int32Array([0, -1, -2]),
      leafContents: new Int32Array([-1, -3]),
      headNode: 0,
    };
    expect(traceWorldSegment(trace, [1, 0, 0], [-1, 0, 0])).toEqual({
      blocked: false,
      crossesWaterBoundary: true,
    });
  });

  it('selects only visible in-range env_sound entities and preserves the previous room otherwise', () => {
    const world = parseBsp(
      makeBsp({
        trace: true,
        entityText:
          '{ "classname" "worldspawn" }\n{ "classname" "env_sound" "origin" "12 0 0" "radius" "32" "roomtype" "5" }',
      }),
    );
    expect(selectEnvSoundRoom(world, [16, 0, 0], 0)).toBe(5);
    expect(selectEnvSoundRoom(world, [0, 0, 0], 3)).toBe(3);
  });
});

describe('player controls', () => {
  it('defaults to walking, emits surface-sound cues, and toggles noclip with V', () => {
    const listeners = new Map<string, EventListener[]>();
    const canvas = {
      tabIndex: 0,
      getAttribute: () => null,
      setAttribute: () => undefined,
      removeAttribute: () => undefined,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener !== 'function') return;
        const registered = listeners.get(type) ?? [];
        registered.push(listener);
        listeners.set(type, registered);
      },
      removeEventListener: () => undefined,
    } as unknown as HTMLCanvasElement;
    const dispatchKey = (code: string) => {
      const event = {
        code,
        repeat: false,
        preventDefault: () => undefined,
      } as KeyboardEvent;
      for (const listener of listeners.get('keydown') ?? []) listener(event);
    };
    const world = parseBsp(makeBsp({ collision: true }));
    const camera = new WorldCamera();
    camera.update({ position: [8, 8, 64.031_25] });
    const sounds: PlayerSoundEvent[] = [];
    const modes: string[] = [];
    const controls = new WorldControls(
      canvas,
      'walk',
      () => undefined,
      (mode) => modes.push(mode),
      (event) => sounds.push(event),
    );
    expect(controls.setWorld(world, camera)).toBe(false);
    expect(controls.mode).toBe('walk');

    dispatchKey('KeyW');
    for (let command = 0; command < 80; command += 1) controls.update(camera, 0.01);
    expect(sounds.some((sound) => sound.kind === 'step')).toBe(true);

    dispatchKey('Space');
    controls.update(camera, 0.01);
    expect(sounds.some((sound) => sound.kind === 'jump')).toBe(true);

    dispatchKey('KeyV');
    controls.update(camera, 0.01);
    expect(controls.mode).toBe('fly');
    dispatchKey('KeyV');
    controls.update(camera, 0.01);
    expect(controls.mode).toBe('walk');
    expect(modes).toEqual(['fly', 'walk']);
    controls.dispose();
  });

  it('uses the Counter-Strike player speed cap for maps with CS entities', () => {
    const canvas = {
      tabIndex: 0,
      getAttribute: () => null,
      setAttribute: () => undefined,
      removeAttribute: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as HTMLCanvasElement;
    const world = parseBsp(
      makeBsp({
        collision: true,
        entityText: '{ "classname" "worldspawn" }\n{ "classname" "func_buyzone" "model" "*1" }',
      }),
    );
    const camera = new WorldCamera();
    camera.update({ position: [8, 8, 64.031_25] });
    const controls = new WorldControls(
      canvas,
      'walk',
      () => undefined,
      () => undefined,
      () => undefined,
    );
    controls.setWorld(world, camera);
    expect(controls.settings.maxSpeed).toBe(250);
    controls.setSettings({ maxSpeed: 275, friction: 6 });
    expect(controls.settings).toMatchObject({ maxSpeed: 275, friction: 6 });
    controls.dispose();
  });

  it('applies GoldSrc sensitivity and custom mouse acceleration to pointer input', () => {
    const listeners = new Map<string, EventListener>();
    const canvas = {
      tabIndex: 0,
      getAttribute: () => null,
      setAttribute: () => undefined,
      removeAttribute: () => undefined,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') listeners.set(type, listener);
      },
      removeEventListener: () => undefined,
    } as unknown as HTMLCanvasElement;
    let look: { yaw: number; pitch: number } | undefined;
    const controls = new WorldControls(
      canvas,
      'walk',
      (nextLook) => {
        look = nextLook;
      },
      () => undefined,
      () => undefined,
      { mouseSensitivity: 3, mouseAcceleration: 0.04 },
    );
    vi.stubGlobal('document', { pointerLockElement: canvas });
    listeners.get('mousemove')?.({
      movementX: 10,
      movementY: -5,
    } as unknown as MouseEvent);
    const sensitivity = 3 + Math.hypot(10, -5) * 0.04;
    const radiansPerCount = (0.022 * sensitivity * Math.PI) / 180;
    expect(look?.yaw).toBeCloseTo(-10 * radiansPerCount);
    expect(look?.pitch).toBeCloseTo(5 * radiansPerCount);
    controls.dispose();
    vi.unstubAllGlobals();
  });
});
