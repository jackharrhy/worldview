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
  materialUsageInDocument,
  planMapSave,
  pointEntitiesInDocument,
  selectedBrushIds,
  selectedPointEntityIds,
  serializeMap,
  type BrushId,
  type EditorTool,
  type EntityId,
  type FaceId,
} from '@jackharrhy/worldview-editor';

import type { EditorElements } from './editor-elements.js';
import type { EditorState } from './editor-state.js';
import type { ProjectPresenter } from './project-presenter.js';
import type { SessionPresenter } from './session-presenter.js';
import {
  EMPTY_SCHEMA,
  EXPECTED_DOCUMENT_PROPERTIES,
  EXPECTED_DOCUMENT_REQUIRED,
  DESTRUCTIVE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  TOOL_VALUES,
  VEC3_SCHEMA,
  VIEW_ANNOTATIONS,
  axis,
  finiteNumber,
  inputRecord,
  integer,
  optionalBoolean,
  optionalString,
  requiredString,
  result,
  stringArray,
  vec3,
  type JsonObject,
  type WebMcpDocument,
  type WebMcpTool,
} from './webmcp-contract.js';
import { createWebMcpDocumentTools } from './webmcp-document-tools.js';
import { webMcpDocumentState, webMcpSelectionSummary } from './webmcp-state.js';

export class WebMcpPresenter {
  private idSequence = 0;

  public constructor(
    private readonly state: EditorState,
    private readonly ui: EditorElements,
    private readonly setEditorTool: (tool: EditorTool) => void,
    private readonly replaceDocument: SessionPresenter['replaceDocument'],
    private readonly openEditorMap: ProjectPresenter['openEditorMap'],
  ) {}

  private status(message: string): void {
    this.ui.statusMessage.textContent = `Site tool: ${message}`;
  }

  private assertRevision(input: Record<string, unknown>): number {
    const expectedDocumentId = requiredString(input, 'expectedDocumentId', 512);
    const expected = integer(input, 'expectedRevision', 0, Number.MAX_SAFE_INTEGER);
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
    input: Record<string, unknown>,
    action: () => boolean,
    successMessage: string,
  ): JsonObject {
    this.assertRevision(input);
    if (!action()) throw new Error('The requested edit did not change the document');
    this.status(successMessage);
    return result(successMessage, webMcpDocumentState(this.state));
  }

  private inspectTool(): WebMcpTool {
    return {
      name: 'worldview_inspect_editor',
      description:
        'Inspect the live Worldview map, selection, project, resources, history, camera, and source-save safety.',
      inputSchema: EMPTY_SCHEMA,
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
            brushes: brushes.length,
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
    };
  }

