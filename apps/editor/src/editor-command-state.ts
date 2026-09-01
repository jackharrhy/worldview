import { SnapshotStore } from '@jackharrhy/worldview/runtime';
import type { EditorTool } from '@jackharrhy/worldview-editor';

export const EDITOR_COMMAND_IDS = [
  'undo',
  'redo',
  'repeat-commands',
  'clear-repeat-commands',
  'select-all',
  'invert-selection',
  'snap-selection-to-grid',
  'duplicate',
  'copy',
  'paste',
  'paste-original',
  'delete',
  'focus-selection',
  'hide-selection',
  'isolate-selection',
  'show-all',
  'lock-selection',
  'unlock-all',
  'compile',
  'toggle-preview',
  'toggle-leak',
  'toggle-portals',
  'build-log',
  'launch',
] as const;

export type EditorCommandId = (typeof EDITOR_COMMAND_IDS)[number];

export interface EditorCommandPresentation {
  readonly label?: string;
  readonly title?: string;
  readonly disabled?: boolean;
  readonly active?: boolean;
}

export interface EditorCommandSnapshot {
  readonly activeTool: EditorTool;
  readonly actions: Readonly<Partial<Record<EditorCommandId, EditorCommandPresentation>>>;
}

export interface EditorCommandActions {
  invoke(command: EditorCommandId): void;
  selectTool(tool: EditorTool): void;
}

export function isEditorCommandId(value: string): value is EditorCommandId {
  return (EDITOR_COMMAND_IDS as readonly string[]).includes(value);
}

export class EditorCommandPort {
  private readonly store = new SnapshotStore<EditorCommandSnapshot>({
    activeTool: 'select',
    actions: {},
  });
  private actions: EditorCommandActions | null = null;
  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;
  public bind(actions: EditorCommandActions): void {
    this.actions = actions;
  }
  public unbind(): void {
    this.actions = null;
  }
  public setActiveTool(activeTool: EditorTool): void {
    this.store.set({ ...this.store.getSnapshot(), activeTool });
  }
  public updateActions(
    actions: Readonly<Partial<Record<EditorCommandId, EditorCommandPresentation>>>,
  ): void {
    const current = this.store.getSnapshot();
    const merged = { ...current.actions };
    for (const id of EDITOR_COMMAND_IDS) {
      const update = actions[id];
      if (update) merged[id] = { ...merged[id], ...update };
    }
    this.store.set({
      ...current,
      actions: merged,
    });
  }
  public invoke(command: EditorCommandId): void {
    if (this.store.getSnapshot().actions[command]?.disabled) return;
    this.actions?.invoke(command);
  }
  public selectTool(tool: EditorTool): void {
    this.actions?.selectTool(tool);
  }
}
