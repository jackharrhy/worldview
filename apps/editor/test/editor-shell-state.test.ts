import { describe, expect, it, vi } from 'vitest';

import { createEditorShellState } from '../src/editor-shell-state.js';

describe('editor shell state ports', () => {
  it('publishes status messages and resets an error tone on the next message', () => {
    const shell = createEditorShellState();
    const listener = vi.fn();
    shell.statusMessage.subscribe(listener);

    shell.statusMessage.setError('Storage failed');
    expect(shell.statusMessage.getSnapshot()).toEqual({
      message: 'Storage failed',
      tone: 'error',
    });

    shell.statusMessage.set('Saved map');
    expect(shell.statusMessage.getSnapshot()).toEqual({
      message: 'Saved map',
      tone: 'normal',
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('detaches application-owned actions when their lifetime ends', () => {
    const shell = createEditorShellState();
    const setPerspectiveOnly = vi.fn();
    const setPreference = vi.fn();
    const dismiss = vi.fn();
    const invoke = vi.fn();
    shell.viewportLayout.bind({ setPerspectiveOnly });
    shell.theme.bind({ setPreference }, 'dark');
    shell.viewportContextMenu.bind({ dismiss, invoke });
    shell.viewportContextMenu.show({
      x: 1,
      y: 2,
      sections: [],
    });

    shell.viewportLayout.unbind();
    shell.theme.unbind();
    shell.viewportContextMenu.unbind();
    shell.viewportLayout.togglePerspectiveOnly();
    shell.theme.select('light');
    shell.viewportContextMenu.dismiss();
    shell.viewportContextMenu.invoke('selection:focus');
    expect(shell.viewportLayout.getSnapshot()).toEqual({
      perspectiveOnly: false,
      rendererReady: false,
    });
    expect(shell.viewportContextMenu.getSnapshot().open).toBe(false);
    for (const action of [setPerspectiveOnly, setPreference, dismiss, invoke]) {
      expect(action).not.toHaveBeenCalled();
    }
  });
});
