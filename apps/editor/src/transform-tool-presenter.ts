import {
  createSequentialIdFactory,
  deriveBrush,
  findBrush,
  pointEntityBounds,
  selectedBrushIds,
  selectedFaceReferences,
  selectedPointEntityIds,
  type BrushEditCandidate,
  type BrushBatchEditCandidate,
  type BrushSelection,
  type DocumentEditCandidate,
  type EditorPointerPositionEvent,
  type EditorBrushDragEvent,
  type EditorSelection,
  type EditorTool,
  type EditorTopologyDragEvent,
  type EditorTransformDragEvent,
  type EditorTransformPivotDragEvent,
  type MapDocument,
  type TransformAxis,
  type Vec3,
} from '@jackharrhy/worldview-editor';

import type { EditorShellState } from './editor-shell-state.js';
import type { EditorState } from './editor-state.js';

type TransformToolUi = Pick<EditorShellState, 'objectTools' | 'pointerContext' | 'statusMessage'>;

export class TransformToolPresenter {
  public constructor(
    private readonly state: EditorState,
    private readonly ui: TransformToolUi,
    private readonly updateInspector: (
      document?: MapDocument,
      selection?: EditorSelection | null,
    ) => void,
    private readonly formatVector: (value: readonly number[]) => string,
    private readonly movementDescription: (
      event: Pick<EditorBrushDragEvent, 'movementPlane' | 'axisRestriction'>,
    ) => string,
  ) {}

  public isTransformTool(tool: EditorTool): tool is 'rotate' | 'scale' | 'shear' {
    return tool === 'rotate' || tool === 'scale' || tool === 'shear';
  }

  public isTopologyTool(tool: EditorTool): tool is 'vertex' | 'edge' {
    return tool === 'vertex' || tool === 'edge';
  }

  public handleTopologyDrag(event: EditorTopologyDragEvent): void {
    const pointerContext = this.ui.pointerContext;
    const insertion = event.operation === 'insert';
    const snapping = event.operation === 'snap';
    const label = insertion
      ? 'Vertex insertion'
      : snapping
        ? 'Vertex snap'
        : event.kind === 'vertex'
          ? 'Vertex'
          : 'Edge';
    const hasMovement = event.delta.some((component) => Math.abs(component) > Number.EPSILON);
    if (event.phase === 'cancel' || !hasMovement) {
      this.state.topologyCandidate = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.updateInspector();
      if (event.phase === 'cancel') this.ui.statusMessage.set(`${label} move cancelled.`);
      pointerContext.set(`${event.viewport.toUpperCase()} / ${event.kind}`);
      return;
    }
    try {
      const ids = createSequentialIdFactory(`topology-${this.state.topologySequence + 1}`);
      const candidate = insertion
        ? event.vertices[0]
          ? this.state.session.createVertexInsertionCandidate(
              event.brushIds[0] ?? event.selection.brushId,
              event.vertices[0],
              event.delta,
              ids,
              this.state.textureLock,
            )
          : null
        : snapping && event.anchor && event.target
          ? this.state.session.createVertexSnapCandidate(
              selectedBrushIds(event.selection),
              event.vertices,
              event.anchor,
              event.target,
              ids,
              this.state.textureLock,
            )
          : this.state.session.createBrushSetVertexMoveCandidate(
              selectedBrushIds(event.selection),
              event.vertices,
              event.delta,
              ids,
              this.state.textureLock,
            );
      if (!candidate) return;
      if (event.phase === 'preview') {
        this.state.topologyCandidate = candidate;
        this.state.renderer?.setDocument(candidate.document, this.state.session.selection);
        this.updateInspector(candidate.document, this.state.session.selection);
        this.ui.statusMessage.set(
          `${label} preview: ${this.formatVector(event.delta)} (${event.snapMode} snap; ${this.movementDescription(event)}). Release to commit.`,
        );
        pointerContext.set(
          `${event.viewport.toUpperCase()} / ${insertion ? 'insert' : event.kind} ${this.formatVector(event.delta)}`,
        );
        return;
      }
      this.state.session.commitCandidate(this.state.topologyCandidate ?? candidate);
      this.state.topologyCandidate = null;
      this.state.topologySequence += 1;
      pointerContext.set(`${event.viewport.toUpperCase()} / ${event.kind}`);
    } catch (error) {
      this.state.topologyCandidate = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.updateInspector();
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
      pointerContext.set(`${event.viewport.toUpperCase()} / ${event.kind} invalid`);
    }
  }

