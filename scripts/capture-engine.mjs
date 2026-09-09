#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { bspEntities, hash, vector } from './engine-capture/scene.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    engine: { type: 'string' },
    bsp: { type: 'string' },
    position: { type: 'string' },
    angles: { type: 'string', default: '0,0,0' },
    'game-root': { type: 'string' },
    output: { type: 'string' },
    image: { type: 'string', default: 'worldview-engine-capture:local' },
    width: { type: 'string', default: '800' },
    height: { type: 'string', default: '600' },
    fov: { type: 'string', default: '90' },
    timeout: { type: 'string', default: '90' },
    help: { type: 'boolean' },
  },
});

if (values.help) {
  console.log(`Capture a real engine frame in an isolated Linux container.

npm run engines:build
npm run engines:capture -- --engine qssm|xash --bsp /path/map.bsp --position x,y,z [options]

--position     Eye position in map coordinates, not the player/spawn origin
--angles       Engine pitch,yaw,roll in degrees (default 0,0,0; positive pitch looks down)
--game-root    Quake installation containing id1, or CS installation containing cstrike and valve
--output       New evidence directory (default artifacts/verification/engines/<timestamp>-<engine>)
--width/--height  Frame dimensions (default 800x600)
--fov          Quake FOV setting, 90–120 (default 90; CS captures require 90)
--timeout      Maximum engine runtime in seconds (default 90)
--image        Locally built capture image (default worldview-engine-capture:local)

Xash uses CS16Client and the supplied CS server DLL/assets. Camera-only spawn overrides are
written to a scratch .ent file; the input BSP and installation are mounted read-only.`);
} else {
  await capture().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

async function capture() {
  if (!['qssm', 'xash'].includes(values.engine) || !values.bsp || !values.position) {
    throw new Error('--engine, --bsp and --position are required; see --help');
  }
  const engine = values.engine;
  const position = vector(values.position, '--position');
  const angles = vector(values.angles, '--angles');
  if (Math.abs(angles[0]) > 89 || angles[2] !== 0)
    throw new Error('Use pitch between -89 and 89 and roll 0 for a stationary player camera');
  angles[1] = ((angles[1] % 360) + 360) % 360;
  const number = (key, min, max) => {
    const value = Number(values[key]);
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`--${key} must be an integer from ${min} to ${max}`);
    return value;
  };
  const viewport = {
    width: number('width', 320, 4096),
    height: number('height', 240, 4096),
    fov: number('fov', 90, 120),
  };
  if (engine === 'xash' && viewport.fov !== 90)
    throw new Error('CS captures require --fov 90; the CS server overrides default_fov');
  const timeout = number('timeout', 10, 300);
  const bsp = await realpath(resolve(values.bsp));
  const gameRoot = await realpath(
    resolve(
      values['game-root'] ??
        join(root, 'apps/viewer/public/local/steam-installs', engine === 'xash' ? '10' : '2310'),
    ),
  );
  const output = resolve(
    values.output ??
      join(
        root,
        'artifacts/verification/engines',
        `${new Date().toISOString().replaceAll(':', '-')}-${engine}`,
      ),
  );
  if (output === gameRoot || output.startsWith(gameRoot + sep))
    throw new Error('Evidence must be outside the game installation');
  for (const path of [bsp, gameRoot, output])
    if (path.includes(',')) throw new Error('Docker bind paths cannot contain commas');
  const bytes = await readFile(bsp);
  bspEntities(bytes, engine);
  const { stdout: inspected } = await exec('docker', [
    'image',
    'inspect',
    values.image,
    '--format',
    '{{.Id}}',
  ]).catch(() => {
    throw new Error('Capture image is unavailable; run npm run engines:build first');
  });
  await mkdir(dirname(output), { recursive: true });
  const actualOutput = join(await realpath(dirname(output)), basename(output));
  if (actualOutput === gameRoot || actualOutput.startsWith(gameRoot + sep))
    throw new Error('Evidence must be outside the game installation');
  await mkdir(output);
  const request = {
    engine,
    position,
    angles,
    viewport,
    timeout,
    input: { bsp, gameRoot, sha256: hash(bytes), bytes: bytes.length },
    image: { name: values.image, id: inspected.trim() },
  };
  if (engine === 'qssm') {
    const litPath = join(dirname(bsp), basename(bsp, extname(bsp)) + '.lit');
    const lit = await readFile(litPath).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (lit) request.input.lit = { path: litPath, sha256: hash(lit), bytes: lit.length };
  }
  await writeFile(join(output, 'request.json'), JSON.stringify(request, null, 2) + '\n');
  const name = `worldview-capture-${randomUUID()}`;
  const args = [
    'run',
    '--platform',
    'linux/amd64',
    '--rm',
    '--init',
    '--read-only',
    '--network',
    'none',
    '--name',
    name,
    '--shm-size',
    '256m',
    '--tmpfs',
    '/tmp:rw,exec,size=256m',
  ];
  if (process.getuid) args.push('--user', `${process.getuid()}:${process.getgid()}`);
  if (request.input.lit)
    args.push('--mount', `type=bind,src=${request.input.lit.path},dst=/input/map.lit,readonly`);
  args.push(
    '--mount',
    `type=bind,src=${gameRoot},dst=/games,readonly`,
    '--mount',
    `type=bind,src=${bsp},dst=/input/map.bsp,readonly`,
    '--mount',
    `type=bind,src=${output},dst=/output`,
    values.image,
    'xvfb-run',
    '-a',
    '-e',
    '/output/xvfb.log',
    '-s',
    `-screen 0 ${viewport.width}x${viewport.height}x24`,
    'node',
    '/opt/capture/run.mjs',
  );
  console.log(`Capturing ${engine}: ${output}`);
  const child = spawn('docker', args, { stdio: 'inherit' });
  const stop = () => {
    void exec('docker', ['stop', '-t', '2', name]).catch(() => {});
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const timer = setTimeout(stop, (timeout + 20) * 1000);
  try {
    const code = await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('exit', done);
    });
    if (code !== 0)
      throw new Error(
        `Engine capture failed. Inspect ${join(output, 'engine.log')} and report.json`,
      );
    console.log(`Screenshot: ${join(output, 'capture.png')}`);
    console.log(`Camera/settings: ${join(output, 'report.json')}`);
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await exec('docker', ['rm', '-f', name]).catch(() => {});
  }
}
