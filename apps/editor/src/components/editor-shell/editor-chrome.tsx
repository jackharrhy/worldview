import { useSyncExternalStore } from 'react';

import type { EditorShellState } from '../../editor-shell-state.js';

interface EditorChromeProps {
  readonly shellState: EditorShellState;
}

interface ActionSpec {
  readonly action: string;
  readonly icon: string;
  readonly label: string;
  readonly title: string;
  readonly disabled?: boolean;
}

interface ToolSpec {
  readonly tool: string;
  readonly icon: string;
  readonly label: string;
  readonly title: string;
}

const fileActions: readonly ActionSpec[] = [
  { action: 'new', icon: 'file-plus', label: 'New', title: 'New map' },
  { action: 'open-file', icon: 'folder-open', label: 'Open', title: 'Open map' },
  { action: 'open-project', icon: 'folders', label: 'Project', title: 'Open project directory' },
  { action: 'download', icon: 'floppy-disk', label: 'Save', title: 'Save map' },
];

const historyActions: readonly ActionSpec[] = [
  {
    action: 'export-normalized',
    icon: 'export',
    label: 'Export normalized',
    title: 'Export normalized copy',
  },
  {
    action: 'checkpoint',
    icon: 'bookmark-simple',
    label: 'Checkpoint',
    title: 'Create recovery checkpoint',
  },
  {
    action: 'versions',
    icon: 'clock-counter-clockwise',
    label: 'Versions',
    title: 'Recovery versions',
  },
  { action: 'show-source', icon: 'code', label: 'Source', title: 'Edit map source' },
];

const buildActions: readonly ActionSpec[] = [
  { action: 'compile', icon: 'hammer', label: 'Compile', title: 'Compile map' },
  {
    action: 'toggle-preview',
    icon: 'monitor-play',
    label: 'Preview',
    title: 'Toggle compiled preview',
    disabled: true,
  },
  {
    action: 'toggle-leak',
    icon: 'warning',
    label: 'Leak',
    title: 'Toggle leak path',
    disabled: true,
  },
  {
    action: 'toggle-portals',
    icon: 'intersect-three',
    label: 'Portals',
    title: 'Toggle portals',
    disabled: true,
  },
  {
    action: 'build-log',
    icon: 'terminal-window',
    label: 'Log',
    title: 'Build diagnostics',
    disabled: true,
  },
  {
    action: 'launch',
    icon: 'rocket-launch',
    label: 'Launch',
    title: 'Launch external game',
    disabled: true,
  },
];

const editorTools: readonly ToolSpec[] = [
  { tool: 'select', icon: 'cursor', label: 'Select', title: 'Select objects' },
  { tool: 'create', icon: 'cube', label: 'Brush', title: 'Create brush' },
  { tool: 'entity', icon: 'user-square', label: 'Entity', title: 'Place entity' },
  { tool: 'hull', icon: 'polygon', label: 'Hull', title: 'Build convex hull' },
  { tool: 'face', icon: 'square', label: 'Face', title: 'Edit faces' },
  { tool: 'sweep', icon: 'flow-arrow', label: 'Sweep', title: 'Sweep selection' },
  { tool: 'clip', icon: 'scissors', label: 'Clip', title: 'Clip brushes' },
  { tool: 'vertex', icon: 'vector-three', label: 'Vertex', title: 'Edit vertices' },
  { tool: 'edge', icon: 'line-segment', label: 'Edge', title: 'Edit edges' },
  { tool: 'rotate', icon: 'arrow-clockwise', label: 'Rotate', title: 'Rotate selection' },
  { tool: 'scale', icon: 'arrows-out', label: 'Scale', title: 'Scale selection' },
  { tool: 'shear', icon: 'perspective', label: 'Shear', title: 'Shear selection' },
];

const selectionActions: readonly ActionSpec[] = [
  {
    action: 'focus-selection',
    icon: 'crosshair',
    label: 'Focus',
    title: 'Frame selection (Home)',
    disabled: true,
  },
  {
    action: 'select-all',
    icon: 'selection-all',
    label: 'All',
    title: 'Select all (Ctrl/Command+A)',
  },
  {
    action: 'invert-selection',
    icon: 'selection-inverse',
    label: 'Invert',
    title: 'Invert selection (Ctrl/Command+Shift+A)',
  },
  { action: 'undo', icon: 'arrow-counter-clockwise', label: 'Undo', title: 'Undo', disabled: true },
  { action: 'redo', icon: 'arrow-clockwise', label: 'Redo', title: 'Redo', disabled: true },
  {
    action: 'repeat-commands',
    icon: 'repeat',
    label: 'Repeat',
    title: 'Repeat commands (Ctrl/Command+Shift+R)',
    disabled: true,
  },
  {
    action: 'clear-repeat-commands',
    icon: 'prohibit',
    label: 'Clear repeat',
    title: 'Clear repeat sequence',
    disabled: true,
  },
  {
    action: 'duplicate',
    icon: 'copy-simple',
    label: 'Duplicate',
    title: 'Duplicate',
    disabled: true,
  },
  {
    action: 'copy',
    icon: 'clipboard',
    label: 'Copy',
    title: 'Copy (Ctrl/Command+C)',
    disabled: true,
  },
  { action: 'paste', icon: 'clipboard-text', label: 'Paste', title: 'Paste (Ctrl/Command+V)' },
  {
    action: 'paste-here',
    icon: 'push-pin',
    label: 'Paste here',
    title: 'Paste at pointer (Ctrl/Command+Shift+V)',
    disabled: true,
  },
  { action: 'delete', icon: 'trash', label: 'Delete', title: 'Delete', disabled: true },
];

