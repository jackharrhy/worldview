import { defaultTextureProjection } from './document.js';
import { planeFromPoints, rotateAroundAxis } from './math.js';
import type {
  IdFactory,
  MapBrush,
  MapDocument,
  MapEntity,
  MapFace,
  MapFormat,
  SurfaceAttributes,
  TextureProjection,
  Vec3,
} from './types.js';
import { createSequentialIdFactory } from './types.js';
import type {
  MapSourceBrushSpan,
  MapSourceDiagnostic,
  MapSourceEntitySpan,
  MapSourceFaceSpan,
  MapSourceOpaqueSpan,
  MapSourcePropertySpan,
  MapSourceState,
  ParsedMapSource,
} from './map-source-types.js';

type TokenKind = 'string' | 'word' | 'symbol';

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly line: number;
  readonly column: number;
  readonly start: number;
  readonly end: number;
}

export class MapParseError extends Error {
  public constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
  ) {
    super(`${message} at ${line}:${column}`);
    this.name = 'MapParseError';
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  let line = 1;
  let column = 1;
  const advance = () => {
    const character = source[offset++]!;
    if (character === '\n') {
      line += 1;
      column = 1;
    } else column += 1;
    return character;
  };
  while (offset < source.length) {
    const character = source[offset]!;
    if (/\s/.test(character)) {
      advance();
      continue;
    }
    if (character === '/' && source[offset + 1] === '/') {
      while (offset < source.length && source[offset] !== '\n') advance();
      continue;
    }
    const startLine = line;
    const startColumn = column;
    if (character === '"') {
      const start = offset;
      advance();
      let value = '';
      let closed = false;
      while (offset < source.length) {
        const next = advance();
        if (next === '"') {
          closed = true;
          break;
        }
        if (next === '\\' && offset < source.length) {
          const escaped = advance();
          value += escaped === 'n' ? '\n' : escaped;
        } else value += next;
      }
      if (!closed) throw new MapParseError('Unterminated quoted string', startLine, startColumn);
      tokens.push({
        kind: 'string',
        value,
        line: startLine,
        column: startColumn,
        start,
        end: offset,
      });
      continue;
    }
    if ('{}()[]'.includes(character)) {
      const start = offset;
      tokens.push({
        kind: 'symbol',
        value: advance(),
        line: startLine,
        column: startColumn,
        start,
        end: offset,
      });
      continue;
    }
    let value = '';
    while (offset < source.length) {
      const next = source[offset]!;
      if (/\s/.test(next) || '{}()[]"'.includes(next)) break;
      if (next === '/' && source[offset + 1] === '/') break;
      value += advance();
    }
    if (value.length > 0)
      tokens.push({
        kind: 'word',
        value,
        line: startLine,
        column: startColumn,
        start: offset - value.length,
        end: offset,
      });
  }
  return tokens;
}

class Parser {
  private readonly tokens: readonly Token[];
  private index = 0;
  private format: MapFormat = 'quake';
  private readonly entitySpans: MapSourceEntitySpan[] = [];
  private readonly rootOpaque: MapSourceOpaqueSpan[] = [];
  private readonly diagnostics: MapSourceDiagnostic[] = [];

  public constructor(
    source: string,
    private readonly ids: IdFactory,
  ) {
    this.tokens = tokenize(source);
  }

  public parse(): MapDocument {
    const entities: MapEntity[] = [];
    while (this.peek()) {
      if (this.check('{')) entities.push(this.parseEntity());
      else this.rootOpaque.push(this.skipOpaqueConstruct());
    }
    if (entities.length === 0) throw new MapParseError('Map contains no entities', 1, 1);
    if (entities[0]?.properties.classname !== 'worldspawn') {
      const token = this.tokens[0];
      throw new MapParseError(
        'First entity must be worldspawn',
        token?.line ?? 1,
        token?.column ?? 1,
      );
    }
    return {
      id: this.ids.document(),
      revision: 0,
      format: this.format,
      entities,
    };
  }

  public sourceState(source: string, document: MapDocument): MapSourceState {
    return {
      originalText: source,
      fingerprint: mapSourceFingerprint(source),
      originalDocument: document,
      format: document.format,
      newline: source.includes('\r\n') ? '\r\n' : '\n',
      indent: inferIndent(source),
      entities: this.entitySpans,
      opaque: this.rootOpaque,
      diagnostics: this.diagnostics,
    };
  }

