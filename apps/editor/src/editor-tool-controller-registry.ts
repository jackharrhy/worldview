import {
  selectedFaceReferences,
  type EditorSourceRenderer,
  type EditorTool,
  type EditorViewportKind,
  type MapDocument,
  type Vec3,
} from '@jackharrhy/worldview-editor';

import type { EditorShellState } from './editor-shell-state.js';
import type { EditorStatePort } from './editor-state-port.js';

type ToolControllerState = EditorStatePort<
  | 'activeTool'
  | 'activeGridSize'
  | 'lastPointerPosition'
  | 'session'
  | 'simpleShapeOptions'
  | 'sweepCandidate'
  | 'sweepDefaultTransform'
  | 'sweepDragBase'
  | 'sweepEscapeReset'
  | 'sweepTransform'
  | 'transformPivot'
  | 'transformPivotSelectionKey'
  | 'topologySelectedVertices',
  | 'activeTool'
  | 'sweepCandidate'
  | 'sweepDefaultTransform'
  | 'sweepDragBase'
  | 'sweepEscapeReset'
  | 'sweepTransform'
  | 'transformPivot'
  | 'transformPivotSelectionKey'
> & {
  readonly renderer: Pick<
    EditorSourceRenderer,
    | 'setDocument'
    | 'setSweepCaps'
    | 'setTransformPivot'
    | 'setTool'
    | 'commitHullBrush'
    | 'removeLastClipPoint'
    | 'clearHullPoints'
  > | null;
};

type ToolControllerUi = Pick<
  EditorShellState,
  'editorCommands' | 'pointEntityTool' | 'pointerContext' | 'statusMessage'
>;

interface ToolGeometryCommands {
  applyClip(): void;
  applySweep(): void;
  clearActiveHandleSelection(): boolean;
  cloneSweepTransform(
    transform: ToolControllerState['sweepTransform'],
  ): ToolControllerState['sweepTransform'];
  initialSweepTransform(): ToolControllerState['sweepTransform'];
  deleteTopologySelection(): void;
  refreshSweepPreview(announce?: boolean): void;
  resetSweep(markEscapeReset?: boolean): void;
  simpleShapeLabel(kind: ToolControllerState['simpleShapeOptions']['kind']): string;
  updateSimpleShapeFields(): void;
  syncSweepControls(): void;
}

interface ToolTransformQueries {
  commitFaceNudge(delta: Vec3, viewport: EditorViewportKind): boolean;
  commitTopologyNudge(delta: Vec3, viewport: EditorViewportKind): boolean;
  isTopologyTool(tool: EditorTool): tool is 'vertex' | 'edge';
  isTransformTool(tool: EditorTool): tool is 'rotate' | 'scale' | 'shear';
  viewportKeyboardNudge(
    key: string,
    viewport: EditorViewportKind,
    verticalPerspective: boolean,
  ): Vec3 | null;
}

interface ToolInspectorCommands {
  updateInspector(
    document?: MapDocument,
    selection?: ToolControllerState['session']['selection'],
  ): void;
}

interface ToolDescriptorContext {
  readonly shapeLabel: string;
  readonly entityClassname: string;
  readonly hasSelectedFaces: boolean;
}

interface ToolController {
  readonly pointerLabel: string;
  readonly status: (context: ToolDescriptorContext) => string;
}

