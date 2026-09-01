import { SnapshotStore } from '@jackharrhy/worldview/runtime';

export interface SelectionInspectorSnapshot {
  readonly kind: string;
  readonly visible: boolean;
  readonly idLabel: string;
  readonly revisionLabel: string;
  readonly facesLabel: string;
  readonly materialLabel: string;
  readonly id: string;
  readonly revision: string;
  readonly faces: string;
  readonly bounds: string;
  readonly material: string;
  readonly faceNormal: string;
}

const EMPTY_SELECTION_INSPECTOR: SelectionInspectorSnapshot = {
  kind: 'None',
  visible: false,
  idLabel: 'Brush',
  revisionLabel: 'Revision',
  facesLabel: 'Faces',
  materialLabel: 'Material',
  id: '',
  revision: '',
  faces: '',
  bounds: '',
  material: '',
  faceNormal: '',
};

export class SelectionInspectorPort {
  private readonly store = new SnapshotStore<SelectionInspectorSnapshot>(EMPTY_SELECTION_INSPECTOR);
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public set(snapshot: SelectionInspectorSnapshot): void {
    this.store.set(snapshot);
  }
  public update(update: Partial<SelectionInspectorSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }
}