  public commitTopologyNudge(
    delta: Vec3,
    viewport: EditorPointerPositionEvent['viewport'],
  ): boolean {
    if (!this.state.topologySelectionKind || this.state.topologySelectedVertices.length === 0)
      return false;
    const selection = this.state.session.selection;
    if (!selection?.brushId || selection.faceId) return false;
    try {
      const candidate = this.state.session.createBrushSetVertexMoveCandidate(
        selectedBrushIds(selection),
        this.state.topologySelectedVertices,
        delta,
        createSequentialIdFactory(`topology-${this.state.topologySequence + 1}`),
        this.state.textureLock,
      );
      if (!candidate) return false;
      const label =
        this.state.topologySelectionKind === 'vertex' ? 'Nudge vertices' : 'Nudge edges';
      this.state.renderer?.translateTopologySelection(delta);
      this.state.session.commitCandidate({ ...candidate, label });
      this.state.topologySequence += 1;
      this.ui.pointerContext.set(
        `${viewport.toUpperCase()} / ${this.state.topologySelectionKind} ${this.formatVector(delta)}`,
      );
      return true;
    } catch (error) {
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.updateInspector();
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
      return true;
    }
  }

  public commitFaceNudge(delta: Vec3, viewport: EditorPointerPositionEvent['viewport']): boolean {
    if (this.state.activeTool !== 'face') return false;
    const faces = selectedFaceReferences(this.state.session.selection);
    if (faces.length === 0) return false;
    try {
      const candidate = this.state.session.createFaceSetTranslationCandidate(
        faces,
        delta,
        createSequentialIdFactory(`face-move-${this.state.faceTranslationSequence + 1}`),
        this.state.textureLock,
      );
      if (!candidate) return false;
      const label = faces.length === 1 ? 'Nudge face' : 'Nudge faces';
      this.state.session.commitCandidate({ ...candidate, label });
      this.state.faceTranslationSequence += 1;
      this.ui.pointerContext.set(`${viewport.toUpperCase()} / face ${this.formatVector(delta)}`);
      return true;
    } catch (error) {
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.updateInspector();
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
      return true;
    }
  }

  public viewportKeyboardNudge(
    key: string,
    viewport: EditorPointerPositionEvent['viewport'],
    verticalPerspective: boolean,
  ): Vec3 | null {
    const delta: [number, number, number] = [0, 0, 0];
    const horizontalDirection = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
    const verticalDirection = key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0;
    if (horizontalDirection === 0 && verticalDirection === 0) return null;
    if (viewport === 'xy') {
      delta[horizontalDirection === 0 ? 1 : 0] =
        this.state.activeGridSize * (horizontalDirection || verticalDirection);
      return delta;
    }
    if (viewport === 'xz') {
      delta[horizontalDirection === 0 ? 2 : 0] =
        this.state.activeGridSize * (horizontalDirection || verticalDirection);
      return delta;
    }
    if (viewport === 'yz') {
      delta[horizontalDirection === 0 ? 2 : 1] =
        this.state.activeGridSize * (horizontalDirection || verticalDirection);
      return delta;
    }
    if (verticalPerspective && verticalDirection !== 0) {
      delta[2] = this.state.activeGridSize * verticalDirection;
      return delta;
    }
    const yaw = this.state.perspectiveCamera?.yaw ?? 0;
    const basis: readonly [number, number] =
      horizontalDirection !== 0 ? [-Math.sin(yaw), Math.cos(yaw)] : [Math.cos(yaw), Math.sin(yaw)];
    const axis = Math.abs(basis[0]) >= Math.abs(basis[1]) ? 0 : 1;
    const direction = horizontalDirection || verticalDirection;
    delta[axis] = this.state.activeGridSize * direction * (basis[axis] >= 0 ? 1 : -1);
    return delta;
  }

  public selectedObjectBounds(document: MapDocument = this.state.session.document) {
    const selection = this.state.session.selection;
    if (!selection || selection.faceId) return null;
    const selectionBrushBounds = selectedBrushIds(selection).flatMap((selectedBrushId) => {
      const brush = findBrush(document, selectedBrushId);
      const derived = brush ? deriveBrush(brush) : null;
      return derived?.bounds ? [derived.bounds] : [];
    });
    const entityIds = new Set(selectedPointEntityIds(selection));
    const bounds = [
      ...selectionBrushBounds,
      ...document.entities.flatMap((entity) => {
        if (!entityIds.has(entity.id)) return [];
        const entityBounds = pointEntityBounds(entity);
        return entityBounds ? [entityBounds] : [];
      }),
    ];
    if (bounds.length === 0) return null;
    return {
      min: [
        Math.min(...bounds.map((entry) => entry.min[0])),
        Math.min(...bounds.map((entry) => entry.min[1])),
        Math.min(...bounds.map((entry) => entry.min[2])),
      ] as Vec3,
      max: [
        Math.max(...bounds.map((entry) => entry.max[0])),
        Math.max(...bounds.map((entry) => entry.max[1])),
        Math.max(...bounds.map((entry) => entry.max[2])),
      ] as Vec3,
    };
  }

