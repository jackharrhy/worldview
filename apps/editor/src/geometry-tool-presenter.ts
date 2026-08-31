import {
  createBrushSelection,
  createSequentialIdFactory,
  deriveBrush,
  findBrush,
  selectedBrushIds,
  selectedFaceReferences,
  type BrushClipMode,
  type SweepOptions,
  type SweepTransform,
  type EditorClipPlaneEvent,
  type EditorSweepDragEvent,
  type EditorSelection,
  type EditorTool,
  type MapDocument,
  type SimpleShapeKind,
  type SimpleShapeOptions,
} from '@jackharrhy/worldview-editor';

import type { EditorShellState } from './editor-shell-state.js';
import type { EditorStatePort } from './editor-state-port.js';

type GeometryToolUi = Pick<
  EditorShellState,
  'objectTools' | 'pointerContext' | 'simpleShapeTool' | 'statusMessage' | 'sweepTool'
>;

type GeometryToolState = EditorStatePort<
  | 'activeGridSize'
  | 'activeMaterialName'
  | 'activeTool'
  | 'clipCandidate'
  | 'clipMode'
  | 'clipPlanePoints'
  | 'clipSequence'
  | 'csgSequence'
  | 'faceSplitSequence'
  | 'faceStampSequence'
  | 'renderer'
  | 'session'
  | 'simpleShapeOptions'
  | 'sweepCandidate'
  | 'sweepDefaultTransform'
  | 'sweepDragBase'
  | 'sweepEscapeReset'
  | 'sweepOptions'
  | 'sweepSequence'
  | 'sweepTransform'
  | 'textureLock'
  | 'topologyCandidate'
  | 'topologySelectedVertices'
  | 'topologySelectionCount'
  | 'topologySequence',
  | 'clipCandidate'
  | 'clipMode'
  | 'clipPlanePoints'
  | 'clipSequence'
  | 'csgSequence'
  | 'faceSplitSequence'
  | 'faceStampSequence'
  | 'simpleShapeOptions'
  | 'sweepCandidate'
  | 'sweepDragBase'
  | 'sweepEscapeReset'
  | 'sweepOptions'
  | 'sweepSequence'
  | 'sweepTransform'
  | 'topologyCandidate'
  | 'topologySequence'
>;

export class GeometryToolPresenter {
  public constructor(
    private readonly state: GeometryToolState,
    private readonly ui: GeometryToolUi,
    private readonly isTopologyTool: (tool: EditorTool) => boolean,
    private readonly updateInspector: (
      document?: MapDocument,
      selection?: EditorSelection | null,
    ) => void,
    private readonly formatVector: (value: readonly number[]) => string,
    private readonly setEditorTool: (tool: EditorTool) => void,
  ) {
    this.ui.simpleShapeTool.bind({
      updateOptions: (update) => this.updateSimpleShapeOptions(update),
    });
    this.ui.sweepTool.bind({
      setTransform: (transform) => this.updateSweepInput(() => this.setSweepTransform(transform)),
      setOptions: (update) => this.updateSweepInput(() => this.setSweepOptions(update)),
      reset: () => {
        this.resetSweep(true);
        this.ui.statusMessage.set('Sweep destination and path controls reset.');
      },
      apply: () => this.applySweep(),
    });
    this.updateSimpleShapeFields();
    this.syncSweepControls();
  }

