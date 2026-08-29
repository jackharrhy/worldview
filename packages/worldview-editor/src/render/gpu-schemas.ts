import tgpu, { d } from 'typegpu';

export const SolidVertex = d.unstruct({
  position: d.float32x3,
  color: d.float32x3,
  uv: d.float32x2,
});
export const LineVertex = d.unstruct({ position: d.float32x3, color: d.float32x3 });
export const solidVertexLayout = tgpu.vertexLayout((count) => d.disarrayOf(SolidVertex, count));
export const lineVertexLayout = tgpu.vertexLayout((count) => d.disarrayOf(LineVertex, count));
export const SceneUniform = d.struct({ projectionView: d.mat4x4f });
export const MaterialUniform = d.struct({ settings: d.vec4f });
export const editorSceneLayout = tgpu.bindGroupLayout({ scene: { uniform: SceneUniform } }).$idx(0);
export const editorMaterialLayout = tgpu
  .bindGroupLayout({
    materialSampler: { sampler: 'filtering' },
    materialTexture: { texture: d.texture2d(d.f32) },
    material: { uniform: MaterialUniform },
  })
  .$idx(1);
