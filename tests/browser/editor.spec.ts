import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  EditorSession,
  type MapDocument,
  brushesInDocument,
  brushVertices,
  createBoxBrush,
  createObjectSelection,
  createSequentialIdFactory,
  createStarterDocument,
  deriveBrush,
  findBrush,
  deriveEditorGroups,
  deriveEditorLayers,
  parseMap,
  parseEntityOrigin,
  setBrushFaceMaterials,
  serializeMap,
} from '../../packages/worldview-editor/src/core/index.js';

function adjacentBrushSource(): string {
  const ids = createSequentialIdFactory('browser-shared-face');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const left = createBoxBrush([-32, -32, 0], [0, 32, 32], 'LEFT', ids);
  const right = createBoxBrush([0, -32, 0], [32, 32, 32], 'RIGHT', ids);

  return serializeMap({
    ...starter,
    entities: [{ ...worldspawn, primitives: [left, right] }, ...starter.entities.slice(1)],
  });
}

function coplanarBrushSource(): string {
  const ids = createSequentialIdFactory('browser-coplanar-face');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const lower = createBoxBrush([-32, -64, 0], [0, -16, 32], 'LOWER', ids);
  const upper = createBoxBrush([-32, 16, 0], [0, 64, 32], 'UPPER', ids);

  return serializeMap({
    ...starter,
    entities: [{ ...worldspawn, primitives: [lower, upper] }, ...starter.entities.slice(1)],
  });
}

function subtractionBrushSource(): string {
  const ids = createSequentialIdFactory('browser-csg-subtract');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const target = createBoxBrush([-48, -48, -32], [48, 48, 32], 'TARGET', ids);
  const cutter = createBoxBrush([-16, -16, -48], [16, 16, 48], 'CUTTER', ids);
  return serializeMap({
    ...starter,
    entities: [{ ...worldspawn, primitives: [target, cutter] }, ...starter.entities.slice(1)],
  });
}

function selectionPaintSource(): string {
  const ids = createSequentialIdFactory('browser-object-paint');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const brushes = [
    createBoxBrush([-160, -32, 0], [-96, 32, 64], 'PAINT_A', ids),
    createBoxBrush([-32, -32, 0], [32, 32, 64], 'PAINT_B', ids),
    createBoxBrush([96, -32, 0], [160, 32, 64], 'PAINT_C', ids),
  ];
  return serializeMap({
    ...starter,
    entities: [{ ...worldspawn, primitives: brushes }, ...starter.entities.slice(1)],
  });
}

function selectionBrushSource(): string {
  const ids = createSequentialIdFactory('browser-selection-brush');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const brushes = [
    createBoxBrush([-96, -96, -32], [96, 96, 96], 'SELECTOR', ids),
    createBoxBrush([-24, -24, 0], [24, 24, 32], 'INSIDE', ids),
    createBoxBrush([80, -16, 0], [112, 16, 32], 'CROSSING', ids),
    createBoxBrush([144, -16, 0], [176, 16, 32], 'OUTSIDE', ids),
    createBoxBrush([-24, 40, 160], [24, 64, 192], 'ELEVATED', ids),
  ];
  return serializeMap({
    ...starter,
    entities: [
      { ...worldspawn, primitives: brushes },
      {
        id: ids.entity(),
        properties: { classname: 'info_target', origin: '0 -48 16' },
        primitives: [],
      },
      {
        id: ids.entity(),
        properties: { classname: 'info_target', origin: '160 64 16' },
        primitives: [],
      },
    ],
  });
}

function offGridBrushSource(): string {
  const ids = createSequentialIdFactory('browser-grid-snap');
  const starter = createStarterDocument();
  const brush = createBoxBrush([3, 5, 7], [27, 29, 31], 'GRID_SNAP', ids);
  return serializeMap({
    ...starter,
    entities: [{ ...starter.entities[0]!, primitives: [brush] }, ...starter.entities.slice(1)],
  });
}

function regularGroupSource(): string {
  const ids = createSequentialIdFactory('browser-linked-group');
  const starter = createStarterDocument();
  const brush = createBoxBrush([-32, -16, 0], [32, 16, 64], 'LINKED_DOOR', ids);
  const marker = {
    id: ids.entity(),
    properties: {
      classname: 'info_target',
      origin: '0 96 32',
      angle: '90',
      targetname: 'door_a',
    },
    primitives: [],
  };
  const document = {
    ...starter,
    entities: [{ ...starter.entities[0]!, primitives: [brush] }, marker],
  };
  const session = new EditorSession(document);
  session.select(createObjectSelection([brush.id], [marker.id]));
  session.groupSelected('Reusable doorway', ids);
  return serializeMap(session.document);
}

function drillSelectionSource(): string {
  const ids = createSequentialIdFactory('browser-selection-drill');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const front = createBoxBrush([72, -136, 88], [120, -88, 136], 'DRILL_FRONT', ids);
  const back = createBoxBrush([16, -72, 48], [64, -24, 96], 'DRILL_BACK', ids);
  return serializeMap({
    ...starter,
    entities: [{ ...worldspawn, primitives: [front, back] }, ...starter.entities.slice(1)],
  });
}

function orthographicDrillSelectionSource(): string {
  const ids = createSequentialIdFactory('browser-orthographic-selection-drill');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const lowerWall = createBoxBrush([-96, -96, 0], [96, 96, 64], 'DRILL_WALL', ids);
  const upperDetail = createBoxBrush([-32, -32, 128], [32, 32, 192], 'DRILL_DETAIL', ids);
  return serializeMap({
    ...starter,
    entities: [
      { ...worldspawn, primitives: [lowerWall, upperDetail] },
      ...starter.entities.slice(1),
    ],
  });
}

function brushEntitySiblingSource(): string {
  const ids = createSequentialIdFactory('browser-brush-entity');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const worldBrush = createBoxBrush([-192, -32, 0], [-128, 32, 64], 'WORLD', ids);
  const first = createBoxBrush([-32, -32, 0], [32, 32, 64], 'DETAIL_A', ids);
  const second = createBoxBrush([96, -32, 0], [160, 32, 64], 'DETAIL_B', ids);
  return serializeMap({
    ...starter,
    entities: [
      { ...worldspawn, primitives: [worldBrush] },
      { id: ids.entity(), properties: { classname: 'func_detail' }, primitives: [first, second] },
      ...starter.entities.slice(1),
    ],
  });
}

function entityLinkSource(): string {
  const ids = createSequentialIdFactory('browser-entity-links');
  const starter = createStarterDocument();
  const worldspawn = { ...starter.entities[0]!, primitives: [] };
  const doorBrush = createBoxBrush([-16, -16, 0], [16, 16, 64], 'DOOR', ids);
  return serializeMap({
    ...starter,
    entities: [
      worldspawn,
      {
        id: ids.entity(),
        properties: {
          classname: 'trigger_once',
          origin: '-96 0 32',
          target: 'door_a',
          killtarget: 'unused_a',
        },
        primitives: [],
      },
      {
        id: ids.entity(),
        properties: { classname: 'func_door', targetname: 'door_a', target: 'relay_a' },
        primitives: [doorBrush],
      },
      {
        id: ids.entity(),
        properties: {
          classname: 'trigger_relay',
          origin: '96 0 32',
          targetname: 'relay_a',
          target: 'unused_a',
        },
        primitives: [],
      },
      {
        id: ids.entity(),
        properties: { classname: 'info_null', origin: '192 0 32', targetname: 'unused_a' },
        primitives: [],
      },
    ],
  });
}

function issueBrowserSource(): string {
  const ids = createSequentialIdFactory('browser-issues');
  const starter = createStarterDocument();
  const box = createBoxBrush([-32, -32, 0], [32, 32, 64], 'BROKEN', ids);
  const invalid = { ...box, faces: box.faces.slice(0, 3) };
  return serializeMap({
    ...starter,
    entities: [
      { ...starter.entities[0]!, primitives: [invalid] },
      {
        id: ids.entity(),
        properties: { classname: 'light', origin: 'not a vector' },
        primitives: [],
      },
      {
        id: ids.entity(),
        properties: {
          classname: 'trigger_once',
          origin: '96 0 16',
          target: 'missing_door',
        },
        primitives: [],
      },
    ],
  });
}

function viewFilterSource(): string {
  const ids = createSequentialIdFactory('browser-view-filters');
  const starter = createStarterDocument();
  const world = createBoxBrush([-128, -32, 0], [-96, 32, 48], 'STONE', ids);
  const detail = createBoxBrush([-64, -32, 0], [-32, 32, 48], 'DETAIL', ids);
  const trigger = createBoxBrush([0, -32, 0], [32, 32, 48], 'TRIGGER', ids);
  const clip = createBoxBrush([64, -32, 0], [96, 32, 48], 'PLAYERCLIP', ids);
  return serializeMap({
    ...starter,
    entities: [
      { ...starter.entities[0]!, primitives: [world] },
      { id: ids.entity(), properties: { classname: 'func_detail' }, primitives: [detail] },
      { id: ids.entity(), properties: { classname: 'trigger_once' }, primitives: [trigger] },
      { id: ids.entity(), properties: { classname: 'func_wall' }, primitives: [clip] },
      {
        id: ids.entity(),
        properties: { classname: 'light', origin: '-48 96 24' },
        primitives: [],
      },
      {
        id: ids.entity(),
        properties: { classname: 'monster_army', origin: '48 96 24' },
        primitives: [],
      },
    ],
  });
}

function materialUsageSource(): string {
  const ids = createSequentialIdFactory('browser-material-usage');
  const starter = createStarterDocument();
  const worldspawn = starter.entities[0]!;
  const firstBase = createBoxBrush([-96, -32, 0], [-32, 32, 64], 'DEV_FLOOR', ids);
  const first = setBrushFaceMaterials(
    firstBase,
    'DEV_PILLAR',
    firstBase.faces.slice(0, 2).map((face) => face.id),
  );
  const second = createBoxBrush([32, -32, 0], [96, 32, 64], 'DEV_FLOOR', ids);
  return serializeMap({
    ...starter,
    entities: [{ ...worldspawn, primitives: [first, second] }, ...starter.entities.slice(1)],
  });
}