  public dispose(): void {
    this.ui.simpleShapeTool.unbind();
    this.ui.sweepTool.unbind();
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
        this.ui.statusMessage.set(
          operation === 'merge' || operation === 'intersect'
            ? 'Select at least two brushes for this CSG operation.'
            : 'Select one or more brushes for this CSG operation.',
        );
        return;
      }
      this.ui.statusMessage.set(
        operation === 'hollow'
          ? `Hollowed selection with ${this.state.activeGridSize}-unit walls.`
          : `CSG ${operation} committed as one undo step.`,
      );
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  public deleteTopologySelection(): void {
    if (
      !this.isTopologyTool(this.state.activeTool) ||
      this.state.topologySelectedVertices.length === 0
    ) {
      this.ui.statusMessage.set(
        `Select ${this.state.activeTool === 'edge' ? 'edge' : 'vertex'} handles before deleting.`,
      );
      return;
    }
    try {
      const changed = this.state.session.deleteSelectedVertices(
        this.state.topologySelectedVertices,
        createSequentialIdFactory(`topology-delete-${this.state.topologySequence + 1}`),
        this.state.textureLock,
      );
      if (!changed) return;
      this.state.topologySequence += 1;
      this.state.topologyCandidate = null;
      this.state.renderer?.clearTopologySelection();
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  public clearActiveHandleSelection(): boolean {
    if (
      this.isTopologyTool(this.state.activeTool) &&
      this.state.topologySelectedVertices.length > 0
    ) {
      const count = this.state.topologySelectionCount;
      this.state.topologyCandidate = null;
      this.state.renderer?.clearTopologySelection();
      this.ui.statusMessage.set(
        `Cleared ${count} selected ${this.state.activeTool} ${count === 1 ? 'handle' : 'handles'}. Press Escape again to leave the tool.`,
      );
      return true;
    }
    if (this.state.activeTool !== 'face') return false;
    const faces = selectedFaceReferences(this.state.session.selection);
    if (faces.length === 0) return false;
    const brushIds = [...new Set(faces.map((face) => face.brushId))];
    this.state.session.select(
      createBrushSelection(brushIds, this.state.session.selection?.brushId ?? null),
    );
    this.ui.statusMessage.set(
      `Cleared ${faces.length} selected face ${faces.length === 1 ? 'handle' : 'handles'}. Press Escape again to leave the tool.`,
    );
    return true;
  }

  public extrudeSelectedFaceBy(distance: number): void {
    if (!Number.isFinite(distance) || Math.abs(distance) <= Number.EPSILON) {
      this.ui.statusMessage.set('Enter a non-zero face extrusion distance.');
      return;
    }
    try {
      if (!this.state.session.extrudeSelectedFace(distance)) {
        this.ui.statusMessage.set('Select a face before extruding.');
      }
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  public splitSelectedFaceBy(distance: number): void {
    if (!Number.isFinite(distance) || Math.abs(distance) <= Number.EPSILON) {
      this.ui.statusMessage.set('Enter a non-zero face split distance.');
      return;
    }
    try {
      const changed = this.state.session.splitSelectedFace(
        distance,
        createSequentialIdFactory(`face-split-${this.state.faceSplitSequence + 1}`),
      );
      if (!changed) {
        this.ui.statusMessage.set('Select an extrudable face before splitting.');
        return;
      }
      this.state.faceSplitSequence += 1;
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  public stampSelectedFaceBy(distance: number): void {
    if (!Number.isFinite(distance) || Math.abs(distance) <= Number.EPSILON) {
      this.ui.statusMessage.set('Enter a non-zero face stamp distance.');
      return;
    }
    try {
      const changed = this.state.session.stampSelectedFace(
        distance,
        createSequentialIdFactory(`face-stamp-${this.state.faceStampSequence + 1}`),
        this.state.textureLock,
      );
      if (!changed) {
        this.ui.statusMessage.set('Select a stampable face first.');
        return;
      }
      this.state.faceStampSequence += 1;
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  public refreshClipPreview(): void {
    this.state.clipCandidate = null;
    const clip = this.ui.objectTools.getSnapshot().clip;
    this.ui.objectTools.update({ clip: { ...clip, canApply: false } });
    if (this.state.activeTool !== 'clip' || !this.state.clipPlanePoints) {
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.updateInspector();
      return;
    }
    const selection = this.state.session.selection;
    if (!selection || selection.faceId) {
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.updateInspector();
      this.ui.statusMessage.set('Select one or more brushes before defining a clip plane.');
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
        this.updateInspector();
        this.ui.statusMessage.set(
          'The clip plane does not affect the selected brushes in this mode.',
        );
        return;
      }
      this.state.clipCandidate = candidate;
      this.ui.objectTools.update({
        clip: { ...this.ui.objectTools.getSnapshot().clip, canApply: true },
      });
      this.state.renderer?.setDocument(candidate.document, this.state.session.selection);
      this.updateInspector(candidate.document, this.state.session.selection);
      this.ui.statusMessage.set(
        `${this.state.clipMode === 'split' ? 'Split' : 'Clip'} preview ready. Press Enter or Apply clip to commit.`,
      );
    } catch (error) {
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.updateInspector();
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  public handleClipPlaneChange(event: EditorClipPlaneEvent): void {
    this.state.clipPlanePoints = event.planePoints;
    this.ui.objectTools.update({
      clip: {
        ...this.ui.objectTools.getSnapshot().clip,
        pointCountLabel: `${event.points.length} / 3 points`,
        pointPositions:
          event.points.length === 0
            ? 'No clip points.'
            : event.points
                .map((point, index) => `${index + 1}: ${this.formatVector(point)}`)
                .join(' · '),
      },
    });
    this.refreshClipPreview();
  }

  public setClipMode(mode: BrushClipMode): void {
    this.state.clipMode = mode;
    this.ui.objectTools.update({
      clip: { ...this.ui.objectTools.getSnapshot().clip, mode },
    });
    this.refreshClipPreview();
  }

  public applyClip(): void {
    if (!this.state.clipCandidate) {
      this.ui.statusMessage.set('Place a clip plane that affects the selected brushes first.');
      return;
    }
    try {
      const candidate = this.state.clipCandidate;
      this.state.clipCandidate = null;
      this.state.session.commitClipCandidate(candidate);
      this.state.renderer?.clearClipPlane();
      this.ui.statusMessage.set(
        `${candidate.label}. Document revision ${this.state.session.document.revision}.`,
      );
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  public simpleShapeLabel(kind: SimpleShapeKind): string {
    return kind === 'uv-sphere'
      ? 'UV spheroid'
      : kind === 'ico-sphere'
        ? 'icosphere spheroid'
        : kind;
  }

  public updateSimpleShapeOptions(update: Partial<SimpleShapeOptions>): void {
    try {
      const next = { ...this.state.simpleShapeOptions, ...update };
      if (next.axis !== 0 && next.axis !== 1 && next.axis !== 2) {
        throw new Error('Simple-shape axis is invalid');
      }
      this.assertIntegerRange(next.sides, 3, 96, 'Simple-shape sides');
      this.assertIntegerRange(next.rings, 1, 32, 'Simple-shape rings');
      this.assertIntegerRange(next.accuracy, 1, 3, 'Simple-shape accuracy');
      if (!Number.isFinite(next.thickness) || next.thickness < 1 || next.thickness > 1024) {
        throw new Error('Simple-shape thickness must be from 1 to 1024');
      }
      if (!Number.isFinite(next.stepHeight) || next.stepHeight < 1 || next.stepHeight > 1024) {
        throw new Error('Simple-shape step height must be from 1 to 1024');
      }
      this.state.simpleShapeOptions =
        next.circleMode === 'scalable' && ![12, 24, 48, 96].includes(next.sides)
          ? { ...next, sides: 12 }
          : next;
      this.updateSimpleShapeFields();
      if (this.state.activeTool === 'create') {
        this.ui.statusMessage.set(
          `${this.simpleShapeLabel(this.state.simpleShapeOptions.kind)} selected. Drag a bounding box in any viewport.`,
        );
      }
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
      this.updateSimpleShapeFields();
    }
  }

  public updateSimpleShapeFields(): void {
    const options = { ...this.state.simpleShapeOptions };
    this.ui.simpleShapeTool.update({
      options,
      result: `${this.simpleShapeLabel(options.kind)} ready`,
    });
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
    this.ui.sweepTool.update({
      transform: this.cloneSweepTransform(this.state.sweepTransform),
      options: { ...this.state.sweepOptions, textureLock: this.state.textureLock },
      gridSize: this.state.activeGridSize,
    });
  }

  private updateSweepInput(update: () => void): void {
    try {
      update();
    } catch (error) {
      this.syncSweepControls();
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  private setSweepTransform(transform: SweepTransform): void {
    if (
      ![...transform.translation, ...transform.rotationDegrees, transform.scale].every(
        Number.isFinite,
      ) ||
      transform.scale <= 0 ||
      transform.scale > 20
    ) {
      throw new Error('Sweep destination values must be finite and scale must be positive');
    }
    this.state.sweepTransform = this.cloneSweepTransform(transform);
    this.state.sweepEscapeReset = false;
    this.syncSweepControls();
    this.refreshSweepPreview();
  }

  private setSweepOptions(update: Partial<SweepOptions>): void {
    const next = { ...this.state.sweepOptions, ...update, textureLock: this.state.textureLock };
    this.assertIntegerRange(next.segments, 1, 128, 'Sweep segments');
    this.assertIntegerRange(next.iterations, 1, 64, 'Sweep iterations');
    this.state.sweepOptions = {
      ...next,
    };
    this.state.sweepEscapeReset = false;
    this.syncSweepControls();
    this.refreshSweepPreview();
  }

  private assertIntegerRange(value: number, minimum: number, maximum: number, label: string): void {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
    }
  }

  public refreshSweepPreview(announce = true): void {
    if (this.state.activeTool !== 'sweep') return;
    const faces = selectedFaceReferences(this.state.session.selection);
    if (faces.length === 0) {
      this.state.sweepCandidate = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.state.renderer?.setSweepCaps([]);
      this.ui.sweepTool.update({ canApply: false, generatedLabel: '0 brushes' });
      if (announce) this.ui.statusMessage.set('Select one or more brush faces before sweeping.');
      return;
    }
    try {
      const candidate = this.state.session.createSweepCandidate(
        faces,
        this.state.sweepTransform,
        { ...this.state.sweepOptions, textureLock: this.state.textureLock },
        createSequentialIdFactory(`sweep-${this.state.sweepSequence + 1}`),
      );
      if (!candidate) throw new Error('Sweep did not produce a candidate');
      this.state.sweepCandidate = candidate;
      this.state.renderer?.setDocument(candidate.document, this.state.session.selection);
      this.state.renderer?.setSweepCaps(candidate.destinationCaps);
      this.ui.sweepTool.update({
        canApply: true,
        generatedLabel: `${candidate.insertions.length} ${candidate.insertions.length === 1 ? 'brush' : 'brushes'}`,
      });
      this.updateInspector(candidate.document, this.state.session.selection);
      if (announce) {
        this.ui.statusMessage.set(
          `Sweep preview: ${faces.length} ${faces.length === 1 ? 'face' : 'faces'} → ${candidate.insertions.length} brushes. Move the destination cap or press Enter to apply.`,
        );
      }
    } catch (error) {
      this.state.sweepCandidate = null;
      this.state.renderer?.setDocument(this.state.session.document, this.state.session.selection);
      this.state.renderer?.setSweepCaps([]);
      this.ui.sweepTool.update({ canApply: false, generatedLabel: 'invalid' });
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
      this.updateInspector();
    }
  }

  public resetSweep(markEscapeReset = false): void {
    this.state.sweepTransform = this.cloneSweepTransform(this.state.sweepDefaultTransform);
    this.state.sweepOptions = {
      path: 'straight',
      segments: 4,
      iterations: 1,
      snapToInteger: false,
      textureLock: this.state.textureLock,
    };
    this.state.sweepDragBase = null;
    this.state.sweepEscapeReset = markEscapeReset;
    this.syncSweepControls();
    this.refreshSweepPreview(false);
  }

  public applySweep(): void {
    if (!this.state.sweepCandidate) {
      this.ui.statusMessage.set('Create a valid Sweep preview first.');
      return;
    }
    try {
      const candidate = this.state.sweepCandidate;
      this.state.sweepCandidate = null;
      this.state.session.commitBatchCreationCandidate(candidate);
      this.state.sweepSequence += 1;
      this.state.renderer?.setSweepCaps([]);
      this.setEditorTool('select');
      this.ui.statusMessage.set(
        `${candidate.label}. Created ${candidate.insertions.length} brushes in one undoable step.`,
      );
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  public handleSweepDrag(event: EditorSweepDragEvent): void {
    if (event.phase === 'cancel') {
      if (this.state.sweepDragBase)
        this.state.sweepTransform = this.cloneSweepTransform(this.state.sweepDragBase);
      this.state.sweepDragBase = null;
      this.syncSweepControls();
      this.refreshSweepPreview(false);
      this.ui.statusMessage.set('Sweep destination adjustment cancelled.');
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
        ? this.formatVector(event.delta)
        : event.mode === 'rotate'
          ? `${['X', 'Y', 'Z'][event.axis]} ${event.angleDegrees}°`
          : `×${event.factor}`;
    this.ui.pointerContext.set(`PERSPECTIVE / sweep ${event.mode} ${detail}`);
    this.ui.statusMessage.set(
      event.phase === 'commit'
        ? `Sweep destination ${event.mode} set. Press Enter to generate the brushes.`
        : `Sweep ${event.mode} preview: ${detail}. Release to place the destination cap.`,
    );
    if (event.phase === 'commit') this.state.sweepDragBase = null;
  }
}
