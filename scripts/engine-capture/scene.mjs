import { createHash } from 'node:crypto';

export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function vector(text, name) {
  const values = text
    .trim()
    .split(/[\s,]+/u)
    .map((value) => (value === '' ? NaN : Number(value)));
  if (
    values.length !== 3 ||
    values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e7)
  ) {
    throw new Error(`${name} must contain three finite coordinates separated by commas`);
  }
  return values;
}

export function bspEntities(bytes, engine) {
  const version = bytes.length >= 124 ? bytes.readUInt32LE(0) : -1;
  if (![29, ...(engine === 'xash' ? [30] : [0x32505342])].includes(version)) {
    throw new Error(
      `${engine} requires ${engine === 'xash' ? 'BSP29 or BSP30' : 'BSP29 or BSP2'} input`,
    );
  }
  const offset = bytes.readUInt32LE(4);
  const length = bytes.readUInt32LE(8);
  if (offset < 124 || length < 1 || offset + length > bytes.length)
    throw new Error('Invalid BSP entity lump');
  return bytes
    .subarray(offset, offset + length)
    .toString('latin1')
    .replace(/\0+$/u, '');
}

// Preserve non-spawn entity text byte-for-byte, including quoted braces and WAD backslashes.
export function cameraEntities(text, eye, angles) {
  let start = -1;
  let words = [];
  let cursor = 0;
  let result = '';
  let worldspawn = false;
  for (const match of text.matchAll(/\/\/[^\n]*|"(?:\\.|[^"\\])*"|[{}]|[^\s{}"]+/gu)) {
    const token = match[0];
    if (token.startsWith('//')) continue;
    if (token === '{' && start < 0) {
      start = match.index;
      words = [];
    } else if (token.startsWith('"') && start >= 0) words.push(token.slice(1, -1));
    else if (token === '}' && start >= 0 && words.length % 2 === 0) {
      const pairs = Object.fromEntries(
        Array.from({ length: words.length / 2 }, (_, i) => [words[i * 2], words[i * 2 + 1]]),
      );
      worldspawn ||= pairs.classname === 'worldspawn';
      result += text.slice(cursor, start);
      if (!['info_player_start', 'info_player_deathmatch'].includes(pairs.classname))
        result += text.slice(start, match.index + 1);
      cursor = match.index + 1;
      start = -1;
    } else throw new Error('Malformed BSP entity text');
  }
  if (start >= 0 || !worldspawn) throw new Error('BSP entities must contain a complete worldspawn');
  // CS spawn adds one unit; standing eye height is 17, then the client adds 1/32 on each axis.
  const spawn = eye.map((value, axis) => value - 1 / 32 - (axis === 2 ? 18 : 0));
  const points = ['info_player_start', 'info_player_deathmatch'].map(
    (classname) =>
      `{\n"classname" "${classname}"\n"origin" "${spawn.join(' ')}"\n"angles" "${angles.join(' ')}"\n}`,
  );
  return result + text.slice(cursor) + '\n' + points.join('\n') + '\n';
}

export function cameraReadback(log, engine) {
  const triple = '([-\\d.e+]+) ([-\\d.e+]+) ([-\\d.e+]+)';
  const last = (pattern) =>
    [...log.matchAll(new RegExp(pattern, 'gu'))].at(-1)?.slice(1, 4).map(Number);
  if (engine === 'xash') {
    const position = last(`org \\( ${triple} \\)`);
    const angles = last(`ang \\( ${triple} \\)`);
    return position && angles ? { position, angles } : null;
  }
  const origin = last(`Edict 1\\.origin==${triple}`);
  const angles = last(`Edict 1\\.v_angle==${triple}`);
  return origin && angles
    ? {
        position: origin.map((value, axis) => value + 1 / 32 + (axis === 2 ? 22 : 0)),
        angles,
        playerOrigin: origin,
      }
    : null;
}

export function assertCamera(actual, requested) {
  if (!actual) throw new Error('Engine did not report its camera');
  if ([...actual.position, ...actual.angles].some((value) => !Number.isFinite(value)))
    throw new Error('Engine reported a non-finite camera');
  const positionError = Math.max(
    ...actual.position.map((value, axis) => Math.abs(value - requested.position[axis])),
  );
  const angleError = Math.max(
    ...actual.angles.map((value, axis) =>
      Math.abs(((value - requested.angles[axis] + 540) % 360) - 180),
    ),
  );
  if (positionError > 0.15 || angleError > 0.05) {
    throw new Error(
      `Camera mismatch: position error ${positionError}, angle error ${angleError}; observed ${JSON.stringify(actual)}`,
    );
  }
}
