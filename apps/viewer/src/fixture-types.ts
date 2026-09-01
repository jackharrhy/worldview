import type { CameraState, WorldSource } from '@jackharrhy/worldview';

export interface FixtureCameraDefinition {
  readonly position: readonly [number, number, number];
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly fieldOfView?: number;
}

export interface LocalFixtureDefinition {
  readonly id: string;
  readonly label: string;
  readonly bsp: string;
  readonly gameBaseUrl: string;
  readonly gameAssets?: Readonly<Record<string, string>>;
  readonly aliases: readonly string[];
  readonly camera?: FixtureCameraDefinition;
  readonly walkability?: string;
}

export interface ViewerFixture {
  readonly id: string;
  readonly label: string;
  readonly source: WorldSource;
  readonly aliases: readonly string[];
  readonly camera?: CameraState;
  readonly walkability?: string;
  readonly selectable: boolean;
}
