import { describe, expect, it, vi } from 'vitest';

import { loadWorldAssets, resolveWorldSource } from '../src/viewer/assets.js';
import { makeBsp, makeMipTexture, makeSprite, makeTga, makeWad, makeWave } from './fixtures.js';

function assetContext() {
  return {
    fetch: async () => new Response('not found', { status: 404 }),
    signal: new AbortController().signal,
    progress: () => undefined,
  };
}

describe('asset resolution', () => {
  it('requires an external palette for BSP29', async () => {
    await expect(
      loadWorldAssets({ bsp: makeBsp({ version: 29 }) }, assetContext()),
    ).rejects.toMatchObject({ code: 'missing-palette' });
  });

  it('starts independent sprite and sound resolvers concurrently', async () => {
    const started = new Set<string>();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const loading = loadWorldAssets(
      {
        bsp: makeBsp({
          entityText:
            '{ "classname" "worldspawn" }\n{ "classname" "env_sprite" "model" "sprites/test.spr" }\n{ "classname" "ambient_generic" "message" "ambience/test.wav" }',
        }),
        resolveSprite: async () => {
          started.add('sprite');
          await gate;
          return makeSprite();
        },
        resolveSound: async (reference) => {
          if (reference.normalizedPath !== 'ambience/test.wav') return null;
          started.add('sound');
          await gate;
          return makeWave();
        },
      },
      assetContext(),
    );
    await vi.waitFor(() => expect(started).toEqual(new Set(['sprite', 'sound'])));
    release();
    const loaded = await loading;
    expect(loaded.sprites).toHaveLength(1);
    expect(loaded.sounds.size).toBe(1);
  });

  it('prefers embedded textures over explicit WADs', async () => {
    const replacement = makeMipTexture(30, 'brick');
    replacement[40] = 211;
    const loaded = await loadWorldAssets(
      { bsp: makeBsp(), wads: [makeWad(3, replacement, 'brick')] },
      assetContext(),
    );
    expect(loaded.textureData.get(0)?.[40]).toBe(0);
  });

  it('uses explicit WADs in caller order for external textures', async () => {
    const first = makeMipTexture(30, 'brick');
    const second = makeMipTexture(30, 'brick');
    first[40] = 31;
    second[40] = 97;
    const loaded = await loadWorldAssets(
      {
        bsp: makeBsp({ embeddedTexture: false }),
        wads: [makeWad(3, first, 'brick'), makeWad(3, second, 'brick')],
      },
      assetContext(),
    );
    expect(loaded.textureData.get(0)?.[40]).toBe(31);
    expect(loaded.missingTextures).toEqual([]);
  });

  it('loads all six GoldSrc skybox faces from explicit TGA sources', async () => {
    const face = makeTga();
    const loaded = await loadWorldAssets(
      {
        bsp: makeBsp({ entityText: '{ "classname" "worldspawn" "skyname" "space" }' }),
        skybox: { rt: face, bk: face, lf: face, ft: face, up: face, dn: face },
      },
      assetContext(),
    );
    expect(loaded.skybox).toMatchObject({ name: 'space' });
    expect(loaded.skybox?.sides.up).toMatchObject({ width: 2, height: 1 });
  });

  it('resolves and parses sprite entities from explicit caller assets', async () => {
    const loaded = await loadWorldAssets(
      {
        bsp: makeBsp({
          entityText:
            '{ "classname" "worldspawn" }\n{ "classname" "env_sprite" "model" "sprites/statue.spr" "origin" "10 20 30" "scale" "0.5" "rendermode" "2" }',
        }),
        sprites: { 'statue.spr': makeSprite() },
      },
      assetContext(),
    );
    expect(loaded.sprites[0]).toMatchObject({
      entityIndex: 1,
      origin: [10, 20, 30],
      scale: 0.5,
      renderMode: 2,
    });
    expect(loaded.missingSprites).toEqual([]);
  });

  it('samples the BSP lightmap below eligible alpha-test sprites', async () => {
    const loaded = await loadWorldAssets(
      {
        bsp: makeBsp({
          entityText:
            '{ "classname" "worldspawn" }\n{ "classname" "env_sprite" "model" "sprites/lit.spr" "origin" "8 8 30" "rendermode" "2" "renderamt" "255" }',
        }),
        sprites: { 'lit.spr': makeSprite() },
      },
      assetContext(),
    );
    expect(loaded.sprites[0]).toMatchObject({
      receivesLight: true,
      lightColor: [128, 128, 128],
    });
  });

  it('warns once when a shared sprite cannot be resolved', async () => {
    const loaded = await loadWorldAssets(
      {
        bsp: makeBsp({
          entityText:
            '{ "classname" "worldspawn" }\n{ "classname" "env_glow" "model" "sprites/missing.spr" }\n{ "classname" "env_sprite" "model" "sprites/missing.spr" }',
        }),
      },
      assetContext(),
    );
    expect(loaded.sprites).toEqual([]);
    expect(loaded.missingSprites).toEqual(['sprites/missing.spr']);
    expect(loaded.warnings.filter((warning) => warning.code === 'missing-sprite')).toHaveLength(1);
  });

  it('loads each shared ambient WAV once from explicit caller assets', async () => {
    const loaded = await loadWorldAssets(
      {
        bsp: makeBsp({
          entityText:
            '{ "classname" "worldspawn" }\n{ "classname" "ambient_generic" "message" "Ambience/hum.wav" }\n{ "classname" "ambient_generic" "message" "ambience/HUM.wav" }',
        }),
        sounds: { 'hum.wav': makeWave() },
      },
      assetContext(),
    );
    expect(loaded.sounds.size).toBe(1);
    expect(loaded.missingSounds).toEqual([]);
  });

  it('loads supplied GoldSrc player samples separately from ambient emitters', async () => {
    const loaded = await loadWorldAssets(
      {
        bsp: makeBsp(),
        sounds: {
          'player/pl_step1.wav': makeWave(),
          'player/pl_step2.wav': makeWave(),
        },
      },
      assetContext(),
    );
    expect(loaded.sounds.size).toBe(0);
    expect([...loaded.playerSounds.keys()]).toEqual(['player/pl_step1.wav', 'player/pl_step2.wav']);
    expect(loaded.missingSounds).toEqual([]);
  });

  it('keeps ambient_music encoded for browser codec decoding', async () => {
    const encoded = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0]);
    const loaded = await loadWorldAssets(
      {
        bsp: makeBsp({
          entityText:
            '{ "classname" "worldspawn" }\n{ "classname" "ambient_music" "message" "music/theme.mp3" }',
        }),
        sounds: { 'theme.mp3': encoded },
      },
      assetContext(),
    );
    expect(new Uint8Array(loaded.music.get('music/theme.mp3')!.data)).toEqual(encoded);
    expect(loaded.sounds.size).toBe(0);
    expect(loaded.missingMusic).toEqual([]);
  });

  it('warns once when a shared ambient WAV cannot be resolved', async () => {
    const loaded = await loadWorldAssets(
      {
        bsp: makeBsp({
          entityText:
            '{ "classname" "worldspawn" }\n{ "classname" "ambient_generic" "message" "missing.wav" }\n{ "classname" "ambient_generic" "message" "MISSING.wav" }',
        }),
      },
      assetContext(),
    );
    expect(loaded.missingSounds).toEqual(['missing.wav']);
    expect(loaded.warnings.filter((warning) => warning.code === 'missing-sound')).toHaveLength(1);
  });

  it('reports missing map music independently from positional sounds', async () => {
    const loaded = await loadWorldAssets(
      {
        bsp: makeBsp({
          entityText:
            '{ "classname" "worldspawn" }\n{ "classname" "ambient_music" "message" "missing.mp3" }',
        }),
      },
      assetContext(),
    );
    expect(loaded.missingMusic).toEqual(['missing.mp3']);
    expect(loaded.missingSounds).toEqual([]);
    expect(loaded.warnings[0]?.message).toContain('music missing.mp3');
  });
});

describe('game-root asset resolution', () => {
  it('derives the conventional game directories and keeps explicit overrides', () => {
    const source = resolveWorldSource({
      gameBaseUrl: 'https://example.test/cstrike/',
      bsp: 'maps/de_fixture.bsp',
      soundBaseUrl: 'https://cdn.example.test/audio/',
    });
    expect(String(source.bsp)).toBe('https://example.test/cstrike/maps/de_fixture.bsp');
    expect(String(source.wadBaseUrl)).toBe('https://example.test/cstrike/');
    expect(String(source.skyboxBaseUrl)).toBe('https://example.test/cstrike/gfx/env/');
    expect(String(source.spriteBaseUrl)).toBe('https://example.test/cstrike/');
    expect(String(source.soundBaseUrl)).toBe('https://cdn.example.test/audio/');
  });
});
