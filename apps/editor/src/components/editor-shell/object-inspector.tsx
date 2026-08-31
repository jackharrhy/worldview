import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import { Button } from '../ui/button.js';
import { Checkbox } from '../ui/checkbox.js';
import { IconButton } from '../ui/icon.js';
import { NumberField } from '../ui/number-field.js';
import { Select } from '../ui/select.js';
import { TextField } from '../ui/text-field.js';

import type { EntityPropertySnapshot } from '../../entity-inspector-state.js';
import type { EditorShellState } from '../../editor-shell-state.js';
import {
  BrushEntityActions,
  ClipToolSection,
  CsgSection,
  FaceExtrudeSection,
  FlipSection,
  GroupToolSection,
  HullToolSection,
  NudgeSection,
  SelectionBrushSection,
  TopologyToolSection,
  TransformToolSection,
} from './object-tool-controls.js';

interface EntityPropertyValueProps {
  readonly property: EntityPropertySnapshot;
  readonly shellState: EditorShellState;
}

function SimpleShapeTool({ shellState }: { readonly shellState: EditorShellState }) {
  const tool = useSyncExternalStore(
    shellState.simpleShapeTool.subscribe,
    shellState.simpleShapeTool.getSnapshot,
  );
  const { options } = tool;
  const circular = ['arch', 'cylinder', 'cone', 'uv-sphere'].includes(options.kind);
  const hollowable = options.kind === 'arch' || options.kind === 'cylinder';

  return (
    <div
      id="simple-shape-tool-section"
      className="simple-shape-tool-section inspector-section"
      hidden={!tool.visible}
    >
      <div className="section-heading">
        <h3>Simple shape</h3>
        <span id="simple-shape-result">{tool.result}</span>
      </div>
      <div className="simple-shape-primary">
        <Select
          id="simple-shape-kind"
          label="Shape"
          options={[
            { id: 'cuboid', label: 'Cuboid' },
            { id: 'stairs', label: 'Stairs' },
            { id: 'arch', label: 'Arch' },
            { id: 'cylinder', label: 'Cylinder' },
            { id: 'cone', label: 'Cone' },
            { id: 'uv-sphere', label: 'Spheroid (UV)' },
            { id: 'ico-sphere', label: 'Spheroid (Icosahedron)' },
          ]}
          selectedKey={options.kind}
          onSelectionChange={(key) => {
            const kind = String(key);
            if (
              kind === 'cuboid' ||
              kind === 'stairs' ||
              kind === 'arch' ||
              kind === 'cylinder' ||
              kind === 'cone' ||
              kind === 'uv-sphere' ||
              kind === 'ico-sphere'
            ) {
              shellState.simpleShapeTool.updateOptions({ kind });
            }
          }}
        />
        {circular ? (
          <Select
            id="simple-shape-axis"
            label="Axis"
            options={[
              { id: '0', label: 'X' },
              { id: '1', label: 'Y' },
              { id: '2', label: 'Z' },
            ]}
            selectedKey={String(options.axis)}
            onSelectionChange={(key) => {
              const axis = Number(key);
              if (axis === 0 || axis === 1 || axis === 2) {
                shellState.simpleShapeTool.updateOptions({ axis });
              }
            }}
          />
        ) : null}
      </div>
      {circular ? (
        <div id="simple-shape-circle-fields" className="simple-shape-fields">
          <NumberField
            id="simple-shape-sides"
            label="Sides"
            value={options.sides}
            minValue={3}
            maxValue={96}
            step={1}
            onChange={(sides) => shellState.simpleShapeTool.updateOptions({ sides })}
          />
          <Select
            id="simple-shape-circle-mode"
            label="Circle"
            options={[
              { id: 'edge-aligned', label: 'Edge aligned' },
              { id: 'vertex-aligned', label: 'Vertex aligned' },
              { id: 'scalable', label: 'Scalable grid' },
            ]}
            selectedKey={options.circleMode}
            onSelectionChange={(key) => {
              const circleMode = String(key);
              if (
                circleMode === 'edge-aligned' ||
                circleMode === 'vertex-aligned' ||
                circleMode === 'scalable'
              ) {
                shellState.simpleShapeTool.updateOptions({ circleMode });
              }
            }}
          />
        </div>
      ) : null}
      {hollowable ? (
        <div id="simple-shape-hollow-fields" className="simple-shape-fields">
          {options.kind === 'arch' ? null : (
            <Checkbox
              id="simple-shape-hollow"
              className="simple-shape-check"
              isSelected={options.hollow}
              onChange={(hollow) => shellState.simpleShapeTool.updateOptions({ hollow })}
            >
              Hollow
            </Checkbox>
          )}
          <NumberField
            id="simple-shape-thickness"
            label="Thickness"
            value={options.thickness}
            minValue={1}
            maxValue={1024}
            step={1}
            isDisabled={options.kind === 'cylinder' && !options.hollow}
            onChange={(thickness) => shellState.simpleShapeTool.updateOptions({ thickness })}
          />
        </div>
      ) : null}
      {options.kind === 'uv-sphere' ? (
        <div id="simple-shape-uv-fields" className="simple-shape-fields">
          <NumberField
            id="simple-shape-rings"
            label="Rings"
            value={options.rings}
            minValue={1}
            maxValue={32}
            step={1}
            onChange={(rings) => shellState.simpleShapeTool.updateOptions({ rings })}
          />
        </div>
      ) : null}
      {options.kind === 'ico-sphere' ? (
        <div id="simple-shape-ico-fields" className="simple-shape-fields">
          <NumberField
            id="simple-shape-accuracy"
            label="Accuracy"
            value={options.accuracy}
            minValue={1}
            maxValue={3}
            step={1}
            onChange={(accuracy) => shellState.simpleShapeTool.updateOptions({ accuracy })}
          />
        </div>
      ) : null}
      {options.kind === 'stairs' ? (
        <div id="simple-shape-stair-fields" className="simple-shape-fields">
          <NumberField
            id="simple-shape-step-height"
            label="Step height"
            value={options.stepHeight}
            minValue={1}
            maxValue={1024}
            step={1}
            onChange={(stepHeight) => shellState.simpleShapeTool.updateOptions({ stepHeight })}
          />
          <Select
            id="simple-shape-stair-direction"
            label="Direction"
            options={[
              { id: 'positive-x', label: '+X' },
              { id: 'negative-x', label: '−X' },
              { id: 'positive-y', label: '+Y' },
              { id: 'negative-y', label: '−Y' },
            ]}
            selectedKey={options.stairDirection}
            onSelectionChange={(key) => {
              const stairDirection = String(key);
              if (
                stairDirection === 'positive-x' ||
                stairDirection === 'negative-x' ||
                stairDirection === 'positive-y' ||
                stairDirection === 'negative-y'
              ) {
                shellState.simpleShapeTool.updateOptions({ stairDirection });
              }
            }}
          />
        </div>
      ) : null}
      <p>
        Drag in any viewport for a live preview. Shift makes the visible axes equal; Shift+Alt makes
        a cube in 3D. After starting a 3D drag, hold Alt to adjust only its height.
      </p>
    </div>
  );
}

