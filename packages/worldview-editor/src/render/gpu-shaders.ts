import { d, std } from 'typegpu';
import { editorMaterialLayout, editorSceneLayout } from './gpu-schemas.js';

interface SolidVertexInput {
  readonly position: d.v3f;
  readonly color: d.v3f;
  readonly uv: d.v2f;
}
interface SolidFragmentInput {
  readonly color: d.v3f;
  readonly uv: d.v2f;
}
interface LineVertexInput {
  readonly start: d.v3f;
  readonly startColor: d.v3f;
  readonly end: d.v3f;
  readonly endColor: d.v3f;
  readonly $vertexIndex: number;
}

export function solidVertex(input: SolidVertexInput) {
  'use gpu';
  return {
    $position: editorSceneLayout.$.scene.projectionView.mul(d.vec4f(input.position, 1)),
    color: input.color,
    uv: input.uv,
  };
}
export function solidFragment(input: SolidFragmentInput): d.v4f {
  'use gpu';
  const dimensions = d.vec2f(std.textureDimensions(editorMaterialLayout.$.materialTexture));
  const sampled = std.textureSample(
    editorMaterialLayout.$.materialTexture,
    editorMaterialLayout.$.materialSampler,
    input.uv.div(dimensions),
  );
  if (editorMaterialLayout.$.material.settings.y > 0.5 && sampled.a < 0.5) std.discard();
  return d.vec4f(std.mix(input.color, sampled.rgb, editorMaterialLayout.$.material.settings.x), 1);
}
export function lineVertex(input: LineVertexInput) {
  'use gpu';
  const start = editorSceneLayout.$.scene.projectionView.mul(d.vec4f(input.start, 1));
  const end = editorSceneLayout.$.scene.projectionView.mul(d.vec4f(input.end, 1));
  const startNdc = start.xy.div(start.w);
  const endNdc = end.xy.div(end.w);
  const direction = std.normalize(endNdc.sub(startNdc));
  const perpendicular = d.vec2f(0 - direction.y, direction.x);
  let atEnd = false;
  let positiveSide = false;
  if (input.$vertexIndex === 1 || input.$vertexIndex === 4 || input.$vertexIndex === 5)
    atEnd = true;
  if (input.$vertexIndex === 2 || input.$vertexIndex === 3 || input.$vertexIndex === 5)
    positiveSide = true;
  let clip = d.vec4f(start);
  let color = d.vec3f(input.startColor);
  let side = -1;
  if (atEnd) {
    clip = d.vec4f(end);
    color = d.vec3f(input.endColor);
  }
  if (positiveSide) side = 1;
  const pixelOffset = d
    .vec2f(2 / editorSceneLayout.$.scene.viewport.x, 2 / editorSceneLayout.$.scene.viewport.y)
    .mul(editorSceneLayout.$.scene.viewport.z * d.f32(side));
  const position = d.vec4f(clip.xy.add(perpendicular.mul(pixelOffset).mul(clip.w)), clip.z, clip.w);
  return {
    $position: position,
    color,
  };
}
export function lineFragment(input: { readonly color: d.v3f }): d.v4f {
  'use gpu';
  return d.vec4f(input.color, 1);
}

export function gridVertex(input: { readonly $vertexIndex: number }) {
  'use gpu';
  let position = d.vec2f(-1, -1);
  if (input.$vertexIndex === 1) position = d.vec2f(3, -1);
  if (input.$vertexIndex === 2) position = d.vec2f(-1, 3);
  return { $position: d.vec4f(position, 0, 1) };
}

export function gridFragment(input: { readonly $position: d.v4f }): d.v4f {
  'use gpu';
  const scene = editorSceneLayout.$.scene;
  const centeredPixels = d.vec2f(
    input.$position.x - scene.viewport.x * 0.5,
    scene.viewport.y * 0.5 - input.$position.y,
  );
  const world = scene.grid.xy.add(centeredPixels.mul(scene.grid.z));
  const minorCoordinate = world.div(scene.grid.w);
  const minorCell = std.abs(std.fract(minorCoordinate.add(0.5)).sub(0.5));
  const minorWidth = std.fwidth(minorCoordinate);
  const minorDistance = std.min(minorCell.x / minorWidth.x, minorCell.y / minorWidth.y);
  const majorCoordinate = minorCoordinate.div(8);
  const majorCell = std.abs(std.fract(majorCoordinate.add(0.5)).sub(0.5));
  const majorWidth = std.fwidth(majorCoordinate);
  const majorDistance = std.min(majorCell.x / majorWidth.x, majorCell.y / majorWidth.y);
  const minorAlpha = std.saturate(1 - minorDistance);
  const majorAlpha = std.saturate(1 - majorDistance);
  const color = std.mix(scene.gridMinor.rgb, scene.gridMajor.rgb, majorAlpha);
  return d.vec4f(color, std.max(minorAlpha * scene.gridMinor.a, majorAlpha * scene.gridMajor.a));
}
