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
  type SurfaceFlagDefinition,
  type MapDocument,
} from '@jackharrhy/worldview-editor';

import type { EditorElements } from './editor-elements.js';
import { setToolbarButtonLabel } from './editor-elements.js';
import type { EditorState } from './editor-state.js';
import type { EntityPresenter } from './entity-presenter.js';
import type { OrganizationPresenter } from './organization-presenter.js';
import type { TransformToolPresenter } from './transform-tool-presenter.js';

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
    private readonly state: EditorState,
    private readonly ui: EditorElements,
    private readonly organization: OrganizationPresenter,
    private readonly entity: EntityPresenter,
    private readonly transform: TransformToolPresenter,
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
    this.ui.undoButton.disabled = !this.state.session.canUndo;
    this.ui.undoButton.title = this.state.session.undoLabel
      ? `Undo ${this.state.session.undoLabel}`
      : 'Nothing to undo';
    this.ui.redoButton.disabled = !this.state.session.canRedo;
    this.ui.redoButton.title = this.state.session.redoLabel
      ? `Redo ${this.state.session.redoLabel}`
      : 'Nothing to redo';
    const repeatLabels = this.state.session.repeatCommandLabels;
    this.ui.repeatCommandsButton.disabled = !this.state.session.canRepeatCommands;
    setToolbarButtonLabel(
      this.ui.repeatCommandsButton,
      repeatLabels.length > 0 ? `Repeat ${repeatLabels.length}` : 'Repeat',
    );
    this.ui.repeatCommandsButton.title =
      repeatLabels.length > 0
        ? `Repeat ${repeatLabels.join(' → ')} (Ctrl/Command+Shift+R)`
        : 'Record duplicate, move, rotate, flip, scale, or shear commands first';
    this.ui.clearRepeatCommandsButton.disabled = repeatLabels.length === 0;
    this.ui.clearRepeatCommandsButton.title =
      repeatLabels.length > 0
        ? `Clear ${repeatLabels.join(' → ')} and start a new sequence`
        : 'No recorded command sequence';
    this.ui.simpleShapeToolSection.hidden = !(
      this.state.activeTool === 'create' ||
      (this.state.activeTool === 'select' && !selection)
    );
    this.ui.pointEntityToolSection.hidden = this.state.activeTool !== 'entity';
    this.ui.hullToolSection.hidden = this.state.activeTool !== 'hull';
    this.ui.hullPointCount.textContent = `${this.state.hullBuildPoints.length} ${this.state.hullBuildPoints.length === 1 ? 'point' : 'points'}`;
    this.ui.createHullButton.disabled = !this.state.hullCandidate;
    this.ui.discardHullButton.disabled = this.state.hullBuildPoints.length === 0;

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
    this.ui.groupSection.hidden = !objectSelected && !openGroup;
    this.ui.groupState.textContent = openGroup
      ? openGroup.linkedGroupId
        ? `Editing linked · ${linkedCopies} copies`
        : `Editing ${openGroup.name}`
      : selectedGroup
        ? selectedGroup.linkedGroupId
          ? `Linked · ${linkedCopies} copies`
          : `${selectedGroup.brushIds.length + selectedGroup.pointEntityIds.length} objects`
        : 'Selection';
    if (presentedGroup && window.document.activeElement !== this.ui.groupName) {
      this.ui.groupName.value = presentedGroup.name;
    }
    this.ui.createGroupButton.hidden = Boolean(selectedGroup && !openGroup);
    this.ui.renameGroupButton.hidden = !presentedGroup;
    this.ui.openGroupButton.hidden = !selectedGroup || selectedGroup.id === this.state.openGroupId;
    this.ui.closeGroupButton.hidden = !openGroup;
    this.ui.createLinkedDuplicateButton.hidden = !selectedGroup || Boolean(openGroup);
    this.ui.unlinkGroupButton.hidden = !selectedGroup?.linkedGroupId || Boolean(openGroup);
    this.ui.ungroupButton.hidden = !selectedGroup;
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
    this.ui.selectionBrushSection.hidden = !selectionBrushEligible;
    this.ui.selectionBrushCount.textContent = `${objectBrushIds.length} ${objectBrushIds.length === 1 ? 'volume' : 'volumes'}`;
    const primaryBrushOwner = selection?.brushId
      ? document.entities.find((entity) =>
          entity.primitives.some((candidate) => candidate.id === selection.brushId),
        )
      : null;
    this.ui.entitySection.hidden = Boolean(
      selectedGroup || (primaryBrushOwner && isEditorGroupEntity(primaryBrushOwner)),
    );
    this.entity.renderEntityProperties(document, selection);
    this.ui.duplicateButton.disabled = !objectSelected;
    this.ui.copyButton.disabled = !objectSelected && selectedFaces.length === 0;
    this.ui.copyButton.title =
      selectedFaces.length > 0
        ? 'Copy the primary face material and attributes (Ctrl/Command+C)'
        : 'Copy selected objects as map text (Ctrl/Command+C)';
    this.ui.pasteHereButton.disabled = !this.state.lastPointerPosition;
    this.ui.deleteButton.disabled = !objectSelected;
    this.ui.focusSelectionButton.disabled = !selection;
    this.ui.snapSelectionToGridButton.disabled = !brush;
    this.ui.hideSelectionButton.disabled = !objectSelected;
    this.ui.isolateSelectionButton.disabled = !objectSelected;
    this.ui.showAllButton.disabled = !this.state.session.canShowAll;
    this.ui.lockSelectionButton.disabled = !objectSelected;
    this.ui.unlockAllButton.disabled = !this.state.session.canUnlockAll;
    this.ui.selectionEmpty.hidden = Boolean(brush || pointEntity);
    this.ui.selectionInspector.hidden = !brush && !pointEntity;
    this.ui.applyMaterialButton.disabled = !brush || this.ui.materialName.value.trim().length === 0;
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
    this.ui.selectionKind.textContent = selectedGroup
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
    this.ui.faceExtrudeSection.hidden = !faceSetExtrudable;
    this.ui.sweepToolSection.hidden =
      this.state.activeTool !== 'sweep' || selectedFaces.length === 0;
    this.ui.applySweepButton.disabled = !this.state.sweepCandidate;
    if (this.state.activeTool === 'sweep') {
      this.ui.sweepGeneratedCount.textContent = this.state.sweepCandidate
        ? `${this.state.sweepCandidate.insertions.length} ${this.state.sweepCandidate.insertions.length === 1 ? 'brush' : 'brushes'}`
        : '0 brushes';
    }
    this.ui.clipToolSection.hidden = this.state.activeTool !== 'clip' || !brushObjectSelected;
    const transformActive = this.transform.isTransformTool(this.state.activeTool);
    const topologyActive = this.transform.isTopologyTool(this.state.activeTool);
    const transformSelectionSupported = transformActive && objectSelected;
    this.ui.transformToolSection.hidden = !transformSelectionSupported;
    this.ui.objectFlipSection.hidden = !objectSelected;
    this.ui.rotateUpdateEntityAngles.disabled = objectEntityIds.length === 0;
    this.ui.topologyToolSection.hidden = !topologyActive || !brushObjectSelected;
    this.ui.csgSection.hidden = !brushObjectSelected;
    this.ui.brushEntityActions.hidden = !brushObjectSelected;
    const worldspawn = document.entities.find(
      (entity) => entity.properties.classname?.toLowerCase() === 'worldspawn',
    );
    const selectedBrushOwners = objectBrushIds.flatMap((selectedBrushId) => {
      const owner = document.entities.find((entity) =>
        entity.primitives.some((candidate) => candidate.id === selectedBrushId),
      );
      return owner ? [owner] : [];
    });
    this.ui.makeStructuralButton.disabled =
      !brushObjectSelected ||
      !worldspawn ||
      selectedBrushOwners.every((owner) => owner.id === worldspawn.id);
    this.ui.makeBrushEntityButton.disabled =
      !brushObjectSelected || this.ui.brushEntityClassname.value.trim() === '';
    this.ui.csgSelectionCount.textContent = `${objectBrushIds.length} selected`;
    this.ui.csgMergeButton.disabled = objectBrushIds.length < 2;
    this.ui.csgIntersectButton.disabled = objectBrushIds.length < 2;
    if (topologyActive) {
      this.ui.topologyToolTitle.textContent =
        this.state.activeTool === 'vertex' ? 'Vertex editing' : 'Edge editing';
      this.ui.topologyGridSize.textContent = String(this.state.activeGridSize);
    }
    for (const panel of window.document.querySelectorAll<HTMLElement>('[data-transform-panel]')) {
      panel.hidden = !transformActive || panel.dataset.transformPanel !== this.state.activeTool;
    }
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
      this.ui.transformToolTitle.textContent =
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
      this.ui.transformToolHelp.textContent =
        this.state.activeTool === 'scale'
          ? 'Drag a side, edge, or corner handle. Alt anchors at center; Shift scales proportional axes.'
          : this.state.activeTool === 'rotate' && objectEntityIds.length > 0
            ? 'Drag the yellow center to move the pivot (Alt for Z, Shift to lock an axis), or a ring to rotate. Supported entity headings rotate with their origins.'
            : this.state.activeTool === 'rotate'
              ? 'Drag the yellow center to move the pivot (Alt for Z, Shift to lock an axis), or a ring to rotate.'
              : 'Drag the viewport handle for a live snapped preview.';
      if (this.state.transformPivot) {
        this.state.renderer?.setTransformPivot(this.state.transformPivot);
        this.ui.transformPivotX.value = String(this.state.transformPivot[0]);
        this.ui.transformPivotY.value = String(this.state.transformPivot[1]);
        this.ui.transformPivotZ.value = String(this.state.transformPivot[2]);
      }
    }
    this.ui.faceExtrudeDistance.step = String(this.state.activeGridSize);
    this.ui.shearOffset.step = String(this.state.activeGridSize);
    for (const input of [
      this.ui.textureShiftU,
      this.ui.textureShiftV,
      this.ui.textureScaleU,
      this.ui.textureScaleV,
      this.ui.textureRotation,
    ]) {
      input.disabled = !face;
    }
    this.ui.applyTextureTransformButton.disabled = !face;
    for (const button of window.document.querySelectorAll<HTMLButtonElement>(
      '[data-texture-align], [data-texture-layout]',
    )) {
      button.disabled = !brush;
    }
    if (!brush) {
      this.state.uvEditor.setFace(null);
      this.ui.textureUAxis.textContent = 'Select a face';
      this.ui.textureVAxis.textContent = 'Select a face';
      if (pointEntity) {
        this.ui.selectionIdLabel.textContent = 'Entity';
        this.ui.selectionRevisionLabel.textContent = 'Type';
        this.ui.selectionFacesLabel.textContent = 'Brushes';
        this.ui.selectionMaterialLabel.textContent = 'Classname';
        const bounds = pointEntityBounds(pointEntity);
        this.ui.brushId.textContent =
          objectEntityIds.length > 1
            ? `${pointEntity.id} · ${objectEntityIds.length} selected`
            : pointEntity.id;
        this.ui.brushRevision.textContent = 'entity';
        this.ui.brushFaces.textContent = '0';
        this.ui.brushBounds.textContent = bounds
          ? `${this.formatVector(bounds.min)} to ${this.formatVector(bounds.max)}`
          : 'invalid origin';
        this.ui.faceMaterial.textContent = pointEntity.properties.classname ?? 'entity';
      }
      return;
    }
    this.ui.selectionIdLabel.textContent = 'Brush';
    this.ui.selectionRevisionLabel.textContent = 'Revision';
    this.ui.selectionFacesLabel.textContent = 'Faces';
    this.ui.selectionMaterialLabel.textContent = 'Material';
    const derived = deriveBrush(brush);
    const derivedFace = face
      ? derived.faces.find((candidate) => candidate.faceId === face.id)
      : undefined;
    this.state.uvEditor.setFace(
      face && derivedFace
        ? {
            selection: { brushId: brush.id, faceId: face.id },
            face,
            vertices: derivedFace.vertices,
            selectedFaceCount: selectedFaces.length,
            material: this.state.materialCatalog.find(face.material),
          }
        : null,
    );
    const objectBounds = brushObjectSelected
      ? this.transform.selectedObjectBounds(document)
      : derived.bounds;
    this.ui.brushId.textContent =
      objectBrushIds.length > 1 ? `${brush.id} · ${objectBrushIds.length} selected` : brush.id;
    const revisions = new Set(objectBrushes.map((candidate) => candidate.revision));
    this.ui.brushRevision.textContent = revisions.size === 1 ? String(brush.revision) : 'mixed';
    this.ui.brushFaces.textContent = String(
      brushObjectSelected
        ? objectBrushes.reduce((total, candidate) => total + candidate.faces.length, 0)
        : brush.faces.length,
    );
    this.ui.brushBounds.textContent = objectBounds
      ? `${this.formatVector(objectBounds.min)} to ${this.formatVector(objectBounds.max)}`
      : 'invalid';
    const selectedMaterials = new Set(selectedFaces.map((entry) => entry.face.material));
    const objectMaterials = new Set(
      objectBrushes.flatMap((candidate) => candidate.faces.map((entry) => entry.material)),
    );
    this.ui.faceMaterial.textContent =
      selectedFaces.length === 0
        ? objectMaterials.size === 1
          ? (objectBrushes[0]?.faces[0]?.material ?? 'multiple')
          : 'multiple'
        : selectedMaterials.size === 1
          ? selectedFaces[0]!.face.material
          : 'mixed';
    this.ui.faceNormal.textContent = derivedFace
      ? `N ${this.formatVector(derivedFace.normal)}`
      : '';
    if (face) {
      this.ui.textureShiftU.value = String(face.projection.offset[0]);
      this.ui.textureShiftV.value = String(face.projection.offset[1]);
      this.ui.textureScaleU.value = String(face.projection.scale[0]);
      this.ui.textureScaleV.value = String(face.projection.scale[1]);
      this.ui.textureRotation.value = String(face.projection.rotationDegrees);
      this.ui.textureUAxis.textContent = this.formatVector(face.projection.uAxis);
      this.ui.textureVAxis.textContent = this.formatVector(face.projection.vAxis);
    }
  }
}
