import type { BuildExportPort } from './build-export-ui-state.js';
import { packageBuildExport, type BuildExportBundle } from './build-export-plan.js';
import {
  BuildExportSettingsSchema,
  loadBuildExportSettings,
  pickExportDirectory,
  saveBuildExportSettings,
  writeBuildExport,
  type BuildExportSettings,
} from './build-export-settings.js';
import { downloadFileCopy } from './project-files.js';

interface ExportContext {
  readonly scopeId: string;
  readonly documentKey: string;
  readonly documentId: string;
  readonly revision: number;
}

export class BuildExportSession {
  private bundle: BuildExportBundle | null = null;
  private settings = BuildExportSettingsSchema.parse({ scopeId: '' });

  public constructor(
    private readonly ui: BuildExportPort,
    private readonly context: () => ExportContext,
    private readonly setQuality: (quality: 'preview' | 'final') => void,
    build: () => Promise<void>,
    private readonly status: (message: string) => void,
    private readonly signal: AbortSignal,
  ) {
    ui.bind({
      refresh: () => {
        ui.update({ available: this.isCurrent() });
        void this.loadSettings();
      },
      settings: () => {
        ui.update({ open: true });
      },
      setQuality: (quality) => {
        this.setQuality(quality);
        this.configure({ quality });
      },
      configure: (update) => this.configure(update),
      chooseDirectory: () => {
        const scopeId = this.context().scopeId;
        void this.run(async () => {
          const directory = await pickExportDirectory();
          if (!this.signal.aborted && this.context().scopeId === scopeId)
            this.configure({ directory });
        });
      },
      useDownloads: () => this.configure({ directory: null }),
      exportLatest: () => void this.run(() => this.exportLatest()),
      buildAndExport: () => void this.run(build),
    });
  }

  public dispose(): void {
    this.ui.unbind();
  }

  public async loadSettings(): Promise<void> {
    const scopeId = this.context().scopeId;
    if (this.settings.scopeId === scopeId) return;
    const defaults = BuildExportSettingsSchema.parse({ scopeId });
    this.settings = defaults;
    this.publishSettings();
    const settings = await loadBuildExportSettings(scopeId).catch(() =>
      BuildExportSettingsSchema.parse({ scopeId }),
    );
    if (this.signal.aborted || this.context().scopeId !== scopeId || this.settings !== defaults)
      return;
    this.settings = settings;
    this.setQuality(settings.quality);
    this.publishSettings();
    this.ui.update({ available: this.isCurrent(), message: '' });
  }

  private publishSettings(): void {
    this.ui.update({
      quality: this.settings.quality,
      includeSource: this.settings.includeSource,
      afterBuild: this.settings.afterBuild,
      directoryName: this.settings.directory?.name ?? null,
    });
  }

  private configure(update: Partial<Omit<BuildExportSettings, 'scopeId'>>): void {
    this.settings = { ...this.settings, ...update, scopeId: this.context().scopeId };
    this.publishSettings();
    void saveBuildExportSettings(this.settings).catch(() => {
      this.ui.update({
        message: 'Settings apply for this session; browser storage is unavailable.',
      });
    });
  }

  public accept(bundle: BuildExportBundle): void {
    this.bundle = bundle;
    this.ui.update({ available: this.isCurrent(), message: '' });
  }

  public isCurrent(): boolean {
    const current = this.context();
    return (
      this.bundle !== null &&
      this.bundle.documentKey === current.documentKey &&
      this.bundle.documentId === current.documentId &&
      this.bundle.revision === current.revision
    );
  }

  public get exportAfterBuild(): boolean {
    return this.settings.afterBuild;
  }

  public async exportLatest(): Promise<void> {
    if (!this.bundle || !this.isCurrent())
      throw new Error('The map has changed. Build it again before exporting.');
    if (this.ui.getSnapshot().busy) return;
    const bundle = this.bundle;
    const settings = this.settings;
    this.ui.update({ busy: true, message: 'Preparing export…' });
    try {
      const file = await packageBuildExport(bundle, settings.includeSource);
      this.signal.throwIfAborted();
      if (!this.isCurrent() || this.bundle !== bundle)
        throw new Error('The map changed while preparing the export. Build it again.');
      if (settings.directory) await writeBuildExport(settings.directory, file);
      else downloadFileCopy(file.name, file.data, file.mediaType);
      const message = settings.directory
        ? `Exported ${settings.directory.name}/${file.name}.`
        : `Downloaded ${file.name}.`;
      this.ui.update({ message });
      this.status(message);
    } finally {
      this.ui.update({ busy: false });
    }
  }

  public async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (this.signal.aborted || (error instanceof DOMException && error.name === 'AbortError'))
        return;
      const message = error instanceof Error ? error.message : String(error);
      this.ui.update({ message });
      this.status(message);
    }
  }
}
