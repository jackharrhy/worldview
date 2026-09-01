import type { CameraState } from '@jackharrhy/worldview';
import localFixtureDefinitions from 'virtual:worldview-local-fixtures';

import {
  syntheticGoldSrcAudioBsp,
  syntheticGoldSrcBsp,
  syntheticGoldSrcPlayerSounds,
  syntheticGoldSrcSkybox,
  syntheticGoldSrcSkyBsp,
  syntheticGoldSrcSprite,
  syntheticGoldSrcSpriteBsp,
  syntheticGoldSrcWave,
  syntheticQuakeBsp,
  syntheticQuakeBsp2,
  syntheticQuakePalette,
} from './synthetic.js';
import type { FixtureCameraDefinition, ViewerFixture } from './fixture-types.js';

function cameraState(camera: FixtureCameraDefinition | undefined): CameraState | undefined {
  if (!camera) return undefined;
  return {
    position: [...camera.position],
    yaw: (camera.yawDegrees * Math.PI) / 180,
    pitch: (camera.pitchDegrees * Math.PI) / 180,
    fieldOfView: camera.fieldOfView ?? 75,
  };
}

const builtInFixtures: readonly ViewerFixture[] = [
  {
    id: 'goldsrc',
    label: 'GoldSrc room',
    namespace: 'Synthetic',
    aliases: ['synthetic'],
    selectable: true,
    source: { bsp: syntheticGoldSrcBsp(), sounds: syntheticGoldSrcPlayerSounds() },
  },
  {
    id: 'alpha',
    label: 'Alpha fence',
    namespace: 'Synthetic',
    aliases: [],
    selectable: true,
    source: { bsp: syntheticGoldSrcBsp('{wv_fence') },
  },
  {
    id: 'water',
    label: 'Water',
    namespace: 'Synthetic',
    aliases: [],
    selectable: true,
    source: { bsp: syntheticGoldSrcBsp('!wv_water') },
  },
  {
    id: 'quake',
    label: 'Quake sky',
    namespace: 'Synthetic',
    aliases: [],
    selectable: true,
    source: { bsp: syntheticQuakeBsp(), palette: syntheticQuakePalette() },
  },
  {
    id: 'quake-bsp2',
    label: 'Quake BSP2',
    namespace: 'Synthetic',
    aliases: [],
    selectable: false,
    source: { bsp: syntheticQuakeBsp2(), palette: syntheticQuakePalette() },
  },
  {
    id: 'audio',
    label: 'Audio room',
    namespace: 'Synthetic',
    aliases: [],
    selectable: true,
    source: {
      bsp: syntheticGoldSrcAudioBsp(),
      sounds: {
        ...syntheticGoldSrcPlayerSounds(),
        'ambience/tone.wav': syntheticGoldSrcWave(),
        'music/tone.wav': syntheticGoldSrcWave(),
      },
    },
  },
  {
    id: 'goldsrc-sky',
    label: 'GoldSrc sky test',
    namespace: 'Synthetic',
    aliases: [],
    selectable: false,
    source: { bsp: syntheticGoldSrcSkyBsp(), skybox: syntheticGoldSrcSkybox() },
  },
  {
    id: 'sprite',
    label: 'GoldSrc sprite test',
    namespace: 'Synthetic',
    aliases: [],
    selectable: false,
    source: {
      bsp: syntheticGoldSrcSpriteBsp(),
      sprites: { 'sprites/fixture.spr': syntheticGoldSrcSprite() },
    },
  },
  {
    id: 'audio-decode-failure',
    label: 'Broken audio test',
    namespace: 'Synthetic',
    aliases: [],
    selectable: false,
    source: {
      bsp: syntheticGoldSrcAudioBsp(2),
      sounds: {
        'ambience/tone.wav': syntheticGoldSrcWave(),
        'music/tone.wav': new Uint8Array([0, 1, 2, 3]),
      },
    },
  },
];

const localFixtures: readonly ViewerFixture[] = localFixtureDefinitions.map((fixture) => {
  const result = {
    id: fixture.id,
    label: fixture.label,
    namespace: fixture.namespace ?? 'Local',
    aliases: fixture.aliases,
    selectable: true,
    source: {
      bsp: fixture.bsp,
      ...(fixture.gameAssets
        ? {
            gameAssets: fixture.gameAssets,
            ...(fixture.gameAssets['gfx/palette.lmp']
              ? { palette: fixture.gameAssets['gfx/palette.lmp'] }
              : {}),
          }
        : { gameBaseUrl: fixture.gameBaseUrl }),
    },
  };
  const camera = cameraState(fixture.camera);
  return Object.assign(result, {
    ...(camera ? { camera } : {}),
    ...(fixture.walkability ? { walkability: fixture.walkability } : {}),
  });
});

export const fixtures: readonly ViewerFixture[] = [...builtInFixtures, ...localFixtures];

export const selectableFixtures: readonly ViewerFixture[] = fixtures.filter(
  (fixture) => fixture.selectable,
);

export function fixtureById(id: string): ViewerFixture | undefined {
  return fixtures.find((fixture) => fixture.id === id || fixture.aliases.includes(id));
}
