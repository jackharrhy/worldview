export type MapCompilerBackend = 'wasm' | 'remote';
export type MapCompileQuality = 'preview' | 'final';

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
}

export interface MapCompileResult {
  readonly backend: MapCompilerBackend;
  readonly sourceDocumentRevision: number;
  readonly diagnostics: readonly MapCompileDiagnostic[];
  readonly artifacts: readonly MapCompileArtifact[];
  readonly elapsedMilliseconds: number;
}

/** Implementations may host ericw-tools in a worker/WASM module or behind an HTTP build service. */
export interface MapCompiler {
  readonly backend: MapCompilerBackend;
  compile(request: MapCompileRequest): Promise<MapCompileResult>;
}
