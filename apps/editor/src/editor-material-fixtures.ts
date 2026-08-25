import type { EditorMaterial } from '@jackharrhy/worldview-editor';

export function createDeveloperMaterial(
  name: string,
  base: readonly [number, number, number],
  grid: readonly [number, number, number],
): EditorMaterial {
  const size = 64;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const gridLine = x % 16 === 0 || y % 16 === 0;
      const checker = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
      const color = gridLine ? grid : base;
      rgba[offset] = Math.min(255, color[0] + checker * 7);
      rgba[offset + 1] = Math.min(255, color[1] + checker * 7);
      rgba[offset + 2] = Math.min(255, color[2] + checker * 7);
      rgba[offset + 3] = 255;
    }
  }
  return {
    name,
    sourceName: 'Built-in editor material',
    width: size,
    height: size,
    rgba,
    alphaTest: false,
  };
}

export function createDiagnosticQuakePalette(): Uint8Array {
  const palette = new Uint8Array(768);
  for (let index = 0; index < 256; index += 1) {
    palette[index * 3] = (index & 7) * 36;
    palette[index * 3 + 1] = ((index >> 3) & 7) * 36;
    palette[index * 3 + 2] = ((index >> 6) & 3) * 85;
  }
  return palette;
}
