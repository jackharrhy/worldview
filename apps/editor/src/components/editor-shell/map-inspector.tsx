import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { EditorShellState } from '../../editor-shell-state.js';
import { Button } from '../ui/button.js';
import { Icon } from '../ui/icon.js';
import { Checkbox } from '../ui/checkbox.js';
import { NumberField } from '../ui/number-field.js';
import { Select } from '../ui/select.js';
import { TextField } from '../ui/text-field.js';

import type { LayerSnapshot } from '../../organization-ui-state.js';

interface MapInspectorProps {
  readonly shellState: EditorShellState;
}

function DocumentSummary({ shellState }: MapInspectorProps) {
  const summary = useSyncExternalStore(
    shellState.documentSummary.subscribe,
    shellState.documentSummary.getSnapshot,
    shellState.documentSummary.getSnapshot,
  );
  const geometryLabel =
    summary.geometryErrorCount === 0 ? 'valid' : `${summary.geometryErrorCount} errors`;

  return (
    <div className="document-section inspector-section">
      <h3>Document</h3>
      <dl className="property-list compact">
        <div>
          <dt>Revision</dt>
          <dd id="document-revision">{summary.revision}</dd>
        </div>
        <div>
          <dt>Entities</dt>
          <dd id="entity-count">{summary.entityCount}</dd>
        </div>
        <div>
          <dt>Brushes</dt>
          <dd id="brush-count">{summary.brushCount}</dd>
        </div>
        <div>
          <dt>Groups</dt>
          <dd id="group-count">{summary.groupCount}</dd>
        </div>
        <div>
          <dt>Hidden</dt>
          <dd id="hidden-object-count">{summary.hiddenObjectCount}</dd>
        </div>
        <div>
          <dt>Locked</dt>
          <dd id="locked-object-count">{summary.lockedObjectCount}</dd>
        </div>
        <div>
          <dt>Geometry</dt>
          <dd
            id="geometry-state"
            className={summary.geometryErrorCount > 0 ? 'error-text' : undefined}
          >
            {geometryLabel}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ResourceSettings({ shellState }: MapInspectorProps) {
  const section = useRef<HTMLElement>(null);
  const wadInput = useRef<HTMLInputElement>(null);
  const paletteInput = useRef<HTMLInputElement>(null);
  const resources = useSyncExternalStore(
    shellState.resourceSettings.subscribe,
    shellState.resourceSettings.getSnapshot,
    shellState.resourceSettings.getSnapshot,
  );
  useEffect(() => {
    if (resources.revealVersion === 0) return;
    const frame = requestAnimationFrame(() =>
      section.current?.scrollIntoView({ block: 'nearest' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [resources.revealVersion]);
  return (
    <section ref={section} id="resource-settings" className="resource-settings inspector-section">
      <div className="section-heading">
        <h3>Map resources</h3>
        <span>
          {resources.loadedWadCount} WAD{resources.loadedWadCount === 1 ? '' : 's'}
        </span>
      </div>
      <p className={resources.tone === 'error' ? 'error-text' : undefined}>{resources.message}</p>
      <div className="resource-settings-actions">
        <Button size="compact" onPress={() => wadInput.current?.click()}>
          <Icon name="texture-source" /> Add WAD
        </Button>
        <Button size="compact" onPress={() => paletteInput.current?.click()}>
          <Icon name="palette" /> {resources.paletteLoaded ? 'Replace palette' : 'Add palette'}
        </Button>
      </div>
      <input ref={wadInput} id="wad-files" type="file" accept=".wad" multiple hidden />
      <input ref={paletteInput} id="palette-file" type="file" accept=".lmp,.pal,.dat" hidden />
    </section>
  );
}

function LayerRow({ layer, shellState }: { layer: LayerSnapshot; shellState: EditorShellState }) {
  const [name, setName] = useState(layer.name);
  useEffect(() => setName(layer.name), [layer.name]);
  const objectCount = layer.brushCount + layer.pointEntityCount;
  const commitName = () => {
    const next = name.trim();
    if (layer.id !== null && next && next !== layer.name) {
      shellState.layerPanel.invoke('rename', layer.id, next);
    } else {
      setName(layer.name);
    }
  };
  return (
    <div
      className={`layer-row${layer.selected ? ' selected' : ''}${layer.hidden ? ' hidden-layer' : ''}${layer.locked ? ' locked-layer' : ''}${layer.omitted ? ' omitted-layer' : ''}`}
      data-layer-id={layer.token}
      role="option"
      tabIndex={0}
      aria-selected={layer.selected}
      onClick={() => shellState.layerPanel.invoke('select', layer.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
          return;
        }
        event.preventDefault();
        shellState.layerPanel.invoke('select', layer.id);
      }}
    >
      <Button
        className="layer-active"
        size="compact"
        aria-pressed={layer.active}
        aria-label={`Make ${layer.name} active`}
        onPress={() => shellState.layerPanel.invoke('makeActive', layer.id)}
      >
        {layer.active ? 'A' : '·'}
      </Button>
      <TextField
        className="layer-row-name"
        label={layer.id === null ? 'Default Layer' : `Rename ${layer.name}`}
        hideLabel
        value={name}
        isReadOnly={layer.id === null}
        onChange={setName}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLElement).blur();
          if (event.key === 'Escape') {
            setName(layer.name);
            (event.target as HTMLElement).blur();
          }
        }}
      />
      <span
        className="layer-object-count"
        title={`${layer.brushCount} brushes · ${layer.pointEntityCount} point entities`}
      >
        {objectCount}
      </span>
      {(
        [
          ['V', layer.hidden ? `Show ${layer.name}` : `Hide ${layer.name}`, 'hidden', layer.hidden],
          [
            'L',
            layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`,
            'locked',
            layer.locked,
          ],
          [
            'X',
            `${layer.omitted ? 'Include' : 'Omit'} ${layer.name} in compile export`,
            'omit-from-export',
            layer.omitted,
          ],
        ] as const
      ).map(([text, label, flag, active]) => (
        <Button
          key={flag}
          className="layer-flag"
          size="compact"
          aria-pressed={active}
          aria-label={label}
          onPress={() => shellState.layerPanel.invoke('setFlag', layer.id, flag, !active)}
        >
          {text}
        </Button>
      ))}
    </div>
  );
}

function LayerPanel({ shellState }: MapInspectorProps) {
  const panel = useSyncExternalStore(
    shellState.layerPanel.subscribe,
    shellState.layerPanel.getSnapshot,
  );
  const [newName, setNewName] = useState('Layer');
  const nameInput = useRef<HTMLInputElement>(null);
  const create = () => {
    shellState.layerPanel.invoke('create', newName);
    requestAnimationFrame(() => nameInput.current?.select());
  };
  return (
    <div className="layer-section inspector-section">
      <div className="section-heading">
        <h3>Layers</h3>
        <span id="active-layer-name">{panel.activeName} active</span>
      </div>
      <div id="layer-list" className="layer-list" aria-label="Map layers" role="listbox">
        {panel.layers.map((layer) => (
          <LayerRow key={layer.token} layer={layer} shellState={shellState} />
        ))}
      </div>
      <div className="layer-create">
        <TextField
          label="New layer name"
          hideLabel
          value={newName}
          onChange={setNewName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') create();
          }}
          inputRef={nameInput}
          input={{ id: 'layer-name', autoComplete: 'off', spellCheck: false }}
        />
        <Button size="compact" data-action="add-layer" onPress={create}>
          Add layer
        </Button>
      </div>
      <div className="layer-selection-actions">
        <Button
          size="compact"
          isDisabled={!panel.canMoveSelection}
          onPress={() => shellState.layerPanel.invoke('moveSelection')}
        >
          Move selection
        </Button>
        <Button
          size="compact"
          isDisabled={!panel.canSelectContents}
          onPress={() => shellState.layerPanel.invoke('selectContents')}
        >
          Select contents
        </Button>
        <Button
          size="compact"
          isDisabled={!panel.canIsolate}
          onPress={() => shellState.layerPanel.invoke('isolate')}
        >
          Isolate
        </Button>
        <Button
          size="compact"
          isDisabled={!panel.canRemove}
          onPress={() => shellState.layerPanel.invoke('remove')}
        >
          Remove
        </Button>
        <Button
          size="compact"
          isDisabled={!panel.canMoveUp}
          aria-label="Move selected layer up"
          onPress={() => shellState.layerPanel.invoke('reorder', -1)}
        >
          Move up
        </Button>
        <Button
          size="compact"
          isDisabled={!panel.canMoveDown}
          aria-label="Move selected layer down"
          onPress={() => shellState.layerPanel.invoke('reorder', 1)}
        >
          Move down
        </Button>
      </div>
      <div className="layer-global-actions">
        <Button
          size="compact"
          onPress={() => shellState.layerPanel.invoke('setAllFlags', 'hidden', false)}
        >
          Show all
        </Button>
        <Button
          size="compact"
          onPress={() => shellState.layerPanel.invoke('setAllFlags', 'hidden', true)}
        >
          Hide all
        </Button>
        <Button
          size="compact"
          onPress={() => shellState.layerPanel.invoke('setAllFlags', 'locked', false)}
        >
          Unlock all
        </Button>
        <Button
          size="compact"
          onPress={() => shellState.layerPanel.invoke('setAllFlags', 'locked', true)}
        >
          Lock all
        </Button>
      </div>
    </div>
  );
}

function EntityLinks({ shellState }: MapInspectorProps) {
  const links = useSyncExternalStore(
    shellState.entityLinks.subscribe,
    shellState.entityLinks.getSnapshot,
  );
  return (
    <div className="entity-link-section inspector-section">
      <div className="section-heading">
        <h3>Entity links</h3>
        <span id="entity-link-count">
          {links.shownCount} / {links.totalCount} shown
        </span>
      </div>
      <Select
        className="entity-link-mode"
        label="Visibility"
        options={[
          { id: 'all', label: 'All' },
          { id: 'transitive', label: 'Transitive selected' },
          { id: 'direct', label: 'Direct selected' },
          { id: 'none', label: 'None' },
        ]}
        selectedKey={links.mode}
        onSelectionChange={(key) => {
          if (key === 'all' || key === 'transitive' || key === 'direct' || key === 'none') {
            shellState.entityLinks.setMode(key);
          }
        }}
      />
    </div>
  );
}

function ReferenceScenes({ shellState }: MapInspectorProps) {
  const references = useSyncExternalStore(
    shellState.referenceScenes.subscribe,
    shellState.referenceScenes.getSnapshot,
  );
  return (
    <div className="reference-section inspector-section">
      <div className="section-heading">
        <h3>References</h3>
        <span id="reference-count">{references.length} loaded</span>
      </div>
      <div className="reference-actions">
        <Button size="compact" onPress={() => shellState.projectUi.invoke('load-reference')}>
          Load map
        </Button>
        <Button size="compact" onPress={() => shellState.projectUi.invoke('snapshot-reference')}>
          Snapshot
        </Button>
        <Button
          size="compact"
          isDisabled={references.length === 0}
          onPress={() => shellState.referenceScenes.invoke('clear')}
        >
          Clear
        </Button>
      </div>
      <div id="reference-list" className="reference-list">
        {references.map((reference) => (
          <div className="reference-row" key={reference.id}>
            <div className="reference-row-heading">
              <Checkbox
                isSelected={reference.visible}
                onChange={(visible) =>
                  shellState.referenceScenes.invoke('setVisible', reference.id, visible)
                }
              >
                <span className="visually-hidden">Show reference</span>
              </Checkbox>
              <span>{reference.label}</span>
              <Button
                size="compact"
                onPress={() => shellState.referenceScenes.invoke('remove', reference.id)}
              >
                Remove
              </Button>
            </div>
            <div className="reference-offsets">
              {reference.offset.map((value, axis) => (
                <NumberField
                  key={axis}
                  label={`${['X', 'Y', 'Z'][axis]} offset`}
                  value={value}
                  step={16}
                  hideSteppers
                  onChange={(next) => {
                    if (axis === 0 || axis === 1 || axis === 2) {
                      shellState.referenceScenes.invoke('setOffset', reference.id, axis, next);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MapInspector({ shellState }: MapInspectorProps) {
  return (
    <section>
      <div className="panel-heading">
        <h2>Map</h2>
        <span>Valve 220</span>
      </div>
      <LayerPanel shellState={shellState} />
      <DocumentSummary shellState={shellState} />
      <ResourceSettings shellState={shellState} />
      <EntityLinks shellState={shellState} />
      <ReferenceScenes shellState={shellState} />
    </section>
  );
}
