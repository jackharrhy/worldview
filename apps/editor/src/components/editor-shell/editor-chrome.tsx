import { BuildMenu } from './build-menu.js';
import { useSyncExternalStore } from 'react';
import { MenuTrigger } from 'react-aria-components/Menu';

import type { EditorShellState } from '../../editor-shell-state.js';
import {
  isEditorCommandId,
  type EditorCommandPresentation,
  type EditorCommandSnapshot,
} from '../../editor-command-state.js';
import type { EditorTool } from '@jackharrhy/worldview-editor';
import { isProjectActionId } from '../../project-build-ui-state.js';
import { Icon, IconButton, type IconName } from '../ui/icon.js';
import { Checkbox } from '../ui/checkbox.js';
import { Menu, MenuItem, MenuSection, Popover, Submenu } from '../ui/menu.js';
import { Select } from '../ui/select.js';
import { Button } from '../ui/button.js';

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
  readonly tool: EditorTool;
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
const contextualEditActions = selectionActions.filter(({ action }) =>
  ['focus-selection', 'duplicate', 'delete'].includes(action),
);
const editMenuActions = selectionActions.filter(
  ({ action }) => !['undo', 'redo', 'focus-selection', 'duplicate', 'delete'].includes(action),
);

const toolKeys: Partial<Record<EditorTool, string>> = {
  hull: 'B',
  entity: 'N',
  face: 'F',
  sweep: 'W',
  vertex: 'V',
  edge: 'E',
  clip: 'C',
  rotate: 'R',
  scale: 'S',
  shear: 'H',
  select: 'Esc',
};
const actionKeys: Record<string, string> = {
  undo: 'Ctrl/⌘+Z',
  redo: 'Ctrl/⌘+Shift+Z',
  duplicate: 'Ctrl/⌘+D',
  delete: 'Delete',
  'focus-selection': 'Home',
  copy: 'Ctrl/⌘+C',
  paste: 'Ctrl/⌘+V',
  'paste-original': 'Ctrl/⌘+Alt+V',
  'select-all': 'Ctrl/⌘+A',
  'repeat-commands': 'Ctrl/⌘+Shift+R',
  download: 'Ctrl/⌘+S',
  'open-file': 'Ctrl/⌘+O',
};
function actionTooltip(action: string, title: string): string {
  const key = actionKeys[action];
  return key ? `${title.replace(/ \((?:Ctrl\/Command|Home)[^)]*\)$/, '')} [${key}]` : title;
}

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
  presentation,
}: ActionSpec & {
  readonly onClick?: () => void;
  readonly presentation?: EditorCommandPresentation;
}) {
  return (
    <IconButton
      icon={icon}
      label={presentation?.label ?? label}
      tooltip={actionTooltip(action, presentation?.title ?? title)}
      className="icon-button"
      data-action={action}
      isDisabled={presentation?.disabled ?? disabled}
      {...(presentation?.active === undefined ? {} : { 'aria-pressed': presentation.active })}
      {...(onClick ? { onPress: onClick } : {})}
    />
  );
}

