import { useEffect, useState, useSyncExternalStore, type Key } from 'react';

import type { EditorShellState } from '../../editor-shell-state.js';
import { Button } from '../ui/button.js';
import { Checkbox } from '../ui/checkbox.js';
import { NumberField } from '../ui/number-field.js';
import { Select } from '../ui/select.js';
import { TextField } from '../ui/text-field.js';

const AXIS_OPTIONS = [
  { id: '0', label: 'X' },
  { id: '1', label: 'Y' },
  { id: '2', label: 'Z' },
] as const;

function axisFromKey(key: Key | null): 0 | 1 | 2 | null {
  const axis = Number(key);
  return axis === 0 || axis === 1 || axis === 2 ? axis : null;
}

export function HullToolSection({ shellState }: { readonly shellState: EditorShellState }) {
  const { hull } = useSyncExternalStore(
    shellState.objectTools.subscribe,
    shellState.objectTools.getSnapshot,
  );
  return (
    <div
      id="hull-tool-section"
      className="hull-tool-section inspector-section"
      hidden={!hull.visible}
    >
      <div className="section-heading">
        <h3>Convex hull brush</h3>
        <span id="hull-point-count">
          {hull.pointCount} {hull.pointCount === 1 ? 'point' : 'points'}
        </span>
      </div>
      <div className="hull-actions">
        <Button
          type="button"
          size="compact"
          isDisabled={!hull.canCreate}
          onPress={() => shellState.objectTools.dispatch({ type: 'create-hull' })}
        >
          Create hull
        </Button>
        <Button
          type="button"
          size="compact"
          isDisabled={!hull.canDiscard}
          onPress={() => shellState.objectTools.dispatch({ type: 'discard-hull' })}
        >
          Discard points
        </Button>
      </div>
      <p>
        Perspective only: click a reference face for one point, double-click for all face vertices,
        or drag a rectangle. Shift-drag a placed polygon along its normal. Enter creates; Escape
        discards everything.
      </p>
    </div>
  );
}

export function BrushEntityActions({ shellState }: { readonly shellState: EditorShellState }) {
  const { brushEntity } = useSyncExternalStore(
    shellState.objectTools.subscribe,
    shellState.objectTools.getSnapshot,
  );
  const [classname, setClassname] = useState('func_detail');
  return (
    <div id="brush-entity-actions" className="brush-entity-actions" hidden={!brushEntity.visible}>
      <TextField
        label="Brush entity classname"
        hideLabel
        value={classname}
        onChange={setClassname}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !classname.trim()) return;
          event.preventDefault();
          shellState.objectTools.dispatch({ type: 'make-brush-entity', classname });
        }}
        input={{
          id: 'brush-entity-classname',
          placeholder: 'func_detail',
          autoComplete: 'off',
          spellCheck: false,
        }}
      />
      <Button
        type="button"
        size="compact"
        isDisabled={!classname.trim()}
        onPress={() => shellState.objectTools.dispatch({ type: 'make-brush-entity', classname })}
      >
        Make Entity
      </Button>
      <Button
        type="button"
        size="compact"
        isDisabled={!brushEntity.canMakeStructural}
        onPress={() => shellState.objectTools.dispatch({ type: 'make-structural' })}
      >
        Make Structural
      </Button>
    </div>
  );
}

