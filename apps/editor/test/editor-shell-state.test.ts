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

  it('keeps document, compiler, and pointer snapshots independent', () => {
    const shell = createEditorShellState();

    shell.documentName.set('• dm1.map', 'dm1.map');
    shell.compileState.set('COMPILER READY', 'ready');
    shell.pointerContext.textContent = 'PERSPECTIVE / fly';

    expect(shell.documentName.getSnapshot()).toEqual({
      label: '• dm1.map',
      title: 'dm1.map',
    });
    expect(shell.compileState.getSnapshot()).toEqual({
      label: 'COMPILER READY',
      state: 'ready',
    });
    expect(shell.pointerContext.getSnapshot()).toBe('PERSPECTIVE / fly');
  });
});
