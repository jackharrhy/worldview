import {
  compiledBspVersion,
  parseLeakPath,
  parsePortalFile,
  selectMapBuildProfile,
  selectMapLaunchProfile,
  supportsCompiledBspPreview,
  type EditorBrushDragEvent,
  type MapCompileResult,
} from '@jackharrhy/worldview-editor';

import type { DocumentPresenter } from './document-presenter.js';
import type { EditorElements } from './editor-elements.js';
import { setToolbarButtonLabel } from './editor-elements.js';
import type { EditorState } from './editor-state.js';
import { resolveEditorRenderTheme } from './render-theme.js';

export class BuildPresenter {
  public constructor(
    private readonly state: EditorState,
    private readonly ui: EditorElements,
    private readonly document: Pick<
      DocumentPresenter,
      'compileAssets' | 'serializeCompileDocument'
    >,
  ) {}

  public formatVector(value: readonly number[]): string {
    return value.map((component) => Number(component.toFixed(2))).join(' ');
  }

  public movementDescription(
    event: Pick<EditorBrushDragEvent, 'movementPlane' | 'axisRestriction'>,
  ): string {
    const plane =
      event.movementPlane === 'z'
        ? 'vertical Z'
        : event.movementPlane === 'xy'
          ? 'XY plane'
          : 'viewport plane';
    return event.axisRestriction === null
      ? plane
      : `${plane}, ${['X', 'Y', 'Z'][event.axisRestriction]} locked`;
  }

  public setCompileState(label: string, state: 'offline' | 'ready' | 'busy' | 'stale'): void {
    this.ui.compileState.set(label, state);
  }

  public showCompiledPreview(show: boolean): void {
    this.state.showingCompiled = show && Boolean(this.state.compiledViewer);
    this.ui.canvases.perspective.hidden = this.state.showingCompiled;
    this.ui.compiledCanvas.hidden = !this.state.showingCompiled;
    this.ui.perspectiveMode.textContent = this.state.showingCompiled ? 'COMPILED · FLY' : 'EDIT';
    setToolbarButtonLabel(
      this.ui.togglePreviewButton,
      this.state.showingCompiled ? 'Show source' : 'Show compiled',
    );
    if (this.state.showingCompiled) this.state.compiledViewer?.start();
    else this.state.compiledViewer?.stop();
  }

  public buildArtifactText(result: MapCompileResult, kind: 'leak-path' | 'portal'): string | null {
    const artifact = result.artifacts.find((candidate) => candidate.kind === kind);
    return artifact ? new TextDecoder().decode(artifact.data) : null;
  }

  public updateDiagnosticOverlayVisibility(): void {
    this.state.renderer?.setDiagnosticOverlays(
      this.state.buildOverlays.filter(
        (overlay) =>
          (overlay.kind === 'leak-path' && this.state.leakOverlayVisible) ||
          (overlay.kind === 'portal' && this.state.portalOverlayVisible),
      ),
    );
    this.ui.toggleLeakButton.classList.toggle(
      'active',
      this.state.leakOverlayVisible && !this.ui.toggleLeakButton.disabled,
    );
    this.ui.togglePortalsButton.classList.toggle(
      'active',
      this.state.portalOverlayVisible && !this.ui.togglePortalsButton.disabled,
    );
  }

  public inspectBuildResult(result: MapCompileResult, record = true): void {
    this.state.latestBuild = result;
    if (record)
      void this.state.buildHistory.record(this.state.currentDocumentName.toLowerCase(), result);
    const leakText = this.buildArtifactText(result, 'leak-path');
    const portalText = this.buildArtifactText(result, 'portal');
    const leak = leakText ? parseLeakPath(leakText) : null;
    const portals = portalText ? parsePortalFile(portalText) : null;
    this.state.buildOverlays = [
      ...(leak && leak.points.length > 1
        ? [{ id: `${result.buildId}:leak`, kind: 'leak-path' as const, points: leak.points }]
        : []),
      ...(portals
        ? portals.polygons.map((points, index) => ({
            id: `${result.buildId}:portal:${index}`,
            kind: 'portal' as const,
            points,
          }))
        : []),
    ];
    this.state.leakOverlayVisible = Boolean(leak?.points.length);
    this.state.portalOverlayVisible = false;
    this.ui.toggleLeakButton.disabled = !this.state.buildOverlays.some(
      (overlay) => overlay.kind === 'leak-path',
    );
    this.ui.togglePortalsButton.disabled = !this.state.buildOverlays.some(
      (overlay) => overlay.kind === 'portal',
    );
    this.ui.buildLogButton.disabled = false;
    this.ui.buildLogOutput.textContent = [
      ...result.diagnostics.map(
        (diagnostic) =>
          `[${diagnostic.severity.toUpperCase()}] ${diagnostic.stage}: ${diagnostic.message}`,
      ),
      ...result.logs.map(
        (log) => `\n--- ${log.stage}${log.truncated ? ' (truncated)' : ''} ---\n${log.text}`,
      ),
    ].join('\n');
    this.ui.launchButton.disabled =
      result.status !== 'succeeded' ||
      !this.state.launchProfileId ||
      result.sourceDocumentRevision !== this.state.session.document.revision;
    this.updateDiagnosticOverlayVisibility();
  }

