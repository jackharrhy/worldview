import { expect, test } from '@playwright/test';
import { syntheticGoldSrcAudioBsp, syntheticGoldSrcWave } from '../../apps/viewer/src/synthetic.js';
import type { WorldViewElement } from '@jackharrhy/worldview/element';

declare global {
  interface Window {
    worldviewInputProbe: {
      element: WorldViewElement;
      context: AudioContext | null;
      analyser: AnalyserNode | null;
      resumeGestures: boolean[];
      starts: number;
      ready: number;
      looks: { yaw: number; pitch: number; trusted: boolean }[];
    };
  }
}

for (const timing of ['after loading', 'while loading'] as const) {
  test(`embedded viewer captures mouse look and audible sound on a click ${timing} @ci-smoke`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let releaseMap!: () => void;
    const mapGate = new Promise<void>((resolve) => (releaseMap = resolve));
    if (timing === 'after loading') releaseMap();
    await page.route('**/embedded-input.html', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<body style="margin:0"></body>' }),
    );
    await page.route('**/input.bsp', async (route) => {
      await mapGate;
      await route.fulfill({ body: Buffer.from(syntheticGoldSrcAudioBsp()) });
    });
    await page.goto('http://127.0.0.1:4173/embedded-input.html');
    await page.evaluate(
      async ({ entrypoint, wave }) => {
        await import(entrypoint);
        const element = document.createElement('world-view') as WorldViewElement;
        const probe: Window['worldviewInputProbe'] = {
          element,
          context: null,
          analyser: null,
          resumeGestures: [],
          starts: 0,
          ready: 0,
          looks: [],
        };
        window.worldviewInputProbe = probe;
        const createGain = AudioContext.prototype.createGain;
        AudioContext.prototype.createGain = function () {
          const gain = createGain.call(this);
          if (!probe.context) {
            probe.context = this;
            probe.analyser = this.createAnalyser();
            gain.connect(probe.analyser);
          }
          return gain;
        };
        const resume = AudioContext.prototype.resume;
        AudioContext.prototype.resume = function () {
          probe.resumeGestures.push(navigator.userActivation.isActive);
          return resume.call(this);
        };
        const start = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (...args) {
          probe.starts += 1;
          return start.apply(this, args);
        };
        element.style.height = '480px';
        element.setAttribute('controls', 'fly');
        element.source = {
          bsp: '/input.bsp',
          sounds: {
            'ambience/tone.wav': new Uint8Array(wave),
            'music/tone.wav': new Uint8Array(wave),
          },
        };
        element.addEventListener('ready', () => (probe.ready += 1));
        // Headless Chromium's recentering moves can undo the final camera delta.
        element.addEventListener('mousemove', (event) => {
          const mouse = event as MouseEvent;
          if (element.viewer && (mouse.movementX || mouse.movementY)) {
            const { yaw, pitch } = element.viewer.camera;
            probe.looks.push({ yaw, pitch, trusted: mouse.isTrusted });
          }
        });
        document.body.append(element);
      },
      { entrypoint: '/standalone.js', wave: [...syntheticGoldSrcWave()] },
    );
    await expect
      .poll(() => page.evaluate(() => Boolean(window.worldviewInputProbe.element.viewer)))
      .toBe(true);
    if (timing === 'after loading')
      await expect.poll(() => page.evaluate(() => window.worldviewInputProbe.ready)).toBe(1);
    expect(await page.evaluate(() => window.worldviewInputProbe.context)).toBeNull();

    const canvas = page.locator('world-view canvas');
    await canvas.click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const element = window.worldviewInputProbe.element;
          return (
            document.pointerLockElement === element &&
            element.shadowRoot!.pointerLockElement === element.shadowRoot!.querySelector('canvas')
          );
        }),
      )
      .toBe(true);
    releaseMap();
    await expect.poll(() => page.evaluate(() => window.worldviewInputProbe.ready)).toBe(1);
    await expect
      .poll(() => page.evaluate(() => window.worldviewInputProbe.element.viewer!.audio))
      .toMatchObject({
        enabled: true,
        suspended: false,
      });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const analyser = window.worldviewInputProbe.analyser!;
          const samples = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(samples);
          return Math.max(...samples.map(Math.abs));
        }),
      )
      .toBeGreaterThan(0.001);
    expect(await page.evaluate(() => window.worldviewInputProbe.resumeGestures)).toEqual([true]);

    const camera = await page.evaluate(() => {
      window.worldviewInputProbe.looks = [];
      return window.worldviewInputProbe.element.viewer!.camera;
    });
    await page.mouse.move(600, 200);
    await page.mouse.move(650, 230, { steps: 3 });
    expect(
      await page.evaluate(
        (before) =>
          window.worldviewInputProbe.looks.some(
            (look) => look.trusted && look.yaw !== before.yaw && look.pitch !== before.pitch,
          ),
        camera,
      ),
    ).toBe(true);

    await page.evaluate(async () => {
      document.exitPointerLock();
      await window.worldviewInputProbe.context!.suspend();
    });
    await expect
      .poll(() => page.evaluate(() => window.worldviewInputProbe.element.viewer!.audio.suspended))
      .toBe(true);
    await canvas.click();
    await expect
      .poll(() => page.evaluate(() => window.worldviewInputProbe.element.viewer!.audio.suspended))
      .toBe(false);
    expect(
      await page.evaluate(() => ({
        ready: window.worldviewInputProbe.ready,
        starts: window.worldviewInputProbe.starts,
        resumes: window.worldviewInputProbe.resumeGestures,
      })),
    ).toEqual({ ready: 1, starts: 1, resumes: [true, true] });
    expect(errors).toEqual([]);
  });
}
