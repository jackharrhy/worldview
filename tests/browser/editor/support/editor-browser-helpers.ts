import { expect, type Locator, type Page } from '@playwright/test';
import {
  createStarterDocument,
  parseMap,
  serializeMap,
} from '../../../../packages/worldview-editor/src/core/index.js';

function normalizeTestVector(value: readonly number[]): number[] {
  const magnitude = Math.hypot(...value);
  return value.map((component) => component / magnitude);
}

function crossTestVectors(left: readonly number[], right: readonly number[]): number[] {
  return [
    left[1]! * right[2]! - left[2]! * right[1]!,
    left[2]! * right[0]! - left[0]! * right[2]!,
    left[0]! * right[1]! - left[1]! * right[0]!,
  ];
}

function dotTestVectors(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, component, index) => sum + component * right[index]!, 0);
}

async function openEditor(page: Page, options: { empty?: boolean } = {}): Promise<void> {
  await page.goto('http://127.0.0.1:5174/');
  await page.getByRole('button', { name: 'New map', exact: true }).click();
  await expect(page).toHaveURL(/\/new-map$/);
  await page.getByRole('button', { name: 'Create map', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5174/editor');
  await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
  await expect(page.locator('.viewport-error')).toBeHidden();
  if (!options.empty) {
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(serializeMap(createStarterDocument()));
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText('Apply map source');
  }
}

async function openToolbarMenu(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click();
}

async function chooseMaterialAction(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Material actions', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

interface BrowserSiteToolResult {
  readonly summary: string;
  readonly [key: string]: unknown;
}

async function installSiteToolRegistry(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface SiteTool {
      readonly name: string;
      execute(input: unknown): unknown | Promise<unknown>;
    }
    const tools = new Map<string, SiteTool>();
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool: SiteTool, options?: { readonly signal?: AbortSignal }) {
          if (options?.signal?.aborted) return;
          tools.set(tool.name, tool);
          options?.signal?.addEventListener(
            'abort',
            () => {
              if (tools.get(tool.name) === tool) tools.delete(tool.name);
            },
            { once: true },
          );
        },
      },
    });
    Object.defineProperty(window, 'worldviewSiteTools', {
      configurable: true,
      value: tools,
    });
  });
}

async function executeSiteTool(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
): Promise<BrowserSiteToolResult> {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      interface SiteTool {
        execute(input: unknown): unknown | Promise<unknown>;
      }
      const tools = (window as unknown as { worldviewSiteTools: Map<string, SiteTool> })
        .worldviewSiteTools;
      const tool = tools.get(toolName);
      if (!tool) throw new Error(`Site tool ${toolName} was not registered`);
      return tool.execute(toolInput);
    },
    { toolName: name, toolInput: input },
  ) as Promise<BrowserSiteToolResult>;
}

async function readEditorDocument(page: Page) {
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const source = await page.locator('#map-source').inputValue();
  await page.getByRole('button', { name: 'Close source' }).click();
  return parseMap(source);
}

async function perspectivePoint(
  page: Page,
  xFraction: number,
  yFraction: number,
): Promise<{ readonly x: number; readonly y: number }> {
  const bounds = await page.locator('.source-canvas').nth(0).boundingBox();
  if (!bounds) throw new Error('The perspective editor canvas has no bounds');
  return {
    x: bounds.x + bounds.width * xFraction,
    y: bounds.y + bounds.height * yFraction,
  };
}