function orthographicPickPrioritySource(): string {
  const ids = createSequentialIdFactory('browser-orthographic-pick');
  const starter = createStarterDocument();
  const wall = createBoxBrush([-192, -192, 0], [192, 192, 16], 'PICK_WALL', ids);
  const detail = createBoxBrush([-32, -32, 0], [32, 32, 16], 'PICK_DETAIL', ids);
  return serializeMap({
    ...starter,
    entities: [{ ...starter.entities[0]!, primitives: [wall, detail] }],
  });
}

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
  await page.getByTitle(name, { exact: true }).click();
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
        registerTool(tool: SiteTool) {
          tools.set(tool.name, tool);
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
  const indicator = page.locator('#perspective-mode');
  await expect(indicator).toHaveAttribute('data-camera');
  const value = await indicator.getAttribute('data-camera');
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

test.describe('WebMCP site authoring', () => {
  test('keeps button contrast legible across themes and interaction states', async ({ page }) => {
    await page.goto('http://127.0.0.1:5174/');
    const primary = page.getByRole('button', { name: 'New map', exact: true });
    const neutral = page.getByRole('button', { name: 'Open project folder', exact: true });
    for (const theme of ['dark', 'light'] as const) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      expect(await controlContrast(primary)).toBeGreaterThanOrEqual(4.5);
      expect(await controlContrast(neutral)).toBeGreaterThanOrEqual(4.5);
      await primary.hover();
      expect(await controlContrast(primary)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.down();
      expect(await controlContrast(primary)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.move(0, 0);
      await page.mouse.up();
      await neutral.hover();
      expect(await controlContrast(neutral)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.down();
      expect(await controlContrast(neutral)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.move(0, 0);
      await page.mouse.up();
    }
    await page.getByRole('button', { name: 'New map', exact: true }).click();
    const create = page.getByRole('button', { name: 'Create map', exact: true });
    await create.evaluate((button: HTMLButtonElement) => {
      button.disabled = true;
    });
    for (const theme of ['dark', 'light'] as const) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      expect(await controlContrast(create)).toBeGreaterThanOrEqual(4.5);
      await expect(create).toHaveCSS('cursor', 'progress');
    }
  });

  test('keeps visible editor controls above non-text contrast minimums', async ({ page }) => {
    await openEditor(page, { empty: true });
    for (const theme of ['dark', 'light'] as const) {
      await page.getByLabel('Editor theme').selectOption(theme);
      const buttons = page.locator('button:visible:not(:disabled)');
      const failures: string[] = [];
      for (let index = 0; index < (await buttons.count()); index += 1) {
        const button = buttons.nth(index);
        const ratio = await controlContrast(button);
        if (ratio < 3) {
          failures.push(
            `${(await button.getAttribute('title')) ?? (await button.getAttribute('aria-label')) ?? (await button.innerText())}: ${ratio.toFixed(2)}`,
          );
        }
      }
      expect(failures, `${theme} editor controls below 3:1: ${failures.join(', ')}`).toEqual([]);
      for (const control of [
        page.getByTitle('Worldview Editor', { exact: true }),
        page.getByRole('button', { name: 'Source', exact: true }),
        page.locator('#issue-status'),
      ]) {
        await control.hover();
        expect(await controlContrast(control)).toBeGreaterThanOrEqual(3);
        await page.mouse.down();
        expect(await controlContrast(control)).toBeGreaterThanOrEqual(3);
        await page.mouse.move(0, 0);
        await page.mouse.up();
      }
    }
  });

  test('uses a dedicated history-aware new-map page @ci-smoke', async ({ page }) => {
    const loadedScripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') loadedScripts.push(request.url());
    });
    await page.goto('http://127.0.0.1:5174/');
    await expect(page.locator('#status-message')).toHaveCount(0);
    expect(loadedScripts.some((url) => url.includes('/routes/editor-route.'))).toBe(false);
    await page.getByRole('button', { name: 'New map', exact: true }).click();
    await expect(page).toHaveURL(/\/new-map$/);
    await expect(page.getByRole('heading', { name: 'New map', exact: true })).toBeVisible();
    await expect(page.locator('dialog#new-map-dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'New map', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Worldview Editor' })).toBeVisible();
    await page.goForward();
    await page.getByLabel('Game').selectOption('quake2');
    await expect(page.getByLabel('Map format').locator('option')).toHaveText(['Classic Quake']);
    await page.getByLabel('Game').selectOption('goldsrc');
    await expect(page.getByLabel('Map format').locator('option')).toHaveCount(1);
    await page.getByRole('button', { name: 'Create map', exact: true }).click();
    await expect(page).toHaveURL('http://127.0.0.1:5174/editor');
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
    await page.reload();
    await expect(page).toHaveURL('http://127.0.0.1:5174/editor');
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
    expect(loadedScripts.some((url) => url.includes('/routes/editor-route.'))).toBe(true);
  });

  test('exposes the shared interface specimens in both themes @ci-smoke', async ({ page }) => {
    await page.goto('http://127.0.0.1:5174/design');
    await expect(page.getByRole('heading', { name: 'Interface system' })).toBeVisible();
    await expect(page.locator('.design-theme[data-preview-theme="dark"]')).toBeVisible();
    await expect(page.locator('.design-theme[data-preview-theme="light"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Editor chrome' })).toBeVisible();
    await expect(page.locator('main [style]')).toHaveCount(0);
  });

  test('keeps anonymous local maps offline when collaboration is opened @ci-smoke', async ({
    page,
  }) => {
    const roomRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/sync/maps/'))
        roomRequests.push(request.url());
    });
    await openEditor(page, { empty: true });
    await page.locator('#collaboration-toggle').click();
    await expect(page.locator('#collaboration-dialog')).toBeVisible();
    await expect(page.locator('#collaboration-description')).toContainText(
      'requires a hosted project and a 4orm account',
    );
    await expect(page.getByRole('button', { name: 'Open hosted projects' })).toBeVisible();
    expect(roomRequests).toEqual([]);
  });

  test('switches and persists the editor theme', async ({ page }) => {
    await openEditor(page, { empty: true });
    const selector = page.getByLabel('Editor theme');
    await selector.selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('worldview.editor.theme')))
      .toBe('light');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      'light',
    );
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--renderer-background'),
      ),
    ).toContain('96.5%');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
    await expect(selector).toHaveValue('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await selector.selectOption('dark');
  });

  test('uses a resizable TrenchBroom-style four-pane workspace', async ({ page }) => {
    await openEditor(page, { empty: true });
    const perspective = page.locator('[data-viewport="perspective"]');
    const top = page.locator('[data-viewport="xy"]');
    const perspectiveBounds = await perspective.boundingBox();
    const topBounds = await top.boundingBox();
    if (!perspectiveBounds || !topBounds) throw new Error('Viewport layout has no bounds');
    expect(perspectiveBounds.x).toBeLessThan(topBounds.x);
    expect(Math.abs(perspectiveBounds.y - topBounds.y)).toBeLessThan(2);
    expect(Math.abs(perspectiveBounds.width - topBounds.width)).toBeLessThan(2);
    expect(Math.abs(perspectiveBounds.height - topBounds.height)).toBeLessThan(2);

    const columnHandle = page.locator('[data-resize="viewport-column"]');
    const beforeColumn = Number(await columnHandle.getAttribute('aria-valuenow'));
    await columnHandle.press('ArrowRight');
    expect(Number(await columnHandle.getAttribute('aria-valuenow'))).toBeGreaterThan(beforeColumn);

    const rowHandle = page.locator('[data-resize="viewport-top"]');
    const beforeRow = Number(await rowHandle.getAttribute('aria-valuenow'));
    await rowHandle.press('ArrowDown');
    expect(Number(await rowHandle.getAttribute('aria-valuenow'))).toBeGreaterThan(beforeRow);
    await expect(page.locator('[data-resize]')).toHaveCount(3);

    const inspectorHandle = page.locator('[data-resize="inspector"]');
    const beforeInspector = Number(await inspectorHandle.getAttribute('aria-valuenow'));
    const handleBounds = await inspectorHandle.boundingBox();
    if (!handleBounds) throw new Error('Inspector resize handle has no bounds');
    await page.mouse.move(handleBounds.x + handleBounds.width / 2, handleBounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(handleBounds.x - 48, handleBounds.y + 100, { steps: 4 });
    await page.mouse.up();
    expect(Number(await inspectorHandle.getAttribute('aria-valuenow'))).toBeGreaterThan(
      beforeInspector,
    );
    await expect(inspectorHandle).not.toHaveClass(/dragging/);
    await expect(inspectorHandle).not.toBeFocused();
  });

  test('keeps the normal editor available when the browser has no site-tool API', async ({
    page,
  }) => {
    await openEditor(page);
    await expect(page.locator('html')).toHaveAttribute('data-worldview-site-tools', 'unsupported');
    await expect(page.locator('html')).toHaveAttribute('data-worldview-site-tool-count', '0');
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeEnabled();
    const compile = page.locator('[data-action="compile"]');
    const repeat = page.locator('[data-action="repeat-commands"]');
    await expect(compile.locator('.ph')).toHaveCount(1);
    await expect(repeat.locator('.ph')).toHaveCount(1);
    expect(
      await compile.evaluate((button) => ({
        width: button.getBoundingClientRect().width,
        overflow: getComputedStyle(button).overflow,
      })),
    ).toEqual({ width: 30, overflow: 'hidden' });
    await expect(page.getByTitle('More document actions', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Versions', exact: true })).toBeHidden();
    await openToolbarMenu(page, 'More document actions');
    await expect(page.getByRole('button', { name: 'Versions', exact: true })).toBeVisible();
  });

  test('registers first-class live tools with revision guards, visible edits, and undo @ci-smoke', async ({
    page,
  }) => {
    await installSiteToolRegistry(page);
    await openEditor(page, { empty: true });
    await expect(page.locator('html')).toHaveAttribute('data-worldview-site-tools', 'ready');
    await expect(page.locator('html')).toHaveAttribute('data-worldview-site-tool-count', '21');

    const names = await page.evaluate(() => [
      ...(
        window as unknown as { worldviewSiteTools: Map<string, unknown> }
      ).worldviewSiteTools.keys(),
    ]);
    expect(names).toEqual(
      expect.arrayContaining([
        'worldview_inspect_editor',
        'worldview_list_objects',
        'worldview_select',
        'worldview_translate_selection',
        'worldview_create_box',
        'worldview_history',
        'worldview_replace_map_source',
        'worldview_open_project_map',
      ]),
    );

    const inspection = await executeSiteTool(page, 'worldview_inspect_editor');
    expect(inspection.revision).toBe(0);
    expect(inspection.counts).toMatchObject({ entities: 1, primitives: 0, faces: 0 });
    const documentId = inspection.documentId as string;
    const initialBox = await executeSiteTool(page, 'worldview_create_box', {
      expectedDocumentId: documentId,
      expectedRevision: 0,
      min: [-64, -64, 0],
      max: [64, 64, 64],
      material: 'DEV_FLOOR',
    });
    expect(initialBox.revision).toBe(1);
    const listed = await executeSiteTool(page, 'worldview_list_objects', {
      kind: 'brush',
      limit: 10,
    });
    const objects = listed.objects as Array<{
      id: string;
      bounds: unknown;
    }>;
    const firstBrush = objects[0]!;

    await executeSiteTool(page, 'worldview_select', {
      expectedDocumentId: documentId,
      expectedRevision: 1,
      mode: 'objects',
      brushIds: [firstBrush.id],
    });
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#status-message')).toContainText('Site tool: updated');

    await executeSiteTool(page, 'worldview_frame_view', { target: 'selection' });
    await expect(page.locator('#status-message')).toContainText('Site tool: framed');
    await executeSiteTool(page, 'worldview_set_tool', { tool: 'face' });
    await expect(page.getByRole('button', { name: 'Face', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await executeSiteTool(page, 'worldview_set_tool', { tool: 'select' });

    const translated = await executeSiteTool(page, 'worldview_translate_selection', {
      expectedDocumentId: documentId,
      expectedRevision: 1,
      delta: [16, 0, 0],
      textureLock: true,
    });
    expect(translated.revision).toBe(2);
    await expect(page.locator('#document-revision')).toHaveText('2');
    await expect(page.locator('#status-message')).toContainText('Site tool: translated');

    await expect(
      executeSiteTool(page, 'worldview_translate_selection', {
        expectedDocumentId: documentId,
        expectedRevision: 0,
        delta: [16, 0, 0],
      }),
    ).rejects.toThrow('Stale document revision');
    await expect(page.locator('#document-revision')).toHaveText('2');

    const undone = await executeSiteTool(page, 'worldview_history', {
      expectedDocumentId: documentId,
      expectedRevision: 2,
      action: 'undo',
    });
    const undoRevision = undone.revision as number;
    expect(undoRevision).toBeGreaterThan(1);
    await expect(page.locator('#status-message')).toContainText('Site tool: undo completed');
    const afterUndo = await executeSiteTool(page, 'worldview_list_objects', {
      kind: 'brush',
      query: firstBrush.id,
    });
    expect((afterUndo.objects as Array<{ bounds: unknown }>)[0]?.bounds).toEqual(firstBrush.bounds);

    const created = await executeSiteTool(page, 'worldview_create_box', {
      expectedDocumentId: documentId,
      expectedRevision: undoRevision,
      min: [192, 192, 0],
      max: [256, 256, 64],
      material: 'DEV_FLOOR',
    });
    expect(created.revision).toBeGreaterThan(undoRevision);
    expect(created.brushId).toEqual(expect.any(String));
    await expect(page.locator('#status-message')).toContainText('Site tool: created brush');

    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(page).toHaveURL(/\/new-map$/);
    await page.getByRole('button', { name: 'Create map', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-worldview-site-tool-count', '21');
    const blank = await executeSiteTool(page, 'worldview_inspect_editor');
    expect(blank.revision).toBe(0);
    expect(blank.counts).toMatchObject({ entities: 1, primitives: 0, faces: 0 });
  });
});

test.describe('3D source authoring', () => {
  test('orthographic views prefer the smallest visible face over the frontmost brush', async ({
    page,
  }) => {
    await openEditor(page, { empty: true });
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(orthographicPickPrioritySource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('2');

    const overlaps = [
      await viewportPoint(page, 1, 0.5, 0.5),
      await viewportPoint(page, 2, 0.5, 0.5625),
      await viewportPoint(page, 3, 0.5, 0.5625),
    ];
    for (const overlap of overlaps) {
      await page.mouse.click(overlap.x, overlap.y);
      await expect(page.locator('#selection-kind')).toHaveText('Brush');
      await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 0 to 32 32 16');
      await page.keyboard.press('Escape');
    }
  });

  test('browses live issues, locates objects, filters findings, and quick-fixes with undo', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(issueBrowserSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();

    const issueStatus = page.locator('#issue-status');
    await expect(issueStatus).toHaveText('Issues 3');
    await expect(issueStatus).toHaveAttribute('data-state', 'error');
    await issueStatus.click();
    await expect(page.locator('#issue-browser')).toBeVisible();
    await expect(page.locator('#issue-summary')).toHaveText('2 errors · 1 warning');

    const invalid = page.locator('[data-issue-type="invalid-brush"]');
    await expect(invalid).toHaveCount(1);
    await invalid.locator('.issue-description').click();
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await invalid.getByRole('button', { name: 'Fix', exact: true }).click();
    await expect(page.locator('[data-issue-type="invalid-brush"]')).toHaveCount(0);
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveAttribute(
      'title',
      'Undo Delete invalid brush',
    );
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('[data-issue-type="invalid-brush"]')).toHaveCount(1);

    const invalidOrigin = page.locator('[data-issue-type="invalid-origin"]');
    await invalidOrigin.locator('.issue-description').click();
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
    await invalidOrigin.getByRole('button', { name: 'Fix', exact: true }).click();
    await expect(page.locator('[data-issue-type="invalid-origin"]')).toHaveCount(0);

    const unresolved = page.locator('[data-issue-type="unresolved-target"]');
    await unresolved.getByRole('button', { name: 'Hide', exact: true }).click();
    await expect(page.locator('[data-issue-type="unresolved-target"]')).toHaveCount(0);
    await page.locator('#show-hidden-issues').check();
    await expect(page.locator('[data-issue-type="unresolved-target"]')).toHaveClass(/hidden-issue/);
    await page
      .locator('[data-issue-type="unresolved-target"]')
      .getByRole('button', { name: 'Show', exact: true })
      .click();

    await page.getByText('Filter types', { exact: true }).click();
    await page.locator('[data-issue-filter="empty-brush-entity"]').uncheck();
    await expect(page.locator('[data-issue-type="empty-brush-entity"]')).toHaveCount(0);
  });

  test('filters entity definitions and special brushes without changing map source or history', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(viewFilterSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const sourceBefore = serializeMap(await readEditorDocument(page));

    const viewButton = page.locator('[data-action="toggle-view-filters"]');
    await viewButton.click();
    await expect(page.locator('#view-filter-popover')).toBeVisible();
    await expect(page.locator('#entity-class-filter-summary')).toHaveText('5 classes');
    await expect(page.locator('[data-entity-classname]')).toHaveCount(5);

    await page.locator('[data-entity-classname="light"] input').uncheck();
    await expect(page.locator('#view-filter-count')).toHaveText('1');
    await expect(page.locator('#hidden-object-count')).toHaveText('1');
    await page.locator('[data-special-brush-filter="trigger"]').uncheck();
    await expect(page.locator('#view-filter-count')).toHaveText('2');
    await page.locator('#show-world-brushes').uncheck();
    await expect(page.locator('#view-filter-count')).toHaveText('3');
    await expect(page.locator('#view-filter-status')).toHaveText(
      '3 objects filtered · map source unchanged',
    );
    await expect(page.locator('#document-revision')).toHaveText('0');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('3 Objects');
    expect(serializeMap(await readEditorDocument(page))).toBe(sourceBefore);

    await viewButton.click();
    await page.locator('#entity-class-filter-search').fill('monster');
    await expect(page.locator('[data-entity-classname]')).toHaveCount(1);
    await expect(page.locator('[data-entity-classname="monster_army"]')).toBeVisible();
    await page
      .locator('#view-filter-popover')
      .getByRole('button', { name: 'All', exact: true })
      .click();
    await page.locator('#show-world-brushes').check();
    await page.locator('[data-special-brush-filter="trigger"]').check();
    await expect(page.locator('#view-filter-count')).toBeHidden();
    await expect(page.locator('#hidden-object-count')).toHaveText('0');
  });

  test('repeats a duplicate, move, and rotate sequence as one editor transaction', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(adjacentBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const repeatButton = page.locator('[data-action="repeat-commands"]');
    const clearRepeatButton = page.locator('[data-action="clear-repeat-commands"]');
    await expect(repeatButton).toBeDisabled();

    const left = await topWorldPoint(page, -16, 0);
    await page.mouse.click(left.x, left.y);
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(repeatButton).toHaveText('Repeat 1');
    await page.locator('[data-nudge-axis="2"][data-nudge-direction="1"]').click();
    await expect(repeatButton).toHaveText('Repeat 2');

    await page.getByRole('button', { name: 'Rotate', exact: true }).click();
    await page.locator('#transform-pivot-x').fill('0');
    await page.locator('#transform-pivot-y').fill('0');
    await page.locator('#transform-pivot-z').fill('0');
    await page.locator('#rotate-angle').fill('90');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(repeatButton).toHaveText('Repeat 3');
    await expect(repeatButton).toHaveAttribute(
      'title',
      'Repeat Duplicate → Move → Rotate (Ctrl/Command+Shift+R)',
    );
    await expect(clearRepeatButton).toBeEnabled();

    await page.keyboard.press('Control+Shift+R');
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#document-revision')).toHaveText('4');
    await expect(page.locator('#status-message')).toContainText('Repeat 3 commands');
    await expect(repeatButton).toHaveText('Repeat 3');
    const document = await readEditorDocument(page);
    expect(
      brushesInDocument(document).some((brush) => {
        const bounds = deriveBrush(brush).bounds;
        return (
          bounds?.min[0] === -32 &&
          bounds.min[1] === -32 &&
          bounds.min[2] === 32 &&
          bounds.max[0] === 0 &&
          bounds.max[1] === 32 &&
          bounds.max[2] === 64
        );
      }),
    ).toBe(true);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(repeatButton).toHaveText('Repeat');
    await expect(repeatButton).toBeDisabled();
  });

  test('manages active TrenchBroom layers, visibility, locking, ordering, and removal', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(adjacentBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await page.getByRole('tab', { name: 'Map', exact: true }).click();

    await expect(page.locator('.layer-row')).toHaveCount(1);
    await expect(page.locator('#active-layer-name')).toHaveText('Default Layer active');
    await page.locator('#layer-name').fill('Architecture');
    await page.getByRole('button', { name: 'Add layer', exact: true }).click();
    await expect(page.locator('.layer-row')).toHaveCount(2);
    await expect(page.locator('#active-layer-name')).toHaveText('Architecture active');

    const left = await topWorldPoint(page, -16, 0);
    await page.mouse.click(left.x, left.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.getByRole('button', { name: 'Move selection', exact: true }).click();
    let document = await readEditorDocument(page);
    let architecture = deriveEditorLayers(document).find((layer) => layer.name === 'Architecture')!;
    expect(architecture.brushIds).toHaveLength(1);
    expect(
      brushesInDocument(document).find((brush) => brush.id === architecture.brushIds[0])!.faces[0]
        ?.material,
    ).toBe('LEFT');

    await page.getByRole('button', { name: 'Hide Architecture', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await expect(page.locator('#hidden-object-count')).toHaveText('1');
    await page.mouse.click(left.x, left.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await page.getByRole('button', { name: 'Show Architecture', exact: true }).click();
    await page.getByRole('button', { name: 'Lock Architecture', exact: true }).click();
    await expect(page.locator('#locked-object-count')).toHaveText('1');
    await page.mouse.click(left.x, left.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await page.getByRole('button', { name: 'Unlock Architecture', exact: true }).click();
    await page.getByRole('button', { name: 'Select contents', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page
      .getByRole('button', { name: 'Omit Architecture in compile export', exact: true })
      .click();

    await page.locator('#layer-name').fill('Gameplay');
    await page.getByRole('button', { name: 'Add layer', exact: true }).click();
    await page.locator('[data-action="layer-up"]').click();
    const gameplayName = page.getByRole('textbox', { name: 'Rename Gameplay', exact: true });
    await gameplayName.fill('Logic');
    await gameplayName.press('Enter');
    document = await readEditorDocument(page);
    expect(deriveEditorLayers(document).map((layer) => layer.name)).toEqual([
      'Default Layer',
      'Logic',
      'Architecture',
    ]);
    architecture = deriveEditorLayers(document).find((layer) => layer.name === 'Architecture')!;
    expect(architecture.omitFromExport).toBe(true);

    await page.getByRole('textbox', { name: 'Rename Architecture', exact: true }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    document = await readEditorDocument(page);
    expect(deriveEditorLayers(document).map((layer) => layer.name)).toEqual([
      'Default Layer',
      'Logic',
    ]);
    expect(
      deriveEditorLayers(document)[0]!
        .brushIds.map((brushId) =>
          brushesInDocument(document).find((brush) => brush.id === brushId),
        )
        .some((brush) => brush?.faces[0]?.material === 'LEFT'),
    ).toBe(true);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    document = await readEditorDocument(page);
    expect(deriveEditorLayers(document).map((layer) => layer.name)).toEqual([
      'Default Layer',
      'Logic',
      'Architecture',
    ]);
  });

  test('selection brushes consume their volumes and select touching, enclosed, or projected objects', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(selectionBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const selector = await topWorldPoint(page, 80, 80);
    await page.mouse.click(selector.x, selector.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#selection-brush-section')).toBeVisible();
    await expect(page.locator('#selection-brush-count')).toHaveText('1 volume');

    await page.getByRole('button', { name: 'Enclosed', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('2 Objects');
    await expect(page.locator('#status-message')).toContainText('selected 2 enclosed objects');
    let queried = await readEditorDocument(page);
    expect(brushesInDocument(queried).map((brush) => brush.faces[0]?.material)).not.toContain(
      'SELECTOR',
    );

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.getByRole('button', { name: 'Touching', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('3 Objects');
    await expect(page.locator('#status-message')).toContainText('selected 3 touching objects');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.mouse.move(selector.x, selector.y);
    await page.getByRole('button', { name: 'Enclosed in 2D', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('3 Objects');
    await expect(page.locator('#status-message')).toContainText('selected 3 xy enclosed objects');
    queried = await readEditorDocument(page);
    expect(brushesInDocument(queried)).toHaveLength(4);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
    await expect(page.locator('#selection-kind')).toHaveText('7 Objects');
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+Shift+A`);
    await expect(page.locator('#selection-kind')).toHaveText('None');
  });

  test('Ctrl-drag paint-selects objects and duplicate-moves a selected set atomically', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(selectionPaintSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();

    const first = await topWorldPoint(page, -128, 0);
    const second = await topWorldPoint(page, 0, 0);
    const third = await topWorldPoint(page, 128, 0);
    await page.mouse.click(first.x, first.y);
    await page.keyboard.down('Control');
    await page.mouse.move(second.x, second.y);
    await page.mouse.down();
    await page.mouse.move(third.x, third.y, { steps: 16 });
    await page.mouse.up();
    await page.keyboard.up('Control');

    await expect(page.locator('#selection-kind')).toHaveText('3 Brushes');
    await expect(page.locator('#status-message')).toContainText('Paint selected 3 brushes');

    const duplicateEnd = await topWorldPoint(page, 0, 128);
    await page.keyboard.down('Control');
    await page.mouse.move(second.x, second.y);
    await page.mouse.down();
    await page.mouse.move(duplicateEnd.x, duplicateEnd.y, { steps: 16 });
    await page.mouse.up();
    await page.keyboard.up('Control');

    await expect(page.locator('#brush-count')).toHaveText('6');
    await expect(page.locator('#selection-kind')).toHaveText('3 Brushes');
    await expect(page.locator('#status-message')).toContainText('Duplicate and move brushes');
    const duplicated = await readEditorDocument(page);
    expect(brushesInDocument(duplicated)).toHaveLength(6);
    expect(
      brushesInDocument(duplicated).filter((brush) => deriveBrush(brush).bounds?.min[1] === 96),
    ).toHaveLength(3);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(page.locator('#selection-kind')).toHaveText('3 Brushes');
  });

  test('hides, isolates, and locks objects without dirtying map source', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(selectionPaintSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const first = await topWorldPoint(page, -128, 0);
    const second = await topWorldPoint(page, 0, 0);

    await page.mouse.click(first.x, first.y);
    await openToolbarMenu(page, 'Visibility and locking');
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await expect(page.locator('#hidden-object-count')).toHaveText('1');
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await expect(page.locator('#document-revision')).toHaveText('0');
    await page.mouse.click(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#hidden-object-count')).toHaveText('0');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');

    await page.mouse.click(second.x, second.y);
    await openToolbarMenu(page, 'Visibility and locking');
    await page.getByRole('button', { name: 'Isolate', exact: true }).click();
    await expect(page.locator('#hidden-object-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.mouse.click(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await openToolbarMenu(page, 'Visibility and locking');
    await page.getByRole('button', { name: 'Show all', exact: true }).click();
    await expect(page.locator('#hidden-object-count')).toHaveText('0');

    await page.mouse.click(first.x, first.y);
    await openToolbarMenu(page, 'Visibility and locking');
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(page.locator('#locked-object-count')).toHaveText('1');
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await page.mouse.click(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await openToolbarMenu(page, 'Visibility and locking');
    await page.getByRole('button', { name: 'Unlock all', exact: true }).click();
    await expect(page.locator('#locked-object-count')).toHaveText('0');
    await page.mouse.click(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#document-revision')).toHaveText('0');
    expect(brushesInDocument(await readEditorDocument(page))).toHaveLength(3);
  });

  test('groups mixed viewport selections, opens members for editing, renames, and ungroups', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(selectionPaintSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const first = await topWorldPoint(page, -128, 0);
    const second = await topWorldPoint(page, 0, 0);
    await page.mouse.click(first.x, first.y);
    await page.keyboard.down('Control');
    await page.mouse.click(second.x, second.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');

    await page.locator('#group-name').fill('West hall');
    await page.locator('[data-action="create-group"]').click();
    await expect(page.locator('#selection-kind')).toHaveText('Group');
    await expect(page.locator('#group-count')).toHaveText('1');
    await expect(page.locator('#group-state')).toHaveText('2 objects');
    await expect(page.locator('#document-revision')).toHaveText('1');
    let grouped = await readEditorDocument(page);
    const groupEntity = grouped.entities.find(
      (entity) => entity.properties['_tb_type'] === '_tb_group',
    );
    expect(groupEntity?.properties).toMatchObject({
      classname: 'func_group',
      _tb_name: 'West hall',
      _tb_id: '1',
    });
    expect(groupEntity?.primitives).toHaveLength(2);

    await page.locator('[data-action="open-group"]').click();
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#group-state')).toHaveText('Editing West hall');
    await expect(page.locator('#locked-object-count')).toHaveText('3');
    await page.locator('[data-nudge-axis="0"][data-nudge-direction="1"]').click();
    await expect(page.locator('#document-revision')).toHaveText('2');
    await page.keyboard.press('Escape');
    await expect(page.locator('#selection-kind')).toHaveText('Group');
    await expect(page.locator('#locked-object-count')).toHaveText('0');

    await page.locator('#group-name').fill('West architecture');
    await page.locator('[data-action="rename-group"]').click();
    await expect(page.locator('#document-revision')).toHaveText('3');
    await expect(page.locator('#group-name')).toHaveValue('West architecture');
    await page.locator('[data-action="ungroup"]').click();
    await expect(page.locator('#group-count')).toHaveText('0');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#document-revision')).toHaveText('4');
    grouped = await readEditorDocument(page);
    expect(grouped.entities.some((entity) => entity.properties['_tb_type'] === '_tb_group')).toBe(
      false,
    );
    expect(brushesInDocument(grouped)).toHaveLength(3);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Group');
    await expect(page.locator('#group-count')).toHaveText('1');
    await expect(page.locator('#group-name')).toHaveValue('West architecture');

    await page.mouse.dblclick(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#group-state')).toHaveText('Editing West architecture');
    const empty = await viewportPoint(page, 0, 0.08, 0.08);
    await page.mouse.dblclick(empty.x, empty.y);
    await expect(page.locator('#selection-kind')).toHaveText('Group');
    await expect(page.locator('#locked-object-count')).toHaveText('0');
  });

  test('linked groups synchronize transformed contents and preserve per-copy entity properties', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(regularGroupSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const originalBrush = await topWorldPoint(page, 0, 0);
    await page.mouse.click(originalBrush.x, originalBrush.y);
    await expect(page.locator('#selection-kind')).toHaveText('Group');

    await page.locator('[data-action="create-linked-duplicate"]').click();
    await expect(page.locator('#selection-kind')).toHaveText('Linked Group');
    await expect(page.locator('#group-count')).toHaveText('2');
    await expect(page.locator('#group-state')).toHaveText('Linked · 2 copies');
    await expect(page.locator('[data-action="unlink-group"]')).toBeVisible();
    let linked = await readEditorDocument(page);
    let linkedGroups = deriveEditorGroups(linked);
    expect(new Set(linkedGroups.map((group) => group.linkedGroupId)).size).toBe(1);
    expect(linkedGroups.every((group) => group.transformation)).toBe(true);

    await page.locator('[data-action="open-group"]').click();
    await expect(page.locator('#group-state')).toHaveText('Editing linked · 2 copies');
    const copiedMarker = await topWorldPoint(page, 16, 112);
    await page.mouse.click(copiedMarker.x, copiedMarker.y);
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
    const protectAngle = page.getByRole('checkbox', { name: 'Protect angle' });
    await expect(protectAngle).toBeVisible();
    await protectAngle.check();
    const angle = page.getByRole('textbox', { name: 'angle value' });
    await angle.fill('180');
    await angle.press('Tab');

    const copiedBrush = await topWorldPoint(page, 16, 16);
    await page.mouse.click(copiedBrush.x, copiedBrush.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.locator('[data-nudge-axis="2"][data-nudge-direction="1"]').click();
    linked = await readEditorDocument(page);
    linkedGroups = deriveEditorGroups(linked);
    expect(
      linkedGroups
        .map((group) => deriveBrush(findBrush(linked, group.brushIds[0]!)!).bounds?.min[2])
        .toSorted(),
    ).toEqual([16, 16]);
    const linkedAngles = linkedGroups
      .map((group) => {
        const entity = linked.entities.find(
          (candidate) => candidate.id === group.pointEntityIds[0],
        )!;
        return {
          angle: entity.properties.angle,
          protected: entity.properties['_tb_protected_properties'] ?? '',
        };
      })
      .toSorted((left, right) => Number(left.angle) - Number(right.angle));
    expect(linkedAngles).toEqual([
      { angle: '90', protected: '' },
      { angle: '180', protected: 'angle' },
    ]);

    await page.locator('[data-action="close-group"]').click();
    await page.locator('[data-action="unlink-group"]').click();
    await expect(page.locator('#selection-kind')).toHaveText('Group');
    linked = await readEditorDocument(page);
    expect(deriveEditorGroups(linked).every((group) => group.linkedGroupId === null)).toBe(true);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Linked Group');
  });

  test('navigates the perspective camera without changing the active tool or map', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.getByRole('button', { name: 'Focus', exact: true })).toBeEnabled();

    const beforeStationaryOrbit = await perspectiveCamera(page);
    await page.keyboard.down('Alt');
    await page.mouse.move(brushPoint.x, brushPoint.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(brushPoint.x + 2, brushPoint.y + 2);
    await page.mouse.up({ button: 'right' });
    await page.keyboard.up('Alt');
    const afterStationaryOrbit = await perspectiveCamera(page);
    expect(afterStationaryOrbit).toEqual(beforeStationaryOrbit);

    const beforeOrbit = await perspectiveCamera(page);
    await page.keyboard.down('Alt');
    await page.mouse.move(brushPoint.x, brushPoint.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(brushPoint.x + 64, brushPoint.y + 24, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await page.keyboard.up('Alt');
    const afterOrbit = await perspectiveCamera(page);
    expect(cameraDistance(afterOrbit.position, beforeOrbit.position)).toBeGreaterThan(1);
    await expect(page.locator('#perspective-mode')).toContainText('ORBIT');

    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText('Framed the selection');
    await expect(page.locator('#perspective-mode')).toContainText('FOCUS');

    const lookStart = await perspectiveCamera(page);
    const lookPoint = await perspectivePoint(page, 0.72, 0.32);
    await page.mouse.move(lookPoint.x, lookPoint.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(lookPoint.x + 72, lookPoint.y + 32, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    const lookEnd = await perspectiveCamera(page);
    expect(cameraDistance(lookEnd.position, lookStart.position)).toBeLessThan(0.001);
    expect(Math.abs(lookEnd.yaw - lookStart.yaw)).toBeGreaterThan(0.1);
    expect(lookEnd.pitch).toBeLessThan(lookStart.pitch);
    await expect(page.locator('#perspective-mode')).toContainText('LOOK');

    // Looking and keyboard flight must compose. The look gesture used to retain the eye from
    // pointer-down and snap back to it after WASD translated the camera.
    await page.mouse.move(lookPoint.x, lookPoint.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(lookPoint.x + 12, lookPoint.y + 6);
    await page.keyboard.down('w');
    await page.waitForTimeout(180);
    await page.keyboard.up('w');
    const combinedFlyEnd = await perspectiveCamera(page);
    await page.mouse.move(lookPoint.x + 36, lookPoint.y + 18);
    const combinedLookEnd = await perspectiveCamera(page);
    await page.mouse.up({ button: 'right' });
    expect(cameraDistance(combinedLookEnd.position, combinedFlyEnd.position)).toBeLessThan(0.001);

    const panStart = await perspectiveCamera(page);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(lookPoint.x - 48, lookPoint.y + 40, { steps: 8 });
    await page.mouse.up({ button: 'middle' });
    const panEnd = await perspectiveCamera(page);
    expect(cameraDistance(panEnd.position, panStart.position)).toBeGreaterThan(1);
    await expect(page.locator('#perspective-mode')).toContainText('PAN');

    await page.locator('#grid-size').selectOption('32');
    await page.locator('.source-canvas').nth(0).focus();
    const flyStart = await perspectiveCamera(page);
    await page.keyboard.down('w');
    await page.waitForTimeout(180);
    await page.keyboard.up('w');
    const flyEnd = await perspectiveCamera(page);
    expect(cameraDistance(flyEnd.position, flyStart.position)).toBeGreaterThan(4);
    await expect(page.locator('#perspective-mode')).toContainText('FLY');
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.mouse.down({ button: 'right' });
    const speedStart = await perspectiveCamera(page);
    await page.mouse.wheel(0, -180);
    const speedEnd = await perspectiveCamera(page);
    await page.mouse.up({ button: 'right' });
    expect(speedEnd.flySpeed).toBeGreaterThan(speedStart.flySpeed);
    await expect(page.locator('#viewport-context-menu')).toBeHidden();

    const zoomStart = await perspectiveCamera(page);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Shift');
    const zoomEnd = await perspectiveCamera(page);
    expect(zoomEnd.fieldOfViewDegrees).toBeLessThan(zoomStart.fieldOfViewDegrees);
    await expect(page.locator('#perspective-mode')).toContainText('ZOOM');

    const dollyStart = await perspectiveCamera(page);
    await page.mouse.wheel(0, -160);
    const dollyEnd = await perspectiveCamera(page);
    expect(cameraDistance(dollyEnd.position, dollyStart.position)).toBeGreaterThan(1);
    await expect(page.locator('#perspective-mode')).toContainText('DOLLY');

    await page.keyboard.press('Home');
    await expect(page.locator('#status-message')).toContainText('Framed the selection');
    await expect(page.locator('#perspective-mode')).toContainText('FOCUS');
    await expect(page.locator('#document-revision')).toHaveText('0');
  });

  test('keeps perspective grid lines fine when they cross the near plane', async ({ page }) => {
    await openEditor(page, { empty: true });
    const canvas = page.getByLabel('Perspective map viewport');
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Perspective viewport bounds are unavailable');
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.65);

    for (let index = 0; index < 3; index += 1) await page.mouse.wheel(0, -600);
    await expect.poll(() => perspectiveGridBandThickness(page)).toBeLessThanOrEqual(4);
  });

  test('links orthographic navigation and follows viewport focus under the pointer', async ({
    page,
  }) => {
    await openEditor(page);
    const xyCanvas = page.locator('[data-viewport="xy"] .source-canvas');
    const xzCanvas = page.locator('[data-viewport="xz"] .source-canvas');
    const xyBounds = await xyCanvas.boundingBox();
    const xzBounds = await xzCanvas.boundingBox();
    if (!xyBounds || !xzBounds) throw new Error('Orthographic viewport bounds are unavailable');

    await xyCanvas.focus();
    await page.mouse.move(xzBounds.x + xzBounds.width / 2, xzBounds.y + xzBounds.height / 2);
    await expect(xzCanvas).toBeFocused();

    const beforeXy = await viewportCamera(page, 'xy');
    const beforeXz = await viewportCamera(page, 'xz');
    const beforeYz = await viewportCamera(page, 'yz');
    await page.mouse.move(xyBounds.x + xyBounds.width * 0.65, xyBounds.y + xyBounds.height * 0.4);
    await page.mouse.wheel(0, -160);
    const afterXy = await viewportCamera(page, 'xy');
    const afterXz = await viewportCamera(page, 'xz');
    const afterYz = await viewportCamera(page, 'yz');
    expect(afterXy.orthographicSpan).toBeLessThan(beforeXy.orthographicSpan);
    expect(afterXz.orthographicSpan).toBeCloseTo(afterXy.orthographicSpan);
    expect(afterYz.orthographicSpan).toBeCloseTo(afterXy.orthographicSpan);
    expect(afterXz.center[0]).not.toBe(beforeXz.center[0]);
    expect(afterYz.center[1]).not.toBe(beforeYz.center[1]);
  });

  test('frames a newly opened map instead of leaving distant geometry off-screen', async ({
    page,
  }) => {
    await openEditor(page);
    const ids = createSequentialIdFactory('browser-open-focus');
    const starter = createStarterDocument();
    const distantBrush = createBoxBrush([4800, 6800, 1200], [5200, 7200, 1600], 'DEV_FLOOR', ids);
    const source = serializeMap({
      ...starter,
      entities: [{ ...starter.entities[0]!, primitives: [distantBrush] }],
    });
    await page.locator('#map-file').setInputFiles({
      name: 'distant.map',
      mimeType: 'text/plain',
      buffer: Buffer.from(source),
    });
    await expect(page.locator('#status-message')).toContainText('Opened distant.map');
    const camera = await perspectiveCamera(page);
    expect(camera.center[0]).toBeCloseTo(5000);
    expect(camera.center[1]).toBeCloseTo(7000);
    expect(camera.center[2]).toBeCloseTo(1400);
    const top = await page.locator('.source-canvas').first().boundingBox();
    if (!top) throw new Error('Top viewport has no bounds');
    await page.mouse.click(top.x + top.width / 2, top.y + top.height / 2);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
  });

  test('stationary right-click opens contextual 3D face, object, material, and entity actions', async ({
    page,
  }) => {
    await openEditor(page);
    const point = await perspectivePoint(page, 0.5, 0.58);
    const menu = page.locator('#viewport-context-menu');

    await page.mouse.click(point.x, point.y, { button: 'right' });
    await expect(menu).toBeVisible();
    await expect(menu.locator('.viewport-context-heading')).toContainText('3D view');
    await expect(menu.getByRole('menuitem', { name: 'Select face', exact: true })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Select face', exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await expect(page.locator('#document-revision')).toHaveText('0');

    await page.mouse.click(point.x, point.y, { button: 'right' });
    await menu.getByRole('menuitem', { name: 'Reveal DEV_FLOOR', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Textures', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('#material-filter')).toHaveValue('DEV_FLOOR');
    await expect(page.getByRole('button', { name: 'DEV_FLOOR', exact: true })).toHaveClass(
      /active/,
    );

    await page.mouse.click(point.x, point.y, { button: 'right' });
    await menu.getByRole('menuitem', { name: 'Select object', exact: true }).click();
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await menu.getByRole('menuitem', { name: 'Hide selection', exact: true }).click();
    await expect(page.locator('#hidden-object-count')).toHaveText('1');
    await expect(page.locator('#selection-kind')).toHaveText('None');
    let document = await readEditorDocument(page);
    expect(document.revision).toBe(0);
    await openToolbarMenu(page, 'Visibility and locking');
    await page.getByRole('button', { name: 'Show all', exact: true }).click();

    await page.mouse.click(point.x, point.y, { button: 'right' });
    await menu.locator('summary').filter({ hasText: 'Create point entity' }).click();
    await menu.getByRole('menuitem', { name: 'Deathmatch start', exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
    await expect(page.locator('#document-revision')).toHaveText('1');
    document = await readEditorDocument(page);
    expect(
      document.entities.filter(
        (entity) => entity.properties.classname === 'info_player_deathmatch',
      ),
    ).toHaveLength(1);

    const beforeLook = await perspectiveCamera(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(point.x + 64, point.y + 24, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await expect(menu).toBeHidden();
    const afterLook = await perspectiveCamera(page);
    expect(Math.abs(afterLook.yaw - beforeLook.yaw)).toBeGreaterThan(0.1);
  });

  test('ordinary Paste uses the viewport cursor while Paste at original position preserves coordinates', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(selectionPaintSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const first = await topWorldPoint(page, -128, 0);
    await page.mouse.click(first.x, first.y);

    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText('Copied selected objects');

    const destination = await perspectiveWorldPoint(page, [0, 0, 64]);
    await page.mouse.move(destination.x, destination.y);
    await expect(page.getByRole('button', { name: 'Paste', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Paste', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 64 to 32 32 128');
    await expect(page.locator('#status-message')).toContainText('PERSPECTIVE pointer');
    expect(brushesInDocument(await readEditorDocument(page))).toHaveLength(4);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await page.getByRole('button', { name: 'Paste at original position', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#brush-bounds')).toHaveText('-160 -32 0 to -96 32 64');
    await expect(page.locator('#status-message')).toContainText('original position');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    const topDestination = await topWorldPoint(page, 128, 128);
    await page.mouse.move(topDestination.x, topDestination.y);
    await page.keyboard.press('Control+v');
    await expect(page.locator('#brush-bounds')).toHaveText('96 96 -64 to 160 160 0');
    await expect(page.locator('#status-message')).toContainText('XY pointer');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.keyboard.press('Control+Alt+v');
    await expect(page.locator('#brush-bounds')).toHaveText('-160 -32 0 to -96 32 64');
    await expect(page.locator('#status-message')).toContainText('original position');
  });

  test('ordinary 3D Paste uses the camera default distance when the cursor points into empty space', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(selectionPaintSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const source = await topWorldPoint(page, -128, 0);
    await page.mouse.click(source.x, source.y);
    await page.getByRole('button', { name: 'Copy', exact: true }).click();

    const empty = await viewportPoint(page, 0, 0.08, 0.08);
    await page.mouse.move(empty.x, empty.y);
    const camera = await perspectiveCamera(page);
    await page.getByRole('button', { name: 'Paste', exact: true }).click();

    const document = await readEditorDocument(page);
    const pasted = brushesInDocument(document).at(-1)!;
    const bounds = deriveBrush(pasted).bounds!;
    const center = bounds.min.map((minimum, axis) => (minimum + bounds.max[axis]!) / 2);
    const distanceFromEye = Math.hypot(
      center[0]! - camera.position[0]!,
      center[1]! - camera.position[1]!,
      center[2]! - camera.position[2]!,
    );
    expect(distanceFromEye).toBeGreaterThan(180);
    expect(distanceFromEye).toBeLessThan(340);
    await expect(page.locator('#status-message')).toContainText('PERSPECTIVE pointer');
  });

  test('Ctrl-wheel drills the 3D selection through occluding brushes in both directions', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(drillSelectionSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const center = await perspectivePoint(page, 0.5, 0.5);

    await page.mouse.click(center.x, center.y);
    await expect(page.locator('#brush-bounds')).toHaveText('72 -136 88 to 120 -88 136');
    await page.keyboard.down('Control');
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await expect(page.locator('#brush-bounds')).toHaveText('16 -72 48 to 64 -24 96');
    await expect(page.locator('#status-message')).toContainText(
      'Drilled object selection farther in the PERSPECTIVE view',
    );

    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 120);
    await page.keyboard.up('Control');
    await expect(page.locator('#brush-bounds')).toHaveText('72 -136 88 to 120 -88 136');
    await expect(page.locator('#status-message')).toContainText(
      'Drilled object selection nearer in the PERSPECTIVE view',
    );
  });

  test('wheel drilling reaches overlapping objects and faces in an orthographic view', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(orthographicDrillSelectionSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const center = await topWorldPoint(page, 0, 0);

    await page.mouse.click(center.x, center.y);
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 128 to 32 32 192');

    await page.keyboard.down('Control');
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -96 0 to 96 96 64');
    await expect(page.locator('#status-message')).toContainText(
      'Drilled object selection farther in the XY view',
    );

    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 128 to 32 32 192');

    await page.keyboard.down('Shift');
    await page.mouse.click(center.x, center.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -96 0 to 96 96 64');
    await expect(page.locator('#status-message')).toContainText(
      'Drilled face selection farther in the XY view',
    );

    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 120);
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 128 to 32 32 192');
  });

  test('double-click selects every brush owned by one brush entity', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(brushEntitySiblingSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const first = await topWorldPoint(page, 0, 0);

    await page.mouse.dblclick(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#status-message')).toContainText('Selected 2 sibling brushes');
  });

  test('places, selects, moves, duplicate-moves, deletes, and restores point entities', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Entity', exact: true }).click();
    await expect(page.locator('#point-entity-tool-section')).toBeVisible();
    await page.locator('#point-entity-preset').selectOption('info_player_start');
    await expect(page.locator('#point-entity-classname')).toHaveValue('info_player_start');

    const placedPoint = await perspectiveWorldPoint(page, [96, 96, 0]);
    await page.mouse.click(placedPoint.x, placedPoint.y);
    await expect(page.locator('#entity-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
    await expect(page.locator('#entity-classname')).toHaveText('info_player_start');
    await expect(page.locator('#status-message')).toContainText('Placed info_player_start');

    let document = await readEditorDocument(page);
    let playerStarts = document.entities.filter(
      (entity) => entity.properties.classname === 'info_player_start',
    );
    expect(playerStarts.map(parseEntityOrigin)).toContainEqual([96, 96, 32]);

    await page.getByRole('button', { name: 'Select', exact: true }).click();
    const placedTopPoint = await topWorldPoint(page, 96, 96);
    const movedPoint = await topWorldPoint(page, 160, 160);
    await page.mouse.move(placedTopPoint.x, placedTopPoint.y);
    await page.mouse.down();
    await page.mouse.move(movedPoint.x, movedPoint.y, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Move entity');
    document = await readEditorDocument(page);
    playerStarts = document.entities.filter(
      (entity) => entity.properties.classname === 'info_player_start',
    );
    expect(playerStarts.map(parseEntityOrigin)).toContainEqual([160, 160, 32]);

    const duplicatedPoint = await topWorldPoint(page, 224, 224);
    await page.keyboard.down('Control');
    await page.mouse.move(movedPoint.x, movedPoint.y);
    await page.mouse.down();
    await page.mouse.move(duplicatedPoint.x, duplicatedPoint.y, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    await expect(page.locator('#entity-count')).toHaveText('5');
    await expect(page.locator('#status-message')).toContainText('Duplicate and move entity');
    document = await readEditorDocument(page);
    playerStarts = document.entities.filter(
      (entity) => entity.properties.classname === 'info_player_start',
    );
    expect(playerStarts.map(parseEntityOrigin)).toEqual(
      expect.arrayContaining([
        [160, 160, 32],
        [224, 224, 32],
      ]),
    );

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('#entity-count')).toHaveText('4');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#entity-count')).toHaveText('5');
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
  });

  test('rotates and flips point entities while optionally preserving their angle property', async ({
    page,
  }) => {
    await openEditor(page);
    const playerPoint = await topWorldPoint(page, 0, -96);
    await page.mouse.click(playerPoint.x, playerPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
    await expect(page.locator('#entity-classname')).toHaveText('info_player_start');
    await expect(page.locator('#object-flip-section')).toBeVisible();

    await page.getByRole('button', { name: 'Rotate', exact: true }).click();
    await expect(page.locator('#transform-tool-title')).toHaveText('Rotate entity');
    await expect(page.locator('#rotate-update-entity-angles')).toBeChecked();
    await expect(page.locator('#rotate-update-entity-angles')).toBeEnabled();
    await page.locator('#rotate-angle').fill('90');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Rotate entity');

    let document = await readEditorDocument(page);
    let player = document.entities.find(
      (entity) => entity.properties.classname === 'info_player_start',
    )!;
    expect(parseEntityOrigin(player)).toEqual([0, -96, 24]);
    expect(player.properties.angle).toBe('180');

    await page.locator('#rotate-update-entity-angles').uncheck();
    await page.getByRole('button', { name: 'Apply transform' }).click();
    document = await readEditorDocument(page);
    player = document.entities.find(
      (entity) => entity.properties.classname === 'info_player_start',
    )!;
    expect(player.properties.angle).toBe('180');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.locator('#rotate-update-entity-angles').check();
    await page.getByRole('button', { name: 'Flip Y', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText('Flip entity');
    document = await readEditorDocument(page);
    player = document.entities.find(
      (entity) => entity.properties.classname === 'info_player_start',
    )!;
    expect(parseEntityOrigin(player)).toEqual([0, -96, 24]);
    expect(player.properties.angle).toBe('270');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    document = await readEditorDocument(page);
    player = document.entities.find(
      (entity) => entity.properties.classname === 'info_player_start',
    )!;
    expect(player.properties.angle).toBe('90');
  });

  test('converts a selected brush set into an entity and makes it structural again', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(adjacentBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const left = await topWorldPoint(page, -16, 0);
    const right = await topWorldPoint(page, 16, 0);
    await page.mouse.click(left.x, left.y);
    await page.keyboard.down('Control');
    await page.mouse.click(right.x, right.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');

    await page.locator('#brush-entity-classname').fill('func_detail');
    await page.getByRole('button', { name: 'Make Entity', exact: true }).click();
    await expect(page.locator('#entity-count')).toHaveText('4');
    await expect(page.locator('#entity-classname')).toHaveText('func_detail');
    let document = await readEditorDocument(page);
    expect(
      document.entities.find((entity) => entity.properties.classname === 'func_detail')?.primitives,
    ).toHaveLength(2);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#entity-count')).toHaveText('3');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('#entity-count')).toHaveText('4');
    await expect(page.getByRole('button', { name: 'Make Structural', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Make Structural', exact: true }).click();

    await expect(page.locator('#entity-count')).toHaveText('3');
    document = await readEditorDocument(page);
    expect(document.entities.some((entity) => entity.properties.classname === 'func_detail')).toBe(
      false,
    );
    expect(
      document.entities.find((entity) => entity.properties.classname === 'worldspawn')?.primitives,
    ).toHaveLength(2);
  });

  test('Hull tool captures a reference polygon, duplicates it, and creates one convex brush', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Hull', exact: true }).click();
    const start = await perspectiveWorldPoint(page, [0, 0, 48]);
    const end = await perspectiveWorldPoint(page, [0, 0, 128]);

    await page.mouse.dblclick(start.x, start.y);
    await expect(page.locator('#hull-point-count')).toHaveText('4 points');
    await expect(page.getByRole('button', { name: 'Create hull' })).toBeDisabled();

    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect(page.locator('#hull-point-count')).toHaveText('8 points');
    await expect(page.getByRole('button', { name: 'Create hull' })).toBeEnabled();
    await page.keyboard.press('Enter');
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#status-message')).toContainText('Create hull brush');
    await expect(page.locator('#hull-point-count')).toHaveText('0 points');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
  });

  test('Hull tool places single and rectangular face points and cancels the whole set', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Hull', exact: true }).click();
    const single = await perspectivePoint(page, 0.5, 0.58);
    const rectangleStart = await perspectivePoint(page, 0.45, 0.57);
    const rectangleEnd = await perspectivePoint(page, 0.56, 0.5);

    await page.mouse.click(single.x, single.y);
    await expect(page.locator('#hull-point-count')).toHaveText('1 point');
    await page.mouse.move(rectangleStart.x, rectangleStart.y);
    await page.mouse.down();
    await page.mouse.move(rectangleEnd.x, rectangleEnd.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#hull-point-count')).toContainText('points');
    await expect(page.locator('#hull-point-count')).not.toHaveText('1 point');

    await page.keyboard.press('Escape');
    await expect(page.locator('#hull-point-count')).toHaveText('0 points');
    await expect(page.getByRole('button', { name: 'Hull', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#status-message')).toContainText('Discarded all hull points');
  });

  test('Simple Shape tool creates hollow cylinders and spheroids through live batch previews', async ({
    page,
  }) => {
    await openEditor(page);
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#simple-shape-tool-section')).toBeVisible();
    await page.locator('#simple-shape-kind').selectOption('cylinder');
    await page.locator('#simple-shape-sides').fill('8');
    await page.locator('#simple-shape-hollow').check();
    await page.locator('#simple-shape-thickness').fill('8');
    const start = await topWorldPoint(page, -64, -64);
    const end = await topWorldPoint(page, 64, 64);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('cylinder preview');
    await expect(page.locator('#simple-shape-result')).toHaveText('8 brushes');
    await page.mouse.up();

    await expect(page.locator('#brush-count')).toHaveText('11');
    await expect(page.locator('#selection-kind')).toHaveText('8 Brushes');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');

    await page.locator('#simple-shape-kind').selectOption('uv-sphere');
    await page.locator('#simple-shape-sides').fill('8');
    await page.locator('#simple-shape-rings').fill('4');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('UV spheroid preview');
    await page.mouse.up();
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#brush-faces')).toHaveText('40');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
  });

  test('default tool selects on click and draws shapes only with an empty selection', async ({
    page,
  }) => {
    await openEditor(page);
    await expect(page.getByRole('button', { name: 'Brush', exact: true })).toHaveCount(0);
    await expect(page.locator('#simple-shape-tool-section')).toBeVisible();

    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#simple-shape-tool-section')).toBeHidden();

    const start = await topWorldPoint(page, 256, 256);
    const end = await topWorldPoint(page, 384, 384);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#brush-count')).toHaveText('3');

    await page.mouse.click(start.x, start.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await expect(page.locator('#simple-shape-tool-section')).toBeVisible();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
  });

  test('Radiant grid keys drive snapped brush creation in orthographic views', async ({ page }) => {
    await openEditor(page);
    await page.locator('.source-canvas').nth(1).focus();
    await page.keyboard.press('Digit6');
    await expect(page.locator('#grid-size')).toHaveValue('32');
    await page.keyboard.press('BracketRight');
    await expect(page.locator('#grid-size')).toHaveValue('64');
    await page.keyboard.press('BracketLeft');
    await expect(page.locator('#grid-size')).toHaveValue('32');

    const start = await topWorldPoint(page, 269, 275);
    const end = await topWorldPoint(page, 371, 389);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();

    const created = brushesInDocument(await readEditorDocument(page)).at(-1)!;
    const bounds = deriveBrush(created).bounds!;
    expect([...bounds.min, ...bounds.max].every((value) => value % 32 === 0)).toBe(true);
  });

  test('snaps selected brush vertices to the active grid and undoes the edit', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(offGridBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await page.locator('.source-canvas').nth(1).focus();
    await page.keyboard.press('Digit4');
    await expect(page.locator('#grid-size')).toHaveValue('8');
    const brushPoint = await topWorldPoint(page, 15, 17);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.getByRole('button', { name: 'Snap to grid', exact: true }).click();

    let brush = brushesInDocument(await readEditorDocument(page))[0]!;
    expect(brushVertices(brush).every((point) => point.every((value) => value % 8 === 0))).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    brush = brushesInDocument(await readEditorDocument(page))[0]!;
    expect(deriveBrush(brush).bounds).toEqual({ min: [3, 5, 7], max: [27, 29, 31] });
  });

  test('Simple Shape 3D drawing supports square, cube, and height-only modifiers', async ({
    page,
  }) => {
    await openEditor(page);
    const start = await perspectiveWorldPoint(page, [-64, -64, 0]);
    const end = await perspectiveWorldPoint(page, [64, 32, 0]);
    await page.keyboard.down('Shift');
    await page.keyboard.down('Alt');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('(cube)');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Shift');

    let created = brushesInDocument(await readEditorDocument(page)).at(-1)!;
    let bounds = deriveBrush(created).bounds!;
    const spans = bounds.max.map((component, axis) => component - bounds.min[axis]!);
    expect(spans[0]).toBeCloseTo(spans[1]!);
    expect(spans[1]).toBeCloseTo(spans[2]!);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();

    const topStart = await topWorldPoint(page, -96, -32);
    const topEnd = await topWorldPoint(page, -32, 64);
    await page.keyboard.down('Shift');
    await page.mouse.move(topStart.x, topStart.y);
    await page.mouse.down();
    await page.mouse.move(topEnd.x, topEnd.y, { steps: 8 });
    await expect(page.locator('#status-message')).toContainText('(square)');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    created = brushesInDocument(await readEditorDocument(page)).at(-1)!;
    bounds = deriveBrush(created).bounds!;
    expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(bounds.max[1] - bounds.min[1]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await page.keyboard.down('Alt');
    await page.mouse.move(end.x, end.y - 96, { steps: 8 });
    await expect(page.locator('#status-message')).toContainText('(height)');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    created = brushesInDocument(await readEditorDocument(page)).at(-1)!;
    bounds = deriveBrush(created).bounds!;
    expect(bounds.max[2] - bounds.min[2]).toBeGreaterThan(16);
    expect(deriveBrush(created).valid).toBe(true);
  });

  test('runs convex merge and empty intersection from the contextual CSG controls', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(adjacentBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const left = await topWorldPoint(page, -16, 0);
    const right = await topWorldPoint(page, 16, 0);
    await page.mouse.click(left.x, left.y);
    await page.keyboard.down('Control');
    await page.mouse.click(right.x, right.y);
    await page.keyboard.up('Control');

    await expect(page.locator('#csg-section')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Convex merge' })).toBeEnabled();
    await page.getByRole('button', { name: 'Convex merge' }).click();
    await expect(page.locator('#brush-count')).toHaveText('1');
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 0 to 32 32 32');
    await expect(page.locator('#status-message')).toContainText('CSG merge');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('2');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await page.getByRole('button', { name: 'Intersect', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('0');
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('2');
  });

  test('subtracts the selected cutter and hollows with current grid thickness', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(subtractionBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const center = await topWorldPoint(page, 0, 0);
    await page.mouse.click(center.x, center.y);
    await page.getByRole('button', { name: 'Subtract', exact: true }).click();

    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('4 Brushes');
    await expect(page.locator('#status-message')).toContainText('CSG subtract');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('2');

    await page.locator('#grid-size').selectOption('8');
    await page.mouse.click(center.x, center.y);
    await page.getByRole('button', { name: 'Hollow', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('7');
    await expect(page.locator('#selection-kind')).toHaveText('6 Brushes');
    await expect(page.locator('#status-message')).toContainText('8-unit walls');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('2');
  });

  test('shift-click and double-click select faces without leaving the Select tool', async ({
    page,
  }) => {
    await openEditor(page);
    const point = await perspectivePoint(page, 0.5, 0.58);

    await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Shift');

    await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await expect(page.locator('#face-material')).toHaveText('DEV_FLOOR');
    await expect(page.locator('#face-extrude-section')).toBeVisible();

    await page.keyboard.down('Shift');
    await page.mouse.dblclick(point.x, point.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('6 Faces');
    await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('Shift-drag permanently resizes selected brushes without activating the Face tool', async ({
    page,
  }) => {
    await openEditor(page);
    const start = await perspectiveWorldPoint(page, [0, 0, 0]);
    const end = await perspectiveWorldPoint(page, [0, 0, 96]);
    await page.mouse.click(start.x, start.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');

    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#brush-bounds')).not.toHaveText('-128 -128 -32 to 128 128 0');
    await expect(page.locator('#status-message')).toContainText('Extrude face');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.mouse.click(start.x, start.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');

    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#status-message')).toContainText('Split-extrude face');
  });

  test('Shift-drag resizes coplanar faces across a multi-brush object selection atomically', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(coplanarBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();

    const lowerCenter = await topWorldPoint(page, -16, -40);
    const upperCenter = await topWorldPoint(page, -16, 40);
    await page.mouse.click(lowerCenter.x, lowerCenter.y);
    await page.keyboard.down('Control');
    await page.mouse.click(upperCenter.x, upperCenter.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');

    // Start just beyond the selected silhouette so the Select tool's face-proximity heuristic
    // resolves the +X plane instead of the top face hit by the orthographic ray.
    const grabbedFace = await topWorldPoint(page, 6, -40);
    const movedFace = await topWorldPoint(page, 22, -40);
    await page.keyboard.down('Shift');
    await page.mouse.move(grabbedFace.x, grabbedFace.y);
    await page.mouse.down();
    await page.mouse.move(movedFace.x, movedFace.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Extrude shared faces');
    const moved = await readEditorDocument(page);
    expect(brushesInDocument(moved).map((brush) => deriveBrush(brush).bounds?.max[0])).toEqual([
      16, 16,
    ]);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    const restored = await readEditorDocument(page);
    expect(brushesInDocument(restored).map((brush) => deriveBrush(brush).bounds?.max[0])).toEqual([
      0, 0,
    ]);
  });

  test('Shift-drag acquires a selected brush face just outside its silhouette edge', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');

    const center = await perspectiveWorldPoint(page, [0, 0, 0]);
    const corner = await perspectiveWorldPoint(page, [128, 128, 0]);
    const length = Math.hypot(corner.x - center.x, corner.y - center.y);
    const outward = {
      x: (corner.x - center.x) / length,
      y: (corner.y - center.y) / length,
    };
    const nearEdge = { x: corner.x + outward.x * 6, y: corner.y + outward.y * 6 };
    const end = { x: nearEdge.x + outward.x * 48, y: nearEdge.y + outward.y * 48 };

    await page.keyboard.down('Shift');
    await page.mouse.move(nearEdge.x, nearEdge.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Extrude face');
    await expect(page.locator('#brush-bounds')).not.toHaveText('-128 -128 -32 to 128 128 0');
  });

  test('permanent resize modifiers move a face freely or stamp a new brush from Select', async ({
    page,
  }) => {
    await openEditor(page);
    const start = await perspectivePoint(page, 0.5, 0.58);
    const translateEnd = await perspectivePoint(page, 0.58, 0.48);
    const stampEnd = await perspectivePoint(page, 0.5, 0.38);
    await page.mouse.click(start.x, start.y);

    await page.keyboard.down('Shift');
    await page.keyboard.down('Alt');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(translateEnd.x, translateEnd.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Shift');

    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Move face');
    await expect(page.locator('#geometry-state')).toHaveText('valid');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.down('Alt');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(stampEnd.x, stampEnd.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');

    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#status-message')).toContainText('Stamp face');
  });

  test('Sweep previews path controls and commits all generated brushes as one undoable edit', async ({
    page,
  }) => {
    await openEditor(page);
    const point = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Shift');
    await page.getByRole('button', { name: 'Sweep', exact: true }).click();

    await expect(page.locator('#sweep-tool-section')).toBeVisible();
    await expect(page.locator('#sweep-generated-count')).toHaveText('4 brushes');
    await expect(page.locator('#brush-count')).toHaveText('7');
    await page.locator('#sweep-segments').fill('3');
    await page.locator('#sweep-iterations').fill('2');
    await page.locator('#sweep-rotate-z').fill('30');
    await page.locator('#sweep-path').selectOption('arc');
    await page.locator('#sweep-snap').check();

    await expect(page.locator('#sweep-generated-count')).toHaveText('6 brushes');
    await expect(page.locator('#brush-count')).toHaveText('9');
    await expect(page.locator('#status-message')).toContainText('Sweep preview');
    await page.getByRole('button', { name: 'Apply Sweep', exact: true }).click();

    await expect(page.locator('#selection-kind')).toHaveText('6 Brushes');
    await expect(page.locator('#brush-count')).toHaveText('9');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Created 6 brushes');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('9');
    await expect(page.locator('#selection-kind')).toHaveText('6 Brushes');
  });

  test('Sweep destination supports direct 3D movement, ring rotation, uniform scale, and two-stage Escape', async ({
    page,
  }) => {
    await openEditor(page);
    const face = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(face.x, face.y);
    await page.keyboard.up('Shift');
    await page.getByRole('button', { name: 'Sweep', exact: true }).click();

    const center = await perspectiveWorldPoint(page, [0, 0, 64]);
    const movedCenter = await perspectiveWorldPoint(page, [32, 0, 64]);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(movedCenter.x, movedCenter.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#sweep-translate-x')).toHaveValue('32');
    await expect(page.locator('#status-message')).toContainText('destination translate set');

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    const ringStart = await perspectiveWorldPoint(page, [168, 0, 64]);
    const ringEnd = await perspectiveWorldPoint(page, [0, 168, 64]);
    await page.mouse.move(ringStart.x, ringStart.y);
    await page.mouse.down();
    await page.mouse.move(ringEnd.x, ringEnd.y, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('#sweep-rotate-z')).not.toHaveValue('0');
    await expect(page.locator('#status-message')).toContainText('destination rotate set');

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    const scalePivot = await perspectiveWorldPoint(page, [0, 0, 64]);
    const scaleStart = await perspectiveWorldPoint(page, [128, 128, 64]);
    const scaleEnd = {
      x: scalePivot.x + (scaleStart.x - scalePivot.x) * 1.5,
      y: scalePivot.y + (scaleStart.y - scalePivot.y) * 1.5,
    };
    await page.mouse.move(scaleStart.x, scaleStart.y);
    await page.mouse.down();
    await page.mouse.move(scaleEnd.x, scaleEnd.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#sweep-scale')).toHaveValue('1.5');
    await expect(page.locator('#status-message')).toContainText('destination scale set');

    await page.keyboard.press('Escape');
    await expect(page.locator('#sweep-scale')).toHaveValue('1');
    await expect(page.getByRole('button', { name: 'Sweep', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#brush-count')).toHaveText('3');
  });

  test('Face tool drags a plane along its normal as one undoable extrusion', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const start = await perspectivePoint(page, 0.5, 0.58);
    const end = await perspectivePoint(page, 0.5, 0.38);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#brush-bounds')).not.toHaveText('-128 -128 -32 to 128 128 0');
    await expect(page.locator('#status-message')).toContainText('Extrude face');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 128 0');
  });

  test('Alt-drag moves face vertices on perspective and orthographic viewport planes', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const perspectiveStart = await perspectivePoint(page, 0.5, 0.58);
    const perspectiveEnd = await perspectivePoint(page, 0.58, 0.48);

    await page.keyboard.down('Alt');
    await page.mouse.move(perspectiveStart.x, perspectiveStart.y);
    await page.mouse.down();
    await page.mouse.move(perspectiveEnd.x, perspectiveEnd.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');

    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Move face');
    await expect(page.locator('#brush-bounds')).not.toHaveText('-128 -128 -32 to 128 128 0');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 128 0');

    const topStart = await topWorldPoint(page, -64, 0);
    const topEnd = await topWorldPoint(page, -32, 32);
    await page.keyboard.down('Alt');
    await page.mouse.move(topStart.x, topStart.y);
    await page.mouse.down();
    await page.mouse.move(topEnd.x, topEnd.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');

    await expect(page.locator('#document-revision')).toHaveText('3');
    await expect(page.locator('#status-message')).toContainText('Move face');
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -32 0 to 0 64 96');
  });

  test('Face handles accept viewport-aware keyboard nudges and staged Escape cancellation', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const face = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(face.x, face.y);
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    const topPointer = await topWorldPoint(page, 0, 0);
    await page.mouse.move(topPointer.x, topPointer.y);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#status-message')).toContainText('Nudge face');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 144 128 0');
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await expect(page.locator('#face-material')).toHaveText('DEV_FLOOR');

    const frontPointer = await frontWorldPoint(page, 0, 48);
    await page.mouse.move(frontPointer.x, frontPointer.y);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 144 128 16');
    await expect(page.locator('#document-revision')).toHaveText('2');
    await expect(page.locator('#geometry-state')).toHaveText('valid');

    await page.keyboard.press('Escape');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.getByRole('button', { name: 'Face', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#status-message')).toContainText('Press Escape again');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.keyboard.press('Escape');
    await expect(page.locator('#selection-kind')).toHaveText('None');
  });

  test('Ctrl+Alt-drag stamps an independent face prism and the inspector repeats it exactly', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const start = await perspectiveWorldPoint(page, [0, 0, 0]);
    const end = await perspectiveWorldPoint(page, [0, 0, 96]);
    await page.mouse.click(start.x, start.y);
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');

    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Stamp face');
    const stampedDocument = await readEditorDocument(page);
    const stampedBounds = brushesInDocument(stampedDocument).map(
      (brush) => deriveBrush(brush).bounds,
    );
    expect(stampedBounds).toContainEqual({ min: [-128, -128, -32], max: [128, 128, 0] });
    expect(
      stampedBounds.some(
        (bounds) =>
          bounds?.min[0] === -128 &&
          bounds.min[1] === -128 &&
          bounds.min[2] === 0 &&
          bounds.max[0] === 128 &&
          bounds.max[1] === 128 &&
          bounds.max[2] > 0,
      ),
    ).toBe(true);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await page.locator('#face-extrude-distance').fill('16');
    await page.getByRole('button', { name: 'Stamp', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#document-revision')).toHaveText('3');
    await expect(page.locator('#status-message')).toContainText('Stamp face');
  });

  test('losing pointer capture cancels a face preview and leaves the next drag usable', async ({
    page,
  }) => {
    await openEditor(page);
    const start = await perspectiveWorldPoint(page, [0, 0, 0]);
    const end = await perspectiveWorldPoint(page, [0, 0, 96]);
    await page.mouse.click(start.x, start.y);
    await page.locator('[data-viewport="perspective"] .source-canvas').evaluate((canvas) => {
      canvas.addEventListener(
        'pointerdown',
        (event) => {
          canvas.dataset.testPointerId = String((event as PointerEvent).pointerId);
        },
        { once: true },
      );
    });
    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 4 });
    await page.locator('[data-viewport="perspective"] .source-canvas').evaluate((canvas) => {
      canvas.dispatchEvent(
        new PointerEvent('lostpointercapture', {
          pointerId: Number(canvas.dataset.testPointerId),
        }),
      );
    });
    await expect(page.locator('[data-viewport="perspective"]')).not.toHaveClass(/extruding/);
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect(page.locator('#document-revision')).toHaveText('0');
    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#document-revision')).toHaveText('1');
  });

  test('Ctrl-drag split-extrudes a face into two undoable brushes', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const start = await perspectivePoint(page, 0.5, 0.58);
    const end = await perspectivePoint(page, 0.5, 0.38);

    await page.keyboard.down('Control');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Control');

    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#status-message')).toContainText('Split-extrude face');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(page.locator('#document-revision')).toHaveText('2');

    await page.mouse.click(start.x, start.y);
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await page.locator('#face-extrude-distance').fill('-16');
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#document-revision')).toHaveText('3');
    await expect(page.locator('#status-message')).toContainText('Split-extrude face');
  });

  test('Face tool extrudes an opposing shared boundary across adjacent brushes', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(adjacentBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await expect(page.locator('#brush-count')).toHaveText('2');

    const leftCenter = await topWorldPoint(page, -16, 0);
    const rightCenter = await topWorldPoint(page, 16, 0);
    await page.mouse.click(leftCenter.x, leftCenter.y);
    await page.keyboard.down('Control');
    await page.mouse.click(rightCenter.x, rightCenter.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');

    await page.getByRole('button', { name: 'Face' }).click();
    const sharedFace = await topWorldPoint(page, 0, 0);
    const movedFace = await topWorldPoint(page, 16, 0);
    await page.mouse.move(sharedFace.x, sharedFace.y);
    await page.mouse.down();
    await page.mouse.move(movedFace.x, movedFace.y, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('#selection-kind')).toHaveText('2 Faces');
    await expect(page.locator('#face-extrude-section')).toBeVisible();
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 0 to 16 32 32');
    await expect(page.locator('#status-message')).toContainText('Extrude shared faces');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -32 0 to 0 32 32');
    await expect(page.locator('#document-revision')).toHaveText('2');
  });

  test('Face tool toggles faces and double-click selects every face on a brush', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const point = await perspectivePoint(page, 0.5, 0.58);

    await page.mouse.click(point.x, point.y);
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('None');

    await page.mouse.dblclick(point.x, point.y);
    await expect(page.locator('#selection-kind')).toHaveText('6 Faces');
    await expect(page.locator('#face-extrude-section')).toBeHidden();
    await expect(page.locator('[data-action="duplicate"]')).toBeDisabled();
    await expect(page.locator('[data-action="delete"]')).toBeDisabled();

    await page.getByRole('tab', { name: 'Textures' }).click();
    await page.locator('#material-name').fill('FACE_SET');
    await page.locator('[data-action="apply-material"]').click();
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#face-material')).toHaveText('FACE_SET');
    await expect(page.locator('#status-message')).toContainText('Apply material');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#face-material')).toHaveText('DEV_FLOOR');

    const empty = await perspectivePoint(page, 0.05, 0.05);
    await page.mouse.click(empty.x, empty.y);
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await page.keyboard.down('Alt');
    await page.mouse.dblclick(point.x, point.y);
    await page.keyboard.up('Alt');
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await expect(page.locator('#status-message')).toContainText('Select coplanar faces');
  });

  test('material browser reports usage, selects consumers, and replaces globally or in selection', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(materialUsageSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await page.getByRole('tab', { name: 'Textures', exact: true }).click();

    await expect(page.locator('#material-count')).toHaveText('4 loaded · 2 in use');
    await expect(page.locator('#material-coverage')).toBeHidden();
    await expect(page.locator('.material-tile.in-use')).toHaveCount(2);
    await page.locator('#material-sort').selectOption('usage');
    await expect(page.locator('.material-tile').first().locator('span')).toHaveText('DEV_FLOOR');
    await page.locator('#material-used-only').check();
    await expect(page.locator('.material-tile')).toHaveCount(2);
    await page.getByRole('button', { name: 'DEV_FLOOR', exact: true }).click();

    await page.locator('[data-action="select-material-faces"]').click();
    await expect(page.locator('#selection-kind')).toHaveText('10 Faces');
    await expect(page.getByRole('button', { name: 'Face', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.locator('[data-action="select-material-brushes"]').click();
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.keyboard.press('Escape');
    await expect(page.locator('#material-replace-scope')).toContainText('whole map');
    await page.locator('#material-replace-source').fill('DEV_FLOOR');
    await page.locator('#material-replace-target').fill('REPLACED');
    await page.locator('[data-action="replace-material"]').click();
    await expect(page.locator('#selection-kind')).toHaveText('10 Faces');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#material-coverage')).toContainText(
      'Missing 1 of 2 map materials: REPLACED',
    );
    await expect(page.locator('#status-message')).toContainText('on 10 faces');
    let document = await readEditorDocument(page);
    expect(
      brushesInDocument(document).flatMap((brush) =>
        brush.faces.filter((face) => face.material === 'REPLACED'),
      ),
    ).toHaveLength(10);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('tab', { name: 'Textures', exact: true }).click();
    await page.getByRole('button', { name: 'DEV_FLOOR', exact: true }).click();
    await page.locator('[data-action="select-material-brushes"]').click();
    const first = await topWorldPoint(page, -64, 0);
    await page.mouse.click(first.x, first.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await expect(page.locator('#material-replace-scope')).toContainText('1 selected brush');
    await page.locator('#material-replace-source').fill('DEV_FLOOR');
    await page.locator('#material-replace-target').fill('SCOPED');
    await page.locator('[data-action="replace-material"]').click();
    await expect(page.locator('#selection-kind')).toHaveText('4 Faces');
    await expect(page.locator('#status-message')).toContainText('on 4 faces');
    document = await readEditorDocument(page);
    expect(
      brushesInDocument(document).flatMap((brush) =>
        brush.faces.filter((face) => face.material === 'SCOPED'),
      ),
    ).toHaveLength(4);
  });

  test('Face tool lassos projected handles in orthographic and perspective views', async ({
    page,
  }) => {
    await openEditor(page);
    const ground = await topWorldPoint(page, 64, -96);
    await page.mouse.click(ground.x, ground.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.getByRole('button', { name: 'Face' }).click();

    const rightStart = await topWorldPoint(page, 160, 32);
    const rightEnd = await topWorldPoint(page, 96, -32);
    await page.mouse.move(rightStart.x, rightStart.y);
    await page.mouse.down();
    await page.mouse.move(rightEnd.x, rightEnd.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    const leftStart = await topWorldPoint(page, -160, 32);
    const leftEnd = await topWorldPoint(page, -96, -32);
    await page.keyboard.down('Shift');
    await page.mouse.move(leftStart.x, leftStart.y);
    await page.mouse.down();
    await page.mouse.move(leftEnd.x, leftEnd.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('2 Faces');

    await page.mouse.move(rightStart.x, rightStart.y);
    await page.mouse.down();
    await page.mouse.move(rightEnd.x, rightEnd.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    const perspectiveStart = await perspectivePoint(page, 0.05, 0.05);
    const perspectiveEnd = await perspectivePoint(page, 0.95, 0.95);
    await page.keyboard.down('Shift');
    await page.mouse.move(perspectiveStart.x, perspectiveStart.y);
    await page.mouse.down();
    await page.mouse.move(perspectiveEnd.x, perspectiveEnd.y, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('6 Faces');
    await expect(page.locator('#status-message')).toContainText('Lasso selected 6 faces');
  });

  test('Face tool paint-selects visible faces across multiple brushes', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const firstPillar = await topWorldPoint(page, -64, 0);
    const secondPillar = await topWorldPoint(page, 64, 0);
    await page.mouse.click(firstPillar.x, firstPillar.y);
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.mouse.move(firstPillar.x, firstPillar.y);
    await page.mouse.down();
    await page.mouse.move(secondPillar.x, secondPillar.y, { steps: 24 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');

    await expect(page.locator('#selection-kind')).toHaveText('3 Faces');
    await expect(page.locator('#status-message')).toContainText('Paint selected 3 faces');
    await page.getByRole('tab', { name: 'Textures' }).click();
    await page.locator('#material-name').fill('PAINTED_PATH');
    await page.locator('[data-action="apply-material"]').click();
    await expect(page.locator('#face-material')).toHaveText('PAINTED_PATH');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#document-revision')).toHaveText('2');
  });

  test('Perspective face painting accumulates frontmost brush surfaces', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Face' }).click();
    const firstPillar = await perspectiveWorldPoint(page, [-64, 0, 96]);
    const secondPillar = await perspectiveWorldPoint(page, [64, 0, 160]);
    await page.mouse.click(firstPillar.x, firstPillar.y);
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    await page.keyboard.down('Meta');
    await page.keyboard.down('Shift');
    await page.mouse.move(firstPillar.x, firstPillar.y);
    await page.mouse.down();
    await page.mouse.move(secondPillar.x, secondPillar.y, { steps: 32 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.keyboard.up('Meta');

    await expect(page.locator('#selection-kind')).toHaveText(/^[2-9] Faces$/);
    await expect(page.locator('#status-message')).toContainText('Paint selected');
    await expect(page.locator('#pointer-context')).toContainText('PERSPECTIVE / face paint');
  });

  test('Alt transfers projected, material-only, and whole-brush face attributes in 3D', async ({
    page,
  }) => {
    await openEditor(page);
    const sourcePoint = await perspectivePoint(page, 0.5, 0.58);
    const targetPoint = await perspectiveWorldPoint(page, [64, 0, 160]);
    await page.keyboard.down('Shift');
    await page.mouse.click(sourcePoint.x, sourcePoint.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('Face');

    await page.getByRole('tab', { name: 'Textures' }).click();
    await page.locator('#material-name').fill('TRANSFER_SOURCE');
    await page.locator('[data-action="apply-material"]').click();
    await page.locator('#texture-shift-u').fill('37');
    await page.locator('#texture-shift-v').fill('-11');
    await page.locator('#texture-scale-u').fill('0.5');
    await page.locator('#texture-scale-v').fill('2');
    await page.locator('#texture-rotation').fill('30');
    await page.locator('[data-action="apply-texture-transform"]').click();
    await expect(page.locator('#document-revision')).toHaveText('2');

    await page.keyboard.down('Alt');
    await page.mouse.click(targetPoint.x, targetPoint.y);
    await page.keyboard.up('Alt');
    await expect(page.locator('#document-revision')).toHaveText('3');
    let document = await readEditorDocument(page);
    let brushes = brushesInDocument(document);
    const sourceFace = brushes[0]!.faces.find((face) => face.material === 'TRANSFER_SOURCE')!;
    let targetFaces = brushes[2]!.faces.filter((face) => face.material === 'TRANSFER_SOURCE');
    expect(targetFaces).toHaveLength(1);
    expect(targetFaces[0]!.projection).toEqual(sourceFace.projection);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#document-revision')).toHaveText('4');
    await page.keyboard.down('Alt');
    await page.keyboard.down('Control');
    await page.mouse.click(targetPoint.x, targetPoint.y);
    await page.keyboard.up('Control');
    await page.keyboard.up('Alt');
    await expect(page.locator('#document-revision')).toHaveText('5');
    document = await readEditorDocument(page);
    brushes = brushesInDocument(document);
    targetFaces = brushes[2]!.faces.filter((face) => face.material === 'TRANSFER_SOURCE');
    expect(targetFaces).toHaveLength(1);
    expect(targetFaces[0]!.projection).not.toEqual(sourceFace.projection);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#document-revision')).toHaveText('6');
    await page.keyboard.down('Alt');
    await page.mouse.dblclick(targetPoint.x, targetPoint.y);
    await page.keyboard.up('Alt');
    await expect(page.locator('#document-revision')).toHaveText('7');
    document = await readEditorDocument(page);
    brushes = brushesInDocument(document);
    expect(brushes[2]!.faces.every((face) => face.material === 'TRANSFER_SOURCE')).toBe(true);
  });

  test('edits Quake II surface flags without discarding unknown bits', async ({ page }) => {
    await page.goto('http://127.0.0.1:5174/');
    await page.getByRole('button', { name: 'New map', exact: true }).click();
    await page.getByLabel('Game').selectOption('quake2');
    await page.getByRole('button', { name: 'Create map', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-worldview-editor-ready', 'true');

    const starter = createStarterDocument();
    const attributed: MapDocument = {
      ...starter,
      faceSyntax: 'quake',
      entities: starter.entities.map((entity) =>
        Object.assign({}, entity, {
          primitives: entity.primitives.map((primitive) =>
            primitive.kind === 'brush'
              ? Object.assign({}, primitive, {
                  faces: primitive.faces.map((face) =>
                    Object.assign({}, face, { surface: { flags: 0x100, value: 300 } }),
                  ),
                })
              : primitive,
          ),
        }),
      ),
    };
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(serializeMap(attributed));
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const point = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await page.getByRole('tab', { name: 'Textures', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Quake II surface' })).toBeVisible();
    await expect(page.getByText('Unknown bits: 0x100')).toBeVisible();

    await page.getByLabel('Sky', { exact: true }).check();
    expect(
      brushesInDocument(await readEditorDocument(page)).some((brush) =>
        brush.faces.some(({ surface }) => surface.flags === 0x104),
      ),
    ).toBe(true);
    await page.keyboard.press('Control+z');
    expect(
      brushesInDocument(await readEditorDocument(page)).every((brush) =>
        brush.faces.every(({ surface }) => surface.flags === 0x100),
      ),
    ).toBe(true);
  });

  test('Alt-drag paints a chained attribute path as one undoable 3D transaction', async ({
    page,
  }) => {
    await openEditor(page);
    const sourcePoint = await perspectiveWorldPoint(page, [-64, 0, 96]);
    const pathStart = await perspectivePoint(page, 0.5, 0.58);
    const pathEnd = await perspectiveWorldPoint(page, [64, 0, 160]);
    await page.keyboard.down('Shift');
    await page.mouse.click(sourcePoint.x, sourcePoint.y);
    await page.keyboard.up('Shift');
    await page.getByRole('tab', { name: 'Textures' }).click();
    await page.locator('#material-name').fill('CHAIN_SOURCE');
    await page.locator('[data-action="apply-material"]').click();

    await page.keyboard.down('Alt');
    await page.mouse.move(pathStart.x, pathStart.y);
    await page.mouse.down();
    await page.mouse.move(pathEnd.x, pathEnd.y, { steps: 32 });
    await page.mouse.up();
    await page.keyboard.up('Alt');

    await expect(page.locator('#document-revision')).toHaveText('2');
    await expect(page.locator('#pointer-context')).toContainText('PERSPECTIVE / transfer');
    let document = await readEditorDocument(page);
    expect(
      brushesInDocument(document)
        .flatMap((brush) => brush.faces)
        .filter((face) => face.material === 'CHAIN_SOURCE').length,
    ).toBeGreaterThanOrEqual(3);
    await page.getByRole('button', { name: 'Undo' }).click();
    document = await readEditorDocument(page);
    expect(
      brushesInDocument(document)
        .flatMap((brush) => brush.faces)
        .filter((face) => face.material === 'CHAIN_SOURCE'),
    ).toHaveLength(1);
  });

  test('Copy and Paste transfer standalone face attributes onto a 3D target selection', async ({
    page,
  }) => {
    await openEditor(page);
    const sourcePoint = await perspectivePoint(page, 0.5, 0.58);
    const targetPoint = await perspectiveWorldPoint(page, [64, 0, 160]);
    await page.keyboard.down('Shift');
    await page.mouse.click(sourcePoint.x, sourcePoint.y);
    await page.keyboard.up('Shift');
    await page.getByRole('tab', { name: 'Textures' }).click();
    await page.locator('#material-name').fill('CLIPBOARD_SOURCE');
    await page.locator('[data-action="apply-material"]').click();
    await page.locator('#texture-shift-u').fill('29');
    await page.locator('#texture-shift-v').fill('-17');
    await page.locator('#texture-scale-u').fill('0.5');
    await page.locator('#texture-scale-v').fill('1.5');
    await page.locator('#texture-rotation').fill('45');
    await page.locator('[data-action="apply-texture-transform"]').click();

    const copy = page.getByRole('button', { name: 'Copy', exact: true });
    await expect(copy).toBeEnabled();
    await copy.click();
    await expect(page.locator('#status-message')).toContainText(
      'Copied face material and attributes',
    );

    await page.mouse.click(targetPoint.x, targetPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.keyboard.down('Shift');
    await page.mouse.click(targetPoint.x, targetPoint.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('#selection-kind')).toHaveText('Face');
    await page.getByRole('button', { name: 'Paste', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText(
      'Pasted CLIPBOARD_SOURCE and its attributes onto 1 face',
    );
    await expect(page.locator('#document-revision')).toHaveText('3');

    let document = await readEditorDocument(page);
    const source = brushesInDocument(document)[0]!.faces.find(
      (face) => face.material === 'CLIPBOARD_SOURCE',
    )!;
    const targets = brushesInDocument(document)[2]!.faces.filter(
      (face) => face.material === 'CLIPBOARD_SOURCE',
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]!.projection).toEqual(source.projection);

    await page.getByRole('button', { name: 'Undo' }).click();
    document = await readEditorDocument(page);
    expect(
      brushesInDocument(document)[2]!.faces.some((face) => face.material === 'CLIPBOARD_SOURCE'),
    ).toBe(false);

    await page.mouse.click(targetPoint.x, targetPoint.y, { button: 'right' });
    const menu = page.locator('#viewport-context-menu');
    await expect(menu.getByRole('menuitem', { name: 'Copy face attributes' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Paste face attributes here' })).toBeVisible();
  });

  test('texture alignment controls edit faces and whole object selections reversibly', async ({
    page,
  }) => {
    await openEditor(page);
    const point = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Shift');
    await page.getByRole('tab', { name: 'Textures' }).click();

    await page.getByRole('button', { name: 'Flip U' }).click();
    await expect(page.locator('#texture-scale-u')).toHaveValue('-1');
    await expect(page.locator('#status-message')).toContainText('Flip texture horizontally');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#texture-scale-u')).toHaveValue('1');

    await page.getByRole('button', { name: 'Rotate +90°' }).click();
    await expect(page.locator('#texture-rotation')).toHaveValue('90');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#texture-rotation')).toHaveValue('0');

    await page.locator('[data-texture-layout="auto-fit"]').click();
    await expect(page.locator('#texture-scale-u')).toHaveValue('4');
    await expect(page.locator('#texture-scale-v')).toHaveValue('4');
    await expect(page.locator('#texture-shift-u')).toHaveValue('32');
    await expect(page.locator('#texture-shift-v')).toHaveValue('32');
    await page.getByRole('button', { name: 'Undo' }).click();

    await page.locator('[data-texture-layout="justify-u-min"]').click();
    await expect(page.locator('#texture-shift-u')).toHaveValue('128');
    await expect(page.locator('#status-message')).toContainText('Justify texture left');
    await page.getByRole('button', { name: 'Undo' }).click();

    await page.locator('[data-texture-layout="fit-u"]').click();
    await expect(page.locator('#texture-scale-u')).toHaveValue('0.8');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.locator('[data-texture-layout="fit-u"]').click({ modifiers: ['Meta'] });
    await expect(page.locator('#texture-scale-u')).toHaveValue('4');
    await page.locator('[data-texture-layout="fit-u"]').click({ modifiers: ['Meta'] });
    await expect(page.locator('#texture-scale-u')).toHaveValue('8');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();

    await page.locator('[data-texture-layout="align-edge"]').click();
    expect(Number(await page.locator('#texture-rotation').inputValue())).not.toBeCloseTo(0);
    await page.locator('[data-texture-layout="align-edge"]').click({ modifiers: ['Shift'] });
    expect(Number(await page.locator('#texture-rotation').inputValue())).toBeCloseTo(0);

    await page.mouse.click(point.x, point.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.locator('[data-texture-layout="auto-fit"]').click();
    let document = await readEditorDocument(page);
    expect(
      brushesInDocument(document)[0]!.faces.every((face) =>
        face.projection.scale.every((component) => component !== 1),
      ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Flip V' }).click();
    document = await readEditorDocument(page);
    expect(
      brushesInDocument(document)[0]!.faces.every((face) => face.projection.scale[1] === -1),
    ).toBe(true);
    await page.getByRole('button', { name: 'Undo' }).click();
  });

  test('graphical UV editor pans, rotates, and scales the selected face with live history', async ({
    page,
  }) => {
    await openEditor(page);
    const face = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(face.x, face.y);
    await page.keyboard.up('Shift');
    await page.getByRole('tab', { name: 'Textures', exact: true }).click();

    const editor = page.locator('#uv-editor');
    await expect(editor).toBeVisible();
    await expect(page.locator('#uv-editor-status')).toContainText('DEV_FLOOR · 64×64 · 1 face');
    const bounds = await editor.boundingBox();
    if (!bounds) throw new Error('The UV editor has no bounds');
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const xScale = bounds.width / 320;
    const yScale = bounds.height / 220;

    await page.mouse.move(center.x - 30, center.y - 20);
    await page.mouse.down();
    await page.mouse.move(center.x + 10, center.y - 20, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Pan texture');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#texture-shift-u')).not.toHaveValue('0');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#texture-shift-u')).toHaveValue('0');

    await page.mouse.move(center.x + 72 * xScale, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x, center.y - 72 * yScale, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Rotate texture');
    await expect(page.locator('#texture-rotation')).not.toHaveValue('0');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#texture-rotation')).toHaveValue('0');

    await page.mouse.move(center.x + 52 * xScale, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 82 * xScale, center.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Scale texture');
    await expect(page.locator('#texture-scale-u')).not.toHaveValue('1');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
  });

  test('UV editor pivot snaps without dirtying the map and Escape cancels a live preview', async ({
    page,
  }) => {
    await openEditor(page);
    const face = await perspectivePoint(page, 0.5, 0.58);
    await page.keyboard.down('Shift');
    await page.mouse.click(face.x, face.y);
    await page.keyboard.up('Shift');
    await page.getByRole('tab', { name: 'Textures', exact: true }).click();
    const editor = page.locator('#uv-editor');
    const bounds = await editor.boundingBox();
    if (!bounds) throw new Error('The UV editor has no bounds');
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + (66 / 320) * bounds.width,
      bounds.y + (16 / 220) * bounds.height,
      { steps: 10 },
    );
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('UV transform origin moved');
    await expect(page.locator('#document-revision')).toHaveText('0');
    await page.getByRole('button', { name: 'Center origin', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText('origin reset');

    await page.mouse.move(center.x - 30, center.y - 20);
    await page.mouse.down();
    await page.mouse.move(center.x + 15, center.y - 20, { steps: 8 });
    await expect(page.locator('#texture-shift-u')).not.toHaveValue('0');
    await page.mouse.move(center.x - 30, center.y - 20, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#texture-shift-u')).toHaveValue('0');
    await expect(page.locator('#document-revision')).toHaveText('0');

    await page.mouse.move(center.x - 30, center.y - 20);
    await page.mouse.down();
    await page.mouse.move(center.x + 15, center.y - 20, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('Pan texture preview');
    await expect(page.locator('#texture-shift-u')).not.toHaveValue('0');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('UV transform cancelled');
    await expect(page.locator('#texture-shift-u')).toHaveValue('0');
    await expect(page.locator('#document-revision')).toHaveText('0');
  });

  test('Clip tool previews and commits a two-point split as one undoable edit', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Brush');

    await page.getByRole('button', { name: 'Clip' }).click();
    await expect(page.locator('#clip-tool-section')).toBeVisible();
    const first = await viewportPoint(page, 0, 0.5, 0.3);
    const second = await viewportPoint(page, 0, 0.5, 0.7);
    await page.mouse.click(first.x, first.y);
    await expect(page.locator('#clip-point-count')).toHaveText('1 / 3 points');
    await page.mouse.click(second.x, second.y);
    await expect(page.locator('#clip-point-count')).toHaveText('2 / 3 points');
    await expect(page.locator('#status-message')).toContainText('Clip preview ready');
    await expect(page.locator('#clip-point-positions')).toHaveText('1: 0 128 -16 · 2: 0 -128 -16');

    const partialMove = await topWorldPoint(page, 32, 112);
    const movedFirst = await topWorldPoint(page, 64, 96);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await page.mouse.move(partialMove.x, partialMove.y, { steps: 5 });
    await page.keyboard.down('Shift');
    await page.mouse.move(movedFirst.x, movedFirst.y, { steps: 5 });
    await expect(page.locator('#status-message')).toContainText('Clip point 1 preview · X locked');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#status-message')).toContainText('Moved clip point 1 · X locked');
    await expect(page.locator('#clip-point-count')).toHaveText('2 / 3 points');
    await expect(page.locator('#clip-point-positions')).toHaveText('1: 64 128 -16 · 2: 0 -128 -16');

    await page.getByRole('button', { name: 'Split' }).click();
    await expect(page.locator('#status-message')).toContainText('Split preview ready');
    await page.getByRole('button', { name: 'Apply clip' }).click();
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#brush-count')).toHaveText('4');
    await expect(page.locator('#status-message')).toContainText('Split brush');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
  });

  test('Clip tool applies one plane to an object selection set atomically', async ({ page }) => {
    await openEditor(page);
    const left = await topWorldPoint(page, -64, 0);
    const right = await topWorldPoint(page, 64, 0);
    await page.mouse.click(left.x, left.y);
    await page.keyboard.down('Control');
    await page.mouse.click(right.x, right.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');

    await page.getByRole('button', { name: 'Clip' }).click();
    await expect(page.locator('#clip-tool-section')).toBeVisible();
    const first = await topWorldPoint(page, -128, 0);
    const second = await topWorldPoint(page, 128, 0);
    await page.mouse.click(first.x, first.y);
    await page.mouse.click(second.x, second.y);
    await expect(page.locator('#clip-point-count')).toHaveText('2 / 3 points');
    await page.getByRole('button', { name: 'Split' }).click();
    await expect(page.locator('#status-message')).toContainText('Split preview ready');

    await page.getByRole('button', { name: 'Apply clip' }).click();
    await expect(page.locator('#brush-count')).toHaveText('5');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#status-message')).toContainText('Split brushes');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
  });

  test('resolves entity links and switches all four TrenchBroom visibility modes', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(entityLinkSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    await page.getByRole('tab', { name: 'Map', exact: true }).click();

    await expect(page.locator('#entity-link-count')).toHaveText('0 / 4 shown');
    await page.locator('#entity-link-mode').selectOption('all');
    await expect(page.locator('#entity-link-count')).toHaveText('4 / 4 shown');
    await expect(page.locator('#status-message')).toContainText('Entity links: All');
    await page.locator('#entity-link-mode').selectOption('none');
    await expect(page.locator('#entity-link-count')).toHaveText('0 / 4 shown');

    await page.locator('#entity-link-mode').selectOption('direct');
    const trigger = await topWorldPoint(page, -96, 0);
    await page.mouse.click(trigger.x, trigger.y);
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
    await expect(page.locator('#entity-link-count')).toHaveText('2 / 4 shown');
    await page.locator('#entity-link-mode').selectOption('transitive');
    await expect(page.locator('#entity-link-count')).toHaveText('4 / 4 shown');
    await expect(page.locator('#document-revision')).toHaveText('0');
  });

  test('Perspective clip-point dragging stays glued to the snapped brush surface', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Clip' }).click();
    const first = await perspectiveWorldPoint(page, [0, 0, 0]);
    const second = await topWorldPoint(page, 0, -128);
    await page.mouse.click(first.x, first.y);
    await page.mouse.click(second.x, second.y);
    await expect(page.locator('#clip-point-positions')).toHaveText('1: 0 0 0 · 2: 0 -128 -16');

    const target = await perspectivePoint(page, 0.4, 0.68);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(target.x, target.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('Clip point 1 preview');
    await expect(page.locator('#status-message')).not.toContainText('locked');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#status-message')).toContainText('Moved clip point 1');

    const movedPositions = await page.locator('#clip-point-positions').textContent();
    const movedPoint = movedPositions?.match(/^1: (-?\d+) (-?\d+) (-?\d+)/);
    expect(movedPoint).not.toBeNull();
    expect(Number(movedPoint?.[1])).not.toBe(0);
    expect(Number(movedPoint?.[2])).not.toBe(0);
    expect(Number(movedPoint?.[3])).toBe(-32);
  });

  test('Ctrl-click builds an object set for atomic movement, transforms, duplicate, and delete', async ({
    page,
  }) => {
    await openEditor(page);
    const left = await topWorldPoint(page, -64, 0);
    const right = await topWorldPoint(page, 64, 0);
    await page.mouse.click(left.x, left.y);
    await page.keyboard.down('Control');
    await page.mouse.click(right.x, right.y);
    await page.keyboard.up('Control');

    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -32 0 to 96 32 160');
    await page.locator('[data-nudge-axis="1"][data-nudge-direction="1"]').click();
    await expect(page.locator('#status-message')).toContainText('Move brushes');
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -16 0 to 96 48 160');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -32 0 to 96 32 160');

    await page.getByRole('button', { name: 'Rotate' }).click();
    await expect(page.locator('#transform-tool-title')).toHaveText('Rotate brushes');
    await page.locator('#rotate-angle').fill('90');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Rotate brushes');
    await expect(page.locator('#brush-bounds')).toHaveText('-32 -96 0 to 32 96 160');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -32 0 to 96 32 160');

    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.locator('#brush-count')).toHaveText('5');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#status-message')).toContainText('Duplicate brushes');
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('#brush-count')).toHaveText('3');
    await expect(page.locator('#selection-kind')).toHaveText('None');
    await expect(page.locator('#status-message')).toContainText('Delete brushes');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-count')).toHaveText('5');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
  });

  test('brush dragging uses XY, live Shift axis locking, and Alt vertical movement', async ({
    page,
  }) => {
    await installSiteToolRegistry(page);
    await openEditor(page);
    const inspection = await executeSiteTool(page, 'worldview_inspect_editor');
    const listed = await executeSiteTool(page, 'worldview_list_objects', {
      kind: 'brush',
      limit: 1,
    });
    const brush = (listed.objects as readonly { readonly id: string }[])[0]!;
    await executeSiteTool(page, 'worldview_select', {
      expectedDocumentId: inspection.documentId,
      expectedRevision: inspection.revision,
      mode: 'objects',
      brushIds: [brush.id],
      entityIds: [],
    });
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    const originalBounds = '-128 -128 -32 to 128 128 0';

    const start = await topWorldPoint(page, 0, 0);
    const partial = await topWorldPoint(page, 32, 16);
    const end = await topWorldPoint(page, 64, 32);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(partial.x, partial.y, { steps: 5 });
    await page.keyboard.down('Shift');
    await page.mouse.move(end.x, end.y, { steps: 5 });
    await expect(page.locator('#status-message')).toContainText('X locked');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#brush-bounds')).toHaveText('-64 -128 -32 to 192 128 0');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);

    const verticalStart = await perspectiveWorldPoint(page, [0, 0, -16]);
    const verticalEnd = await perspectiveWorldPoint(page, [0, 0, 48]);
    await page.mouse.move(verticalStart.x, verticalStart.y);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(verticalEnd.x, verticalEnd.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('vertical Z');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 32 to 128 128 64');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
  });

  test('Vertex and Edge tools expose and reshape handles across an object selection set', async ({
    page,
  }) => {
    await openEditor(page);
    const left = await topWorldPoint(page, -64, 0);
    const right = await topWorldPoint(page, 64, 0);
    await page.mouse.click(left.x, left.y);
    await page.keyboard.down('Control');
    await page.mouse.click(right.x, right.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');

    await page.getByRole('button', { name: 'Vertex' }).click();
    await expect(page.locator('#topology-tool-section')).toBeVisible();
    await expect(page.locator('#topology-tool-title')).toHaveText('Vertex editing');
    const vertexStart = await topWorldPoint(page, -96, -32);
    const vertexEnd = await topWorldPoint(page, -112, -48);
    await page.mouse.move(vertexStart.x, vertexStart.y);
    await page.mouse.down();
    await page.mouse.move(vertexEnd.x, vertexEnd.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Move vertices');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');
    await expect(page.locator('#brush-bounds')).toHaveText('-112 -48 0 to 96 32 160');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-96 -32 0 to 96 32 160');

    await page.getByRole('button', { name: 'Edge' }).click();
    await expect(page.locator('#topology-tool-section')).toBeVisible();
    await expect(page.locator('#topology-tool-title')).toHaveText('Edge editing');
  });

  test('exact rotate, scale, and shear controls each commit one reversible transform', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    const originalBounds = '-128 -128 -32 to 128 128 0';

    await page.getByRole('button', { name: 'Rotate' }).click();
    await expect(page.locator('#transform-tool-title')).toHaveText('Rotate brush');
    await page.locator('#rotate-angle').fill('45');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Rotate brush');
    await expect(page.locator('#brush-bounds')).not.toHaveText(originalBounds);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);

    await page.getByRole('button', { name: 'Scale' }).click();
    await page.locator('#scale-x').fill('0.5');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Scale brush');
    await expect(page.locator('#brush-bounds')).toHaveText('-64 -128 -32 to 64 128 0');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);

    await page.getByRole('button', { name: 'Shear' }).click();
    await page.locator('#shear-offset').fill('16');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Shear brush');
    await expect(page.locator('#brush-bounds')).not.toHaveText(originalBounds);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);
  });

  test('Rotate handle drag previews and commits a snapped viewport rotation', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Rotate' }).click();
    const start = await viewportPoint(page, 0, 0.82, 0.5);
    const end = await viewportPoint(page, 0, 0.5, 0.18);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('#status-message')).toContainText('Rotate brush');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  test('Perspective rotation rings choose a world axis instead of forcing Z', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Rotate' }).click();

    const radius = 256 * 0.62 + 10;
    const pivot = [0, 0, -16] as const;
    const startRadians = Math.PI / 4;
    const endRadians = startRadians + Math.PI / 6;
    const start = await perspectiveWorldPoint(page, [
      pivot[0],
      Math.cos(startRadians) * radius,
      pivot[2] + Math.sin(startRadians) * radius,
    ]);
    const end = await perspectiveWorldPoint(page, [
      pivot[0],
      Math.cos(endRadians) * radius,
      pivot[2] + Math.sin(endRadians) * radius,
    ]);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('#status-message')).toContainText('Rotate brush');
    const document = await readEditorDocument(page);
    const floor = brushesInDocument(document).find((brush) =>
      brush.faces.some((face) => face.material === 'DEV_FLOOR'),
    )!;
    const bounds = deriveBrush(floor).bounds!;
    expect(bounds.min[0]).toBeCloseTo(-128, 4);
    expect(bounds.max[0]).toBeCloseTo(128, 4);
    expect(bounds.min[2]).toBeLessThan(-80);
    expect(bounds.max[2]).toBeGreaterThan(45);
  });

  test('A manually entered rotate pivot also drives direct viewport gestures', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Rotate' }).click();
    await page.locator('#transform-pivot-x').fill('64');
    await page.locator('#transform-pivot-y').fill('0');
    await page.locator('#transform-pivot-z').fill('-16');

    const start = await topWorldPoint(page, 192, 0);
    const end = await topWorldPoint(page, 64, 128);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('#status-message')).toContainText('Rotate brush');
    await expect(page.locator('#brush-bounds')).toHaveText('-64 -192 -32 to 192 64 0');
  });

  test('The rotate center is a snapped, constrained, cancellable viewport handle', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Rotate' }).click();
    await expect(page.locator('#document-revision')).toHaveText('0');

    const initial = await topWorldPoint(page, 0, 0);
    const first = await topWorldPoint(page, 64, 32);
    await page.mouse.move(initial.x, initial.y);
    await expect(
      page.locator('.viewport-pane[data-viewport="xy"] .transform-readout'),
    ).toContainText('0  0  -16');
    await page.mouse.down();
    await page.mouse.move(first.x, first.y, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('#transform-pivot-x')).toHaveValue('64');
    await expect(page.locator('#transform-pivot-y')).toHaveValue('32');
    await expect(page.locator('#transform-pivot-z')).toHaveValue('-16');
    await expect(page.locator('#status-message')).toContainText('Rotate pivot moved');
    await expect(page.locator('#document-revision')).toHaveText('0');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

    const constrained = await topWorldPoint(page, 128, 96);
    await page.keyboard.down('Shift');
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await page.mouse.move(constrained.x, constrained.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#transform-pivot-x')).toHaveValue('128');
    await expect(page.locator('#transform-pivot-y')).toHaveValue('32');
    await expect(page.locator('#status-message')).toContainText('X locked');

    const constrainedPivot = await topWorldPoint(page, 128, 32);
    const cancelled = await topWorldPoint(page, 192, 96);
    await page.mouse.move(constrainedPivot.x, constrainedPivot.y);
    await page.mouse.down();
    await page.mouse.move(cancelled.x, cancelled.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('pivot preview');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('#transform-pivot-x')).toHaveValue('128');
    await expect(page.locator('#transform-pivot-y')).toHaveValue('32');
    await expect(page.locator('#status-message')).toContainText('pivot move cancelled');
    await expect(page.locator('#document-revision')).toHaveText('0');
  });

  test('Scale and shear handles commit live orthographic transforms', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    const originalBounds = '-128 -128 -32 to 128 128 0';

    await page.getByRole('button', { name: 'Scale' }).click();
    const scaleStart = await topWorldPoint(page, 128, 0);
    const scaleEnd = await topWorldPoint(page, 192, 0);
    await page.mouse.move(scaleStart.x, scaleStart.y);
    await page.mouse.down();
    await page.mouse.move(scaleEnd.x, scaleEnd.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Scale brush');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 192 128 0');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);

    await page.keyboard.down('Shift');
    await page.mouse.move(scaleStart.x, scaleStart.y);
    await page.mouse.down();
    await page.mouse.move(scaleEnd.x, scaleEnd.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#status-message')).toContainText('Scale brush');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -160 -32 to 192 160 0');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);

    await page.getByRole('button', { name: 'Shear' }).click();
    const shearStart = await viewportPoint(page, 0, 0.5, 0.5);
    const shearEnd = await viewportPoint(page, 0, 0.68, 0.5);
    await page.mouse.move(shearStart.x, shearStart.y);
    await page.mouse.down();
    await page.mouse.move(shearEnd.x, shearEnd.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Shear brush');
    await expect(page.locator('#brush-bounds')).not.toHaveText(originalBounds);
  });

  test('Perspective corner scaling keeps the opposite 3D corner anchored', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Scale' }).click();
    const anchor = await perspectiveWorldPoint(page, [-128, -128, -32]);
    const handle = await perspectiveWorldPoint(page, [128, 128, 0]);
    const end = {
      x: anchor.x + (handle.x - anchor.x) * 1.25,
      y: anchor.y + (handle.y - anchor.y) * 1.25,
    };

    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('#status-message')).toContainText('Scale brush');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 192 192 8');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
  });

  test('selected vertices survive tool changes and accept direct and exact transforms', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Vertex' }).click();

    const lassoStart = await topWorldPoint(page, -150, 150);
    const lassoEnd = await topWorldPoint(page, 150, 100);
    await page.mouse.move(lassoStart.x, lassoStart.y);
    await page.mouse.down();
    await page.mouse.move(lassoEnd.x, lassoEnd.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#topology-selection-count')).toHaveText('4');

    await page.getByRole('button', { name: 'Scale' }).click();
    await expect(page.locator('#transform-tool-title')).toHaveText('Scale selected vertices');
    await expect(page.locator('#topology-selection-count')).toHaveText('4');
    const scaleStart = await topWorldPoint(page, 128, 128);
    const scaleEnd = await topWorldPoint(page, 160, 128);
    await page.mouse.move(scaleStart.x, scaleStart.y);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(scaleEnd.x, scaleEnd.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(page.locator('#status-message')).toContainText('Scale components');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#brush-bounds')).toHaveText('-160 -128 -32 to 160 128 0');
    await expect(page.locator('#topology-selection-count')).toHaveText('4');

    await page.getByRole('button', { name: 'Vertex' }).click();
    await expect(page.locator('#topology-selection-count')).toHaveText('4');
    await page.getByRole('button', { name: 'Rotate' }).click();
    await expect(page.locator('#transform-tool-title')).toHaveText('Rotate selected vertices');
    await page.locator('#rotate-angle').fill('15');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Rotate components');
    await expect(page.locator('#document-revision')).toHaveText('2');
    await expect(page.locator('#brush-bounds')).not.toHaveText('-160 -128 -32 to 160 128 0');
    await page.getByRole('button', { name: 'Vertex' }).click();
    await expect(page.locator('#topology-selection-count')).toHaveText('4');
    await expect(page.locator('#geometry-state')).toHaveText('valid');

    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 128 0');
    await page.getByRole('button', { name: 'Edge' }).click();
    const edge = await topWorldPoint(page, 0, 128);
    await page.mouse.click(edge.x, edge.y);
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.getByRole('button', { name: 'Shear' }).click();
    await expect(page.locator('#transform-tool-title')).toHaveText('Shear selected edges');
    await page.locator('#shear-source-axis').selectOption('0');
    await page.locator('#shear-target-axis').selectOption('1');
    await page.locator('#shear-offset').fill('16');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Shear components');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await page.getByRole('button', { name: 'Edge' }).click();
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
  });

  test('Vertex and Edge handles reshape a brush through valid undoable hull edits', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    const originalBounds = '-128 -128 -32 to 128 128 0';

    await page.getByRole('button', { name: 'Vertex' }).click();
    await expect(page.locator('#topology-tool-title')).toHaveText('Vertex editing');
    const firstVertex = await topWorldPoint(page, 128, 128);
    const vertexStart = await topWorldPoint(page, -128, -128);
    const vertexEnd = await topWorldPoint(page, -96, -96);
    await page.mouse.click(firstVertex.x, firstVertex.y);
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.keyboard.down('Control');
    await page.mouse.click(vertexStart.x, vertexStart.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#topology-selection-count')).toHaveText('2');
    await page.mouse.move(vertexStart.x, vertexStart.y);
    await page.mouse.down();
    await page.mouse.move(vertexEnd.x, vertexEnd.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Move vertices');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-bounds')).not.toHaveText(originalBounds);
    await expect(page.locator('#brush-bounds')).toContainText('to 160 160');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText(originalBounds);

    await page.getByRole('button', { name: 'Edge' }).click();
    await expect(page.locator('#topology-tool-title')).toHaveText('Edge editing');
    const edgeStart = await topWorldPoint(page, 0, 128);
    const edgeEnd = await topWorldPoint(page, 32, 160);
    await page.mouse.move(edgeStart.x, edgeStart.y);
    await page.mouse.down();
    await page.mouse.move(edgeEnd.x, edgeEnd.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Move vertices');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-bounds')).not.toHaveText(originalBounds);
  });

  test('Vertex handles drag directly in the perspective authoring view', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    const originalBounds = '-128 -128 -32 to 128 128 0';
    await page.getByRole('button', { name: 'Vertex' }).click();
    const start = await perspectiveWorldPoint(page, [128, 128, 0]);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 48, start.y - 28, { steps: 12 });
    await expect(page.locator('#status-message')).toContainText('XY plane');
    await page.mouse.up();

    await expect(page.locator('#status-message')).toContainText('Move vertices');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-bounds')).not.toHaveText(originalBounds);
    await expect(page.locator('#brush-bounds')).toHaveText(/-32 to .* 0$/);
    await expect(page.locator('#document-revision')).toHaveText('1');

    await page.getByRole('button', { name: 'Undo' }).click();
    const verticalEnd = await perspectiveWorldPoint(page, [128, 128, 64]);
    await page.mouse.move(start.x, start.y);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(verticalEnd.x, verticalEnd.y, { steps: 12 });
    await expect(page.locator('#status-message')).toContainText('vertical Z');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 128 64');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
  });

  test('Vertex lassos toggle or add handles and deletion refuses collapsed hulls', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Vertex' }).click();

    const topLeft = await topWorldPoint(page, -150, 150);
    const topRight = await topWorldPoint(page, 150, 100);
    await page.mouse.move(topLeft.x, topLeft.y);
    await page.mouse.down();
    await page.mouse.move(topRight.x, topRight.y, { steps: 8 });
    await expect(page.locator('.handle-lasso')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('.handle-lasso')).toHaveCount(0);
    await expect(page.locator('#topology-selection-count')).toHaveText('4');

    const bottomLeft = await topWorldPoint(page, -150, -100);
    const bottomRight = await topWorldPoint(page, 150, -150);
    await page.keyboard.down('Control');
    await page.mouse.move(bottomLeft.x, bottomLeft.y);
    await page.mouse.down();
    await page.mouse.move(bottomRight.x, bottomRight.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    await expect(page.locator('#topology-selection-count')).toHaveText('8');

    await page.mouse.move(topLeft.x, topLeft.y);
    await page.mouse.down();
    await page.mouse.move(topRight.x, topRight.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#topology-selection-count')).toHaveText('4');

    const empty = await topWorldPoint(page, 0, 0);
    await page.mouse.click(empty.x, empty.y);
    await expect(page.locator('#topology-selection-count')).toHaveText('0');
    const corner = await topWorldPoint(page, 128, 128);
    await page.mouse.click(corner.x, corner.y);
    await page.keyboard.press('Delete');
    await expect(page.locator('#status-message')).toContainText('Delete vertices');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-faces')).not.toHaveText('6');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-faces')).toHaveText('6');

    const wholeStart = await topWorldPoint(page, -160, 160);
    const wholeEnd = await topWorldPoint(page, 160, -160);
    await page.mouse.move(wholeStart.x, wholeStart.y);
    await page.mouse.down();
    await page.mouse.move(wholeEnd.x, wholeEnd.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#topology-selection-count')).toHaveText('8');
    const revisionBeforeRejectedDelete = await page.locator('#document-revision').textContent();
    await page.keyboard.press('Delete');
    await expect(page.locator('#status-message')).toContainText('collapse');
    await expect(page.locator('#document-revision')).toHaveText(revisionBeforeRejectedDelete ?? '');
    await expect(page.locator('#geometry-state')).toHaveText('valid');

    await page.getByRole('button', { name: 'Edge' }).click();
    const topEdge = await topWorldPoint(page, 0, 128);
    await page.mouse.click(topEdge.x, topEdge.y);
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.keyboard.press('Delete');
    await expect(page.locator('#status-message')).toContainText('Delete vertices');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-faces')).not.toHaveText('6');
  });

  test('Ctrl switches vertex dragging from relative to absolute grid snapping', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.locator('#grid-size').selectOption('64');
    await page.getByRole('button', { name: 'Vertex' }).click();
    const start = await frontWorldPoint(page, 128, -32);
    const end = await frontWorldPoint(page, 148, -16);

    await page.mouse.move(start.x, start.y);
    await page.keyboard.down('Control');
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('absolute snap');
    await page.mouse.up();
    await page.keyboard.up('Control');

    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  test('Shift+Alt-click quick-snaps a selected vertex onto an existing corner', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Vertex' }).click();
    const source = await topWorldPoint(page, 128, 128);
    const target = await topWorldPoint(page, 128, -128);

    await page.mouse.click(source.x, source.y);
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.keyboard.down('Shift');
    await page.keyboard.down('Alt');
    await page.mouse.click(target.x, target.y);
    await page.keyboard.up('Alt');
    await page.keyboard.up('Shift');

    await expect(page.locator('#status-message')).toContainText('Snap vertices');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-faces')).not.toHaveText('6');
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-faces')).toHaveText('6');
  });

  test('Arrow keys nudge selected vertex and edge handles on the active viewport axes', async ({
    page,
  }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Vertex' }).click();
    const corner = await topWorldPoint(page, 128, 128);
    await page.mouse.click(corner.x, corner.y);

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#status-message')).toContainText('Nudge vertices');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 144 128 0');
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 144 144 0');
    await expect(page.locator('#document-revision')).toHaveText('2');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 128 0');

    await page.getByRole('button', { name: 'Edge' }).click();
    const edge = await topWorldPoint(page, 0, 128);
    await page.mouse.click(edge.x, edge.y);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#status-message')).toContainText('Nudge edges');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 144 0');
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await page.getByRole('button', { name: 'Undo' }).click();

    await page.getByRole('button', { name: 'Vertex' }).click();
    const frontCorner = await frontWorldPoint(page, 128, 0);
    await page.mouse.click(frontCorner.x, frontCorner.y);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#brush-bounds')).toHaveText('-128 -128 -32 to 128 128 16');
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
  });

  test('Escape clears topology handles before leaving the component tool', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Vertex' }).click();
    const corner = await topWorldPoint(page, 128, 128);
    await page.mouse.click(corner.x, corner.y);
    await expect(page.locator('#topology-selection-count')).toHaveText('1');

    await page.keyboard.press('Escape');
    await expect(page.locator('#topology-selection-count')).toHaveText('0');
    await expect(page.getByRole('button', { name: 'Vertex', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#status-message')).toContainText('Press Escape again');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#selection-kind')).toHaveText('Brush');
    await page.keyboard.press('Escape');
    await expect(page.locator('#selection-kind')).toHaveText('None');
  });

  test('Shift-drag adds a snapped surface vertex and splits the convex hull', async ({ page }) => {
    await openEditor(page);
    const brushPoint = await perspectivePoint(page, 0.5, 0.58);
    await page.mouse.click(brushPoint.x, brushPoint.y);
    await page.getByRole('button', { name: 'Vertex' }).click();
    const start = await topWorldPoint(page, 128, 0);
    const end = await topWorldPoint(page, 160, 0);

    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await expect(page.locator('#status-message')).toContainText('Vertex insertion preview');
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect(page.locator('#status-message')).toContainText('Add vertex');
    await expect(page.locator('#document-revision')).toHaveText('1');
    await expect(page.locator('#geometry-state')).toHaveText('valid');
    await expect(page.locator('#brush-faces')).not.toHaveText('6');
    await expect(page.locator('#topology-selection-count')).toHaveText('1');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#brush-faces')).toHaveText('6');
  });
});
