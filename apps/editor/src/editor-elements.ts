import type {
  EditorViewportCanvases,
  EditorViewportKind,
  EditorViewportOverlayElements,
  EditorViewportOverlays,
} from '@jackharrhy/worldview-editor';

export function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing editor element: ${selector}`);
  return element;
}

function bindViewportOverlay(kind: EditorViewportKind): EditorViewportOverlayElements {
  const container = required<HTMLElement>(`[data-viewport="${kind}"]`);
  const handleLasso = container.querySelector<HTMLDivElement>('[data-viewport-overlay="lasso"]');
  const transformReadout = container.querySelector<HTMLDivElement>(
    '[data-viewport-overlay="transform-readout"]',
  );
  if (!handleLasso || !transformReadout) {
    throw new Error(`Missing runtime overlays for ${kind} viewport`);
  }
  return { container, handleLasso, transformReadout };
}

export function bindEditorElements() {
  const viewFilterToggle = required<HTMLButtonElement>('[data-action="toggle-view-filters"]');
  const compiledCanvas = required<HTMLCanvasElement>('.compiled-canvas');
  const uvEditorSvg = required<SVGSVGElement>('#uv-editor');
  const wadFiles = required<HTMLInputElement>('#wad-files');
  const paletteFile = required<HTMLInputElement>('#palette-file');
  const mapFile = required<HTMLInputElement>('#map-file');
  const referenceFiles = required<HTMLInputElement>('#reference-files');
  const viewportGrid = required<HTMLElement>('.viewport-grid');
  const workspace = required<HTMLElement>('.workspace');
  const workspaceResizeHandles = [...document.querySelectorAll<HTMLElement>('[data-resize]')];
  const canvases: EditorViewportCanvases = {
    xy: required<HTMLCanvasElement>('[data-viewport="xy"] .source-canvas'),
    xz: required<HTMLCanvasElement>('[data-viewport="xz"] .source-canvas'),
    yz: required<HTMLCanvasElement>('[data-viewport="yz"] .source-canvas'),
    perspective: required<HTMLCanvasElement>('[data-viewport="perspective"] .source-canvas'),
  };
  const viewportOverlays: EditorViewportOverlays = {
    perspective: bindViewportOverlay('perspective'),
    xy: bindViewportOverlay('xy'),
    xz: bindViewportOverlay('xz'),
    yz: bindViewportOverlay('yz'),
  };

  return {
    viewFilterToggle,
    compiledCanvas,
    uvEditorSvg,
    wadFiles,
    paletteFile,
    mapFile,
    referenceFiles,
    viewportGrid,
    workspace,
    workspaceResizeHandles,
    canvases,
    viewportOverlays,
  };
}

export type EditorElements = ReturnType<typeof bindEditorElements>;