  public selectedTopologyBounds() {
    if (this.state.topologySelectedVertices.length === 0) return null;
    return {
      min: [
        Math.min(...this.state.topologySelectedVertices.map((point) => point[0])),
        Math.min(...this.state.topologySelectedVertices.map((point) => point[1])),
        Math.min(...this.state.topologySelectedVertices.map((point) => point[2])),
      ] as Vec3,
      max: [
        Math.max(...this.state.topologySelectedVertices.map((point) => point[0])),
        Math.max(...this.state.topologySelectedVertices.map((point) => point[1])),
        Math.max(...this.state.topologySelectedVertices.map((point) => point[2])),
      ] as Vec3,
    };
  }

  public selectedTransformBounds(document: MapDocument = this.state.session.document) {
    return this.state.topologySelectionKind && this.state.topologySelectedVertices.length > 0
      ? this.selectedTopologyBounds()
      : this.selectedObjectBounds(document);
  }

  public selectedObjectKey(selection = this.state.session.selection): string | null {
    const brushIds = selectedBrushIds(selection);
    const entityIds = selectedPointEntityIds(selection);
    return brushIds.length + entityIds.length > 0
      ? `b:${brushIds.join('\u0000')}|e:${entityIds.join('\u0000')}`
      : null;
  }

  public selectedTransformKey(selection = this.state.session.selection): string | null {
    if (this.state.topologySelectionKind && this.state.topologySelectedVertices.length > 0) {
      return `${this.state.topologySelectionKind}:${this.state.topologySelectedVertices
        .map((point) => point.join(','))
        .toSorted()
        .join('|')}`;
    }
    return this.selectedObjectKey(selection);
  }

  public resetTransformPivot(): void {
    const selection = this.state.session.selection;
    const bounds = this.selectedTransformBounds();
    if (!selection || !bounds) {
      this.state.transformPivot = null;
      this.state.transformPivotSelectionKey = null;
      this.state.renderer?.setTransformPivot(null);
      return;
    }
    this.state.transformPivot = bounds.min.map(
      (component, axis) =>
        Math.round((component + bounds.max[axis]!) / 2 / this.state.activeGridSize) *
        this.state.activeGridSize,
    ) as [number, number, number];
    this.state.transformPivotSelectionKey = this.selectedTransformKey(selection);
    this.state.renderer?.setTransformPivot(this.state.transformPivot);
    this.updateInspector();
  }

  public setTransformPivot(pivot: Vec3): void {
    if (!pivot.every(Number.isFinite)) {
      throw new Error('Transform pivot must contain finite values');
    }
    this.state.transformPivot = [...pivot] as Vec3;
    this.state.transformPivotSelectionKey = this.selectedTransformKey();
    this.state.renderer?.setTransformPivot(this.state.transformPivot);
    this.ui.objectTools.updateTransformSettings({ pivot: this.state.transformPivot });
  }

  public candidateForTransformEvent(
    event: EditorTransformDragEvent,
  ): BrushEditCandidate | BrushBatchEditCandidate | DocumentEditCandidate | null {
    const brushIds = selectedBrushIds(event.selection);
    const componentIds = createSequentialIdFactory(
      `topology-transform-${this.state.topologyTransformSequence + 1}`,
    );
    const transformComponents = Boolean(
      this.state.topologySelectionKind && this.state.topologySelectedVertices.length > 0,
    );
    const updateEntityAngles =
      this.ui.objectTools.getSnapshot().transform.settings.updateEntityAngles;
    if (event.tool === 'rotate') {
      if (transformComponents) {
        return this.state.session.createBrushSetVertexRotationCandidate(
          brushIds,
          this.state.topologySelectedVertices,
          event.pivot,
          event.axis,
          event.angleDegrees,
          componentIds,
          this.state.textureLock,
        );
      }
      return this.state.session.createObjectRotationCandidate(
        event.selection,
        event.pivot,
        event.axis,
        event.angleDegrees,
        this.state.textureLock,
        updateEntityAngles,
      );
    }
    if (event.tool === 'scale') {
      if (transformComponents) {
        return this.state.session.createBrushSetVertexScaleCandidate(
          brushIds,
          this.state.topologySelectedVertices,
          event.pivot,
          event.factors,
          componentIds,
          this.state.textureLock,
        );
      }
      return this.state.session.createObjectScaleCandidate(
        event.selection,
        event.pivot,
        event.factors,
        this.state.textureLock,
        updateEntityAngles,
      );
    }
    if (transformComponents) {
      return this.state.session.createBrushSetVertexShearCandidate(
        brushIds,
        this.state.topologySelectedVertices,
        event.pivot,
        event.sourceAxis,
        event.targetAxis,
        event.factor,
        componentIds,
        this.state.textureLock,
      );
    }
    return this.state.session.createObjectShearCandidate(
      event.selection,
      event.pivot,
      event.sourceAxis,
      event.targetAxis,
      event.factor,
      this.state.textureLock,
      updateEntityAngles,
    );
  }