function SweepTool({ shellState }: { readonly shellState: EditorShellState }) {
  const tool = useSyncExternalStore(
    shellState.sweepTool.subscribe,
    shellState.sweepTool.getSnapshot,
  );
  const updateVector = (
    field: 'translation' | 'rotationDegrees',
    axis: 0 | 1 | 2,
    value: number,
  ) => {
    if (!Number.isFinite(value)) return;
    const vector = [...tool.transform[field]] as [number, number, number];
    vector[axis] = value;
    shellState.sweepTool.setTransform({ ...tool.transform, [field]: vector });
  };
  const applyOnEnter = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    shellState.sweepTool.apply();
  };

  return (
    <div
      id="sweep-tool-section"
      className="sweep-tool-section inspector-section"
      hidden={!tool.visible}
    >
      <div className="section-heading">
        <h3>Sweep selected faces</h3>
        <span id="sweep-generated-count">{tool.generatedLabel}</span>
      </div>
      <h4>Destination translation</h4>
      <div className="transform-vector">
        {(['X', 'Y', 'Z'] as const).map((label, axis) => (
          <NumberField
            key={`translation-${label}`}
            id={`sweep-translate-${label.toLowerCase()}`}
            label={label}
            value={tool.transform.translation[axis]!}
            step={tool.gridSize}
            onChange={(value) => updateVector('translation', axis as 0 | 1 | 2, value)}
            input={{ onKeyDown: applyOnEnter }}
          />
        ))}
      </div>
      <h4>Destination rotation</h4>
      <div className="transform-vector">
        {(['X', 'Y', 'Z'] as const).map((label, axis) => (
          <NumberField
            key={`rotation-${label}`}
            id={`sweep-rotate-${label.toLowerCase()}`}
            label={label}
            value={tool.transform.rotationDegrees[axis]!}
            step={5}
            onChange={(value) => updateVector('rotationDegrees', axis as 0 | 1 | 2, value)}
            input={{ onKeyDown: applyOnEnter }}
          />
        ))}
      </div>
      <div className="sweep-shape-fields">
        <NumberField
          id="sweep-scale"
          label="Scale"
          value={tool.transform.scale}
          minValue={0.05}
          maxValue={20}
          step={0.05}
          onChange={(scale) => {
            if (Number.isFinite(scale)) {
              shellState.sweepTool.setTransform({ ...tool.transform, scale });
            }
          }}
          input={{ onKeyDown: applyOnEnter }}
        />
        <Select
          id="sweep-path"
          label="Path"
          options={[
            { id: 'straight', label: 'Straight' },
            { id: 'arc', label: 'Arc' },
            { id: 's-bend', label: 'S-bend' },
          ]}
          selectedKey={tool.options.path}
          onSelectionChange={(key) => {
            const path = String(key);
            if (path === 'straight' || path === 'arc' || path === 's-bend') {
              shellState.sweepTool.setOptions({ path });
            }
          }}
        />
        <NumberField
          id="sweep-segments"
          label="Segments"
          value={tool.options.segments}
          minValue={1}
          maxValue={128}
          step={1}
          onChange={(segments) => shellState.sweepTool.setOptions({ segments })}
          input={{ onKeyDown: applyOnEnter }}
        />
        <NumberField
          id="sweep-iterations"
          label="Iterations"
          value={tool.options.iterations}
          minValue={1}
          maxValue={64}
          step={1}
          onChange={(iterations) => shellState.sweepTool.setOptions({ iterations })}
          input={{ onKeyDown: applyOnEnter }}
        />
      </div>
      <Checkbox
        id="sweep-snap"
        className="sweep-snap-toggle"
        isSelected={tool.options.snapToInteger}
        onChange={(snapToInteger) => shellState.sweepTool.setOptions({ snapToInteger })}
      >
        Snap generated vertices to integers
      </Checkbox>
      <div className="sweep-actions">
        <Button type="button" size="compact" onPress={() => shellState.sweepTool.reset()}>
          Reset
        </Button>
        <Button
          type="button"
          size="compact"
          tone="primary"
          isDisabled={!tool.canApply}
          onPress={() => shellState.sweepTool.apply()}
        >
          Apply Sweep
        </Button>
      </div>
      <p>
        3D only: drag the yellow center to move (Alt for Z), colored rings to rotate, or the green
        handle to scale. Shift constrains movement or rotates in 5° steps. Enter applies; Escape
        resets, then exits.
      </p>
    </div>
  );
}

