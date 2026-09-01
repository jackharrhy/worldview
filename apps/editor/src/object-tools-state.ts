import { SnapshotStore } from '@jackharrhy/worldview/runtime';
import type { BrushClipMode, TransformAxis, Vec3 } from '@jackharrhy/worldview-editor';

export interface GroupToolSnapshot {
  readonly visible: boolean;
  readonly stateLabel: string;
  readonly name: string;
  readonly canCreate: boolean;
  readonly canRename: boolean;
  readonly canOpen: boolean;
  readonly canClose: boolean;
  readonly canDuplicateLinked: boolean;
  readonly canUnlink: boolean;
  readonly canUngroup: boolean;
}

export interface TransformSettingsSnapshot {
  readonly pivot: Vec3;
  readonly rotateAxis: TransformAxis;
  readonly rotateAngle: number;
  readonly updateEntityAngles: boolean;
  readonly canUpdateEntityAngles: boolean;
  readonly scale: Vec3;
  readonly shearSourceAxis: TransformAxis;
  readonly shearTargetAxis: TransformAxis;
  readonly shearOffset: number;
}

export interface ObjectToolsSnapshot {
  readonly hull: {
    readonly visible: boolean;
    readonly pointCount: number;
    readonly canCreate: boolean;
    readonly canDiscard: boolean;
  };
  readonly group: GroupToolSnapshot;
  readonly selectionBrush: {
    readonly visible: boolean;
    readonly countLabel: string;
  };
  readonly flipVisible: boolean;
  readonly faceExtrude: {
    readonly visible: boolean;
    readonly distance: number;
    readonly step: number;
  };
  readonly clip: {
    readonly visible: boolean;
    readonly pointCountLabel: string;
    readonly pointPositions: string;
    readonly mode: BrushClipMode;
    readonly canApply: boolean;
  };
  readonly transform: {
    readonly visible: boolean;
    readonly tool: 'rotate' | 'scale' | 'shear';
    readonly title: string;
    readonly help: string;
    readonly settings: TransformSettingsSnapshot;
  };
  readonly topology: {
    readonly visible: boolean;
    readonly title: string;
    readonly selectionCount: number;
    readonly gridSize: number;
  };
  readonly csg: {
    readonly visible: boolean;
    readonly selectionCountLabel: string;
    readonly canMerge: boolean;
    readonly canIntersect: boolean;
  };
  readonly brushEntity: {
    readonly visible: boolean;
    readonly canMakeStructural: boolean;
  };
  readonly nudgeVisible: boolean;
}

export type ObjectToolsCommand =
  | { readonly type: 'create-hull' }
  | { readonly type: 'discard-hull' }
  | { readonly type: 'create-group'; readonly name: string }
  | { readonly type: 'rename-group'; readonly name: string }
  | { readonly type: 'open-group' }
  | { readonly type: 'close-group' }
  | { readonly type: 'duplicate-linked-group' }
  | { readonly type: 'unlink-group' }
  | { readonly type: 'ungroup' }
  | {
      readonly type: 'selection-query';
      readonly mode: 'touching' | 'inside' | 'inside-projected';
    }
  | { readonly type: 'flip'; readonly axis: TransformAxis }
  | {
      readonly type: 'face-extrude';
      readonly operation: 'inward' | 'outward' | 'exact' | 'split' | 'stamp';
      readonly distance: number;
    }
  | { readonly type: 'set-clip-mode'; readonly mode: BrushClipMode }
  | { readonly type: 'apply-clip' }
  | { readonly type: 'reset-clip' }
  | { readonly type: 'set-transform-pivot'; readonly pivot: Vec3 }
  | { readonly type: 'reset-transform-pivot' }
  | { readonly type: 'apply-transform' }
  | { readonly type: 'csg'; readonly operation: 'merge' | 'intersect' | 'subtract' | 'hollow' }
  | { readonly type: 'make-brush-entity'; readonly classname: string }
  | { readonly type: 'make-structural' }
  | { readonly type: 'nudge'; readonly axis: TransformAxis; readonly direction: -1 | 1 };

export interface ObjectToolsActions {
  dispatch(command: ObjectToolsCommand): void;
}

const initialSettings: TransformSettingsSnapshot = {
  pivot: [0, 0, 0],
  rotateAxis: 2,
  rotateAngle: 15,
  updateEntityAngles: true,
  canUpdateEntityAngles: false,
  scale: [1, 1, 1],
  shearSourceAxis: 2,
  shearTargetAxis: 0,
  shearOffset: 16,
};

export class ObjectToolsPort {
  private readonly store = new SnapshotStore<ObjectToolsSnapshot>({
    hull: { visible: false, pointCount: 0, canCreate: false, canDiscard: false },
    group: {
      visible: false,
      stateLabel: 'Selection',
      name: 'Group',
      canCreate: true,
      canRename: false,
      canOpen: false,
      canClose: false,
      canDuplicateLinked: false,
      canUnlink: false,
      canUngroup: false,
    },
    selectionBrush: { visible: false, countLabel: '1 volume' },
    flipVisible: false,
    faceExtrude: { visible: false, distance: 16, step: 16 },
    clip: {
      visible: false,
      pointCountLabel: '0 / 3 points',
      pointPositions: 'No clip points.',
      mode: 'back',
      canApply: false,
    },
    transform: {
      visible: false,
      tool: 'rotate',
      title: 'Transform',
      help: 'Drag the viewport handle for a live snapped preview.',
      settings: initialSettings,
    },
    topology: { visible: false, title: 'Vertex editing', selectionCount: 0, gridSize: 16 },
    csg: {
      visible: false,
      selectionCountLabel: '0 selected',
      canMerge: false,
      canIntersect: false,
    },
    brushEntity: { visible: false, canMakeStructural: false },
    nudgeVisible: false,
  });
  private actions: ObjectToolsActions | null = null;

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public bind(actions: ObjectToolsActions): void {
    this.actions = actions;
  }

  public unbind(): void {
    this.actions = null;
  }

  public update(update: Partial<ObjectToolsSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...update });
  }

  public updateTransformSettings(update: Partial<TransformSettingsSnapshot>): void {
    const snapshot = this.store.getSnapshot();
    this.store.set({
      ...snapshot,
      transform: {
        ...snapshot.transform,
        settings: { ...snapshot.transform.settings, ...update },
      },
    });
  }

  public updateFaceExtrude(update: Partial<ObjectToolsSnapshot['faceExtrude']>): void {
    const snapshot = this.store.getSnapshot();
    this.store.set({
      ...snapshot,
      faceExtrude: { ...snapshot.faceExtrude, ...update },
    });
  }

  public dispatch(command: ObjectToolsCommand): void {
    this.actions?.dispatch(command);
  }
}
