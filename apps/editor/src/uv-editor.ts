import {
  textureCoordinates,
  type EditorMaterial,
  type FaceSelection,
  type FaceTextureTransformDelta,
  type MapFace,
  type Vec2,
  type Vec3,
} from '@jackharrhy/worldview-editor';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 220;

type UvControl = 'pan' | 'rotate' | 'scale-u' | 'scale-v' | 'pivot';
type UvGesturePhase = 'preview' | 'commit' | 'cancel';

export interface UvEditorFaceState {
  readonly selection: FaceSelection;
  readonly face: MapFace;
  readonly vertices: readonly Vec3[];
  readonly selectedFaceCount: number;
  readonly material?: EditorMaterial | null;
}

export interface UvEditorTransformEvent {
  readonly phase: UvGesturePhase;
  readonly transform: FaceTextureTransformDelta;
  readonly selection: FaceSelection;
  readonly pivot: Vec3;
}

export interface TextureUvEditorOptions {
  readonly svg: SVGSVGElement;
  readonly status: HTMLElement;
  readonly resetPivotButton: HTMLButtonElement;
  readonly signal: AbortSignal;
  readonly onTransform: (event: UvEditorTransformEvent) => void;
  readonly onStatus: (message: string) => void;
}

interface UvView {
  readonly center: Vec2;
  readonly pixelsPerTexel: number;
}

interface UvGesture {
  readonly pointerId: number;
  readonly control: UvControl;
  readonly state: UvEditorFaceState;
  readonly pivot: Vec3;
  readonly view: UvView;
  readonly startUv: Vec2;
  readonly pivotScreen: Vec2;
  readonly startAngle: number;
  previewActive: boolean;
  lastTransform: FaceTextureTransformDelta;
}

const identityTransform = (): FaceTextureTransformDelta => ({
  offset: [0, 0],
  rotationDegrees: 0,
  scale: [1, 1],
});

function faceKey(state: UvEditorFaceState): string {
  return `${state.selection.brushId}\u0000${state.selection.faceId}`;
}

function faceCenter(vertices: readonly Vec3[]): Vec3 {
  const sum = vertices.reduce<Vec3>(
    (value, point) => [value[0] + point[0], value[1] + point[1], value[2] + point[2]],
    [0, 0, 0],
  );
  return [sum[0] / vertices.length, sum[1] / vertices.length, sum[2] / vertices.length];
}

function rawSvgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Readonly<Record<string, string | number>> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function transformChanged(transform: FaceTextureTransformDelta): boolean {
  return (
    transform.offset.some((value) => Math.abs(value) > Number.EPSILON) ||
    Math.abs(transform.rotationDegrees) > Number.EPSILON ||
    transform.scale.some((value) => Math.abs(value - 1) > Number.EPSILON)
  );
}

export class TextureUvEditor {
  private readonly svg: SVGSVGElement;
  private readonly status: HTMLElement;
  private readonly resetPivotButton: HTMLButtonElement;
  private readonly onTransform: (event: UvEditorTransformEvent) => void;
  private readonly onStatus: (message: string) => void;
  private readonly materialUrls = new WeakMap<EditorMaterial, string>();
  private state: UvEditorFaceState | null = null;
  private pivot: Vec3 | null = null;
  private selectionKey: string | null = null;
  private gesture: UvGesture | null = null;

  public constructor(options: TextureUvEditorOptions) {
    this.svg = options.svg;
    this.status = options.status;
    this.resetPivotButton = options.resetPivotButton;
    this.onTransform = options.onTransform;
    this.onStatus = options.onStatus;
    this.svg.addEventListener('pointerdown', (event) => this.pointerDown(event), {
      signal: options.signal,
    });
    this.svg.addEventListener('pointermove', (event) => this.pointerMove(event), {
      signal: options.signal,
    });
    this.svg.addEventListener('pointerup', (event) => this.pointerUp(event), {
      signal: options.signal,
    });
    this.svg.addEventListener('pointercancel', () => this.cancel(), { signal: options.signal });
    this.resetPivotButton.addEventListener(
      'click',
      () => {
        if (!this.state) return;
        this.pivot = faceCenter(this.state.vertices);
        this.render();
        this.onStatus('UV transform origin reset to the face center.');
      },
      { signal: options.signal },
    );
    this.render();
  }

