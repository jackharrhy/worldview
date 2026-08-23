import type { Vec3Tuple } from '../core/index.js';

export type TextureFiltering = 'nearest' | 'linear';

/** Camera state shared by the public viewer and GPU layers. */
export interface CameraState {
  readonly position: Vec3Tuple;
  readonly yaw: number;
  readonly pitch: number;
  readonly fieldOfView: number;
}