const TOOL_CONTROLLERS: Readonly<Record<EditorTool, ToolController>> = {
  select: {
    pointerLabel: 'PERSPECTIVE',
    status: () =>
      'Default tool active. With nothing selected, drag in any viewport to draw the configured simple shape; click objects to select them. Drag selected objects on XY in 3D; Alt moves vertically and Shift locks an axis. Shift-drag a selected brush face to resize it; add Ctrl/Command to split, Alt to move the face freely, or both to stamp. Ctrl/Command-drag duplicates selected brushes or paint-selects unselected ones. Ctrl/Command-wheel drills through overlapping objects in any view; add Shift to drill through faces. Shift-click selects a face.',
  },
  create: {
    pointerLabel: 'CREATE',
    status: ({ shapeLabel }) =>
      `Simple Shape tool active. Drag in any viewport to draw a ${shapeLabel}; use the Object inspector for shape options.`,
  },
  entity: {
    pointerLabel: 'ENTITY',
    status: ({ entityClassname }) =>
      `Entity tool active. Click a surface or 2D viewport to place ${entityClassname || 'a point entity'}.`,
  },
  hull: {
    pointerLabel: 'HULL',
    status: () =>
      'Hull tool active in perspective. Place points on reference faces; Enter creates their convex hull and Escape discards the point set.',
  },
  face: {
    pointerLabel: 'FACE',
    status: () =>
      'Face tool active. Drag a center handle to extrude, Alt-drag it on the viewport plane, or use Arrow keys on the pointed viewport. Ctrl/Command-drag splits and Ctrl/Command+Alt-drag stamps. Escape clears handles before leaving.',
  },
  sweep: {
    pointerLabel: 'SWEEP',
    status: ({ hasSelectedFaces }) =>
      hasSelectedFaces
        ? 'Sweep tool active. Move, rotate, or scale the green destination cap in 3D; tune its path in the inspector and press Enter to generate the gap.'
        : 'Sweep tool needs one or more selected brush faces. Select faces with the Face tool or Shift-click in Select, then activate Sweep again.',
  },
  clip: {
    pointerLabel: 'CLIP',
    status: () =>
      'Clip tool active. Click two or three points, drag to place two, or drag an orange point to move it. Shift locks moved points to one axis in 2D; double-click matches a face plane.',
  },
  vertex: {
    pointerLabel: 'VERTEX',
    status: () =>
      'Vertex tool active. Shift+Alt-click a target vertex to snap; Arrow keys nudge on the pointed viewport. Ctrl/Command adds corners or toggles absolute drag snapping. Escape clears handles before leaving.',
  },
  edge: {
    pointerLabel: 'EDGE',
    status: () =>
      'Edge tool active. Ctrl/Command selects multiple edge centers; Arrow keys nudge them on the pointed viewport. Escape clears handles before leaving.',
  },
  rotate: {
    pointerLabel: 'ROTATE',
    status: () =>
      'Rotate tool active. Drag around the pivot; angles snap to 15°, or hold Shift for 5°. Selected vertex or edge handles take priority over brushes.',
  },
  scale: {
    pointerLabel: 'SCALE',
    status: () =>
      'Scale tool active. Drag a side, edge, or corner handle. The opposite handle stays fixed; hold Alt to anchor at center or Shift for proportional axes. Selected vertex or edge handles take priority over brushes.',
  },
  shear: {
    pointerLabel: 'SHEAR',
    status: () =>
      'Shear tool active. Drag horizontally to offset the viewport plane by snapped grid units. Selected vertex or edge handles take priority over brushes.',
  },
};

/** Singular owner of editor-tool activation, cleanup, and user-facing mode presentation. */
export class EditorToolControllerRegistry {
  public constructor(
    private readonly state: ToolControllerState,
    private readonly ui: ToolControllerUi,
    private readonly geometry: ToolGeometryCommands,
    private readonly transform: ToolTransformQueries,
    private readonly inspector: ToolInspectorCommands,
  ) {}

  public activate(tool: EditorTool): void {
    const previousTool = this.state.activeTool;
    if (previousTool === 'sweep' && tool !== 'sweep') {
      this.state.sweepCandidate = null;
      this.state.sweepDragBase = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.state.renderer?.setSweepCaps([]);
    }
    if (
      (tool === 'clip' ||
        this.transform.isTransformTool(tool) ||
        this.transform.isTopologyTool(tool)) &&
      this.state.session.selection?.faceId
    ) {
      this.state.session.select({ brushId: this.state.session.selection.brushId });
    }
    if (this.transform.isTransformTool(tool) && tool !== previousTool) {
      this.state.transformPivot = null;
      this.state.transformPivotSelectionKey = null;
      this.state.renderer?.setTransformPivot(null);
    }
    this.state.activeTool = tool;
    this.state.renderer?.setTool(tool);
    if (tool === 'sweep' && previousTool !== 'sweep') {
      this.state.sweepDefaultTransform = this.geometry.initialSweepTransform();
      this.state.sweepTransform = this.geometry.cloneSweepTransform(
        this.state.sweepDefaultTransform,
      );
      this.state.sweepEscapeReset = false;
      this.geometry.resetSweep(false);
    }
    if (tool === 'create') this.geometry.updateSimpleShapeFields();

    const controller = TOOL_CONTROLLERS[tool];
    this.ui.editorCommands.setActiveTool(tool);
    this.ui.pointerContext.set(`${controller.pointerLabel} / edit`);
    this.ui.statusMessage.set(
      controller.status({
        shapeLabel: this.geometry.simpleShapeLabel(this.state.simpleShapeOptions.kind),
        entityClassname: this.ui.pointEntityTool.getSnapshot().classname.trim(),
        hasSelectedFaces: selectedFaceReferences(this.state.session.selection).length > 0,
      }),
    );
    this.inspector.updateInspector(
      tool === 'sweep' && this.state.sweepCandidate
        ? this.state.sweepCandidate.document
        : this.state.session.document,
      this.state.session.selection,
    );
  }