function PointEntityTool({ shellState }: { readonly shellState: EditorShellState }) {
  const tool = useSyncExternalStore(
    shellState.pointEntityTool.subscribe,
    shellState.pointEntityTool.getSnapshot,
  );
  return (
    <div
      id="point-entity-tool-section"
      className="point-entity-tool-section inspector-section"
      hidden={!tool.visible}
    >
      <div className="section-heading">
        <h3>Point entity</h3>
        <span>Click to place</span>
      </div>
      <Select
        id="point-entity-preset"
        label="Preset"
        options={tool.presets}
        selectedKey={tool.presets.some(({ id }) => id === tool.classname) ? tool.classname : null}
        onSelectionChange={(key) => shellState.pointEntityTool.setClassname(String(key))}
      />
      <TextField
        label="Classname"
        value={tool.classname}
        onChange={(classname) => shellState.pointEntityTool.setClassname(classname)}
        input={{ id: 'point-entity-classname', autoComplete: 'off', spellCheck: false }}
      />
      <p>
        Click a brush surface in 3D to drop the entity against it. In a 2D view, visible axes come
        from the click and the hidden axis follows the latest selection.
      </p>
    </div>
  );
}

function SelectionHeader({ shellState }: { readonly shellState: EditorShellState }) {
  const selection = useSyncExternalStore(
    shellState.selectionInspector.subscribe,
    shellState.selectionInspector.getSnapshot,
  );
  return (
    <>
      <div className="panel-heading">
        <h2>Selection</h2>
        <span id="selection-kind">{selection.kind}</span>
      </div>
      <div id="selection-empty" className="empty-selection" hidden={selection.visible}>
        Select a brush or face in any view.
      </div>
    </>
  );
}

