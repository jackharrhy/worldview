import { createWorldview } from '../viewer/viewer.js';
import type { BinarySource, WorldSource, WorldviewViewer } from '../viewer/types.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      color-scheme: light dark;
      display: block;
      position: relative;
      min-block-size: 18rem;
      overflow: hidden;
      background: #07100c;
      contain: content;
    }

    canvas {
      display: block;
      inline-size: 100%;
      block-size: 100%;
      min-block-size: inherit;
      outline: none;
    }

    canvas:focus-visible {
      box-shadow: inset 0 0 0 2px #8cffb0;
    }

    [part='status'] {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 1.5rem;
      color: #d9f4df;
      background: color-mix(in srgb, #07100c 88%, transparent);
      font: 600 0.75rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.08em;
      text-align: center;
      text-transform: uppercase;
      pointer-events: none;
    }

    [part='status'][hidden] {
      display: none;
    }

    @media (prefers-color-scheme: light) {
      :host { background: #d9ddcf; }
      [part='status'] { color: #163524; background: color-mix(in srgb, #eef0e6 88%, transparent); }
    }
  </style>
  <canvas part="canvas" aria-label="Interactive Quake or GoldSrc map"></canvas>
  <div part="status" role="status" aria-live="polite">Waiting for a BSP source</div>
`;

function booleanAttribute(element: Element, name: string, fallback: boolean): boolean {
  if (!element.hasAttribute(name)) return fallback;
  return element.getAttribute(name)?.toLowerCase() !== 'false';
}

export class WorldViewElement extends HTMLElement {
  public static readonly observedAttributes = [
    'src',
    'game-base-url',
    'palette-src',
    'wad-base-url',
    'skybox-base-url',
    'sprite-base-url',
    'sound-base-url',
    'controls',
    'autostart',
    'audio',
    'audio-volume',
    'music-volume',
    'max-dpr',
  ];

  private readonly canvasElement: HTMLCanvasElement;
  private readonly statusElement: HTMLDivElement;
  private activeViewer: WorldviewViewer | null = null;
  private controller: AbortController | null = null;
  private explicitWads: readonly BinarySource[] = [];
  private explicitSprites: Readonly<Record<string, BinarySource>> = {};
  private explicitSounds: Readonly<Record<string, BinarySource>> = {};
  private generation = 0;

  public constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.append(template.content.cloneNode(true));
    this.canvasElement = shadow.querySelector('canvas')!;
    this.statusElement = shadow.querySelector('[part="status"]')!;
  }

  public get viewer(): WorldviewViewer | null {
    return this.activeViewer;
  }

  public get wads(): readonly BinarySource[] {
    return this.explicitWads;
  }

  public set wads(value: readonly BinarySource[]) {
    this.explicitWads = [...value];
    if (this.isConnected) void this.initialize();
  }

  public get sprites(): Readonly<Record<string, BinarySource>> {
    return this.explicitSprites;
  }

  public set sprites(value: Readonly<Record<string, BinarySource>>) {
    this.explicitSprites = { ...value };
    if (this.isConnected) void this.initialize();
  }

  public get sounds(): Readonly<Record<string, BinarySource>> {
    return this.explicitSounds;
  }

  public set sounds(value: Readonly<Record<string, BinarySource>>) {
    this.explicitSounds = { ...value };
    if (this.isConnected) void this.initialize();
  }

  public connectedCallback(): void {
    void this.initialize();
  }

  public disconnectedCallback(): void {
    this.generation += 1;
    this.controller?.abort(new DOMException('Element disconnected', 'AbortError'));
    this.controller = null;
    this.activeViewer?.dispose();
    this.activeViewer = null;
  }

  public attributeChangedCallback(
    name: string,
    previous: string | null,
    value: string | null,
  ): void {
    if (!this.isConnected || previous === value) return;
    if (this.activeViewer && (name === 'audio-volume' || name === 'music-volume')) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        if (name === 'audio-volume') this.activeViewer.setAudioVolume(parsed);
        else this.activeViewer.setMusicVolume(parsed);
      }
      return;
    }
    void this.initialize();
  }

  private source(): WorldSource | undefined {
    const bsp = this.getAttribute('src');
    if (!bsp) return undefined;
    const gameBaseUrl = this.getAttribute('game-base-url');
    const palette = this.getAttribute('palette-src');
    const wadBaseUrl = this.getAttribute('wad-base-url');
    const skyboxBaseUrl = this.getAttribute('skybox-base-url');
    const spriteBaseUrl = this.getAttribute('sprite-base-url');
    const soundBaseUrl = this.getAttribute('sound-base-url');
    return {
      bsp,
      ...(gameBaseUrl ? { gameBaseUrl } : {}),
      ...(palette ? { palette } : {}),
      ...(wadBaseUrl ? { wadBaseUrl } : {}),
      ...(skyboxBaseUrl ? { skyboxBaseUrl } : {}),
      ...(spriteBaseUrl ? { spriteBaseUrl } : {}),
      ...(soundBaseUrl ? { soundBaseUrl } : {}),
      ...(this.explicitWads.length > 0 ? { wads: this.explicitWads } : {}),
      ...(Object.keys(this.explicitSprites).length > 0 ? { sprites: this.explicitSprites } : {}),
      ...(Object.keys(this.explicitSounds).length > 0 ? { sounds: this.explicitSounds } : {}),
    };
  }

  private async initialize(): Promise<void> {
    const generation = ++this.generation;
    this.controller?.abort(new DOMException('Element attributes changed', 'AbortError'));
    this.activeViewer?.dispose();
    this.activeViewer = null;
    const controller = new AbortController();
    this.controller = controller;
    const source = this.source();
    this.show(source ? 'Initializing WebGPU' : 'Waiting for a BSP source');

    try {
      const maxDprValue = Number(this.getAttribute('max-dpr') ?? 2);
      const audioVolumeValue = Number(this.getAttribute('audio-volume') ?? 0.8);
      const musicVolumeValue = Number(this.getAttribute('music-volume') ?? 1);
      const viewer = await createWorldview({
        canvas: this.canvasElement,
        controls:
          this.getAttribute('controls') === 'none'
            ? 'none'
            : this.getAttribute('controls') === 'fly'
              ? 'fly'
              : 'walk',
        autoStart: booleanAttribute(this, 'autostart', true),
        maxDevicePixelRatio: Number.isFinite(maxDprValue) ? maxDprValue : 2,
        audio: booleanAttribute(this, 'audio', true),
        audioVolume: Number.isFinite(audioVolumeValue) ? audioVolumeValue : 0.8,
        musicVolume: Number.isFinite(musicVolumeValue) ? musicVolumeValue : 1,
        signal: controller.signal,
      });
      if (generation !== this.generation || !this.isConnected) {
        viewer.dispose();
        return;
      }
      this.activeViewer = viewer;
      this.mirrorEvents(viewer);
      if (source) await viewer.load(source, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      this.show(message);
      if (!this.activeViewer) {
        this.dispatchEvent(
          new CustomEvent('error', {
            detail: { error: error instanceof Error ? error : new Error(message) },
            bubbles: true,
            composed: true,
          }),
        );
      }
    }
  }

  private mirrorEvents(viewer: WorldviewViewer): void {
    viewer.addEventListener('progress', (event) => {
      this.show(`${event.detail.phase}: ${event.detail.label ?? 'loading'}`);
      this.redispatch('progress', event.detail);
    });
    viewer.addEventListener('ready', (event) => {
      this.statusElement.hidden = true;
      this.redispatch('ready', event.detail);
    });
    viewer.addEventListener('warning', (event) => this.redispatch('warning', event.detail));
    viewer.addEventListener('audiochange', (event) => this.redispatch('audiochange', event.detail));
    viewer.addEventListener('movementchange', (event) =>
      this.redispatch('movementchange', event.detail),
    );
    viewer.addEventListener('error', (event) => {
      this.show(event.detail.error.message);
      this.redispatch('error', event.detail);
    });
  }

  private redispatch(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private show(message: string): void {
    this.statusElement.textContent = message;
    this.statusElement.hidden = false;
  }
}

export function defineWorldViewElement(tagName = 'world-view'): void {
  if (!customElements.get(tagName)) customElements.define(tagName, WorldViewElement);
}
