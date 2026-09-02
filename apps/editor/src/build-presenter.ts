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
import type { CameraUpdate } from '@jackharrhy/worldview';

import type { EditorShellState } from './editor-shell-state.js';
import type { CompileAssetEntry } from './editor-application-contracts.js';
import type { EditorStatePort } from './editor-state-port.js';
import { resolveEditorRenderTheme } from './render-theme.js';

type BuildUi = Pick<
  EditorShellState,
  | 'buildLog'
  | 'compileState'
  | 'editorCommands'
  | 'projectToolbar'
  | 'statusMessage'
  | 'viewportPresentation'
>;

type BuildState = EditorStatePort<
  | 'activeCompileProfileId'
  | 'activeCompileQuality'
  | 'activeGameProfile'
  | 'buildHistory'
  | 'buildOverlays'
  | 'buildService'
  | 'buildServiceEnabled'
  | 'compiledPreviewWarning'
  | 'compiledRevision'
  | 'compiledViewer'
  | 'compilerCoordinator'
  | 'currentDocumentName'
  | 'diagnosticQuakePalette'
  | 'latestBuild'
  | 'launchProfileId'
  | 'leakOverlayVisible'
  | 'loadedWadSources'
  | 'loadedGameAssets'
  | 'portalOverlayVisible'
  | 'perspectiveCamera'
  | 'projectKey'
  | 'projectLocalState'
  | 'projectWorkspace'
  | 'quakePalette'
  | 'renderer'
  | 'session'
  | 'showingCompiled',
  | 'activeCompileProfileId'
  | 'activeCompileQuality'
  | 'buildOverlays'
  | 'compiledPreviewWarning'
  | 'compiledRevision'
  | 'compiledViewer'
  | 'latestBuild'
  | 'launchProfileId'
  | 'leakOverlayVisible'
  | 'portalOverlayVisible'
  | 'showingCompiled'
>;

interface BuildDocumentCommands {
  compileAssets(): readonly CompileAssetEntry[];
  serializeCompileDocument(assets: readonly CompileAssetEntry[]): string;
}

export class BuildPresenter {
  public constructor(
    private readonly state: BuildState,
    private readonly ui: BuildUi,
    private readonly compiledCanvas: HTMLCanvasElement,
    private readonly document: BuildDocumentCommands,
    private readonly signal: AbortSignal,
  ) {
    this.ui.buildLog.bind({ inspect: (buildId) => void this.inspectHistoricalBuild(buildId) });
  }