function SelectionInspectorFrame({
  shellState,
  children,
}: {
  readonly shellState: EditorShellState;
  readonly children: ReactNode;
}) {
  const selection = useSyncExternalStore(
    shellState.selectionInspector.subscribe,
    shellState.selectionInspector.getSnapshot,
  );
  return (
    <div id="selection-inspector" hidden={!selection.visible}>
      <dl className="property-list">
        {[
          [selection.idLabel, selection.id, 'selection-id-label', 'brush-id'],
          [
            selection.revisionLabel,
            selection.revision,
            'selection-revision-label',
            'brush-revision',
          ],
          [selection.facesLabel, selection.faces, 'selection-faces-label', 'brush-faces'],
          ['Bounds', selection.bounds, '', 'brush-bounds'],
          [
            selection.materialLabel,
            selection.material,
            'selection-material-label',
            'face-material',
          ],
        ].map(([label, value, labelId, valueId]) => (
          <div key={valueId}>
            <dt {...(labelId ? { id: labelId } : {})}>{label}</dt>
            <dd id={valueId}>{value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}

function EntityPropertyValue({ property, shellState }: EntityPropertyValueProps) {
  const [draft, setDraft] = useState(property.value);
  useEffect(() => setDraft(property.value), [property.value]);
  const label = `${property.label} value`;

  if (property.control === 'choices') {
    return (
      <Select
        className="entity-property-value"
        label={label}
        hideLabel
        options={property.choices.map(({ value, label: choiceLabel }) => ({
          id: value,
          label: choiceLabel,
        }))}
        selectedKey={property.value}
        onSelectionChange={(key) =>
          shellState.entityInspector.setProperty(property.key, String(key))
        }
      />
    );
  }

  if (property.control === 'boolean') {
    const checked =
      property.value !== '0' && property.value.toLowerCase() !== 'false' && property.value !== '';
    return (
      <Checkbox
        className="entity-property-boolean"
        isSelected={checked}
        onChange={(selected) =>
          shellState.entityInspector.setProperty(property.key, selected ? '1' : '0')
        }
      >
        {label}
      </Checkbox>
    );
  }

  if (property.control === 'flags') {
    const selected = Number(property.value) || 0;
    return (
      <div className="entity-flags" role="group" aria-label={label}>
        {property.choices.flatMap((choice) => {
          const bit = Number(choice.value);
          if (!Number.isInteger(bit) || bit <= 0) return [];
          return [
            <Checkbox
              key={choice.value}
              isSelected={(selected & bit) === bit}
              onChange={(enabled) =>
                shellState.entityInspector.setProperty(
                  property.key,
                  String(enabled ? selected | bit : selected & ~bit),
                )
              }
            >
              {choice.label}
            </Checkbox>,
          ];
        })}
      </div>
    );
  }

  const commit = () => {
    if (draft !== property.value) shellState.entityInspector.setProperty(property.key, draft);
  };
  return (
    <TextField
      className="entity-property-value"
      label={label}
      hideLabel
      value={draft}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        commit();
        (event.target as HTMLElement).blur();
      }}
      input={{
        type: property.control === 'number' ? 'number' : 'text',
        ...(property.step === undefined ? {} : { step: property.step }),
        placeholder: property.placeholder,
        title: property.description || property.key,
        autoComplete: 'off',
        spellCheck: false,
      }}
    />
  );
}

interface EntityPropertiesSectionProps {
  readonly shellState: EditorShellState;
}

function EntityPropertiesSection({ shellState }: EntityPropertiesSectionProps) {
  const snapshot = useSyncExternalStore(
    shellState.entityInspector.subscribe,
    shellState.entityInspector.getSnapshot,
  );
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [protect, setProtect] = useState(false);
  const keyInput = useRef<HTMLInputElement>(null);

  const addProperty = () => {
    const propertyKey = key.trim();
    if (!propertyKey) {
      shellState.statusMessage.set('Enter an entity property key first.');
      keyInput.current?.focus();
      return;
    }
    shellState.entityInspector.setProperty(propertyKey, value, protect);
    setKey('');
    setValue('');
    setProtect(false);
    requestAnimationFrame(() => keyInput.current?.focus());
  };

  return (
    <div
      id="entity-section"
      className="entity-section inspector-section"
      hidden={!snapshot.visible}
    >
      <div className="section-heading">
        <h3>Properties</h3>
        <span id="entity-classname">{snapshot.classname}</span>
      </div>
      <BrushEntityActions shellState={shellState} />
      <div id="entity-properties" className="entity-properties">
        {snapshot.properties.map((property) => (
          <div className="entity-property-row" key={property.key}>
            <span
              title={
                property.description ? `${property.key}: ${property.description}` : property.key
              }
            >
              {property.label}
            </span>
            <EntityPropertyValue property={property} shellState={shellState} />
            {property.canProtect ? (
              <Checkbox
                className="entity-property-protection"
                isSelected={property.protected}
                onChange={(selected) =>
                  shellState.entityInspector.setPropertyProtected(property.key, selected)
                }
                aria-label={`Keep ${property.key} independent in this linked copy`}
              >
                <span className="visually-hidden">Independent</span>
              </Checkbox>
            ) : null}
            <IconButton
              icon="delete"
              label={
                property.removable ? `Remove ${property.key}` : 'Every map entity needs a classname'
              }
              isDisabled={!property.removable}
              onPress={() => shellState.entityInspector.setProperty(property.key, null)}
            />
          </div>
        ))}
      </div>
      <div className="entity-property-add">
        <TextField
          label="Property key"
          hideLabel
          value={key}
          onChange={setKey}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addProperty();
          }}
          inputRef={keyInput}
          input={{ id: 'entity-property-key', placeholder: 'Key', autoComplete: 'off' }}
        />
        <TextField
          label="Property value"
          hideLabel
          value={value}
          onChange={setValue}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addProperty();
          }}
          input={{ id: 'entity-property-value', placeholder: 'Value', autoComplete: 'off' }}
        />
        {snapshot.canAddProtectedProperty ? (
          <Checkbox
            id="entity-property-protected"
            className="entity-property-protected"
            isSelected={protect}
            onChange={setProtect}
          >
            Independent
          </Checkbox>
        ) : null}
        <Button
          type="button"
          size="compact"
          data-action="set-entity-property"
          onPress={addProperty}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

const objectInspector = (shellState: EditorShellState) => (
  <>
    <section>
      <SelectionHeader shellState={shellState} />
      <PointEntityTool shellState={shellState} />
      <SimpleShapeTool shellState={shellState} />
      <HullToolSection shellState={shellState} />
      <SelectionInspectorFrame shellState={shellState}>
        <EntityPropertiesSection shellState={shellState} />
        <GroupToolSection shellState={shellState} />
        <SelectionBrushSection shellState={shellState} />
        <FlipSection shellState={shellState} />
        <FaceExtrudeSection shellState={shellState} />
        <SweepTool shellState={shellState} />
        <ClipToolSection shellState={shellState} />
        <TransformToolSection shellState={shellState} />
        <TopologyToolSection shellState={shellState} />
        <CsgSection shellState={shellState} />
        <NudgeSection shellState={shellState} />
      </SelectionInspectorFrame>
    </section>
  </>
);

export function ObjectInspector({ shellState }: { readonly shellState: EditorShellState }) {
  return objectInspector(shellState);
}
