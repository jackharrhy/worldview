import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { SnapshotStore } from '@jackharrhy/worldview';

import type { ViewerController } from '../viewer-controller.js';
import type { ViewerSnapshot } from '../viewer-state.js';
import { ControlDock } from './control-dock.js';

interface ViewerAppProps {
  readonly controller: ViewerController;
  readonly store: SnapshotStore<ViewerSnapshot>;
}

export function ViewerApp({ controller, store }: ViewerAppProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const canvas = useRef<HTMLCanvasElement>(null);
  const localFiles = useRef<HTMLInputElement>(null);
  const walkabilityFile = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (canvas.current) void controller.start(canvas.current);
    return () => controller.dispose();
  }, [controller]);

  return (
    <main
      className={`viewer-shell${snapshot.reticle ? '' : ' hide-reticle'}`}
      data-viewer-shell
      data-state={snapshot.shellState}
      data-movement-mode={snapshot.movementMode}
      onDragEnter={(event) => {
        event.preventDefault();
        controller.setDropActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) controller.setDropActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        controller.loadDroppedFiles(event.dataTransfer.files);
      }}
    >
      <canvas ref={canvas} id="map-canvas" aria-label="Worldview map viewport" tabIndex={0} />

      <div className="map-readout" aria-live="polite">
        <strong data-map-name>{snapshot.mapName}</strong>
        <span data-status data-ready-sequence={snapshot.readySequence}>
          {snapshot.status}
        </span>
        <span className="map-readout__format" data-format>
          {snapshot.formatLabel}
        </span>
      </div>

      <p className="control-hint">Click to look. WASD to move, Space to jump, V for noclip.</p>
      <div className="reticle" aria-hidden="true" />
      <div className="drop-target" data-drop-message hidden={!snapshot.dropActive}>
        Drop a BSP with its map assets
      </div>

      <ControlDock
        controller={controller}
        snapshot={snapshot}
        openLocalFiles={() => localFiles.current?.click()}
        openWalkabilityFile={() => walkabilityFile.current?.click()}
      />

      <input
        ref={localFiles}
        className="visually-hidden"
        data-local-files
        type="file"
        accept=".bsp,.wad,.spr,.wav,.mp3,.ogg,.lmp,.pal,.tga,application/octet-stream,audio/wav,audio/mpeg,audio/ogg"
        multiple
        onChange={(event) => controller.loadLocalFiles(event.currentTarget.files)}
      />
      <input
        ref={walkabilityFile}
        className="visually-hidden"
        data-walkability-file
        type="file"
        accept=".json,application/json"
        onChange={(event) => controller.loadWalkabilityFile(event.currentTarget.files?.[0])}
      />
      <output data-metrics hidden>
        {snapshot.metrics}
      </output>
    </main>
  );
}