  private parseEntity(): MapEntity {
    const opening = this.expect('{');
    const properties: Record<string, string> = {};
    const brushes: MapBrush[] = [];
    const propertySpans: MapSourcePropertySpan[] = [];
    const brushSpans: MapSourceBrushSpan[] = [];
    const opaque: MapSourceOpaqueSpan[] = [];
    while (!this.check('}')) {
      if (this.check('{')) {
        const parsed = this.parseBrush();
        brushes.push(parsed.brush);
        brushSpans.push(parsed.span);
      } else if (this.peek(1)?.value === '{') {
        opaque.push(this.skipOpaqueConstruct());
      } else {
        const key = this.takeValueToken('Expected an entity property name');
        const value = this.takeValueToken(`Expected a value for entity property ${key.value}`);
        properties[key.value] = value.value;
        propertySpans.push({ key: key.value, start: key.start, end: value.end });
      }
    }
    const closing = this.expect('}');
    const entity = { id: this.ids.entity(), properties, brushes };
    this.entitySpans.push({
      entityId: entity.id,
      start: opening.start,
      end: closing.end,
      openEnd: opening.end,
      closeStart: closing.start,
      properties: propertySpans,
      brushes: brushSpans,
      opaque,
    });
    return entity;
  }

  private parseBrush(): { readonly brush: MapBrush; readonly span: MapSourceBrushSpan } {
    const opening = this.expect('{');
    const faces: MapFace[] = [];
    const faceSpans: Omit<MapSourceFaceSpan, 'faceId'>[] = [];
    while (!this.check('}')) {
      const parsed = this.parseFace();
      faces.push(parsed.face);
      faceSpans.push(parsed.span);
    }
    const closing = this.expect('}');
    const brush = { id: this.ids.brush(), revision: 0, faces };
    return {
      brush,
      span: {
        brushId: brush.id,
        start: opening.start,
        end: closing.end,
        openEnd: opening.end,
        closeStart: closing.start,
        faces: faceSpans.map((span, index) => ({
          start: span.start,
          end: span.end,
          faceId: faces[index]!.id,
        })),
      },
    };
  }

  private parseFace(): {
    readonly face: MapFace;
    readonly span: Omit<MapSourceFaceSpan, 'faceId'>;
  } {
    const start = this.peek()?.start ?? 0;
    const points: [Vec3, Vec3, Vec3] = [this.parsePoint(), this.parsePoint(), this.parsePoint()];
    const material = this.takeValue('Expected a face material');
    let projection: TextureProjection;
    if (this.check('[')) {
      this.format = 'valve-220';
      const u = this.parseAxis();
      const v = this.parseAxis();
      const rotationDegrees = this.takeNumber('Expected texture rotation');
      const scaleU = this.takeNumber('Expected U texture scale');
      const scaleV = this.takeNumber('Expected V texture scale');
      projection = {
        uAxis: u.axis,
        vAxis: v.axis,
        offset: [u.offset, v.offset],
        rotationDegrees,
        scale: [scaleU, scaleV],
      };
    } else {
      const offsetU = this.takeNumber('Expected U texture offset');
      const offsetV = this.takeNumber('Expected V texture offset');
      const rotationDegrees = this.takeNumber('Expected texture rotation');
      const scaleU = this.takeNumber('Expected U texture scale');
      const scaleV = this.takeNumber('Expected V texture scale');
      const plane = planeFromPoints(points);
      if (!plane) {
        const token = this.tokens[Math.max(0, this.index - 1)]!;
        throw new MapParseError('Face points are collinear', token.line, token.column);
      }
      const base = defaultTextureProjection(plane.normal);
      const radians = (rotationDegrees * Math.PI) / 180;
      projection = {
        uAxis: rotateAroundAxis(base.uAxis, plane.normal, radians),
        vAxis: rotateAroundAxis(base.vAxis, plane.normal, radians),
        offset: [offsetU, offsetV],
        rotationDegrees,
        scale: [scaleU, scaleV],
      };
    }
    const faceLine = this.tokens[Math.max(0, this.index - 1)]?.line;
    const extra: number[] = [];
    while (this.peek()?.line === faceLine && !this.check('(') && !this.check('}')) {
      const token = this.peek()!;
      const value = Number(token.value);
      if (!Number.isFinite(value)) break;
      extra.push(value);
      this.index += 1;
    }
    const surface: SurfaceAttributes = {};
    if (extra[0] !== undefined) Object.assign(surface, { contents: extra[0] });
    if (extra[1] !== undefined) Object.assign(surface, { flags: extra[1] });
    if (extra[2] !== undefined) Object.assign(surface, { value: extra[2] });
    const face = { id: this.ids.face(), planePoints: points, material, projection, surface };
    return {
      face,
      span: { start, end: this.tokens[Math.max(0, this.index - 1)]?.end ?? start },
    };
  }

