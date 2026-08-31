import {
  brushesInDocument,
  createBoxBrush,
  createFaceSelection,
  createObjectSelection,
  createSequentialIdFactory,
  deriveBrush,
  deriveEditorGroups,
  deriveEditorLayers,
  findBrush,
  BrushIdSchema,
  EntityIdSchema,
  FaceIdSchema,
  materialUsageInDocument,
  planMapSave,
  pointEntitiesInDocument,
  selectedBrushIds,
  selectedPointEntityIds,
  serializeMap,
  type EditorTool,
} from '@jackharrhy/worldview-editor';
import { z } from 'zod';

import type { EditorShellState } from './editor-shell-state.js';

type WebMcpUi = Pick<EditorShellState, 'statusMessage'>;
import type { EditorState } from './editor-state.js';
import type { ProjectPresenter } from './project-presenter.js';
import type { SessionPresenter } from './session-presenter.js';
import {
  DESTRUCTIVE_ANNOTATIONS,
  EmptyInputSchema,
  ExpectedDocumentInputSchema,
  READ_ONLY_ANNOTATIONS,
  TOOL_VALUES,
  VIEW_ANNOTATIONS,
  WebMcpVec3Schema,
  defineWebMcpTool,
  result,
  type ExpectedDocumentInput,
  type JsonObject,
  type WebMcpDocument,
  type WebMcpTool,
} from './webmcp-contract.js';
import { createWebMcpDocumentTools } from './webmcp-document-tools.js';
import { webMcpDocumentState, webMcpSelectionSummary } from './webmcp-state.js';

const PaginationOffsetSchema = z.number().int().nonnegative().default(0);
const PaginationLimitSchema = z.number().int().min(1).max(100).default(50);
const BrushIdInputSchema = BrushIdSchema;
const EntityIdInputSchema = EntityIdSchema;
const FaceIdInputSchema = FaceIdSchema;
const ListObjectsInputSchema = z.strictObject({
  kind: z.enum(['all', 'brush', 'entity']).default('all'),
  query: z.string().max(256).default(''),
  offset: PaginationOffsetSchema,
  limit: PaginationLimitSchema,
});
const ListMaterialsInputSchema = z.strictObject({
  query: z.string().max(256).default(''),
  usedOnly: z.boolean().default(false),
  offset: PaginationOffsetSchema,
  limit: PaginationLimitSchema,
});
const MapSourceInputSchema = z.strictObject({
  mode: z.enum(['save', 'original', 'normalized']).default('save'),
  offset: PaginationOffsetSchema,
  maxChars: z.number().int().min(1).max(100_000).default(20_000),
});
const FrameViewInputSchema = z.strictObject({ target: z.enum(['document', 'selection']) });
const SetToolInputSchema = z.strictObject({
  tool: z.enum(TOOL_VALUES),
});
const SelectionInputSchema = z.discriminatedUnion('mode', [
  ExpectedDocumentInputSchema.extend({ mode: z.enum(['clear', 'all', 'invert']) }),
  ExpectedDocumentInputSchema.extend({
    mode: z.literal('objects'),
    brushIds: z.array(BrushIdInputSchema).max(1_024).default([]),
    entityIds: z.array(EntityIdInputSchema).max(1_024).default([]),
  }),
  ExpectedDocumentInputSchema.extend({
    mode: z.literal('faces'),
    faces: z
      .array(
        z.strictObject({
          brushId: BrushIdInputSchema,
          faceId: FaceIdInputSchema,
        }),
      )
      .min(1)
      .max(1_024),
  }),
  ExpectedDocumentInputSchema.extend({
    mode: z.literal('issue'),
    issueId: z.string().min(1).max(512),
  }),
  ExpectedDocumentInputSchema.extend({
    mode: z.enum(['material-faces', 'material-brushes']),
    material: z.string().min(1).max(256),
  }),
]);
const TranslateInputSchema = ExpectedDocumentInputSchema.extend({
  delta: WebMcpVec3Schema,
  textureLock: z.boolean().default(true),
});
const axisSchema = z.enum(['x', 'y', 'z']);
const RotateInputSchema = ExpectedDocumentInputSchema.extend({
  pivot: WebMcpVec3Schema,
  axis: axisSchema,
  degrees: z.number().finite(),
  textureLock: z.boolean().default(true),
});
const ScaleInputSchema = ExpectedDocumentInputSchema.extend({
  pivot: WebMcpVec3Schema,
  factors: WebMcpVec3Schema,
  textureLock: z.boolean().default(true),
});
const ShearInputSchema = ExpectedDocumentInputSchema.extend({
  pivot: WebMcpVec3Schema,
  sourceAxis: axisSchema,
  targetAxis: axisSchema,
  factor: z.number().finite(),
  textureLock: z.boolean().default(true),
});
const ApplyMaterialInputSchema = ExpectedDocumentInputSchema.extend({
  material: z.string().trim().min(1).max(256),
});
const EditEntityPropertyInputSchema = ExpectedDocumentInputSchema.extend({
  entityId: EntityIdInputSchema,
  key: z.string().min(1).max(256),
  value: z.string().max(16_384).nullable(),
  protect: z.boolean().default(false),
});
const CreateBoxInputSchema = ExpectedDocumentInputSchema.extend({
  min: WebMcpVec3Schema,
  max: WebMcpVec3Schema,
  material: z.string().trim().min(1).max(256),
  entityId: EntityIdInputSchema.optional(),
});
const EntityPropertiesSchema = z
  .record(z.string().max(256), z.string().max(16_384))
  .refine((properties) => Object.keys(properties).length <= 128, {
    message: 'must contain at most 128 properties',
  });
