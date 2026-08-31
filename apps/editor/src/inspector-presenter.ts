import {
  brushesInDocument,
  deriveBrush,
  deriveEditorGroups,
  decodeSurfaceFlags,
  findBrush,
  isEditorGroupEntity,
  isEditorLayerEntity,
  linkedGroupSiblings,
  matchingBrushFaces,
  pointEntityBounds,
  selectedBrushIds,
  selectedEditorGroup,
  selectedFaceReferences,
  selectedPointEntityIds,
  worldviewGameProfile,
  type EditorObjectViewState,
  type EditorSelection,
  type EditorTool,
  type SurfaceFlagDefinition,
  type MapDocument,
  type Vec3,
} from '@jackharrhy/worldview-editor';

import type { EditorShellState } from './editor-shell-state.js';
import type { EditorStatePort } from './editor-state-port.js';

type InspectorUi = Pick<
  EditorShellState,
  | 'documentSummary'
  | 'editorCommands'
  | 'faceInspector'
  | 'objectTools'
  | 'pointEntityTool'
  | 'selectionInspector'
  | 'simpleShapeTool'
  | 'statusMessage'
  | 'surfaceInspector'
  | 'sweepTool'
>;

type InspectorState = EditorStatePort<
  | 'activeGameProfile'
  | 'activeGridSize'
  | 'activeTool'
  | 'clipCandidate'
  | 'clipMode'
  | 'hullBuildPoints'
  | 'hullCandidate'
  | 'lastPointerPosition'
  | 'materialCatalog'
  | 'openGroupId'
  | 'renderer'
  | 'session'
  | 'sweepCandidate'
  | 'topologySelectedVertices'
  | 'topologySelectionCount'
  | 'topologySelectionKind'
  | 'transformPivot'
  | 'transformPivotSelectionKey'
  | 'uvEditor',
  'transformPivot' | 'transformPivotSelectionKey'
>;

interface InspectorOrganizationView {
  effectiveObjectViewState(document?: MapDocument): EditorObjectViewState;
  renderIssues(): void;
  renderLayers(document?: MapDocument, selection?: EditorSelection | null): void;
  renderViewFilters(): void;
  updateEntityLinkSummary(document?: MapDocument, selection?: EditorSelection | null): void;
}

interface InspectorEntityView {
  renderEntityProperties(
    document: MapDocument,
    selection: EditorSelection | null,
    visible?: boolean,
  ): void;
}

interface SelectionBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

interface InspectorTransformView {
  isTopologyTool(tool: EditorTool): tool is 'vertex' | 'edge';
  isTransformTool(tool: EditorTool): tool is 'rotate' | 'scale' | 'shear';
  selectedObjectBounds(document?: MapDocument): SelectionBounds | null;
  selectedTransformBounds(document?: MapDocument): SelectionBounds | null;
  selectedTransformKey(selection?: EditorSelection | null): string | null;
}

function unknownSurfaceBitsLabel(
  values: readonly number[],
  definitions: readonly SurfaceFlagDefinition[],
): string {
  const unknown = new Set(
    values.map((value) => decodeSurfaceFlags(value, definitions).unknownBits),
  );
  if (unknown.size > 1) return 'mixed';
  const value = [...unknown][0] ?? 0;
  return value === 0 ? '' : `0x${value.toString(16)}`;
}

