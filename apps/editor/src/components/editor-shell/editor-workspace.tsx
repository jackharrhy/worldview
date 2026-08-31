import { useSyncExternalStore } from 'react';

import { Button } from '../ui/button.js';
import { Icon } from '../ui/icon.js';
import { Tab, TabList, TabPanel, Tabs } from '../ui/tabs.js';
import { MapInspector } from './map-inspector.js';
import { ObjectInspector } from './object-inspector.js';
import { TextureInspector } from './texture-inspector.js';

import type { EditorShellState } from '../../editor-shell-state.js';

interface EditorWorkspaceProps {
  readonly shellState: EditorShellState;
}

export function EditorWorkspace({ shellState }: EditorWorkspaceProps) {
  const viewportLayout = useSyncExternalStore(
    shellState.viewportLayout.subscribe,
    shellState.viewportLayout.getSnapshot,
  );
  const inspectorPage = useSyncExternalStore(
    shellState.inspectorLayout.subscribe,
    shellState.inspectorLayout.getSnapshot,
  );
  const { perspectiveOnly, rendererReady } = viewportLayout;
  const perspectiveToggleLabel = perspectiveOnly
    ? 'Restore four viewports'
    : 'Show Perspective only';

  return (
    <section className="workspace">
      <section
        className={`viewport-grid${perspectiveOnly ? ' perspective-only' : ''}`}
        aria-label="Map viewports"
      >
        <article className="viewport-pane perspective" data-viewport="perspective">
          <header>
            <strong>PERSPECTIVE</strong>
            <span id="perspective-mode">EDIT</span>
            <Button
              className="viewport-layout-toggle"
              tone="quiet"
              size="compact"
              aria-label={perspectiveToggleLabel}
              aria-pressed={perspectiveOnly}
              isDisabled={!rendererReady}
              onPress={() => shellState.viewportLayout.togglePerspectiveOnly()}
            >
              <Icon name={perspectiveOnly ? 'restore' : 'expand'} />
            </Button>
          </header>
          <canvas
            className="source-canvas"
            aria-label="Perspective map viewport"
            data-rendering="true"
          />
          <canvas className="compiled-canvas" aria-label="Compiled BSP preview" hidden />
        </article>
        <article className="viewport-pane" data-viewport="xy" hidden={perspectiveOnly}>
          <header>
            <strong>TOP</strong>
            <span>XY</span>
          </header>
          <canvas
            className="source-canvas"
            aria-label="Top XY map viewport"
            data-rendering={!perspectiveOnly}
          />
        </article>
        <article className="viewport-pane" data-viewport="xz" hidden={perspectiveOnly}>
          <header>
            <strong>FRONT</strong>
            <span>XZ</span>
          </header>
          <canvas
            className="source-canvas"
            aria-label="Front XZ map viewport"
            data-rendering={!perspectiveOnly}
          />
        </article>
        <article className="viewport-pane" data-viewport="yz" hidden={perspectiveOnly}>
          <header>
            <strong>SIDE</strong>
            <span>YZ</span>
          </header>
          <canvas
            className="source-canvas"
            aria-label="Side YZ map viewport"
            data-rendering={!perspectiveOnly}
          />
        </article>
        <div
          className="viewport-resizer viewport-column-resizer"
          role="separator"
          aria-label="Resize perspective and orthographic viewports"
          aria-orientation="vertical"
          tabIndex={0}
          data-resize="viewport-column"
          hidden={perspectiveOnly}
        />
        <div
          className="viewport-resizer viewport-top-resizer"
          role="separator"
          aria-label="Resize upper and lower viewport rows"
          aria-orientation="horizontal"
          tabIndex={0}
          data-resize="viewport-top"
          hidden={perspectiveOnly}
        />
        <button
          type="button"
          className="viewport-resizer viewport-cross-resizer"
          aria-label="Resize viewport rows and columns"
          data-resize="viewport-cross"
          hidden={perspectiveOnly}
        />
        <div className="viewport-error" hidden />
      </section>
      <div
        className="workspace-resizer"
        role="separator"
        aria-label="Resize inspector"
        aria-orientation="vertical"
        tabIndex={0}
        data-resize="inspector"
      />
      <aside className="inspector panel" aria-label="Inspector">
        <Tabs
          className="inspector-tabs-shell"
          selectedKey={inspectorPage}
          onSelectionChange={(key) => {
            if (key === 'map' || key === 'object' || key === 'textures') {
              shellState.inspectorLayout.setActive(key);
            }
          }}
        >
          <TabList className="inspector-tabs" aria-label="Inspector pages">
            <Tab id="map" data-inspector-tab="map">
              Map
            </Tab>
            <Tab id="object" data-inspector-tab="object">
              Entity
            </Tab>
            <Tab id="textures" data-inspector-tab="textures">
              Face
            </Tab>
          </TabList>
          <TabPanel
            id="map"
            className="inspector-scroll"
            data-inspector-panel="map"
            shouldForceMount
          >
            <MapInspector shellState={shellState} />
          </TabPanel>
          <TabPanel
            id="object"
            className="inspector-scroll"
            data-inspector-panel="object"
            shouldForceMount
          >
            <ObjectInspector />
          </TabPanel>
          <TabPanel
            id="textures"
            className="inspector-scroll"
            data-inspector-panel="textures"
            shouldForceMount
          >
            <TextureInspector shellState={shellState} />
          </TabPanel>
        </Tabs>
      </aside>
    </section>
  );
}
