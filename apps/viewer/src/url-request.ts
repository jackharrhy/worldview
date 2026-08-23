import type { CameraState, WorldSource } from '@jackharrhy/worldview';

import { fixtureById } from './fixture-catalog.js';
import type { ViewerFixture } from './fixture-types.js';

export interface ViewerRequest {
  readonly source: WorldSource;
  readonly fixture?: ViewerFixture;
  readonly camera?: CameraState;
}

export type InitialViewerRequest = ViewerRequest | { readonly error: string } | undefined;

function cameraFromQuery(value: string | null): CameraState | undefined {
  const values = value?.split(',').map(Number);
  if (!values || values.length !== 5 || values.some((component) => !Number.isFinite(component))) {
    return undefined;
  }
  return {
    position: [values[0]!, values[1]!, values[2]!],
    yaw: (values[3]! * Math.PI) / 180,
    pitch: (values[4]! * Math.PI) / 180,
    fieldOfView: 75,
  };
}

export function requestFromUrl(parameters: URLSearchParams): InitialViewerRequest {
  const requestedCamera = cameraFromQuery(parameters.get('camera'));
  const fixtureId = parameters.get('fixture');
  if (fixtureId) {
    const fixture = fixtureById(fixtureId);
    if (!fixture) return { error: `Fixture ${fixtureId} was not found` };
    const camera = requestedCamera ?? fixture.camera;
    return {
      source: fixture.source,
      fixture,
      ...(camera ? { camera } : {}),
    };
  }

  const bsp = parameters.get('bsp');
  if (!bsp) return undefined;
  const gameBaseUrl = parameters.get('gameBase') ?? parameters.get('root');
  const palette = parameters.get('palette');
  const wadBaseUrl = parameters.get('wadBase');
  const skyboxBaseUrl = parameters.get('skyboxBase');
  const spriteBaseUrl = parameters.get('spriteBase');
  const soundBaseUrl = parameters.get('soundBase');
  return {
    source: {
      bsp,
      ...(gameBaseUrl ? { gameBaseUrl } : {}),
      ...(palette ? { palette } : {}),
      ...(wadBaseUrl ? { wadBaseUrl } : {}),
      ...(skyboxBaseUrl ? { skyboxBaseUrl } : {}),
      ...(spriteBaseUrl ? { spriteBaseUrl } : {}),
      ...(soundBaseUrl ? { soundBaseUrl } : {}),
    },
    ...(requestedCamera ? { camera: requestedCamera } : {}),
  };
}