export function GroupToolSection({ shellState }: { readonly shellState: EditorShellState }) {
  const { group } = useSyncExternalStore(
    shellState.objectTools.subscribe,
    shellState.objectTools.getSnapshot,
  );
  const [name, setName] = useState(group.name);
  useEffect(() => setName(group.name), [group.name]);
  const submit = () => {
    if (group.canRename) shellState.objectTools.dispatch({ type: 'rename-group', name });
    else shellState.objectTools.dispatch({ type: 'create-group', name });
  };
  return (
    <div id="group-section" className="group-section inspector-section" hidden={!group.visible}>
      <div className="section-heading">
        <h3>Group</h3>
        <span id="group-state">{group.stateLabel}</span>
      </div>
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          submit();
        }}
        input={{ id: 'group-name', autoComplete: 'off', spellCheck: false }}
      />
      <div className="group-actions">
        {group.canCreate ? (
          <Button type="button" size="compact" onPress={() => submit()}>
            Group selection
          </Button>
        ) : null}
        {group.canRename ? (
          <Button type="button" size="compact" onPress={() => submit()}>
            Rename
          </Button>
        ) : null}
        {group.canOpen ? (
          <Button
            type="button"
            size="compact"
            onPress={() => shellState.objectTools.dispatch({ type: 'open-group' })}
          >
            Open
          </Button>
        ) : null}
        {group.canClose ? (
          <Button
            type="button"
            size="compact"
            onPress={() => shellState.objectTools.dispatch({ type: 'close-group' })}
          >
            Close
          </Button>
        ) : null}
        {group.canDuplicateLinked ? (
          <Button
            type="button"
            size="compact"
            onPress={() => shellState.objectTools.dispatch({ type: 'duplicate-linked-group' })}
          >
            Linked duplicate
          </Button>
        ) : null}
        {group.canUnlink ? (
          <Button
            type="button"
            size="compact"
            onPress={() => shellState.objectTools.dispatch({ type: 'unlink-group' })}
          >
            Unlink
          </Button>
        ) : null}
        {group.canUngroup ? (
          <Button
            type="button"
            size="compact"
            onPress={() => shellState.objectTools.dispatch({ type: 'ungroup' })}
          >
            Ungroup
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function SelectionBrushSection({ shellState }: { readonly shellState: EditorShellState }) {
  const { selectionBrush } = useSyncExternalStore(
    shellState.objectTools.subscribe,
    shellState.objectTools.getSnapshot,
  );
  return (
    <div
      id="selection-brush-section"
      className="selection-brush-section inspector-section"
      hidden={!selectionBrush.visible}
    >
      <div className="section-heading">
        <h3>Selection brush</h3>
        <span id="selection-brush-count">{selectionBrush.countLabel}</span>
      </div>
      <div className="selection-brush-actions">
        {[
          ['touching', 'Touching'],
          ['inside', 'Enclosed'],
          ['inside-projected', 'Enclosed in 2D'],
        ].map(([mode, label]) => (
          <Button
            key={mode}
            type="button"
            size="compact"
            onPress={() =>
              shellState.objectTools.dispatch({
                type: 'selection-query',
                mode: mode as 'touching' | 'inside' | 'inside-projected',
              })
            }
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function FlipSection({ shellState }: { readonly shellState: EditorShellState }) {
  const { flipVisible } = useSyncExternalStore(
    shellState.objectTools.subscribe,
    shellState.objectTools.getSnapshot,
  );
  return (
    <div
      id="object-flip-section"
      className="object-flip-section inspector-section"
      hidden={!flipVisible}
    >
      <div className="section-heading">
        <h3>Mirror selection</h3>
        <span>Snapped center</span>
      </div>
      <div
        className="object-flip-controls"
        role="group"
        aria-label="Mirror selection by world axis"
      >
        {(['X', 'Y', 'Z'] as const).map((label, axis) => (
          <Button
            key={label}
            type="button"
            size="compact"
            onPress={() =>
              shellState.objectTools.dispatch({ type: 'flip', axis: axis as 0 | 1 | 2 })
            }
          >
            Flip {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function FaceExtrudeSection({ shellState }: { readonly shellState: EditorShellState }) {
  const { faceExtrude } = useSyncExternalStore(
    shellState.objectTools.subscribe,
    shellState.objectTools.getSnapshot,
  );
  const selection = useSyncExternalStore(
    shellState.selectionInspector.subscribe,
    shellState.selectionInspector.getSnapshot,
  );
  const invoke = (operation: 'inward' | 'outward' | 'exact' | 'split' | 'stamp') =>
    shellState.objectTools.dispatch({
      type: 'face-extrude',
      operation,
      distance: faceExtrude.distance,
    });
  return (
    <div
      id="face-extrude-section"
      className="face-extrude-section inspector-section"
      hidden={!faceExtrude.visible}
    >
      <div className="section-heading">
        <h3>Face extrusion</h3>
        <span id="face-normal">{selection.faceNormal}</span>
      </div>
      <div className="face-extrude-controls">
        <NumberField
          id="face-extrude-distance"
          label="Face extrusion distance"
          value={faceExtrude.distance}
          step={faceExtrude.step}
          onChange={(distance) => shellState.objectTools.updateFaceExtrude({ distance })}
          input={{ 'aria-label': 'Face extrusion distance' }}
        />
        {(['inward', 'outward', 'exact', 'split', 'stamp'] as const).map((operation) => (
          <Button key={operation} type="button" size="compact" onPress={() => invoke(operation)}>
            {operation === 'exact'
              ? 'Apply'
              : `${operation[0]!.toUpperCase()}${operation.slice(1)}`}
          </Button>
        ))}
      </div>
      <p>
        In Face, drag the center handle or use Arrow keys on the pointed viewport; Escape clears
        face handles before leaving the tool. In Select, Shift-drag a face of an already selected
        brush. Add Alt to move on the viewport plane, Ctrl/Command to split, or both to stamp.
      </p>
    </div>
  );
}

export function ClipToolSection({ shellState }: { readonly shellState: EditorShellState }) {
  const { clip } = useSyncExternalStore(
    shellState.objectTools.subscribe,
    shellState.objectTools.getSnapshot,
  );
  return (
    <div
      id="clip-tool-section"
      className="clip-tool-section inspector-section"
      hidden={!clip.visible}
    >
      <div className="section-heading">
        <h3>Clip plane</h3>
        <span id="clip-point-count">{clip.pointCountLabel}</span>
      </div>
      <p id="clip-point-positions">{clip.pointPositions}</p>
      <div className="clip-mode-controls" role="group" aria-label="Clip result">
        {[
          ['back', 'Keep back'],
          ['split', 'Split'],
          ['front', 'Keep front'],
        ].map(([mode, label]) => (
          <Button
            key={mode}
            type="button"
            size="compact"
            className={clip.mode === mode ? 'active' : ''}
            aria-pressed={clip.mode === mode}
            onPress={() =>
              shellState.objectTools.dispatch({
                type: 'set-clip-mode',
                mode: mode as 'back' | 'split' | 'front',
              })
            }
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="clip-actions">
        <Button
          type="button"
          size="compact"
          tone="primary"
          isDisabled={!clip.canApply}
          onPress={() => shellState.objectTools.dispatch({ type: 'apply-clip' })}
        >
          Apply clip
        </Button>
        <Button
          type="button"
          size="compact"
          onPress={() => shellState.objectTools.dispatch({ type: 'reset-clip' })}
        >
          Reset points
        </Button>
      </div>
      <p>
        Click two or three snapped points in any viewport. Drag to place two points or reposition an
        orange point; Shift locks its dominant axis in 2D. Double-click a face to match its plane.
      </p>
    </div>
  );
}

export function TransformToolSection({ shellState }: { readonly shellState: EditorShellState }) {
  const { transform } = useSyncExternalStore(
    shellState.objectTools.subscribe,
    shellState.objectTools.getSnapshot,
  );
  const { settings } = transform;
  const updateVector = (field: 'pivot' | 'scale', axis: 0 | 1 | 2, value: number) => {
    if (!Number.isFinite(value)) return;
    const vector = [...settings[field]] as [number, number, number];
    vector[axis] = value;
    if (field === 'pivot') {
      shellState.objectTools.dispatch({ type: 'set-transform-pivot', pivot: vector });
    } else {
      shellState.objectTools.updateTransformSettings({ scale: vector });
    }
  };
  return (
    <div
      id="transform-tool-section"
      className="transform-tool-section inspector-section"
      hidden={!transform.visible}
    >
      <div className="section-heading">
        <h3 id="transform-tool-title">{transform.title}</h3>
        <Button
          type="button"
          size="compact"
          onPress={() => shellState.objectTools.dispatch({ type: 'reset-transform-pivot' })}
        >
          Reset pivot
        </Button>
      </div>
      <div className="transform-vector transform-pivot">
        {(['X', 'Y', 'Z'] as const).map((label, axis) => (
          <NumberField
            key={label}
            id={`transform-pivot-${label.toLowerCase()}`}
            label={label}
            value={settings.pivot[axis]!}
            step={1}
            onChange={(value) => updateVector('pivot', axis as 0 | 1 | 2, value)}
          />
        ))}
      </div>
      {transform.tool === 'rotate' ? (
        <div data-transform-panel="rotate">
          <div className="transform-fields">
            <Select
              id="rotate-axis"
              label="Axis"
              options={AXIS_OPTIONS}
              selectedKey={String(settings.rotateAxis)}
              onSelectionChange={(key) => {
                const rotateAxis = axisFromKey(key);
                if (rotateAxis !== null)
                  shellState.objectTools.updateTransformSettings({ rotateAxis });
              }}
            />
            <NumberField
              id="rotate-angle"
              label="Angle"
              value={settings.rotateAngle}
              step={5}
              onChange={(rotateAngle) =>
                shellState.objectTools.updateTransformSettings({ rotateAngle })
              }
            />
          </div>
          <Checkbox
            id="rotate-update-entity-angles"
            className="transform-angle-toggle"
            isSelected={settings.updateEntityAngles}
            isDisabled={!settings.canUpdateEntityAngles}
            onChange={(updateEntityAngles) =>
              shellState.objectTools.updateTransformSettings({ updateEntityAngles })
            }
          >
            Update entity angles
          </Checkbox>
        </div>
      ) : null}
      {transform.tool === 'scale' ? (
        <div data-transform-panel="scale">
          <div className="transform-vector">
            {(['X', 'Y', 'Z'] as const).map((label, axis) => (
              <NumberField
                key={label}
                id={`scale-${label.toLowerCase()}`}
                label={label}
                value={settings.scale[axis]!}
                step={0.05}
                onChange={(value) => updateVector('scale', axis as 0 | 1 | 2, value)}
              />
            ))}
          </div>
        </div>
      ) : null}
      {transform.tool === 'shear' ? (
        <div data-transform-panel="shear">
          <div className="transform-fields transform-shear-fields">
            <Select
              id="shear-source-axis"
              label="Plane axis"
              options={AXIS_OPTIONS}
              selectedKey={String(settings.shearSourceAxis)}
              onSelectionChange={(key) => {
                const shearSourceAxis = axisFromKey(key);
                if (shearSourceAxis !== null) {
                  shellState.objectTools.updateTransformSettings({ shearSourceAxis });
                }
              }}
            />
            <Select
              id="shear-target-axis"
              label="Move axis"
              options={AXIS_OPTIONS}
              selectedKey={String(settings.shearTargetAxis)}
              onSelectionChange={(key) => {
                const shearTargetAxis = axisFromKey(key);
                if (shearTargetAxis !== null) {
                  shellState.objectTools.updateTransformSettings({ shearTargetAxis });
                }
              }}
            />
            <NumberField
              id="shear-offset"
              label="Offset"
              value={settings.shearOffset}
              step={shellState.toolSettings.getSnapshot().gridSize}
              onChange={(shearOffset) =>
                shellState.objectTools.updateTransformSettings({ shearOffset })
              }
            />
          </div>
        </div>
      ) : null}
      <Button
        type="button"
        size="compact"
        tone="primary"
        className="transform-apply"
        onPress={() => shellState.objectTools.dispatch({ type: 'apply-transform' })}
      >
        Apply transform
      </Button>
      <p id="transform-tool-help">{transform.help}</p>
    </div>
  );
}

export function TopologyToolSection({ shellState }: { readonly shellState: EditorShellState }) {
  const { topology } = useSyncExternalStore(
    shellState.objectTools.subscribe,
    shellState.objectTools.getSnapshot,
  );
  return (
    <div
      id="topology-tool-section"
      className="topology-tool-section inspector-section"
      hidden={!topology.visible}
    >
      <div className="section-heading">
        <h3 id="topology-tool-title">{topology.title}</h3>
        <span>
          <b id="topology-selection-count">{topology.selectionCount}</b> selected · Grid{' '}
          <b id="topology-grid-size">{topology.gridSize}</b>
        </span>
      </div>
      <p id="topology-tool-help">
        Click or lasso yellow handles across the selected brushes. Ctrl/Command adds handles or
        toggles absolute vertex snapping during a drag. Shift+Alt-click another vertex to quick-snap
        the selection; Arrow keys nudge it on the active viewport axes. In 3D, Alt moves vertically
        and Shift locks the dominant axis. Shift-drag a green surface handle to add a vertex. Delete
        remains hull-safe; Escape clears handles before leaving the tool.
      </p>
    </div>
  );
}

export function CsgSection({ shellState }: { readonly shellState: EditorShellState }) {
  const { csg } = useSyncExternalStore(
    shellState.objectTools.subscribe,
    shellState.objectTools.getSnapshot,
  );
  return (
    <div id="csg-section" className="csg-section inspector-section" hidden={!csg.visible}>
      <div className="section-heading">
        <h3>Constructive geometry</h3>
        <span id="csg-selection-count">{csg.selectionCountLabel}</span>
      </div>
      <div className="csg-controls">
        {[
          ['merge', 'Convex merge', !csg.canMerge],
          ['intersect', 'Intersect', !csg.canIntersect],
          ['subtract', 'Subtract', false],
          ['hollow', 'Hollow', false],
        ].map(([operation, label, disabled]) => (
          <Button
            key={String(operation)}
            type="button"
            size="compact"
            isDisabled={Boolean(disabled)}
            onPress={() =>
              shellState.objectTools.dispatch({
                type: 'csg',
                operation: operation as 'merge' | 'intersect' | 'subtract' | 'hollow',
              })
            }
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function NudgeSection({ shellState }: { readonly shellState: EditorShellState }) {
  const { nudgeVisible } = useSyncExternalStore(
    shellState.objectTools.subscribe,
    shellState.objectTools.getSnapshot,
  );
  if (!nudgeVisible) return null;
  return (
    <div className="transform-section inspector-section">
      <h3>Grid nudge</h3>
      <div className="nudge-grid">
        {(['X', 'Y', 'Z'] as const).flatMap((label, axis) => [
          <span key={`${label}-label`}>{label}</span>,
          <Button
            key={`${label}-negative`}
            type="button"
            size="compact"
            aria-label={`Nudge ${label} negative`}
            onPress={() =>
              shellState.objectTools.dispatch({
                type: 'nudge',
                axis: axis as 0 | 1 | 2,
                direction: -1,
              })
            }
          >
            −
          </Button>,
          <Button
            key={`${label}-positive`}
            type="button"
            size="compact"
            aria-label={`Nudge ${label} positive`}
            onPress={() =>
              shellState.objectTools.dispatch({
                type: 'nudge',
                axis: axis as 0 | 1 | 2,
                direction: 1,
              })
            }
          >
            +
          </Button>,
        ])}
      </div>
    </div>
  );
}
