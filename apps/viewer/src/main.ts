import {
  analyzeEntitySupport,
  createWorldview,
  planOverview,
  type CameraState,
  type ReadyDetail,
  type WorldSource,
} from '@jackharrhy/worldview';
import {
  parseWalkability,
  serializeWalkability,
  type WalkabilityMap,
} from '@jackharrhy/worldview/walkability';

import { createAppShell } from './app-shell.js';
import { createControlPanel, createPanelState } from './control-panel.js';
import { fixtureById, fixtureOptions, selectableFixtures } from './fixture-catalog.js';
import { requestFromUrl } from './url-request.js';
import { sourceFromFiles, sourceName } from './world-input.js';
import './style.css';

const elements = createAppShell(document.querySelector<HTMLDivElement>('#app')!);
const ui = createPanelState(selectableFixtures[0]?.id ?? '');

let viewer: Awaited<ReturnType<typeof createWorldview>> | undefined;
let spawnCamera: CameraState | undefined;
let pendingCamera: CameraState | undefined;
let warningMessages: string[] = [];
let readySequence = 0;
let mapLoadSequence = 0;
let walkabilityGenerating = false;

function setStatus(message: string, kind: 'idle' | 'loading' | 'ready' | 'error' = 'idle'): void {
  ui.state = message;
  elements.status.textContent = message;
  elements.shell.dataset.state = kind;
}

function setWarnings(messages: readonly string[]): void {
  warningMessages = [...messages];
  ui.warnings = warningMessages.length > 0 ? warningMessages.join('\n') : 'None';
}

function copyCamera(camera: CameraState): CameraState {
  return { ...camera, position: [...camera.position] };
}

function setWalkabilityUi(walkability: WalkabilityMap | null, visible: boolean): void {
  ui.walkabilityNodes = walkability?.statistics.nodes.toLocaleString() ?? '0';
  ui.walkabilityVisible = visible;
  if (!walkability && !walkabilityGenerating) ui.walkabilityStatus = 'Not generated';
  if (viewer?.world && ui.overviewStatus !== 'Rendering') {
    ui.overviewStatus = walkability ? 'Ready · walkability cutaway' : 'Ready · height slice';
  }
  panel.setWalkabilityEnabled(Boolean(viewer?.world), Boolean(walkability), walkabilityGenerating);
}

function applyWalkability(walkability: WalkabilityMap): void {
  if (!viewer) return;
  viewer.setWalkability(walkability);
  viewer.setWalkabilityVisible(true);
  ui.walkabilityStatus = `${walkability.statistics.nodes.toLocaleString()} nodes · ${walkability.statistics.components.toLocaleString()} components`;
  panel.refresh();
}

async function loadWalkabilityUrl(url: string, sequence: number): Promise<void> {
  if (!viewer?.world) return;
  ui.walkabilityStatus = 'Loading sidecar';
  panel.refresh();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`walkability request returned ${response.status}`);
  const walkability = parseWalkability(await response.text());
  if (sequence !== mapLoadSequence) return;
  applyWalkability(walkability);
  ui.walkabilityStatus = `Loaded ${walkability.statistics.nodes.toLocaleString()} nodes`;
  panel.refresh();
}

async function load(
  source: WorldSource,
  camera?: CameraState,
  walkabilityUrl?: string,
): Promise<void> {
  if (!viewer) return;
  const sequence = ++mapLoadSequence;
  pendingCamera = camera;
  const name = sourceName(source);
  ui.map = name;
  elements.mapName.textContent = name;
  elements.formatLabel.textContent = 'Reading map data';
  setWarnings([]);
  ui.overviewStatus = 'Loading map';
  ui.walkabilityStatus = 'Loading map';
  ui.walkabilityNodes = '0';
  panel.setOverviewEnabled(false);
  panel.setWalkabilityEnabled(false, false);
  setStatus('Loading map', 'loading');
  try {
    await viewer.load(source);
    if (walkabilityUrl && sequence === mapLoadSequence) {
      try {
        await loadWalkabilityUrl(walkabilityUrl, sequence);
      } catch (error) {
        if (sequence !== mapLoadSequence) return;
        const message = error instanceof Error ? error.message : String(error);
        ui.walkabilityStatus = 'Sidecar rejected';
        setWarnings([...warningMessages, `walkability sidecar: ${message}`]);
        panel.refresh();
      }
    }
  } catch {
    // The viewer error event supplies the message shown in the interface.
  }
}

