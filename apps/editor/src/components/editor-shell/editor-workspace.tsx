import { MapInspector } from './map-inspector.js';
import { ObjectInspector } from './object-inspector.js';
import { TextureInspector } from './texture-inspector.js';

import type { EditorShellState } from '../../editor-shell-state.js';

interface EditorWorkspaceProps {
  readonly shellState: EditorShellState;
}

export function EditorWorkspace({ shellState }: EditorWorkspaceProps) {
  return (
    <section className="workspace">
      <section className="viewport-grid" aria-label="Map viewports">
        <article className="viewport-pane" data-viewport="xy">
          <header>
            <strong>TOP</strong>
            <span>XY</span>
          </header>
          <canvas className="source-canvas" aria-label="Top XY map viewport" />
        </article>
        <article className="viewport-pane perspective" data-viewport="perspective">
          <header>
            <strong>PERSPECTIVE</strong>
            <span id="perspective-mode">EDIT</span>
          </header>
          <canvas className="source-canvas" aria-label="Perspective map viewport" />
          <canvas className="compiled-canvas" aria-label="Compiled BSP preview" hidden />
        </article>
        <article className="viewport-pane" data-viewport="xz">
          <header>
            <strong>FRONT</strong>
            <span>XZ</span>
          </header>
          <canvas className="source-canvas" aria-label="Front XZ map viewport" />
        </article>
        <article className="viewport-pane" data-viewport="yz">
          <header>
            <strong>SIDE</strong>
            <span>YZ</span>
          </header>
          <canvas className="source-canvas" aria-label="Side YZ map viewport" />
        </article>
        <div className="viewport-error" hidden />
      </section>
      <aside className="inspector panel" aria-label="Inspector">
        <div className="inspector-tabs" role="tablist" aria-label="Inspector pages">
          <button
            className="active"
            type="button"
            role="tab"
            data-inspector-tab="object"
            aria-selected="true"
          >
            Object
          </button>
          <button type="button" role="tab" data-inspector-tab="textures" aria-selected="false">
            Textures
          </button>
          <button type="button" role="tab" data-inspector-tab="map" aria-selected="false">
            Map
          </button>
        </div>
        <div className="inspector-scroll">
          <ObjectInspector />
          <TextureInspector />
          <MapInspector shellState={shellState} />
        </div>
      </aside>
    </section>
  );
}
