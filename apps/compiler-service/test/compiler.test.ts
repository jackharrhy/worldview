import { describe, expect, it } from 'vitest';

import { safeAssetName, safeMapName, stageArguments } from '../src/compiler.js';
import { configuredLaunchProfile } from '../src/launch.js';

describe('native compiler planning', () => {
  it('uses fast vis and bounded light work for preview compiles', () => {
    const stages = stageArguments(
      'preview',
      '/tmp/preview.map',
      '/tmp/preview.bsp',
      { maxThreads: 2 },
      '/tmp/assets',
    );

    expect(stages.map((stage) => stage.stage)).toEqual(['qbsp', 'vis', 'light']);
    expect(stages[0]?.args).toContain('/tmp/preview.map');
    expect(stages[0]?.args).toContain('-nofill');
    expect(stages[0]?.args).toEqual(expect.arrayContaining(['-wadpath', '/tmp/assets']));
    expect(stages[1]?.args).toContain('-fast');
    expect(stages[2]?.args).toEqual(
      expect.arrayContaining(['-threads', '2', '-gate', '1', '/tmp/preview.bsp']),
    );
  });

  it('uses detailed vis and extra light sampling for final compiles', () => {
    const stages = stageArguments('final', '/tmp/final.map', '/tmp/final.bsp', {
      maxThreads: 4,
      gameDirectory: '/srv/quake',
    });

    expect(stages[1]?.args).not.toContain('-fast');
    expect(stages[0]?.args).not.toContain('-nofill');
    expect(stages[2]?.args).toContain('-extra');
    expect(stages.every((stage) => stage.args.includes('/srv/quake'))).toBe(true);
  });

  it('rejects names that could escape the isolated compile directory', () => {
    expect(safeMapName('test_map-01')).toBe('test_map-01');
    expect(() => safeMapName('../outside')).toThrow(/mapName/);
    expect(() => safeMapName('name with spaces')).toThrow(/mapName/);
    expect(safeAssetName('textures.wad')).toBe('textures.wad');
    expect(() => safeAssetName('../textures.wad')).toThrow(/Asset names/);
    expect(() => safeAssetName('payload.sh')).toThrow(/unsupported extension/);
  });

  it('accepts launch configuration only from machine-local absolute paths', () => {
    expect(
      configuredLaunchProfile({
        WORLDVIEW_LAUNCH_EXECUTABLE: '/games/quake',
        WORLDVIEW_LAUNCH_WORKING_DIRECTORY: '/games',
        WORLDVIEW_LAUNCH_MAP_DIRECTORY: '/games/id1/maps',
        WORLDVIEW_LAUNCH_ARGS_JSON: '["+map","%MAP%"]',
      }),
    ).toMatchObject({
      profileId: 'default-launch',
      arguments: ['+map', '%MAP%'],
      game: 'quake',
    });
    expect(() =>
      configuredLaunchProfile({
        WORLDVIEW_LAUNCH_EXECUTABLE: 'quake',
        WORLDVIEW_LAUNCH_WORKING_DIRECTORY: '/games',
        WORLDVIEW_LAUNCH_MAP_DIRECTORY: '/games/id1/maps',
      }),
    ).toThrow(/absolute paths/);
  });
});
