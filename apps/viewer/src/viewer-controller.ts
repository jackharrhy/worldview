import {
  analyzeEntitySupport,
  createWorldview,
  planOverview,
  type CameraState,
  type ReadyDetail,
  type WorldSource,
  type WorldviewMovementMode,
  type WorldviewMovementUpdate,
  type WorldviewViewer,
} from '@jackharrhy/worldview';
import type { SnapshotStore } from '@jackharrhy/worldview/runtime';
import { serializeWalkability, type WalkabilityMap } from '@jackharrhy/worldview/walkability';

import { fixtureById } from './fixture-catalog.js';
import { requestFromUrl } from './url-request.js';
import type { ViewerSnapshot } from './viewer-state.js';
import { sourceFromFiles, sourceName } from './world-input.js';

function copyCamera(camera: CameraState): CameraState {
  return { ...camera, position: [...camera.position] };
}

function overviewDimensions(value: string): readonly [number, number] {
  if (value === '1024x768') return [1024, 768];
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? [size, size] : [1024, 1024];
}

export class ViewerController {
  private viewer: WorldviewViewer | null = null;
  private spawnCamera: CameraState | null = null;
  private pendingCamera: CameraState | null = null;
  private warningMessages: string[] = [];
  private mapLoadSequence = 0;
  private cameraTimer: number | null = null;
  private attachedCanvas: HTMLCanvasElement | null = null;
  private attachmentGeneration = 0;
  private disposed = false;

  public constructor(private readonly store: SnapshotStore<ViewerSnapshot>) {}

  public setField<Key extends keyof ViewerSnapshot>(key: Key, value: ViewerSnapshot[Key]): void {
    this.store.update((current) => ({ ...current, [key]: value }));
  }

  /** React callback ref: canvas attachment owns the WebGPU runtime without a component effect. */
  public readonly attachCanvas = (canvas: HTMLCanvasElement | null): void | (() => void) => {
    if (!canvas) return;
    const generation = ++this.attachmentGeneration;
    this.releaseViewer();
    this.attachedCanvas = canvas;
    void this.start(canvas, generation);
    return () => {
      if (this.attachedCanvas !== canvas) return;
      this.attachmentGeneration += 1;
      this.attachedCanvas = null;
      this.releaseViewer();
    };
  };

