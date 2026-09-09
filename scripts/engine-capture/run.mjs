import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify, stripVTControlCharacters } from 'node:util';
import { assertCamera, bspEntities, cameraEntities, cameraReadback, hash } from './scene.mjs';

const exec = promisify(execFile);
const request = JSON.parse(await readFile('/output/request.json', 'utf8'));
const { engine, position, angles, viewport } = request;
const runtime = '/output/runtime';
const game = join(runtime, engine === 'xash' ? 'cstrike' : 'id1');
const deadline = Date.now() + request.timeout * 1000;
const report = { ...request, status: 'failed', startedAt: new Date().toISOString() };
let child;
let closed;
let logFile;
let logError;
let log = '';

async function until(label, check) {
  while (Date.now() < deadline) {
    const result = await check();
    if (logError) throw logError;
    if (result) return result;
    if (child && (child.exitCode !== null || child.signalCode !== null))
      throw new Error(`Engine exited while waiting for ${label}`);
    if (/Host_Error|Host_ErrorInit|Crash: signal|Sys_Error/u.test(log))
      throw new Error(`Engine failed while waiting for ${label}`);
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function key(keyName) {
  await exec('xdotool', ['key', '--clearmodifiers', keyName]);
}

async function stage() {
  await mkdir(join(game, 'maps'), { recursive: true });
  const bytes = await readFile('/input/map.bsp');
  if (hash(bytes) !== request.input.sha256)
    throw new Error('Input BSP changed after capture was requested');
  const entities = bspEntities(bytes, engine);
  await copyFile('/input/map.bsp', join(game, 'maps/capture.bsp'));
  if (request.input.lit) {
    const lit = await readFile('/input/map.lit');
    if (hash(lit) !== request.input.lit.sha256)
      throw new Error('Input LIT changed after capture was requested');
    await writeFile(join(game, 'maps/capture.lit'), lit);
  }
  const common = ['name WorldviewCapture', 'con_notifytime 0', 'crosshair 0', 'r_drawviewmodel 0'];
  let settings;
  let args;
  let executable;
  if (engine === 'qssm') {
    const files = await readdir('/games/id1');
    const paks = files.filter((name) => /^pak\d+\.pak$/iu.test(name));
    if (!paks.some((name) => name.toLowerCase() === 'pak0.pak'))
      throw new Error('Quake installation needs id1/pak0.pak');
    report.gameAssets = {};
    for (const pak of paks) {
      await symlink(join('/games/id1', pak), join(game, pak.toLowerCase()));
      report.gameAssets[pak] = hash(await readFile(join('/games/id1', pak)));
    }
    for (const pak of ['qssm.pak', 'quakespasm.pak'])
      await copyFile(join('/opt/qssm', pak), join(game, pak));
    report.engineRevision = (await readFile('/opt/qssm/QSS-M-Revision.txt', 'utf8')).trim();
    const origin = position.map((value, axis) => value - 1 / 32 - (axis === 2 ? 22 : 0));
    // QSS-M 1.6.5's setpos angle arguments are broken; its public edict command sets fixangle.
    await writeFile(
      join(game, 'capture-camera.cfg'),
      `setpos ${origin.join(' ')}\nedict 1 angles "${angles.join(' ')}"\nedict 1 fixangle 1\necho WORLDVIEW_CAMERA_SET\n`,
    );
    settings = [
      ...common,
      'gamma 1',
      'contrast 1',
      'gl_overbright 1',
      'gl_fullbrights 1',
      'gl_texturemode GL_LINEAR_MIPMAP_LINEAR',
      'viewsize 120',
      'host_maxfps 72',
      'cl_bob 0',
      'cl_rollangle 0',
      'v_idlescale 0',
      'scr_showfps 0',
      'scr_conspeed 0',
      'con_notifylines 0',
      `fov ${viewport.fov}`,
      'bind F5 "screenshot png"',
      'bind F6 "viewpos; edict 1 origin; edict 1 v_angle; echo WORLDVIEW_POSE"',
      'bind F7 "exec capture-camera.cfg"',
    ];
    // QSS otherwise buffers stdout until shutdown, hiding readiness and camera readback.
    executable = '/usr/bin/stdbuf';
    args = [
      '-oL',
      '-eL',
      '/opt/qssm/QSS-M-l64',
      '-basedir',
      runtime,
      '-window',
      '-width',
      String(viewport.width),
      '-height',
      String(viewport.height),
      '-nosound',
      '-nojoy',
      '+map',
      'capture',
    ];
  } else {
    await mkdir(join(runtime, 'valve'), { recursive: true });
    await copyFile('/opt/xash/valve/extras.pk3', join(runtime, 'valve/extras.pk3'));
    await mkdir(join(game, 'cl_dlls'));
    await copyFile('/opt/cs16/cstrike/cl_dlls/client.so', join(game, 'cl_dlls/client.so'));
    await copyFile('/opt/cs16/cstrike/extras.pk3', join(game, 'extras.pk3'));
    report.gameAssets = {
      'cstrike/dlls/cs.so': hash(await readFile('/games/cstrike/dlls/cs.so')),
      'cs16client.so': hash(await readFile(join(game, 'cl_dlls/client.so'))),
    };
    report.engineRevision = (await readFile('/opt/xash/revision.txt', 'utf8')).trim();
    report.clientRevision = (await readFile('/opt/cs16/revision.txt', 'utf8')).trim();
    const patch = Buffer.from(cameraEntities(entities, position, angles), 'latin1');
    await writeFile(join(game, 'maps/capture.ent'), patch);
    // Xash only reads .ent overrides newer than the BSP (whole-second file timestamps).
    await utimes(join(game, 'maps/capture.bsp'), 1, 1);
    report.entityPatch = {
      path: 'runtime/cstrike/maps/capture.ent',
      sha256: hash(patch),
      purpose: 'Camera-only CT/T spawn placement; BSP bytes unchanged',
    };
    const origin = position.map((value, axis) => value - 1 / 32 - (axis === 2 ? 17 : 0));
    // Reposition after spawning: CS movement can snap a nearby spawn down to the floor.
    await writeFile(
      join(game, 'capture-camera.cfg'),
      `ent_fire 1 movetype 8\nent_fire 1 set origin "${origin.join(' ')}"\nent_fire 1 set angles "${angles.join(' ')}"\nent_fire 1 set fixangle 1\nent_fire 1 set velocity "0 0 0"\n`,
    );
    settings = [
      ...common,
      'fps_max 72',
      'sv_lan 1',
      'sv_cheats 1',
      'sv_enttools_enable 1',
      'sv_gravity 0',
      'mp_freezetime 0',
      'mp_roundtime 9',
      'mp_autoteambalance 0',
      'hud_draw 0',
      'cl_bob 0',
      'scr_drawversion 0',
      `default_fov ${viewport.fov}`,
      'bind F5 "screenshot capture.png"',
      'bind F6 "viewpos; echo WORLDVIEW_POSE"',
      'bind F7 "jointeam 2"',
      'bind F8 "joinclass 1"',
      'bind F9 "exec capture-camera.cfg; touch_removeall; touch_enable 0; hud_draw 0; r_drawviewmodel 0; gamma; brightness; texgamma; lightgamma; gl_overbright; gl_vbo_overbrightmode; default_fov; echo WORLDVIEW_CLEAN"',
    ];
    executable = '/opt/xash/xash3d';
    args = [
      '-rodir',
      '/games',
      '-game',
      'cstrike',
      '-windowed',
      '-width',
      String(viewport.width),
      '-height',
      String(viewport.height),
      '-nosound',
      '-console',
      '-dev',
      '1',
      '-log',
      'native.log',
      '+maxplayers',
      '2',
      '+map',
      'capture',
    ];
  }
  report.configuration = settings;
  report.command = [executable, ...args];
  for (const name of ['autoexec.cfg', 'listenserver.cfg']) await writeFile(join(game, name), '');
  await writeFile(join(game, 'config.cfg'), settings.join('\n') + '\n');
  logFile = createWriteStream('/output/engine.log');
  logFile.on('error', (error) => {
    logError = error;
  });
  child = spawn(executable, args, {
    cwd: runtime,
    env: {
      ...process.env,
      XASH3D_BASEDIR: runtime,
      LD_LIBRARY_PATH: '/opt/xash:/games',
      XDG_CACHE_HOME: '/tmp/cache',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  closed = new Promise((done) => child.once('close', done));
  child.on('error', (error) => {
    log += `Host_Error: ${error.message}\n`;
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      const text = stripVTControlCharacters(chunk.toString());
      if (log.length > 8 * 1024 * 1024) {
        logError = new Error('Engine log exceeded 8 MiB');
        child.kill('SIGTERM');
        return;
      }
      log += text;
      logFile.write(text);
    });
}

try {
  await stage();
  console.log('Waiting for the map to load…');
  await until('a connected game client', () =>
    engine === 'xash' ? /client connected at/u.test(log) : /entered the game/u.test(log),
  );
  if (engine === 'xash') {
    await until('CS team menu', () => /execing touch\/chooseteam\.cfg/u.test(log));
    await key('F7');
    await until('CS class menu', () => /execing touch\/chooseteam_ct\.cfg/u.test(log));
    await key('F8');
    await until('spawned CS player', () =>
      /Scoring will not start until both teams have players/u.test(log),
    );
    await delay(750);
    await key('F9');
    await until('clean capture settings', () => /WORLDVIEW_CLEAN/u.test(log));
  } else {
    await key('F7');
    await until('camera command', () => /WORLDVIEW_CAMERA_SET/u.test(log));
  }
  // Let client interpolation and transient join messages settle before sampling the frame.
  await delay(engine === 'xash' ? 6000 : 750);
  await key('F6');
  await until('camera readback', () => /WORLDVIEW_POSE/u.test(log));
  const actual = cameraReadback(log, engine);
  assertCamera(actual, request);
  report.camera = actual;
  console.log(`Camera verified: ${JSON.stringify(actual)}`);
  await delay(250);
  await key('F5');
  const screenshot = await until('native screenshot', async () => {
    if (engine === 'xash') {
      try {
        await readFile(join(game, 'capture.png'));
        return join(game, 'capture.png');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return null;
      }
    }
    const directory = join(game, 'screenshots');
    const files = await readdir(directory).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const name = files.find((file) => file.endsWith('.png'));
    return name ? join(directory, name) : null;
  });
  const bytes = await until('complete PNG', async () => {
    const contents = await readFile(screenshot);
    return contents.length >= 33 &&
      contents.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' &&
      contents.subarray(-8, -4).toString() === 'IEND'
      ? contents
      : null;
  });
  if (bytes.readUInt32BE(16) !== viewport.width || bytes.readUInt32BE(20) !== viewport.height)
    throw new Error('Screenshot dimensions differ from the request');
  const checkpoint = log.length;
  await key('F6');
  await until('final camera readback', () => /WORLDVIEW_POSE/u.test(log.slice(checkpoint)));
  report.cameraAfterCapture = cameraReadback(log.slice(checkpoint), engine);
  assertCamera(report.cameraAfterCapture, request);
  await copyFile(screenshot, '/output/capture.png');
  report.screenshot = {
    path: 'capture.png',
    sha256: hash(bytes),
    bytes: bytes.length,
    width: viewport.width,
    height: viewport.height,
  };
  report.status = 'passed';
} catch (error) {
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await Promise.race([closed, delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  await closed;
  if (logFile) {
    logFile.end();
    await finished(logFile).catch((error) => {
      report.status = 'failed';
      report.error = error.message;
      process.exitCode = 1;
    });
  }
  report.finishedAt = new Date().toISOString();
  await writeFile('/output/report.json', JSON.stringify(report, null, 2) + '\n');
}
