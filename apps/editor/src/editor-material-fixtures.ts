import type { EditorMaterial } from '@jackharrhy/worldview-editor';

type Rgb = readonly [number, number, number];
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '1': ['010', '110', '010', '010', '010', '010', '111'],
  '2': ['110', '001', '001', '010', '100', '100', '111'],
  '8': ['111', '101', '101', '111', '101', '101', '111'],
  U: ['101', '101', '101', '101', '101', '101', '111'],
  N: ['1001', '1101', '1101', '1011', '1011', '1001', '1001'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  T: ['111', '010', '010', '010', '010', '010', '010'],
};

function pixel(rgba: Uint8Array, size: number, x: number, y: number, color: Rgb): void {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  rgba.set([...color, 255], (y * size + x) * 4);
}

function rect(
  rgba: Uint8Array,
  size: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Rgb,
): void {
  for (let row = y; row < y + h; row += 1)
    for (let column = x; column < x + w; column += 1) pixel(rgba, size, column, row, color);
}

function text(
  rgba: Uint8Array,
  size: number,
  value: string,
  centerX: number,
  y: number,
  scale: number,
  color: Rgb,
): void {
  const widths = [...value].map((character) => GLYPHS[character]?.[0]?.length ?? 3);
  const total = widths.reduce((sum, width) => sum + width * scale, 0) + (value.length - 1) * scale;
  let x = Math.round(centerX - total / 2);
  for (const [characterIndex, character] of [...value].entries()) {
    const glyph = GLYPHS[character];
    if (glyph)
      for (const [row, bits] of glyph.entries())
        for (const [column, bit] of [...bits].entries()) {
          if (bit === '1')
            rect(rgba, size, x + column * scale, y + row * scale, scale, scale, color);
        }
    x += widths[characterIndex]! * scale + scale;
  }
}

export function createDeveloperMaterial(
  name: string,
  base: Rgb,
  line: Rgb,
  ink: Rgb = [236, 229, 207],
): EditorMaterial {
  const size = 128;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const grain = ((x * 17 + y * 29 + (x ^ y) * 7) % 9) - 4;
      const checker = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0 ? 3 : -2;
      pixel(
        rgba,
        size,
        x,
        y,
        base.map((channel) =>
          Math.max(0, Math.min(255, channel + grain + checker)),
        ) as unknown as Rgb,
      );
    }
  for (let offset = 0; offset < size; offset += 16) {
    rect(rgba, size, offset, 0, offset % 64 === 0 ? 2 : 1, size, line);
    rect(rgba, size, 0, offset, size, offset % 64 === 0 ? 2 : 1, line);
  }
  rect(rgba, size, size - 2, 0, 2, size, line);
  rect(rgba, size, 0, size - 2, size, 2, line);
  rect(rgba, size, 62, 0, 4, size, ink);
  rect(rgba, size, 0, 62, size, 4, ink);
  for (let tick = 8; tick < size; tick += 8) {
    const length = tick % 32 === 0 ? 7 : 4;
    rect(rgba, size, tick, 0, 1, length, ink);
    rect(rgba, size, 0, tick, length, 1, ink);
  }
  rect(rgba, size, 57, 57, 14, 14, line);
  rect(rgba, size, 61, 61, 6, 6, ink);
  text(rgba, size, '128', 32, 7, 2, ink);
  text(rgba, size, 'UNIT', 96, 108, 1, ink);
  return {
    name,
    sourceName: 'Built-in Worldview development material',
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
