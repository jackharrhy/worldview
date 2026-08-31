import {
  EditorSession,
  createEmptyDocument,
  type EditorSourceRenderer,
  type SweepTransform,
} from '@jackharrhy/worldview-editor';
import { describe, expect, it, vi } from 'vitest';

import { createEditorShellState } from '../src/editor-shell-state.js';
import { EditorToolControllerRegistry } from '../src/editor-tool-controller-registry.js';

function sweepTransform(translation: readonly [number, number, number]): SweepTransform {
  return { translation, rotationDegrees: [0, 0, 0], scale: 1 };
}

describe('EditorToolControllerRegistry', () => {
  it('owns tool activation and presentation without an EditorApplication', () => {
    const ui = createEditorShellState();
    const session = new EditorSession(createEmptyDocument());
    const renderer = {
      setTool: vi.fn(),
      setTransformPivot: vi.fn(),
    } as unknown as EditorSourceRenderer;
    const state = {
      activeGridSize: 16,
      activeTool: 'select' as const,
      lastPointerPosition: null,
      renderer,
      session,
      simpleShapeOptions: { kind: 'cylinder' as const, sides: 8, hollow: false },
      sweepCandidate: null,
      sweepDefaultTransform: sweepTransform([0, 0, 64]),
      sweepDragBase: null,
      sweepEscapeReset: false,
      sweepTransform: sweepTransform([0, 0, 64]),
      transformPivot: null,
      transformPivotSelectionKey: null,
      topologySelectedVertices: [],
    };
    const geometry = {
      applyClip: vi.fn(),
      applySweep: vi.fn(),
      clearActiveHandleSelection: vi.fn(() => false),
      cloneSweepTransform: vi.fn((transform: SweepTransform) => ({ ...transform })),
      deleteTopologySelection: vi.fn(),
      initialSweepTransform: vi.fn(() => sweepTransform([0, 0, 128])),
      refreshSweepPreview: vi.fn(),
      resetSweep: vi.fn(),
      simpleShapeLabel: vi.fn(() => 'cylinder'),
      syncSweepControls: vi.fn(),
      updateSimpleShapeFields: vi.fn(),
    };
    const inspector = { updateInspector: vi.fn() };
    const registry = new EditorToolControllerRegistry(
      state,
      ui,
      geometry,
      {
        commitFaceNudge: vi.fn(() => false),
        commitTopologyNudge: vi.fn(() => false),
        isTopologyTool: (tool): tool is 'vertex' | 'edge' => tool === 'vertex' || tool === 'edge',
        isTransformTool: (tool): tool is 'rotate' | 'scale' | 'shear' =>
          tool === 'rotate' || tool === 'scale' || tool === 'shear',
        viewportKeyboardNudge: vi.fn(() => null),
      },
      inspector,
    );

    registry.activate('create');

    expect(state.activeTool).toBe('create');
    expect(renderer.setTool).toHaveBeenCalledWith('create');
    expect(geometry.updateSimpleShapeFields).toHaveBeenCalledOnce();
    expect(ui.pointerContext.getSnapshot()).toBe('CREATE / edit');
    expect(ui.statusMessage.getSnapshot().message).toContain('draw a cylinder');
    expect(inspector.updateInspector).toHaveBeenCalledOnce();
  });

  it('runs the registered sweep enter and leave behavior', () => {
    const ui = createEditorShellState();
    const session = new EditorSession(createEmptyDocument());
    const renderer = {
      setDocument: vi.fn(),
      setSweepCaps: vi.fn(),
      setTool: vi.fn(),
      setTransformPivot: vi.fn(),
    } as unknown as EditorSourceRenderer;
    const state = {
      activeGridSize: 16,
      activeTool: 'select' as const,
      lastPointerPosition: null,
      renderer,
      session,
      simpleShapeOptions: { kind: 'cuboid' as const },
      sweepCandidate: null,
      sweepDefaultTransform: sweepTransform([0, 0, 64]),
      sweepDragBase: null,
      sweepEscapeReset: false,
      sweepTransform: sweepTransform([0, 0, 64]),
      transformPivot: null,
      transformPivotSelectionKey: null,
      topologySelectedVertices: [],
    };
    const initial = sweepTransform([16, 32, 48]);
    const geometry = {
      applyClip: vi.fn(),
      applySweep: vi.fn(),
      clearActiveHandleSelection: vi.fn(() => false),
      cloneSweepTransform: vi.fn((transform: SweepTransform) => ({ ...transform })),
      deleteTopologySelection: vi.fn(),
      initialSweepTransform: vi.fn(() => initial),
      refreshSweepPreview: vi.fn(),
      resetSweep: vi.fn(),
      simpleShapeLabel: vi.fn(() => 'cuboid'),
      syncSweepControls: vi.fn(),
      updateSimpleShapeFields: vi.fn(),
    };
    const registry = new EditorToolControllerRegistry(
      state,
      ui,
      geometry,
      {
        commitFaceNudge: vi.fn(() => false),
        commitTopologyNudge: vi.fn(() => false),
        isTopologyTool: (tool): tool is 'vertex' | 'edge' => tool === 'vertex' || tool === 'edge',
        isTransformTool: (tool): tool is 'rotate' | 'scale' | 'shear' =>
          tool === 'rotate' || tool === 'scale' || tool === 'shear',
        viewportKeyboardNudge: vi.fn(() => null),
      },
      { updateInspector: vi.fn() },
    );

    registry.activate('sweep');
    expect(state.sweepDefaultTransform).toEqual(initial);
    expect(geometry.resetSweep).toHaveBeenCalledWith(false);

    registry.activate('select');
    expect(renderer.setDocument).toHaveBeenCalledWith(session.document, session.selection);
    expect(renderer.setSweepCaps).toHaveBeenCalledWith([]);
  });
});