async function perspectiveGridBandThickness(page: Page): Promise<number> {
  return page.getByLabel('Perspective map viewport').evaluate(async (canvas) => {
    const bitmap = await createImageBitmap(canvas as HTMLCanvasElement);
    const sample = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = sample.getContext('2d');
    if (!context) throw new Error('2D canvas context is unavailable');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const colors = new Map<string, number>();
    for (let y = Math.floor(sample.height * 0.25); y < sample.height; y += 4) {
      for (let x = 0; x < sample.width; x += 4) {
        const offset = (y * sample.width + x) * 4;
        const key = `${Math.round(pixels[offset]! / 8)},${Math.round(pixels[offset + 1]! / 8)},${Math.round(pixels[offset + 2]! / 8)}`;
        colors.set(key, (colors.get(key) ?? 0) + 1);
      }
    }
    const background = [...colors.entries()]
      .toSorted((left, right) => right[1] - left[1])[0]![0]
      .split(',')
      .map((component) => Number(component) * 8);
    const columnRuns = [0.2, 0.35, 0.5, 0.65, 0.8].map((fraction) => {
      const x = Math.floor(sample.width * fraction);
      let run = 0;
      let maximum = 0;
      for (let y = Math.floor(sample.height * 0.25); y < sample.height; y += 1) {
        const offset = (y * sample.width + x) * 4;
        const difference =
          Math.abs(pixels[offset]! - background[0]!) +
          Math.abs(pixels[offset + 1]! - background[1]!) +
          Math.abs(pixels[offset + 2]! - background[2]!);
        run = difference > 36 ? run + 1 : 0;
        maximum = Math.max(maximum, run);
      }
      return maximum;
    });
    return columnRuns.toSorted((left, right) => left - right)[2]!;
  });
}

async function perspectiveWorldPoint(
  page: Page,
  point: readonly [number, number, number],
): Promise<{ readonly x: number; readonly y: number }> {
  const bounds = await page.locator('.source-canvas').nth(0).boundingBox();
  if (!bounds) throw new Error('The perspective editor canvas has no bounds');
  const yaw = Math.PI * 0.72;
  const pitch = -0.43;
  const forward = normalizeTestVector([
    Math.cos(yaw) * Math.cos(pitch),
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
  ]);
  const right = normalizeTestVector(crossTestVectors(forward, [0, 0, 1]));
  const up = normalizeTestVector(crossTestVectors(right, forward));
  const center = [0, 0, 48];
  const eye = center.map((component, axis) => component - forward[axis]! * 620);
  const relative = point.map((component, axis) => component - eye[axis]!);
  const depth = dotTestVectors(relative, forward);
  const halfHeight = Math.tan(Math.PI / 6);
  const ndcX =
    dotTestVectors(relative, right) / (depth * halfHeight * (bounds.width / bounds.height));
  const ndcY = dotTestVectors(relative, up) / (depth * halfHeight);
  return {
    x: bounds.x + ((ndcX + 1) * bounds.width) / 2,
    y: bounds.y + ((1 - ndcY) * bounds.height) / 2,
  };
}

async function viewportPoint(
  page: Page,
  viewportIndex: number,
  xFraction: number,
  yFraction: number,
): Promise<{ readonly x: number; readonly y: number }> {
  const bounds = await page.locator('.source-canvas').nth(viewportIndex).boundingBox();
  if (!bounds) throw new Error(`Editor canvas ${viewportIndex} has no bounds`);
  return {
    x: bounds.x + bounds.width * xFraction,
    y: bounds.y + bounds.height * yFraction,
  };
}

async function topWorldPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ readonly x: number; readonly y: number }> {
  const bounds = await page.locator('.source-canvas').nth(1).boundingBox();
  if (!bounds) throw new Error('The top editor canvas has no bounds');
  const span = 640;
  const aspect = bounds.width / bounds.height;
  return {
    x: bounds.x + bounds.width * (0.5 + x / (span * aspect)),
    y: bounds.y + bounds.height * (0.5 - y / span),
  };
}

async function frontWorldPoint(
  page: Page,
  x: number,
  z: number,
): Promise<{ readonly x: number; readonly y: number }> {
  const bounds = await page.locator('.source-canvas').nth(2).boundingBox();
  if (!bounds) throw new Error('The front editor canvas has no bounds');
  const span = 640;
  const aspect = bounds.width / bounds.height;
  return {
    x: bounds.x + bounds.width * (0.5 + x / (span * aspect)),
    y: bounds.y + bounds.height * (0.5 - (z - 48) / span),
  };
}

