import {
  EditorSourceRenderer,
  createBrushSelection,
  createObjectSelection,
  createConvexHullBrush,
  createSimpleShapeBrushes,
  createSequentialIdFactory,
  editorGroupForObject,
  extrudableBrushFaces,
  pointEntityDefinition,
  selectedBrushIds,
  selectedFaceReferences,
  selectedPointEntityIds,
  selectionForEditorGroup,
  type EditorBrushCreateEvent,
  type EditorBrushDragEvent,
  type EditorCameraChangeEvent,
  type EditorClipPlaneEvent,
  type EditorFaceDragEvent,
  type EditorFaceTransferEvent,
  type EditorHullCreateEvent,
  type EditorSweepDragEvent,
  type EditorTopologyDragEvent,
  type EditorTransformDragEvent,
  type EditorTransformPivotDragEvent,
} from '@jackharrhy/worldview-editor';
import { AnimationFrameScheduler } from '@jackharrhy/worldview';

import type { BuildPresenter } from './build-presenter.js';
import type { ContextMenuPresenter } from './context-menu-presenter.js';
import type { DocumentPresenter } from './document-presenter.js';
import { resolveEditorRenderTheme } from './render-theme.js';
import type { EditorElements } from './editor-elements.js';
import type { EditorState } from './editor-state.js';
import type { GeometryToolPresenter } from './geometry-tool-presenter.js';
import type { InspectorPresenter } from './inspector-presenter.js';
import type { OrganizationPresenter } from './organization-presenter.js';
import type { TransformToolPresenter } from './transform-tool-presenter.js';
import type { ViewportWorkspacePresenter } from './viewport-workspace-presenter.js';

interface RendererPresenterDependencies {
  readonly state: EditorState;
  readonly ui: EditorElements;
  readonly build: BuildPresenter;
  readonly contextMenu: ContextMenuPresenter;
  readonly document: DocumentPresenter;
  readonly geometry: GeometryToolPresenter;
  readonly inspector: InspectorPresenter;
  readonly organization: OrganizationPresenter;
  readonly transform: TransformToolPresenter;
  readonly viewportWorkspace: ViewportWorkspacePresenter;
  readonly publishCollaborationPreview: (document: EditorState['session']['document']) => void;
  readonly publishCollaborationPointer: () => void;
}

export class RendererPresenter {
  private scheduler: AnimationFrameScheduler | null = null;

  public constructor(private readonly dependencies: RendererPresenterDependencies) {}

