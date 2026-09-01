import { useSyncExternalStore } from 'react';
import { useMutation } from '@tanstack/react-query';

import type { SnapshotReader } from '@jackharrhy/worldview/runtime';

import type { ViewerController } from '../viewer-controller.js';
import type { ViewerCameraSnapshot, ViewerControlSnapshot } from '../viewer-state.js';
import { CheckboxField, Field, NumberField, PanelSection, ReadonlyField } from './form-controls.js';

interface ControllerSnapshotProps {
  readonly controller: ViewerController;
  readonly snapshot: ViewerControlSnapshot;
}

interface MapControlsProps extends ControllerSnapshotProps {
  readonly cameraStore: SnapshotReader<ViewerCameraSnapshot>;
  readonly openWalkabilityFile: () => void;
}

export function MapControls({
  controller,
  snapshot,
  cameraStore,
  openWalkabilityFile,
}: MapControlsProps) {
  const walkabilityMutation = useMutation({
    mutationKey: ['viewer', 'walkability', 'generate'],
    mutationFn: () => controller.generateWalkability(),
  });
  const overviewMutation = useMutation({
    mutationKey: ['viewer', 'overview', 'capture'],
    mutationFn: () => controller.captureOverview(),
  });
  const audioMutation = useMutation({
    mutationKey: ['viewer', 'audio', 'enable'],
    mutationFn: () => controller.enableAudio(),
  });
  const musicMutation = useMutation({
    mutationKey: ['viewer', 'audio', 'music', 'play'],
    mutationFn: () => controller.playMusic(),
  });
  const movement = (value: Parameters<ViewerController['setMovement']>[0]) =>
    controller.setMovement(value);

  return (
    <div className="control-page" role="tabpanel">
      <ReadonlyField label="State" value={snapshot.status} />
      <ReadonlyField label="Map" value={snapshot.map} />
      <ReadonlyField label="Format" value={snapshot.format} />

      <PanelSection title="Geometry">
        <ReadonlyField label="Triangles" value={snapshot.triangles} />
        <ReadonlyField label="Faces" value={snapshot.faces} />
        <ReadonlyField label="Batches" value={snapshot.batches} />
        <ReadonlyField label="Materials" value={snapshot.materials} />
        <ReadonlyField label="Lightmaps" value={snapshot.lightmaps} />
        <ReadonlyField label="Sprites" value={snapshot.sprites} />
        <ReadonlyField label="Sounds" value={snapshot.sounds} />
        <ReadonlyField label="Entities" value={snapshot.entities} />
        <ReadonlyField label="Load time" value={snapshot.loadTime} />
      </PanelSection>

      <PanelSection title="Entity support">
        <ReadonlyField
          label="Partial / skipped"
          value={snapshot.skippedEntities}
          dataAttribute="data-entity-support"
          multiline
          rows={8}
        />
      </PanelSection>

      <CameraControls controller={controller} snapshot={snapshot} store={cameraStore} />

      <PanelSection title="Movement" defaultOpen>
        <NumberField
          label="Max speed"
          value={snapshot.maxSpeed}
          min={100}
          max={400}
          step={1}
          dataAttribute="data-max-speed"
          onCommit={(value) => movement({ maxSpeed: value })}
        />
        <NumberField
          label="Ground accel"
          value={snapshot.accelerate}
          min={1}
          max={20}
          step={0.1}
          onCommit={(value) => movement({ accelerate: value })}
        />
        <NumberField
          label="Air accel"
          value={snapshot.airAccelerate}
          min={0}
          max={100}
          step={0.1}
          onCommit={(value) => movement({ airAccelerate: value })}
        />
        <NumberField
          label="Friction"
          value={snapshot.friction}
          min={0}
          max={10}
          step={0.1}
          onCommit={(value) => movement({ friction: value })}
        />
        <NumberField
          label="Stop speed"
          value={snapshot.stopSpeed}
          min={0}
          max={200}
          step={1}
          onCommit={(value) => movement({ stopSpeed: value })}
        />
        <NumberField
          label="Mouse sens"
          value={snapshot.mouseSensitivity}
          min={0.1}
          max={10}
          step={0.1}
          onCommit={(value) => movement({ mouseSensitivity: value })}
        />
        <NumberField
          label="Mouse accel"
          value={snapshot.mouseAcceleration}
          min={0}
          max={0.1}
          step={0.002}
          fractionDigits={3}
          dataAttribute="data-mouse-acceleration"
          onCommit={(value) => movement({ mouseAcceleration: value })}
        />
        <NumberField
          label="View bob"
          value={snapshot.viewBob}
          min={0}
          max={2}
          step={0.05}
          onCommit={(value) => movement({ viewBob: value })}
        />
      </PanelSection>

      <WalkabilityControls
        controller={controller}
        snapshot={snapshot}
        openFile={openWalkabilityFile}
        generating={walkabilityMutation.isPending}
        generate={() => walkabilityMutation.mutate()}
      />
      <DisplayControls controller={controller} snapshot={snapshot} />
      <OverviewControls
        controller={controller}
        snapshot={snapshot}
        capturing={overviewMutation.isPending}
        capture={() => overviewMutation.mutate()}
      />
      <AudioControls
        controller={controller}
        snapshot={snapshot}
        enabling={audioMutation.isPending}
        enable={() => audioMutation.mutate()}
        playing={musicMutation.isPending}
        play={() => musicMutation.mutate()}
      />
    </div>
  );
}

