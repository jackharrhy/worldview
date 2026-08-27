import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import {
  collaborationEditsBetween,
  createBoxBrush,
  createSequentialIdFactory,
  createStarterDocument,
  insertBrush,
} from '@jackharrhy/worldview-editor/core';

const azuriteImage = process.env.AZURITE_IMAGE ?? 'mcr.microsoft.com/azure-storage/azurite:3.37.0';
const azuriteContainer = process.env.AZURITE_CONTAINER ?? 'worldview-celld-azurite';
const azuriteVolume = process.env.AZURITE_VOLUME ?? 'worldview-celld-azurite-data';
const account = 'devstoreaccount1';
const accountKey =
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
const celld = process.env.CELLD_BIN ?? join(homedir(), '.local', 'bin', 'celld');
const publicPort = Number(process.env.CELLD_TEST_PORT ?? 18080);
const internalPortA = Number(process.env.CELLD_TEST_INTERNAL_PORT_A ?? 19080);
const internalPortB = Number(process.env.CELLD_TEST_INTERNAL_PORT_B ?? 19081);
const runId = `${Date.now().toString(36)}-${process.pid}`;
const bucket = `worldview-celld-test-${runId}`;
const roomId = `fault-room-${runId}`;
const commonEnv = {
  ...process.env,
  AZURE_STORAGE_USE_EMULATOR: 'true',
  AZURE_STORAGE_ACCOUNT_NAME: account,
  CELLD_ESBUILD: join(process.cwd(), 'node_modules', '.bin', 'esbuild'),
};
const children = new Set();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: commonEnv,
    encoding: 'utf8',
    stdio: options.quiet ? 'pipe' : 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`,
    );
  }
  return result.stdout;
}

async function ensureAzurite() {
  const inspect = spawnSync('docker', ['inspect', azuriteContainer], { encoding: 'utf8' });
  if (inspect.status === 0) {
    const [container] = JSON.parse(inspect.stdout);
    if (container.Config.Image !== azuriteImage) {
      throw new Error(
        `${azuriteContainer} uses ${container.Config.Image}; expected ${azuriteImage}. Set AZURITE_CONTAINER to use a separate container.`,
      );
    }
    if (!container.State.Running) run('docker', ['start', azuriteContainer]);
  } else {
    run('docker', [
      'run',
      '--detach',
      '--name',
      azuriteContainer,
      '--restart',
      'unless-stopped',
      '--publish',
      '127.0.0.1:10000:10000',
      '--volume',
      `${azuriteVolume}:/data`,
      azuriteImage,
      'azurite-blob',
      '--blobHost',
      '0.0.0.0',
      '--disableTelemetry',
    ]);
  }

  const credential = new StorageSharedKeyCredential(account, accountKey);
  const service = new BlobServiceClient(`http://127.0.0.1:10000/${account}`, credential);
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await service.getContainerClient(bucket).create();
      return;
    } catch (error) {
      lastError = error;
      await delay(200);
    }
  }
  throw lastError;
}

function startNode(name, stateDirectory, internalPort) {
  const child = spawn(
    celld,
    [
      '--bucket',
      `az://${bucket}`,
      '--listen',
      `127.0.0.1:${publicPort}`,
      '--internal-listen',
      `127.0.0.1:${internalPort}`,
      '--advertise',
      `127.0.0.1:${internalPort}`,
    ],
    {
      cwd: process.cwd(),
      env: { ...commonEnv, CELLD_WATCH: stateDirectory, CELLD_NODE: name },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.logs = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      child.logs = `${child.logs}${chunk}`.slice(-20_000);
    });
  }
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function waitForNode(child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`celld exited early:\n${child.logs}`);
    try {
      const response = await fetch(`http://127.0.0.1:${publicPort}/rooms/readiness-${runId}`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`celld did not become ready:\n${child.logs}`);
}

