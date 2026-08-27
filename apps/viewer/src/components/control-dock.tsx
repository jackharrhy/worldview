import { useState, useSyncExternalStore } from 'react';
import { useMutation } from '@tanstack/react-query';

import type { SnapshotReader } from '@jackharrhy/worldview';

import { selectableFixtures } from '../fixture-catalog.js';
import type { ViewerController } from '../viewer-controller.js';
import type {
  ViewerCameraSnapshot,
  ViewerControlSnapshot,
  ViewerSnapshot,
} from '../viewer-state.js';
import { Field, PanelSection, TextField } from './form-controls.js';
import { MapControls } from './map-controls.js';

interface ControlDockProps {
  readonly controller: ViewerController;
  readonly store: SnapshotReader<ViewerControlSnapshot>;
  readonly cameraStore: SnapshotReader<ViewerCameraSnapshot>;
  readonly openLocalFiles: () => void;
  readonly openWalkabilityFile: () => void;
}

export function ControlDock({
  controller,
  store,
  cameraStore,
  openLocalFiles,
  openWalkabilityFile,
}: ControlDockProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [tab, setTab] = useState<'load' | 'map'>('load');
  const fixtureMutation = useMutation({
    mutationKey: ['viewer', 'load', 'fixture'],
    mutationFn: (id: string) => controller.loadFixture(id),
  });
  const urlMutation = useMutation({
    mutationKey: ['viewer', 'load', 'url'],
    mutationFn: () => controller.loadUrl(),
  });
  const field = <Key extends keyof ViewerSnapshot>(key: Key, value: ViewerSnapshot[Key]) =>
    controller.setField(key, value);

  return (
    <aside className="control-dock" aria-label="Map controls" data-control-dock>
      <header className="control-dock__header">
        <strong>Worldview</strong>
        <span>BSP workbench</span>
      </header>
      <div className="control-tabs" aria-label="Viewer controls">
        {(['load', 'map'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {value === 'load' ? 'Load' : 'Map'}
          </button>
        ))}
      </div>

      <div className="control-dock__scroll">
        {tab === 'load' ? (
          <div className="control-page">
            <Field label="Fixture">
              <select
                value={snapshot.fixture}
                onChange={(event) => field('fixture', event.currentTarget.value)}
              >
                {selectableFixtures.map((fixture) => (
                  <option key={fixture.id} value={fixture.id}>
                    {fixture.label}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              data-fixture
              disabled={selectableFixtures.length === 0 || fixtureMutation.isPending}
              onClick={() => fixtureMutation.mutate(snapshot.fixture)}
            >
              Load fixture
            </button>

            <PanelSection title="URL">
              <TextField
                label="BSP"
                value={snapshot.bspUrl}
                onChange={(value) => field('bspUrl', value)}
              />
              <TextField
                label="Game root"
                value={snapshot.gameBaseUrl}
                onChange={(value) => field('gameBaseUrl', value)}
              />
              <PanelSection title="Overrides">
                <TextField
                  label="Palette"
                  value={snapshot.paletteUrl}
                  onChange={(value) => field('paletteUrl', value)}
                />
                <TextField
                  label="WAD base"
                  value={snapshot.wadBaseUrl}
                  onChange={(value) => field('wadBaseUrl', value)}
                />
                <TextField
                  label="Skybox base"
                  value={snapshot.skyboxBaseUrl}
                  onChange={(value) => field('skyboxBaseUrl', value)}
                />
                <TextField
                  label="Sprite base"
                  value={snapshot.spriteBaseUrl}
                  onChange={(value) => field('spriteBaseUrl', value)}
                />
                <TextField
                  label="Sound base"
                  value={snapshot.soundBaseUrl}
                  onChange={(value) => field('soundBaseUrl', value)}
                />
              </PanelSection>
              <button
                type="button"
                disabled={!snapshot.bspUrl.trim() || urlMutation.isPending}
                onClick={() => urlMutation.mutate()}
              >
                Load URL
              </button>
            </PanelSection>

            <PanelSection title="Local files">
              <button type="button" onClick={openLocalFiles}>
                Choose BSP and assets
              </button>
            </PanelSection>
          </div>
        ) : (
          <MapControls
            controller={controller}
            snapshot={snapshot}
            cameraStore={cameraStore}
            openWalkabilityFile={openWalkabilityFile}
          />
        )}
      </div>
    </aside>
  );
}
