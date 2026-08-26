import { parseMapSource, type IdFactory } from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';
import {
  DESTRUCTIVE_ANNOTATIONS,
  EXPECTED_DOCUMENT_PROPERTIES,
  EXPECTED_DOCUMENT_REQUIRED,
  inputRecord,
  optionalBoolean,
  optionalString,
  requiredString,
  result,
  type WebMcpTool,
} from './webmcp-contract.js';
import { webMcpDocumentState } from './webmcp-state.js';

interface WebMcpDocumentToolHost {
  readonly app: EditorApplication;
  assertDocument(input: Record<string, unknown>): number;
  ids(label: string): IdFactory;
  status(message: string): void;
}

export function createWebMcpDocumentTools(host: WebMcpDocumentToolHost): readonly WebMcpTool[] {
  const replaceMapSource: WebMcpTool = {
    name: 'worldview_replace_map_source',
    description:
      'Replace the current document from map source, detach it from any file handle, reset history, and frame it. Requires explicit destructive confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        ...EXPECTED_DOCUMENT_PROPERTIES,
        source: { type: 'string', maxLength: 16000000 },
        name: { type: 'string', maxLength: 512 },
        confirmDestructive: { type: 'boolean' },
      },
      required: [...EXPECTED_DOCUMENT_REQUIRED, 'source', 'confirmDestructive'],
      additionalProperties: false,
    },
    annotations: DESTRUCTIVE_ANNOTATIONS,
    execute: (raw) => {
      const input = inputRecord(raw);
      host.assertDocument(input);
      if (input.confirmDestructive !== true) {
        throw new Error(
          'confirmDestructive must be true because source replacement resets history',
        );
      }
      const source = requiredString(input, 'source', 16_000_000);
      const parsed = parseMapSource(source, host.ids('source'));
      const name = optionalString(input, 'name', 512)?.trim() || 'site-tool.map';
      host.app.session.replaceDocument(parsed.document, 'Replace map source via site tool', {
        name,
        source: parsed.source,
        fileHandle: null,
        diskFingerprint: null,
        dirty: true,
        savedRevision: -1,
        focusView: true,
      });
      host.status(`replaced the document with ${name}; history and file binding were reset.`);
      return result(`Replaced the document with ${name}.`, webMcpDocumentState(host.app.state));
    },
  };

  const openProjectMap: WebMcpTool = {
    name: 'worldview_open_project_map',
    description:
      'Open a known map from the already authorized project directory. Unsaved changes require explicit discard confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        ...EXPECTED_DOCUMENT_PROPERTIES,
        path: { type: 'string', maxLength: 2048 },
        discardUnsavedChanges: { type: 'boolean', default: false },
      },
      required: [...EXPECTED_DOCUMENT_REQUIRED, 'path'],
      additionalProperties: false,
    },
    annotations: DESTRUCTIVE_ANNOTATIONS,
    execute: async (raw) => {
      const input = inputRecord(raw);
      const expectedDocumentId = requiredString(input, 'expectedDocumentId', 512);
      const expectedRevision = host.assertDocument(input);
      if (host.app.state.documentDirty && !optionalBoolean(input, 'discardUnsavedChanges', false)) {
        throw new Error('The current map has unsaved changes; set discardUnsavedChanges to true');
      }
      const path = requiredString(input, 'path', 2_048);
      const map = host.app.state.projectWorkspace?.maps.find(
        (candidate) => candidate.path === path,
      );
      if (!map) throw new Error(`Unknown project map ${path}`);
      await host.app.project.openEditorMap(await map.handle.getFile(), map.handle, map.path, {
        expectedDocumentId,
        expectedRevision,
        throwOnError: true,
      });
      host.status(`opened project map ${path}.`);
      return result(`Opened project map ${path}.`, webMcpDocumentState(host.app.state));
    },
  };

  return [replaceMapSource, openProjectMap];
}
