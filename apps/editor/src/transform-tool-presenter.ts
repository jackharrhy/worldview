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
  type EditorTool,
  type EditorTopologyDragEvent,
  type EditorTransformDragEvent,
  type EditorTransformPivotDragEvent,
  type MapDocument,
  type TransformAxis,
  type Vec3,
} from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';

export class TransformToolPresenter {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
  }

  public isTransformTool(tool: EditorTool): tool is 'rotate' | 'scale' | 'shear' {
    return tool === 'rotate' || tool === 'scale' || tool === 'shear';
  }

  public isTopologyTool(tool: EditorTool): tool is 'vertex' | 'edge' {
    return tool === 'vertex' || tool === 'edge';
  }

  public handleTopologyDrag(event: EditorTopologyDragEvent): void {
    const pointerContext = this.ui.cameraPointerContext;
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
      this.app.inspector.updateInspector();
      if (event.phase === 'cancel') this.ui.statusMessage.textContent = `${label} move cancelled.`;
      pointerContext.textContent = `${event.viewport.toUpperCase()} / ${event.kind}`;
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
              this.ui.textureLock.checked,
            )
          : null
        : snapping && event.anchor && event.target
          ? this.state.session.createVertexSnapCandidate(
              selectedBrushIds(event.selection),
              event.vertices,
              event.anchor,
              event.target,
              ids,
              this.ui.textureLock.checked,
            )
          : this.state.session.createBrushSetVertexMoveCandidate(
              selectedBrushIds(event.selection),
              event.vertices,
              event.delta,
              ids,
              this.ui.textureLock.checked,
            );
      if (!candidate) return;
      if (event.phase === 'preview') {
        this.state.topologyCandidate = candidate;
        this.state.renderer?.setDocument(candidate.document, this.state.session.selection);
        this.app.inspector.updateInspector(candidate.document, this.state.session.selection);
        this.ui.statusMessage.textContent = `${label} preview: ${this.app.build.formatVector(event.delta)} (${event.snapMode} snap; ${this.app.build.movementDescription(event)}). Release to commit.`;
        pointerContext.textContent = `${event.viewport.toUpperCase()} / ${insertion ? 'insert' : event.kind} ${this.app.build.formatVector(event.delta)}`;
        return;
      }
      this.state.session.commitCandidate(this.state.topologyCandidate ?? candidate);
      this.state.topologyCandidate = null;
      this.state.topologySequence += 1;
      pointerContext.textContent = `${event.viewport.toUpperCase()} / ${event.kind}`;
    } catch (error) {
      this.state.topologyCandidate = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.app.inspector.updateInspector();
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      pointerContext.textContent = `${event.viewport.toUpperCase()} / ${event.kind} invalid`;
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
        this.ui.textureLock.checked,
      );
      if (!candidate) return false;
      const label =
        this.state.topologySelectionKind === 'vertex' ? 'Nudge vertices' : 'Nudge edges';
      this.state.renderer?.translateTopologySelection(delta);
      this.state.session.commitCandidate({ ...candidate, label });
      this.state.topologySequence += 1;
      this.ui.cameraPointerContext.textContent = `${viewport.toUpperCase()} / ${this.state.topologySelectionKind} ${this.app.build.formatVector(delta)}`;
      return true;
    } catch (error) {
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.app.inspector.updateInspector();
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
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
        this.ui.textureLock.checked,
      );
      if (!candidate) return false;
      const label = faces.length === 1 ? 'Nudge face' : 'Nudge faces';
      this.state.session.commitCandidate({ ...candidate, label });
      this.state.faceTranslationSequence += 1;
      this.ui.cameraPointerContext.textContent = `${viewport.toUpperCase()} / face ${this.app.build.formatVector(delta)}`;
      return true;
    } catch (error) {
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.app.inspector.updateInspector();
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
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
    this.app.inspector.updateInspector();
  }

  public readTransformPivot(): Vec3 {
    const pivot = [
      Number(this.ui.transformPivotX.value),
      Number(this.ui.transformPivotY.value),
      Number(this.ui.transformPivotZ.value),
    ] as const;
    if (!pivot.every(Number.isFinite))
      throw new Error('Transform pivot must contain finite values');
    this.state.transformPivot = pivot;
    this.state.renderer?.setTransformPivot(pivot);
    return pivot;
  }

  public readTransformAxis(input: HTMLSelectElement): TransformAxis {
    const axis = Number(input.value);
    if (axis !== 0 && axis !== 1 && axis !== 2) throw new Error('Invalid transform axis');
    return axis;
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
    if (event.tool === 'rotate') {
      if (transformComponents) {
        return this.state.session.createBrushSetVertexRotationCandidate(
          brushIds,
          this.state.topologySelectedVertices,
          event.pivot,
          event.axis,
          event.angleDegrees,
          componentIds,
          this.ui.textureLock.checked,
        );
      }
      return this.state.session.createObjectRotationCandidate(
        event.selection,
        event.pivot,
        event.axis,
        event.angleDegrees,
        this.ui.textureLock.checked,
        this.ui.rotateUpdateEntityAngles.checked,
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
          this.ui.textureLock.checked,
        );
      }
      return this.state.session.createObjectScaleCandidate(
        event.selection,
        event.pivot,
        event.factors,
        this.ui.textureLock.checked,
        this.ui.rotateUpdateEntityAngles.checked,
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
        this.ui.textureLock.checked,
      );
    }
    return this.state.session.createObjectShearCandidate(
      event.selection,
      event.pivot,
      event.sourceAxis,
      event.targetAxis,
      event.factor,
      this.ui.textureLock.checked,
      this.ui.rotateUpdateEntityAngles.checked,
    );
  }

  public commitTransformCandidate(
    candidate: BrushEditCandidate | BrushBatchEditCandidate | DocumentEditCandidate,
  ): void {
    if ('selectionAfter' in candidate) this.state.session.commitDocumentCandidate(candidate);
    else this.state.session.commitCandidate(candidate);
  }

  public handleTransformDrag(event: EditorTransformDragEvent): void {
    const pointerContext = this.ui.cameraPointerContext;
    if (event.phase === 'cancel') {
      this.state.transformCandidate = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.app.inspector.updateInspector();
      this.ui.statusMessage.textContent = `${event.tool[0]!.toUpperCase()}${event.tool.slice(1)} cancelled.`;
      pointerContext.textContent = `${event.viewport.toUpperCase()} / ${event.tool}`;
      return;
    }
    try {
      const candidate = this.candidateForTransformEvent(event);
      if (!candidate) return;
      if (event.phase === 'preview') {
        this.state.transformCandidate = candidate;
        this.state.renderer?.setDocument(candidate.document, this.state.session.selection);
        this.app.inspector.updateInspector(candidate.document, this.state.session.selection);
        const detail =
          event.tool === 'rotate'
            ? `${event.angleDegrees}°`
            : event.tool === 'scale'
              ? this.app.build.formatVector(event.factors)
              : `${event.offset > 0 ? '+' : ''}${event.offset}`;
        this.ui.statusMessage.textContent = `${this.state.topologySelectionKind ? 'Component ' : ''}${event.tool} preview: ${detail}. Release to commit.`;
        pointerContext.textContent = `${event.viewport.toUpperCase()} / ${event.tool} ${detail}`;
        return;
      }
      const transformedComponents = Boolean(
        this.state.topologySelectionKind && this.state.topologySelectedVertices.length > 0,
      );
      this.commitTransformCandidate(this.state.transformCandidate ?? candidate);
      if (transformedComponents) {
        this.state.renderer?.remapTopologySelection(event);
        this.state.topologyTransformSequence += 1;
        this.app.inspector.updateInspector();
      }
      this.state.transformCandidate = null;
      pointerContext.textContent = `${event.viewport.toUpperCase()} / ${event.tool}`;
    } catch (error) {
      this.state.transformCandidate = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.app.inspector.updateInspector();
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public handleTransformPivotDrag(event: EditorTransformPivotDragEvent): void {
    const pointerContext = this.ui.cameraPointerContext;
    const nextPivot = event.phase === 'cancel' ? event.startPivot : event.pivot;
    this.state.transformPivot = [...nextPivot] as Vec3;
    this.state.transformPivotSelectionKey = this.selectedTransformKey();
    this.state.renderer?.setTransformPivot(this.state.transformPivot);
    this.app.inspector.updateInspector();
    const constraint =
      event.axisRestriction === null ? '' : ` / ${['X', 'Y', 'Z'][event.axisRestriction]} locked`;
    if (event.phase === 'preview') {
      this.ui.statusMessage.textContent = `Rotate pivot preview: ${this.app.build.formatVector(nextPivot)}${constraint}. Release to place it.`;
    } else if (event.phase === 'commit') {
      this.ui.statusMessage.textContent = `Rotate pivot moved to ${this.app.build.formatVector(nextPivot)}${constraint}.`;
    } else {
      this.ui.statusMessage.textContent = `Rotate pivot move cancelled at ${this.app.build.formatVector(nextPivot)}.`;
    }
    pointerContext.textContent = `${event.viewport.toUpperCase()} / rotate pivot ${this.app.build.formatVector(nextPivot)}${constraint}`;
  }

  public applyExactTransform(): void {
    const selection = this.state.session.selection;
    if (!selection || selection.faceId || !this.isTransformTool(this.state.activeTool)) {
      this.ui.statusMessage.textContent =
        'Select one or more objects and activate a transform tool first.';
      return;
    }
    try {
      const pivot = this.readTransformPivot();
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
        const axis = this.readTransformAxis(this.ui.rotateAxis);
        const angleDegrees = Number(this.ui.rotateAngle.value);
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
              this.ui.textureLock.checked,
            )
          : this.state.session.createObjectRotationCandidate(
              selection,
              pivot,
              axis,
              angleDegrees,
              this.ui.textureLock.checked,
              this.ui.rotateUpdateEntityAngles.checked,
            );
      } else if (this.state.activeTool === 'scale') {
        const brushSelection = selection as BrushSelection;
        const factors = [
          Number(this.ui.scaleX.value),
          Number(this.ui.scaleY.value),
          Number(this.ui.scaleZ.value),
        ] as Vec3;
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
              this.ui.textureLock.checked,
            )
          : this.state.session.createObjectScaleCandidate(
              selection,
              pivot,
              factors,
              this.ui.textureLock.checked,
              this.ui.rotateUpdateEntityAngles.checked,
            );
      } else {
        const brushSelection = selection as BrushSelection;
        const sourceAxis = this.readTransformAxis(this.ui.shearSourceAxis);
        const targetAxis = this.readTransformAxis(this.ui.shearTargetAxis);
        const bounds = this.selectedTransformBounds();
        if (!bounds) return;
        const span = bounds.max[sourceAxis] - bounds.min[sourceAxis];
        if (span <= 1e-6) throw new Error('Cannot shear along a collapsed selection axis');
        const offset = Number(this.ui.shearOffset.value);
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
              this.ui.textureLock.checked,
            )
          : this.state.session.createObjectShearCandidate(
              selection,
              pivot,
              sourceAxis,
              targetAxis,
              factor,
              this.ui.textureLock.checked,
              this.ui.rotateUpdateEntityAngles.checked,
            );
      }
      if (!candidate) {
        this.ui.statusMessage.textContent = 'The transform leaves the selection unchanged.';
        return;
      }
      this.commitTransformCandidate(candidate);
      if (transformComponents && remapEvent) {
        this.state.renderer?.remapTopologySelection(remapEvent);
        this.state.topologyTransformSequence += 1;
        this.app.inspector.updateInspector();
      }
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public flipSelectedObjects(axis: TransformAxis): void {
    const selection = this.state.session.selection;
    const bounds = this.selectedObjectBounds();
    if (!selection || selection.faceId || !bounds) {
      this.ui.statusMessage.textContent = 'Select one or more objects before flipping.';
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
        this.ui.textureLock.checked,
        this.ui.rotateUpdateEntityAngles.checked,
      );
      if (!candidate) return;
      this.state.session.commitDocumentCandidate(candidate);
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }
}