function loadFixture(id: string): void {
  const fixture = fixtureById(id);
  if (fixture) void load(fixture.source, fixture.camera, fixture.walkability);
  else setStatus(`Fixture ${id} was not found`, 'error');
}

async function generateWalkabilityMap(): Promise<void> {
  if (!viewer?.world || walkabilityGenerating) return;
  walkabilityGenerating = true;
  ui.walkabilityStatus = 'Starting';
  panel.setWalkabilityEnabled(true, Boolean(viewer.walkability), true);
  panel.refresh();
  let lastRefresh = 0;
  try {
    const walkability = await viewer.generateWalkability({
      spacing: ui.walkabilitySpacing,
      allowJump: ui.walkabilityJump,
      yieldEvery: 16,
      onProgress: (progress) => {
        const now = performance.now();
        if (now - lastRefresh < 100) return;
        lastRefresh = now;
        ui.walkabilityNodes = progress.nodes.toLocaleString();
        ui.walkabilityStatus = `${progress.expanded.toLocaleString()} expanded · ${progress.queued.toLocaleString()} queued`;
        panel.refresh();
      },
    });
    viewer.setWalkabilityVisible(true);
    ui.walkabilityStatus = walkability.statistics.truncated
      ? `Stopped at ${walkability.statistics.nodes.toLocaleString()} nodes`
      : `${walkability.statistics.nodes.toLocaleString()} nodes · ${walkability.statistics.components.toLocaleString()} components`;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      ui.walkabilityStatus = error instanceof Error ? error.message : String(error);
    }
  } finally {
    walkabilityGenerating = false;
    setWalkabilityUi(viewer.walkability, viewer.walkabilityVisible);
    panel.refresh();
  }
}

