import { SnapshotStore, selectSnapshot, type SnapshotReader } from '@jackharrhy/worldview/runtime';

export interface ViewerMusicOption {
  readonly label: string;
  readonly entityIndex: number;
}

export interface ViewerSnapshot {
  readonly shellState: 'idle' | 'loading' | 'ready' | 'error';
  readonly status: string;
  readonly readySequence: number;
  readonly mapName: string;
  readonly formatLabel: string;
  readonly metrics: string;
  readonly dropActive: boolean;
  readonly controlsDisabled: boolean;
  readonly mapLoaded: boolean;
  readonly resetCameraEnabled: boolean;
  readonly overviewEnabled: boolean;
  readonly hasWalkability: boolean;
  readonly walkabilityGenerating: boolean;
  readonly musicPlaying: boolean;
  readonly fixture: string;
  readonly bspUrl: string;
  readonly gameBaseUrl: string;
  readonly paletteUrl: string;
  readonly wadBaseUrl: string;
  readonly skyboxBaseUrl: string;
  readonly spriteBaseUrl: string;
  readonly soundBaseUrl: string;
  readonly map: string;
  readonly format: string;
  readonly triangles: string;
  readonly faces: string;
  readonly batches: string;
  readonly materials: string;
  readonly lightmaps: string;
  readonly sprites: string;
  readonly sounds: string;
  readonly entities: string;
  readonly skippedEntities: string;
  readonly loadTime: string;
  readonly position: string;
  readonly angles: string;
  readonly fieldOfView: number;
  readonly warnings: string;
  readonly reticle: boolean;
  readonly audioState: string;
  readonly audioMuted: boolean;
  readonly audioVolume: number;
  readonly playerAudioVolume: number;
  readonly musicVolume: number;
  readonly musicTrack: string;
  readonly musicOptions: readonly ViewerMusicOption[];
  readonly musicState: string;
  readonly roomType: string;
  readonly movementMode: 'walk' | 'fly';
  readonly maxSpeed: number;
  readonly accelerate: number;
  readonly airAccelerate: number;
  readonly friction: number;
  readonly stopSpeed: number;
  readonly mouseSensitivity: number;
  readonly mouseAcceleration: number;
  readonly viewBob: number;
  readonly overviewSize: string;
  readonly overviewLighting: 'lightmapped' | 'fullbright';
  readonly overviewRotation: 'auto' | '0' | '90';
  readonly overviewCutaway: boolean;
  readonly overviewZMin: number;
  readonly overviewZMax: number;
  readonly overviewTransparent: boolean;
  readonly overviewStatus: string;
  readonly walkabilitySpacing: number;
  readonly walkabilityJump: boolean;
  readonly walkabilityVisible: boolean;
  readonly walkabilityStatus: string;
  readonly walkabilityNodes: string;
}

export type ViewerControlSnapshot = Omit<ViewerSnapshot, 'position' | 'angles'>;

export type ViewerShellSnapshot = Pick<
  ViewerSnapshot,
  | 'dropActive'
  | 'formatLabel'
  | 'mapName'
  | 'metrics'
  | 'movementMode'
  | 'readySequence'
  | 'reticle'
  | 'shellState'
  | 'status'
>;

export type ViewerCameraSnapshot = Pick<ViewerSnapshot, 'angles' | 'position'>;

export interface ViewerSnapshotReaders {
  readonly shell: SnapshotReader<ViewerShellSnapshot>;
  readonly controls: SnapshotReader<ViewerControlSnapshot>;
  readonly camera: SnapshotReader<ViewerCameraSnapshot>;
}

function shallowEqual<T extends object>(left: T, right: T): boolean {
  const leftKeys = Object.keys(left) as Array<keyof T>;
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => Object.is(left[key], right[key]));
}

export function createViewerSnapshotReaders(
  store: SnapshotReader<ViewerSnapshot>,
): ViewerSnapshotReaders {
  return {
    shell: selectSnapshot(
      store,
      ({
        dropActive,
        formatLabel,
        mapName,
        metrics,
        movementMode,
        readySequence,
        reticle,
        shellState,
        status,
      }) => ({
        dropActive,
        formatLabel,
        mapName,
        metrics,
        movementMode,
        readySequence,
        reticle,
        shellState,
        status,
      }),
      shallowEqual,
    ),
    controls: selectSnapshot(
      store,
      ({ position: _position, angles: _angles, ...controls }) => controls,
      shallowEqual,
    ),
    camera: selectSnapshot(store, ({ angles, position }) => ({ angles, position }), shallowEqual),
  };
}

export function createViewerStore(defaultFixture: string): SnapshotStore<ViewerSnapshot> {
  return new SnapshotStore({
    shellState: 'idle',
    status: 'Waiting for a map',
    readySequence: 0,
    mapName: 'Worldview',
    formatLabel: 'BSP29, BSP2, BSP30, and BSP38',
    metrics: '',
    dropActive: false,
    controlsDisabled: false,
    mapLoaded: false,
    resetCameraEnabled: false,
    overviewEnabled: false,
    hasWalkability: false,
    walkabilityGenerating: false,
    musicPlaying: false,
    fixture: defaultFixture,
    bspUrl: '',
    gameBaseUrl: '',
    paletteUrl: '',
    wadBaseUrl: '',
    skyboxBaseUrl: '',
    spriteBaseUrl: '',
    soundBaseUrl: '',
    map: 'None',
    format: 'None',
    triangles: '0',
    faces: '0',
    batches: '0',
    materials: '0',
    lightmaps: '0',
    sprites: '0',
    sounds: '0 ambient / 0 music / 0 player',
    entities: '0 supported / 0 partial / 0 baked / 0 skipped',
    skippedEntities: 'None',
    loadTime: '0 ms',
    position: '0.0 / 0.0 / 0.0',
    angles: '0.0 / 0.0',
    fieldOfView: 75,
    warnings: 'None',
    reticle: true,
    audioState: 'Click viewport to enable',
    audioMuted: false,
    audioVolume: 0.8,
    playerAudioVolume: 1,
    musicVolume: 1,
    musicTrack: '',
    musicOptions: [],
    musicState: 'No map music',
    roomType: '0 - off',
    movementMode: 'walk',
    maxSpeed: 320,
    accelerate: 10,
    airAccelerate: 10,
    friction: 4,
    stopSpeed: 100,
    mouseSensitivity: 3,
    mouseAcceleration: 0,
    viewBob: 1,
    overviewSize: '1024',
    overviewLighting: 'lightmapped',
    overviewRotation: 'auto',
    overviewCutaway: true,
    overviewZMin: 0,
    overviewZMax: 0,
    overviewTransparent: true,
    overviewStatus: 'Load a map first',
    walkabilitySpacing: 32,
    walkabilityJump: true,
    walkabilityVisible: false,
    walkabilityStatus: 'Load a map first',
    walkabilityNodes: '0',
  });
}
