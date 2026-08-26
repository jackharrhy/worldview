import type { Vec3Tuple } from '@jackharrhy/worldview/core';

export type Vec2 = readonly [number, number];
export type Vec3 = Vec3Tuple;

declare const idBrand: unique symbol;
type BrandedId<Name extends string> = string & { readonly [idBrand]: Name };

export type DocumentId = BrandedId<'document'>;
export type EntityId = BrandedId<'entity'>;
export type BrushId = BrandedId<'brush'>;
export type FaceId = BrandedId<'face'>;

export type MapFormat = 'valve-220' | 'quake';

export interface TextureProjection {
  /** Valve 220 world-space texture axes. */
  readonly uAxis: Vec3;
  readonly vAxis: Vec3;
  /** Texture-space translation in texels. */
  readonly offset: Vec2;
  /** Retained for compatible serialization and texture-tool presentation. */
  readonly rotationDegrees: number;
  readonly scale: Vec2;
}

export interface SurfaceAttributes {
  readonly contents?: number;
  readonly flags?: number;
  readonly value?: number;
}

export interface MapFace {
  readonly id: FaceId;
  readonly planePoints: readonly [Vec3, Vec3, Vec3];
  readonly material: string;
  readonly projection: TextureProjection;
  readonly surface: SurfaceAttributes;
}

export interface MapBrush {
  readonly id: BrushId;
  readonly revision: number;
  readonly faces: readonly MapFace[];
}

export interface MapEntity {
  readonly id: EntityId;
  readonly properties: Readonly<Record<string, string>>;
  readonly brushes: readonly MapBrush[];
}

export interface MapDocument {
  readonly id: DocumentId;
  readonly revision: number;
  readonly format: MapFormat;
  readonly entities: readonly MapEntity[];
}

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface GeometryDiagnostic {
  readonly severity: 'warning' | 'error';
  readonly code:
    | 'too-few-faces'
    | 'degenerate-plane'
    | 'open-face'
    | 'empty-brush'
    | 'unbounded-brush';
  readonly message: string;
  readonly faceId?: FaceId;
}

export interface DerivedFace {
  readonly faceId: FaceId;
  readonly material: string;
  readonly normal: Vec3;
  readonly distance: number;
  readonly vertices: readonly Vec3[];
  readonly textureCoordinates: readonly Vec2[];
}

export interface DerivedEdge {
  readonly start: Vec3;
  readonly end: Vec3;
}

export interface DerivedBrush {
  readonly brushId: BrushId;
  readonly sourceRevision: number;
  readonly valid: boolean;
  readonly bounds: Bounds | null;
  readonly faces: readonly DerivedFace[];
  readonly edges: readonly DerivedEdge[];
  /** Interleaved position, normal, and texel-space UV values. */
  readonly vertices: Float32Array;
  readonly diagnostics: readonly GeometryDiagnostic[];
}

export interface FaceSelection {
  readonly brushId: BrushId;
  readonly faceId: FaceId;
}

export interface BrushSelection {
  /** Non-serialized persistent group ID when this aggregate selection represents one closed group. */
  readonly groupId?: string;
  /** The primary brush used by single-object tools and inspector presentation. */
  readonly brushId: BrushId;
  /**
   * The complete normalized object set when more than one brush is selected. The primary brush is
   * always included. Omitted for the common single-brush and face-selection cases.
   */
  readonly brushIds?: readonly BrushId[];
  /** The primary face. Its presence distinguishes face selection from object selection. */
  readonly faceId?: FaceId;
  /**
   * The complete normalized face set when more than one face is selected. The primary face is
   * always included. Omitted for the common single-face and object-selection cases.
   */
  readonly faces?: readonly FaceSelection[];
  /** Point entities retained when an additive object selection is mixed. */
  readonly entityIds?: readonly EntityId[];
  readonly entityId?: undefined;
}

/** An object selection whose primary object is a point entity. */
export interface PointEntitySelection {
  /** Non-serialized persistent group ID when this aggregate selection represents one closed group. */
  readonly groupId?: string;
  readonly entityId: EntityId;
  readonly entityIds?: readonly EntityId[];
  /** Brushes retained when an additive object selection is mixed. */
  readonly brushIds?: readonly BrushId[];
  readonly brushId?: undefined;
  readonly faceId?: undefined;
  readonly faces?: undefined;
}

export type EditorSelection = BrushSelection | PointEntitySelection;

/** Non-serialized authoring state for viewport clutter and edit protection. */
export interface EditorObjectViewState {
  readonly hiddenBrushIds: readonly BrushId[];
  readonly hiddenEntityIds: readonly EntityId[];
  readonly lockedBrushIds: readonly BrushId[];
  readonly lockedEntityIds: readonly EntityId[];
}

export interface IdFactory {
  document(): DocumentId;
  entity(): EntityId;
  brush(): BrushId;
  face(): FaceId;
}

export function createSequentialIdFactory(prefix = 'worldview'): IdFactory {
  let document = 0;
  let entity = 0;
  let brush = 0;
  let face = 0;
  return {
    document: () => `${prefix}-document-${++document}` as DocumentId,
    entity: () => `${prefix}-entity-${++entity}` as EntityId,
    brush: () => `${prefix}-brush-${++brush}` as BrushId,
    face: () => `${prefix}-face-${++face}` as FaceId,
  };
}

const documentBrushes = new WeakMap<MapDocument, readonly MapBrush[]>();
const documentBrushesById = new WeakMap<MapDocument, ReadonlyMap<BrushId, MapBrush>>();

export function brushesInDocument(document: MapDocument): readonly MapBrush[] {
  const cached = documentBrushes.get(document);
  if (cached) return cached;
  const brushes = document.entities.flatMap((entity) => entity.brushes);
  documentBrushes.set(document, brushes);
  return brushes;
}

export function findBrush(document: MapDocument, brushId: BrushId): MapBrush | null {
  let brushesById = documentBrushesById.get(document);
  if (!brushesById) {
    brushesById = new Map(brushesInDocument(document).map((brush) => [brush.id, brush] as const));
    documentBrushesById.set(document, brushesById);
  }
  return brushesById.get(brushId) ?? null;
}