async function submitOperation(operation) {
  const socket = new WebSocket(
    `ws://127.0.0.1:${publicPort}/rooms/${roomId}?actor=${operation.actorId}`,
  );
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('WebSocket acknowledgement timed out')),
      10_000,
    );
    socket.addEventListener('error', () => reject(new Error('WebSocket connection failed')));
    socket.addEventListener('message', (event) => {
      const frame = JSON.parse(String(event.data));
      if (frame.type === 'ready') {
        socket.send(JSON.stringify({ type: 'operation', operation }));
      } else if (frame.type === 'ack' || frame.type === 'conflict' || frame.type === 'error') {
        clearTimeout(timeout);
        socket.close();
        resolve(frame);
      }
    });
  });
}

async function snapshot() {
  const response = await fetch(`http://127.0.0.1:${publicPort}/rooms/${roomId}`);
  if (!response.ok) throw new Error(`Snapshot failed with HTTP ${response.status}`);
  return response.json();
}

async function stop(child, signal = 'SIGTERM') {
  if (child.exitCode !== null) return;
  child.kill(signal);
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5_000).then(() => child.kill('SIGKILL')),
  ]);
}

let stateA;
let stateB;
try {
  await access(celld);
  run('docker', ['version'], { quiet: true });
  await ensureAzurite();
  console.log(`Azurite ready; isolated test bucket is az://${bucket}`);

  run(celld, ['diagnose', '--bucket', `az://${bucket}`]);
  run(celld, ['deploy', 'apps/collaboration-service', '--bucket', `az://${bucket}`]);

  stateA = await mkdtemp(join(tmpdir(), 'worldview-celld-a-'));
  const nodeA = startNode(`worldview-a-${runId}`, stateA, internalPortA);
  await waitForNode(nodeA);

  const baseline = createStarterDocument();
  const initialize = await fetch(`http://127.0.0.1:${publicPort}/rooms/${roomId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(baseline),
  });
  if (!initialize.ok) throw new Error(`Baseline initialization failed: ${await initialize.text()}`);

  const ids = createSequentialIdFactory(`fault-${runId}`);
  const brush = createBoxBrush([160, -32, 0], [224, 32, 64], 'FAULT_TEST', ids);
  const after = insertBrush(baseline, baseline.entities[0].id, brush);
  const operation = {
    schemaVersion: 1,
    operationId: `fault-test:${runId}`,
    transactionId: `fault-test:${runId}`,
    actorId: 'fault-test',
    baseRoomVersion: 0,
    label: 'Azurite fault-test insertion',
    edits: collaborationEditsBetween(baseline, after),
  };
  const acknowledgement = await submitOperation(operation);
  if (acknowledgement.type !== 'ack' || acknowledgement.roomVersion !== 1) {
    throw new Error(`Unexpected operation result: ${JSON.stringify(acknowledgement)}`);
  }
  console.log('Node A acknowledged room version 1 after durable operation persistence');

  await stop(nodeA, 'SIGKILL');
  await rm(stateA, { recursive: true });
  stateA = undefined;
  console.log('Node A was SIGKILLed and its local replica was deleted');

  stateB = await mkdtemp(join(tmpdir(), 'worldview-celld-b-'));
  const nodeB = startNode(`worldview-b-${runId}`, stateB, internalPortB);
  await waitForNode(nodeB);
  const recovered = await snapshot();
  const brushes = recovered.document?.entities.flatMap((entity) => entity.brushes) ?? [];
  if (
    recovered.roomVersion !== 1 ||
    brushes.length !== 4 ||
    !brushes.some(({ id }) => id === brush.id)
  ) {
    throw new Error(
      `Bucket recovery mismatch: ${JSON.stringify({ roomVersion: recovered.roomVersion, brushCount: brushes.length })}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        result: 'passed',
        recovery: 'fresh celld node and empty local state restored from Azurite',
        roomId,
        roomVersion: recovered.roomVersion,
        brushCount: brushes.length,
        recoveredOperation: operation.operationId,
      },
      null,
      2,
    ),
  );
  await stop(nodeB);
} finally {
  for (const child of children) await stop(child).catch(() => {});
  if (stateA) await rm(stateA, { recursive: true, force: true });
  if (stateB) await rm(stateB, { recursive: true, force: true });
}