  public setFace(state: UvEditorFaceState | null): void {
    const nextKey = state ? faceKey(state) : null;
    if (nextKey !== this.selectionKey) {
      this.pivot = state && state.vertices.length > 0 ? faceCenter(state.vertices) : null;
      this.selectionKey = nextKey;
    }
    this.state = state;
    this.resetPivotButton.disabled = !state;
    this.render();
  }

  public cancel(): boolean {
    const gesture = this.gesture;
    if (!gesture) return false;
    this.gesture = null;
    if (this.svg.hasPointerCapture(gesture.pointerId)) {
      this.svg.releasePointerCapture(gesture.pointerId);
    }
    if (gesture.control === 'pivot') this.pivot = gesture.pivot;
    if (gesture.control !== 'pivot' && gesture.previewActive) {
      this.onTransform({
        phase: 'cancel',
        transform: gesture.lastTransform,
        selection: gesture.state.selection,
        pivot: gesture.pivot,
      });
    }
    this.render();
    return true;
  }

  private textureSize(state: UvEditorFaceState): Vec2 {
    return state.material ? [state.material.width, state.material.height] : [64, 64];
  }

  private computeView(state: UvEditorFaceState, pivot: Vec3): UvView {
    const coordinates = state.vertices.map((point) => textureCoordinates(state.face, point));
    coordinates.push(textureCoordinates(state.face, pivot));
    const textureSize = this.textureSize(state);
    const minimum: [number, number] = [
      Math.min(...coordinates.map((point) => point[0])),
      Math.min(...coordinates.map((point) => point[1])),
    ];
    const maximum: [number, number] = [
      Math.max(...coordinates.map((point) => point[0])),
      Math.max(...coordinates.map((point) => point[1])),
    ];
    const width = Math.max(maximum[0] - minimum[0], textureSize[0] * 1.35, 16);
    const height = Math.max(maximum[1] - minimum[1], textureSize[1] * 1.35, 16);
    return {
      center: [(minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2],
      pixelsPerTexel: clamp(
        Math.min((VIEW_WIDTH - 32) / width, (VIEW_HEIGHT - 32) / height),
        0.02,
        8,
      ),
    };
  }

  private uvToScreen(point: Vec2, view: UvView): Vec2 {
    return [
      VIEW_WIDTH / 2 + (point[0] - view.center[0]) * view.pixelsPerTexel,
      VIEW_HEIGHT / 2 - (point[1] - view.center[1]) * view.pixelsPerTexel,
    ];
  }

  private screenToUv(point: Vec2, view: UvView): Vec2 {
    return [
      view.center[0] + (point[0] - VIEW_WIDTH / 2) / view.pixelsPerTexel,
      view.center[1] - (point[1] - VIEW_HEIGHT / 2) / view.pixelsPerTexel,
    ];
  }

  private pointerScreen(event: PointerEvent): Vec2 {
    const bounds = this.svg.getBoundingClientRect();
    return [
      ((event.clientX - bounds.left) / bounds.width) * VIEW_WIDTH,
      ((event.clientY - bounds.top) / bounds.height) * VIEW_HEIGHT,
    ];
  }

  private uvToWorld(state: UvEditorFaceState, target: Vec2): Vec3 {
    const origin = state.vertices[0]!;
    const originUv = textureCoordinates(state.face, origin);
    for (let first = 1; first < state.vertices.length; first += 1) {
      for (let second = first + 1; second < state.vertices.length; second += 1) {
        const firstPoint = state.vertices[first]!;
        const secondPoint = state.vertices[second]!;
        const firstUv = textureCoordinates(state.face, firstPoint);
        const secondUv = textureCoordinates(state.face, secondPoint);
        const firstDelta: Vec2 = [firstUv[0] - originUv[0], firstUv[1] - originUv[1]];
        const secondDelta: Vec2 = [secondUv[0] - originUv[0], secondUv[1] - originUv[1]];
        const determinant = firstDelta[0] * secondDelta[1] - firstDelta[1] * secondDelta[0];
        if (Math.abs(determinant) <= 1e-8) continue;
        const targetDelta: Vec2 = [target[0] - originUv[0], target[1] - originUv[1]];
        const firstAmount =
          (targetDelta[0] * secondDelta[1] - targetDelta[1] * secondDelta[0]) / determinant;
        const secondAmount =
          (firstDelta[0] * targetDelta[1] - firstDelta[1] * targetDelta[0]) / determinant;
        return [
          origin[0] +
            (firstPoint[0] - origin[0]) * firstAmount +
            (secondPoint[0] - origin[0]) * secondAmount,
          origin[1] +
            (firstPoint[1] - origin[1]) * firstAmount +
            (secondPoint[1] - origin[1]) * secondAmount,
          origin[2] +
            (firstPoint[2] - origin[2]) * firstAmount +
            (secondPoint[2] - origin[2]) * secondAmount,
        ];
      }
    }
    return faceCenter(state.vertices);
  }

  private snappedPivot(state: UvEditorFaceState, screen: Vec2, view: UvView): Vec3 {
    const candidates = [faceCenter(state.vertices), ...state.vertices];
    const nearest = candidates
      .map((point) => {
        const projected = this.uvToScreen(textureCoordinates(state.face, point), view);
        return { point, distance: Math.hypot(projected[0] - screen[0], projected[1] - screen[1]) };
      })
      .toSorted((left, right) => left.distance - right.distance)[0];
    return nearest && nearest.distance <= 9
      ? nearest.point
      : this.uvToWorld(state, this.screenToUv(screen, view));
  }

  private snappedPanOffset(state: UvEditorFaceState, offset: Vec2, view: UvView): Vec2 {
    const textureSize = this.textureSize(state);
    const snapped: [number, number] = [Math.round(offset[0]), Math.round(offset[1])];
    for (const axis of [0, 1] as const) {
      let bestCorrection = Number.POSITIVE_INFINITY;
      for (const vertex of state.vertices) {
        const coordinate = textureCoordinates(state.face, vertex)[axis] + snapped[axis];
        const correction =
          Math.round(coordinate / textureSize[axis]) * textureSize[axis] - coordinate;
        if (
          Math.abs(correction * view.pixelsPerTexel) <= 6 &&
          Math.abs(correction) < Math.abs(bestCorrection)
        ) {
          bestCorrection = correction;
        }
      }
      if (Number.isFinite(bestCorrection)) snapped[axis] += bestCorrection;
    }
    return snapped;
  }

  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.state || !this.pivot || this.state.vertices.length < 3) return;
    const target = (event.target as Element | null)?.closest<SVGElement>('[data-uv-control]');
    const control = (target?.dataset.uvControl ?? 'pan') as UvControl;
    const view = this.computeView(this.state, this.pivot);
    const screen = this.pointerScreen(event);
    const pivotScreen = this.uvToScreen(textureCoordinates(this.state.face, this.pivot), view);
    this.gesture = {
      pointerId: event.pointerId,
      control,
      state: this.state,
      pivot: this.pivot,
      view,
      startUv: this.screenToUv(screen, view),
      pivotScreen,
      startAngle: Math.atan2(screen[1] - pivotScreen[1], screen[0] - pivotScreen[0]),
      previewActive: false,
      lastTransform: identityTransform(),
    };
    this.svg.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  private pointerMove(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const screen = this.pointerScreen(event);
    if (gesture.control === 'pivot') {
      this.pivot = this.snappedPivot(gesture.state, screen, gesture.view);
      this.status.textContent = 'Origin · snaps to face center and vertices';
      this.render();
      return;
    }
    const currentUv = this.screenToUv(screen, gesture.view);
    let transform = identityTransform();
    if (gesture.control === 'pan') {
      transform = {
        ...transform,
        offset: this.snappedPanOffset(
          gesture.state,
          [gesture.startUv[0] - currentUv[0], gesture.startUv[1] - currentUv[1]],
          gesture.view,
        ),
      };
    } else if (gesture.control === 'rotate') {
      const currentAngle = Math.atan2(
        screen[1] - gesture.pivotScreen[1],
        screen[0] - gesture.pivotScreen[0],
      );
      const degrees = ((gesture.startAngle - currentAngle) * 180) / Math.PI;
      const snap = event.shiftKey ? 1 : 15;
      transform = { ...transform, rotationDegrees: Math.round(degrees / snap) * snap };
    } else {
      const ratio =
        gesture.control === 'scale-u'
          ? clamp((screen[0] - gesture.pivotScreen[0]) / 52, 0.05, 20)
          : clamp((gesture.pivotScreen[1] - screen[1]) / 52, 0.05, 20);
      const factor = 1 / ratio;
      transform = {
        ...transform,
        scale:
          gesture.control === 'scale-u'
            ? [factor, event.shiftKey ? factor : 1]
            : [event.shiftKey ? factor : 1, factor],
      };
    }
    const previousTransform = gesture.lastTransform;
    gesture.lastTransform = transform;
    this.status.textContent =
      gesture.control === 'pan'
        ? `Pan ${transform.offset[0].toFixed(0)} ${transform.offset[1].toFixed(0)} texels`
        : gesture.control === 'rotate'
          ? `Rotate ${transform.rotationDegrees.toFixed(0)}°${event.shiftKey ? ' · fine' : ' · 15° snap'}`
          : `Scale ${transform.scale[0].toFixed(3)} ${transform.scale[1].toFixed(3)}${event.shiftKey ? ' · uniform' : ''}`;
    if (transformChanged(transform)) {
      gesture.previewActive = true;
      this.onTransform({
        phase: 'preview',
        transform,
        selection: gesture.state.selection,
        pivot: gesture.pivot,
      });
    } else if (gesture.previewActive) {
      gesture.previewActive = false;
      this.onTransform({
        phase: 'cancel',
        transform: previousTransform,
        selection: gesture.state.selection,
        pivot: gesture.pivot,
      });
    }
  }

