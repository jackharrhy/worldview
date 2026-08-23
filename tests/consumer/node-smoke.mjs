import assert from 'node:assert/strict';

const main = await import('@jackharrhy/worldview');
const core = await import('@jackharrhy/worldview/core');

assert.equal(typeof main.createWorldview, 'function');
assert.equal(typeof main.WorldviewError, 'function');
assert.deepEqual(core.parseEntities('{ "key" "value" }'), [{ key: 'value' }]);
assert.equal(core.spriteReference('sprites/test.spr')?.normalizedPath, 'sprites/test.spr');