  public handleKeyDown(event: KeyboardEvent): boolean {
    const tool = this.state.activeTool;
    if (tool === 'sweep' && event.key === 'Escape') {
      event.preventDefault();
      if (!this.state.sweepEscapeReset) {
        this.geometry.resetSweep(true);
        this.ui.statusMessage.set('Sweep destination reset. Press Escape again to leave the tool.');
      } else {
        this.activate('select');
      }
      return true;
    }
    if (tool === 'sweep' && event.key.startsWith('Arrow')) {
      event.preventDefault();
      const translation = [...this.state.sweepTransform.translation] as [number, number, number];
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        translation[2] +=
          event.key === 'ArrowUp' ? this.state.activeGridSize : -this.state.activeGridSize;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        translation[0] +=
          event.key === 'ArrowRight' ? this.state.activeGridSize : -this.state.activeGridSize;
      } else {
        translation[1] +=
          event.key === 'ArrowUp' ? this.state.activeGridSize : -this.state.activeGridSize;
      }
      this.state.sweepTransform = { ...this.state.sweepTransform, translation };
      this.state.sweepEscapeReset = false;
      this.geometry.syncSweepControls();
      this.geometry.refreshSweepPreview();
      return true;
    }
    if (
      this.transform.isTopologyTool(tool) &&
      this.state.topologySelectedVertices.length > 0 &&
      event.key.startsWith('Arrow')
    ) {
      const viewport = this.state.lastPointerPosition?.viewport ?? 'perspective';
      const delta = this.transform.viewportKeyboardNudge(event.key, viewport, event.altKey);
      if (!delta) return false;
      event.preventDefault();
      this.transform.commitTopologyNudge(delta, viewport);
      return true;
    }
    if (
      tool === 'face' &&
      selectedFaceReferences(this.state.session.selection).length > 0 &&
      event.key.startsWith('Arrow')
    ) {
      const viewport = this.state.lastPointerPosition?.viewport ?? 'perspective';
      const delta = this.transform.viewportKeyboardNudge(event.key, viewport, event.altKey);
      if (!delta) return false;
      event.preventDefault();
      this.transform.commitFaceNudge(delta, viewport);
      return true;
    }
    if (tool === 'sweep' && (event.key === '[' || event.key === ']')) {
      event.preventDefault();
      const rotationDegrees = [...this.state.sweepTransform.rotationDegrees] as [
        number,
        number,
        number,
      ];
      rotationDegrees[2] += event.key === ']' ? 15 : -15;
      this.state.sweepTransform = { ...this.state.sweepTransform, rotationDegrees };
      this.state.sweepEscapeReset = false;
      this.geometry.syncSweepControls();
      this.geometry.refreshSweepPreview();
      return true;
    }
    if (tool === 'sweep' && (event.key === '-' || event.key === '=')) {
      event.preventDefault();
      this.state.sweepTransform = {
        ...this.state.sweepTransform,
        scale: Math.max(
          0.05,
          Math.min(20, this.state.sweepTransform.scale + (event.key === '=' ? 0.05 : -0.05)),
        ),
      };
      this.state.sweepEscapeReset = false;
      this.geometry.syncSweepControls();
      this.geometry.refreshSweepPreview();
      return true;
    }
    if (tool === 'clip' && event.key === 'Enter') {
      event.preventDefault();
      this.geometry.applyClip();
      return true;
    }
    if (tool === 'sweep' && event.key === 'Enter') {
      event.preventDefault();
      this.geometry.applySweep();
      return true;
    }
    if (tool === 'hull' && event.key === 'Enter') {
      event.preventDefault();
      try {
        if (!this.state.renderer?.commitHullBrush())
          this.ui.statusMessage.set('Place hull points first.');
      } catch (error) {
        this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
      }
      return true;
    }
    if (event.key === 'Escape' && this.geometry.clearActiveHandleSelection()) {
      event.preventDefault();
      return true;
    }
    if (event.key === 'Escape' && tool !== 'select') {
      event.preventDefault();
      if (tool === 'clip' && this.state.renderer?.removeLastClipPoint()) {
        this.ui.statusMessage.set('Removed the most recent clip point.');
      } else if (tool === 'hull' && this.state.renderer?.clearHullPoints()) {
        this.ui.statusMessage.set('Discarded all hull points.');
      } else {
        this.activate('select');
      }
      return true;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && tool === 'clip') {
      if (!this.state.renderer?.removeLastClipPoint()) return false;
      event.preventDefault();
      this.ui.statusMessage.set('Removed the most recent clip point.');
      return true;
    }
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      this.transform.isTopologyTool(tool)
    ) {
      event.preventDefault();
      this.geometry.deleteTopologySelection();
      return true;
    }
    return false;
  }
}
