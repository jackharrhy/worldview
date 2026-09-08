import { EditorUiPort } from './editor-ui-port.js';

export interface BuildExportSnapshot {
  readonly open: boolean;
  readonly available: boolean;
  readonly busy: boolean;
  readonly quality: 'preview' | 'final';
  readonly includeSource: boolean;
  readonly afterBuild: boolean;
  readonly directoryName: string | null;
  readonly message: string;
}

export interface BuildExportActions {
  refresh(): void;
  settings(): void;
  setQuality(quality: 'preview' | 'final'): void;
  configure(update: Partial<Pick<BuildExportSnapshot, 'includeSource' | 'afterBuild'>>): void;
  chooseDirectory(): void;
  useDownloads(): void;
  exportLatest(): void;
  buildAndExport(): void;
}

export class BuildExportPort extends EditorUiPort<BuildExportSnapshot, BuildExportActions> {
  public constructor() {
    super({
      open: false,
      available: false,
      busy: false,
      quality: 'preview',
      includeSource: false,
      afterBuild: false,
      directoryName: null,
      message: '',
    });
  }
}