  public async renderBuildHistory(): Promise<void> {
    const records = await this.state.buildHistory.list(
      this.state.currentDocumentName.toLowerCase(),
    );
    this.ui.buildHistory.replaceChildren(
      ...records.map((record) => {
        const option = document.createElement('option');
        option.value = record.buildId;
        option.textContent = `${record.result.status === 'succeeded' ? '✓' : '×'} ${new Date(record.createdAt).toLocaleString()} · r${record.result.sourceDocumentRevision}`;
        return option;
      }),
    );
    this.ui.buildHistory.disabled = records.length === 0;
    if (
      this.state.latestBuild &&
      records.some(({ buildId }) => buildId === this.state.latestBuild?.buildId)
    ) {
      this.ui.buildHistory.value = this.state.latestBuild.buildId;
    }
  }

  public async inspectHistoricalBuild(buildId: string): Promise<void> {
    const record = (
      await this.state.buildHistory.list(this.state.currentDocumentName.toLowerCase())
    ).find((candidate) => candidate.buildId === buildId);
    if (!record) return;
    this.inspectBuildResult(record.result, false);
    this.ui.statusMessage.textContent = `Showing retained build ${record.buildId.slice(0, 8)} from ${new Date(record.createdAt).toLocaleString()}.`;
  }

  public async installCompiledPreview(result: MapCompileResult): Promise<boolean> {
    const artifact = result.artifacts.find(
      (candidate) =>
        candidate.mediaType === 'application/x-quake-bsp' ||
        candidate.name.toLowerCase().endsWith('.bsp'),
    );
    if (!artifact) throw new Error('Compiler completed without returning a BSP artifact');
    const bspVersion = compiledBspVersion(artifact.data);
    if (!supportsCompiledBspPreview(artifact.data)) {
      this.state.compiledPreviewWarning = ` BSP${bspVersion ?? ' (truncated)'} preview is not supported yet; the compiled artifact remains available.`;
      this.state.compiledViewer?.dispose();
      this.state.compiledViewer = null;
      this.state.compiledRevision = null;
      this.ui.compiledCanvas.hidden = true;
      this.ui.togglePreviewButton.disabled = true;
      this.showCompiledPreview(false);
      return false;
    }
    const needsDiagnosticPalette = bspVersion === 29 && !this.state.quakePalette;
    this.state.compiledPreviewWarning = needsDiagnosticPalette
      ? ' Using the diagnostic palette; load the map’s Quake palette for exact texture colors.'
      : null;
    this.state.compiledViewer?.dispose();
    this.state.compiledViewer = null;
    this.ui.compiledCanvas.hidden = false;
    const { createWorldview } = await import('@jackharrhy/worldview');
    this.state.compiledViewer = await createWorldview({
      canvas: this.ui.compiledCanvas,
      source: {
        bsp: artifact.data,
        wads: [...this.state.loadedWadSources.values()],
        ...(bspVersion === 29
          ? { palette: this.state.quakePalette ?? this.state.diagnosticQuakePalette }
          : {}),
      },
      controls: 'fly',
      autoStart: true,
      audio: false,
      textureFiltering: 'nearest',
      clearColor: resolveEditorRenderTheme().background,
    });
    this.state.compiledRevision = result.sourceDocumentRevision;
    this.ui.togglePreviewButton.disabled = false;
    this.showCompiledPreview(true);
    return true;
  }

