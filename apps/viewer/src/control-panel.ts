import type {
  WorldSource,
  WorldviewMovementMode,
  WorldviewMovementUpdate,
} from '@jackharrhy/worldview';
import { Pane } from 'tweakpane';

export interface ViewerPanelActions {
  readonly captureOverview: () => void;
  readonly clearWalkability: () => void;
  readonly downloadWalkability: () => void;
  readonly enableAudio: () => void;
  readonly generateWalkability: () => void;
  readonly loadFixture: (id: string) => void;
  readonly loadUrl: (source: WorldSource) => void;
  readonly openFiles: () => void;
  readonly openWalkability: () => void;
  readonly playMusic: (entityIndex: number) => void;
  readonly resetCamera: () => void;
  readonly setAudioMuted: (muted: boolean) => void;
  readonly setAudioVolume: (volume: number) => void;
  readonly setFieldOfView: (fieldOfView: number) => void;
  readonly setMovement: (movement: WorldviewMovementUpdate) => void;
  readonly setMovementMode: (mode: Exclude<WorldviewMovementMode, 'none'>) => void;
  readonly setMusicVolume: (volume: number) => void;
  readonly setPlayerAudioVolume: (volume: number) => void;
  readonly setReticle: (visible: boolean) => void;
  readonly setWalkabilityVisible: (visible: boolean) => void;
  readonly stopMusic: () => void;
}

export function createPanelState(defaultFixture: string) {
  return {
    fixture: defaultFixture,
    bspUrl: '',
    gameBaseUrl: '',
    paletteUrl: '',
    wadBaseUrl: '',
    skyboxBaseUrl: '',
    spriteBaseUrl: '',
    soundBaseUrl: '',
    state: 'Waiting for a map',
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
    musicState: 'No map music',
    roomType: '0 - off',
    movementMode: 'walk' as 'walk' | 'fly',
    maxSpeed: 320,
    accelerate: 10,
    airAccelerate: 10,
    friction: 4,
    stopSpeed: 100,
    mouseSensitivity: 3,
    mouseAcceleration: 0,
    viewBob: 1,
    overviewSize: '1024',
    overviewLighting: 'lightmapped' as 'lightmapped' | 'fullbright',
    overviewRotation: 'auto' as 'auto' | '0' | '90',
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
  };
}

export type ViewerPanelState = ReturnType<typeof createPanelState>;

function urlSource(state: ViewerPanelState): WorldSource | undefined {
  const bsp = state.bspUrl.trim();
  if (!bsp) return undefined;
  const gameBaseUrl = state.gameBaseUrl.trim();
  const palette = state.paletteUrl.trim();
  const wadBaseUrl = state.wadBaseUrl.trim();
  const skyboxBaseUrl = state.skyboxBaseUrl.trim();
  const spriteBaseUrl = state.spriteBaseUrl.trim();
  const soundBaseUrl = state.soundBaseUrl.trim();
  return {
    bsp,
    ...(gameBaseUrl ? { gameBaseUrl } : {}),
    ...(palette ? { palette } : {}),
    ...(wadBaseUrl ? { wadBaseUrl } : {}),
    ...(skyboxBaseUrl ? { skyboxBaseUrl } : {}),
    ...(spriteBaseUrl ? { spriteBaseUrl } : {}),
    ...(soundBaseUrl ? { soundBaseUrl } : {}),
  };
}