const CreatePointEntityInputSchema = ExpectedDocumentInputSchema.extend({
  classname: z.string().trim().min(1).max(256),
  origin: WebMcpVec3Schema,
  properties: EntityPropertiesSchema.default({}),
});
const DuplicateSelectionInputSchema = ExpectedDocumentInputSchema.extend({
  delta: WebMcpVec3Schema,
  textureLock: z.boolean().default(true),
});
const HistoryInputSchema = ExpectedDocumentInputSchema.extend({ action: z.enum(['undo', 'redo']) });

function transformAxis(axis: 'x' | 'y' | 'z'): 0 | 1 | 2 {
  return axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
}

export class WebMcpPresenter {
  private idSequence = 0;
  private readonly ownerId = crypto.randomUUID();

  public constructor(
    private readonly state: EditorState,
    private readonly ui: WebMcpUi,
    private readonly setEditorTool: (tool: EditorTool) => void,
    private readonly replaceDocument: SessionPresenter['replaceDocument'],
    private readonly openEditorMap: ProjectPresenter['openEditorMap'],
    private readonly signal: AbortSignal,
  ) {}

  private status(message: string): void {
    this.ui.statusMessage.set(`Site tool: ${message}`);
  }

  private assertRevision(input: ExpectedDocumentInput): number {
    const { expectedDocumentId, expectedRevision: expected } = input;
    const currentDocumentId = this.state.session.document.id;
    const current = this.state.session.document.revision;
    if (expectedDocumentId !== currentDocumentId) {
      throw new Error(
        `Stale document identity: expected ${expectedDocumentId}, current document is ${currentDocumentId}`,
      );
    }
    if (expected !== current) {
      throw new Error(
        `Stale document revision: expected ${expected}, current revision is ${current}`,
      );
    }
    return current;
  }

  private ids(label: string) {
    this.idSequence += 1;
    return createSequentialIdFactory(
      `site-tool-${label}-${this.state.session.document.revision}-${this.idSequence}`,
    );
  }

  private performEdit(
    input: ExpectedDocumentInput,
    action: () => boolean,
    successMessage: string,
  ): JsonObject {
    this.assertRevision(input);
    if (!action()) throw new Error('The requested edit did not change the document');
    this.status(successMessage);
    return result(successMessage, webMcpDocumentState(this.state));
  }

