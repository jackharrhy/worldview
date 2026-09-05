import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  collaborationEditsBetween,
  createBoxBrush,
  createSequentialIdFactory,
  createStarterDocument,
  insertBrush,
  serializeMap,
} from '@jackharrhy/worldview-editor/core';

const image = process.env.CELLD_TEST_IMAGE;
const requestedBinary = process.env.CELLD_BIN ?? join(homedir(), '.local', 'bin', 'celld');
const state = await mkdtemp(join(tmpdir(), 'worldview-celld-sqlite-'));
const celld = join(state, 'celld');
const bucket = `sqlite://${join(state, 'object-store', 'objects.sqlite3')}`;
const publicPort = await availablePort();
const runId = `${Date.now().toString(36)}-${process.pid}`;
const mapId = `fault-map-${runId}`;
const ticketSecret = 'replace-with-at-least-32-random-characters';
const commonEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !name.startsWith('CELLD_') && !name.startsWith('AZURE_') && !name.startsWith('AZURITE_'),
    ),
  ),
  CELLD_BIN: celld,
  CELLD_BUCKET: bucket,
  CELLD_DURABILITY: 'bucket',
  CELLD_VAR_WORLDVIEW_REALTIME_TICKET_SECRET: ticketSecret,
};
const children = new Set();

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) =>
    server.listen(0, '127.0.0.1', resolve).once('error', reject),
  );
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

function startNode(name) {
  const container = `worldview-sqlite-test-${runId}-${name}`;
  const command = image ? 'docker' : 'sh';
  const args = image
    ? [
        'run',
        '--rm',
        '--memory',
        '512m',
        '--cpus',
        '1',
        '--pids-limit',
        '128',
        '--name',
        container,
        '--user',
        `${process.getuid()}:${process.getgid()}`,
        '--publish',
        `127.0.0.1:${publicPort}:8080`,
        '--volume',
        `${state}:/var/lib/celld`,
        '--env',
        `CELLD_WATCH=/var/lib/celld/${name}`,
        '--env',
        'CELLD_ASSET_CACHE_DIR=/var/lib/celld/asset-cache',
        '--env',
        `CELLD_VAR_WORLDVIEW_REALTIME_TICKET_SECRET=${ticketSecret}`,
        image,
      ]
    : [
        join(process.cwd(), 'scripts/start-celld.sh'),
        '--listen',
        `127.0.0.1:${publicPort}`,
        '--internal-listen',
        '127.0.0.1:0',
      ];
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...commonEnv, CELLD_WATCH: join(state, name) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.logs = '';
  child.container = image ? container : undefined;
  child.once('error', (error) => {
    child.spawnError = error;
  });
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
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.spawnError) throw child.spawnError;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`celld exited early:\n${child.logs}`);
    try {
      const response = await fetch(
        `http://127.0.0.1:${publicPort}/sync/maps/readiness-${runId}/snapshot`,
        {
          signal: AbortSignal.timeout(1000),
        },
      );
      if (response.status === 401) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`celld did not become ready:\n${child.logs}`);
}

