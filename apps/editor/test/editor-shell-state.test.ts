import { describe, expect, it, vi } from 'vitest';

import { createEditorShellState } from '../src/editor-shell-state.js';

describe('editor shell state ports', () => {
  it('publishes status messages and resets an error tone on the next message', () => {
    const shell = createEditorShellState();
    const listener = vi.fn();
    const unsubscribe = shell.statusMessage.subscribe(listener);

    shell.statusMessage.setError('Storage failed');
    expect(shell.statusMessage.getSnapshot()).toEqual({
      message: 'Storage failed',
      tone: 'error',
    });

    shell.statusMessage.textContent = 'Saved map';
    expect(shell.statusMessage.getSnapshot()).toEqual({
      message: 'Saved map',
      tone: 'normal',
    });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    shell.statusMessage.textContent = 'No longer observed';
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps document, compiler, pointer, and map-summary snapshots independent', () => {
    const shell = createEditorShellState();

    shell.documentName.set('• dm1.map', 'dm1.map');
    shell.compileState.set('COMPILER READY', 'ready');
    shell.pointerContext.textContent = 'PERSPECTIVE / fly';
    shell.documentSummary.set({
      revision: 7,
      entityCount: 4,
      brushCount: 12,
      groupCount: 2,
      hiddenObjectCount: 3,
      lockedObjectCount: 1,
      geometryErrorCount: 0,
    });

    expect(shell.documentName.getSnapshot()).toEqual({
      label: '• dm1.map',
      title: 'dm1.map',
    });
    expect(shell.compileState.getSnapshot()).toEqual({
      label: 'COMPILER READY',
      state: 'ready',
    });
    expect(shell.pointerContext.getSnapshot()).toBe('PERSPECTIVE / fly');
    expect(shell.documentSummary.getSnapshot()).toEqual({
      revision: 7,
      entityCount: 4,
      brushCount: 12,
      groupCount: 2,
      hiddenObjectCount: 3,
      lockedObjectCount: 1,
      geometryErrorCount: 0,
    });
  });

  it('publishes immutable context-menu descriptions and invokes only its narrow command port', () => {
    const shell = createEditorShellState();
    const dismiss = vi.fn();
    const invoke = vi.fn();
    shell.viewportContextMenu.bind({ dismiss, invoke });
    const sections = [
      {
        id: 'selection',
        label: 'Selection',
        actions: [
          { id: 'selection:focus', label: 'Focus selection', shortcut: 'Home' },
          { id: 'selection:hide', label: 'Hide selection', disabled: true },
        ],
      },
    ] as const;

    shell.viewportContextMenu.show({
      x: 280,
      y: 120,
      heading: '3D view',
      detail: '0 64 128',
      sections,
    });

    expect(shell.viewportContextMenu.getSnapshot()).toEqual({
      open: true,
      x: 280,
      y: 120,
      heading: '3D view',
      detail: '0 64 128',
      sections,
    });
    shell.viewportContextMenu.invoke('selection:focus');
    shell.viewportContextMenu.dismiss(true);
    expect(invoke).toHaveBeenCalledWith('selection:focus');
    expect(dismiss).toHaveBeenCalledWith(true);

    shell.viewportContextMenu.hide();
    expect(shell.viewportContextMenu.getSnapshot()).toMatchObject({
      open: false,
      sections: [],
    });
  });
});