export class InspectorPresenter {
  public constructor(
    private readonly state: InspectorState,
    private readonly ui: InspectorUi,
    private readonly organization: InspectorOrganizationView,
    private readonly entity: InspectorEntityView,
    private readonly transform: InspectorTransformView,
    private readonly formatVector: (value: readonly number[]) => string,
  ) {
    this.ui.surfaceInspector.bind({
      setFlag: (field, mask, enabled) => {
        if (this.state.session.setSelectedSurfaceFlag(field, mask, enabled)) {
          this.updateInspector();
        }
      },
      setValue: (value) => {
        try {
          if (this.state.session.setSelectedSurfaceValue(value)) this.updateInspector();
        } catch (error) {
          this.ui.statusMessage.setError(error instanceof Error ? error.message : String(error));
        }
      },
    });
    this.ui.faceInspector.bind({
      setProjectionField: (field, value) => {
        try {
          if (!this.state.session.setSelectedTextureProjectionField(field, value)) {
            this.ui.statusMessage.set('Select one or more faces before editing projection.');
          }
        } catch (error) {
          this.ui.statusMessage.setError(error instanceof Error ? error.message : String(error));
        }
      },
      align: (operation, options) => {
        try {
          if (
            !this.state.session.alignTexture(operation, {
              direction: options?.reverse ? -1 : 1,
              fitMode: options?.subdivide ? 'subdivide' : 'repeat',
              textureSizeForMaterial: (materialToken) => {
                const material = this.state.materialCatalog.find(materialToken);
                return material ? [material.width, material.height] : null;
              },
            })
          ) {
            this.ui.statusMessage.set('Select a brush or face before aligning its texture.');
          }
        } catch (error) {
          this.ui.statusMessage.setError(error instanceof Error ? error.message : String(error));
        }
      },
      resetUvPivot: () => this.state.uvEditor.resetPivot(),
      frameUvSelection: () => this.state.uvEditor.frameSelection(),
      setUvGrid: (axis, subdivisions) => {
        this.state.uvEditor.setGridSubdivisions(axis, subdivisions);
        this.ui.faceInspector.update({ uvGrid: this.state.uvEditor.getGridSubdivisions() });
      },
    });
  }

  public dispose(): void {
    this.ui.surfaceInspector.unbind();
    this.ui.faceInspector.unbind();
  }

  private commonNumber(values: readonly number[]): number | null {
    const first = values[0];
    return first !== undefined && values.every((value) => value === first) ? first : null;
  }

  public updateFaceInspector(
    document: MapDocument = this.state.session.document,
    selection = this.state.session.selection,
  ): void {
    const selectedFaces = selectedFaceReferences(selection).flatMap((reference) => {
      const owner = findBrush(document, reference.brushId);
      const face = owner?.faces.find((candidate) => candidate.id === reference.faceId);
      return owner && face ? [{ reference, face, owner }] : [];
    });
    const primary =
      selectedFaces.find(
        ({ reference }) =>
          reference.brushId === selection?.brushId && reference.faceId === selection?.faceId,
      ) ?? selectedFaces[0];
    const selectedBrush = selection?.brushId ? findBrush(document, selection.brushId) : null;
    const materialNames = new Set(selectedFaces.map(({ face }) => face.material));
    const primaryMaterial = primary ? this.state.materialCatalog.find(primary.face.material) : null;
    const offsetU = this.commonNumber(selectedFaces.map(({ face }) => face.projection.offset[0]));
    const offsetV = this.commonNumber(selectedFaces.map(({ face }) => face.projection.offset[1]));
    const scaleU = this.commonNumber(selectedFaces.map(({ face }) => face.projection.scale[0]));
    const scaleV = this.commonNumber(selectedFaces.map(({ face }) => face.projection.scale[1]));
    const rotation = this.commonNumber(
      selectedFaces.map(({ face }) => face.projection.rotationDegrees),
    );
    const previousStatus = this.ui.faceInspector.getSnapshot().uvStatus;
    this.ui.faceInspector.set({
      mode:
        selectedFaces.length === 0 ? 'none' : selectedFaces.length === 1 ? 'single' : 'multiple',
      selectedFaceCount: selectedFaces.length,
      material:
        materialNames.size === 1 ? (selectedFaces[0]?.face.material ?? '') : 'Mixed materials',
      materialMixed: materialNames.size > 1,
      materialSize: primaryMaterial ? [primaryMaterial.width, primaryMaterial.height] : null,
      offset: [offsetU, offsetV],
      scale: [scaleU, scaleV],
      rotationDegrees: rotation,
      uAxis: primary ? this.formatVector(primary.face.projection.uAxis) : '',
      vAxis: primary ? this.formatVector(primary.face.projection.vAxis) : '',
      canEditProjection: selectedFaces.length > 0,
      canAlign: Boolean(selectedBrush),
      uvStatus: previousStatus,
      uvGrid: this.state.uvEditor.getGridSubdivisions(),
    });
    if (selectedFaces.length !== 1 || !primary) {
      this.state.uvEditor.setFace(null);
      return;
    }
    const derivedFace = deriveBrush(primary.owner).faces.find(
      (candidate) => candidate.faceId === primary.face.id,
    );
    this.state.uvEditor.setFace(
      derivedFace
        ? {
            selection: primary.reference,
            face: primary.face,
            vertices: derivedFace.vertices,
            selectedFaceCount: 1,
            material: primaryMaterial,
          }
        : null,
    );
  }