function CameraControls({
  controller,
  snapshot,
  store,
}: ControllerSnapshotProps & { readonly store: SnapshotReader<ViewerCameraSnapshot> }) {
  const camera = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <PanelSection title="Camera">
      <Field label="Movement">
        <select
          value={snapshot.movementMode}
          onChange={(event) =>
            controller.setMovementMode(event.currentTarget.value as 'walk' | 'fly')
          }
        >
          <option value="walk">Walk</option>
          <option value="fly">Noclip</option>
        </select>
      </Field>
      <ReadonlyField label="Position" value={camera.position} />
      <ReadonlyField label="Yaw / pitch" value={camera.angles} />
      <NumberField
        label="Field of view"
        value={snapshot.fieldOfView}
        min={45}
        max={110}
        step={1}
        onCommit={(value) => controller.setFieldOfView(value)}
      />
      <button
        type="button"
        disabled={!snapshot.resetCameraEnabled}
        onClick={() => controller.resetCamera()}
      >
        Reset camera
      </button>
    </PanelSection>
  );
}

function WalkabilityControls({
  controller,
  snapshot,
  openFile,
  generating,
  generate,
}: {
  readonly controller: ViewerController;
  readonly snapshot: ViewerControlSnapshot;
  readonly openFile: () => void;
  readonly generating: boolean;
  readonly generate: () => void;
}) {
  return (
    <PanelSection title="Walkability">
      <CheckboxField
        label="Show graph"
        checked={snapshot.walkabilityVisible}
        onChange={(value) => controller.setWalkabilityVisible(value)}
      />
      <NumberField
        label="Spacing"
        value={snapshot.walkabilitySpacing}
        min={8}
        max={128}
        step={1}
        dataAttribute="data-walkability-spacing"
        onCommit={(value) => controller.setField('walkabilitySpacing', value)}
      />
      <CheckboxField
        label="Probe jumps"
        checked={snapshot.walkabilityJump}
        onChange={(value) => controller.setField('walkabilityJump', value)}
      />
      <ReadonlyField
        label="Nodes"
        value={snapshot.walkabilityNodes}
        dataAttribute="data-walkability-nodes"
      />
      <ReadonlyField
        label="Status"
        value={snapshot.walkabilityStatus}
        dataAttribute="data-walkability-status"
      />
      <div className="viewer-button-grid">
        <button
          type="button"
          data-walkability-generate
          disabled={!snapshot.mapLoaded || snapshot.walkabilityGenerating || generating}
          onClick={generate}
        >
          Generate
        </button>
        <button
          type="button"
          data-walkability-download
          disabled={!snapshot.hasWalkability || snapshot.walkabilityGenerating}
          onClick={() => controller.downloadWalkability()}
        >
          Download sidecar
        </button>
        <button
          type="button"
          disabled={!snapshot.mapLoaded || snapshot.walkabilityGenerating}
          onClick={openFile}
        >
          Load sidecar
        </button>
        <button
          type="button"
          disabled={!snapshot.hasWalkability || snapshot.walkabilityGenerating}
          onClick={() => controller.clearWalkability()}
        >
          Clear
        </button>
      </div>
    </PanelSection>
  );
}

function DisplayControls({ controller, snapshot }: ControllerSnapshotProps) {
  return (
    <PanelSection title="Display">
      <CheckboxField
        label="Reticle"
        checked={snapshot.reticle}
        onChange={(value) => controller.setField('reticle', value)}
      />
      <ReadonlyField
        label="Warnings"
        value={snapshot.warnings}
        dataAttribute="data-warnings"
        multiline
      />
    </PanelSection>
  );
}