  public dispose(): void {
    this.ui.buildLog.unbind();
  }

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
    this.ui.viewportPresentation.update({
      showingCompiled: this.state.showingCompiled,
      perspectiveMode: this.state.showingCompiled ? 'COMPILED · FLY' : 'EDIT',
    });
    this.ui.editorCommands.updateActions({
      'toggle-preview': {
        label: this.state.showingCompiled ? 'Show source' : 'Show compiled',
        active: this.state.showingCompiled,
      },
    });
    if (this.state.showingCompiled) this.state.compiledViewer?.start();
    else this.state.compiledViewer?.stop();
  }

  private compiledPreviewCamera(): CameraUpdate | null {
    const camera =
      this.state.renderer?.viewportCamera('perspective') ?? this.state.perspectiveCamera;
    return camera
      ? {
          position: [camera.position[0], camera.position[1], camera.position[2]],
          yaw: camera.yaw,
          pitch: camera.pitch,
          fieldOfView: camera.fieldOfViewDegrees,
        }
      : null;
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
    const actions = this.ui.editorCommands.getSnapshot().actions;
    this.ui.editorCommands.updateActions({
      'toggle-leak': {
        active: this.state.leakOverlayVisible && !(actions['toggle-leak']?.disabled ?? true),
      },
      'toggle-portals': {
        active: this.state.portalOverlayVisible && !(actions['toggle-portals']?.disabled ?? true),
      },
    });
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
    this.ui.editorCommands.updateActions({
      'toggle-leak': {
        disabled: !this.state.buildOverlays.some((overlay) => overlay.kind === 'leak-path'),
      },
      'toggle-portals': {
        disabled: !this.state.buildOverlays.some((overlay) => overlay.kind === 'portal'),
      },
      'build-log': { disabled: false },
    });
    this.ui.buildLog.update({
      output: [
        ...result.diagnostics.map(
          (diagnostic) =>
            `[${diagnostic.severity.toUpperCase()}] ${diagnostic.stage}: ${diagnostic.message}`,
        ),
        ...result.logs.map(
          (log) => `\n--- ${log.stage}${log.truncated ? ' (truncated)' : ''} ---\n${log.text}`,
        ),
      ].join('\n'),
      selectedBuildId: result.buildId,
    });
    this.ui.editorCommands.updateActions({
      launch: {
        disabled:
          result.status !== 'succeeded' ||
          !this.state.launchProfileId ||
          result.sourceDocumentRevision !== this.state.session.document.revision,
      },
    });
    this.updateDiagnosticOverlayVisibility();
  }

  public async renderBuildHistory(): Promise<void> {
    const records = await this.state.buildHistory.list(
      this.state.currentDocumentName.toLowerCase(),
    );
    const selectedBuildId =
      this.state.latestBuild &&
      records.some(({ buildId }) => buildId === this.state.latestBuild?.buildId)
        ? this.state.latestBuild.buildId
        : (records[0]?.buildId ?? null);
    this.ui.buildLog.update({
      history: records.map((record) => ({
        id: record.buildId,
        label: `${record.result.status === 'succeeded' ? 'Succeeded' : 'Failed'} · ${new Date(record.createdAt).toLocaleString()} · r${record.result.sourceDocumentRevision}`,
      })),
      selectedBuildId,
    });
  }

  public async inspectHistoricalBuild(buildId: string): Promise<void> {
    const record = (
      await this.state.buildHistory.list(this.state.currentDocumentName.toLowerCase())
    ).find((candidate) => candidate.buildId === buildId);
    if (!record) return;
    this.inspectBuildResult(record.result, false);
    this.ui.statusMessage.set(
      `Showing retained build ${record.buildId.slice(0, 8)} from ${new Date(record.createdAt).toLocaleString()}.`,
    );
  }

  public async installCompiledPreview(
    result: MapCompileResult,
    camera: CameraUpdate | null,
  ): Promise<boolean> {
    this.signal.throwIfAborted();
    const artifact = result.artifacts.find(
      (candidate) =>
        candidate.mediaType === 'application/x-quake-bsp' ||
        candidate.name.toLowerCase().endsWith('.bsp'),
    );
    if (!artifact) throw new Error('Compiler completed without returning a BSP artifact');
    const bspVersion = compiledBspVersion(artifact.data);
    if (!supportsCompiledBspPreview(artifact.data)) {
      const versionLabel =
        bspVersion === 'BSP2' ? bspVersion : `BSP${bspVersion ?? ' (truncated)'}`;
      this.state.compiledPreviewWarning = ` ${versionLabel} preview is not supported yet; the compiled artifact remains available.`;
      this.state.compiledViewer?.dispose();
      this.state.compiledViewer = null;
      this.state.compiledRevision = null;
      this.ui.viewportPresentation.update({ showingCompiled: false });
      this.ui.editorCommands.updateActions({ 'toggle-preview': { disabled: true } });
      this.showCompiledPreview(false);
      return false;
    }
    const needsDiagnosticPalette =
      (bspVersion === 29 || bspVersion === 38 || bspVersion === 'BSP2') && !this.state.quakePalette;
    this.state.compiledPreviewWarning = needsDiagnosticPalette
      ? ' Using the diagnostic palette; load the game palette for exact texture colors.'
      : null;
    this.state.compiledViewer?.dispose();
    this.state.compiledViewer = null;
    const { createWorldview } = await import('@jackharrhy/worldview');
    this.signal.throwIfAborted();
    const viewer = await createWorldview({
      canvas: this.compiledCanvas,
      source: {
        bsp: artifact.data,
        wads: [...this.state.loadedWadSources.values()],
        gameAssets: Object.fromEntries(this.state.loadedGameAssets),
        ...(bspVersion === 29 || bspVersion === 38 || bspVersion === 'BSP2'
          ? { palette: this.state.quakePalette ?? this.state.diagnosticQuakePalette }
          : {}),
      },
      controls: 'fly',
      autoStart: false,
      audio: false,
      textureFiltering: 'nearest',
      clearColor: resolveEditorRenderTheme().background,
    });
    try {
      this.signal.throwIfAborted();
      if (camera) viewer.setCamera(camera);
    } catch (error) {
      viewer.dispose();
      throw error;
    }
    this.state.compiledViewer = viewer;
    this.state.compiledRevision = result.sourceDocumentRevision;
    this.ui.editorCommands.updateActions({ 'toggle-preview': { disabled: false } });
    this.showCompiledPreview(true);
    viewer.resize();
    return true;
  }

  public async compilePreview(): Promise<void> {
    this.signal.throwIfAborted();
    const previewCamera = this.compiledPreviewCamera();
    const quality = this.state.activeCompileQuality;
    this.ui.editorCommands.updateActions({ compile: { disabled: true } });
    this.setCompileState(`COMPILING ${quality.toUpperCase()}`, 'busy');
    this.ui.statusMessage.set(
      `Sending document revision ${this.state.session.document.revision} to the compiler.`,
    );
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
      this.signal.throwIfAborted();
      if (outcome.status === 'cancelled') {
        this.setCompileState('COMPILE CANCELLED', 'offline');
        this.ui.statusMessage.set('Compile cancelled.');
        return;
      }
      if (outcome.status === 'stale') {
        this.setCompileState('RESULT STALE', 'stale');
        this.ui.statusMessage.set(
          'Compile finished, but the source changed. Result was not installed.',
        );
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
        this.ui.statusMessage.set(
          errors.slice(0, 3).join(' · ') || 'Compiler reported a failed build.',
        );
        return;
      }
      const previewInstalled = await this.installCompiledPreview(outcome.result, previewCamera);
      this.setCompileState(`COMPILED R${outcome.result.sourceDocumentRevision}`, 'ready');
      this.ui.statusMessage.set(
        `${previewInstalled ? 'Compiled preview installed' : 'Compile completed'} in ${Math.round(outcome.result.elapsedMilliseconds)} ms.${this.state.compiledPreviewWarning ?? ''}`,
      );
    } catch (error) {
      if (this.signal.aborted) return;
      this.showCompiledPreview(false);
      this.setCompileState('COMPILER ERROR', 'offline');
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    } finally {
      if (!this.signal.aborted)
        this.ui.editorCommands.updateActions({ compile: { disabled: false } });
    }
  }

  public async checkCompilerService(): Promise<void> {
    this.signal.throwIfAborted();
    if (!this.state.buildServiceEnabled) {
      this.ui.editorCommands.updateActions({
        compile: { disabled: true },
        launch: { disabled: true },
      });
      this.setCompileState('COMPILER UNCONFIGURED', 'offline');
      return;
    }
    try {
      const capabilities = await this.state.buildService.capabilities(this.signal);
      this.signal.throwIfAborted();
      const activeGame = this.state.projectWorkspace?.manifest.game ?? this.state.activeGameProfile;
      const logicalProfile = this.state.projectWorkspace?.manifest.buildProfiles.find(
        ({ id }) => id === this.ui.projectToolbar.getSnapshot().selectedBuildProfileId,
      );
      let preferredCompileProfileId: string | undefined;
      if (this.state.projectWorkspace && this.state.projectKey && logicalProfile) {
        const local = await this.state.projectLocalState.load(this.state.projectKey);
        this.signal.throwIfAborted();
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
          this.signal.throwIfAborted();
        }
      }
      this.state.activeCompileProfileId = compileProfile?.id ?? 'default';
      this.state.activeCompileQuality = logicalProfile?.quality ?? 'preview';
      this.ui.editorCommands.updateActions({
        compile: { label: logicalProfile ? `Build ${logicalProfile.label}` : 'Compile' },
      });
      this.state.launchProfileId = selectMapLaunchProfile(capabilities, activeGame)?.id ?? null;
      this.ui.editorCommands.updateActions({
        compile: { disabled: !compileProfile },
        launch: {
          disabled:
            !this.state.launchProfileId ||
            this.state.latestBuild?.status !== 'succeeded' ||
            this.state.latestBuild.sourceDocumentRevision !== this.state.session.document.revision,
        },
      });
      if (compileProfile) this.setCompileState('COMPILER READY', 'ready');
      else this.setCompileState('COMPILER UNCONFIGURED', 'offline');
    } catch {
      if (this.signal.aborted) return;
      this.ui.editorCommands.updateActions({
        compile: { disabled: true },
        launch: { disabled: true },
      });
      this.setCompileState('COMPILER OFFLINE', 'offline');
    }
  }
}
