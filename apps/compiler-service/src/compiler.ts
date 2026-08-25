import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type CompileQuality = 'preview' | 'final';

export interface NativeCompilerRequest {
  readonly mapName: string;
  readonly mapText: string;
  readonly quality: CompileQuality;
  readonly expectedDocumentRevision: number;
  readonly profileId?: string;
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
  readonly status: 'succeeded' | 'failed';
  readonly buildId: string;
  readonly sourceDocumentRevision: number;
  readonly diagnostics: readonly NativeCompileDiagnostic[];
  readonly artifacts: readonly {
    name: string;
    mediaType: string;
    base64: string;
    kind: 'bsp' | 'portal' | 'leak-path' | 'log' | 'other';
    stage?: string;
  }[];
  readonly logs: readonly { stage: string; text: string; truncated: boolean }[];
  readonly elapsedMilliseconds: number;
}

interface StageResult {
  readonly stage: string;
  readonly output: string;
  readonly truncated: boolean;
}

export class NativeCompileError extends Error {
  public constructor(
    public readonly stage: string,
    message: string,
    public readonly output: string,
    public readonly truncated = false,
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
    let truncated = false;
    let timedOut = false;
    let settled = false;
    const append = (chunk: Buffer) => {
      if (output.length >= config.maxLogBytes) {
        truncated = true;
        return;
      }
      const text = chunk.toString('utf8');
      const remaining = config.maxLogBytes - output.length;
      output += text.slice(0, remaining);
      truncated ||= text.length > remaining;
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
    child.once('error', (error) =>
      finish(new NativeCompileError(stage, error.message, output, truncated)),
    );
    child.once('close', (code, closeSignal) => {
      if (signal?.aborted) finish(abortError());
      else if (timedOut) {
        finish(
          new NativeCompileError(
            stage,
            `${stage} exceeded the ${config.timeoutMilliseconds}ms timeout`,
            output,
            truncated,
          ),
        );
      } else if (code !== 0) {
        finish(
          new NativeCompileError(
            stage,
            `${stage} exited with ${code ?? closeSignal ?? 'an unknown status'}`,
            output,
            truncated,
          ),
        );
      } else finish(undefined, { stage, output, truncated });
    });
  });
}

function diagnosticSeverity(line: string): NativeCompileDiagnostic['severity'] {
  if (/\b(?:error|fatal|leak(?:ed|ing)?)\b/i.test(line)) return 'error';
  if (/\bwarn(?:ing)?\b/i.test(line)) return 'warning';
  return 'info';
}

function stageDiagnostics(stage: string, output: string): readonly NativeCompileDiagnostic[] {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.length > 0 ? lines : [`${stage} completed`]).map((message) => ({
    severity: diagnosticSeverity(message),
    stage,
    message,
  }));
}

function artifactMetadata(name: string): {
  readonly kind: 'bsp' | 'portal' | 'leak-path' | 'log' | 'other';
  readonly mediaType: string;
  readonly stage?: string;
} {
  const extension = name.toLowerCase().split('.').at(-1);
  if (extension === 'bsp') return { kind: 'bsp', mediaType: 'application/x-quake-bsp' };
  if (extension === 'prt')
    return { kind: 'portal', mediaType: 'application/x-quake-portal', stage: 'qbsp' };
  if (extension === 'pts' || extension === 'lin') {
    return { kind: 'leak-path', mediaType: 'text/plain', stage: 'qbsp' };
  }
  if (extension === 'log') return { kind: 'log', mediaType: 'text/plain' };
  return { kind: 'other', mediaType: 'application/octet-stream' };
}

async function collectArtifacts(
  workingDirectory: string,
): Promise<NativeCompilerResult['artifacts']> {
  const names = await readdir(workingDirectory);
  const allowed = names.filter((name) => /\.(?:bsp|prt|pts|lin|log)$/i.test(name)).toSorted();
  return Promise.all(
    allowed.map(async (name) => {
      const metadata = artifactMetadata(name);
      const base64 = (await readFile(join(workingDirectory, name))).toString('base64');
      return metadata.stage
        ? {
            name,
            kind: metadata.kind,
            mediaType: metadata.mediaType,
            stage: metadata.stage,
            base64,
          }
        : { name, kind: metadata.kind, mediaType: metadata.mediaType, base64 };
    }),
  );
}

export async function compileNativeMap(
  request: NativeCompilerRequest,
  config: NativeCompilerConfig,
  signal?: AbortSignal,
): Promise<NativeCompilerResult> {
  const started = performance.now();
  const buildId = randomUUID();
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
    let failure: NativeCompileError | null = null;
    for (const stage of stageArguments(request.quality, mapPath, bspPath, config, assetDirectory)) {
      try {
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
      } catch (error) {
        if (error instanceof NativeCompileError) {
          failure = error;
          stages.push({ stage: error.stage, output: error.output, truncated: error.truncated });
          break;
        }
        throw error;
      }
    }
    const artifacts = await collectArtifacts(workingDirectory);
    const diagnostics = stages.flatMap(({ stage, output }) => stageDiagnostics(stage, output));
    if (failure) {
      diagnostics.push({ severity: 'error', stage: failure.stage, message: failure.message });
    } else if (!artifacts.some(({ kind }) => kind === 'bsp')) {
      diagnostics.push({
        severity: 'error',
        stage: 'compiler',
        message: 'Compiler produced no BSP artifact',
      });
    }
    const status =
      failure || !artifacts.some(({ kind }) => kind === 'bsp') ? 'failed' : 'succeeded';
    return {
      status,
      buildId,
      sourceDocumentRevision: request.expectedDocumentRevision,
      diagnostics,
      artifacts,
      logs: stages.map(({ stage, output, truncated }) => ({ stage, text: output, truncated })),
      elapsedMilliseconds: performance.now() - started,
    };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}
