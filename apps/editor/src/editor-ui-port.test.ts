import { describe, expect, it, vi } from 'vitest';
import { EditorUiPort } from './editor-ui-port.js';
import { EditorCommandPort } from './editor-command-state.js';

describe('UI publication boundaries', () => {
  it('preserves snapshot identity and silences listeners for unchanged inspector feedback', () => {
    const options = { segments: 8 };
    const port = new EditorUiPort({ visible: true, result: '1 brush', options });
    const initial = port.getSnapshot();
    const listener = vi.fn();
    port.subscribe(listener);
    port.update({ visible: true });
    port.update({ result: '1 brush' });
    port.set({ visible: true, result: '1 brush', options });
    expect(port.getSnapshot()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
    port.update({ result: '2 brushes' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(port.getSnapshot().options).toBe(options);
    // Nested scene/config snapshots remain immutable references; no costly deep comparison.
    port.update({ options: { segments: 8 } });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('publishes optional field removal even when its prior value was undefined', () => {
    const port = new EditorUiPort<{ label?: string | undefined }>({ label: undefined });
    const listener = vi.fn();
    port.subscribe(listener);
    port.set({});
    expect(listener).toHaveBeenCalledOnce();
    expect(Object.hasOwn(port.getSnapshot(), 'label')).toBe(false);
  });

  it('publishes only changed command presentations and preserves unaffected action identity', () => {
    const commands = new EditorCommandPort();
    commands.updateActions({
      undo: { disabled: true, title: 'Nothing to undo' },
      copy: { disabled: false },
    });
    const original = commands.getSnapshot();
    const listener = vi.fn();
    commands.subscribe(listener);
    commands.setActiveTool('select');
    commands.updateActions({
      undo: { disabled: true, title: 'Nothing to undo' },
      copy: { disabled: false },
    });
    expect(listener).not.toHaveBeenCalled();
    expect(commands.getSnapshot()).toBe(original);
    commands.updateActions({ undo: { disabled: false } });
    expect(listener).toHaveBeenCalledOnce();
    expect(commands.getSnapshot().actions.copy).toBe(original.actions.copy);
    expect(commands.getSnapshot().actions.undo).toEqual({
      disabled: false,
      title: 'Nothing to undo',
    });
    const invoke = vi.fn();
    commands.bind({ invoke, selectTool: vi.fn() });
    commands.invoke('undo');
    expect(invoke).toHaveBeenCalledWith('undo');
    commands.updateActions({ undo: { disabled: true } });
    commands.updateActions({ undo: { title: 'Nothing left to undo' } });
    commands.invoke('undo');
    expect(invoke).toHaveBeenCalledOnce();
  });
});