  private inspectTool(): WebMcpTool {
    return defineWebMcpTool(EmptyInputSchema, {
      name: 'worldview_inspect_editor',
      description:
        'Inspect the live Worldview map, selection, project, resources, history, camera, and source-save safety.',
      annotations: READ_ONLY_ANNOTATIONS,
      execute: () => {
        const document = this.state.session.document;
        const brushes = brushesInDocument(document);
        const pointEntities = pointEntitiesInDocument(document);
        const savePlan = planMapSave(document, this.state.currentMapSource);
        const issues = this.state.session.issues;
        const project = this.state.projectWorkspace;
        return result('Inspected the live Worldview editor.', {
          ...webMcpDocumentState(this.state),
          activeTool: this.state.activeTool,
          gridSize: this.state.activeGridSize,
          counts: {
            entities: document.entities.length,
            pointEntities: pointEntities.length,
            primitives: brushes.length,
            faces: brushes.reduce((sum, brush) => sum + brush.faces.length, 0),
            groups: deriveEditorGroups(document).length,
            layers: deriveEditorLayers(document).length,
            issues: issues.length,
            materialsInMap: materialUsageInDocument(document).length,
            materialsLoaded: this.state.materialCatalog.size,
          },
          issueSummary: {
            errors: issues.filter((issue) => issue.severity === 'error').length,
            warnings: issues.filter((issue) => issue.severity === 'warning').length,
          },
          sourceSave: {
            status: savePlan.status,
            fingerprint: this.state.currentMapSource.fingerprint,
            diagnostics: savePlan.diagnostics,
          },
          project: project
            ? {
                name: project.manifest.name,
                game: project.manifest.game,
                maps: project.maps.length,
                currentMap: this.state.currentDocumentName,
              }
            : null,
          build: {
            profileId: this.state.activeCompileProfileId,
            quality: this.state.activeCompileQuality,
            compiledRevision: this.state.compiledRevision,
            showingCompiled: this.state.showingCompiled,
            latestStatus: this.state.latestBuild?.status ?? null,
          },
          perspectiveCamera:
            this.state.renderer?.viewportCamera('perspective') ?? this.state.perspectiveCamera,
        });
      },
    });
  }

  private listObjectsTool(): WebMcpTool {
    return defineWebMcpTool(ListObjectsInputSchema, {
      name: 'worldview_list_objects',
      description:
        'List live brush and entity IDs with concise geometry, ownership, material, and property details for later selection or editing.',
      annotations: READ_ONLY_ANNOTATIONS,
      execute: ({ kind, query: rawQuery, offset, limit }) => {
        const query = rawQuery.trim().toLowerCase();
        const document = this.state.session.document;
        const selectedBrushes = new Set(selectedBrushIds(this.state.session.selection));
        const selectedEntities = new Set(selectedPointEntityIds(this.state.session.selection));
        const objects: JsonObject[] = [];
        if (kind !== 'entity') {
          for (const entity of document.entities) {
            for (const brush of entity.primitives) {
              if (brush.kind !== 'brush') continue;
              const derived = deriveBrush(brush);
              objects.push({
                kind: 'brush',
                id: brush.id,
                selected: selectedBrushes.has(brush.id),
                ownerEntityId: entity.id,
                ownerClassname: entity.properties.classname ?? '',
                faceCount: brush.faces.length,
                materials: [...new Set(brush.faces.map((face) => face.material))].toSorted(),
                bounds: derived.bounds,
                valid: derived.valid,
              });
            }
          }
        }
        if (kind !== 'brush') {
          for (const entity of document.entities) {
            objects.push({
              kind: 'entity',
              id: entity.id,
              selected: selectedEntities.has(entity.id),
              classname: entity.properties.classname ?? '',
              brushCount: entity.primitives.length,
              properties: entity.properties,
            });
          }
        }
        const filtered = query
          ? objects.filter((object) => JSON.stringify(object).toLowerCase().includes(query))
          : objects;
        return result(`Listed ${Math.min(limit, Math.max(0, filtered.length - offset))} objects.`, {
          revision: document.revision,
          total: filtered.length,
          offset,
          limit,
          objects: filtered.slice(offset, offset + limit),
        });
      },
    });
  }

