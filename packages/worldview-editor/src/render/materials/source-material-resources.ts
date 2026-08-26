import type { EditorMaterial } from '../../core/index.js';
import {
  createMaterialResource,
  destroyMaterialResource,
  type MaterialResource,
} from '../material-resources.js';
import type { EditorSpriteMaterial } from '../types.js';

/** Owns the source view's fallback, map-material, and sprite-material GPU resources. */
export class SourceMaterialResources {
  private readonly resources = new Map<string, MaterialResource>();
  private readonly fallback: MaterialResource;
  private materials: readonly EditorMaterial[];
  private sprites: readonly EditorSpriteMaterial[];

  public constructor(
    private readonly device: GPUDevice,
    private readonly bindGroupLayout: GPUBindGroupLayout,
    private readonly sampler: GPUSampler,
    materials: readonly EditorMaterial[],
    sprites: readonly EditorSpriteMaterial[],
  ) {
    this.materials = materials;
    this.sprites = sprites;
    this.fallback = createMaterialResource(device, bindGroupLayout, sampler);
    this.rebuild();
  }

  public setMaterials(materials: readonly EditorMaterial[]): void {
    this.materials = materials;
    this.rebuild();
  }

  public setSprites(sprites: readonly EditorSpriteMaterial[]): void {
    this.sprites = sprites;
    this.rebuild();
  }

  public bindGroup(materialName: string): GPUBindGroup {
    return (
      this.resources.get(materialName.trim().toLowerCase())?.bindGroup ?? this.fallback.bindGroup
    );
  }

  public dispose(): void {
    this.clear();
    destroyMaterialResource(this.fallback);
  }

  private rebuild(): void {
    this.clear();
    for (const material of [...this.materials, ...this.sprites.map((sprite) => sprite.material)]) {
      const key = material.name.trim().toLowerCase();
      const previous = this.resources.get(key);
      if (previous) destroyMaterialResource(previous);
      this.resources.set(
        key,
        createMaterialResource(this.device, this.bindGroupLayout, this.sampler, material),
      );
    }
  }

  private clear(): void {
    for (const resource of this.resources.values()) destroyMaterialResource(resource);
    this.resources.clear();
  }
}
