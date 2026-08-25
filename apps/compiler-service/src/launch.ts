import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { safeMapName } from './compiler.js';

export interface NativeLaunchConfig {
  readonly profileId: string;
  readonly label: string;
  readonly game: 'quake' | 'goldsrc';
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly workingDirectory: string;
  readonly mapDirectory: string;
}

export interface LaunchableBuild {
  readonly buildId: string;
  readonly mapName: string;
  readonly sourceDocumentRevision: number;
  readonly bspBase64: string;
}

export interface NativeLaunchResult {
  readonly buildId: string;
  readonly profileId: string;
  readonly sourceDocumentRevision: number;
  readonly launchedAt: number;
}

export function configuredLaunchProfile(environment: NodeJS.ProcessEnv): NativeLaunchConfig | null {
  const executable = environment.WORLDVIEW_LAUNCH_EXECUTABLE?.trim();
  const workingDirectory = environment.WORLDVIEW_LAUNCH_WORKING_DIRECTORY?.trim();
  const mapDirectory = environment.WORLDVIEW_LAUNCH_MAP_DIRECTORY?.trim();
  if (!executable || !workingDirectory || !mapDirectory) return null;
  if (![executable, workingDirectory, mapDirectory].every(isAbsolute)) {
    throw new Error('Configured launch executable and directories must be absolute paths');
  }
  const rawArguments = environment.WORLDVIEW_LAUNCH_ARGS_JSON ?? '[]';
  const argumentsValue: unknown = JSON.parse(rawArguments);
  if (!Array.isArray(argumentsValue) || argumentsValue.some((value) => typeof value !== 'string')) {
    throw new Error('WORLDVIEW_LAUNCH_ARGS_JSON must be a JSON array of strings');
  }
  return {
    profileId: environment.WORLDVIEW_LAUNCH_PROFILE_ID?.trim() || 'default-launch',
    label: environment.WORLDVIEW_LAUNCH_PROFILE_LABEL?.trim() || 'Local game',
    game: environment.WORLDVIEW_GAME_PROFILE === 'goldsrc' ? 'goldsrc' : 'quake',
    executable,
    arguments: argumentsValue,
    workingDirectory,
    mapDirectory,
  };
}

export async function launchBuild(
  build: LaunchableBuild,
  profile: NativeLaunchConfig,
): Promise<NativeLaunchResult> {
  const mapName = safeMapName(build.mapName);
  await mkdir(profile.mapDirectory, { recursive: true });
  const destination = join(profile.mapDirectory, `${mapName}.bsp`);
  const temporary = join(profile.mapDirectory, `.${mapName}.${randomUUID()}.tmp`);
  await writeFile(temporary, Buffer.from(build.bspBase64, 'base64'), { flag: 'wx' });
  await rename(temporary, destination);

  const child = spawn(
    profile.executable,
    profile.arguments.map((argument) => argument.replaceAll('%MAP%', mapName)),
    {
      cwd: profile.workingDirectory,
      detached: true,
      env: { PATH: process.env.PATH ?? '' },
      shell: false,
      stdio: 'ignore',
    },
  );
  child.unref();
  return {
    buildId: build.buildId,
    profileId: profile.profileId,
    sourceDocumentRevision: build.sourceDocumentRevision,
    launchedAt: Date.now(),
  };
}