  private listObjectsTool(): WebMcpTool {
    return {
      name: 'worldview_list_objects',
      description:
        'List live brush and entity IDs with concise geometry, ownership, material, and property details for later selection or editing.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['all', 'brush', 'entity'], default: 'all' },
          query: { type: 'string', maxLength: 256 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        const kind = optionalString(input, 'kind', 16) ?? 'all';
        if (!['all', 'brush', 'entity'].includes(kind)) throw new Error('kind is invalid');
        const query = (optionalString(input, 'query', 256) ?? '').trim().toLowerCase();
        const offset = integer(input, 'offset', 0, Number.MAX_SAFE_INTEGER, 0);
        const limit = integer(input, 'limit', 1, 100, 50);
        const document = this.state.session.document;
        const selectedBrushes = new Set(selectedBrushIds(this.state.session.selection));
        const selectedEntities = new Set(selectedPointEntityIds(this.state.session.selection));
        const objects: JsonObject[] = [];
        if (kind !== 'entity') {
          for (const entity of document.entities) {
            for (const brush of entity.brushes) {
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
              brushCount: entity.brushes.length,
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
    };
  }

  private listIssuesTool(): WebMcpTool {
    return {
      name: 'worldview_list_issues',
      description:
        'List current map diagnostics and the stable object IDs implicated by each issue.',
      inputSchema: EMPTY_SCHEMA,
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
    };
  }

  private listMaterialsTool(): WebMcpTool {
    return {
      name: 'worldview_list_materials',
      description:
        'List materials used by the map and/or loaded from project WADs, with usage counts and source dimensions.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', maxLength: 256 },
          usedOnly: { type: 'boolean', default: false },
          offset: { type: 'integer', minimum: 0, default: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        const query = (optionalString(input, 'query', 256) ?? '').trim().toLowerCase();
        const usedOnly = optionalBoolean(input, 'usedOnly', false);
        const offset = integer(input, 'offset', 0, Number.MAX_SAFE_INTEGER, 0);
        const limit = integer(input, 'limit', 1, 100, 50);
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
    };
  }

  private getMapSourceTool(): WebMcpTool {
    return {
      name: 'worldview_get_map_source',
      description:
        'Read a bounded slice of source-preserving save text, original source, or an explicitly normalized map copy.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['save', 'original', 'normalized'], default: 'save' },
          offset: { type: 'integer', minimum: 0, default: 0 },
          maxChars: { type: 'integer', minimum: 1, maximum: 100000, default: 20000 },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        const mode = optionalString(input, 'mode', 16) ?? 'save';
        if (!['save', 'original', 'normalized'].includes(mode)) throw new Error('mode is invalid');
        const offset = integer(input, 'offset', 0, Number.MAX_SAFE_INTEGER, 0);
        const maxChars = integer(input, 'maxChars', 1, 100_000, 20_000);
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
    };
  }

  private frameViewTool(): WebMcpTool {
    return {
      name: 'worldview_frame_view',
      description: 'Frame the entire map or current selection in all live editor viewports.',
      inputSchema: {
        type: 'object',
        properties: { target: { type: 'string', enum: ['document', 'selection'] } },
        required: ['target'],
        additionalProperties: false,
      },
      annotations: { ...VIEW_ANNOTATIONS, idempotentHint: true },
      execute: (raw) => {
        const input = inputRecord(raw);
        const target = requiredString(input, 'target', 16);
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
    };
  }

  private setToolTool(): WebMcpTool {
    return {
      name: 'worldview_set_tool',
      description: 'Activate one of Worldview’s normal visible editing tools.',
      inputSchema: {
        type: 'object',
        properties: { tool: { type: 'string', enum: TOOL_VALUES } },
        required: ['tool'],
        additionalProperties: false,
      },
      annotations: VIEW_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        const tool = requiredString(input, 'tool', 16) as EditorTool;
        if (!TOOL_VALUES.includes(tool)) throw new Error(`Unknown editor tool ${tool}`);
        this.setEditorTool(tool);
        this.status(`activated the ${tool} tool.`);
        return result(`Activated the ${tool} tool.`, {
          revision: this.state.session.document.revision,
          activeTool: this.state.activeTool,
          selection: webMcpSelectionSummary(this.state.session.selection),
        });
      },
    };
  }

  private selectTool(): WebMcpTool {
    return {
      name: 'worldview_select',
      description:
        'Select live objects, faces, an issue, material usage, all editable objects, or the inverse selection.',
      inputSchema: {
        type: 'object',
        properties: {
          ...EXPECTED_DOCUMENT_PROPERTIES,
          mode: {
            type: 'string',
            enum: [
              'clear',
              'all',
              'invert',
              'objects',
              'faces',
              'issue',
              'material-faces',
              'material-brushes',
            ],
          },
          brushIds: { type: 'array', items: { type: 'string' }, maxItems: 1024 },
          entityIds: { type: 'array', items: { type: 'string' }, maxItems: 1024 },
          faces: {
            type: 'array',
            maxItems: 1024,
            items: {
              type: 'object',
              properties: { brushId: { type: 'string' }, faceId: { type: 'string' } },
              required: ['brushId', 'faceId'],
              additionalProperties: false,
            },
          },
          issueId: { type: 'string' },
          material: { type: 'string' },
        },
        required: [...EXPECTED_DOCUMENT_REQUIRED, 'mode'],
        additionalProperties: false,
      },
      annotations: VIEW_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        this.assertRevision(input);
        const mode = requiredString(input, 'mode', 32);
        const session = this.state.session;
        if (mode === 'clear') session.select(null);
        else if (mode === 'all') session.selectAllEditable();
        else if (mode === 'invert') session.invertObjectSelection();
        else if (mode === 'issue') {
          const issueId = requiredString(input, 'issueId', 512);
          if (!session.selectIssue(issueId)) throw new Error(`Unknown or empty issue ${issueId}`);
        } else if (mode === 'material-faces') {
          session.selectFacesUsingMaterial(requiredString(input, 'material', 256));
        } else if (mode === 'material-brushes') {
          session.selectBrushesUsingMaterial(requiredString(input, 'material', 256));
        } else if (mode === 'objects') {
          const brushIds = stringArray(input, 'brushIds') as readonly BrushId[];
          const entityIds = stringArray(input, 'entityIds') as readonly EntityId[];
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
          const rawFaces = input.faces;
          if (!Array.isArray(rawFaces) || rawFaces.length === 0 || rawFaces.length > 1_024) {
            throw new Error('faces must contain from 1 to 1024 face references');
          }
          const faces = rawFaces.map((rawFace) => {
            const faceInput = inputRecord(rawFace);
            const brushId = requiredString(faceInput, 'brushId', 512) as BrushId;
            const faceId = requiredString(faceInput, 'faceId', 512) as FaceId;
            const brush = findBrush(session.document, brushId);
            if (!brush?.faces.some((face) => face.id === faceId)) {
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
    };
  }

  private translateTool(): WebMcpTool {
    return this.selectionEditTool(
      'worldview_translate_selection',
      'Move the selected brushes and point entities as one undoable transaction.',
      { delta: VEC3_SCHEMA, textureLock: { type: 'boolean', default: true } },
      ['delta'],
      (input) =>
        this.state.session.translateSelected(
          vec3(input, 'delta'),
          optionalBoolean(input, 'textureLock', true),
        ),
      'translated the selection.',
    );
  }

  private rotateTool(): WebMcpTool {
    return this.selectionEditTool(
      'worldview_rotate_selection',
      'Rotate the selected brushes and point entities around a pivot as one undoable transaction.',
      {
        pivot: VEC3_SCHEMA,
        axis: { type: 'string', enum: ['x', 'y', 'z'] },
        degrees: { type: 'number' },
        textureLock: { type: 'boolean', default: true },
      },
      ['pivot', 'axis', 'degrees'],
      (input) =>
        this.state.session.rotateSelected(
          vec3(input, 'pivot'),
          axis(input, 'axis'),
          finiteNumber(input, 'degrees'),
          optionalBoolean(input, 'textureLock', true),
        ),
      'rotated the selection.',
    );
  }

  private scaleTool(): WebMcpTool {
    return this.selectionEditTool(
      'worldview_scale_selection',
      'Scale the selected brushes and point entities around a pivot as one undoable transaction.',
      { pivot: VEC3_SCHEMA, factors: VEC3_SCHEMA, textureLock: { type: 'boolean', default: true } },
      ['pivot', 'factors'],
      (input) =>
        this.state.session.scaleSelected(
          vec3(input, 'pivot'),
          vec3(input, 'factors'),
          optionalBoolean(input, 'textureLock', true),
        ),
      'scaled the selection.',
    );
  }

  private shearTool(): WebMcpTool {
    return this.selectionEditTool(
      'worldview_shear_selection',
      'Shear the selected brushes and point entities around a pivot as one undoable transaction.',
      {
        pivot: VEC3_SCHEMA,
        sourceAxis: { type: 'string', enum: ['x', 'y', 'z'] },
        targetAxis: { type: 'string', enum: ['x', 'y', 'z'] },
        factor: { type: 'number' },
        textureLock: { type: 'boolean', default: true },
      },
      ['pivot', 'sourceAxis', 'targetAxis', 'factor'],
      (input) => {
        const source = axis(input, 'sourceAxis');
        const target = axis(input, 'targetAxis');
        if (source === target) throw new Error('sourceAxis and targetAxis must differ');
        return this.state.session.shearSelected(
          vec3(input, 'pivot'),
          source,
          target,
          finiteNumber(input, 'factor'),
          optionalBoolean(input, 'textureLock', true),
        );
      },
      'sheared the selection.',
    );
  }

  private selectionEditTool(
    name: string,
    description: string,
    properties: JsonObject,
    required: readonly string[],
    action: (input: Record<string, unknown>) => boolean,
    successMessage: string,
  ): WebMcpTool {
    return {
      name,
      description,
      inputSchema: {
        type: 'object',
        properties: { ...EXPECTED_DOCUMENT_PROPERTIES, ...properties },
        required: [...EXPECTED_DOCUMENT_REQUIRED, ...required],
        additionalProperties: false,
      },
      annotations: VIEW_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        return this.performEdit(input, () => action(input), successMessage);
      },
    };
  }

  private applyMaterialTool(): WebMcpTool {
    return {
      name: 'worldview_apply_material',
      description:
        'Apply a material token to the current face or brush selection as one undoable edit.',
      inputSchema: {
        type: 'object',
        properties: {
          ...EXPECTED_DOCUMENT_PROPERTIES,
          material: { type: 'string', maxLength: 256 },
        },
        required: [...EXPECTED_DOCUMENT_REQUIRED, 'material'],
        additionalProperties: false,
      },
      annotations: VIEW_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        const material = requiredString(input, 'material', 256).trim();
        return this.performEdit(
          input,
          () => this.state.session.applyMaterial(material),
          `applied material ${material}.`,
        );
      },
    };
  }

  private editEntityPropertyTool(): WebMcpTool {
    return {
      name: 'worldview_edit_entity_property',
      description: 'Add, update, or remove one raw entity property as an undoable edit.',
      inputSchema: {
        type: 'object',
        properties: {
          ...EXPECTED_DOCUMENT_PROPERTIES,
          entityId: { type: 'string' },
          key: { type: 'string', maxLength: 256 },
          value: { type: ['string', 'null'], maxLength: 16384 },
          protect: { type: 'boolean', default: false },
        },
        required: [...EXPECTED_DOCUMENT_REQUIRED, 'entityId', 'key', 'value'],
        additionalProperties: false,
      },
      annotations: VIEW_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        const entityId = requiredString(input, 'entityId', 512) as EntityId;
        const key = requiredString(input, 'key', 256);
        const rawValue = input.value;
        if (rawValue !== null && typeof rawValue !== 'string') {
          throw new Error('value must be a string or null');
        }
        if (typeof rawValue === 'string' && rawValue.length > 16_384) {
          throw new Error('value is too long');
        }
        return this.performEdit(
          input,
          () =>
            this.state.session.setEntityProperty(
              entityId,
              key,
              rawValue,
              optionalBoolean(input, 'protect', false),
            ),
          `${rawValue === null ? 'removed' : 'updated'} entity property ${key}.`,
        );
      },
    };
  }

  private createBoxTool(): WebMcpTool {
    return {
      name: 'worldview_create_box',
      description: 'Create and select one axis-aligned six-face brush as an undoable edit.',
      inputSchema: {
        type: 'object',
        properties: {
          ...EXPECTED_DOCUMENT_PROPERTIES,
          min: VEC3_SCHEMA,
          max: VEC3_SCHEMA,
          material: { type: 'string', maxLength: 256 },
          entityId: { type: 'string' },
        },
        required: [...EXPECTED_DOCUMENT_REQUIRED, 'min', 'max', 'material'],
        additionalProperties: false,
      },
      annotations: VIEW_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        this.assertRevision(input);
        const minimum = vec3(input, 'min');
        const maximum = vec3(input, 'max');
        if (minimum.some((component, index) => component >= maximum[index]!)) {
          throw new Error('max must be greater than min on every axis');
        }
        const material = requiredString(input, 'material', 256).trim();
        const ids = this.ids('box');
        const brush = createBoxBrush(minimum, maximum, material, ids);
        const entityId = optionalString(input, 'entityId', 512) as EntityId | undefined;
        this.state.session.commitCreationCandidate(
          this.state.session.createBrushCandidate(brush, entityId),
        );
        this.status(`created brush ${brush.id}.`);
        return result(`Created brush ${brush.id}.`, {
          ...webMcpDocumentState(this.state),
          brushId: brush.id,
        });
      },
    };
  }

  private createPointEntityTool(): WebMcpTool {
    return {
      name: 'worldview_create_point_entity',
      description: 'Create and select a point entity with raw properties as one undoable edit.',
      inputSchema: {
        type: 'object',
        properties: {
          ...EXPECTED_DOCUMENT_PROPERTIES,
          classname: { type: 'string', maxLength: 256 },
          origin: VEC3_SCHEMA,
          properties: {
            type: 'object',
            additionalProperties: { type: 'string' },
            maxProperties: 128,
          },
        },
        required: [...EXPECTED_DOCUMENT_REQUIRED, 'classname', 'origin'],
        additionalProperties: false,
      },
      annotations: VIEW_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        this.assertRevision(input);
        const classname = requiredString(input, 'classname', 256).trim();
        const rawProperties = input.properties ?? {};
        const properties = inputRecord(rawProperties);
        if (Object.keys(properties).length > 128) throw new Error('properties has too many keys');
        if (!Object.values(properties).every((value) => typeof value === 'string')) {
          throw new Error('Every entity property value must be a string');
        }
        this.state.session.createPointEntity(
          classname,
          vec3(input, 'origin'),
          this.ids('entity'),
          properties as Readonly<Record<string, string>>,
        );
        const entityId = this.state.session.selection?.entityId ?? null;
        this.status(`created ${classname} ${entityId ?? ''}.`.trim());
        return result(`Created ${classname}.`, {
          ...webMcpDocumentState(this.state),
          entityId,
        });
      },
    };
  }

  private duplicateSelectionTool(): WebMcpTool {
    return {
      name: 'worldview_duplicate_selection',
      description: 'Duplicate the selected objects with an offset as one undoable edit.',
      inputSchema: {
        type: 'object',
        properties: {
          ...EXPECTED_DOCUMENT_PROPERTIES,
          delta: VEC3_SCHEMA,
          textureLock: { type: 'boolean', default: true },
        },
        required: [...EXPECTED_DOCUMENT_REQUIRED, 'delta'],
        additionalProperties: false,
      },
      annotations: VIEW_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        return this.performEdit(
          input,
          () =>
            this.state.session.duplicateSelected(
              this.ids('duplicate'),
              vec3(input, 'delta'),
              optionalBoolean(input, 'textureLock', true),
              this.state.openGroupId,
            ),
          'duplicated the selection.',
        );
      },
    };
  }

  private deleteSelectionTool(): WebMcpTool {
    return {
      name: 'worldview_delete_selection',
      description: 'Delete the selected objects as one undoable edit.',
      inputSchema: {
        type: 'object',
        properties: EXPECTED_DOCUMENT_PROPERTIES,
        required: EXPECTED_DOCUMENT_REQUIRED,
        additionalProperties: false,
      },
      annotations: DESTRUCTIVE_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        return this.performEdit(
          input,
          () => this.state.session.deleteSelected(),
          'deleted the selection.',
        );
      },
    };
  }

  private historyTool(): WebMcpTool {
    return {
      name: 'worldview_history',
      description: 'Undo or redo one live Worldview history transaction.',
      inputSchema: {
        type: 'object',
        properties: {
          ...EXPECTED_DOCUMENT_PROPERTIES,
          action: { type: 'string', enum: ['undo', 'redo'] },
        },
        required: [...EXPECTED_DOCUMENT_REQUIRED, 'action'],
        additionalProperties: false,
      },
      annotations: VIEW_ANNOTATIONS,
      execute: (raw) => {
        const input = inputRecord(raw);
        this.assertRevision(input);
        const action = requiredString(input, 'action', 8);
        const changed =
          action === 'undo'
            ? this.state.session.undo()
            : action === 'redo'
              ? this.state.session.redo()
              : false;
        if (!changed) throw new Error(`Nothing to ${action}`);
        this.status(`${action} completed.`);
        return result(
          `${action === 'undo' ? 'Undid' : 'Redid'} one transaction.`,
          webMcpDocumentState(this.state),
        );
      },
    };
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
        replaceDocument: this.replaceDocument,
        openEditorMap: this.openEditorMap,
        assertDocument: (input) => this.assertRevision(input),
        ids: (label) => this.ids(label),
        status: (message) => this.status(message),
      }),
    ];
  }

  public async connect(): Promise<void> {
    const root = document.documentElement;
    const modelContext = (document as WebMcpDocument).modelContext;
    if (!modelContext?.registerTool) {
      root.dataset.worldviewSiteTools = 'unsupported';
      root.dataset.worldviewSiteToolCount = '0';
      return;
    }
    const tools = this.tools();
    const registrations = await Promise.allSettled(
      tools.map(async (tool) => modelContext.registerTool(tool)),
    );
    const registered = registrations.filter(
      (registration) => registration.status === 'fulfilled',
    ).length;
    const failure = registrations.find((registration) => registration.status === 'rejected');
    root.dataset.worldviewSiteToolCount = String(registered);
    if (failure?.status === 'rejected') {
      root.dataset.worldviewSiteTools = 'error';
      this.ui.statusMessage.textContent = `Site tool registration failed; ${registered} of ${tools.length} tools are available: ${failure.reason instanceof Error ? failure.reason.message : String(failure.reason)}`;
      return;
    }
    root.dataset.worldviewSiteTools = 'ready';
  }
}