  private async start(canvas: HTMLCanvasElement, generation: number): Promise<void> {
    if (this.disposed || this.viewer) return;
    if (!navigator.gpu) {
      this.patch({
        controlsDisabled: true,
        formatLabel: 'Worldview requires WebGPU',
        shellState: 'error',
        status: 'WebGPU is not available in this browser',
      });
      return;
    }
    try {
      const viewer = await createWorldview({ canvas, controls: 'walk', maxDevicePixelRatio: 2 });
      if (
        this.disposed ||
        generation !== this.attachmentGeneration ||
        this.attachedCanvas !== canvas
      ) {
        viewer.dispose();
        return;
      }
      this.viewer = viewer;
      viewer.start();
      viewer.addEventListener('progress', (event) => {
        this.setStatus(
          event.detail.label ? `Loading ${event.detail.label}` : 'Loading map',
          'loading',
        );
      });
      viewer.addEventListener('warning', (event) => {
        this.setWarnings([...this.warningMessages, event.detail.message]);
      });
      viewer.addEventListener('error', (event) => {
        const cause = 'cause' in event.detail.error ? event.detail.error.cause : undefined;
        const message = `${event.detail.error.message}${cause instanceof Error ? `: ${cause.message}` : ''}`;
        this.patch({ formatLabel: 'Map failed to load' });
        this.setStatus(message, 'error');
      });
      viewer.addEventListener('audiochange', (event) => {
        const audio = event.detail.state;
        this.patch({
          audioState: !audio.enabled
            ? 'Click viewport to enable'
            : audio.suspended
              ? 'Suspended'
              : 'Playing',
          audioMuted: audio.muted,
          audioVolume: audio.volume,
          playerAudioVolume: audio.playerVolume,
          musicVolume: audio.musicVolume,
          musicState: audio.musicPlaying ? 'Playing' : 'Stopped',
          musicPlaying: audio.musicPlaying,
          ...(audio.musicEntityIndex === null
            ? {}
            : {
                musicTrack:
                  this.snapshot.musicOptions.find(
                    (option) => option.entityIndex === audio.musicEntityIndex,
                  )?.label ?? this.snapshot.musicTrack,
              }),
          roomType: audio.roomType === 0 ? '0 - off' : String(audio.roomType),
        });
      });
      viewer.addEventListener('movementchange', (event) => {
        const movement = event.detail.settings;
        this.patch({
          ...(event.detail.mode === 'none' ? {} : { movementMode: event.detail.mode }),
          maxSpeed: movement.maxSpeed,
          accelerate: movement.accelerate,
          airAccelerate: movement.airAccelerate,
          friction: movement.friction,
          stopSpeed: movement.stopSpeed,
          mouseSensitivity: movement.mouseSensitivity,
          mouseAcceleration: movement.mouseAcceleration,
          viewBob: movement.viewBob,
        });
      });
      viewer.addEventListener('walkabilitychange', (event) => {
        this.setWalkabilityUi(event.detail.walkability, event.detail.visible);
      });
      viewer.addEventListener('ready', (event) => this.updateReady(event.detail));
      this.cameraTimer = window.setInterval(() => this.updateCameraReadout(), 100);
      this.loadInitialRequest();
    } catch (error) {
      if (
        this.disposed ||
        generation !== this.attachmentGeneration ||
        this.attachedCanvas !== canvas
      ) {
        return;
      }
      this.patch({ controlsDisabled: true, formatLabel: 'WebGPU setup failed' });
      this.setStatus(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.attachmentGeneration += 1;
    this.attachedCanvas = null;
    this.releaseViewer();
  }

  private releaseViewer(): void {
    if (this.cameraTimer !== null) {
      window.clearInterval(this.cameraTimer);
      this.cameraTimer = null;
    }
    this.viewer?.dispose();
    this.viewer = null;
    this.spawnCamera = null;
    this.pendingCamera = null;
  }

  public setDropActive(active: boolean): void {
    this.patch({ dropActive: active });
  }

  public async loadFixture(id = this.snapshot.fixture): Promise<void> {
    const fixture = fixtureById(id);
    if (fixture) await this.load(fixture.source, fixture.camera, fixture.walkability);
    else this.setStatus(`Fixture ${id} was not found`, 'error');
  }

  public async loadUrl(): Promise<void> {
    const state = this.snapshot;
    const bsp = state.bspUrl.trim();
    if (!bsp) return;
    const source: WorldSource = {
      bsp,
      ...(state.gameBaseUrl.trim() ? { gameBaseUrl: state.gameBaseUrl.trim() } : {}),
      ...(state.paletteUrl.trim() ? { palette: state.paletteUrl.trim() } : {}),
      ...(state.wadBaseUrl.trim() ? { wadBaseUrl: state.wadBaseUrl.trim() } : {}),
      ...(state.skyboxBaseUrl.trim() ? { skyboxBaseUrl: state.skyboxBaseUrl.trim() } : {}),
      ...(state.spriteBaseUrl.trim() ? { spriteBaseUrl: state.spriteBaseUrl.trim() } : {}),
      ...(state.soundBaseUrl.trim() ? { soundBaseUrl: state.soundBaseUrl.trim() } : {}),
    };
    await this.load(source);
  }

  public async loadLocalFiles(files: FileList | null): Promise<void> {
    const source = files ? sourceFromFiles(files) : undefined;
    if (source) await this.load(source);
    else this.setStatus('Choose at least one BSP file', 'error');
  }

  public async loadDroppedFiles(files: FileList | null): Promise<void> {
    this.setDropActive(false);
    const source = files ? sourceFromFiles(files) : undefined;
    if (source) await this.load(source);
    else this.setStatus('The drop did not include a BSP file', 'error');
  }

  public async loadWalkabilityFile(file: File | undefined): Promise<void> {
    const viewer = this.viewer;
    if (!file || !viewer) return;
    try {
      this.revealWalkability(await viewer.loadWalkability(file));
    } catch (error) {
      this.patch({ walkabilityStatus: error instanceof Error ? error.message : String(error) });
    }
  }

  public async generateWalkability(): Promise<void> {
    const viewer = this.viewer;
    if (!viewer?.world || this.snapshot.walkabilityGenerating) return;
    this.patch({ walkabilityGenerating: true, walkabilityStatus: 'Starting' });
    let lastRefresh = 0;
    try {
      const walkability = await viewer.generateWalkability({
        spacing: this.snapshot.walkabilitySpacing,
        allowJump: this.snapshot.walkabilityJump,
        yieldEvery: 16,
        onProgress: (progress) => {
          const now = performance.now();
          if (now - lastRefresh < 100) return;
          lastRefresh = now;
          this.patch({
            walkabilityNodes: progress.nodes.toLocaleString(),
            walkabilityStatus: `${progress.expanded.toLocaleString()} expanded · ${progress.queued.toLocaleString()} queued`,
          });
        },
      });
      viewer.setWalkabilityVisible(true);
      this.patch({
        walkabilityStatus: walkability.statistics.truncated
          ? `Stopped at ${walkability.statistics.nodes.toLocaleString()} nodes`
          : `${walkability.statistics.nodes.toLocaleString()} nodes · ${walkability.statistics.components.toLocaleString()} components`,
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.patch({ walkabilityStatus: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      this.patch({ walkabilityGenerating: false });
      this.setWalkabilityUi(viewer.walkability, viewer.walkabilityVisible);
    }
  }

  public downloadWalkability(): void {
    const walkability = this.viewer?.walkability;
    if (!walkability) return;
    this.download(
      new Blob([serializeWalkability(walkability)], { type: 'application/json' }),
      `${this.safeMapName()}.worldview-walkability.json`,
    );
    this.patch({ walkabilityStatus: 'Sidecar downloaded' });
  }

  public clearWalkability(): void {
    this.viewer?.setWalkability(null);
  }

  public setWalkabilityVisible(visible: boolean): void {
    this.viewer?.setWalkabilityVisible(visible);
  }

  public async captureOverview(): Promise<void> {
    const viewer = this.viewer;
    if (!viewer?.world) return;
    const state = this.snapshot;
    const [width, height] = overviewDimensions(state.overviewSize);
    this.patch({ overviewEnabled: false, overviewStatus: 'Rendering' });
    try {
      const result = await viewer.captureOverview({
        width,
        height,
        lighting: state.overviewLighting,
        rotation:
          state.overviewRotation === 'auto' ? 'auto' : state.overviewRotation === '90' ? 90 : 0,
        zMin: state.overviewZMin,
        zMax: state.overviewZMax,
        background: state.overviewTransparent ? 'transparent' : [0.025, 0.035, 0.03, 1],
        cutaway: state.overviewCutaway ? 'auto' : 'none',
      });
      this.download(result.image, `${this.safeMapName()}-overview.png`);
      const cutaway = state.overviewCutaway && viewer.walkability ? ' · cutaway' : '';
      this.patch({
        overviewStatus: `${result.layout.width} × ${result.layout.height}, ${result.layout.rotation}°${cutaway}`,
      });
    } catch (error) {
      this.patch({ overviewStatus: error instanceof Error ? error.message : String(error) });
    } finally {
      this.patch({ overviewEnabled: Boolean(viewer.world) });
    }
  }

  public resetCamera(): void {
    if (this.spawnCamera) this.viewer?.setCamera(this.spawnCamera);
  }

  public setMovementMode(mode: Exclude<WorldviewMovementMode, 'none'>): void {
    try {
      this.viewer?.setMovementMode(mode);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error), 'error');
      const currentMode = this.viewer?.movementMode;
      if (currentMode && currentMode !== 'none') this.patch({ movementMode: currentMode });
    }
  }

  public setMovement(update: WorldviewMovementUpdate): void {
    this.viewer?.setMovement(update);
  }

  public setFieldOfView(fieldOfView: number): void {
    this.viewer?.setCamera({ fieldOfView });
  }

  public async enableAudio(): Promise<void> {
    await this.viewer?.enableAudio();
  }

  public setAudioMuted(muted: boolean): void {
    this.viewer?.setAudioMuted(muted);
  }

  public setAudioVolume(volume: number): void {
    this.viewer?.setAudioVolume(volume);
  }

  public setPlayerAudioVolume(volume: number): void {
    this.viewer?.setPlayerAudioVolume(volume);
  }

  public setMusicVolume(volume: number): void {
    this.viewer?.setMusicVolume(volume);
  }

  public async playMusic(): Promise<void> {
    const option = this.snapshot.musicOptions.find(
      (candidate) => candidate.label === this.snapshot.musicTrack,
    );
    if (!option) return;
    try {
      await this.viewer?.playMusic(option.entityIndex);
    } catch (error) {
      this.setWarnings([
        ...this.warningMessages,
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }

  public stopMusic(): void {
    this.viewer?.stopMusic();
  }

  private get snapshot(): ViewerSnapshot {
    return this.store.getSnapshot();
  }

  private patch(patch: Partial<ViewerSnapshot>): void {
    this.store.update((current) => ({ ...current, ...patch }));
  }

  private setStatus(status: string, shellState: ViewerSnapshot['shellState'] = 'idle'): void {
    this.patch({ status, shellState });
  }

  private setWarnings(messages: readonly string[]): void {
    this.warningMessages = [...messages];
    this.patch({ warnings: messages.length > 0 ? messages.join('\n') : 'None' });
  }

  private setWalkabilityUi(walkability: WalkabilityMap | null, visible: boolean): void {
    const state = this.snapshot;
    this.patch({
      hasWalkability: Boolean(walkability),
      walkabilityNodes: walkability?.statistics.nodes.toLocaleString() ?? '0',
      walkabilityVisible: visible,
      ...(!walkability && !state.walkabilityGenerating
        ? { walkabilityStatus: 'Not generated' }
        : {}),
      ...(this.viewer?.world && state.overviewStatus !== 'Rendering'
        ? {
            overviewStatus: walkability ? 'Ready · walkability cutaway' : 'Ready · height slice',
          }
        : {}),
    });
  }

  private revealWalkability(walkability: WalkabilityMap): void {
    if (!this.viewer) return;
    this.viewer.setWalkabilityVisible(true);
    this.patch({
      walkabilityStatus: `${walkability.statistics.nodes.toLocaleString()} nodes · ${walkability.statistics.components.toLocaleString()} components`,
    });
  }

  private async load(
    source: WorldSource,
    camera?: CameraState,
    walkabilityUrl?: string,
  ): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    const sequence = ++this.mapLoadSequence;
    this.pendingCamera = camera ?? null;
    const name = sourceName(source);
    this.setWarnings([]);
    this.patch({
      map: name,
      mapName: name,
      formatLabel: 'Reading map data',
      overviewEnabled: false,
      overviewStatus: 'Loading map',
      walkabilityStatus: 'Loading map',
      walkabilityNodes: '0',
      mapLoaded: false,
    });
    this.setStatus('Loading map', 'loading');
    try {
      await viewer.load(source);
      if (walkabilityUrl && sequence === this.mapLoadSequence) {
        try {
          await this.loadWalkabilityUrl(walkabilityUrl, sequence);
        } catch (error) {
          if (sequence !== this.mapLoadSequence) return;
          const message = error instanceof Error ? error.message : String(error);
          this.patch({ walkabilityStatus: 'Sidecar rejected' });
          this.setWarnings([...this.warningMessages, `walkability sidecar: ${message}`]);
        }
      }
    } catch {
      // The viewer error event supplies the visible error.
    }
  }

  private async loadWalkabilityUrl(url: string, sequence: number): Promise<void> {
    const viewer = this.viewer;
    if (!viewer?.world) return;
    this.patch({ walkabilityStatus: 'Loading sidecar' });
    const walkability = await viewer.loadWalkability(url);
    if (sequence !== this.mapLoadSequence) return;
    this.revealWalkability(walkability);
    this.patch({
      walkabilityStatus: `Loaded ${walkability.statistics.nodes.toLocaleString()} nodes`,
    });
  }

  private updateReady(detail: ReadyDetail): void {
    const { diagnostics, world } = detail;
    const entitySupport = analyzeEntitySupport(world);
    const incompleteEntities = entitySupport.classes.filter(
      ({ kind }) => kind === 'partial' || kind === 'skipped',
    );
    const musicOptions = world.musicTracks.map((track) => ({
      label: `${track.reference.basename}${track.targetName ? ` · ${track.targetName}` : ''}`,
      entityIndex: track.entityIndex,
    }));
    const overview = planOverview(world);
    const format = `${diagnostics.format} / BSP${world.version}`;
    const triangles = diagnostics.triangles.toLocaleString();
    const faces = diagnostics.faces.toLocaleString();
    const batches = diagnostics.batches.toLocaleString();
    const materials = diagnostics.materials.toLocaleString();
    const lightmaps = diagnostics.lightmapPages.toLocaleString();
    const sprites = diagnostics.sprites.toLocaleString();
    const sounds = `${diagnostics.loadedSounds.toLocaleString()} ambient / ${diagnostics.loadedMusic.toLocaleString()} music / ${diagnostics.playerSounds.toLocaleString()} player`;
    const loadTime = `${diagnostics.loadMilliseconds.toFixed(0)} ms`;
    if (this.pendingCamera) this.viewer!.setCamera(this.pendingCamera);
    this.spawnCamera = copyCamera(this.viewer!.camera);
    this.patch({
      readySequence: this.snapshot.readySequence + 1,
      format,
      formatLabel: format,
      triangles,
      faces,
      batches,
      materials,
      lightmaps,
      sprites,
      sounds,
      entities: `${entitySupport.counts.supported.toLocaleString()} supported / ${entitySupport.counts.partial.toLocaleString()} partial / ${entitySupport.counts.baked.toLocaleString()} baked / ${entitySupport.counts.skipped.toLocaleString()} skipped`,
      skippedEntities:
        incompleteEntities.length === 0
          ? 'None'
          : incompleteEntities
              .map(({ classname, count, kind }) => `${classname} × ${count} (${kind})`)
              .join('\n'),
      loadTime,
      metrics: [
        format,
        `${triangles} triangles`,
        `${faces} faces`,
        `${batches} batches`,
        `${materials} materials`,
        `${lightmaps} lightmaps`,
        `${sprites} sprites`,
        `${sounds} sounds`,
      ].join(' '),
      fieldOfView: this.viewer!.camera.fieldOfView,
      ...(this.viewer!.movementMode === 'none' ? {} : { movementMode: this.viewer!.movementMode }),
      musicOptions,
      musicTrack: musicOptions[0]?.label ?? '',
      musicState: musicOptions.length > 0 ? 'Stopped' : 'No map music',
      overviewZMin: Math.floor(overview.bounds.min[2]),
      overviewZMax: Math.ceil(overview.bounds.max[2]),
      overviewStatus: 'Ready · height slice',
      walkabilityStatus: 'Not generated',
      walkabilityNodes: '0',
      mapLoaded: true,
      resetCameraEnabled: true,
      overviewEnabled: true,
    });
    this.setStatus(`Ready. ${triangles} triangles in ${loadTime}`, 'ready');
  }

  private loadInitialRequest(): void {
    const initialRequest = requestFromUrl(new URLSearchParams(location.search));
    if (initialRequest && 'error' in initialRequest) {
      this.setStatus(initialRequest.error, 'error');
      return;
    }
    if (!initialRequest) return;
    this.patch({
      ...(initialRequest.fixture ? { fixture: initialRequest.fixture.id } : {}),
      ...(typeof initialRequest.source.bsp === 'string'
        ? { bspUrl: initialRequest.source.bsp }
        : {}),
      gameBaseUrl: String(initialRequest.source.gameBaseUrl ?? ''),
      paletteUrl: String(initialRequest.source.palette ?? ''),
      wadBaseUrl: String(initialRequest.source.wadBaseUrl ?? ''),
      skyboxBaseUrl: String(initialRequest.source.skyboxBaseUrl ?? ''),
      spriteBaseUrl: String(initialRequest.source.spriteBaseUrl ?? ''),
      soundBaseUrl: String(initialRequest.source.soundBaseUrl ?? ''),
    });
    void this.load(
      initialRequest.source,
      initialRequest.camera,
      initialRequest.fixture?.walkability,
    );
  }

  private updateCameraReadout(): void {
    if (!this.viewer) return;
    const camera = this.viewer.camera;
    this.patch({
      position: camera.position.map((value) => value.toFixed(1)).join(' / '),
      angles: `${((camera.yaw * 180) / Math.PI).toFixed(1)} / ${((camera.pitch * 180) / Math.PI).toFixed(1)}`,
    });
  }

  private safeMapName(): string {
    return this.snapshot.map.replace(/\.bsp$/i, '').replace(/[^a-z0-9_-]+/gi, '-') || 'worldview';
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