function encoded(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function ticket(targetMapId) {
  const header = encoded({ algorithm: 'HS256', type: 'WVT' });
  const content = encoded({
    version: 2,
    mapId: targetMapId,
    principalId: 'fault-test',
    actorId: 'fault-test',
    role: 'owner',
    expiresAt: Date.now() + 60_000,
  });
  const signature = createHmac('sha256', ticketSecret)
    .update(`${header}.${content}`)
    .digest('base64url');
  return `${header}.${content}.${signature}`;
}

async function submitOperation(operation) {
  const socket = new WebSocket(
    `ws://127.0.0.1:${publicPort}/sync/maps/${mapId}/live?access_token=${encodeURIComponent(ticket(mapId))}`,
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
  let detail = '';
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${publicPort}/sync/maps/${mapId}/snapshot`, {
      headers: { Authorization: `Bearer ${ticket(mapId)}` },
    });
    if (response.ok) return response.json();
    detail = `${response.status}: ${await response.text()}`;
    await delay(100);
  }
  throw new Error(`Snapshot failed: ${detail}`);
}

async function stop(child, signal = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  if (child.container) {
    const killed = spawnSync('docker', ['kill', `--signal=${signal}`, child.container], {
      encoding: 'utf8',
    });
    if (killed.status !== 0) throw new Error('Could not stop isolated test container');
  } else child.kill(signal);
  let timer;
  try {
    await Promise.race([
      exited,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Celld test shutdown timed out')), 60_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (signal === 'SIGTERM') assert.equal(child.exitCode, 0, 'Celld must drain cleanly');
}

try {
  if (!image) {
    await access(requestedBinary);
    await copyFile(requestedBinary, celld, fsConstants.COPYFILE_FICLONE);
  }
  const nodeA = startNode('replica-a');
  await waitForNode(nodeA);

  const starter = createStarterDocument();
  const initialize = await fetch(`http://127.0.0.1:${publicPort}/sync/maps/${mapId}/initialize`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${ticket(mapId)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ source: serializeMap(starter) }),
  });
  if (!initialize.ok)
    throw new Error(`Baseline initialization failed: ${await initialize.text()}\n${nodeA.logs}`);
  const baseline = (await snapshot()).document;

  const ids = createSequentialIdFactory(`fault-${runId}`);
  const brush = createBoxBrush([160, -32, 0], [224, 32, 64], 'FAULT_TEST', ids);
  const after = insertBrush(baseline, baseline.entities[0].id, brush);
  const operation = {
    schemaVersion: 1,
    operationId: `fault-test:${runId}`,
    transactionId: `fault-test:${runId}`,
    actorId: 'fault-test',
    baseMapVersion: 0,
    label: 'SQLite fault-test insertion',
    edits: collaborationEditsBetween(baseline, after),
  };
  const acknowledgement = await submitOperation(operation);
  if (acknowledgement.type !== 'ack' || acknowledgement.mapVersion !== 1) {
    throw new Error(`Unexpected operation result: ${JSON.stringify(acknowledgement)}`);
  }
  console.log('Node A acknowledged map version 1 after durable operation persistence');

  const beforeKill = await snapshot();
  assert.equal(beforeKill.sourceSha256, acknowledgement.sourceSha256);
  assert.equal(
    createHash('sha256').update(beforeKill.source).digest('hex'),
    beforeKill.sourceSha256,
  );
  const checkpointResponse = await fetch(
    `http://127.0.0.1:${publicPort}/sync/maps/${mapId}/checkpoints`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${ticket(mapId)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Persisted before crash' }),
    },
  );
  assert.equal(checkpointResponse.status, 200);
  const { checkpoint } = await checkpointResponse.json();
  assert.equal(checkpoint.sourceSha256, beforeKill.sourceSha256);

  await stop(nodeA, 'SIGKILL');
  await rm(join(state, 'replica-a'), { recursive: true, force: true });
  console.log('Node A was SIGKILLed and its local replica was deleted');

  const nodeB = startNode('replica-b');
  await waitForNode(nodeB);
  const recovered = await snapshot();
  const brushes =
    recovered.document?.entities
      .flatMap((entity) => entity.primitives)
      .filter((primitive) => primitive.kind === 'brush') ?? [];
  const expectedBrushCount = after.entities
    .flatMap((entity) => entity.primitives)
    .filter((primitive) => primitive.kind === 'brush').length;
  if (
    recovered.mapVersion !== 1 ||
    brushes.length !== expectedBrushCount ||
    !brushes.some(({ id }) => id === brush.id)
  ) {
    throw new Error(
      `Bucket recovery mismatch: ${JSON.stringify({ mapVersion: recovered.mapVersion, brushCount: brushes.length })}`,
    );
  }
  assert.deepEqual(
    recovered,
    beforeKill,
    'exact source, document, version and hash survive a cold restore',
  );
  const checkpointsResponse = await fetch(
    `http://127.0.0.1:${publicPort}/sync/maps/${mapId}/checkpoints`,
    {
      headers: { Authorization: `Bearer ${ticket(mapId)}` },
    },
  );
  assert.equal(checkpointsResponse.status, 200);
  assert.deepEqual((await checkpointsResponse.json()).checkpoints, [checkpoint]);
  assert.deepEqual(
    await submitOperation(operation),
    acknowledgement,
    'operation receipt remains idempotent',
  );
  assert.deepEqual(await snapshot(), beforeKill, 'retry does not increment the map version');
  await stop(nodeB);
  console.log(
    JSON.stringify(
      {
        result: 'passed',
        recovery: 'fresh Celld node and empty replica restored from SQLite',
        backend: 'sqlite',
        image: image ?? null,
        checks: [
          'authorization',
          'exact snapshot and source hash',
          'checkpoint',
          'idempotent operation receipt',
        ],
        mapId,
        mapVersion: recovered.mapVersion,
        brushCount: brushes.length,
        recoveredOperation: operation.operationId,
      },
      null,
      2,
    ),
  );
} finally {
  for (const child of children) await stop(child).catch(() => {});
  await rm(state, { recursive: true, force: true });
}