const visibilityActions: readonly ActionSpec[] = [
  {
    action: 'hide-selection',
    icon: 'eye-slash',
    label: 'Hide',
    title: 'Hide selection',
    disabled: true,
  },
  {
    action: 'isolate-selection',
    icon: 'target',
    label: 'Isolate',
    title: 'Isolate selection',
    disabled: true,
  },
  {
    action: 'show-all',
    icon: 'eye',
    label: 'Show all',
    title: 'Show all hidden objects',
    disabled: true,
  },
  {
    action: 'lock-selection',
    icon: 'lock',
    label: 'Lock',
    title: 'Lock selection',
    disabled: true,
  },
  {
    action: 'unlock-all',
    icon: 'lock-open',
    label: 'Unlock all',
    title: 'Unlock all objects',
    disabled: true,
  },
];

function DocumentName({ shellState }: EditorChromeProps) {
  const documentName = useSyncExternalStore(
    shellState.documentName.subscribe,
    shellState.documentName.getSnapshot,
    shellState.documentName.getSnapshot,
  );
  return (
    <span id="document-name" className="document-name" title={documentName.title}>
      {documentName.label}
    </span>
  );
}

function ActionButton({ action, icon, label, title, disabled = false }: ActionSpec) {
  return (
    <button
      className="icon-button"
      type="button"
      data-action={action}
      title={title}
      disabled={disabled}
    >
      <i className={`ph ph-${icon}`} aria-hidden="true" />
      <span className="toolbar-label">{label}</span>
    </button>
  );
}

function ActionGroup({
  label,
  actions,
  className = '',
}: {
  readonly label: string;
  readonly actions: readonly ActionSpec[];
  readonly className?: string;
}) {
  return (
    <div className={`toolbar-group ${className}`.trim()} aria-label={label}>
      {actions.map((action) => (
        <ActionButton key={action.action} {...action} />
      ))}
    </div>
  );
}

function TopBar({ shellState }: EditorChromeProps) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="wordmark">WORLDVIEW</div>
        <DocumentName shellState={shellState} />
      </div>
      <nav className="top-actions" aria-label="Document actions">
        <ActionGroup label="Files" actions={fileActions} />
        <select id="project-map" aria-label="Project map" hidden />
        <ActionGroup
          label="Document history and source"
          actions={historyActions}
          className="secondary-actions"
        />
        <div className="toolbar-group build-actions" aria-label="Build">
          <select id="build-profile" aria-label="Build profile" hidden />
          {buildActions.map((action) => (
            <ActionButton key={action.action} {...action} />
          ))}
        </div>
      </nav>
      <button
        className="inspector-toggle icon-button"
        type="button"
        data-action="toggle-inspector"
        aria-pressed="true"
        title="Toggle inspector"
      >
        <i className="ph ph-sidebar" aria-hidden="true" />
        <span className="toolbar-label">Inspector</span>
      </button>
      <input id="map-file" type="file" accept=".map,.txt" aria-label="Open map file" hidden />
      <input
        id="reference-files"
        type="file"
        accept=".map"
        aria-label="Open reference maps"
        multiple
        hidden
      />
    </header>
  );
}

function ToolRail() {
  return (
    <section className="toolrail" aria-label="Editor tools">
      <div className="toolbar-group tool-group" aria-label="Modes">
        {editorTools.map(({ tool, icon, label, title }, index) => (
          <button
            key={tool}
            className={`tool-button icon-button${index === 0 ? ' active' : ''}`}
            type="button"
            data-tool={tool}
            aria-pressed={index === 0 ? 'true' : 'false'}
            title={title}
          >
            <i className={`ph ph-${icon}`} aria-hidden="true" />
            <span className="toolbar-label">{label}</span>
          </button>
        ))}
      </div>
      <span className="toolrail-rule" aria-hidden="true" />
      <ActionGroup
        label="Selection and history"
        actions={selectionActions}
        className="selection-actions"
      />
      <span className="toolrail-rule" aria-hidden="true" />
      <ActionGroup
        label="Visibility and locking"
        actions={visibilityActions}
        className="visibility-actions"
      />
      <span className="toolrail-rule" aria-hidden="true" />
      <label className="tool-select">
        Grid
        <select id="grid-size" aria-label="Grid size" defaultValue={16}>
          {[1, 2, 4, 8, 16, 32, 64].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <label className="tool-toggle">
        <input id="texture-lock" type="checkbox" defaultChecked /> Texture lock
      </label>
      <button
        className="view-filter-toggle icon-button"
        type="button"
        data-action="toggle-view-filters"
        aria-expanded="false"
        title="Viewport filters"
      >
        <i className="ph ph-funnel" aria-hidden="true" />
        <span className="toolbar-label">View</span>
        <span id="view-filter-count">0</span>
      </button>
      <span className="toolrail-spacer" />
      <span className="tool-help">
        RMB look · Alt+RMB orbit · MMB pan · WASD/QX fly · Home focus
      </span>
    </section>
  );
}

export function EditorChrome({ shellState }: EditorChromeProps) {
  return (
    <>
      <TopBar shellState={shellState} />
      <ToolRail />
    </>
  );
}
