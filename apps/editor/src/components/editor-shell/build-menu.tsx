import { useSyncExternalStore } from 'react';
import { MenuTrigger } from 'react-aria-components/Menu';
import type { EditorShellState } from '../../editor-shell-state.js';
import { directoryExportSupported } from '../../build-export-settings.js';
import { Button } from '../ui/button.js';
import { Checkbox } from '../ui/checkbox.js';
import { Icon } from '../ui/icon.js';
import { Menu, MenuItem, MenuSection, Popover, Submenu } from '../ui/menu.js';
import { Select } from '../ui/select.js';
import { useModalDialog } from '../ui/use-modal-dialog.js';

export function BuildMenu({ shellState }: { readonly shellState: EditorShellState }) {
  const commands = useSyncExternalStore(
    shellState.editorCommands.subscribe,
    shellState.editorCommands.getSnapshot,
  );
  const compile = useSyncExternalStore(
    shellState.compileState.subscribe,
    shellState.compileState.getSnapshot,
  );
  const exports = useSyncExternalStore(
    shellState.buildExport.subscribe,
    shellState.buildExport.getSnapshot,
  );
  const busy = compile.state === 'busy' || exports.busy;
  const stale = compile.state === 'stale';
  return (
    <MenuTrigger
      onOpenChange={(open) => {
        if (open) shellState.buildExport.commands?.refresh();
      }}
    >
      <Button className="build-menu-trigger" tone="quiet" aria-label="Build menu">
        <Icon name="compile" />
        {exports.busy ? 'Exporting…' : compile.state === 'busy' ? 'Building…' : 'Build'}
        <Icon name="caret-down" />
      </Button>
      <Popover
        className="toolbar-menu-popover build-menu-popover"
        placement="bottom end"
        offset={0}
      >
        <Menu aria-label="Build">
          <MenuSection label="Build" showHeading={false}>
            <MenuItem
              label="Build & preview"
              icon="compile"
              isDisabled={busy || (commands.actions.compile?.disabled ?? true)}
              onAction={() => shellState.editorCommands.invoke('compile')}
            />
            <Submenu
              label={`Quality: ${exports.quality === 'preview' ? 'Preview' : 'Final'}`}
              disabled={busy}
              menuProps={{
                selectionMode: 'single',
                selectedKeys: [exports.quality],
                onAction: (key) => {
                  if (key === 'preview' || key === 'final')
                    shellState.buildExport.commands?.setQuality(key);
                },
              }}
            >
              <MenuItem id="preview" label="Preview" />
              <MenuItem id="final" label="Final" />
            </Submenu>
          </MenuSection>
          <MenuSection label="Export" showHeading={false}>
            <MenuItem
              label={stale ? 'Export latest build (out of date)' : 'Export latest build'}
              icon="export"
              isDisabled={busy || stale || !exports.available}
              onAction={() => shellState.buildExport.commands?.exportLatest()}
            />
            <MenuItem
              label="Build & export"
              isDisabled={busy || (commands.actions.compile?.disabled ?? true)}
              onAction={() => shellState.buildExport.commands?.buildAndExport()}
            />
            <MenuItem
              label="Export settings…"
              onAction={() => shellState.buildExport.commands?.settings()}
            />
          </MenuSection>
          <MenuSection label="Results" showHeading={false}>
            <MenuItem
              label="Build results…"
              icon="build-log"
              isDisabled={commands.actions['build-log']?.disabled ?? true}
              onAction={() => shellState.editorCommands.invoke('build-log')}
            />
            <MenuItem
              label={commands.actions['toggle-preview']?.label ?? 'Show compiled'}
              icon="preview"
              isDisabled={commands.actions['toggle-preview']?.disabled ?? true}
              onAction={() => shellState.editorCommands.invoke('toggle-preview')}
            />
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

export function BuildExportDialog({ shellState }: { readonly shellState: EditorShellState }) {
  const exports = useSyncExternalStore(
    shellState.buildExport.subscribe,
    shellState.buildExport.getSnapshot,
  );
  const project = useSyncExternalStore(
    shellState.projectToolbar.subscribe,
    shellState.projectToolbar.getSnapshot,
  );
  const close = () => shellState.buildExport.update({ open: false });
  const dialog = useModalDialog(exports.open, close);
  return (
    <dialog
      {...dialog}
      className="build-log-dialog build-export-dialog"
      aria-labelledby="build-export-title"
    >
      <header>
        <strong id="build-export-title">Export settings</strong>
        <Button size="compact" onPress={close}>
          Done
        </Button>
      </header>
      <div className="build-export-fields">
        <p>
          Exports a BSP, or a ZIP when extra files are needed. Unpack ZIPs into your game directory.
        </p>
        <Checkbox
          isSelected={exports.includeSource}
          onChange={(includeSource) =>
            shellState.buildExport.commands?.configure({ includeSource })
          }
        >
          Include map source and WADs
        </Checkbox>
        <p>Destination: {exports.directoryName ?? 'Downloads'}</p>
        {directoryExportSupported() ? (
          <Button onPress={() => shellState.buildExport.commands?.chooseDirectory()}>
            {exports.directoryName ? 'Change directory…' : 'Choose directory…'}
          </Button>
        ) : (
          <p>This browser supports downloads only.</p>
        )}
        {exports.directoryName ? (
          <Button onPress={() => shellState.buildExport.commands?.useDownloads()}>
            Use downloads
          </Button>
        ) : null}
        {exports.directoryName ? (
          <p>Exports replace the file with the same map name in {exports.directoryName}.</p>
        ) : null}
        <Checkbox
          isSelected={exports.afterBuild}
          onChange={(afterBuild) => shellState.buildExport.commands?.configure({ afterBuild })}
        >
          Export after every successful build
        </Checkbox>
        {project.buildProfiles.length > 0 ? (
          <Select
            label="Build profile"
            options={project.buildProfiles}
            selectedKey={project.selectedBuildProfileId}
            onSelectionChange={(key) => shellState.projectToolbar.selectBuildProfile(String(key))}
          />
        ) : null}
        <p>Settings are saved for this project on this computer.</p>
        {exports.message ? <p role="status">{exports.message}</p> : null}
      </div>
    </dialog>
  );
}
