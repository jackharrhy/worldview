import {
  createBrushSelection,
  createSequentialIdFactory,
  deriveBrush,
  findBrush,
  selectedBrushIds,
  selectedFaceReferences,
  type BrushClipMode,
  type SweepPath,
  type SweepTransform,
  type EditorClipPlaneEvent,
  type CircleMode,
  type EditorSweepDragEvent,
  type SimpleShapeKind,
  type SimpleShapeOptions,
  type StairDirection,
  type Vec3,
} from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';

export class GeometryToolPresenter {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
  }

  public applyCsgOperation(operation: 'merge' | 'intersect' | 'subtract' | 'hollow'): void {
    try {
      this.state.csgSequence += 1;
      const ids = createSequentialIdFactory(`csg-${operation}-${this.state.csgSequence}`);
      const changed =
        operation === 'merge'
          ? this.state.session.csgConvexMergeSelected(
              ids,
              this.state.activeMaterialName || undefined,
            )
          : operation === 'intersect'
            ? this.state.session.csgIntersectSelected(ids)
            : operation === 'subtract'
              ? this.state.session.csgSubtractSelected(ids)
              : this.state.session.csgHollowSelected(this.state.activeGridSize, ids);
      if (!changed) {
        this.ui.statusMessage.textContent =
          operation === 'merge' || operation === 'intersect'
            ? 'Select at least two brushes for this CSG operation.'
            : 'Select one or more brushes for this CSG operation.';
        return;
      }
      this.ui.statusMessage.textContent =
        operation === 'hollow'
          ? `Hollowed selection with ${this.state.activeGridSize}-unit walls.`
          : `CSG ${operation} committed as one undo step.`;
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public deleteTopologySelection(): void {
    if (
      !this.app.transform.isTopologyTool(this.state.activeTool) ||
      this.state.topologySelectedVertices.length === 0
    ) {
      this.ui.statusMessage.textContent = `Select ${this.state.activeTool === 'edge' ? 'edge' : 'vertex'} handles before deleting.`;
      return;
    }
    try {
      const changed = this.state.session.deleteSelectedVertices(
        this.state.topologySelectedVertices,
        createSequentialIdFactory(`topology-delete-${this.state.topologySequence + 1}`),
        this.ui.textureLock.checked,
      );
      if (!changed) return;
      this.state.topologySequence += 1;
      this.state.topologyCandidate = null;
      this.state.renderer?.clearTopologySelection();
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public clearActiveHandleSelection(): boolean {
    if (
      this.app.transform.isTopologyTool(this.state.activeTool) &&
      this.state.topologySelectedVertices.length > 0
    ) {
      const count =
        Number(this.ui.topologySelectionCount.textContent) ||
        this.state.topologySelectedVertices.length;
      this.state.topologyCandidate = null;
      this.state.renderer?.clearTopologySelection();
      this.ui.statusMessage.textContent = `Cleared ${count} selected ${this.state.activeTool} ${count === 1 ? 'handle' : 'handles'}. Press Escape again to leave the tool.`;
      return true;
    }
    if (this.state.activeTool !== 'face') return false;
    const faces = selectedFaceReferences(this.state.session.selection);
    if (faces.length === 0) return false;
    const brushIds = [...new Set(faces.map((face) => face.brushId))];
    this.state.session.select(
      createBrushSelection(brushIds, this.state.session.selection?.brushId ?? null),
    );
    this.ui.statusMessage.textContent = `Cleared ${faces.length} selected face ${faces.length === 1 ? 'handle' : 'handles'}. Press Escape again to leave the tool.`;
    return true;
  }

  public extrudeSelectedFaceBy(distance: number): void {
    if (!Number.isFinite(distance) || Math.abs(distance) <= Number.EPSILON) {
      this.ui.statusMessage.textContent = 'Enter a non-zero face extrusion distance.';
      return;
    }
    try {
      if (!this.state.session.extrudeSelectedFace(distance)) {
        this.ui.statusMessage.textContent = 'Select a face before extruding.';
      }
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public splitSelectedFaceBy(distance: number): void {
    if (!Number.isFinite(distance) || Math.abs(distance) <= Number.EPSILON) {
      this.ui.statusMessage.textContent = 'Enter a non-zero face split distance.';
      return;
    }
    try {
      const changed = this.state.session.splitSelectedFace(
        distance,
        createSequentialIdFactory(`face-split-${this.state.faceSplitSequence + 1}`),
      );
      if (!changed) {
        this.ui.statusMessage.textContent = 'Select an extrudable face before splitting.';
        return;
      }
      this.state.faceSplitSequence += 1;
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public stampSelectedFaceBy(distance: number): void {
    if (!Number.isFinite(distance) || Math.abs(distance) <= Number.EPSILON) {
      this.ui.statusMessage.textContent = 'Enter a non-zero face stamp distance.';
      return;
    }
    try {
      const changed = this.state.session.stampSelectedFace(
        distance,
        createSequentialIdFactory(`face-stamp-${this.state.faceStampSequence + 1}`),
        this.ui.textureLock.checked,
      );
      if (!changed) {
        this.ui.statusMessage.textContent = 'Select a stampable face first.';
        return;
      }
      this.state.faceStampSequence += 1;
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public refreshClipPreview(): void {
    this.state.clipCandidate = null;
    this.ui.applyClipButton.disabled = true;
    if (this.state.activeTool !== 'clip' || !this.state.clipPlanePoints) {
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.app.inspector.updateInspector();
      return;
    }
    const selection = this.state.session.selection;
    if (!selection || selection.faceId) {
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.app.inspector.updateInspector();
      this.ui.statusMessage.textContent =
        'Select one or more brushes before defining a clip plane.';
      return;
    }
    try {
      this.state.clipSequence += 1;
      const candidate = this.state.session.createBrushSetClipCandidate(
        selectedBrushIds(selection),
        this.state.clipPlanePoints,
        this.state.clipMode,
        createSequentialIdFactory(`clip-${this.state.clipSequence}`),
        this.state.activeMaterialName || undefined,
      );
      if (!candidate) {
        this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
        this.app.inspector.updateInspector();
        this.ui.statusMessage.textContent =
          'The clip plane does not affect the selected brushes in this mode.';
        return;
      }
      this.state.clipCandidate = candidate;
      this.ui.applyClipButton.disabled = false;
      this.state.renderer?.setDocument(candidate.document, this.state.session.selection);
      this.app.inspector.updateInspector(candidate.document, this.state.session.selection);
      this.ui.statusMessage.textContent = `${this.state.clipMode === 'split' ? 'Split' : 'Clip'} preview ready. Press Enter or Apply clip to commit.`;
    } catch (error) {
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.app.inspector.updateInspector();
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public handleClipPlaneChange(event: EditorClipPlaneEvent): void {
    this.state.clipPlanePoints = event.planePoints;
    this.ui.clipPointCount.textContent = `${event.points.length} / 3 points`;
    this.ui.clipPointPositions.textContent =
      event.points.length === 0
        ? 'No clip points.'
        : event.points
            .map((point, index) => `${index + 1}: ${this.app.build.formatVector(point)}`)
            .join(' · ');
    this.refreshClipPreview();
  }

  public setClipMode(mode: BrushClipMode): void {
    this.state.clipMode = mode;
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-clip-mode]')) {
      const active = button.dataset.clipMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    this.refreshClipPreview();
  }

  public applyClip(): void {
    if (!this.state.clipCandidate) {
      this.ui.statusMessage.textContent =
        'Place a clip plane that affects the selected brushes first.';
      return;
    }
    try {
      const candidate = this.state.clipCandidate;
      this.state.clipCandidate = null;
      this.state.session.commitClipCandidate(candidate);
      this.state.renderer?.clearClipPlane();
      this.ui.statusMessage.textContent = `${candidate.label}. Document revision ${this.state.session.document.revision}.`;
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public readSimpleShapeKind(value: string): SimpleShapeKind {
    if (
      value === 'cuboid' ||
      value === 'stairs' ||
      value === 'arch' ||
      value === 'cylinder' ||
      value === 'cone' ||
      value === 'uv-sphere' ||
      value === 'ico-sphere'
    ) {
      return value;
    }
    throw new Error(`Unknown simple shape ${value}`);
  }

  public readCircleMode(value: string): CircleMode {
    if (value === 'edge-aligned' || value === 'vertex-aligned' || value === 'scalable') {
      return value;
    }
    throw new Error(`Unknown circle mode ${value}`);
  }

  public readStairDirection(value: string): StairDirection {
    if (
      value === 'positive-x' ||
      value === 'negative-x' ||
      value === 'positive-y' ||
      value === 'negative-y'
    ) {
      return value;
    }
    throw new Error(`Unknown stair direction ${value}`);
  }

  public readSimpleShapeOptions(): SimpleShapeOptions {
    const axis = Number(this.ui.simpleShapeAxis.value);
    if (axis !== 0 && axis !== 1 && axis !== 2) throw new Error('Simple-shape axis is invalid');
    const sides = Number(this.ui.simpleShapeSides.value);
    const rings = Number(this.ui.simpleShapeRings.value);
    const accuracy = Number(this.ui.simpleShapeAccuracy.value);
    const thickness = Number(this.ui.simpleShapeThickness.value);
    const stepHeight = Number(this.ui.simpleShapeStepHeight.value);
    if (![sides, rings, accuracy, thickness, stepHeight].every(Number.isFinite)) {
      throw new Error('Simple-shape controls must be finite');
    }
    return {
      kind: this.readSimpleShapeKind(this.ui.simpleShapeKind.value),
      axis,
      sides,
      circleMode: this.readCircleMode(this.ui.simpleShapeCircleMode.value),
      hollow: this.ui.simpleShapeHollow.checked,
      thickness,
      rings,
      accuracy,
      stepHeight,
      stairDirection: this.readStairDirection(this.ui.simpleShapeStairDirection.value),
    };
  }

  public simpleShapeLabel(kind: SimpleShapeKind): string {
    return kind === 'uv-sphere'
      ? 'UV spheroid'
      : kind === 'ico-sphere'
        ? 'icosphere spheroid'
        : kind;
  }

  public updateSimpleShapeFields(): void {
    const kind = this.readSimpleShapeKind(this.ui.simpleShapeKind.value);
    const circular =
      kind === 'arch' || kind === 'cylinder' || kind === 'cone' || kind === 'uv-sphere';
    this.ui.simpleShapeCircleFields.hidden = !circular;
    this.ui.simpleShapeHollowFields.hidden = kind !== 'arch' && kind !== 'cylinder';
    this.ui.simpleShapeUvFields.hidden = kind !== 'uv-sphere';
    this.ui.simpleShapeIcoFields.hidden = kind !== 'ico-sphere';
    this.ui.simpleShapeStairFields.hidden = kind !== 'stairs';
    this.ui.simpleShapeAxis.closest<HTMLElement>('label')!.hidden = !circular;
    this.ui.simpleShapeHollow.closest<HTMLElement>('label')!.hidden = kind === 'arch';
    this.ui.simpleShapeThickness.disabled =
      kind === 'cylinder' && !this.ui.simpleShapeHollow.checked;
    if (this.ui.simpleShapeCircleMode.value === 'scalable') {
      const sides = Number(this.ui.simpleShapeSides.value);
      if (![12, 24, 48, 96].includes(sides)) this.ui.simpleShapeSides.value = '12';
    }
    this.state.simpleShapeOptions = this.readSimpleShapeOptions();
    this.ui.simpleShapeResult.textContent = `${this.simpleShapeLabel(kind)} ready`;
  }

  public cloneSweepTransform(transform: SweepTransform): SweepTransform {
    return {
      translation: [...transform.translation] as [number, number, number],
      rotationDegrees: [...transform.rotationDegrees] as [number, number, number],
      scale: transform.scale,
    };
  }

  public initialSweepTransform(): SweepTransform {
    const primary = selectedFaceReferences(this.state.session.selection)[0];
    const brush = primary ? findBrush(this.state.session.document, primary.brushId) : null;
    const face =
      brush && primary
        ? deriveBrush(brush).faces.find((candidate) => candidate.faceId === primary.faceId)
        : null;
    const distance = this.state.activeGridSize * 4;
    return {
      translation: face
        ? [face.normal[0] * distance, face.normal[1] * distance, face.normal[2] * distance]
        : [0, 0, distance],
      rotationDegrees: [0, 0, 0],
      scale: 1,
    };
  }

  public syncSweepControls(): void {
    this.ui.sweepTranslateInputs.forEach((input, axis) => {
      input.value = String(this.state.sweepTransform.translation[axis]);
      input.step = String(this.state.activeGridSize);
    });
    this.ui.sweepRotateInputs.forEach((input, axis) => {
      input.value = String(this.state.sweepTransform.rotationDegrees[axis]);
    });
    this.ui.sweepScale.value = String(this.state.sweepTransform.scale);
    this.ui.sweepPath.value = this.state.sweepOptions.path;
    this.ui.sweepSegments.value = String(this.state.sweepOptions.segments);
    this.ui.sweepIterations.value = String(this.state.sweepOptions.iterations);
    this.ui.sweepSnap.checked = this.state.sweepOptions.snapToInteger;
  }

  public inputVec3(inputs: readonly HTMLInputElement[]): Vec3 {
    return [Number(inputs[0]?.value), Number(inputs[1]?.value), Number(inputs[2]?.value)];
  }

  public readSweepPath(value: string): SweepPath {
    if (value === 'straight' || value === 'arc' || value === 's-bend') return value;
    throw new Error(`Unknown Sweep path ${value}`);
  }

  public readSweepControls(): void {
    const translation = this.inputVec3(this.ui.sweepTranslateInputs);
    const rotationDegrees = this.inputVec3(this.ui.sweepRotateInputs);
    const scale = Number(this.ui.sweepScale.value);
    const segments = Number(this.ui.sweepSegments.value);
    const iterations = Number(this.ui.sweepIterations.value);
    if (![...translation, ...rotationDegrees, scale].every(Number.isFinite) || scale <= 0) {
      throw new Error('Sweep destination values must be finite and scale must be positive');
    }
    if (!Number.isInteger(segments) || segments < 1 || segments > 128) {
      throw new Error('Sweep segments must be an integer from 1 to 128');
    }
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 64) {
      throw new Error('Sweep iterations must be an integer from 1 to 64');
    }
    this.state.sweepTransform = { translation, rotationDegrees, scale };
    this.state.sweepOptions = {
      path: this.readSweepPath(this.ui.sweepPath.value),
      segments,
      iterations,
      snapToInteger: this.ui.sweepSnap.checked,
      textureLock: this.ui.textureLock.checked,
    };
  }

  public refreshSweepPreview(announce = true): void {
    if (this.state.activeTool !== 'sweep') return;
    const faces = selectedFaceReferences(this.state.session.selection);
    if (faces.length === 0) {
      this.state.sweepCandidate = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.state.renderer?.setSweepCaps([]);
      this.ui.applySweepButton.disabled = true;
      this.ui.sweepGeneratedCount.textContent = '0 brushes';
      if (announce)
        this.ui.statusMessage.textContent = 'Select one or more brush faces before sweeping.';
      return;
    }
    try {
      const candidate = this.state.session.createSweepCandidate(
        faces,
        this.state.sweepTransform,
        { ...this.state.sweepOptions, textureLock: this.ui.textureLock.checked },
        createSequentialIdFactory(`sweep-${this.state.sweepSequence + 1}`),
      );
      if (!candidate) throw new Error('Sweep did not produce a candidate');
      this.state.sweepCandidate = candidate;
      this.state.renderer?.setDocument(candidate.document, this.state.session.selection);
      this.state.renderer?.setSweepCaps(candidate.destinationCaps);
      this.ui.applySweepButton.disabled = false;
      this.ui.sweepGeneratedCount.textContent = `${candidate.insertions.length} ${candidate.insertions.length === 1 ? 'brush' : 'brushes'}`;
      this.app.inspector.updateInspector(candidate.document, this.state.session.selection);
      if (announce) {
        this.ui.statusMessage.textContent = `Sweep preview: ${faces.length} ${faces.length === 1 ? 'face' : 'faces'} → ${candidate.insertions.length} brushes. Move the destination cap or press Enter to apply.`;
      }
    } catch (error) {
      this.state.sweepCandidate = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.state.renderer?.setSweepCaps([]);
      this.ui.applySweepButton.disabled = true;
      this.ui.sweepGeneratedCount.textContent = 'invalid';
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      this.app.inspector.updateInspector();
    }
  }

  public resetSweep(markEscapeReset = false): void {
    this.state.sweepTransform = this.cloneSweepTransform(this.state.sweepDefaultTransform);
    this.state.sweepOptions = {
      path: 'straight',
      segments: 4,
      iterations: 1,
      snapToInteger: false,
      textureLock: this.ui.textureLock.checked,
    };
    this.state.sweepDragBase = null;
    this.state.sweepEscapeReset = markEscapeReset;
    this.syncSweepControls();
    this.refreshSweepPreview(false);
  }

  public applySweep(): void {
    if (!this.state.sweepCandidate) {
      this.ui.statusMessage.textContent = 'Create a valid Sweep preview first.';
      return;
    }
    try {
      const candidate = this.state.sweepCandidate;
      this.state.sweepCandidate = null;
      this.state.session.commitBatchCreationCandidate(candidate);
      this.state.sweepSequence += 1;
      this.state.renderer?.setSweepCaps([]);
      this.app.session.setEditorTool('select');
      this.ui.statusMessage.textContent = `${candidate.label}. Created ${candidate.insertions.length} brushes in one undoable step.`;
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public handleSweepDrag(event: EditorSweepDragEvent): void {
    if (event.phase === 'cancel') {
      if (this.state.sweepDragBase)
        this.state.sweepTransform = this.cloneSweepTransform(this.state.sweepDragBase);
      this.state.sweepDragBase = null;
      this.syncSweepControls();
      this.refreshSweepPreview(false);
      this.ui.statusMessage.textContent = 'Sweep destination adjustment cancelled.';
      return;
    }
    if (!this.state.sweepDragBase)
      this.state.sweepDragBase = this.cloneSweepTransform(this.state.sweepTransform);
    const base = this.state.sweepDragBase;
    if (event.mode === 'translate') {
      this.state.sweepTransform = {
        ...base,
        translation: base.translation.map((component, axis) => component + event.delta[axis]!) as [
          number,
          number,
          number,
        ],
      };
    } else if (event.mode === 'rotate') {
      const rotationDegrees = [...base.rotationDegrees] as [number, number, number];
      rotationDegrees[event.axis] += event.angleDegrees;
      this.state.sweepTransform = { ...base, rotationDegrees };
    } else {
      this.state.sweepTransform = {
        ...base,
        scale: Math.max(0.05, Math.min(20, base.scale * event.factor)),
      };
    }
    this.state.sweepEscapeReset = false;
    this.syncSweepControls();
    this.refreshSweepPreview(false);
    const detail =
      event.mode === 'translate'
        ? this.app.build.formatVector(event.delta)
        : event.mode === 'rotate'
          ? `${['X', 'Y', 'Z'][event.axis]} ${event.angleDegrees}°`
          : `×${event.factor}`;
    this.ui.cameraPointerContext.textContent = `PERSPECTIVE / sweep ${event.mode} ${detail}`;
    this.ui.statusMessage.textContent =
      event.phase === 'commit'
        ? `Sweep destination ${event.mode} set. Press Enter to generate the brushes.`
        : `Sweep ${event.mode} preview: ${detail}. Release to place the destination cap.`;
    if (event.phase === 'commit') this.state.sweepDragBase = null;
  }
}
