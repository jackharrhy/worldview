import { describe, expect, it } from 'vitest';

import { NativeCompileError, safeAssetName, safeMapName, stageArguments } from '../src/compiler.js';
import { configuredLaunchProfile } from '../src/launch.js';
import {
  BoundedBuildHistory,
  helperCapabilities,
  originAllowed,
  parseCompileRequest,
  parseLaunchRequest,
} from '../src/protocol.js';

function successfulBuild(buildId: string, revision: number) {
  return {
    status: 'succeeded' as const,
    buildId,
    sourceDocumentRevision: revision,
    diagnostics: [],
    artifacts: [
      {
        name: 'test.bsp',
        mediaType: 'application/x-quake-bsp',
        base64: 'AQID',
        kind: 'bsp' as const,
      },
    ],
    logs: [],
    elapsedMilliseconds: 1,
  };
}

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

  it('retains bounded-log truncation metadata when a compiler stage fails', () => {
    const error = new NativeCompileError('qbsp', 'qbsp failed', 'bounded output', true);

    expect(error).toMatchObject({
      stage: 'qbsp',
      output: 'bounded output',
      truncated: true,
    });
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

  it('enforces loopback origin and configured-profile request boundaries', () => {
    const origins = new Set(['http://127.0.0.1:5174']);
    expect(originAllowed(undefined, origins)).toBe(true);
    expect(originAllowed('http://127.0.0.1:5174', origins)).toBe(true);
    expect(originAllowed('https://untrusted.invalid', origins)).toBe(false);
    expect(() =>
      parseCompileRequest({
        mapName: 'test',
        mapText: '{}',
        quality: 'preview',
        expectedDocumentRevision: 1,
        profileId: 'arbitrary-command',
      }),
    ).toThrow(/Unknown compile profile/);
  });

  it('sanitizes browser requests to data and safe profile identifiers', () => {
    const compile = parseCompileRequest({
      mapName: 'test',
      mapText: '{}',
      quality: 'final',
      expectedDocumentRevision: 9,
      profileId: 'default',
      executable: '/tmp/untrusted',
      arguments: ['--delete-everything'],
    });
    const launch = parseLaunchRequest({
      buildId: 'build-1',
      profileId: 'launch-1',
      expectedDocumentRevision: 9,
      executable: '/tmp/untrusted',
    });

    expect(compile).toEqual({
      mapName: 'test',
      mapText: '{}',
      quality: 'final',
      expectedDocumentRevision: 9,
      profileId: 'default',
    });
    expect(launch).toEqual({
      buildId: 'build-1',
      profileId: 'launch-1',
      expectedDocumentRevision: 9,
    });
  });

  it('advertises only configured capabilities and bounds launchable build retention', () => {
    expect(helperCapabilities(false, 'quake', null)).toEqual({
      protocolVersion: 1,
      compileProfiles: [],
      launchProfiles: [],
    });
    expect(helperCapabilities(true, 'goldsrc', null).compileProfiles[0]).toMatchObject({
      id: 'default',
      game: 'goldsrc',
      qualities: ['preview', 'final'],
    });

    const history = new BoundedBuildHistory(2);
    const request = parseCompileRequest({
      mapName: 'test',
      mapText: '{}',
      quality: 'preview',
      expectedDocumentRevision: 1,
    });
    history.remember(request, successfulBuild('one', 1));
    history.remember(request, successfulBuild('two', 2));
    history.remember(request, successfulBuild('three', 3));

    expect(history.get('one')).toBeUndefined();
    expect(history.get('three')).toMatchObject({ sourceDocumentRevision: 3 });
  });
});