  private parsePoint(): Vec3 {
    this.expect('(');
    const point: Vec3 = [
      this.takeNumber('Expected X plane coordinate'),
      this.takeNumber('Expected Y plane coordinate'),
      this.takeNumber('Expected Z plane coordinate'),
    ];
    this.expect(')');
    return point;
  }

  private parseAxis(): { readonly axis: Vec3; readonly offset: number } {
    this.expect('[');
    const axis: Vec3 = [
      this.takeNumber('Expected texture-axis X component'),
      this.takeNumber('Expected texture-axis Y component'),
      this.takeNumber('Expected texture-axis Z component'),
    ];
    const offset = this.takeNumber('Expected texture-axis offset');
    this.expect(']');
    return { axis, offset };
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  private check(value: string): boolean {
    return this.peek()?.value === value;
  }

  private expect(value: string): Token {
    const token = this.peek();
    if (!token || token.value !== value) {
      throw new MapParseError(`Expected '${value}'`, token?.line ?? 1, token?.column ?? 1);
    }
    this.index += 1;
    return token;
  }

  private takeValue(message: string): string {
    return this.takeValueToken(message).value;
  }

  private takeValueToken(message: string): Token {
    const token = this.peek();
    if (!token || token.kind === 'symbol') {
      throw new MapParseError(message, token?.line ?? 1, token?.column ?? 1);
    }
    this.index += 1;
    return token;
  }

  private takeNumber(message: string): number {
    const token = this.peek();
    const value = token ? Number(token.value) : Number.NaN;
    if (!token || !Number.isFinite(value)) {
      throw new MapParseError(message, token?.line ?? 1, token?.column ?? 1);
    }
    this.index += 1;
    return value;
  }

  private skipOpaqueConstruct(): MapSourceOpaqueSpan {
    const keyword = this.takeValueToken('Expected an unsupported construct name');
    const opening = this.expect('{');
    let depth = 1;
    let closing = opening;
    while (depth > 0) {
      const token = this.peek();
      if (!token)
        throw new MapParseError('Unterminated unsupported construct', keyword.line, keyword.column);
      this.index += 1;
      if (token.value === '{') depth += 1;
      else if (token.value === '}') depth -= 1;
      closing = token;
    }
    const span: MapSourceOpaqueSpan = {
      keyword: keyword.value,
      start: keyword.start,
      end: closing.end,
      line: keyword.line,
      column: keyword.column,
    };
    this.diagnostics.push({
      severity: 'warning',
      code: 'unsupported-construct',
      message: `${keyword.value} is preserved as opaque map source`,
      line: keyword.line,
      column: keyword.column,
      keyword: keyword.value,
    });
    return span;
  }
}

function inferIndent(source: string): string {
  const match = /(?:^|\r?\n)([ \t]+)(?:"|\()/m.exec(source);
  return match?.[1] ?? '';
}

export function mapSourceFingerprint(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}:${source.length}`;
}

export function parseMap(
  source: string,
  ids: IdFactory = createSequentialIdFactory('parsed'),
): MapDocument {
  return new Parser(source, ids).parse();
}

export function parseMapSource(
  source: string,
  ids: IdFactory = createSequentialIdFactory('parsed'),
): ParsedMapSource {
  const parser = new Parser(source, ids);
  const document = parser.parse();
  return { document, source: parser.sourceState(source, document) };
}
