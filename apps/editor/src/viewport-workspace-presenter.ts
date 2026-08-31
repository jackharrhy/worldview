import {
  type EditorCameraChangeEvent,
  type EditorViewportCameraState,
  type EditorViewportKind,
} from '@jackharrhy/worldview-editor';
import { z } from 'zod';

import type {
  ViewportWorkspaceActions,
  ViewportWorkspaceLayout,
} from './viewport-workspace-contracts.js';

const STORAGE_PREFIX = 'worldview.editor.viewport-workspace.';
export const VIEWPORT_WORKSPACE_DEBOUNCE_MS = 300;

export interface ViewportWorkspaceRecord {
  readonly version: 1;
  readonly documentKey: string;
  readonly cameras: Readonly<Record<EditorViewportKind, EditorViewportCameraState>>;
  readonly layout: ViewportWorkspaceLayout;
  readonly perspectiveOnly: boolean;
  readonly updatedAt: number;
}

const Vec3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const CameraSchema = z.strictObject({
  center: Vec3Schema,
  position: Vec3Schema,
  yaw: z.number().finite(),
  pitch: z.number().finite().min(-1.45).max(1.45),
  distance: z.number().finite().min(8).max(65_536),
  orthographicSpan: z.number().finite().min(32).max(32_768),
  fieldOfViewDegrees: z.number().finite().min(20).max(120),
  flySpeed: z.number().finite().min(32).max(4_096),
}) satisfies z.ZodType<EditorViewportCameraState>;

export const ViewportWorkspaceRecordSchema = z.strictObject({
  version: z.literal(1),
  documentKey: z.string().min(1).max(4_096),
  cameras: z.strictObject({
    perspective: CameraSchema,
    xy: CameraSchema,
    xz: CameraSchema,
    yz: CameraSchema,
  }),
  layout: z.strictObject({
    viewportColumn: z.number().finite().min(0.3).max(0.76),
    viewportTop: z.number().finite().min(0.2).max(0.8),
    inspectorWidth: z.number().finite().int().min(240).max(520),
  }),
  perspectiveOnly: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
}) satisfies z.ZodType<ViewportWorkspaceRecord>;

export interface ViewportWorkspaceStorage {
  load(documentKey: string): ViewportWorkspaceRecord | null;
  save(record: ViewportWorkspaceRecord): void;
}

export class LocalStorageViewportWorkspaceStorage implements ViewportWorkspaceStorage {
  public constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  ) {}

  public load(documentKey: string): ViewportWorkspaceRecord | null {
    const serialized = this.storage.getItem(this.key(documentKey));
    if (!serialized) return null;
    try {
      const parsed = ViewportWorkspaceRecordSchema.safeParse(JSON.parse(serialized));
      return parsed.success && parsed.data.documentKey === documentKey ? parsed.data : null;
    } catch {
      return null;
    }
  }

  public save(record: ViewportWorkspaceRecord): void {
    this.storage.setItem(this.key(record.documentKey), JSON.stringify(record));
  }

  private key(documentKey: string): string {
    return `${STORAGE_PREFIX}${encodeURIComponent(documentKey)}`;
  }
}

const DEFAULT_LAYOUT: ViewportWorkspaceLayout = {
  viewportColumn: 0.5,
  viewportTop: 0.5,
  inspectorWidth: 320,
};

export class ViewportWorkspacePresenter {
  private documentKey: string | null = null;
  private cameras: Partial<Record<EditorViewportKind, EditorViewportCameraState>> = {};
  private layout = DEFAULT_LAYOUT;
  private perspectiveOnly = false;
  private actions: ViewportWorkspaceActions | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private applying = false;
  private readonly onPageHide = () => this.flush();
  private readonly onVisibilityChange = () => {
    if (globalThis.document?.visibilityState === 'hidden') this.flush();
  };

  public constructor(
    private readonly storage: ViewportWorkspaceStorage = new LocalStorageViewportWorkspaceStorage(),
    private readonly onError: (error: unknown) => void = console.error,
    private readonly debounceMs = VIEWPORT_WORKSPACE_DEBOUNCE_MS,
  ) {
    globalThis.window?.addEventListener('pagehide', this.onPageHide);
    globalThis.document?.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  public bind(actions: ViewportWorkspaceActions): void {
    this.actions = actions;
  }

  public unbind(): void {
    this.actions = null;
  }

  public beginDocumentChange(): void {
    this.flush();
    this.documentKey = null;
    this.dirty = false;
  }

  public restore(documentKey: string): boolean {
    this.cancelTimer();
    this.documentKey = documentKey;
    let record: ViewportWorkspaceRecord | null = null;
    try {
      record = this.storage.load(documentKey);
    } catch (error) {
      this.onError(error);
    }
    if (!record) {
      this.dirty = true;
      this.schedule();
      return false;
    }

    this.cameras = { ...record.cameras };
    this.layout = { ...record.layout };
    this.perspectiveOnly = record.perspectiveOnly;
    this.dirty = false;
    this.applying = true;
    try {
      this.actions?.applyLayout(this.layout);
      this.actions?.applyCameras(record.cameras);
      this.actions?.applyPerspectiveOnly(this.perspectiveOnly);
    } finally {
      this.applying = false;
    }
    return true;
  }

  public setCamera(event: EditorCameraChangeEvent): void {
    this.cameras = { ...this.cameras, [event.viewport]: event.camera };
    this.changed();
  }

  public setLayout(layout: ViewportWorkspaceLayout): void {
    this.layout = { ...layout };
    this.changed();
  }

  public setPerspectiveOnly(enabled: boolean): void {
    this.perspectiveOnly = enabled;
    this.actions?.applyPerspectiveOnly(enabled);
    this.changed();
  }

  public flush(): void {
    this.cancelTimer();
    if (!this.dirty || !this.documentKey) return;
    const cameras = this.completeCameras();
    if (!cameras) return;
    try {
      this.storage.save({
        version: 1,
        documentKey: this.documentKey,
        cameras,
        layout: this.layout,
        perspectiveOnly: this.perspectiveOnly,
        updatedAt: Date.now(),
      });
      this.dirty = false;
    } catch (error) {
      this.onError(error);
    }
  }

  public dispose(): void {
    this.flush();
    this.unbind();
    globalThis.window?.removeEventListener('pagehide', this.onPageHide);
    globalThis.document?.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private changed(): void {
    if (this.applying) return;
    this.dirty = true;
    this.schedule();
  }

  private schedule(): void {
    if (!this.documentKey) return;
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private completeCameras(): ViewportWorkspaceRecord['cameras'] | null {
    const { perspective, xy, xz, yz } = this.cameras;
    return perspective && xy && xz && yz ? { perspective, xy, xz, yz } : null;
  }
}