  private listIssuesTool(): WebMcpTool {
    return defineWebMcpTool(EmptyInputSchema, {
      name: 'worldview_list_issues',
      description:
        'List current map diagnostics and the stable object IDs implicated by each issue.',
      annotations: READ_ONLY_ANNOTATIONS,
      execute: () =>
        result(`Listed ${this.state.session.issues.length} map issues.`, {
          revision: this.state.session.document.revision,
          issues: this.state.session.issues.map((issue) => ({
            id: issue.id,
            type: issue.type,
            category: issue.category,
            severity: issue.severity,
            message: issue.message,
            brushIds: issue.brushIds,
            entityIds: issue.entityIds,
            fixLabel: issue.fix?.label ?? null,
          })),
        }),
    });
  }

  private listMaterialsTool(): WebMcpTool {
    return defineWebMcpTool(ListMaterialsInputSchema, {
      name: 'worldview_list_materials',
      description:
        'List materials used by the map and/or loaded from project WADs, with usage counts and source dimensions.',
      annotations: READ_ONLY_ANNOTATIONS,
      execute: ({ query: rawQuery, usedOnly, offset, limit }) => {
        const query = rawQuery.trim().toLowerCase();
        const usages = new Map(
          materialUsageInDocument(this.state.session.document).map((usage) => [
            usage.material.toLowerCase(),
            usage,
          ]),
        );
        const names = new Map<string, string>();
        for (const usage of usages.values())
          names.set(usage.material.toLowerCase(), usage.material);
        if (!usedOnly) {
          for (const material of this.state.materialCatalog.materials()) {
            names.set(material.name.toLowerCase(), material.name);
          }
        }
        const materials = [];
        for (const [key, name] of names) {
          const loaded = this.state.materialCatalog.find(name);
          const usage = usages.get(key);
          const material = {
            name,
            loaded: Boolean(loaded),
            sourceName: loaded?.sourceName ?? null,
            width: loaded?.width ?? null,
            height: loaded?.height ?? null,
            faceCount: usage?.faceCount ?? 0,
            brushCount: usage?.brushCount ?? 0,
          };
          if (!query || JSON.stringify(material).toLowerCase().includes(query)) {
            materials.push(material);
          }
        }
        materials.sort((left, right) => left.name.localeCompare(right.name));
        return result(
          `Listed ${Math.min(limit, Math.max(0, materials.length - offset))} materials.`,
          {
            revision: this.state.session.document.revision,
            total: materials.length,
            offset,
            limit,
            materials: materials.slice(offset, offset + limit),
          },
        );
      },
    });
  }

  private getMapSourceTool(): WebMcpTool {
    return defineWebMcpTool(MapSourceInputSchema, {
      name: 'worldview_get_map_source',
      description:
        'Read a bounded slice of source-preserving save text, original source, or an explicitly normalized map copy.',
      annotations: READ_ONLY_ANNOTATIONS,
      execute: ({ mode, offset, maxChars }) => {
        const plan = planMapSave(this.state.session.document, this.state.currentMapSource);
        const text =
          mode === 'original'
            ? this.state.currentMapSource.originalText
            : mode === 'normalized'
              ? serializeMap(this.state.session.document)
              : plan.status === 'safe'
                ? plan.text
                : null;
        const slice = text?.slice(offset, offset + maxChars) ?? null;
        return result(
          text
            ? `Read ${slice?.length ?? 0} map-source characters.`
            : 'Source-preserving save is blocked.',
          {
            revision: this.state.session.document.revision,
            mode,
            saveStatus: plan.status,
            diagnostics: plan.diagnostics,
            offset,
            totalChars: text?.length ?? null,
            truncated: text ? offset + maxChars < text.length : false,
            text: slice,
          },
        );
      },
    });
  }

  private frameViewTool(): WebMcpTool {
    return defineWebMcpTool(FrameViewInputSchema, {
      name: 'worldview_frame_view',
      description: 'Frame the entire map or current selection in all live editor viewports.',
      annotations: { ...VIEW_ANNOTATIONS, idempotentHint: true },
      execute: ({ target }) => {
        const framed =
          target === 'document'
            ? this.state.renderer?.focusDocument()
            : target === 'selection'
              ? this.state.renderer?.focusSelection()
              : null;
        if (!framed) throw new Error(`Cannot frame ${target}`);
        this.status(`framed the ${target} in every viewport.`);
        return result(`Framed the ${target}.`, {
          revision: this.state.session.document.revision,
          target,
          perspectiveCamera: this.state.renderer?.viewportCamera('perspective') ?? null,
        });
      },
    });
  }

