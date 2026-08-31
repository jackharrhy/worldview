import { useState, useSyncExternalStore } from 'react';
import { EDITOR_SPECIAL_BRUSH_FILTER_INFO } from '@jackharrhy/worldview-editor';
import type { EditorShellState } from '../../editor-shell-state.js';
import { Button } from '../ui/button.js';
import { Checkbox } from '../ui/checkbox.js';
import { TextField } from '../ui/text-field.js';
import { Select } from '../ui/select.js';
import { CollaborationDialog } from './collaboration-ui.js';
import { useModalDialog } from '../ui/use-modal-dialog.js';

function ViewFilterPopover({ shellState }: { readonly shellState: EditorShellState }) {
  const filters = useSyncExternalStore(
    shellState.viewFilter.subscribe,
    shellState.viewFilter.getSnapshot,
  );
  const [query, setQuery] = useState('');
  const visibleSpecialTypes = new Set(filters.visibleSpecialBrushTypes);
  const queryTerms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const displayed = filters.entityClasses.filter(({ classname }) =>
    queryTerms.every((term) => classname.includes(term)),
  );
  return (
    <aside
      id="view-filter-popover"
      className="view-filter-popover"
      aria-label="Viewport filters"
      hidden={!filters.open}
    >
      <header>
        <div>
          <strong>View filters</strong>
          <span>Non-serialized</span>
        </div>
        <Button size="compact" onPress={() => shellState.viewFilter.invoke('setOpen', false)}>
          Close
        </Button>
      </header>
      <div className="view-filter-scroll">
        <section className="view-filter-section">
          <div className="view-filter-heading">
            <strong>Brushes</strong>
            <span>Special types</span>
          </div>
          <Checkbox
            className="view-filter-row"
            isSelected={filters.worldBrushesVisible}
            onChange={(visible) => shellState.viewFilter.invoke('setWorldBrushesVisible', visible)}
          >
            <span>
              <b>World brushes</b>
              <small>Structural geometry in worldspawn, groups, and layers</small>
            </span>
          </Checkbox>
          {EDITOR_SPECIAL_BRUSH_FILTER_INFO.map((entry) => (
            <Checkbox
              className="view-filter-row"
              key={entry.type}
              isSelected={visibleSpecialTypes.has(entry.type)}
              onChange={(visible) =>
                shellState.viewFilter.invoke('setSpecialBrushTypeVisible', entry.type, visible)
              }
            >
              <span>
                <b>{entry.label}</b>
                <small>{entry.description}</small>
              </span>
            </Checkbox>
          ))}
        </section>
        <section className="view-filter-section entity-class-filter-section">
          <div className="view-filter-heading">
            <strong>Entity definitions</strong>
            <span id="entity-class-filter-summary">
              {filters.entityClasses.length}{' '}
              {filters.entityClasses.length === 1 ? 'class' : 'classes'}
            </span>
          </div>
          <div className="view-filter-entity-actions">
            <TextField
              label="Filter entity classnames"
              hideLabel
              value={query}
              onChange={setQuery}
              input={{ type: 'search', placeholder: 'Filter classnames' }}
            />
            <Button
              size="compact"
              onPress={() => shellState.viewFilter.invoke('setAllEntityClassesVisible', true)}
            >
              All
            </Button>
            <Button
              size="compact"
              onPress={() => shellState.viewFilter.invoke('setAllEntityClassesVisible', false)}
            >
              None
            </Button>
          </div>
          <div id="entity-class-filter-list" className="entity-class-filter-list">
            {displayed.length === 0 ? (
              <p className="entity-class-filter-empty">
                {filters.entityClasses.length === 0
                  ? 'No entity definitions in this map.'
                  : 'No matches.'}
              </p>
            ) : (
              displayed.map((filter) => {
                const parts = [];
                if (filter.pointEntityCount > 0) parts.push(`${filter.pointEntityCount} point`);
                if (filter.brushEntityCount > 0) parts.push(`${filter.brushEntityCount} brush`);
                const count = filter.pointEntityCount + filter.brushEntityCount;
                return (
                  <Checkbox
                    className="view-filter-row entity-class-filter-row"
                    key={filter.classname}
                    isSelected={filter.visible}
                    onChange={(visible) =>
                      shellState.viewFilter.invoke(
                        'setEntityClassVisible',
                        filter.classname,
                        visible,
                      )
                    }
                  >
                    <span>
                      <b>{filter.classname}</b>
                      <small>
                        {parts.join(' · ')} {count === 1 ? 'entity' : 'entities'}
                      </small>
                    </span>
                  </Checkbox>
                );
              })
            )}
          </div>
        </section>
      </div>
      <footer id="view-filter-status">{filters.status}</footer>
    </aside>
  );
}

