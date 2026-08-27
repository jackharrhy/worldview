import { useRef, useSyncExternalStore } from 'react';
import { useMutation } from '@tanstack/react-query';

import type { ViewerController } from '../viewer-controller.js';
import type { ViewerSnapshotReaders } from '../viewer-state.js';
import { ControlDock } from './control-dock.js';

interface ViewerAppProps {
  readonly controller: ViewerController;
  readonly readers: ViewerSnapshotReaders;
}

export function ViewerApp({ controller, readers }: ViewerAppProps) {
  const snapshot = useSyncExternalStore(
    readers.shell.subscribe,
    readers.shell.getSnapshot,
    readers.shell.getSnapshot,
  );
  const localFiles = useRef<HTMLInputElement>(null);
  const walkabilityFile = useRef<HTMLInputElement>(null);
  const dropMutation = useMutation({
    mutationKey: ['viewer', 'load', 'drop'],
    mutationFn: (files: FileList) => controller.loadDroppedFiles(files),
  });
  const localFileMutation = useMutation({
    mutationKey: ['viewer', 'load', 'local-files'],
    mutationFn: (files: FileList | null) => controller.loadLocalFiles(files),
  });
  const walkabilityFileMutation = useMutation({
    mutationKey: ['viewer', 'walkability', 'load-file'],
    mutationFn: (file: File | undefined) => controller.loadWalkabilityFile(file),
  });

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
        dropMutation.mutate(event.dataTransfer.files);
      }}
    >
      <canvas
        ref={controller.attachCanvas}
        id="map-canvas"
        aria-label="Worldview map viewport"
        tabIndex={0}
      />

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
        store={readers.controls}
        cameraStore={readers.camera}
        openLocalFiles={() => localFiles.current?.click()}
        openWalkabilityFile={() => walkabilityFile.current?.click()}
      />

      <input
        ref={localFiles}
        className="visually-hidden"
        data-local-files
        type="file"
        aria-label="Choose BSP and related asset files"
        accept=".bsp,.wad,.spr,.wav,.mp3,.ogg,.lmp,.pal,.tga,application/octet-stream,audio/wav,audio/mpeg,audio/ogg"
        multiple
        onChange={(event) => localFileMutation.mutate(event.currentTarget.files)}
      />
      <input
        ref={walkabilityFile}
        className="visually-hidden"
        data-walkability-file
        type="file"
        aria-label="Choose a walkability sidecar"
        accept=".json,application/json"
        onChange={(event) => walkabilityFileMutation.mutate(event.currentTarget.files?.[0])}
      />
      <output data-metrics hidden>
        {snapshot.metrics}
      </output>
    </main>
  );
}
