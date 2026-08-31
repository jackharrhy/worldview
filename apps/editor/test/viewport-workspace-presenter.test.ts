import type { EditorViewportCameraState } from '@jackharrhy/worldview-editor';
import { describe, expect, it, vi } from 'vitest';

import {
  LocalStorageViewportWorkspaceStorage,
  ViewportWorkspacePresenter,
  type ViewportWorkspaceLayout,
  type ViewportWorkspaceRecord,
  type ViewportWorkspaceStorage,
} from '../src/viewport-workspace-presenter.js';

class MemoryViewportWorkspaceStorage implements ViewportWorkspaceStorage {
  public readonly records = new Map<string, ViewportWorkspaceRecord>();

  public load(documentKey: string): ViewportWorkspaceRecord | null {
    return this.records.get(documentKey) ?? null;
  }

  public save(record: ViewportWorkspaceRecord): void {
    this.records.set(record.documentKey, structuredClone(record));
  }
}

function camera(seed: number): EditorViewportCameraState {
  return {
    center: [seed, seed + 1, seed + 2],
    position: [seed + 3, seed + 4, seed + 5],
    yaw: 0.5 + seed / 100,
    pitch: -0.4,
    distance: 620 + seed,
    orthographicSpan: 640 + seed,
    fieldOfViewDegrees: 60,
    flySpeed: 320,
  };
}

const kinds = ['perspective', 'xy', 'xz', 'yz'] as const;

describe('viewport workspace persistence', () => {
  it('ignores malformed or mismatched browser records', () => {
    const values = new Map<string, string>();
    const browserStorage = new LocalStorageViewportWorkspaceStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    });
    values.set(
      'worldview.editor.viewport-workspace.map%3Aa',
      JSON.stringify({ version: 1, documentKey: 'map:b' }),
    );

    expect(browserStorage.load('map:a')).toBeNull();
  });

  it('restores each map camera, pane layout, and Perspective-only mode', () => {
    const storage = new MemoryViewportWorkspaceStorage();
    const first = new ViewportWorkspacePresenter(storage, vi.fn(), 1_000);
    const layout: ViewportWorkspaceLayout = {
      viewportColumn: 0.61,
      viewportTop: 0.43,
      inspectorWidth: 388,
    };

    first.beginDocumentChange();
    for (const [index, viewport] of kinds.entries()) {
      first.setCamera({ viewport, mode: 'pan', camera: camera(index * 10) });
    }
    first.setLayout(layout);
    first.setPerspectiveOnly(true);
    expect(first.restore('hosted-map:map-1')).toBe(false);
    first.flush();

    const applyCameras = vi.fn();
    const applyLayout = vi.fn();
    const applyPerspectiveOnly = vi.fn();
    const restored = new ViewportWorkspacePresenter(storage, vi.fn(), 1_000);
    restored.bind({ applyCameras, applyLayout, applyPerspectiveOnly });

    expect(restored.restore('hosted-map:map-1')).toBe(true);
    expect(applyCameras).toHaveBeenCalledWith(
      Object.fromEntries(kinds.map((kind, index) => [kind, camera(index * 10)])),
    );
    expect(applyLayout).toHaveBeenCalledWith(layout);
    expect(applyPerspectiveOnly).toHaveBeenCalledWith(true);

    first.dispose();
    restored.dispose();
  });

  it('keeps viewport snapshots isolated by document key', () => {
    const storage = new MemoryViewportWorkspaceStorage();
    const presenter = new ViewportWorkspacePresenter(storage, vi.fn(), 1_000);
    for (const [index, viewport] of kinds.entries()) {
      presenter.setCamera({ viewport, mode: 'pan', camera: camera(index) });
    }

    presenter.restore('map:a');
    presenter.setLayout({ viewportColumn: 0.4, viewportTop: 0.4, inspectorWidth: 300 });
    presenter.flush();
    presenter.beginDocumentChange();
    presenter.restore('map:b');
    presenter.setLayout({ viewportColumn: 0.7, viewportTop: 0.7, inspectorWidth: 420 });
    presenter.flush();

    expect(storage.records.get('map:a')?.layout.viewportColumn).toBe(0.4);
    expect(storage.records.get('map:b')?.layout.viewportColumn).toBe(0.7);
    presenter.dispose();
  });
});
