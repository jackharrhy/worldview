import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCamera, bspEntities, cameraEntities, cameraReadback, vector } from './scene.mjs';

test('camera spawns preserve world, brush and light entity text', () => {
  const world = String.raw`{
"classname" "worldspawn"
"wad" "C:\games\halflife.wad"
"message" "room {with braces} and \"quotes\""
}`;
  const brush = '{ "classname" "func_wall" "model" "*1" }';
  const light = '{ "classname" "light" "origin" "80 -32 96" "_light" "650" }';
  const original = `${world}\n${brush}\n${light}\n// old spawns
{ "classname" "info_player_start" "origin" "1 2 3" }
{ "classname" "info_player_deathmatch" "origin" "4 5 6" }`;
  const patched = cameraEntities(original, [128.03125, -199.96875, 72.03125], [10, 90, 0]);
  for (const retained of [world, brush, light]) assert.ok(patched.includes(retained));
  assert.ok(!patched.includes('"1 2 3"') && !patched.includes('"4 5 6"'));
  assert.equal(patched.match(/"origin" "128 -200 54"/gu)?.length, 2);
  assert.equal(patched.match(/"angles" "10 90 0"/gu)?.length, 2);
  assert.throws(
    () => cameraEntities('{ "classname" "worldspawn"', [0, 0, 0], [0, 0, 0]),
    /complete worldspawn/u,
  );
});

test('BSP validation rejects incompatible formats and out-of-bounds entity lumps', () => {
  const text = Buffer.from('{ "classname" "worldspawn" }\0');
  const bsp = Buffer.alloc(124 + text.length);
  bsp.writeUInt32LE(30);
  bsp.writeUInt32LE(124, 4);
  bsp.writeUInt32LE(text.length, 8);
  text.copy(bsp, 124);
  assert.equal(bspEntities(bsp, 'xash'), '{ "classname" "worldspawn" }');
  assert.throws(() => bspEntities(bsp, 'qssm'), /requires BSP29 or BSP2/u);
  bsp.writeUInt32LE(text.length + 1, 8);
  assert.throws(() => bspEntities(bsp, 'xash'), /Invalid BSP entity lump/u);
});

test('native camera readbacks retain precision, use the latest sample, and reject drift', () => {
  const requested = { position: [128.03125, -199.96875, 72.03125], angles: [10, 90, 0] };
  const qssm = cameraReadback(
    `Viewpos: (128 -200 50) 9 90 0
Edict 1.origin==128.000000 -200.000000 50.000000
Edict 1.v_angle==9.997559 90.000000 0.000000`,
    'qssm',
  );
  assertCamera(qssm, requested);
  assert.deepEqual(qssm.position, requested.position);
  const xash = cameraReadback(
    `org ( 0 0 0 )\nang ( 0 0 0 )
[02:21:44] org ( 128.031 -199.969 72.0312 )
[02:21:44] ang ( 9.99756 90 0 )`,
    'xash',
  );
  assertCamera(xash, requested);
  assert.throws(
    () => assertCamera({ ...xash, position: [128, -200, 59] }, requested),
    /Camera mismatch/u,
  );
  assert.throws(() => assertCamera({ ...xash, angles: [NaN, 90, 0] }, requested), /non-finite/u);
  assert.throws(
    () => assertCamera(cameraReadback('still loading', 'qssm'), requested),
    /did not report/u,
  );
});

test('camera arguments reject non-finite values and console command text', () => {
  for (const value of ['0,Infinity,0', '0,NaN,0', '0,0,0;quit', '0,0', '0,0,', '0,0,10000001']) {
    assert.throws(() => vector(value, '--position'), /three finite coordinates/u);
  }
});