function BuildLogDialog({ shellState }: { readonly shellState: EditorShellState }) {
  const build = useSyncExternalStore(
    shellState.buildLog.subscribe,
    shellState.buildLog.getSnapshot,
  );
  const close = () => shellState.buildLog.setOpen(false);
  const dialog = useModalDialog(build.open, close);
  return (
    <dialog
      {...dialog}
      id="build-log-dialog"
      className="build-log-dialog"
      aria-labelledby="build-log-dialog-title"
    >
      <header>
        <strong id="build-log-dialog-title">Build diagnostics</strong>
        <Select
          id="build-history"
          label="Build history"
          hideLabel
          options={build.history}
          selectedKey={build.selectedBuildId}
          isDisabled={build.history.length === 0}
          onSelectionChange={(key) => shellState.buildLog.inspect(String(key))}
        />
        <Button size="compact" onPress={close}>
          Close
        </Button>
      </header>
      <pre id="build-log-output">{build.output}</pre>
    </dialog>
  );
}

function RecoveryDialog({ shellState }: { readonly shellState: EditorShellState }) {
  const versions = useSyncExternalStore(
    shellState.recoveryVersions.subscribe,
    shellState.recoveryVersions.getSnapshot,
  );
  const project = useSyncExternalStore(
    shellState.projectUi.subscribe,
    shellState.projectUi.getSnapshot,
  );
  const close = () => shellState.projectUi.update({ recoveryOpen: false });
  const dialog = useModalDialog(project.recoveryOpen, close);
  return (
    <dialog
      {...dialog}
      id="recovery-dialog"
      className="build-log-dialog recovery-dialog"
      aria-labelledby="recovery-dialog-title"
    >
      <header>
        <strong id="recovery-dialog-title">Recovery versions</strong>
        <Button size="compact" onPress={close}>
          Close
        </Button>
      </header>
      <div id="recovery-list" className="recovery-list">
        {versions.map((version) => (
          <div className="recovery-row" key={version.id}>
            <span>
              {version.protected ? '★ ' : ''}
              {version.label} · r{version.revision} · {version.updatedAtLabel}
            </span>
            <Button size="compact" onPress={() => shellState.recoveryVersions.restore(version.id)}>
              Restore
            </Button>
            <Button
              size="compact"
              onPress={() =>
                shellState.recoveryVersions.setProtected(version.id, !version.protected)
              }
            >
              {version.protected ? 'Unprotect' : 'Protect'}
            </Button>
          </div>
        ))}
      </div>
    </dialog>
  );
}

function CheckpointDialog({ shellState }: { readonly shellState: EditorShellState }) {
  const project = useSyncExternalStore(
    shellState.projectUi.subscribe,
    shellState.projectUi.getSnapshot,
  );
  const close = () => shellState.projectUi.updateCheckpoint({ open: false });
  const dialog = useModalDialog(project.checkpoint.open, close);
  const create = () => shellState.projectUi.createCheckpoint(project.checkpoint.label);
  return (
    <dialog
      {...dialog}
      id="checkpoint-dialog"
      className="build-log-dialog checkpoint-dialog"
      aria-labelledby="checkpoint-dialog-title"
    >
      <header>
        <strong id="checkpoint-dialog-title">Protect recovery checkpoint</strong>
        <Button type="button" size="compact" onPress={close}>
          Close
        </Button>
      </header>
      <div className="checkpoint-body">
        <TextField
          label="Label"
          value={project.checkpoint.label}
          onChange={(label) => shellState.projectUi.updateCheckpoint({ label })}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            create();
          }}
          input={{
            id: 'checkpoint-label',
            autoComplete: 'off',
            spellCheck: false,
            autoFocus: true,
          }}
        />
        <p>Protected checkpoints are retained until you explicitly remove them.</p>
        <div className="checkpoint-actions">
          <Button type="button" size="compact" onPress={close}>
            Cancel
          </Button>
          <Button type="button" tone="primary" onPress={create}>
            Protect checkpoint
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function EditorDialogs({ shellState }: { readonly shellState: EditorShellState }) {
  return (
    <>
      <BuildLogDialog shellState={shellState} />
      <RecoveryDialog shellState={shellState} />
      <CheckpointDialog shellState={shellState} />
      <CollaborationDialog port={shellState.collaborationUi} />
      <ViewFilterPopover shellState={shellState} />
    </>
  );
}