  private setToolTool(): WebMcpTool {
    return defineWebMcpTool(SetToolInputSchema, {
      name: 'worldview_set_tool',
      description: 'Activate one of Worldview’s normal visible editing tools.',
      annotations: VIEW_ANNOTATIONS,
      execute: ({ tool }) => {
        this.setEditorTool(tool);
        this.status(`activated the ${tool} tool.`);
        return result(`Activated the ${tool} tool.`, {
          revision: this.state.session.document.revision,
          activeTool: this.state.activeTool,
          selection: webMcpSelectionSummary(this.state.session.selection),
        });
      },
    });
  }

  private selectTool(): WebMcpTool {
    return defineWebMcpTool(SelectionInputSchema, {
      name: 'worldview_select',
      description:
        'Select live objects, faces, an issue, material usage, all editable objects, or the inverse selection.',
      annotations: VIEW_ANNOTATIONS,
      execute: (input) => {
        this.assertRevision(input);
        const { mode } = input;
        const session = this.state.session;
        if (mode === 'clear') session.select(null);
        else if (mode === 'all') session.selectAllEditable();
        else if (mode === 'invert') session.invertObjectSelection();
        else if (mode === 'issue') {
          if (!session.selectIssue(input.issueId)) {
            throw new Error(`Unknown or empty issue ${input.issueId}`);
          }
        } else if (mode === 'material-faces') {
          session.selectFacesUsingMaterial(input.material);
        } else if (mode === 'material-brushes') {
          session.selectBrushesUsingMaterial(input.material);
        } else if (mode === 'objects') {
          const brushIds = [...new Set(input.brushIds)];
          const entityIds = [...new Set(input.entityIds)];
          for (const brushId of brushIds) {
            if (!findBrush(session.document, brushId)) throw new Error(`Unknown brush ${brushId}`);
          }
          const pointIds = new Set(
            pointEntitiesInDocument(session.document).map((entity) => entity.id),
          );
          for (const entityId of entityIds) {
            if (!pointIds.has(entityId)) throw new Error(`Unknown point entity ${entityId}`);
          }
          session.select(createObjectSelection(brushIds, entityIds));
        } else if (mode === 'faces') {
          const faces = input.faces.map((face) => {
            const { brushId, faceId } = face;
            const brush = findBrush(session.document, brushId);
            if (!brush?.faces.some((candidate) => candidate.id === faceId)) {
              throw new Error(`Unknown face ${brushId}/${faceId}`);
            }
            return { brushId, faceId };
          });
          session.select(createFaceSelection(faces));
        } else throw new Error(`Unknown selection mode ${mode}`);
        this.status(`updated the ${mode} selection.`);
        return result('Updated the live selection.', {
          revision: session.document.revision,
          selection: webMcpSelectionSummary(this.state.session.selection),
        });
      },
    });
  }

  private translateTool(): WebMcpTool {
    return defineWebMcpTool(TranslateInputSchema, {
      name: 'worldview_translate_selection',
      description: 'Move the selected brushes and point entities as one undoable transaction.',
      annotations: VIEW_ANNOTATIONS,
      execute: (input) =>
        this.performEdit(
          input,
          () => this.state.session.translateSelected(input.delta, input.textureLock),
          'translated the selection.',
        ),
    });
  }

  private rotateTool(): WebMcpTool {
    return defineWebMcpTool(RotateInputSchema, {
      name: 'worldview_rotate_selection',
      description:
        'Rotate the selected brushes and point entities around a pivot as one undoable transaction.',
      annotations: VIEW_ANNOTATIONS,
      execute: (input) =>
        this.performEdit(
          input,
          () =>
            this.state.session.rotateSelected(
              input.pivot,
              transformAxis(input.axis),
              input.degrees,
              input.textureLock,
            ),
          'rotated the selection.',
        ),
    });
  }