  public commitTransformCandidate(
    candidate: BrushEditCandidate | BrushBatchEditCandidate | DocumentEditCandidate,
  ): void {
    if ('selectionAfter' in candidate) this.state.session.commitDocumentCandidate(candidate);
    else this.state.session.commitCandidate(candidate);
  }

  public handleTransformDrag(event: EditorTransformDragEvent): void {
    const pointerContext = this.ui.pointerContext;
    if (event.phase === 'cancel') {
      this.state.transformCandidate = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.updateInspector();
      this.ui.statusMessage.set(`${event.tool[0]!.toUpperCase()}${event.tool.slice(1)} cancelled.`);
      pointerContext.set(`${event.viewport.toUpperCase()} / ${event.tool}`);
      return;
    }
    try {
      const candidate = this.candidateForTransformEvent(event);
      if (!candidate) return;
      if (event.phase === 'preview') {
        this.state.transformCandidate = candidate;
        this.state.renderer?.setDocument(candidate.document, this.state.session.selection);
        this.updateInspector(candidate.document, this.state.session.selection);
        const detail =
          event.tool === 'rotate'
            ? `${event.angleDegrees}°`
            : event.tool === 'scale'
              ? this.formatVector(event.factors)
              : `${event.offset > 0 ? '+' : ''}${event.offset}`;
        this.ui.statusMessage.set(
          `${this.state.topologySelectionKind ? 'Component ' : ''}${event.tool} preview: ${detail}. Release to commit.`,
        );
        pointerContext.set(`${event.viewport.toUpperCase()} / ${event.tool} ${detail}`);
        return;
      }
      const transformedComponents = Boolean(
        this.state.topologySelectionKind && this.state.topologySelectedVertices.length > 0,
      );
      this.commitTransformCandidate(this.state.transformCandidate ?? candidate);
      if (transformedComponents) {
        this.state.renderer?.remapTopologySelection(event);
        this.state.topologyTransformSequence += 1;
        this.updateInspector();
      }
      this.state.transformCandidate = null;
      pointerContext.set(`${event.viewport.toUpperCase()} / ${event.tool}`);
    } catch (error) {
      this.state.transformCandidate = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.updateInspector();
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  public handleTransformPivotDrag(event: EditorTransformPivotDragEvent): void {
    const pointerContext = this.ui.pointerContext;
    const nextPivot = event.phase === 'cancel' ? event.startPivot : event.pivot;
    this.state.transformPivot = [...nextPivot] as Vec3;
    this.state.transformPivotSelectionKey = this.selectedTransformKey();
    this.state.renderer?.setTransformPivot(this.state.transformPivot);
    this.updateInspector();
    const constraint =
      event.axisRestriction === null ? '' : ` / ${['X', 'Y', 'Z'][event.axisRestriction]} locked`;
    if (event.phase === 'preview') {
      this.ui.statusMessage.set(
        `Rotate pivot preview: ${this.formatVector(nextPivot)}${constraint}. Release to place it.`,
      );
    } else if (event.phase === 'commit') {
      this.ui.statusMessage.set(
        `Rotate pivot moved to ${this.formatVector(nextPivot)}${constraint}.`,
      );
    } else {
      this.ui.statusMessage.set(`Rotate pivot move cancelled at ${this.formatVector(nextPivot)}.`);
    }
    pointerContext.set(
      `${event.viewport.toUpperCase()} / rotate pivot ${this.formatVector(nextPivot)}${constraint}`,
    );
  }

  public applyExactTransform(): void {
    const selection = this.state.session.selection;
    if (!selection || selection.faceId || !this.isTransformTool(this.state.activeTool)) {
      this.ui.statusMessage.set('Select one or more objects and activate a transform tool first.');
      return;
    }
    try {
      const settings = this.ui.objectTools.getSnapshot().transform.settings;
      const pivot = settings.pivot;
      this.setTransformPivot(pivot);
      let candidate: BrushEditCandidate | BrushBatchEditCandidate | DocumentEditCandidate | null;
      let remapEvent: EditorTransformDragEvent | null = null;
      const brushIds = selectedBrushIds(selection);
      const transformComponents = Boolean(
        this.state.topologySelectionKind && this.state.topologySelectedVertices.length > 0,
      );
      const componentIds = createSequentialIdFactory(
        `topology-transform-${this.state.topologyTransformSequence + 1}`,
      );
      if (this.state.activeTool === 'rotate') {
        const axis = settings.rotateAxis;
        const angleDegrees = settings.rotateAngle;
        remapEvent = {
          phase: 'commit',
          viewport: 'perspective',
          selection,
          pivot,
          tool: 'rotate',
          axis,
          angleDegrees,
        };
        candidate = transformComponents
          ? this.state.session.createBrushSetVertexRotationCandidate(
              brushIds,
              this.state.topologySelectedVertices,
              pivot,
              axis,
              angleDegrees,
              componentIds,
              this.state.textureLock,
            )
          : this.state.session.createObjectRotationCandidate(
              selection,
              pivot,
              axis,
              angleDegrees,
              this.state.textureLock,
              settings.updateEntityAngles,
            );
      } else if (this.state.activeTool === 'scale') {
        const brushSelection = selection as BrushSelection;
        const factors = settings.scale;
        remapEvent = {
          phase: 'commit',
          viewport: 'perspective',
          selection: brushSelection,
          pivot,
          tool: 'scale',
          factors,
        };
        candidate = transformComponents
          ? this.state.session.createBrushSetVertexScaleCandidate(
              brushIds,
              this.state.topologySelectedVertices,
              pivot,
              factors,
              componentIds,
              this.state.textureLock,
            )
          : this.state.session.createObjectScaleCandidate(
              selection,
              pivot,
              factors,
              this.state.textureLock,
              settings.updateEntityAngles,
            );
      } else {
        const brushSelection = selection as BrushSelection;
        const sourceAxis = settings.shearSourceAxis;
        const targetAxis = settings.shearTargetAxis;
        const bounds = this.selectedTransformBounds();
        if (!bounds) return;
        const span = bounds.max[sourceAxis] - bounds.min[sourceAxis];
        if (span <= 1e-6) throw new Error('Cannot shear along a collapsed selection axis');
        const offset = settings.shearOffset;
        const factor = offset / span;
        remapEvent = {
          phase: 'commit',
          viewport: 'perspective',
          selection: brushSelection,
          pivot,
          tool: 'shear',
          sourceAxis,
          targetAxis,
          factor,
          offset,
        };
        candidate = transformComponents
          ? this.state.session.createBrushSetVertexShearCandidate(
              brushIds,
              this.state.topologySelectedVertices,
              pivot,
              sourceAxis,
              targetAxis,
              factor,
              componentIds,
              this.state.textureLock,
            )
          : this.state.session.createObjectShearCandidate(
              selection,
              pivot,
              sourceAxis,
              targetAxis,
              factor,
              this.state.textureLock,
              settings.updateEntityAngles,
            );
      }
      if (!candidate) {
        this.ui.statusMessage.set('The transform leaves the selection unchanged.');
        return;
      }
      this.commitTransformCandidate(candidate);
      if (transformComponents && remapEvent) {
        this.state.renderer?.remapTopologySelection(remapEvent);
        this.state.topologyTransformSequence += 1;
        this.updateInspector();
      }
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  public flipSelectedObjects(axis: TransformAxis): void {
    const selection = this.state.session.selection;
    const bounds = this.selectedObjectBounds();
    if (!selection || selection.faceId || !bounds) {
      this.ui.statusMessage.set('Select one or more objects before flipping.');
      return;
    }
    try {
      const pivot = bounds.min.map(
        (component, index) =>
          Math.round((component + bounds.max[index]!) / 2 / this.state.activeGridSize) *
          this.state.activeGridSize,
      ) as [number, number, number];
      const candidate = this.state.session.createObjectFlipCandidate(
        selection,
        pivot,
        axis,
        this.state.textureLock,
        this.ui.objectTools.getSnapshot().transform.settings.updateEntityAngles,
      );
      if (!candidate) return;
      this.state.session.commitDocumentCandidate(candidate);
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }
}
