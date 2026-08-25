import {
  brushesInDocument,
  deriveBrush,
  parseLeakPath,
  parsePortalFile,
  type EditorBrushDragEvent,
  type MapCompileResult,
  type MapDocument,
  type Vec3,
} from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';

export class BuildPresenter {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
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
    this.ui.compileState.textContent = label;
    this.ui.compileState.dataset.state = state;
  }

  public compiledPreviewCamera(document: MapDocument): {
    readonly position: Vec3;
    readonly yaw: number;
    readonly pitch: number;
  } {
    const playerStart = document.entities.find((entity) => {
      const classname = entity.properties.classname?.toLowerCase();
      return classname === 'info_player_start' || classname === 'info_player_deathmatch';
    });
    const origin = playerStart?.properties.origin?.trim().split(/\s+/).map(Number);
    if (origin?.length === 3 && origin.every(Number.isFinite)) {
      const yawDegrees = Number(playerStart?.properties.angle ?? 0);
      return {
        position: [origin[0]!, origin[1]!, origin[2]! + 22],
        yaw: (Number.isFinite(yawDegrees) ? yawDegrees : 0) * (Math.PI / 180),
        pitch: -0.12,
      };
    }
    const bounds = brushesInDocument(document)
      .map((brush) => deriveBrush(brush).bounds)
      .filter((candidate) => candidate !== null);
    if (bounds.length === 0) return { position: [-256, -256, 192], yaw: Math.PI / 4, pitch: -0.35 };
    const minimum: [number, number, number] = [...bounds[0]!.min];
    const maximum: [number, number, number] = [...bounds[0]!.max];
    for (const bound of bounds.slice(1)) {
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis]!, bound.min[axis]!);
        maximum[axis] = Math.max(maximum[axis]!, bound.max[axis]!);
      }
    }
    const center: Vec3 = [
      (minimum[0] + maximum[0]) / 2,
      (minimum[1] + maximum[1]) / 2,
      (minimum[2] + maximum[2]) / 2,
    ];
    const distance = Math.max(
      maximum[0] - minimum[0],
      maximum[1] - minimum[1],
      maximum[2] - minimum[2],
      128,
    );
    return {
      position: [
        center[0] - distance * 1.8,
        center[1] - distance * 1.8,
        center[2] + distance * 1.1,
      ],
      yaw: Math.PI / 4,
      pitch: -0.38,
    };
  }

  public showCompiledPreview(show: boolean): void {
    this.state.showingCompiled = show && Boolean(this.state.compiledViewer);
    this.ui.canvases.perspective.hidden = this.state.showingCompiled;
    this.ui.compiledCanvas.hidden = !this.state.showingCompiled;
    this.ui.perspectiveMode.textContent = this.state.showingCompiled ? 'COMPILED · FLY' : 'EDIT';
    this.ui.togglePreviewButton.textContent = this.state.showingCompiled
      ? 'Show source'
      : 'Show compiled';
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

  public inspectBuildResult(result: MapCompileResult): void {
    this.state.latestBuild = result;
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
    this.ui.buildLogButton.disabled = result.logs.length === 0 && result.diagnostics.length === 0;
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

  public async installCompiledPreview(result: MapCompileResult): Promise<void> {
    const artifact = result.artifacts.find(
      (candidate) =>
        candidate.mediaType === 'application/x-quake-bsp' ||
        candidate.name.toLowerCase().endsWith('.bsp'),
    );
    if (!artifact) throw new Error('Compiler completed without returning a BSP artifact');
    const bspVersion =
      artifact.data.byteLength >= 4 ? new DataView(artifact.data).getInt32(0, true) : null;
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
      clearColor: [0.105, 0.12, 0.145, 1],
    });
    this.state.compiledViewer.setCamera(this.compiledPreviewCamera(this.state.session.document));
    this.state.compiledRevision = result.sourceDocumentRevision;
    this.ui.togglePreviewButton.disabled = false;
    this.showCompiledPreview(true);
  }

  public async compilePreview(): Promise<void> {
    this.ui.compileButton.disabled = true;
    this.setCompileState('COMPILING PREVIEW', 'busy');
    this.ui.statusMessage.textContent = `Sending document revision ${this.state.session.document.revision} to the compiler.`;
    try {
      const assets = this.app.document.compileAssets();
      const outcome = await this.state.compilerCoordinator.compile(
        {
          mapName: 'worldview_preview',
          mapText: this.app.document.serializeCompileDocument(assets),
          quality: 'preview',
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
        const errors = outcome.result.diagnostics
          .filter((diagnostic) => diagnostic.severity === 'error')
          .map((diagnostic) => `${diagnostic.stage}: ${diagnostic.message}`);
        this.ui.statusMessage.textContent =
          errors.slice(0, 3).join(' · ') || 'Compiler reported a failed build.';
        return;
      }
      await this.installCompiledPreview(outcome.result);
      this.setCompileState(`COMPILED R${outcome.result.sourceDocumentRevision}`, 'ready');
      this.ui.statusMessage.textContent = `Compiled preview installed in ${Math.round(outcome.result.elapsedMilliseconds)} ms.${this.state.compiledPreviewWarning ?? ''}`;
    } catch (error) {
      this.showCompiledPreview(false);
      this.setCompileState('COMPILER ERROR', 'offline');
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.ui.compileButton.disabled = false;
    }
  }

  public async checkCompilerService(): Promise<void> {
    try {
      const capabilities = await this.state.buildService.capabilities();
      let compileProfile = capabilities.compileProfiles.find((profile) => profile.id === 'default');
      const logicalProfile = this.state.projectWorkspace?.manifest.buildProfiles.find(
        ({ id }) => id === this.state.projectWorkspace?.manifest.defaultBuildProfile,
      );
      if (this.state.projectWorkspace && this.state.projectKey && logicalProfile) {
        const local = await this.state.projectLocalState.load(this.state.projectKey);
        const bound = local?.buildBindings[logicalProfile.id];
        compileProfile =
          capabilities.compileProfiles.find(({ id }) => id === bound) ??
          capabilities.compileProfiles.find(
            ({ game, qualities }) =>
              game === this.state.projectWorkspace?.manifest.game &&
              qualities.includes(logicalProfile.quality),
          );
        if (compileProfile && bound !== compileProfile.id) {
          await this.state.projectLocalState.setBuildBinding(
            this.state.projectKey,
            this.state.projectWorkspace.handle,
            logicalProfile.id,
            compileProfile.id,
          );
        }
      }
      this.state.activeCompileProfileId = compileProfile?.id ?? 'default';
      this.state.launchProfileId = capabilities.launchProfiles[0]?.id ?? null;
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