  private scaleTool(): WebMcpTool {
    return defineWebMcpTool(ScaleInputSchema, {
      name: 'worldview_scale_selection',
      description:
        'Scale the selected brushes and point entities around a pivot as one undoable transaction.',
      annotations: VIEW_ANNOTATIONS,
      execute: (input) =>
        this.performEdit(
          input,
          () => this.state.session.scaleSelected(input.pivot, input.factors, input.textureLock),
          'scaled the selection.',
        ),
    });
  }

  private shearTool(): WebMcpTool {
    return defineWebMcpTool(ShearInputSchema, {
      name: 'worldview_shear_selection',
      description:
        'Shear the selected brushes and point entities around a pivot as one undoable transaction.',
      annotations: VIEW_ANNOTATIONS,
      execute: (input) => {
        const source = transformAxis(input.sourceAxis);
        const target = transformAxis(input.targetAxis);
        if (source === target) throw new Error('sourceAxis and targetAxis must differ');
        return this.performEdit(
          input,
          () =>
            this.state.session.shearSelected(
              input.pivot,
              source,
              target,
              input.factor,
              input.textureLock,
            ),
          'sheared the selection.',
        );
      },
    });
  }

  private applyMaterialTool(): WebMcpTool {
    return defineWebMcpTool(ApplyMaterialInputSchema, {
      name: 'worldview_apply_material',
      description:
        'Apply a material token to the current face or brush selection as one undoable edit.',
      annotations: VIEW_ANNOTATIONS,
      execute: (input) => {
        const { material } = input;
        return this.performEdit(
          input,
          () => this.state.session.applyMaterial(material),
          `applied material ${material}.`,
        );
      },
    });
  }

  private editEntityPropertyTool(): WebMcpTool {
    return defineWebMcpTool(EditEntityPropertyInputSchema, {
      name: 'worldview_edit_entity_property',
      description: 'Add, update, or remove one raw entity property as an undoable edit.',
      annotations: VIEW_ANNOTATIONS,
      execute: (input) => {
        const { entityId } = input;
        const { key, value } = input;
        return this.performEdit(
          input,
          () => this.state.session.setEntityProperty(entityId, key, value, input.protect),
          `${value === null ? 'removed' : 'updated'} entity property ${key}.`,
        );
      },
    });
  }

  private createBoxTool(): WebMcpTool {
    return defineWebMcpTool(CreateBoxInputSchema, {
      name: 'worldview_create_box',
      description: 'Create and select one axis-aligned six-face brush as an undoable edit.',
      annotations: VIEW_ANNOTATIONS,
      execute: (input) => {
        this.assertRevision(input);
        const minimum = input.min;
        const maximum = input.max;
        if (minimum.some((component, index) => component >= maximum[index]!)) {
          throw new Error('max must be greater than min on every axis');
        }
        const ids = this.ids('box');
        const brush = createBoxBrush(minimum, maximum, input.material, ids);
        const { entityId } = input;
        this.state.session.commitCreationCandidate(
          this.state.session.createBrushCandidate(brush, entityId),
        );
        this.status(`created brush ${brush.id}.`);
        return result(`Created brush ${brush.id}.`, {
          ...webMcpDocumentState(this.state),
          brushId: brush.id,
        });
      },
    });
  }

  private createPointEntityTool(): WebMcpTool {
    return defineWebMcpTool(CreatePointEntityInputSchema, {
      name: 'worldview_create_point_entity',
      description: 'Create and select a point entity with raw properties as one undoable edit.',
      annotations: VIEW_ANNOTATIONS,
      execute: (input) => {
        this.assertRevision(input);
        const { classname } = input;
        this.state.session.createPointEntity(
          classname,
          input.origin,
          this.ids('entity'),
          input.properties,
        );
        const entityId = this.state.session.selection?.entityId ?? null;
        this.status(`created ${classname} ${entityId ?? ''}.`.trim());
        return result(`Created ${classname}.`, {
          ...webMcpDocumentState(this.state),
          entityId,
        });
      },
    });
  }

  private duplicateSelectionTool(): WebMcpTool {
    return defineWebMcpTool(DuplicateSelectionInputSchema, {
      name: 'worldview_duplicate_selection',
      description: 'Duplicate the selected objects with an offset as one undoable edit.',
      annotations: VIEW_ANNOTATIONS,
      execute: (input) => {
        return this.performEdit(
          input,
          () =>
            this.state.session.duplicateSelected(
              this.ids('duplicate'),
              input.delta,
              input.textureLock,
              this.state.openGroupId,
            ),
          'duplicated the selection.',
        );
      },
    });
  }

