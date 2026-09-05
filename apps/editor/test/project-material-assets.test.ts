import { describe, expect, it } from 'vitest';

import { decodeProjectMaterialImage, projectMaterialName } from '../src/project-material-assets.js';

function onePixelTga(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(21);
  bytes[2] = 2;
  bytes[12] = 1;
  bytes[14] = 1;
  bytes[16] = 24;
  bytes[17] = 0x20;
  bytes.set([30, 20, 10], 18);
  return bytes;
}

describe('project material assets', () => {
  it('derives nested material identity without retaining the file extension', () => {
    expect(projectMaterialName('textures/E1U1/WALL_1.JPG')).toBe('e1u1/wall_1');
    expect(projectMaterialName('env/dusk1up.jpg')).toBeNull();
  });

  it('decodes TGA replacements without a DOM image codec', async () => {
    await expect(
      decodeProjectMaterialImage('textures/e1u1/wall.tga', onePixelTga().buffer),
    ).resolves.toEqual({
      width: 1,
      height: 1,
      rgba: new Uint8Array([10, 20, 30, 255]),
    });
  });
});
