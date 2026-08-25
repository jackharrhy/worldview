import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

export type CompileQuality = 'preview' | 'final';

export interface NativeCompilerRequest {
  readonly mapName: string;
  readonly mapText: string;
  readonly quality: CompileQuality;
  readonly expectedDocumentRevision: number;
  readonly assets?: readonly NativeCompilerAsset[];
}

export interface NativeCompilerAsset {
  readonly name: string;
  readonly mediaType: string;
  readonly base64: string;
}

export interface NativeCompilerConfig {
  readonly qbsp: string;
  readonly vis: string;
  readonly light: string;
  readonly gameDirectory?: string;
  readonly maxThreads: number;
  readonly timeoutMilliseconds: number;
  readonly maxLogBytes: number;
}

export interface NativeCompileDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly stage: string;
  readonly message: string;
}

export interface NativeCompilerResult {
  readonly sourceDocumentRevision: number;
  readonly diagnostics: readonly NativeCompileDiagnostic[];
  readonly artifacts: readonly {
    name: string;
    mediaType: string;
    base64: string;
  }[];
  readonly elapsedMilliseconds: number;
}

interface StageResult {
  readonly stage: string;
  readonly output: string;
}

export class NativeCompileError extends Error {
  public constructor(
    public readonly stage: string,
    message: string,
    public readonly output: string,
  ) {
    super(message);
    this.name = 'NativeCompileError';
  }
}

export function safeMapName(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(value)) {
    throw new Error('mapName must contain 1-64 ASCII letters, digits, underscores, or hyphens');
  }
  return value;
}

export function safeAssetName(value: string): string {
  if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(value) || value === '.' || value === '..') {
    throw new Error('Asset names must be safe basenames containing 1-128 ASCII token characters');
  }
  const extension = value.toLowerCase().split('.').at(-1);
  if (!extension || !['wad', 'lmp', 'pal', 'rad', 'png', 'tga'].includes(extension)) {
    throw new Error(`Asset ${value} has an unsupported extension`);
  }
  return value;
}

export function stageArguments(
  quality: CompileQuality,
  mapPath: string,
  bspPath: string,
  config: Pick<NativeCompilerConfig, 'gameDirectory' | 'maxThreads'>,
  assetDirectory?: string,
): readonly { readonly stage: 'qbsp' | 'vis' | 'light'; readonly args: readonly string[] }[] {
  const paths = [
    '-nodefaultpaths',
    ...(config.gameDirectory ? ['-gamedir', config.gameDirectory] : []),
    ...(assetDirectory ? ['-path', assetDirectory] : []),
  ];
  const common = ['-nolog', '-nocolor', '-threads', String(config.maxThreads), ...paths];
  return [
    {
      stage: 'qbsp',
      args: [
        ...common,
        ...(assetDirectory ? ['-wadpath', assetDirectory] : []),
        ...(quality === 'preview' ? ['-nofill'] : []),
        mapPath,
        bspPath,
      ],
    },
    { stage: 'vis', args: [...common, ...(quality === 'preview' ? ['-fast'] : []), bspPath] },
    {
      stage: 'light',
      args: [...common, ...(quality === 'preview' ? ['-gate', '1'] : ['-extra']), bspPath],
    },
  ];
}

function abortError(): Error {
  return Object.assign(new Error('Compilation cancelled'), { name: 'AbortError' });
}

async function runStage(
  stage: string,
  executable: string,
  args: readonly string[],
  workingDirectory: string,
  config: Pick<NativeCompilerConfig, 'maxLogBytes' | 'timeoutMilliseconds'>,
  signal?: AbortSignal,
): Promise<StageResult> {
  if (signal?.aborted) throw abortError();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: workingDirectory,
      env: { PATH: process.env.PATH ?? '' },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let timedOut = false;
    let settled = false;
    const append = (chunk: Buffer) => {
      if (output.length >= config.maxLogBytes) return;
      output += chunk.toString('utf8').slice(0, config.maxLogBytes - output.length);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, config.timeoutMilliseconds);
    const cancel = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', cancel, { once: true });
    const finish = (error?: Error, result?: StageResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve(result!);
    };
    child.once('error', (error) => finish(new NativeCompileError(stage, error.message, output)));
    child.once('close', (code, closeSignal) => {
      if (signal?.aborted) finish(abortError());
      else if (timedOut) {
        finish(
          new NativeCompileError(
            stage,
            `${stage} exceeded the ${config.timeoutMilliseconds}ms timeout`,
            output,
          ),
        );
      } else if (code !== 0) {
        finish(
          new NativeCompileError(
            stage,
            `${stage} exited with ${code ?? closeSignal ?? 'an unknown status'}`,
            output,
          ),
        );
      } else finish(undefined, { stage, output });
    });
  });
}

export async function compileNativeMap(
  request: NativeCompilerRequest,
  config: NativeCompilerConfig,
  signal?: AbortSignal,
): Promise<NativeCompilerResult> {
  const started = performance.now();
  const mapName = safeMapName(request.mapName);
  const workingDirectory = await mkdtemp(join(tmpdir(), 'worldview-compile-'));
  const expectedPrefix = join(tmpdir(), 'worldview-compile-');
  if (!workingDirectory.startsWith(expectedPrefix)) {
    throw new Error('Refusing to use an unexpected compiler working directory');
  }
  const mapPath = join(workingDirectory, `${mapName}.map`);
  const bspPath = join(workingDirectory, `${mapName}.bsp`);
  const assetDirectory = request.assets?.length ? join(workingDirectory, 'assets') : undefined;
  const commands = { qbsp: config.qbsp, vis: config.vis, light: config.light } as const;
  try {
    await writeFile(mapPath, request.mapText, { encoding: 'utf8', flag: 'wx' });
    if (assetDirectory && request.assets) {
      await mkdir(assetDirectory);
      for (const asset of request.assets) {
        if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(asset.base64)) {
          throw new Error(`Asset ${asset.name} is not valid base64`);
        }
        await writeFile(
          join(assetDirectory, safeAssetName(asset.name)),
          Buffer.from(asset.base64, 'base64'),
          {
            flag: 'wx',
          },
        );
      }
    }
    const stages: StageResult[] = [];
    for (const stage of stageArguments(request.quality, mapPath, bspPath, config, assetDirectory)) {
      stages.push(
        await runStage(
          stage.stage,
          commands[stage.stage],
          stage.args,
          workingDirectory,
          config,
          signal,
        ),
      );
    }
    const bsp = await readFile(bspPath);
    return {
      sourceDocumentRevision: request.expectedDocumentRevision,
      diagnostics: stages.map(({ stage, output }) => ({
        severity: 'info',
        stage,
        message: output.trim() || `${stage} completed`,
      })),
      artifacts: [
        {
          name: basename(bspPath),
          mediaType: 'application/x-quake-bsp',
          base64: bsp.toString('base64'),
        },
      ],
      elapsedMilliseconds: performance.now() - started,
    };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}