  public async start(signal: AbortSignal): Promise<void> {
    const app = this.dependencies;
    const state = app.state;
    const ui = app.ui;
    const renderScheduler = new AnimationFrameScheduler();
    this.scheduler = renderScheduler;
    try {
      const renderer = await EditorSourceRenderer.create({
        theme: resolveEditorRenderTheme(),
        canvases: ui.canvases,
        document: state.session.document,
        selection: state.session.selection,
        objectViewState: app.organization.effectiveObjectViewState(),
        materials: state.materialCatalog.materials(),
        entityDefinitions: state.entityDefinitions,
        referenceScenes: state.referenceScenes,
        entityLinkMode: state.entityLinkMode,
        openGroupId: state.openGroupId,
        tool: state.activeTool,
        gridSize: state.activeGridSize,
        entityPlacementBounds: pointEntityDefinition(
          ui.pointEntityClassname.value,
          state.entityDefinitions,
        ).bounds,
        onRenderRequest: () => renderScheduler.request(),
        onPreviewDocument: (document) => app.publishCollaborationPreview(document),
        onDeviceLost(message) {
          if (signal.aborted) return;
          ui.viewportError.hidden = false;
          ui.viewportError.textContent = `${message}. Reload the editor to restore rendering.`;
          ui.statusMessage.textContent = 'WebGPU renderer stopped.';
        },
        onCameraChange(event: EditorCameraChangeEvent) {
          ui.canvases[event.viewport].dataset.camera = JSON.stringify(event.camera);
          app.viewportWorkspace.setCamera(event);
          if (event.viewport !== 'perspective') return;
          state.perspectiveCamera = event.camera;
          ui.perspectiveMode.dataset.camera = JSON.stringify(event.camera);
          ui.perspectiveMode.title = `Position ${app.build.formatVector(event.camera.position)} · ${Math.round(event.camera.fieldOfViewDegrees)}° FOV · ${Math.round(event.camera.flySpeed)} units/s`;
          if (ui.compiledCanvas.hidden) {
            ui.perspectiveMode.textContent =
              event.mode === 'initial' ? 'EDIT' : `EDIT · ${event.mode.toUpperCase()}`;
          }
          const position = event.camera.position.map((value) => Math.round(value));
          ui.cameraPointerContext.textContent =
            `PERSPECTIVE / ${event.mode} ${app.build.formatVector(position)}` +
            (event.mode === 'fly' ? ` · speed ${Math.round(event.camera.flySpeed)}` : '');
        },
        onPick(selection, viewport, intent) {
          const objectSelectionIds = selectedBrushIds(state.session.selection);
          if (!selection?.faceId) {
            if (!selection && intent.objectExpansion === 'activate' && state.openGroupId) {
              app.organization.closeEditorGroup();
              return;
            }
            if (!selection && intent.objectAdditive) return;
            const containingGroup = selection
              ? editorGroupForObject(state.session.document, selection, state.openGroupId)
              : null;
            if (selection && intent.objectExpansion === 'activate' && containingGroup) {
              app.organization.openEditorGroup(containingGroup.id, selection);
              ui.cameraPointerContext.textContent = `${viewport.toUpperCase()} / editing group`;
              return;
            }
            if (selection && containingGroup) {
              if (intent.objectAdditive) {
                const currentBrushes = new Set(selectedBrushIds(state.session.selection));
                const currentEntities = new Set(selectedPointEntityIds(state.session.selection));
                const allSelected =
                  containingGroup.brushIds.every((groupBrushId) =>
                    currentBrushes.has(groupBrushId),
                  ) &&
                  containingGroup.pointEntityIds.every((entityId) => currentEntities.has(entityId));
                for (const groupBrushId of containingGroup.brushIds) {
                  if (allSelected) currentBrushes.delete(groupBrushId);
                  else currentBrushes.add(groupBrushId);
                }
                for (const entityId of containingGroup.pointEntityIds) {
                  if (allSelected) currentEntities.delete(entityId);
                  else currentEntities.add(entityId);
                }
                state.session.select(
                  createObjectSelection(
                    [...currentBrushes],
                    [...currentEntities],
                    selection.brushId
                      ? { kind: 'brush', brushId: selection.brushId }
                      : selection.entityId
                        ? { kind: 'entity', entityId: selection.entityId }
                        : null,
                  ),
                );
              } else {
                state.session.select(
                  selectionForEditorGroup(
                    containingGroup,
                    selection.brushId
                      ? { kind: 'brush', brushId: selection.brushId }
                      : selection.entityId
                        ? { kind: 'entity', entityId: selection.entityId }
                        : null,
                  ),
                );
              }
            } else if (selection?.entityId) {
              if (intent.objectAdditive) state.session.selectPointEntity(selection.entityId, true);
              else state.session.select(selection);
            } else if (
              selection?.brushId &&
              (intent.objectExpansion === 'siblings' || intent.objectExpansion === 'activate')
            ) {
              const owner = state.session.document.entities.find((entity) =>
                entity.primitives.some((brush) => brush.id === selection.brushId),
              );
              const siblingIds =
                owner && owner.properties.classname !== 'worldspawn' && owner.primitives.length > 1
                  ? owner.primitives.map((brush) => brush.id)
                  : [selection.brushId];
              state.session.select(
                createBrushSelection(
                  intent.objectAdditive
                    ? [...selectedBrushIds(state.session.selection), ...siblingIds]
                    : siblingIds,
                  selection.brushId,
                ),
              );
            } else if (selection?.brushId && intent.objectAdditive) {
              state.session.selectBrush(selection.brushId, true);
            } else {
              state.session.select(selection);
            }
          } else if (intent.expansion === 'brush') {
            state.session.selectBrushFaces(selection.brushId, intent.additive, selection.faceId);
          } else if (intent.expansion === 'coplanar') {
            state.session.selectConnectedCoplanarFaces(
              { brushId: selection.brushId, faceId: selection.faceId },
              intent.additive,
            );
          } else if (
            state.activeTool === 'face' &&
            !intent.additive &&
            objectSelectionIds.length > 1
          ) {
            state.session.selectMatchingBrushFaces(
              { brushId: selection.brushId, faceId: selection.faceId },
              objectSelectionIds,
            );
          } else {
            state.session.selectFace(
              { brushId: selection.brushId, faceId: selection.faceId },
              intent.additive,
            );
          }
          if (intent.paint) {
            const faces = selectedFaceReferences(state.session.selection);
            const selectedBrushCount = selectedBrushIds(state.session.selection).length;
            const selectedEntityCount = selectedPointEntityIds(state.session.selection).length;
            const count =
              faces.length > 0 ? faces.length : selectedBrushCount + selectedEntityCount;
            const subject =
              faces.length > 0
                ? count === 1
                  ? 'face'
                  : 'faces'
                : selectedBrushCount > 0 && selectedEntityCount === 0
                  ? count === 1
                    ? 'brush'
                    : 'brushes'
                  : selectedEntityCount > 0 && selectedBrushCount === 0
                    ? count === 1
                      ? 'entity'
                      : 'entities'
                    : count === 1
                      ? 'object'
                      : 'objects';
            ui.statusMessage.textContent = `Paint selected ${count} ${subject}.`;
            ui.cameraPointerContext.textContent = `${viewport.toUpperCase()} / ${faces.length > 0 ? 'face' : 'object'} paint ${count}`;
          } else if (intent.drill) {
            const target = intent.drillTarget === 'face' ? 'face' : 'object';
            ui.statusMessage.textContent = `Drilled ${target} selection ${intent.drill} in the ${viewport.toUpperCase()} view.`;
            ui.cameraPointerContext.textContent = `${viewport.toUpperCase()} / ${target} drill ${intent.drill}`;
          } else if (
            selection &&
            !selection.faceId &&
            editorGroupForObject(state.session.document, selection, state.openGroupId)
          ) {
            const group = editorGroupForObject(
              state.session.document,
              selection,
              state.openGroupId,
            )!;
            ui.statusMessage.textContent = `Selected group ${group.name}.`;
            ui.cameraPointerContext.textContent = `${viewport.toUpperCase()} / group ${group.name}`;
          } else if (
            selection?.brushId &&
            (intent.objectExpansion === 'siblings' || intent.objectExpansion === 'activate')
          ) {
            const count = selectedBrushIds(state.session.selection).length;
            ui.statusMessage.textContent =
              count > 1 ? `Selected ${count} sibling brushes.` : 'Selected brush.';
            ui.cameraPointerContext.textContent = `${viewport.toUpperCase()} / siblings ${count}`;
          } else {
            ui.cameraPointerContext.textContent = `${viewport.toUpperCase()} / edit`;
          }
        },
        onPointEntityPlace(event) {
          const classname = ui.pointEntityClassname.value.trim();
          if (!classname) {
            ui.statusMessage.textContent = 'Enter a point-entity classname before placing it.';
            return;
          }
          try {
            const ids = createSequentialIdFactory(
              `point-entity-${state.session.document.revision + 1}`,
            );
            state.session.createPointEntity(
              classname,
              event.origin,
              ids,
              state.openGroupId ? { _tb_group: state.openGroupId } : {},
            );
            ui.statusMessage.textContent = `Placed ${classname} at ${app.build.formatVector(event.origin)}.`;
            ui.cameraPointerContext.textContent = `${event.viewport.toUpperCase()} / placed ${classname}`;
          } catch (error) {
            ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
          }
        },
        onPointerPosition(event) {
          state.lastPointerPosition = event;
          app.publishCollaborationPointer();
          ui.pasteButton.disabled = false;
        },
        onContextMenu(event) {
          app.contextMenu.showViewportContextMenu(event);
          ui.cameraPointerContext.textContent = `${event.viewport.toUpperCase()} / context ${app.build.formatVector(event.pointer.point)}`;
        },
        onFaceLasso(faces, viewport, ensureSelected) {
          if (faces.length === 0) {
            ui.statusMessage.textContent = 'Face lasso did not contain any handles.';
            return;
          }
          state.session.selectFacesWithLasso(faces, ensureSelected);
          const count = selectedFaceReferences(state.session.selection).length;
          ui.cameraPointerContext.textContent = `${viewport.toUpperCase()} / face lasso ${count}`;
        },
        onClipPlaneChange(event: EditorClipPlaneEvent) {
          app.geometry.handleClipPlaneChange(event);
          if (event.movingPointIndex !== undefined) {
            const constraint =
              event.axisRestriction === undefined || event.axisRestriction === null
                ? ''
                : ` · ${['X', 'Y', 'Z'][event.axisRestriction]} locked`;
            ui.statusMessage.textContent =
              event.pointMovePhase === 'commit'
                ? `Moved clip point ${event.movingPointIndex + 1}${constraint}.`
                : event.pointMovePhase === 'cancel'
                  ? `Clip point ${event.movingPointIndex + 1} move cancelled.`
                  : `Clip point ${event.movingPointIndex + 1} preview${constraint}. Release to place it.`;
          }
          ui.cameraPointerContext.textContent = `${event.viewport.toUpperCase()} / clip ${event.points.length}`;
        },
        onTransformDrag(event: EditorTransformDragEvent) {
          app.transform.handleTransformDrag(event);
        },
        onTransformPivotDrag(event: EditorTransformPivotDragEvent) {
          app.transform.handleTransformPivotDrag(event);
        },
        onSweepDrag(event: EditorSweepDragEvent) {
          app.geometry.handleSweepDrag(event);
        },
        onTopologyDrag(event: EditorTopologyDragEvent) {
          app.transform.handleTopologyDrag(event);
        },
        onTopologySelectionChange(kind, selectedCount, vertices) {
          ui.topologySelectionCount.textContent = String(selectedCount);
          state.topologySelectedVertices = vertices;
          state.topologySelectionKind = selectedCount > 0 ? kind : null;
          if (app.transform.isTransformTool(state.activeTool)) app.inspector.updateInspector();
        },
        onBrushDrag(event: EditorBrushDragEvent) {
          const pointerContext = ui.cameraPointerContext;
          if (event.phase === 'cancel') {
            state.moveCandidate = null;
            state.duplicationBase = null;
            state.duplicationCandidate = null;
            state.renderer?.setDocument(state.session.document, state.session.selection);
            app.inspector.updateInspector();
            ui.statusMessage.textContent = event.duplicate
              ? 'Duplicate-and-move cancelled.'
              : 'Brush move cancelled.';
            pointerContext.textContent = `${event.viewport.toUpperCase()} / edit`;
            return;
          }

          const hasMovement = event.delta.some((component) => Math.abs(component) > Number.EPSILON);
          if (!hasMovement) {
            state.moveCandidate = null;
            state.duplicationBase = null;
            state.duplicationCandidate = null;
            state.renderer?.setDocument(state.session.document, state.session.selection);
            app.inspector.updateInspector();
            if (event.phase === 'commit') {
              ui.statusMessage.textContent = event.duplicate
                ? 'Duplicate remained on the original grid position; nothing was created.'
                : 'Brush remained on its original grid position.';
              pointerContext.textContent = `${event.viewport.toUpperCase()} / edit`;
            }
            return;
          }

          try {
            if (event.duplicate) {
              if (!state.duplicationBase) {
                state.duplicateSequence += 1;
                state.duplicationBase = state.session.createObjectDuplicationCandidate(
                  event.selection,
                  createSequentialIdFactory(`drag-duplicate-${state.duplicateSequence}`),
                  state.openGroupId,
                );
              }
              if (!state.duplicationBase) return;
              const candidate = state.session.translateObjectDuplicationCandidate(
                state.duplicationBase,
                event.delta,
                ui.textureLock.checked,
                state.duplicationBase.label.replace('Duplicate', 'Duplicate and move'),
              );
              if (event.phase === 'preview') {
                state.duplicationCandidate = candidate;
                state.renderer?.setDocument(candidate.document, candidate.selectionAfter);
                app.inspector.updateInspector(candidate.document, candidate.selectionAfter);
                ui.statusMessage.textContent = `Duplicate-and-move preview: ${app.build.formatVector(event.delta)} (${app.build.movementDescription(event)}). Release to commit.`;
                pointerContext.textContent = `${event.viewport.toUpperCase()} / duplicate move`;
                return;
              }
              state.session.commitDocumentCandidate(state.duplicationCandidate ?? candidate);
              state.duplicationBase = null;
              state.duplicationCandidate = null;
              pointerContext.textContent = `${event.viewport.toUpperCase()} / edit`;
              return;
            }
            const candidate = state.session.createObjectTranslationCandidate(
              event.selection,
              event.delta,
              ui.textureLock.checked,
            );
            if (!candidate) return;
            if (event.phase === 'preview') {
              state.moveCandidate = candidate;
              state.renderer?.setDocument(candidate.document, state.session.selection);
              app.inspector.updateInspector(candidate.document);
              ui.statusMessage.textContent = `Move preview: ${app.build.formatVector(event.delta)} (${app.build.movementDescription(event)}). Release to commit.`;
              pointerContext.textContent = `${event.viewport.toUpperCase()} / move`;
              return;
            }
            state.session.commitDocumentCandidate(state.moveCandidate ?? candidate);
            state.moveCandidate = null;
            pointerContext.textContent = `${event.viewport.toUpperCase()} / edit`;
          } catch (error) {
            state.moveCandidate = null;
            state.duplicationBase = null;
            state.duplicationCandidate = null;
            state.renderer?.setDocument(state.session.document, state.session.selection);
            app.inspector.updateInspector();
            ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
            pointerContext.textContent = `${event.viewport.toUpperCase()} / edit`;
          }
        },
        onFaceTransfer(event: EditorFaceTransferEvent) {
          const pointerContext = ui.cameraPointerContext;
          if (event.phase === 'cancel') {
            state.faceTransferCandidate = null;
            state.renderer?.setDocument(state.session.document, state.session.selection);
            app.inspector.updateInspector();
            ui.statusMessage.textContent = 'Face attribute transfer cancelled.';
            pointerContext.textContent = `${event.viewport.toUpperCase()} / transfer cancelled`;
            return;
          }

          try {
            const candidate = state.session.createFaceAttributeTransferCandidate(
              event.source,
              event.targets,
              event.mode,
            );
            if (!candidate) return;
            const modeLabel =
              event.mode === 'material'
                ? 'material only'
                : event.mode === 'rotate'
                  ? 'rotated attributes'
                  : 'projected attributes';
            if (event.phase === 'preview') {
              state.faceTransferCandidate = candidate;
              state.renderer?.setDocument(candidate.document, state.session.selection);
              app.inspector.updateInspector(candidate.document, state.session.selection);
              ui.statusMessage.textContent = `Transfer preview: ${modeLabel} across ${event.targets.length} ${event.targets.length === 1 ? 'face' : 'faces'}. Release to commit.`;
              pointerContext.textContent = `${event.viewport.toUpperCase()} / transfer ${event.targets.length}`;
              return;
            }
            state.session.commitCandidate(state.faceTransferCandidate ?? candidate);
            state.faceTransferCandidate = null;
            pointerContext.textContent = `${event.viewport.toUpperCase()} / transfer`;
          } catch (error) {
            state.faceTransferCandidate = null;
            state.renderer?.setDocument(state.session.document, state.session.selection);
            app.inspector.updateInspector();
            ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
            pointerContext.textContent = `${event.viewport.toUpperCase()} / transfer invalid`;
          }
        },
        onFaceDrag(event: EditorFaceDragEvent) {
          const pointerContext = ui.cameraPointerContext;
          const hasMovement =
            event.mode === 'translate'
              ? event.delta.some((component) => Math.abs(component) > Number.EPSILON)
              : Math.abs(event.distance) > Number.EPSILON;
          if (event.phase === 'cancel' || !hasMovement) {
            state.faceCandidate = null;
            state.renderer?.setDocument(state.session.document, state.session.selection);
            app.inspector.updateInspector();
            ui.statusMessage.textContent =
              event.phase === 'cancel'
                ? event.mode === 'translate'
                  ? 'Face move cancelled.'
                  : event.stamp
                    ? 'Face stamp cancelled.'
                    : event.split
                      ? 'Face split cancelled.'
                      : 'Face extrusion cancelled.'
                : 'Face stayed on its plane.';
            pointerContext.textContent = `${event.viewport.toUpperCase()} / face`;
            return;
          }

          try {
            const selectedFaces = selectedFaceReferences(state.session.selection);
            const selectedBrushes = selectedBrushIds(state.session.selection);
            const eventFace = {
              brushId: event.selection.brushId,
              faceId: event.selection.faceId,
            };
            const faces = selectedFaces.some(
              (face) => face.brushId === eventFace.brushId && face.faceId === eventFace.faceId,
            )
              ? selectedFaces
              : selectedBrushes.includes(eventFace.brushId) &&
                  event.mode === 'normal' &&
                  !event.split &&
                  !event.stamp
                ? extrudableBrushFaces(state.session.document, eventFace, selectedBrushes)
                : [eventFace];
            const candidate =
              event.mode === 'translate'
                ? state.session.createFaceSetTranslationCandidate(
                    faces,
                    event.delta,
                    createSequentialIdFactory(`face-move-${state.faceTranslationSequence + 1}`),
                    ui.textureLock.checked,
                  )
                : event.stamp
                  ? state.session.createFaceStampCandidate(
                      faces,
                      eventFace,
                      event.distance,
                      createSequentialIdFactory(`face-stamp-${state.faceStampSequence + 1}`),
                      ui.textureLock.checked,
                    )
                  : event.split
                    ? state.session.createFaceSetSplitCandidate(
                        faces,
                        eventFace,
                        event.distance,
                        createSequentialIdFactory(`face-split-${state.faceSplitSequence + 1}`),
                      )
                    : state.session.createFaceSetExtrusionCandidate(
                        faces,
                        eventFace,
                        event.distance,
                      );
            if (!candidate) return;
            if (event.phase === 'preview') {
              state.faceCandidate = candidate;
              state.renderer?.setDocument(candidate.document, state.session.selection);
              // The viewport is the latency-critical feedback surface during a drag. Inspector
              // values settle from the committed session change; rebuilding its derived model on
              // every snapped pointer position only competes with the next visual frame.
              ui.statusMessage.textContent =
                event.mode === 'translate'
                  ? `Face move preview: ${app.build.formatVector(event.delta)}. Release to commit.`
                  : `${event.stamp ? 'Face stamp' : event.split ? 'Face split' : 'Face extrusion'} preview: ${event.distance > 0 ? '+' : ''}${event.distance}. Release to commit.`;
              pointerContext.textContent =
                event.mode === 'translate'
                  ? `${event.viewport.toUpperCase()} / face move ${app.build.formatVector(event.delta)}`
                  : `${event.viewport.toUpperCase()} / face ${event.stamp ? 'stamp ' : event.split ? 'split ' : ''}${event.distance}`;
              return;
            }
            const committed = state.faceCandidate ?? candidate;
            if ('insertions' in committed) {
              state.session.commitBatchCreationCandidate(committed);
              state.faceStampSequence += 1;
            } else if ('mode' in committed) {
              state.session.commitClipCandidate(committed);
              state.faceSplitSequence += 1;
            } else {
              state.session.commitCandidate(committed);
              if (event.mode === 'translate') state.faceTranslationSequence += 1;
            }
            state.faceCandidate = null;
            pointerContext.textContent = `${event.viewport.toUpperCase()} / face`;
          } catch (error) {
            state.faceCandidate = null;
            state.renderer?.setDocument(state.session.document, state.session.selection);
            app.inspector.updateInspector();
            ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
            pointerContext.textContent = `${event.viewport.toUpperCase()} / face invalid`;
          }
        },
        onHullCreate(event: EditorHullCreateEvent) {
          const pointerContext = ui.cameraPointerContext;
          state.hullBuildPoints = event.points;
          pointerContext.textContent = 'PERSPECTIVE / hull';
          if (event.phase === 'cancel') {
            state.hullCandidate = null;
            state.renderer?.setDocument(state.session.document, state.session.selection);
            app.inspector.updateInspector();
            ui.statusMessage.textContent = 'Hull point set discarded.';
            return;
          }
          try {
            const brush = createConvexHullBrush(
              event.points,
              state.activeMaterialName || 'DEV_PILLAR',
              createSequentialIdFactory(`hull-${state.hullSequence + 1}`),
            );
            const candidate = {
              ...state.session.createBrushCandidate(brush, app.document.openGroupEntityId()),
              label: 'Create hull brush',
            };
            if (event.phase === 'preview') {
              state.hullCandidate = candidate;
              state.renderer?.setDocument(state.session.document, state.session.selection);
              app.inspector.updateInspector();
              ui.statusMessage.textContent = `${event.points.length} hull points enclose a valid brush. Press Enter or Create hull.`;
              return;
            }
            state.hullBuildPoints = [];
            state.session.commitCreationCandidate(state.hullCandidate ?? candidate);
            state.hullCandidate = null;
            state.hullSequence += 1;
          } catch (error) {
            state.hullCandidate = null;
            state.renderer?.setDocument(state.session.document, state.session.selection);
            app.inspector.updateInspector();
            if (event.phase === 'commit') throw error;
            ui.statusMessage.textContent =
              event.points.length < 4
                ? `${event.points.length} hull points placed. Add at least four non-coplanar points.`
                : error instanceof Error
                  ? error.message
                  : String(error);
          }
        },
        onBrushCreate(event: EditorBrushCreateEvent) {
          const pointerContext = ui.cameraPointerContext;
          if (event.phase === 'cancel' || !event.bounds) {
            state.creationCandidate = null;
            state.creationSequence += 1;
            ui.simpleShapeResult.textContent = 'Drag to draw';
            state.renderer?.setDocument(state.session.document, state.session.selection);
            app.inspector.updateInspector();
            ui.statusMessage.textContent = 'Brush creation cancelled.';
            pointerContext.textContent = `${event.viewport.toUpperCase()} / create`;
            return;
          }

          try {
            const ids = createSequentialIdFactory(`created-${state.creationSequence + 1}`);
            const brushes = createSimpleShapeBrushes(
              event.bounds,
              state.activeMaterialName || 'DEV_PILLAR',
              state.simpleShapeOptions,
              ids,
            );
            const label = `Create ${app.geometry.simpleShapeLabel(state.simpleShapeOptions.kind)}`;
            const candidate = state.session.createBrushesCandidate(
              brushes,
              label,
              app.document.openGroupEntityId(),
            );
            if (event.phase === 'preview') {
              state.creationCandidate = candidate;
              const selection = createBrushSelection(candidate.selectionAfter);
              state.renderer?.setDocument(candidate.document, selection);
              app.inspector.updateInspector(candidate.document, selection);
              ui.simpleShapeResult.textContent = `${brushes.length} ${brushes.length === 1 ? 'brush' : 'brushes'}`;
              ui.statusMessage.textContent = `${app.geometry.simpleShapeLabel(state.simpleShapeOptions.kind)} preview${event.constraint === 'none' ? '' : ` (${event.constraint})`}: ${brushes.length} ${brushes.length === 1 ? 'brush' : 'brushes'}, ${app.build.formatVector(event.bounds.min)} to ${app.build.formatVector(event.bounds.max)}. Release to commit.`;
              pointerContext.textContent = `${event.viewport.toUpperCase()} / create`;
              return;
            }
            state.session.commitBatchCreationCandidate(state.creationCandidate ?? candidate);
            state.creationCandidate = null;
            state.creationSequence += 1;
            ui.simpleShapeResult.textContent = `${brushes.length} created`;
            pointerContext.textContent = `${event.viewport.toUpperCase()} / create`;
          } catch (error) {
            state.creationCandidate = null;
            state.creationSequence += 1;
            ui.simpleShapeResult.textContent = 'Invalid bounds';
            state.renderer?.setDocument(state.session.document, state.session.selection);
            app.inspector.updateInspector();
            ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
            pointerContext.textContent = `${event.viewport.toUpperCase()} / create`;
          }
        },
      });
      if (signal.aborted) {
        renderer.dispose();
        signal.throwIfAborted();
      }
      state.renderer = renderer;
      const applyPerspectiveOnly = (enabled: boolean) => {
        renderer.setRenderedViewports(
          enabled ? ['perspective'] : ['perspective', 'xy', 'xz', 'yz'],
        );
        ui.viewportLayout.setPerspectiveOnly(enabled);
      };
      app.viewportWorkspace.bind({
        applyCameras(cameras) {
          renderer.restoreViewportCameras(cameras);
        },
        applyLayout(layout) {
          app.document.restoreWorkspaceLayout(layout);
        },
        applyPerspectiveOnly,
      });
      ui.viewportLayout.bind({
        setPerspectiveOnly(enabled) {
          app.viewportWorkspace.setPerspectiveOnly(enabled);
        },
      });
      renderScheduler.setTarget(renderer);
      renderScheduler.start();
      ui.statusMessage.textContent = 'Source renderer ready. Select a brush in any viewport.';
    } catch (error) {
      renderScheduler.dispose();
      if (this.scheduler === renderScheduler) this.scheduler = null;
      if (signal.aborted) signal.throwIfAborted();
      ui.viewportError.hidden = false;
      ui.viewportError.textContent = error instanceof Error ? error.message : String(error);
      ui.statusMessage.textContent = 'WebGPU renderer could not start.';
    }
  }

  public dispose(): void {
    this.scheduler?.dispose();
    this.scheduler = null;
    this.dependencies.state.renderer?.dispose();
    this.dependencies.state.renderer = null;
    this.dependencies.ui.viewportLayout.unbind();
    this.dependencies.viewportWorkspace.unbind();
  }
}