function downloadWalkability(): void {
  const walkability = viewer?.walkability;
  if (!walkability) return;
  const blob = new Blob([serializeWalkability(walkability)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const mapName = ui.map.replace(/\.bsp$/i, '').replace(/[^a-z0-9_-]+/gi, '-');
  const link = document.createElement('a');
  link.href = url;
  link.download = `${mapName || 'worldview'}.worldview-walkability.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  ui.walkabilityStatus = 'Sidecar downloaded';
  panel.refresh();
}

function setMovementMode(mode: 'walk' | 'fly'): void {
  try {
    viewer?.setMovementMode(mode);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
    if (viewer && viewer.movementMode !== 'none') ui.movementMode = viewer.movementMode;
    panel.refresh();
  }
}

function playMusic(entityIndex: number): void {
  void viewer?.playMusic(entityIndex).catch((error) => {
    setWarnings([...warningMessages, error instanceof Error ? error.message : String(error)]);
    panel.refresh();
  });
}

function overviewDimensions(value: string): readonly [number, number] {
  if (value === '1024x768') return [1024, 768];
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? [size, size] : [1024, 1024];
}

async function captureOverview(): Promise<void> {
  if (!viewer?.world) return;
  const [width, height] = overviewDimensions(ui.overviewSize);
  ui.overviewStatus = 'Rendering';
  panel.setOverviewEnabled(false);
  panel.refresh();
  try {
    const result = await viewer.captureOverview({
      width,
      height,
      lighting: ui.overviewLighting,
      rotation: ui.overviewRotation === 'auto' ? 'auto' : ui.overviewRotation === '90' ? 90 : 0,
      zMin: ui.overviewZMin,
      zMax: ui.overviewZMax,
      background: ui.overviewTransparent ? 'transparent' : [0.025, 0.035, 0.03, 1],
      cutaway: ui.overviewCutaway ? 'auto' : 'none',
    });
    const mapName = ui.map.replace(/\.bsp$/i, '').replace(/[^a-z0-9_-]+/gi, '-');
    const url = URL.createObjectURL(result.image);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${mapName || 'worldview'}-overview.png`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    const cutaway = ui.overviewCutaway && viewer.walkability ? ' · cutaway' : '';
    ui.overviewStatus = `${result.layout.width} × ${result.layout.height}, ${result.layout.rotation}°${cutaway}`;
  } catch (error) {
    ui.overviewStatus = error instanceof Error ? error.message : String(error);
  } finally {
    panel.setOverviewEnabled(Boolean(viewer?.world));
    panel.refresh();
  }
}

const panel = createControlPanel(elements.paneContainer, ui, fixtureOptions(), {
  captureOverview: () => void captureOverview(),
  clearWalkability: () => viewer?.setWalkability(null),
  downloadWalkability,
  enableAudio: () => void viewer?.enableAudio(),
  generateWalkability: () => void generateWalkabilityMap(),
  loadFixture,
  loadUrl: (source) => void load(source),
  openFiles: () => elements.localFiles.click(),
  openWalkability: () => elements.walkabilityFile.click(),
  playMusic,
  resetCamera: () => {
    if (spawnCamera) viewer?.setCamera(spawnCamera);
  },
  setAudioMuted: (muted) => viewer?.setAudioMuted(muted),
  setAudioVolume: (volume) => viewer?.setAudioVolume(volume),
  setFieldOfView: (fieldOfView) => viewer?.setCamera({ fieldOfView }),
  setMovement: (movement) => viewer?.setMovement(movement),
  setMovementMode,
  setMusicVolume: (volume) => viewer?.setMusicVolume(volume),
  setPlayerAudioVolume: (volume) => viewer?.setPlayerAudioVolume(volume),
  setReticle: (visible) => elements.shell.classList.toggle('hide-reticle', !visible),
  setWalkabilityVisible: (visible) => viewer?.setWalkabilityVisible(visible),
  stopMusic: () => viewer?.stopMusic(),
});

function updateReady(detail: ReadyDetail): void {
  const { diagnostics, world } = detail;
  readySequence += 1;
  elements.status.dataset.readySequence = String(readySequence);
  ui.format = `${diagnostics.format} / BSP${world.version}`;
  ui.triangles = diagnostics.triangles.toLocaleString();
  ui.faces = diagnostics.faces.toLocaleString();
  ui.batches = diagnostics.batches.toLocaleString();
  ui.materials = diagnostics.materials.toLocaleString();
  ui.lightmaps = diagnostics.lightmapPages.toLocaleString();
  ui.sprites = diagnostics.sprites.toLocaleString();
  ui.sounds = `${diagnostics.loadedSounds.toLocaleString()} ambient / ${diagnostics.loadedMusic.toLocaleString()} music / ${diagnostics.playerSounds.toLocaleString()} player`;

  const entitySupport = analyzeEntitySupport(world);
  ui.entities = `${entitySupport.counts.supported.toLocaleString()} supported / ${entitySupport.counts.partial.toLocaleString()} partial / ${entitySupport.counts.baked.toLocaleString()} baked / ${entitySupport.counts.skipped.toLocaleString()} skipped`;
  const incompleteEntities = entitySupport.classes.filter(
    ({ kind }) => kind === 'partial' || kind === 'skipped',
  );
  ui.skippedEntities =
    incompleteEntities.length === 0
      ? 'None'
      : incompleteEntities
          .map(({ classname, count, kind }) => `${classname} × ${count} (${kind})`)
          .join('\n');

  const musicOptions = Object.fromEntries(
    world.musicTracks.map((track) => [
      `${track.reference.basename}${track.targetName ? ` · ${track.targetName}` : ''}`,
      String(track.entityIndex),
    ]),
  );
  const selectedMusic = world.musicTracks[0] ? String(world.musicTracks[0].entityIndex) : '';
  panel.setMusicOptions(musicOptions, selectedMusic);
  ui.musicState = world.musicTracks.length > 0 ? 'Stopped' : 'No map music';
  panel.setMusicPlaying(false);
  ui.loadTime = `${diagnostics.loadMilliseconds.toFixed(0)} ms`;
  const overview = planOverview(world);
  ui.overviewZMin = Math.floor(overview.bounds.min[2]);
  ui.overviewZMax = Math.ceil(overview.bounds.max[2]);
  ui.overviewStatus = 'Ready · height slice';
  ui.walkabilityStatus = 'Not generated';
  ui.walkabilityNodes = '0';
  elements.metricsOutput.textContent = [
    ui.format,
    `${ui.triangles} triangles`,
    `${ui.faces} faces`,
    `${ui.batches} batches`,
    `${ui.materials} materials`,
    `${ui.lightmaps} lightmaps`,
    `${ui.sprites} sprites`,
    `${ui.sounds} sounds`,
  ].join(' ');
  elements.formatLabel.textContent = ui.format;
  if (pendingCamera) viewer!.setCamera(pendingCamera);
  spawnCamera = copyCamera(viewer!.camera);
  ui.fieldOfView = viewer!.camera.fieldOfView;
  if (viewer!.movementMode !== 'none') ui.movementMode = viewer!.movementMode;
  elements.shell.dataset.movementMode = viewer!.movementMode;
  panel.setResetCameraEnabled(true);
  panel.setOverviewEnabled(true);
  panel.setWalkabilityEnabled(true, false);
  setStatus(`Ready. ${ui.triangles} triangles in ${ui.loadTime}`, 'ready');
  panel.refresh();
}

elements.localFiles.addEventListener('change', () => {
  const source = elements.localFiles.files ? sourceFromFiles(elements.localFiles.files) : undefined;
  if (source) void load(source);
  else setStatus('Choose at least one BSP file', 'error');
  elements.localFiles.value = '';
});

elements.walkabilityFile.addEventListener('change', () => {
  const file = elements.walkabilityFile.files?.[0];
  if (file) {
    void file
      .text()
      .then((text) => applyWalkability(parseWalkability(text)))
      .catch((error) => {
        ui.walkabilityStatus = error instanceof Error ? error.message : String(error);
        panel.refresh();
      });
  }
  elements.walkabilityFile.value = '';
});

elements.shell.addEventListener('dragenter', (event) => {
  event.preventDefault();
  elements.dropMessage.hidden = false;
});
elements.shell.addEventListener('dragover', (event) => event.preventDefault());
elements.shell.addEventListener('dragleave', (event) => {
  if (!elements.shell.contains(event.relatedTarget as Node | null))
    elements.dropMessage.hidden = true;
});
elements.shell.addEventListener('drop', (event) => {
  event.preventDefault();
  elements.dropMessage.hidden = true;
  const source = event.dataTransfer?.files ? sourceFromFiles(event.dataTransfer.files) : undefined;
  if (source) void load(source);
  else setStatus('The drop did not include a BSP file', 'error');
});

if (!navigator.gpu) {
  setStatus('WebGPU is not available in this browser', 'error');
  elements.formatLabel.textContent = 'Worldview requires WebGPU';
  panel.setDisabled(true);
} else {
  try {
    viewer = await createWorldview({
      canvas: elements.canvas,
      controls: 'walk',
      maxDevicePixelRatio: 2,
    });
    viewer.start();
    viewer.addEventListener('progress', (event) => {
      setStatus(event.detail.label ? `Loading ${event.detail.label}` : 'Loading map', 'loading');
    });
    viewer.addEventListener('warning', (event) => {
      setWarnings([...warningMessages, event.detail.message]);
    });
    viewer.addEventListener('error', (event) => {
      const cause = 'cause' in event.detail.error ? event.detail.error.cause : undefined;
      const message = `${event.detail.error.message}${cause instanceof Error ? `: ${cause.message}` : ''}`;
      setStatus(message, 'error');
      elements.formatLabel.textContent = 'Map failed to load';
    });
    viewer.addEventListener('audiochange', (event) => {
      const audio = event.detail.state;
      ui.audioState = !audio.enabled
        ? 'Click viewport to enable'
        : audio.suspended
          ? 'Suspended'
          : 'Playing';
      ui.audioMuted = audio.muted;
      ui.audioVolume = audio.volume;
      ui.playerAudioVolume = audio.playerVolume;
      ui.musicVolume = audio.musicVolume;
      ui.musicState = audio.musicPlaying ? 'Playing' : 'Stopped';
      if (audio.musicEntityIndex !== null) ui.musicTrack = String(audio.musicEntityIndex);
      panel.setMusicPlaying(audio.musicPlaying);
      ui.roomType = audio.roomType === 0 ? '0 - off' : String(audio.roomType);
      panel.refresh();
    });
    viewer.addEventListener('movementchange', (event) => {
      if (event.detail.mode !== 'none') ui.movementMode = event.detail.mode;
      const movement = event.detail.settings;
      ui.maxSpeed = movement.maxSpeed;
      ui.accelerate = movement.accelerate;
      ui.airAccelerate = movement.airAccelerate;
      ui.friction = movement.friction;
      ui.stopSpeed = movement.stopSpeed;
      ui.mouseSensitivity = movement.mouseSensitivity;
      ui.mouseAcceleration = movement.mouseAcceleration;
      ui.viewBob = movement.viewBob;
      elements.shell.dataset.movementMode = event.detail.mode;
      panel.refresh();
    });
    viewer.addEventListener('walkabilitychange', (event) => {
      setWalkabilityUi(event.detail.walkability, event.detail.visible);
      panel.refresh();
    });
    viewer.addEventListener('ready', (event) => updateReady(event.detail));

    const initialRequest = requestFromUrl(new URLSearchParams(location.search));
    if (initialRequest && 'error' in initialRequest) {
      setStatus(initialRequest.error, 'error');
    } else if (initialRequest) {
      if (initialRequest.fixture) ui.fixture = initialRequest.fixture.id;
      if (typeof initialRequest.source.bsp === 'string') ui.bspUrl = initialRequest.source.bsp;
      ui.gameBaseUrl = String(initialRequest.source.gameBaseUrl ?? '');
      ui.paletteUrl = String(initialRequest.source.palette ?? '');
      ui.wadBaseUrl = String(initialRequest.source.wadBaseUrl ?? '');
      ui.skyboxBaseUrl = String(initialRequest.source.skyboxBaseUrl ?? '');
      ui.spriteBaseUrl = String(initialRequest.source.spriteBaseUrl ?? '');
      ui.soundBaseUrl = String(initialRequest.source.soundBaseUrl ?? '');
      void load(initialRequest.source, initialRequest.camera, initialRequest.fixture?.walkability);
      panel.refresh();
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
    elements.formatLabel.textContent = 'WebGPU setup failed';
    panel.setDisabled(true);
  }
}

const cameraTimer = window.setInterval(() => {
  if (!viewer) return;
  const camera = viewer.camera;
  ui.position = camera.position.map((value) => value.toFixed(1)).join(' / ');
  ui.angles = `${((camera.yaw * 180) / Math.PI).toFixed(1)} / ${((camera.pitch * 180) / Math.PI).toFixed(1)}`;
}, 100);

window.addEventListener(
  'pagehide',
  () => {
    window.clearInterval(cameraTimer);
    viewer?.dispose();
    panel.dispose();
  },
  { once: true },
);