interface CameraSnapshot {
  readonly center: readonly number[];
  readonly position: readonly number[];
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly orthographicSpan: number;
  readonly fieldOfViewDegrees: number;
  readonly flySpeed: number;
}

async function perspectiveCamera(page: Page): Promise<CameraSnapshot> {
  const canvas = page.locator('[data-viewport="perspective"] .source-canvas');
  await expect(canvas).toHaveAttribute('data-camera');
  const value = await canvas.getAttribute('data-camera');
  if (!value) throw new Error('Perspective camera state was not published');
  return JSON.parse(value) as CameraSnapshot;
}

async function viewportCamera(page: Page, viewport: 'xy' | 'xz' | 'yz'): Promise<CameraSnapshot> {
  const canvas = page.locator(`[data-viewport="${viewport}"] .source-canvas`);
  await expect(canvas).toHaveAttribute('data-camera');
  const value = await canvas.getAttribute('data-camera');
  if (!value) throw new Error(`${viewport} camera state was not published`);
  return JSON.parse(value) as CameraSnapshot;
}

function cameraDistance(left: readonly number[], right: readonly number[]): number {
  return Math.hypot(left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!);
}

async function expectPerspectiveTranslation(
  page: Page,
  start: readonly number[],
  minimumDistance = 4,
): Promise<void> {
  await expect
    .poll(async () => cameraDistance((await perspectiveCamera(page)).position, start), {
      timeout: 2_000,
    })
    .toBeGreaterThan(minimumDistance);
}

async function controlContrast(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const color = (value: string): [number, number, number, number] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]! / 255];
    };
    // oxlint-disable-next-line consistent-function-scoping -- evaluated in the browser realm.
    const blend = (
      foreground: readonly [number, number, number, number],
      background: readonly [number, number, number, number],
    ): [number, number, number, number] => {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      return [
        (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) /
          alpha,
        (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) /
          alpha,
        (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) /
          alpha,
        alpha,
      ];
    };
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement)
      ancestors.push(current);
    let background: [number, number, number, number] = [255, 255, 255, 1];
    for (const current of ancestors.toReversed()) {
      background = blend(color(getComputedStyle(current).backgroundColor), background);
    }
    const foreground = blend(color(getComputedStyle(element).color), background);
    // oxlint-disable-next-line consistent-function-scoping -- evaluated in the browser realm.
    const luminance = (rgb: readonly number[]) =>
      rgb.slice(0, 3).reduce((sum, channel, index) => {
        const value = channel! / 255;
        const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        return sum + linear * [0.2126, 0.7152, 0.0722][index]!;
      }, 0);
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return (
      (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
      (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
    );
  });
}

async function chooseSelectOption(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`${label}$`) }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function setCheckbox(page: Page, name: string | RegExp, selected: boolean): Promise<void> {
  const checkbox = page.getByRole('checkbox', { name });
  await expect(checkbox).toBeVisible();
  await expect(checkbox).toBeEnabled();
  if ((await checkbox.isChecked()) !== selected) {
    await checkbox.focus();
    await checkbox.press('Space');
  }
  await expect(checkbox).toBeChecked({ checked: selected });
}

export {
  openEditor,
  openToolbarMenu,
  chooseMaterialAction,
  installSiteToolRegistry,
  executeSiteTool,
  readEditorDocument,
  perspectivePoint,
  perspectiveGridBandThickness,
  perspectiveWorldPoint,
  viewportPoint,
  topWorldPoint,
  frontWorldPoint,
  perspectiveCamera,
  viewportCamera,
  cameraDistance,
  expectPerspectiveTranslation,
  controlContrast,
  chooseSelectOption,
  setCheckbox,
};
