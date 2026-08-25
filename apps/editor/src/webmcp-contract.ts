import { type EditorTool, type TransformAxis, type Vec3 } from '@jackharrhy/worldview-editor';

export type JsonObject = Readonly<Record<string, unknown>>;

export type WebMcpToolResult = JsonObject;

export interface WebMcpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly annotations?: Readonly<{
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  }>;
  execute(input: unknown): WebMcpToolResult | Promise<WebMcpToolResult>;
}

interface WebMcpModelContext {
  registerTool(tool: WebMcpTool): void | Promise<void>;
}

export type WebMcpDocument = Document & { readonly modelContext?: WebMcpModelContext };

export const EMPTY_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

export const EXPECTED_DOCUMENT_PROPERTIES = {
  expectedDocumentId: {
    type: 'string',
    description: 'Document ID observed before requesting this operation.',
  },
  expectedRevision: {
    type: 'integer',
    minimum: 0,
    description: 'Document revision observed before requesting this operation.',
  },
} as const;

export const EXPECTED_DOCUMENT_REQUIRED = ['expectedDocumentId', 'expectedRevision'] as const;

export const VEC3_SCHEMA = {
  type: 'array',
  items: { type: 'number' },
  minItems: 3,
  maxItems: 3,
} as const;

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const VIEW_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

export const DESTRUCTIVE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const;

export const TOOL_VALUES: readonly EditorTool[] = [
  'select',
  'entity',
  'create',
  'hull',
  'face',
  'sweep',
  'clip',
  'vertex',
  'edge',
  'rotate',
  'scale',
  'shear',
];

export function inputRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Tool input must be an object');
  }
  return input as Record<string, unknown>;
}

export function requiredString(
  input: Record<string, unknown>,
  key: string,
  maximumLength = 4_096,
): string {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} must be a string`);
  if (value.length > maximumLength) throw new Error(`${key} is too long`);
  return value;
}

export function optionalString(
  input: Record<string, unknown>,
  key: string,
  maximumLength = 4_096,
): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  if (value.length > maximumLength) throw new Error(`${key} is too long`);
  return value;
}

export function optionalBoolean(
  input: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean`);
  return value;
}

export function integer(
  input: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
  fallback?: number,
): number {
  const value = input[key] ?? fallback;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${key} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

export function finiteNumber(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number`);
  }
  return value;
}

export function vec3(input: Record<string, unknown>, key: string): Vec3 {
  const value = input[key];
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((component) => typeof component === 'number' && Number.isFinite(component))
  ) {
    throw new Error(`${key} must contain exactly three finite numbers`);
  }
  return value as unknown as Vec3;
}

export function stringArray(
  input: Record<string, unknown>,
  key: string,
  maximumItems = 1_024,
): readonly string[] {
  const value = input[key] ?? [];
  if (
    !Array.isArray(value) ||
    value.length > maximumItems ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new Error(`${key} must be an array of at most ${maximumItems} strings`);
  }
  return [...new Set(value)];
}

export function axis(input: Record<string, unknown>, key: string): TransformAxis {
  const value = requiredString(input, key, 1);
  const resolved = value === 'x' ? 0 : value === 'y' ? 1 : value === 'z' ? 2 : null;
  if (resolved === null) throw new Error(`${key} must be x, y, or z`);
  return resolved;
}

export function result(summary: string, data: JsonObject): WebMcpToolResult {
  return { summary, ...data };
}
