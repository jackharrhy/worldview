import { SnapshotStore } from '@jackharrhy/worldview';

export interface StatusMessageSnapshot {
  readonly message: string;
  readonly tone: 'normal' | 'error';
}

export class StatusMessagePort {
  private readonly store = new SnapshotStore<StatusMessageSnapshot>({
    message: 'Starting WebGPU source renderer...',
    tone: 'normal',
  });

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public get textContent(): string {
    return this.store.getSnapshot().message;
  }

  public set textContent(message: string | null) {
    this.store.set({ message: message ?? '', tone: 'normal' });
  }

  public setError(message: string): void {
    this.store.set({ message, tone: 'error' });
  }
}

export interface DocumentNameSnapshot {
  readonly label: string;
  readonly title: string;
}

export class DocumentNamePort {
  private readonly store = new SnapshotStore<DocumentNameSnapshot>({
    label: 'untitled.map',
    title: 'untitled.map',
  });

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public set(label: string, title: string): void {
    this.store.set({ label, title });
  }
}

export interface CompileStateSnapshot {
  readonly label: string;
  readonly state: 'offline' | 'ready' | 'busy' | 'stale';
}

export class CompileStatePort {
  private readonly store = new SnapshotStore<CompileStateSnapshot>({
    label: 'COMPILER OFFLINE',
    state: 'offline',
  });

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public set(label: string, state: CompileStateSnapshot['state']): void {
    this.store.set({ label, state });
  }
}

export class PointerContextPort {
  private readonly store = new SnapshotStore('Perspective / edit');

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public get textContent(): string {
    return this.store.getSnapshot();
  }

  public set textContent(message: string | null) {
    this.store.set(message ?? '');
  }
}

export interface DocumentSummarySnapshot {
  readonly revision: number;
  readonly entityCount: number;
  readonly brushCount: number;
  readonly groupCount: number;
  readonly hiddenObjectCount: number;
  readonly lockedObjectCount: number;
  readonly geometryErrorCount: number;
}

export class DocumentSummaryPort {
  private readonly store = new SnapshotStore<DocumentSummarySnapshot>({
    revision: 0,
    entityCount: 0,
    brushCount: 0,
    groupCount: 0,
    hiddenObjectCount: 0,
    lockedObjectCount: 0,
    geometryErrorCount: 0,
  });

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public set(snapshot: DocumentSummarySnapshot): void {
    this.store.set(snapshot);
  }
}

export interface EditorShellState {
  readonly statusMessage: StatusMessagePort;
  readonly documentName: DocumentNamePort;
  readonly compileState: CompileStatePort;
  readonly pointerContext: PointerContextPort;
  readonly documentSummary: DocumentSummaryPort;
}

export function createEditorShellState(): EditorShellState {
  return {
    statusMessage: new StatusMessagePort(),
    documentName: new DocumentNamePort(),
    compileState: new CompileStatePort(),
    pointerContext: new PointerContextPort(),
    documentSummary: new DocumentSummaryPort(),
  };
}
