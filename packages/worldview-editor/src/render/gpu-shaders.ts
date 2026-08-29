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
  readonly position: d.v3f;
  readonly color: d.v3f;
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
  return {
    $position: editorSceneLayout.$.scene.projectionView.mul(d.vec4f(input.position, 1)),
    color: input.color,
  };
}
export function lineFragment(input: { readonly color: d.v3f }): d.v4f {
  'use gpu';
  return d.vec4f(input.color, 1);
}
