import { useSyncExternalStore } from 'react';

import type { EditorShellState } from '../../editor-shell-state.js';
import { Icon, type IconName } from '../ui/icon.js';
import { Select } from '../ui/select.js';
import { CollaborationPresence } from './collaboration-ui.js';

interface EditorChromeProps {
  readonly shellState: EditorShellState;
}

interface ActionSpec {
  readonly action: string;
  readonly icon: IconName;
  readonly label: string;
  readonly title: string;
  readonly disabled?: boolean;
}

interface ToolSpec {
  readonly tool: string;
  readonly icon: IconName;
  readonly label: string;
  readonly title: string;
}

const fileActions: readonly ActionSpec[] = [
  { action: 'home', icon: 'home', label: 'Home', title: 'Worldview Editor' },
  { action: 'new', icon: 'new-map', label: 'New', title: 'New map' },
  {
    action: 'open-file',
    icon: 'open-map',
    label: 'Open',
    title: 'Open map',
  },
  {
    action: 'open-project',
    icon: 'open-project',
    label: 'Project',
    title: 'Open project directory',
  },
  { action: 'download', icon: 'save', label: 'Save', title: 'Save map' },
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
    icon: 'checkpoint',
    label: 'Checkpoint',
    title: 'Create recovery checkpoint',
  },
  {
    action: 'versions',
    icon: 'versions',
    label: 'Versions',
    title: 'Recovery versions',
  },
  {
    action: 'show-source',
    icon: 'source',
    label: 'Source',
    title: 'Edit map source',
  },
];

const primaryHistoryActions = historyActions.filter(({ action }) => action === 'show-source');
const documentMenuActions = historyActions.filter(({ action }) => action !== 'show-source');
const primaryFileActions = fileActions.filter(({ action }) =>
  ['home', 'new', 'download'].includes(action),
);
const fileMenuActions = fileActions.filter(
  ({ action }) => !['home', 'new', 'download'].includes(action),
);

const buildActions: readonly ActionSpec[] = [
  { action: 'compile', icon: 'compile', label: 'Compile', title: 'Compile map' },
  {
    action: 'toggle-preview',
    icon: 'preview',
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
    icon: 'portals',
    label: 'Portals',
    title: 'Toggle portals',
    disabled: true,
  },
  {
    action: 'build-log',
    icon: 'build-log',
    label: 'Log',
    title: 'Build diagnostics',
    disabled: true,
  },
  {
    action: 'launch',
    icon: 'launch',
    label: 'Launch',
    title: 'Launch external game',
    disabled: true,
  },
];

const editorTools: readonly ToolSpec[] = [
  {
    tool: 'select',
    icon: 'select',
    label: 'Select',
    title: 'Select, move, resize, or draw brushes',
  },
  {
    tool: 'entity',
    icon: 'entity',
    label: 'Entity',
    title: 'Place entity',
  },
  { tool: 'hull', icon: 'hull', label: 'Hull', title: 'Build convex hull' },
  { tool: 'face', icon: 'face', label: 'Face', title: 'Edit faces' },
  {
    tool: 'sweep',
    icon: 'sweep',
    label: 'Sweep',
    title: 'Sweep selection',
  },
  { tool: 'clip', icon: 'clip', label: 'Clip', title: 'Clip brushes' },
  {
    tool: 'vertex',
    icon: 'vertex',
    label: 'Vertex',
    title: 'Edit vertices',
  },
  { tool: 'edge', icon: 'edge', label: 'Edge', title: 'Edit edges' },
  {
    tool: 'rotate',
    icon: 'rotate',
    label: 'Rotate',
    title: 'Rotate selection',
  },
  {
    tool: 'scale',
    icon: 'scale',
    label: 'Scale',
    title: 'Scale selection',
  },
  {
    tool: 'shear',
    icon: 'shear',
    label: 'Shear',
    title: 'Shear selection',
  },
];

