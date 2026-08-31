import type {
  MapDocument,
  MapFaceSyntax,
  MapSourceState,
  WorldviewGameProfile,
} from '@jackharrhy/worldview-editor';

import type { EditorFileHandle } from './project-files.js';
import type { EditorDirectoryHandle } from './project-workspace.js';

export interface CompileAssetEntry {
  readonly name: string;
  readonly data: ArrayBuffer;
}

export interface ReplaceDocumentOptions {
  readonly name?: string;
  readonly source?: MapSourceState;
  readonly fileHandle?: EditorFileHandle | null;
  readonly diskFingerprint?: string | null;
  readonly dirty?: boolean;
  readonly savedRevision?: number;
  readonly focusView?: boolean;
}

export interface OpenEditorMapOptions {
  readonly expectedDocumentId?: string;
  readonly expectedRevision?: number;
  readonly throwOnError?: boolean;
  readonly viewportWorkspaceKey?: string;
}

export type ReplaceDocumentCommand = (
  document: MapDocument,
  label: string,
  options?: ReplaceDocumentOptions,
) => void;

export type OpenEditorMapCommand = (
  file: File,
  handle: EditorFileHandle | null,
  logicalName?: string,
  options?: OpenEditorMapOptions,
) => Promise<void>;

export type EditorApplicationLaunch =
  | {
      readonly kind: 'new-map';
      readonly workspaceId: string;
      readonly name: string;
      readonly profile: WorldviewGameProfile;
      readonly format: MapFaceSyntax;
    }
  | {
      readonly kind: 'hosted-map';
      readonly id: string;
      readonly name: string;
      readonly source: string;
      readonly projectName: string;
      readonly mapVersion: number;
      readonly actorId: string;
      readonly displayName: string;
      readonly resources?: readonly {
        readonly name: string;
        readonly kind: string;
        readonly data: ArrayBuffer;
      }[];
    }
  | { readonly kind: 'project'; readonly handle: EditorDirectoryHandle }
  | { readonly kind: 'recent-project'; readonly projectKey: string }
  | { readonly kind: 'map'; readonly file: File };
