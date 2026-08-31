import { useSyncExternalStore, type CSSProperties } from 'react';

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

function ViewportRuntimeOverlays() {
  return (
    <>
      <div className="handle-lasso" data-viewport-overlay="lasso" aria-hidden="true" />
      <div
        className="transform-readout"
        data-viewport-overlay="transform-readout"
        aria-hidden="true"
      />
    </>
  );
}

export function EditorWorkspace({ shellState }: EditorWorkspaceProps) {
  const viewportLayout = useSyncExternalStore(
    shellState.viewportLayout.subscribe,
    shellState.viewportLayout.getSnapshot,
  );
  const inspectorLayout = useSyncExternalStore(
    shellState.inspectorLayout.subscribe,
    shellState.inspectorLayout.getSnapshot,
  );
  const viewportPresentation = useSyncExternalStore(
    shellState.viewportPresentation.subscribe,
    shellState.viewportPresentation.getSnapshot,
  );
  const workspaceLayout = useSyncExternalStore(
    shellState.workspaceLayout.subscribe,
    shellState.workspaceLayout.getSnapshot,
  );
  const { perspectiveOnly, rendererReady } = viewportLayout;
  const perspectiveToggleLabel = perspectiveOnly
    ? 'Restore four viewports'
    : 'Show Perspective only';

  return (
    <section
      className={`workspace${inspectorLayout.open ? '' : ' inspector-closed'}`}
      style={{ '--inspector-width': `${workspaceLayout.inspectorWidth}px` } as CSSProperties}
    >
      <section
        className={`viewport-grid${perspectiveOnly ? ' perspective-only' : ''}`}
        aria-label="Map viewports"
        style={
          {
            '--viewport-column': `${workspaceLayout.viewportColumn * 100}%`,
            '--viewport-top': `${workspaceLayout.viewportTop * 100}%`,
          } as CSSProperties
        }
      >
        <article className="viewport-pane perspective" data-viewport="perspective">
          <header>
            <strong>PERSPECTIVE</strong>
            <span id="perspective-mode" title={viewportPresentation.perspectiveTitle}>
              {viewportPresentation.perspectiveMode}
            </span>
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
            hidden={viewportPresentation.showingCompiled}
          />
          <canvas
            className="compiled-canvas"
            aria-label="Compiled BSP preview"
            hidden={!viewportPresentation.showingCompiled}
          />
          <ViewportRuntimeOverlays />
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
          <ViewportRuntimeOverlays />
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
          <ViewportRuntimeOverlays />
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
          <ViewportRuntimeOverlays />
        </article>
        <div
          className={`viewport-resizer viewport-column-resizer${workspaceLayout.dragging === 'viewport-column' ? ' dragging' : ''}`}
          role="separator"
          aria-label="Resize perspective and orthographic viewports"
          aria-orientation="vertical"
          aria-valuemin={30}
          aria-valuemax={76}
          aria-valuenow={Math.round(workspaceLayout.viewportColumn * 100)}
          tabIndex={0}
          data-resize="viewport-column"
          hidden={perspectiveOnly}
        />
        <div
          className={`viewport-resizer viewport-top-resizer${workspaceLayout.dragging === 'viewport-top' ? ' dragging' : ''}`}
          role="separator"
          aria-label="Resize upper and lower viewport rows"
          aria-orientation="horizontal"
          aria-valuemin={20}
          aria-valuemax={80}
          aria-valuenow={Math.round(workspaceLayout.viewportTop * 100)}
          tabIndex={0}
          data-resize="viewport-top"
          hidden={perspectiveOnly}
        />
        <div
          className={`viewport-resizer viewport-cross-resizer${workspaceLayout.dragging === 'viewport-cross' ? ' dragging' : ''}`}
          role="separator"
          tabIndex={0}
          aria-label="Resize viewport rows and columns"
          aria-valuetext={`Column ${Math.round(workspaceLayout.viewportColumn * 100)}%, row ${Math.round(workspaceLayout.viewportTop * 100)}%`}
          data-resize="viewport-cross"
          hidden={perspectiveOnly}
        />
        <div className="viewport-error" hidden={!viewportPresentation.error}>
          {viewportPresentation.error}
        </div>
      </section>
      <div
        className={`workspace-resizer${workspaceLayout.dragging === 'inspector' ? ' dragging' : ''}`}
        role="separator"
        aria-label="Resize inspector"
        aria-orientation="vertical"
        aria-valuemin={240}
        aria-valuemax={520}
        aria-valuenow={workspaceLayout.inspectorWidth}
        tabIndex={0}
        data-resize="inspector"
      />
      <aside
        className={`inspector panel${inspectorLayout.open ? '' : ' closed'}`}
        aria-label="Inspector"
      >
        <Tabs
          className="inspector-tabs-shell"
          selectedKey={inspectorLayout.active}
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
            <ObjectInspector shellState={shellState} />
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