const selectionActions: readonly ActionSpec[] = [
  {
    action: 'focus-selection',
    icon: 'focus',
    label: 'Focus',
    title: 'Frame selection (Home)',
    disabled: true,
  },
  {
    action: 'select-all',
    icon: 'select-all',
    label: 'All',
    title: 'Select all (Ctrl/Command+A)',
  },
  {
    action: 'invert-selection',
    icon: 'selection-invert',
    label: 'Invert',
    title: 'Invert selection (Ctrl/Command+Shift+A)',
  },
  {
    action: 'snap-selection-to-grid',
    icon: 'snap-grid',
    label: 'Snap to grid',
    title: 'Snap selected brush or face vertices to the current grid',
    disabled: true,
  },
  {
    action: 'undo',
    icon: 'undo',
    label: 'Undo',
    title: 'Undo',
    disabled: true,
  },
  {
    action: 'redo',
    icon: 'redo',
    label: 'Redo',
    title: 'Redo',
    disabled: true,
  },
  {
    action: 'repeat-commands',
    icon: 'repeat',
    label: 'Repeat',
    title: 'Repeat commands (Ctrl/Command+Shift+R)',
    disabled: true,
  },
  {
    action: 'clear-repeat-commands',
    icon: 'clear',
    label: 'Clear repeat',
    title: 'Clear repeat sequence',
    disabled: true,
  },
  {
    action: 'duplicate',
    icon: 'duplicate',
    label: 'Duplicate',
    title: 'Duplicate',
    disabled: true,
  },
  {
    action: 'copy',
    icon: 'copy',
    label: 'Copy',
    title: 'Copy (Ctrl/Command+C)',
    disabled: true,
  },
  {
    action: 'paste',
    icon: 'paste',
    label: 'Paste',
    title: 'Paste (Ctrl/Command+V)',
  },
  {
    action: 'paste-original',
    icon: 'paste-original',
    label: 'Paste at original position',
    title: 'Paste at original position (Ctrl/Command+Alt+V)',
  },
  {
    action: 'delete',
    icon: 'delete',
    label: 'Delete',
    title: 'Delete',
    disabled: true,
  },
];

const visibilityActions: readonly ActionSpec[] = [
  {
    action: 'hide-selection',
    icon: 'hide',
    label: 'Hide',
    title: 'Hide selection',
    disabled: true,
  },
  {
    action: 'isolate-selection',
    icon: 'isolate',
    label: 'Isolate',
    title: 'Isolate selection',
    disabled: true,
  },
  {
    action: 'show-all',
    icon: 'show',
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
    icon: 'unlock',
    label: 'Unlock all',
    title: 'Unlock all objects',
    disabled: true,
  },
];

const primaryEditActions = selectionActions.filter(({ action }) =>
  ['undo', 'redo'].includes(action),
);
const contextualEditActions = selectionActions.filter(
  ({ action }) => !['undo', 'redo', 'invert-selection', 'clear-repeat-commands'].includes(action),
);
const editMenuActions = selectionActions.filter(({ action }) =>
  ['invert-selection', 'clear-repeat-commands'].includes(action),
);
const primaryBuildActions = buildActions.filter(({ action }) => action === 'compile');
const buildMenuActions = buildActions.filter(({ action }) => action !== 'compile');

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

function ActionButton({
  action,
  icon,
  label,
  title,
  disabled = false,
  onClick,
}: ActionSpec & { readonly onClick?: () => void }) {
  return (
    <button
      className="icon-button"
      type="button"
      data-action={action}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
      <span className="toolbar-label">{label}</span>
    </button>
  );
}

function ActionGroup({
  label,
  actions,
  className = '',
  onAction,
}: {
  readonly label: string;
  readonly actions: readonly ActionSpec[];
  readonly className?: string;
  readonly onAction?: (action: string) => void;
}) {
  return (
    <div className={`toolbar-group ${className}`.trim()} aria-label={label}>
      {actions.map((action) => (
        <ActionButton
          key={action.action}
          {...action}
          {...(onAction ? { onClick: () => onAction(action.action) } : {})}
        />
      ))}
    </div>
  );
}