  public async compilePreview(): Promise<void> {
    const quality = this.state.activeCompileQuality;
    this.ui.compileButton.disabled = true;
    this.setCompileState(`COMPILING ${quality.toUpperCase()}`, 'busy');
    this.ui.statusMessage.textContent = `Sending document revision ${this.state.session.document.revision} to the compiler.`;
    try {
      const assets = this.document.compileAssets();
      const outcome = await this.state.compilerCoordinator.compile(
        {
          mapName: 'worldview_preview',
          mapText: this.document.serializeCompileDocument(assets),
          quality,
          profileId: this.state.activeCompileProfileId,
          expectedDocumentRevision: this.state.session.document.revision,
          assets: assets.map(({ name, data }) => ({
            name,
            mediaType: 'application/x-wad',
            data,
          })),
        },
        () => this.state.session.document.revision,
      );
      if (outcome.status === 'cancelled') {
        this.setCompileState('COMPILE CANCELLED', 'offline');
        this.ui.statusMessage.textContent = 'Compile cancelled.';
        return;
      }
      if (outcome.status === 'stale') {
        this.setCompileState('RESULT STALE', 'stale');
        this.ui.statusMessage.textContent =
          'Compile finished, but the source changed. Result was not installed.';
        return;
      }
      this.inspectBuildResult(outcome.result);
      if (outcome.status === 'failed') {
        this.showCompiledPreview(false);
        this.setCompileState('COMPILE FAILED', 'offline');
        const errors: string[] = [];
        for (const diagnostic of outcome.result.diagnostics) {
          if (diagnostic.severity === 'error') {
            errors.push(`${diagnostic.stage}: ${diagnostic.message}`);
          }
        }
        this.ui.statusMessage.textContent =
          errors.slice(0, 3).join(' · ') || 'Compiler reported a failed build.';
        return;
      }
      const previewInstalled = await this.installCompiledPreview(outcome.result);
      this.setCompileState(`COMPILED R${outcome.result.sourceDocumentRevision}`, 'ready');
      this.ui.statusMessage.textContent = `${previewInstalled ? 'Compiled preview installed' : 'Compile completed'} in ${Math.round(outcome.result.elapsedMilliseconds)} ms.${this.state.compiledPreviewWarning ?? ''}`;
    } catch (error) {
      this.showCompiledPreview(false);
      this.setCompileState('COMPILER ERROR', 'offline');
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.ui.compileButton.disabled = false;
    }
  }

  public async checkCompilerService(): Promise<void> {
    if (!this.state.compilerProbeEnabled) {
      this.ui.compileButton.disabled = true;
      this.ui.launchButton.disabled = true;
      this.setCompileState('COMPILER UNCONFIGURED', 'offline');
      return;
    }
    try {
      const capabilities = await this.state.buildService.capabilities();
      const activeGame = this.state.projectWorkspace?.manifest.game ?? this.state.activeGameProfile;
      const logicalProfile = this.state.projectWorkspace?.manifest.buildProfiles.find(
        ({ id }) => id === this.ui.buildProfile.value,
      );
      let preferredCompileProfileId: string | undefined;
      if (this.state.projectWorkspace && this.state.projectKey && logicalProfile) {
        const local = await this.state.projectLocalState.load(this.state.projectKey);
        preferredCompileProfileId = local?.buildBindings[logicalProfile.id];
      }
      const compileProfile = selectMapBuildProfile(capabilities, {
        game: activeGame,
        ...(preferredCompileProfileId ? { preferredId: preferredCompileProfileId } : {}),
        ...(logicalProfile ? { quality: logicalProfile.quality } : {}),
      });
      if (this.state.projectWorkspace && this.state.projectKey && logicalProfile) {
        if (compileProfile && preferredCompileProfileId !== compileProfile.id) {
          await this.state.projectLocalState.setBuildBinding(
            this.state.projectKey,
            this.state.projectWorkspace.handle,
            logicalProfile.id,
            compileProfile.id,
          );
        }
      }
      this.state.activeCompileProfileId = compileProfile?.id ?? 'default';
      this.state.activeCompileQuality = logicalProfile?.quality ?? 'preview';
      setToolbarButtonLabel(
        this.ui.compileButton,
        logicalProfile ? `Build ${logicalProfile.label}` : 'Compile',
      );
      this.state.launchProfileId = selectMapLaunchProfile(capabilities, activeGame)?.id ?? null;
      this.ui.compileButton.disabled = !compileProfile;
      this.ui.launchButton.disabled =
        !this.state.launchProfileId ||
        this.state.latestBuild?.status !== 'succeeded' ||
        this.state.latestBuild.sourceDocumentRevision !== this.state.session.document.revision;
      if (compileProfile) this.setCompileState('COMPILER READY', 'ready');
      else this.setCompileState('COMPILER UNCONFIGURED', 'offline');
    } catch {
      this.ui.compileButton.disabled = true;
      this.ui.launchButton.disabled = true;
      this.setCompileState('COMPILER OFFLINE', 'offline');
    }
  }
}