function ActionGroup({
  label,
  actions,
  className = '',
  onAction,
  commandState,
}: {
  readonly label: string;
  readonly actions: readonly ActionSpec[];
  readonly className?: string;
  readonly onAction?: (action: string) => void;
  readonly commandState?: EditorCommandSnapshot['actions'];
}) {
  return (
    <div className={`toolbar-group ${className}`.trim()} aria-label={label}>
      {actions.map((action) => (
        <ActionButton
          key={action.action}
          {...action}
          {...(isEditorCommandId(action.action) && commandState?.[action.action]
            ? { presentation: commandState[action.action] }
            : {})}
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
  onAction,
  commandState,
  placement = 'bottom start',
}: {
  readonly label: string;
  readonly icon: IconName;
  readonly actions: readonly ActionSpec[];
  readonly className?: string;
  readonly onAction?: (action: string) => void;
  readonly commandState?: EditorCommandSnapshot['actions'];
  readonly placement?: 'bottom start' | 'right bottom';
}) {
  return (
    <MenuTrigger>
      <IconButton icon={icon} label={label} className="icon-button" />
      <Popover
        className={`toolbar-menu-popover ${className}`.trim()}
        placement={placement}
        offset={4}
      >
        <Menu aria-label={label} onAction={(key) => onAction?.(String(key))} selectionMode="none">
          {actions.map((action) => {
            const presentation =
              isEditorCommandId(action.action) && commandState?.[action.action]
                ? commandState[action.action]
                : undefined;
            return (
              <MenuItem
                key={action.action}
                id={action.action}
                icon={action.icon}
                label={presentation?.label ?? action.label}
                title={actionTooltip(action.action, presentation?.title ?? action.title)}
                {...((presentation?.disabled ?? action.disabled) ? { isDisabled: true } : {})}
              />
            );
          })}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

function TopBar({ shellState }: EditorChromeProps) {
  const theme = useSyncExternalStore(shellState.theme.subscribe, shellState.theme.getSnapshot);
  const project = useSyncExternalStore(
    shellState.projectToolbar.subscribe,
    shellState.projectToolbar.getSnapshot,
  );
  const commands = useSyncExternalStore(
    shellState.editorCommands.subscribe,
    shellState.editorCommands.getSnapshot,
  );
  const inspectorOpen = useSyncExternalStore(
    shellState.inspectorLayout.subscribe,
    () => shellState.inspectorLayout.getSnapshot().open,
  );
  const invokeAction = (action: string) => {
    if (action === 'home') shellState.workspaceHome.commands?.showHome();
    else if (isProjectActionId(action)) shellState.projectUi.invoke(action);
    else if (isEditorCommandId(action)) shellState.editorCommands.invoke(action);
  };
  return (
    <header className="topbar">
      <MenuTrigger>
        <Button
          className="worldview-menu-trigger"
          tone="quiet"
          aria-label="Worldview document menu"
        >
          <Icon name="viewport-3d" />
        </Button>
        <Popover
          className="toolbar-menu-popover document-menu-popover"
          placement="bottom start"
          offset={0}
          containerPadding={0}
        >
          <div className="document-menu-heading">
            <DocumentName shellState={shellState} />
          </div>
          <Menu aria-label="Worldview document menu" onAction={(key) => invokeAction(String(key))}>
            <MenuSection label="File" showHeading={false}>
              {[
                ...fileActions,
                ...historyActions.filter(
                  ({ action }) => action !== 'checkpoint' && action !== 'versions',
                ),
              ].map(({ action, icon, label, disabled }) => (
                <MenuItem
                  key={action}
                  id={action}
                  icon={icon}
                  label={label}
                  isDisabled={disabled ?? false}
                />
              ))}
            </MenuSection>
            <MenuSection label="Recovery" showHeading={false}>
              {historyActions
                .filter(({ action }) => action === 'checkpoint' || action === 'versions')
                .map(({ action, icon, label }) => (
                  <MenuItem key={action} id={action} icon={icon} label={label} />
                ))}
            </MenuSection>
            <MenuSection label="Application" showHeading={false}>
              {project.maps.length > 0 ? (
                <Submenu
                  label="Project maps"
                  menuProps={{ onAction: (key) => shellState.projectToolbar.openMap(String(key)) }}
                >
                  {project.maps.map((map) => (
                    <MenuItem key={map.id} id={map.id} label={map.label} />
                  ))}
                </Submenu>
              ) : null}
              <MenuItem
                id="collaboration"
                icon="collaborate"
                label="Collaboration"
                onAction={() => shellState.collaborationUi.commands?.open()}
              />
              <Submenu
                label="Appearance"
                menuProps={{
                  selectionMode: 'single',
                  selectedKeys: [theme],
                  onAction: (key) => {
                    if (key === 'system' || key === 'dark' || key === 'light')
                      shellState.theme.select(key);
                  },
                }}
              >
                <MenuItem id="system" label="System" />
                <MenuItem id="dark" label="Dark" />
                <MenuItem id="light" label="Light" />
              </Submenu>
            </MenuSection>
          </Menu>
        </Popover>
      </MenuTrigger>
      <nav className="top-actions" aria-label="Map editing toolbar">
        <ToolBar shellState={shellState} />
        <ActionGroup
          label="History"
          actions={primaryEditActions}
          onAction={invokeAction}
          commandState={commands.actions}
        />
        <ActionButton
          action="show-source"
          icon="source"
          label="Source"
          title="Edit map source"
          onClick={() => invokeAction('show-source')}
        />
      </nav>
      <BuildMenu shellState={shellState} />
      <IconButton
        icon="inspector"
        label="Inspector"
        tooltip="Toggle inspector"
        className="inspector-toggle icon-button"
        data-action="toggle-inspector"
        aria-pressed={inspectorOpen}
        onPress={() => shellState.inspectorLayout.toggle()}
      />
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

function ToolBar({ shellState }: EditorChromeProps) {
  const filters = useSyncExternalStore(
    shellState.viewFilter.subscribe,
    shellState.viewFilter.getSnapshot,
  );
  const settings = useSyncExternalStore(
    shellState.toolSettings.subscribe,
    shellState.toolSettings.getSnapshot,
  );
  const commands = useSyncExternalStore(
    shellState.editorCommands.subscribe,
    shellState.editorCommands.getSnapshot,
  );
  const invokeAction = (action: string) => {
    if (isEditorCommandId(action)) shellState.editorCommands.invoke(action);
  };
  return (
    <section className="toolstrip" aria-label="Editor tools">
      <div className="toolbar-group tool-group" aria-label="Modes">
        {editorTools.map(({ tool, icon, label, title }) => (
          <IconButton
            key={tool}
            icon={icon}
            label={label}
            tooltip={toolKeys[tool] ? `${title} [${toolKeys[tool]}]` : title}
            className={`tool-button icon-button${commands.activeTool === tool ? ' active' : ''}`}
            data-tool={tool}
            aria-pressed={commands.activeTool === tool}
            onPress={() => shellState.editorCommands.selectTool(tool)}
          />
        ))}
      </div>
      <ActionGroup
        label="Selection commands"
        actions={contextualEditActions}
        className="selection-actions"
        onAction={invokeAction}
        commandState={commands.actions}
      />
      <ActionMenu
        label="More edit actions"
        icon="more-actions"
        actions={editMenuActions}
        onAction={invokeAction}
        commandState={commands.actions}
        placement="bottom start"
      />
      <ActionMenu
        label="Visibility and locking"
        icon="show"
        actions={visibilityActions}
        onAction={invokeAction}
        commandState={commands.actions}
        placement="bottom start"
      />
      <Select
        id="grid-size"
        className="tool-select"
        label="Grid size"
        hideLabel
        options={[1, 2, 4, 8, 16, 32, 64, 128, 256].map((size) => ({
          id: String(size),
          label: String(size),
        }))}
        selectedKey={String(settings.gridSize)}
        onSelectionChange={(key) => shellState.toolSettings.setGridSize(Number(key))}
      />
      <Checkbox
        id="texture-lock"
        className="tool-toggle"
        aria-label="Texture lock"
        isSelected={settings.textureLock}
        onChange={(enabled) => shellState.toolSettings.setTextureLock(enabled)}
      >
        <Icon name="texture-lock" />
        <span className="visually-hidden">Texture lock</span>
      </Checkbox>
      <IconButton
        icon="filter"
        label="View"
        tooltip="Viewport filters"
        badge={
          <span id="view-filter-count" hidden={filters.filteredCount === 0}>
            {filters.filteredCount}
          </span>
        }
        className={`view-filter-toggle icon-button${filters.filteredCount > 0 ? ' active-filter' : ''}`}
        data-action="toggle-view-filters"
        aria-expanded={filters.open}
        onPress={() => shellState.viewFilter.commands?.setOpen(!filters.open)}
      />
    </section>
  );
}

export function EditorChrome({ shellState }: EditorChromeProps) {
  return <TopBar shellState={shellState} />;
}
