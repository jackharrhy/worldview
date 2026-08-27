import type { Vec3 } from '../core/index.js';
import type { EditorViewportKind } from './types.js';
import { DEFAULT_EDITOR_RENDER_THEME, type EditorRenderTheme } from './theme.js';

export function gridVertices(
  kind: EditorViewportKind,
  requestedSpacing: number,
  theme: EditorRenderTheme = DEFAULT_EDITOR_RENDER_THEME,
): Float32Array {
  const vertices: number[] = [];
  const extent = 4096;
  let spacing = Math.max(1, requestedSpacing);
  while ((extent * 2) / spacing > 4096) spacing *= 2;
  const push = (start: Vec3, end: Vec3, major: boolean) => {
    const color = major ? theme.gridMajor : theme.gridMinor;
    vertices.push(...start, ...color, ...end, ...color);
  };
  for (let offset = -extent; offset <= extent; offset += spacing) {
    const major = offset === 0 || offset % (spacing * 8) === 0;
    if (kind === 'xy' || kind === 'perspective') {
      push([-extent, offset, 0], [extent, offset, 0], major);
      push([offset, -extent, 0], [offset, extent, 0], major);
    } else if (kind === 'xz') {
      push([-extent, 0, offset], [extent, 0, offset], major);
      push([offset, 0, -extent], [offset, 0, extent], major);
    } else {
      push([0, -extent, offset], [0, extent, offset], major);
      push([0, offset, -extent], [0, offset, extent], major);
    }
  }
  return new Float32Array(vertices);
}