function OverviewControls({
  controller,
  snapshot,
  capturing,
  capture,
}: ControllerSnapshotProps & {
  readonly capturing: boolean;
  readonly capture: () => void;
}) {
  return (
    <PanelSection title="Overview">
      <Field label="Size">
        <select
          value={snapshot.overviewSize}
          onChange={(event) => controller.setField('overviewSize', event.currentTarget.value)}
        >
          <option value="512">512 × 512</option>
          <option value="1024">1024 × 1024</option>
          <option value="1024x768">1024 × 768</option>
          <option value="2048">2048 × 2048</option>
        </select>
      </Field>
      <Field label="Lighting">
        <select
          value={snapshot.overviewLighting}
          onChange={(event) =>
            controller.setField(
              'overviewLighting',
              event.currentTarget.value as ViewerControlSnapshot['overviewLighting'],
            )
          }
        >
          <option value="lightmapped">Lightmapped</option>
          <option value="fullbright">Fullbright</option>
        </select>
      </Field>
      <Field label="Rotation">
        <select
          value={snapshot.overviewRotation}
          onChange={(event) =>
            controller.setField(
              'overviewRotation',
              event.currentTarget.value as ViewerControlSnapshot['overviewRotation'],
            )
          }
        >
          <option value="auto">Auto</option>
          <option value="0">0°</option>
          <option value="90">90°</option>
        </select>
      </Field>
      <CheckboxField
        label="Auto cutaway"
        checked={snapshot.overviewCutaway}
        onChange={(value) => controller.setField('overviewCutaway', value)}
      />
      <NumberField
        label="Lower height"
        value={snapshot.overviewZMin}
        step={1}
        dataAttribute="data-overview-z-min"
        onCommit={(value) => controller.setField('overviewZMin', value)}
      />
      <NumberField
        label="Upper height"
        value={snapshot.overviewZMax}
        step={1}
        dataAttribute="data-overview-z-max"
        onCommit={(value) => controller.setField('overviewZMax', value)}
      />
      <CheckboxField
        label="Transparent"
        checked={snapshot.overviewTransparent}
        onChange={(value) => controller.setField('overviewTransparent', value)}
      />
      <ReadonlyField
        label="Export"
        value={snapshot.overviewStatus}
        dataAttribute="data-overview-status"
      />
      <button
        type="button"
        data-overview-download
        disabled={!snapshot.overviewEnabled || capturing}
        onClick={capture}
      >
        Download overview
      </button>
    </PanelSection>
  );
}

function AudioControls({
  controller,
  snapshot,
  enabling,
  enable,
  playing,
  play,
}: ControllerSnapshotProps & {
  readonly enabling: boolean;
  readonly enable: () => void;
  readonly playing: boolean;
  readonly play: () => void;
}) {
  return (
    <PanelSection title="Audio">
      <ReadonlyField label="State" value={snapshot.audioState} dataAttribute="data-audio-state" />
      <ReadonlyField label="Room" value={snapshot.roomType} dataAttribute="data-room-type" />
      <button type="button" data-enable-audio disabled={enabling} onClick={enable}>
        Enable sound
      </button>
      <CheckboxField
        label="Muted"
        checked={snapshot.audioMuted}
        onChange={(value) => controller.setAudioMuted(value)}
      />
      <NumberField
        label="Volume"
        value={snapshot.audioVolume}
        min={0}
        max={1}
        step={0.01}
        fractionDigits={2}
        onCommit={(value) => controller.setAudioVolume(value)}
      />
      <NumberField
        label="Footsteps"
        value={snapshot.playerAudioVolume}
        min={0}
        max={2}
        step={0.05}
        fractionDigits={2}
        dataAttribute="data-player-volume"
        onCommit={(value) => controller.setPlayerAudioVolume(value)}
      />
      <NumberField
        label="Music"
        value={snapshot.musicVolume}
        min={0}
        max={1}
        step={0.01}
        fractionDigits={2}
        onCommit={(value) => controller.setMusicVolume(value)}
      />
      <ReadonlyField
        label="Music state"
        value={snapshot.musicState}
        dataAttribute="data-music-state"
      />
      <Field label="Track">
        <select
          data-music-track
          value={snapshot.musicTrack}
          disabled={snapshot.musicOptions.length === 0}
          onChange={(event) => controller.setField('musicTrack', event.currentTarget.value)}
        >
          {snapshot.musicOptions.length === 0 ? <option value="">None</option> : null}
          {snapshot.musicOptions.map((option) => (
            <option key={option.entityIndex} value={option.label}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="viewer-button-grid">
        <button
          type="button"
          data-play-music
          disabled={snapshot.musicOptions.length === 0 || playing}
          onClick={play}
        >
          Play music
        </button>
        <button
          type="button"
          data-stop-music
          disabled={!snapshot.musicPlaying}
          onClick={() => controller.stopMusic()}
        >
          Stop music
        </button>
      </div>
    </PanelSection>
  );
}