  private deleteSelectionTool(): WebMcpTool {
    return defineWebMcpTool(ExpectedDocumentInputSchema, {
      name: 'worldview_delete_selection',
      description: 'Delete the selected objects as one undoable edit.',
      annotations: DESTRUCTIVE_ANNOTATIONS,
      execute: (input) => {
        return this.performEdit(
          input,
          () => this.state.session.deleteSelected(),
          'deleted the selection.',
        );
      },
    });
  }

  private historyTool(): WebMcpTool {
    return defineWebMcpTool(HistoryInputSchema, {
      name: 'worldview_history',
      description: 'Undo or redo one live Worldview history transaction.',
      annotations: VIEW_ANNOTATIONS,
      execute: (input) => {
        this.assertRevision(input);
        const { action } = input;
        const changed = action === 'undo' ? this.state.session.undo() : this.state.session.redo();
        if (!changed) throw new Error(`Nothing to ${action}`);
        this.status(`${action} completed.`);
        return result(
          `${action === 'undo' ? 'Undid' : 'Redid'} one transaction.`,
          webMcpDocumentState(this.state),
        );
      },
    });
  }

  private tools(): readonly WebMcpTool[] {
    return [
      this.inspectTool(),
      this.listObjectsTool(),
      this.listIssuesTool(),
      this.listMaterialsTool(),
      this.getMapSourceTool(),
      this.frameViewTool(),
      this.setToolTool(),
      this.selectTool(),
      this.translateTool(),
      this.rotateTool(),
      this.scaleTool(),
      this.shearTool(),
      this.applyMaterialTool(),
      this.editEntityPropertyTool(),
      this.createBoxTool(),
      this.createPointEntityTool(),
      this.duplicateSelectionTool(),
      this.deleteSelectionTool(),
      this.historyTool(),
      ...createWebMcpDocumentTools({
        state: this.state,
        signal: this.signal,
        replaceDocument: this.replaceDocument,
        openEditorMap: this.openEditorMap,
        assertDocument: (input) => this.assertRevision(input),
        ids: (label) => this.ids(label),
        status: (message) => this.status(message),
      }),
    ];
  }

  public async connect(): Promise<void> {
    this.signal.throwIfAborted();
    const root = document.documentElement;
    root.dataset.worldviewSiteToolOwner = this.ownerId;
    const modelContext = (document as WebMcpDocument).modelContext;
    if (!modelContext?.registerTool) {
      root.dataset.worldviewSiteTools = 'unsupported';
      root.dataset.worldviewSiteToolCount = '0';
      return;
    }
    const tools = this.tools().map<WebMcpTool>((tool) =>
      Object.assign({}, tool, {
        execute: (input: unknown) => {
          this.signal.throwIfAborted();
          return tool.execute(input);
        },
      }),
    );
    const registrations = await Promise.allSettled(
      tools.map(async (tool) => modelContext.registerTool(tool, { signal: this.signal })),
    );
    this.signal.throwIfAborted();
    const registered = registrations.filter(
      (registration) => registration.status === 'fulfilled',
    ).length;
    const failure = registrations.find((registration) => registration.status === 'rejected');
    root.dataset.worldviewSiteToolCount = String(registered);
    if (failure?.status === 'rejected') {
      root.dataset.worldviewSiteTools = 'error';
      this.ui.statusMessage.set(
        `Site tool registration failed; ${registered} of ${tools.length} tools are available: ${failure.reason instanceof Error ? failure.reason.message : String(failure.reason)}`,
      );
      return;
    }
    root.dataset.worldviewSiteTools = 'ready';
  }

  public dispose(): void {
    const root = document.documentElement;
    if (root.dataset.worldviewSiteToolOwner !== this.ownerId) return;
    delete root.dataset.worldviewSiteToolOwner;
    delete root.dataset.worldviewSiteTools;
    delete root.dataset.worldviewSiteToolCount;
  }
}