  private pointerUp(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.gesture = null;
    if (this.svg.hasPointerCapture(event.pointerId))
      this.svg.releasePointerCapture(event.pointerId);
    if (gesture.control === 'pivot') {
      this.onStatus('UV transform origin moved.');
      this.render();
      return;
    }
    if (transformChanged(gesture.lastTransform)) {
      this.onTransform({
        phase: 'commit',
        transform: gesture.lastTransform,
        selection: gesture.state.selection,
        pivot: gesture.pivot,
      });
    } else {
      this.render();
    }
  }

  private materialUrl(material: EditorMaterial): string {
    const cached = this.materialUrls.get(material);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = material.width;
    canvas.height = material.height;
    const context = canvas.getContext('2d');
    context?.putImageData(
      new ImageData(new Uint8ClampedArray(material.rgba), material.width, material.height),
      0,
      0,
    );
    const url = canvas.toDataURL();
    this.materialUrls.set(material, url);
    return url;
  }

  private render(): void {
    this.svg.replaceChildren();
    const state = this.state;
    const pivot = this.pivot;
    if (!state || !pivot || state.vertices.length < 3) {
      this.svg.classList.add('empty');
      const text = rawSvgElement('text', { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 });
      text.textContent = 'SELECT A BRUSH FACE';
      this.svg.append(text);
      this.status.textContent = 'No editable UV projection';
      return;
    }
    this.svg.classList.remove('empty');
    const view = this.gesture?.view ?? this.computeView(state, pivot);
    const textureSize = this.textureSize(state);
    const viewMinimum: Vec2 = [
      view.center[0] - VIEW_WIDTH / 2 / view.pixelsPerTexel,
      view.center[1] - VIEW_HEIGHT / 2 / view.pixelsPerTexel,
    ];
    const viewMaximum: Vec2 = [
      view.center[0] + VIEW_WIDTH / 2 / view.pixelsPerTexel,
      view.center[1] + VIEW_HEIGHT / 2 / view.pixelsPerTexel,
    ];
    const defs = rawSvgElement('defs');
    const patternWidth = Math.max(1, textureSize[0] * view.pixelsPerTexel);
    const patternHeight = Math.max(1, textureSize[1] * view.pixelsPerTexel);
    const textureOrigin = this.uvToScreen([0, 0], view);
    const pattern = rawSvgElement('pattern', {
      id: 'uv-material-pattern',
      patternUnits: 'userSpaceOnUse',
      x: textureOrigin[0],
      y: textureOrigin[1] - patternHeight,
      width: patternWidth,
      height: patternHeight,
    });
    pattern.append(
      rawSvgElement('rect', {
        width: patternWidth,
        height: patternHeight,
        fill: 'var(--uv-grid)',
      }),
    );
    if (state.material && patternWidth >= 3 && patternHeight >= 3) {
      const image = rawSvgElement('image', {
        href: this.materialUrl(state.material),
        width: patternWidth,
        height: patternHeight,
        preserveAspectRatio: 'none',
        opacity: 0.72,
      });
      pattern.append(image);
    } else {
      pattern.append(
        rawSvgElement('path', {
          d: `M 0 0 H ${patternWidth} V ${patternHeight} H 0 Z M 0 0 L ${patternWidth} ${patternHeight} M ${patternWidth} 0 L 0 ${patternHeight}`,
          stroke: 'var(--uv-grid-major)',
          'stroke-width': 1,
        }),
      );
    }
    defs.append(pattern);
    this.svg.append(defs);
    const background = rawSvgElement('rect', {
      class: 'uv-background',
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      'data-uv-control': 'pan',
    });
    this.svg.append(background);

    const grid = rawSvgElement('g', { class: 'uv-grid', 'pointer-events': 'none' });
    for (const axis of [0, 1] as const) {
      const size = textureSize[axis];
      const count = Math.ceil((viewMaximum[axis] - viewMinimum[axis]) / size);
      const stride = Math.max(1, Math.ceil(count / 72));
      const start = Math.floor(viewMinimum[axis] / size / stride) * stride;
      const end = Math.ceil(viewMaximum[axis] / size / stride) * stride;
      for (let index = start; index <= end; index += stride) {
        const coordinate = index * size;
        const screen = this.uvToScreen(
          axis === 0 ? [coordinate, view.center[1]] : [view.center[0], coordinate],
          view,
        );
        grid.append(
          rawSvgElement(
            'line',
            axis === 0
              ? { x1: screen[0], y1: 0, x2: screen[0], y2: VIEW_HEIGHT }
              : { x1: 0, y1: screen[1], x2: VIEW_WIDTH, y2: screen[1] },
          ),
        );
      }
    }
    this.svg.append(grid);

    const facePoints = state.vertices
      .map((point) => this.uvToScreen(textureCoordinates(state.face, point), view).join(','))
      .join(' ');
    this.svg.append(
      rawSvgElement('polygon', {
        class: 'uv-face',
        points: facePoints,
        fill: 'url(#uv-material-pattern)',
        'data-uv-control': 'pan',
      }),
    );
    const vertices = rawSvgElement('g', { class: 'uv-vertices', 'pointer-events': 'none' });
    for (const point of state.vertices) {
      const screen = this.uvToScreen(textureCoordinates(state.face, point), view);
      vertices.append(rawSvgElement('circle', { cx: screen[0], cy: screen[1], r: 3 }));
    }
    this.svg.append(vertices);

    const pivotScreen = this.uvToScreen(textureCoordinates(state.face, pivot), view);
    this.svg.append(
      rawSvgElement('circle', {
        class: 'uv-rotation-ring',
        cx: pivotScreen[0],
        cy: pivotScreen[1],
        r: 72,
        'data-uv-control': 'rotate',
      }),
      rawSvgElement('line', {
        class: 'uv-axis uv-axis-u',
        x1: pivotScreen[0],
        y1: pivotScreen[1],
        x2: pivotScreen[0] + 52,
        y2: pivotScreen[1],
        'pointer-events': 'none',
      }),
      rawSvgElement('line', {
        class: 'uv-axis uv-axis-v',
        x1: pivotScreen[0],
        y1: pivotScreen[1],
        x2: pivotScreen[0],
        y2: pivotScreen[1] - 52,
        'pointer-events': 'none',
      }),
      rawSvgElement('rect', {
        class: 'uv-scale-handle uv-scale-u',
        x: pivotScreen[0] + 47,
        y: pivotScreen[1] - 5,
        width: 10,
        height: 10,
        rx: 1,
        'data-uv-control': 'scale-u',
      }),
      rawSvgElement('rect', {
        class: 'uv-scale-handle uv-scale-v',
        x: pivotScreen[0] - 5,
        y: pivotScreen[1] - 57,
        width: 10,
        height: 10,
        rx: 1,
        'data-uv-control': 'scale-v',
      }),
      rawSvgElement('circle', {
        class: 'uv-pivot',
        cx: pivotScreen[0],
        cy: pivotScreen[1],
        r: 7,
        'data-uv-control': 'pivot',
      }),
      rawSvgElement('circle', {
        class: 'uv-pivot-center',
        cx: pivotScreen[0],
        cy: pivotScreen[1],
        r: 2,
        'pointer-events': 'none',
      }),
    );
    if (!this.gesture) {
      this.status.textContent = `${state.face.material} · ${textureSize[0]}×${textureSize[1]} · ${state.selectedFaceCount} ${state.selectedFaceCount === 1 ? 'face' : 'faces'}`;
    }
  }
}
