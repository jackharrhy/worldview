import type { EditorRenderTheme } from '@jackharrhy/worldview-editor';

const roles = {
  background: '--renderer-background',
  edge: '--renderer-edge',
  material: '--renderer-material',
  edgeSelected: '--renderer-selection',
  edgeHover: '--renderer-hover',
  edgeLocked: '--renderer-locked',
  faceSelected: '--renderer-face-selected',
  faceHover: '--renderer-face-hover',
  faceHandle: '--renderer-face-handle',
  reference: '--renderer-reference',
  referenceEdge: '--renderer-reference-edge',
  axisX: '--renderer-axis-x',
  axisY: '--renderer-axis-y',
  axisZ: '--renderer-axis-z',
  accent: '--renderer-accent',
  danger: '--renderer-danger',
  success: '--renderer-success',
  info: '--renderer-info',
  special: '--renderer-special',
  gridMinor: '--renderer-grid-minor',
  gridMajor: '--renderer-grid-major',
} as const;

function resolvedColor(variable: string): readonly [number, number, number, number] {
  const probe = document.createElement('span');
  probe.style.color = `var(${variable})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Cannot resolve editor theme colors');
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return [red! / 255, green! / 255, blue! / 255, alpha! / 255];
}

export function resolveEditorRenderTheme(): EditorRenderTheme {
  const color = (key: keyof typeof roles) => resolvedColor(roles[key]);
  const rgb = (key: keyof typeof roles) => color(key).slice(0, 3) as [number, number, number];
  return {
    background: color('background'),
    edge: rgb('edge'),
    material: rgb('material'),
    edgeSelected: rgb('edgeSelected'),
    edgeHover: rgb('edgeHover'),
    edgeLocked: rgb('edgeLocked'),
    faceSelected: rgb('faceSelected'),
    faceHover: rgb('faceHover'),
    faceHandle: rgb('faceHandle'),
    reference: rgb('reference'),
    referenceEdge: rgb('referenceEdge'),
    axisX: rgb('axisX'),
    axisY: rgb('axisY'),
    axisZ: rgb('axisZ'),
    accent: rgb('accent'),
    danger: rgb('danger'),
    success: rgb('success'),
    info: rgb('info'),
    special: rgb('special'),
    gridMinor: rgb('gridMinor'),
    gridMajor: rgb('gridMajor'),
  };
}
