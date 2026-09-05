import { EditorUiPort } from './editor-ui-port.js';

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

export class SelectionInspectorPort extends EditorUiPort<SelectionInspectorSnapshot> {
  public constructor() {
    super(EMPTY_SELECTION_INSPECTOR);
  }
}
