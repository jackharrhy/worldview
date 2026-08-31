import type { EditorViewportCameraState, EditorViewportKind } from '@jackharrhy/worldview-editor';

export interface ViewportWorkspaceLayout {
  readonly viewportColumn: number;
  readonly viewportTop: number;
  readonly inspectorWidth: number;
}

export interface ViewportWorkspaceActions {
  applyCameras(cameras: Readonly<Record<EditorViewportKind, EditorViewportCameraState>>): void;
  applyLayout(layout: ViewportWorkspaceLayout): void;
  applyPerspectiveOnly(enabled: boolean): void;
}
