import { parseMapSource, type IdFactory } from '@jackharrhy/worldview-editor';
import { z } from 'zod';

import type { EditorState } from './editor-state.js';
import type { ProjectPresenter } from './project-presenter.js';
import type { SessionPresenter } from './session-presenter.js';
import {
  DESTRUCTIVE_ANNOTATIONS,
  ExpectedDocumentInputSchema,
  defineWebMcpTool,
  result,
  type ExpectedDocumentInput,
  type WebMcpTool,
} from './webmcp-contract.js';
import { webMcpDocumentState } from './webmcp-state.js';

interface WebMcpDocumentToolHost {
  readonly state: EditorState;
  readonly signal: AbortSignal;
  readonly replaceDocument: SessionPresenter['replaceDocument'];
  readonly openEditorMap: ProjectPresenter['openEditorMap'];
  assertDocument(input: ExpectedDocumentInput): number;
  ids(label: string): IdFactory;
  status(message: string): void;
}

const ReplaceMapSourceSchema = ExpectedDocumentInputSchema.extend({
  source: z.string().min(1).max(16_000_000),
  name: z.string().max(512).optional(),
  confirmDestructive: z.literal(true),
});
const OpenProjectMapSchema = ExpectedDocumentInputSchema.extend({
  path: z.string().min(1).max(2_048),
  discardUnsavedChanges: z.boolean().default(false),
});

export function createWebMcpDocumentTools(host: WebMcpDocumentToolHost): readonly WebMcpTool[] {
  const replaceMapSource = defineWebMcpTool(ReplaceMapSourceSchema, {
    name: 'worldview_replace_map_source',
    description:
      'Replace the current document from map source, detach it from any file handle, reset history, and frame it. Requires explicit destructive confirmation.',
    annotations: DESTRUCTIVE_ANNOTATIONS,
    execute: (input) => {
      host.assertDocument(input);
      const parsed = parseMapSource(input.source, host.ids('source'));
      const name = input.name?.trim() || 'site-tool.map';
      host.replaceDocument(parsed.document, 'Replace map source via site tool', {
        name,
        source: parsed.source,
        fileHandle: null,
        diskFingerprint: null,
        dirty: true,
        savedRevision: -1,
        focusView: true,
      });
      host.status(`replaced the document with ${name}; history and file binding were reset.`);
      return result(`Replaced the document with ${name}.`, webMcpDocumentState(host.state));
    },
  });

  const openProjectMap = defineWebMcpTool(OpenProjectMapSchema, {
    name: 'worldview_open_project_map',
    description:
      'Open a known map from the already authorized project directory. Unsaved changes require explicit discard confirmation.',
    annotations: DESTRUCTIVE_ANNOTATIONS,
    execute: async (input) => {
      host.signal.throwIfAborted();
      const expectedRevision = host.assertDocument(input);
      if (host.state.documentDirty && !input.discardUnsavedChanges) {
        throw new Error('The current map has unsaved changes; set discardUnsavedChanges to true');
      }
      const map = host.state.projectWorkspace?.maps.find(
        (candidate) => candidate.path === input.path,
      );
      if (!map) throw new Error(`Unknown project map ${input.path}`);
      const file = await map.handle.getFile();
      host.signal.throwIfAborted();
      await host.openEditorMap(file, map.handle, map.path, {
        expectedDocumentId: input.expectedDocumentId,
        expectedRevision,
        throwOnError: true,
      });
      host.signal.throwIfAborted();
      host.status(`opened project map ${input.path}.`);
      return result(`Opened project map ${input.path}.`, webMcpDocumentState(host.state));
    },
  });
  return [replaceMapSource, openProjectMap];
}
