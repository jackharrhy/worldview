import { DocumentIdSchema, Vec3Schema, type EditorTool } from '@jackharrhy/worldview-editor';
import { z } from 'zod';

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
  registerTool(tool: WebMcpTool, options?: { readonly signal?: AbortSignal }): void | Promise<void>;
}

export type WebMcpDocument = Document & { readonly modelContext?: WebMcpModelContext };

export const EmptyInputSchema = z.strictObject({});
export const ExpectedDocumentInputSchema = z.strictObject({
  expectedDocumentId: DocumentIdSchema.describe(
    'Document ID observed before requesting this operation.',
  ),
  expectedRevision: z
    .number()
    .int()
    .nonnegative()
    .describe('Document revision observed before requesting this operation.'),
});
export type ExpectedDocumentInput = z.infer<typeof ExpectedDocumentInputSchema>;
export const WebMcpVec3Schema = Vec3Schema;

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

export const TOOL_VALUES = [
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
] as const satisfies readonly EditorTool[];

type TypedWebMcpTool<Schema extends z.ZodType> = Omit<WebMcpTool, 'execute' | 'inputSchema'> & {
  execute(input: z.output<Schema>): WebMcpToolResult | Promise<WebMcpToolResult>;
};

/** Defines the advertised JSON schema and runtime parser from the same strict Zod contract. */
export function defineWebMcpTool<Schema extends z.ZodType>(
  schema: Schema,
  definition: TypedWebMcpTool<Schema>,
): WebMcpTool {
  return {
    ...definition,
    inputSchema: z.toJSONSchema(schema) as JsonObject,
    execute(input) {
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!;
        const path = issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
        throw new Error(`Tool input is invalid${path}: ${issue.message}`);
      }
      return definition.execute(parsed.data);
    },
  };
}

export function result(summary: string, data: JsonObject): WebMcpToolResult {
  return { summary, ...data };
}