function ActionMenu({
  label,
  icon,
  actions,
  className = '',
}: {
  readonly label: string;
  readonly icon: IconName;
  readonly actions: readonly ActionSpec[];
  readonly className?: string;
}) {
  return (
    <details
      className={`toolbar-menu ${className}`.trim()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          event.currentTarget.removeAttribute('open');
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.currentTarget.removeAttribute('open');
        event.currentTarget.querySelector('summary')?.focus();
      }}
    >
      <summary className="icon-button" title={label}>
        <Icon name={icon} />
        <span className="toolbar-label">{label}</span>
      </summary>
      <div
        className="toolbar-menu-items"
        role="group"
        aria-label={label}
        onClick={(event) => {
          if ((event.target as Element).closest('button')) {
            event.currentTarget.closest('details')?.removeAttribute('open');
          }
        }}
      >
        {actions.map(({ action, icon: actionIcon, label: actionLabel, title, disabled }) => (
          <button key={action} type="button" data-action={action} title={title} disabled={disabled}>
            <Icon name={actionIcon} />
            <span className="toolbar-label">{actionLabel}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

function TopBar({ shellState }: EditorChromeProps) {
  const theme = useSyncExternalStore(shellState.theme.subscribe, shellState.theme.getSnapshot);
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="wordmark">WORLDVIEW</div>
        <DocumentName shellState={shellState} />
      </div>
      <nav className="top-actions" aria-label="Document actions">
        <ActionGroup
          label="Files"
          actions={primaryFileActions}
          onAction={(action) => {
            if (action === 'home') shellState.workspaceHome.invoke('showHome');
          }}
        />
        <ActionMenu label="Open and create" icon="open-map" actions={fileMenuActions} />
        <select id="project-map" aria-label="Project map" hidden />
        <ActionGroup label="History" actions={primaryEditActions} />
        <ActionGroup label="Source" actions={primaryHistoryActions} />
        <ActionMenu label="More document actions" icon="versions" actions={documentMenuActions} />
        <div className="toolbar-group build-actions" aria-label="Build">
          <select id="build-profile" aria-label="Build profile" hidden />
          {primaryBuildActions.map((action) => (
            <ActionButton key={action.action} {...action} />
          ))}
          <ActionMenu label="Build results" icon="build-results" actions={buildMenuActions} />
        </div>
      </nav>
      <CollaborationPresence port={shellState.collaborationUi} />
      <div className="theme-control" title="Editor theme">
        <Icon name="theme" />
        <Select
          id="editor-theme"
          className="theme-select"
          label="Editor theme"
          hideLabel
          options={[
            { id: 'system', label: 'System' },
            { id: 'dark', label: 'Dark' },
            { id: 'light', label: 'Light' },
          ]}
          selectedKey={theme}
          onSelectionChange={(key) => {
            if (key === 'system' || key === 'dark' || key === 'light') shellState.theme.select(key);
          }}
        />
      </div>
      <button
        className="inspector-toggle icon-button"
        type="button"
        data-action="toggle-inspector"
        aria-pressed="true"
        title="Toggle inspector"
      >
        <Icon name="inspector" />
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
            <Icon name={icon} />
            <span className="toolbar-label">{label}</span>
          </button>
        ))}
      </div>
      <ActionGroup
        label="Selection commands"
        actions={contextualEditActions}
        className="selection-actions"
      />
      <ActionMenu label="More edit actions" icon="more-actions" actions={editMenuActions} />
      <span className="toolrail-spacer" />
      <ActionMenu label="Visibility and locking" icon="show" actions={visibilityActions} />
      <label className="tool-select" title="Grid size">
        <select id="grid-size" aria-label="Grid size" defaultValue={16}>
          {[1, 2, 4, 8, 16, 32, 64, 128, 256].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <label className="tool-toggle" title="Texture lock">
        <input id="texture-lock" type="checkbox" defaultChecked />
        <Icon name="texture-lock" />
      </label>
      <button
        className="view-filter-toggle icon-button"
        type="button"
        data-action="toggle-view-filters"
        aria-expanded="false"
        title="Viewport filters"
      >
        <Icon name="filter" />
        <span className="toolbar-label">View</span>
        <span id="view-filter-count">0</span>
      </button>
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