  private surfaceFlagControls(
    definitions: readonly SurfaceFlagDefinition[],
    values: readonly number[],
  ) {
    return definitions.map((definition) => {
      const selected = values.filter(
        (value) => ((value >>> 0) & definition.value) === definition.value,
      ).length;
      return {
        ...definition,
        checked: selected === values.length,
        mixed: selected > 0 && selected < values.length,
      };
    });
  }

  public updateInspector(
    document: MapDocument = this.state.session.document,
    selection = this.state.session.selection,
  ): void {
    let presentationCheckpoint = performance.now();
    const measurePresentationStep = (name: string) => {
      const end = performance.now();
      performance.measure(`worldview.editor.inspector.${name}`, {
        start: presentationCheckpoint,
        end,
      });
      presentationCheckpoint = end;
    };
    const brushes = brushesInDocument(document);
    let geometryErrorCount = 0;
    for (const brush of brushes) {
      for (const diagnostic of deriveBrush(brush).diagnostics) {
        if (diagnostic.severity === 'error') geometryErrorCount += 1;
      }
    }
    measurePresentationStep('geometry');
    const groups = deriveEditorGroups(document);
    this.organization.renderIssues();
    measurePresentationStep('issues');
    this.organization.renderViewFilters();
    measurePresentationStep('filters');
    const objectViewState = this.organization.effectiveObjectViewState(document);
    measurePresentationStep('view-state');
    this.ui.documentSummary.set({
      revision: document.revision,
      entityCount: document.entities.filter(
        (entity) => !isEditorGroupEntity(entity) && !isEditorLayerEntity(entity),
      ).length,
      brushCount: brushes.length,
      groupCount: groups.length,
      hiddenObjectCount:
        objectViewState.hiddenBrushIds.length + objectViewState.hiddenEntityIds.length,
      lockedObjectCount:
        objectViewState.lockedBrushIds.length + objectViewState.lockedEntityIds.length,
      geometryErrorCount,
    });
    this.organization.renderLayers(document, selection);
    this.organization.updateEntityLinkSummary(document, selection);
    measurePresentationStep('organization');
    const repeatLabels = this.state.session.repeatCommandLabels;
    this.ui.editorCommands.updateActions({
      undo: {
        disabled: !this.state.session.canUndo,
        title: this.state.session.undoLabel
          ? `Undo ${this.state.session.undoLabel}`
          : 'Nothing to undo',
      },
      redo: {
        disabled: !this.state.session.canRedo,
        title: this.state.session.redoLabel
          ? `Redo ${this.state.session.redoLabel}`
          : 'Nothing to redo',
      },
      'repeat-commands': {
        disabled: !this.state.session.canRepeatCommands,
        label: repeatLabels.length > 0 ? `Repeat ${repeatLabels.length}` : 'Repeat',
        title:
          repeatLabels.length > 0
            ? `Repeat ${repeatLabels.join(' → ')} (Ctrl/Command+Shift+R)`
            : 'Record duplicate, move, rotate, flip, scale, or shear commands first',
      },
      'clear-repeat-commands': {
        disabled: repeatLabels.length === 0,
        title:
          repeatLabels.length > 0
            ? `Clear ${repeatLabels.join(' → ')} and start a new sequence`
            : 'No recorded command sequence',
      },
    });
    this.ui.simpleShapeTool.update({
      visible:
        this.state.activeTool === 'create' || (this.state.activeTool === 'select' && !selection),
    });
    this.ui.pointEntityTool.update({ visible: this.state.activeTool === 'entity' });

    const objectBrushIds = selection?.faceId
      ? [...new Set(selectedFaceReferences(selection).map((reference) => reference.brushId))]
      : selectedBrushIds(selection);
    const objectBrushes = objectBrushIds.flatMap((selectedBrushId) => {
      const candidate = findBrush(document, selectedBrushId);
      return candidate ? [candidate] : [];
    });
    const objectEntityIds = selectedPointEntityIds(selection);
    const pointEntity = selection?.entityId
      ? (document.entities.find((entity) => entity.id === selection.entityId) ?? null)
      : null;
    const brush = selection?.brushId ? findBrush(document, selection.brushId) : null;
    const selectedFaces = selectedFaceReferences(selection).flatMap((reference) => {
      const owner = findBrush(document, reference.brushId);
      const face = owner?.faces.find((candidate) => candidate.id === reference.faceId);
      return face ? [{ reference, face }] : [];
    });
    this.updateFaceInspector(document, selection);
    const surfaceSemantics = worldviewGameProfile(this.state.activeGameProfile).surfaceSemantics;
    if (!surfaceSemantics || selectedFaces.length === 0) {
      this.ui.surfaceInspector.set({
        visible: false,
        contents: [],
        flags: [],
        unknownContents: '',
        unknownFlags: '',
        value: '',
        valueMixed: false,
        valueLabel: 'Value',
      });
    } else {
      const contentsValues = selectedFaces.map(({ face }) => face.surface.contents ?? 0);
      const flagValues = selectedFaces.map(({ face }) => face.surface.flags ?? 0);
      const values = selectedFaces.map(({ face }) => face.surface.value ?? 0);
      const distinctValues = new Set(values);
      this.ui.surfaceInspector.set({
        visible: true,
        contents: this.surfaceFlagControls(surfaceSemantics.contents, contentsValues),
        flags: this.surfaceFlagControls(surfaceSemantics.flags, flagValues),
        unknownContents: unknownSurfaceBitsLabel(contentsValues, surfaceSemantics.contents),
        unknownFlags: unknownSurfaceBitsLabel(flagValues, surfaceSemantics.flags),
        value: distinctValues.size === 1 ? String(values[0] ?? 0) : '',
        valueMixed: distinctValues.size > 1,
        valueLabel: surfaceSemantics.valueLabel,
      });
    }
    const objectSelected = Boolean(
      selectedFaces.length === 0 && objectBrushIds.length + objectEntityIds.length > 0,
    );
    const selectedGroup = selectedEditorGroup(document, selection);
    const openGroup = groups.find((group) => group.id === this.state.openGroupId) ?? null;
    const presentedGroup = selectedGroup ?? openGroup;
    const linkedCopies = presentedGroup
      ? linkedGroupSiblings(document, presentedGroup.id).length
      : 0;
    const groupStateLabel = openGroup
      ? openGroup.linkedGroupId
        ? `Editing linked · ${linkedCopies} copies`
        : `Editing ${openGroup.name}`
      : selectedGroup
        ? selectedGroup.linkedGroupId
          ? `Linked · ${linkedCopies} copies`
          : `${selectedGroup.brushIds.length + selectedGroup.pointEntityIds.length} objects`
        : 'Selection';
    const brushObjectSelected = Boolean(brush && selectedFaces.length === 0 && !selectedGroup);
    const selectionBrushOwners = objectBrushIds.flatMap((selectedBrushId) => {
      const owner = document.entities.find((entity) =>
        entity.primitives.some((candidate) => candidate.id === selectedBrushId),
      );
      return owner ? [owner] : [];
    });
    const selectionBrushEligible = Boolean(
      brushObjectSelected &&
      objectEntityIds.length === 0 &&
      !selection?.groupId &&
      selectionBrushOwners.length === objectBrushIds.length &&
      selectionBrushOwners.every(
        (owner) =>
          owner.properties.classname === 'worldspawn' ||
          isEditorGroupEntity(owner) ||
          isEditorLayerEntity(owner),
      ),
    );
    const primaryBrushOwner = selection?.brushId
      ? document.entities.find((entity) =>
          entity.primitives.some((candidate) => candidate.id === selection.brushId),
        )
      : null;
    this.entity.renderEntityProperties(
      document,
      selection,
      !selectedGroup && !(primaryBrushOwner && isEditorGroupEntity(primaryBrushOwner)),
    );
    this.ui.editorCommands.updateActions({
      duplicate: { disabled: !objectSelected },
      copy: {
        disabled: !objectSelected && selectedFaces.length === 0,
        title:
          selectedFaces.length > 0
            ? 'Copy the primary face material and attributes (Ctrl/Command+C)'
            : 'Copy selected objects as map text (Ctrl/Command+C)',
      },
      paste: { disabled: !this.state.lastPointerPosition },
      delete: { disabled: !objectSelected },
      'focus-selection': { disabled: !selection },
      'snap-selection-to-grid': { disabled: !brush },
      'hide-selection': { disabled: !objectSelected },
      'isolate-selection': { disabled: !objectSelected },
      'show-all': { disabled: !this.state.session.canShowAll },
      'lock-selection': { disabled: !objectSelected },
      'unlock-all': { disabled: !this.state.session.canUnlockAll },
    });
    const face =
      brush && selection?.faceId
        ? brush.faces.find((candidate) => candidate.id === selection.faceId)
        : undefined;
    const faceSelectionKeys = new Set(
      selectedFaces.map(({ reference }) => `${reference.brushId}\u0000${reference.faceId}`),
    );
    const matchingFaces = selection?.faceId
      ? matchingBrushFaces(
          document,
          { brushId: selection.brushId, faceId: selection.faceId },
          selectedFaces.map(({ reference }) => reference.brushId),
        )
      : [];
    const faceSetExtrudable =
      faceSelectionKeys.size > 0 &&
      matchingFaces.length === faceSelectionKeys.size &&
      matchingFaces.every((candidate) =>
        faceSelectionKeys.has(`${candidate.brushId}\u0000${candidate.faceId}`),
      );
    const selectionKind = selectedGroup
      ? selectedGroup.linkedGroupId
        ? 'Linked Group'
        : 'Group'
      : selectedFaces.length > 1
        ? `${selectedFaces.length} Faces`
        : face
          ? 'Face'
          : brush
            ? objectEntityIds.length > 0
              ? `${objectBrushIds.length + objectEntityIds.length} Objects`
              : objectBrushIds.length > 1
                ? `${objectBrushIds.length} Brushes`
                : 'Brush'
            : pointEntity
              ? objectBrushIds.length > 0
                ? `${objectBrushIds.length + objectEntityIds.length} Objects`
                : objectEntityIds.length > 1
                  ? `${objectEntityIds.length} Entities`
                  : 'Entity'
              : 'None';
    this.ui.selectionInspector.update({
      kind: selectionKind,
      visible: Boolean(brush || pointEntity),
    });
    this.ui.sweepTool.update({
      visible: this.state.activeTool === 'sweep' && selectedFaces.length > 0,
      canApply: Boolean(this.state.sweepCandidate),
      generatedLabel: this.state.sweepCandidate
        ? `${this.state.sweepCandidate.insertions.length} ${this.state.sweepCandidate.insertions.length === 1 ? 'brush' : 'brushes'}`
        : '0 brushes',
    });
    const transformActive = this.transform.isTransformTool(this.state.activeTool);
    const topologyActive = this.transform.isTopologyTool(this.state.activeTool);
    const transformSelectionSupported = transformActive && objectSelected;
    const worldspawn = document.entities.find(
      (entity) => entity.properties.classname?.toLowerCase() === 'worldspawn',
    );
    const selectedBrushOwners = objectBrushIds.flatMap((selectedBrushId) => {
      const owner = document.entities.find((entity) =>
        entity.primitives.some((candidate) => candidate.id === selectedBrushId),
      );
      return owner ? [owner] : [];
    });
    const canMakeStructural = !(
      !brushObjectSelected ||
      !worldspawn ||
      selectedBrushOwners.every((owner) => owner.id === worldspawn.id)
    );
    let transformTitle = 'Transform';
    let transformHelp = 'Drag the viewport handle for a live snapped preview.';
    if (transformSelectionSupported) {
      const selectionKey = this.transform.selectedTransformKey(selection);
      const selectionBounds = this.transform.selectedTransformBounds(document);
      if (
        selectionBounds &&
        (!this.state.transformPivot || this.state.transformPivotSelectionKey !== selectionKey)
      ) {
        this.state.transformPivot = selectionBounds.min.map(
          (component, axis) =>
            Math.round((component + selectionBounds.max[axis]!) / 2 / this.state.activeGridSize) *
            this.state.activeGridSize,
        ) as [number, number, number];
        this.state.transformPivotSelectionKey = selectionKey;
      }
      const objectCount = objectBrushIds.length + objectEntityIds.length;
      transformTitle =
        this.state.topologySelectionKind && this.state.topologySelectedVertices.length > 0
          ? `${this.state.activeTool === 'rotate' ? 'Rotate' : this.state.activeTool === 'scale' ? 'Scale' : 'Shear'} selected ${this.state.topologySelectionKind === 'vertex' ? 'vertices' : 'edges'}`
          : this.state.activeTool === 'rotate'
            ? objectBrushIds.length > 0 && objectEntityIds.length > 0
              ? `Rotate ${objectCount} objects`
              : objectEntityIds.length > 0
                ? objectEntityIds.length > 1
                  ? 'Rotate entities'
                  : 'Rotate entity'
                : objectBrushIds.length > 1
                  ? 'Rotate brushes'
                  : 'Rotate brush'
            : this.state.activeTool === 'scale'
              ? objectBrushIds.length > 1
                ? 'Scale brushes'
                : 'Scale brush'
              : objectBrushIds.length > 1
                ? 'Shear brushes'
                : 'Shear brush';
      transformHelp =
        this.state.activeTool === 'scale'
          ? 'Drag a side, edge, or corner handle. Alt anchors at center; Shift scales proportional axes.'
          : this.state.activeTool === 'rotate' && objectEntityIds.length > 0
            ? 'Drag the yellow center to move the pivot (Alt for Z, Shift to lock an axis), or a ring to rotate. Supported entity headings rotate with their origins.'
            : this.state.activeTool === 'rotate'
              ? 'Drag the yellow center to move the pivot (Alt for Z, Shift to lock an axis), or a ring to rotate.'
              : 'Drag the viewport handle for a live snapped preview.';
      if (this.state.transformPivot) {
        this.state.renderer?.setTransformPivot(this.state.transformPivot);
      }
    }
    const objectTools = this.ui.objectTools.getSnapshot();
    this.ui.objectTools.update({
      hull: {
        visible: this.state.activeTool === 'hull',
        pointCount: this.state.hullBuildPoints.length,
        canCreate: Boolean(this.state.hullCandidate),
        canDiscard: this.state.hullBuildPoints.length > 0,
      },
      group: {
        visible: objectSelected || Boolean(openGroup),
        stateLabel: groupStateLabel,
        name: presentedGroup?.name ?? objectTools.group.name,
        canCreate: !selectedGroup || Boolean(openGroup),
        canRename: Boolean(presentedGroup),
        canOpen: Boolean(selectedGroup && selectedGroup.id !== this.state.openGroupId),
        canClose: Boolean(openGroup),
        canDuplicateLinked: Boolean(selectedGroup && !openGroup),
        canUnlink: Boolean(selectedGroup?.linkedGroupId && !openGroup),
        canUngroup: Boolean(selectedGroup),
      },
      selectionBrush: {
        visible: selectionBrushEligible,
        countLabel: `${objectBrushIds.length} ${objectBrushIds.length === 1 ? 'volume' : 'volumes'}`,
      },
      flipVisible: objectSelected,
      faceExtrude: {
        ...objectTools.faceExtrude,
        visible: faceSetExtrudable,
        step: this.state.activeGridSize,
      },
      clip: {
        ...objectTools.clip,
        visible: this.state.activeTool === 'clip' && brushObjectSelected,
        canApply: Boolean(this.state.clipCandidate),
        mode: this.state.clipMode,
      },
      transform: {
        visible: transformSelectionSupported,
        tool: this.transform.isTransformTool(this.state.activeTool)
          ? this.state.activeTool
          : objectTools.transform.tool,
        title: transformTitle,
        help: transformHelp,
        settings: {
          ...objectTools.transform.settings,
          pivot: this.state.transformPivot ?? objectTools.transform.settings.pivot,
          canUpdateEntityAngles: objectEntityIds.length > 0,
        },
      },
      topology: {
        visible: topologyActive && brushObjectSelected,
        title: this.state.activeTool === 'edge' ? 'Edge editing' : 'Vertex editing',
        selectionCount: this.state.topologySelectionCount,
        gridSize: this.state.activeGridSize,
      },
      csg: {
        visible: brushObjectSelected,
        selectionCountLabel: `${objectBrushIds.length} selected`,
        canMerge: objectBrushIds.length >= 2,
        canIntersect: objectBrushIds.length >= 2,
      },
      brushEntity: {
        visible: brushObjectSelected,
        canMakeStructural,
      },
      nudgeVisible: objectSelected || selectedFaces.length > 0 || topologyActive,
    });
    if (!brush) {
      if (pointEntity) {
        const bounds = pointEntityBounds(pointEntity);
        this.ui.selectionInspector.update({
          idLabel: 'Entity',
          revisionLabel: 'Type',
          facesLabel: 'Brushes',
          materialLabel: 'Classname',
          id:
            objectEntityIds.length > 1
              ? `${pointEntity.id} · ${objectEntityIds.length} selected`
              : pointEntity.id,
          revision: 'entity',
          faces: '0',
          bounds: bounds
            ? `${this.formatVector(bounds.min)} to ${this.formatVector(bounds.max)}`
            : 'invalid origin',
          material: pointEntity.properties.classname ?? 'entity',
          faceNormal: '',
        });
      }
      return;
    }
    const derived = deriveBrush(brush);
    const derivedFace = face
      ? derived.faces.find((candidate) => candidate.faceId === face.id)
      : undefined;
    const objectBounds = brushObjectSelected
      ? this.transform.selectedObjectBounds(document)
      : derived.bounds;
    const revisions = new Set(objectBrushes.map((candidate) => candidate.revision));
    const faceCount = String(
      brushObjectSelected
        ? objectBrushes.reduce((total, candidate) => total + candidate.faces.length, 0)
        : brush.faces.length,
    );
    const selectedMaterials = new Set(selectedFaces.map((entry) => entry.face.material));
    const objectMaterials = new Set(
      objectBrushes.flatMap((candidate) => candidate.faces.map((entry) => entry.material)),
    );
    const material =
      selectedFaces.length === 0
        ? objectMaterials.size === 1
          ? (objectBrushes[0]?.faces[0]?.material ?? 'multiple')
          : 'multiple'
        : selectedMaterials.size === 1
          ? selectedFaces[0]!.face.material
          : 'mixed';
    this.ui.selectionInspector.update({
      idLabel: 'Brush',
      revisionLabel: 'Revision',
      facesLabel: 'Faces',
      materialLabel: 'Material',
      id: objectBrushIds.length > 1 ? `${brush.id} · ${objectBrushIds.length} selected` : brush.id,
      revision: revisions.size === 1 ? String(brush.revision) : 'mixed',
      faces: faceCount,
      bounds: objectBounds
        ? `${this.formatVector(objectBounds.min)} to ${this.formatVector(objectBounds.max)}`
        : 'invalid',
      material,
      faceNormal: derivedFace ? `N ${this.formatVector(derivedFace.normal)}` : '',
    });
  }
}
