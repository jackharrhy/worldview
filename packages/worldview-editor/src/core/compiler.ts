export type MapCompilerBackend = 'wasm' | 'remote';
export type MapCompileQuality = 'preview' | 'final';
export type MapCompileStatus = 'succeeded' | 'failed';
export type MapCompileArtifactKind = 'bsp' | 'portal' | 'leak-path' | 'log' | 'other';

export interface MapCompileInputAsset {
  readonly name: string;
  readonly mediaType: string;
  readonly data: ArrayBuffer;
}

export interface MapCompileRequest {
  readonly mapName: string;
  readonly mapText: string;
  readonly quality: MapCompileQuality;
  readonly expectedDocumentRevision: number;
  readonly profileId?: string;
  readonly assets?: readonly MapCompileInputAsset[];
  readonly signal?: AbortSignal;
}

export interface MapCompileDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly stage: string;
  readonly message: string;
  readonly line?: number;
}

export interface MapCompileArtifact {
  readonly name: string;
  readonly mediaType: string;
  readonly data: ArrayBuffer;
  readonly kind: MapCompileArtifactKind;
  readonly stage?: string;
}

export interface MapCompileLog {
  readonly stage: string;
  readonly text: string;
  readonly truncated: boolean;
}

export interface MapCompileResult {
  readonly backend: MapCompilerBackend;
  readonly status: MapCompileStatus;
  readonly buildId: string;
  readonly sourceDocumentRevision: number;
  readonly diagnostics: readonly MapCompileDiagnostic[];
  readonly artifacts: readonly MapCompileArtifact[];
  readonly logs: readonly MapCompileLog[];
  readonly elapsedMilliseconds: number;
}

export interface MapBuildProfileCapability {
  readonly id: string;
  readonly label: string;
  readonly game: 'quake' | 'goldsrc';
  readonly qualities: readonly MapCompileQuality[];
}

export interface MapLaunchProfileCapability {
  readonly id: string;
  readonly label: string;
  readonly game: 'quake' | 'goldsrc';
}

export interface MapBuildCapabilities {
  readonly protocolVersion: 1;
  readonly compileProfiles: readonly MapBuildProfileCapability[];
  readonly launchProfiles: readonly MapLaunchProfileCapability[];
}

export interface MapLaunchRequest {
  readonly buildId: string;
  readonly profileId: string;
  readonly expectedDocumentRevision: number;
  readonly signal?: AbortSignal;
}

export interface MapLaunchResult {
  readonly buildId: string;
  readonly profileId: string;
  readonly sourceDocumentRevision: number;
  readonly launchedAt: number;
}

/** Implementations may host ericw-tools in a worker/WASM module or behind an HTTP build service. */
export interface MapCompiler {
  readonly backend: MapCompilerBackend;
  compile(request: MapCompileRequest): Promise<MapCompileResult>;
}

export interface MapBuildService extends MapCompiler {
  capabilities(signal?: AbortSignal): Promise<MapBuildCapabilities>;
  launch(request: MapLaunchRequest): Promise<MapLaunchResult>;
}