export function createControlPanel(
  container: HTMLElement,
  state: ViewerPanelState,
  fixtureOptions: Record<string, string>,
  actions: ViewerPanelActions,
) {
  const pane = new Pane({ container, title: 'Worldview' });
  const tabs = pane.addTab({ pages: [{ title: 'Load' }, { title: 'Map' }] });
  const loadPage = tabs.pages[0]!;
  const mapPage = tabs.pages[1]!;

  loadPage.addBinding(state, 'fixture', { label: 'Fixture', options: fixtureOptions });
  const fixtureButton = loadPage.addButton({ title: 'Load fixture' });
  fixtureButton.element.querySelector('button')?.setAttribute('data-fixture', '');
  fixtureButton.disabled = Object.keys(fixtureOptions).length === 0;
  fixtureButton.on('click', () => actions.loadFixture(state.fixture));

  const urlFolder = loadPage.addFolder({ title: 'URL', expanded: false });
  const bspUrlBinding = urlFolder.addBinding(state, 'bspUrl', { label: 'BSP' });
  urlFolder.addBinding(state, 'gameBaseUrl', { label: 'Game root' });
  const overrideFolder = urlFolder.addFolder({ title: 'Overrides', expanded: false });
  overrideFolder.addBinding(state, 'paletteUrl', { label: 'Palette' });
  overrideFolder.addBinding(state, 'wadBaseUrl', { label: 'WAD base' });
  overrideFolder.addBinding(state, 'skyboxBaseUrl', { label: 'Skybox base' });
  overrideFolder.addBinding(state, 'spriteBaseUrl', { label: 'Sprite base' });
  overrideFolder.addBinding(state, 'soundBaseUrl', { label: 'Sound base' });
  const urlButton = urlFolder.addButton({ title: 'Load URL' });
  urlButton.disabled = true;
  bspUrlBinding.on('change', (event) => {
    urlButton.disabled = event.value.trim().length === 0;
  });
  urlButton.on('click', () => {
    const source = urlSource(state);
    if (source) actions.loadUrl(source);
  });

  const localFolder = loadPage.addFolder({ title: 'Local files', expanded: false });
  localFolder.addButton({ title: 'Choose BSP and assets' }).on('click', actions.openFiles);

  mapPage.addBinding(state, 'state', { label: 'State', readonly: true });
  mapPage.addBinding(state, 'map', { label: 'Map', readonly: true });
  mapPage.addBinding(state, 'format', { label: 'Format', readonly: true });

  const geometryFolder = mapPage.addFolder({ title: 'Geometry', expanded: false });
  geometryFolder.addBinding(state, 'triangles', { label: 'Triangles', readonly: true });
  geometryFolder.addBinding(state, 'faces', { label: 'Faces', readonly: true });
  geometryFolder.addBinding(state, 'batches', { label: 'Batches', readonly: true });
  geometryFolder.addBinding(state, 'materials', { label: 'Materials', readonly: true });
  geometryFolder.addBinding(state, 'lightmaps', { label: 'Lightmaps', readonly: true });
  geometryFolder.addBinding(state, 'sprites', { label: 'Sprites', readonly: true });
  geometryFolder.addBinding(state, 'sounds', { label: 'Sounds', readonly: true });
  geometryFolder.addBinding(state, 'entities', { label: 'Entities', readonly: true });
  geometryFolder.addBinding(state, 'loadTime', { label: 'Load time', readonly: true });

  const entityFolder = mapPage.addFolder({ title: 'Entity support', expanded: false });
  const skippedEntitiesBinding = entityFolder.addBinding(state, 'skippedEntities', {
    label: 'Partial / skipped',
    readonly: true,
    multiline: true,
    rows: 8,
  });
  skippedEntitiesBinding.element.querySelector('textarea')?.setAttribute('data-entity-support', '');

  const cameraFolder = mapPage.addFolder({ title: 'Camera', expanded: false });
  const movementModeBinding = cameraFolder.addBinding(state, 'movementMode', {
    label: 'Movement',
    options: { Walk: 'walk', Noclip: 'fly' },
  });
  movementModeBinding.on('change', (event) => actions.setMovementMode(event.value));
  cameraFolder.addBinding(state, 'position', { label: 'Position', readonly: true, interval: 100 });
  cameraFolder.addBinding(state, 'angles', {
    label: 'Yaw / pitch',
    readonly: true,
    interval: 100,
  });
  cameraFolder
    .addBinding(state, 'fieldOfView', { label: 'Field of view', min: 45, max: 110, step: 1 })
    .on('change', (event) => actions.setFieldOfView(event.value));
  const resetCameraButton = cameraFolder.addButton({ title: 'Reset camera' });
  resetCameraButton.disabled = true;
  resetCameraButton.on('click', actions.resetCamera);

  const movementFolder = mapPage.addFolder({ title: 'Movement', expanded: true });
  const maxSpeedBinding = movementFolder
    .addBinding(state, 'maxSpeed', { label: 'Max speed', min: 100, max: 400, step: 1 })
    .on('change', (event) => actions.setMovement({ maxSpeed: event.value }));
  maxSpeedBinding.element.querySelector('input')?.setAttribute('data-max-speed', '');
  movementFolder
    .addBinding(state, 'accelerate', { label: 'Ground accel', min: 1, max: 20, step: 0.1 })
    .on('change', (event) => actions.setMovement({ accelerate: event.value }));
  movementFolder
    .addBinding(state, 'airAccelerate', { label: 'Air accel', min: 0, max: 100, step: 0.1 })
    .on('change', (event) => actions.setMovement({ airAccelerate: event.value }));
  movementFolder
    .addBinding(state, 'friction', { label: 'Friction', min: 0, max: 10, step: 0.1 })
    .on('change', (event) => actions.setMovement({ friction: event.value }));
  movementFolder
    .addBinding(state, 'stopSpeed', { label: 'Stop speed', min: 0, max: 200, step: 1 })
    .on('change', (event) => actions.setMovement({ stopSpeed: event.value }));
  movementFolder
    .addBinding(state, 'mouseSensitivity', { label: 'Mouse sens', min: 0.1, max: 10, step: 0.1 })
    .on('change', (event) => actions.setMovement({ mouseSensitivity: event.value }));
  const mouseAccelerationBinding = movementFolder
    .addBinding(state, 'mouseAcceleration', {
      label: 'Mouse accel',
      min: 0,
      max: 0.1,
      step: 0.002,
    })
    .on('change', (event) => actions.setMovement({ mouseAcceleration: event.value }));
  mouseAccelerationBinding.element
    .querySelector('input')
    ?.setAttribute('data-mouse-acceleration', '');
  movementFolder
    .addBinding(state, 'viewBob', { label: 'View bob', min: 0, max: 2, step: 0.05 })
    .on('change', (event) => actions.setMovement({ viewBob: event.value }));

  const walkabilityFolder = mapPage.addFolder({ title: 'Walkability', expanded: false });
  walkabilityFolder
    .addBinding(state, 'walkabilityVisible', { label: 'Show graph' })
    .on('change', (event) => actions.setWalkabilityVisible(event.value));
  const walkabilitySpacingBinding = walkabilityFolder.addBinding(state, 'walkabilitySpacing', {
    label: 'Spacing',
    min: 8,
    max: 128,
    step: 1,
  });
  walkabilitySpacingBinding.element
    .querySelector('input')
    ?.setAttribute('data-walkability-spacing', '');
  walkabilityFolder.addBinding(state, 'walkabilityJump', { label: 'Probe jumps' });
  const walkabilityNodesBinding = walkabilityFolder.addBinding(state, 'walkabilityNodes', {
    label: 'Nodes',
    readonly: true,
  });
  walkabilityNodesBinding.element
    .querySelector('input')
    ?.setAttribute('data-walkability-nodes', '');
  const walkabilityStatusBinding = walkabilityFolder.addBinding(state, 'walkabilityStatus', {
    label: 'Status',
    readonly: true,
  });
  walkabilityStatusBinding.element
    .querySelector('input')
    ?.setAttribute('data-walkability-status', '');
  const generateWalkabilityButton = walkabilityFolder.addButton({ title: 'Generate' });
  generateWalkabilityButton.disabled = true;
  generateWalkabilityButton.element
    .querySelector('button')
    ?.setAttribute('data-walkability-generate', '');
  generateWalkabilityButton.on('click', actions.generateWalkability);
  const downloadWalkabilityButton = walkabilityFolder.addButton({ title: 'Download sidecar' });
  downloadWalkabilityButton.disabled = true;
  downloadWalkabilityButton.element
    .querySelector('button')
    ?.setAttribute('data-walkability-download', '');
  downloadWalkabilityButton.on('click', actions.downloadWalkability);
  const loadWalkabilityButton = walkabilityFolder.addButton({ title: 'Load sidecar' });
  loadWalkabilityButton.disabled = true;
  loadWalkabilityButton.on('click', actions.openWalkability);
  const clearWalkabilityButton = walkabilityFolder.addButton({ title: 'Clear' });
  clearWalkabilityButton.disabled = true;
  clearWalkabilityButton.on('click', actions.clearWalkability);

  const displayFolder = mapPage.addFolder({ title: 'Display', expanded: false });
  displayFolder
    .addBinding(state, 'reticle', { label: 'Reticle' })
    .on('change', (event) => actions.setReticle(event.value));
  const warningsBinding = displayFolder.addBinding(state, 'warnings', {
    label: 'Warnings',
    readonly: true,
    multiline: true,
    rows: 3,
  });
  warningsBinding.element.querySelector('textarea')?.setAttribute('data-warnings', '');

  const overviewFolder = mapPage.addFolder({ title: 'Overview', expanded: false });
  overviewFolder.addBinding(state, 'overviewSize', {
    label: 'Size',
    options: {
      '512 × 512': '512',
      '1024 × 1024': '1024',
      '1024 × 768': '1024x768',
      '2048 × 2048': '2048',
    },
  });
  overviewFolder.addBinding(state, 'overviewLighting', {
    label: 'Lighting',
    options: { Lightmapped: 'lightmapped', Fullbright: 'fullbright' },
  });
  overviewFolder.addBinding(state, 'overviewRotation', {
    label: 'Rotation',
    options: { Auto: 'auto', '0°': '0', '90°': '90' },
  });
  overviewFolder.addBinding(state, 'overviewCutaway', { label: 'Auto cutaway' });
  const overviewZMinBinding = overviewFolder.addBinding(state, 'overviewZMin', {
    label: 'Lower height',
    step: 1,
  });
  overviewZMinBinding.element.querySelector('input')?.setAttribute('data-overview-z-min', '');
  const overviewZMaxBinding = overviewFolder.addBinding(state, 'overviewZMax', {
    label: 'Upper height',
    step: 1,
  });
  overviewZMaxBinding.element.querySelector('input')?.setAttribute('data-overview-z-max', '');
  overviewFolder.addBinding(state, 'overviewTransparent', { label: 'Transparent' });
  const overviewStatusBinding = overviewFolder.addBinding(state, 'overviewStatus', {
    label: 'Export',
    readonly: true,
  });
  overviewStatusBinding.element.querySelector('input')?.setAttribute('data-overview-status', '');
  const overviewButton = overviewFolder.addButton({ title: 'Download overview' });
  overviewButton.disabled = true;
  overviewButton.element.querySelector('button')?.setAttribute('data-overview-download', '');
  overviewButton.on('click', actions.captureOverview);

  const audioFolder = mapPage.addFolder({ title: 'Audio', expanded: false });
  const audioStateBinding = audioFolder.addBinding(state, 'audioState', {
    label: 'State',
    readonly: true,
  });
  audioStateBinding.element.querySelector('input')?.setAttribute('data-audio-state', '');
  const roomTypeBinding = audioFolder.addBinding(state, 'roomType', {
    label: 'Room',
    readonly: true,
  });
  roomTypeBinding.element.querySelector('input')?.setAttribute('data-room-type', '');
  const enableAudioButton = audioFolder.addButton({ title: 'Enable sound' });
  enableAudioButton.element.querySelector('button')?.setAttribute('data-enable-audio', '');
  enableAudioButton.on('click', actions.enableAudio);
  audioFolder
    .addBinding(state, 'audioMuted', { label: 'Muted' })
    .on('change', (event) => actions.setAudioMuted(event.value));
  audioFolder
    .addBinding(state, 'audioVolume', { label: 'Volume', min: 0, max: 1, step: 0.01 })
    .on('change', (event) => actions.setAudioVolume(event.value));
  const playerAudioVolumeBinding = audioFolder
    .addBinding(state, 'playerAudioVolume', { label: 'Footsteps', min: 0, max: 2, step: 0.05 })
    .on('change', (event) => actions.setPlayerAudioVolume(event.value));
  playerAudioVolumeBinding.element.querySelector('input')?.setAttribute('data-player-volume', '');
  audioFolder
    .addBinding(state, 'musicVolume', { label: 'Music', min: 0, max: 1, step: 0.01 })
    .on('change', (event) => actions.setMusicVolume(event.value));
  const musicStateBinding = audioFolder.addBinding(state, 'musicState', {
    label: 'Music state',
    readonly: true,
  });
  musicStateBinding.element.querySelector('input')?.setAttribute('data-music-state', '');
  let musicTrackBinding = audioFolder.addBinding(state, 'musicTrack', {
    label: 'Track',
    options: { None: '' },
  });
  musicTrackBinding.element.querySelector('select')?.setAttribute('data-music-track', '');
  const playMusicButton = audioFolder.addButton({ title: 'Play music' });
  playMusicButton.disabled = true;
  playMusicButton.element.querySelector('button')?.setAttribute('data-play-music', '');
  playMusicButton.on('click', () => {
    const entityIndex = Number(state.musicTrack);
    if (Number.isInteger(entityIndex)) actions.playMusic(entityIndex);
  });
  const stopMusicButton = audioFolder.addButton({ title: 'Stop music' });
  stopMusicButton.disabled = true;
  stopMusicButton.element.querySelector('button')?.setAttribute('data-stop-music', '');
  stopMusicButton.on('click', actions.stopMusic);

  return {
    dispose: () => pane.dispose(),
    refresh: () => pane.refresh(),
    setDisabled: (disabled: boolean) => {
      pane.disabled = disabled;
    },
    setMusicOptions(options: Record<string, string>, selected: string) {
      musicTrackBinding.dispose();
      state.musicTrack = selected;
      musicTrackBinding = audioFolder.addBinding(state, 'musicTrack', {
        label: 'Track',
        options: Object.keys(options).length > 0 ? options : { None: '' },
      });
      musicTrackBinding.element.querySelector('select')?.setAttribute('data-music-track', '');
      playMusicButton.disabled = Object.keys(options).length === 0;
    },
    setMusicPlaying(playing: boolean) {
      stopMusicButton.disabled = !playing;
    },
    setOverviewEnabled(enabled: boolean) {
      overviewButton.disabled = !enabled;
    },
    setWalkabilityEnabled(mapLoaded: boolean, hasWalkability: boolean, generating = false) {
      generateWalkabilityButton.disabled = !mapLoaded || generating;
      loadWalkabilityButton.disabled = !mapLoaded || generating;
      downloadWalkabilityButton.disabled = !hasWalkability || generating;
      clearWalkabilityButton.disabled = !hasWalkability || generating;
    },
    setResetCameraEnabled(enabled: boolean) {
      resetCameraButton.disabled = !enabled;
    },
  };
}
