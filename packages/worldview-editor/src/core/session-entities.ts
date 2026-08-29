import {
  createBrushEntity as createBrushEntityInDocument,
  insertEntity,
  moveBrushesToEntity,
} from './document.js';
import { editorLayerForSelection } from './layers.js';
import { formatEntityOrigin, pointEntityDefinition } from './point-entities.js';
import { createObjectSelection, selectedBrushIds, selectedPointEntityIds } from './selection.js';
import type { EntityId, IdFactory, MapEntity, Vec3 } from './types.js';
import { EditorSessionGeometry } from './session-geometry.js';

/** Entity creation and brush/entity ownership operations. */
export abstract class EditorSessionEntities extends EditorSessionGeometry {
  public createPointEntity(
    classname: string,
    origin: Vec3,
    ids: IdFactory,
    properties: Readonly<Record<string, string>> = {},
  ): boolean {
    const normalizedClassname = classname.trim();
    if (!normalizedClassname) throw new Error('A point entity requires a classname');
    const definition = pointEntityDefinition(normalizedClassname);
    const layerProperties =
      !properties['_tb_group'] && this.currentLayerId ? { _tb_layer: this.currentLayerId } : {};
    const entity: MapEntity = {
      id: ids.entity(),
      properties: {
        ...definition.defaults,
        ...layerProperties,
        ...properties,
        classname: normalizedClassname,
        origin: formatEntityOrigin(origin),
      },
      primitives: [],
    };
    const after = insertEntity(this.currentDocument, entity);
    this.commitDocumentCandidate({
      label: `Create ${normalizedClassname}`,
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: { entityId: entity.id },
      document: after,
    });
    return true;
  }

  public createBrushEntity(
    classname: string,
    ids: IdFactory,
    properties: Readonly<Record<string, string>> = {},
  ): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const brushIds = selectedBrushIds(this.currentSelection);
    if (brushIds.length === 0) return false;
    const normalizedClassname = classname.trim();
    if (!normalizedClassname) throw new Error('A brush entity requires a classname');
    const layer = editorLayerForSelection(this.currentDocument, this.currentSelection);
    const entity: MapEntity = {
      id: ids.entity(),
      properties: {
        ...(layer?.id ? { _tb_layer: layer.id } : {}),
        ...properties,
        classname: normalizedClassname,
      },
      primitives: [],
    };
    const after = createBrushEntityInDocument(this.currentDocument, brushIds, entity);
    const selectionAfter = createObjectSelection(
      brushIds,
      selectedPointEntityIds(this.currentSelection),
      { kind: 'brush', brushId: brushIds.at(-1)! },
    );
    this.commitDocumentCandidate({
      label: `Make ${normalizedClassname}`,
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter,
      document: after,
    });
    return true;
  }

  public moveSelectedBrushesToEntity(entityId: EntityId): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const brushIds = selectedBrushIds(this.currentSelection);
    if (brushIds.length === 0) return false;
    const after = moveBrushesToEntity(this.currentDocument, brushIds, entityId);
    this.commitDocumentCandidate({
      label: 'Move brushes to entity',
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: this.currentSelection,
      document: after,
    });
    return true;
  }

  public makeSelectedStructural(): boolean {
    if (!this.currentSelection || this.currentSelection.faceId) return false;
    const brushIds = selectedBrushIds(this.currentSelection);
    if (brushIds.length === 0) return false;
    const layer = editorLayerForSelection(this.currentDocument, this.currentSelection);
    const target = layer?.id
      ? this.currentDocument.entities.find((entity) => entity.id === layer.entityId)
      : this.currentDocument.entities.find(
          (entity) => entity.properties.classname?.toLowerCase() === 'worldspawn',
        );
    if (!target) throw new Error('The map has no structural layer entity');
    const after = moveBrushesToEntity(this.currentDocument, brushIds, target.id, true);
    this.commitDocumentCandidate({
      label: brushIds.length === 1 ? 'Make brush structural' : 'Make brushes structural',
      baseDocumentRevision: this.currentDocument.revision,
      before: this.currentDocument,
      after,
      selectionBefore: this.currentSelection,
      selectionAfter: this.currentSelection,
      document: after,
    });
    return true;
  }
}
