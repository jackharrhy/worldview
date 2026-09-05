import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { MenuTrigger } from 'react-aria-components/Menu';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import type {
  EditorMaterial,
  FaceTextureAlignmentOperation,
  FaceTextureProjectionField,
} from '@jackharrhy/worldview-editor/core';

import type {
  EditorShellState,
  FaceInspectorSnapshot,
  MaterialBrowserSnapshot,
  SurfaceFlagControl,
} from '../../editor-shell-state.js';
import { Button } from '../ui/button.js';
import { Checkbox } from '../ui/checkbox.js';
import { Dialog } from '../ui/dialog.js';
import { Icon, IconButton, type IconName } from '../ui/icon.js';
import { Menu, MenuItem, Popover } from '../ui/menu.js';
import { NumberField } from '../ui/number-field.js';
import { Select } from '../ui/select.js';
import { TextField } from '../ui/text-field.js';

const FACE_SPLIT_STORAGE_KEY = 'worldview.face-inspector.upper-height';
const DEFAULT_FACE_UPPER_HEIGHT = 590;
const MINIMUM_FACE_UPPER_HEIGHT = 300;
const MINIMUM_MATERIAL_HEIGHT = 190;
const FACE_SPLITTER_HEIGHT = 5;
const PROJECTION_FIELD_INPUT_IDS: Record<FaceTextureProjectionField, string> = {
  'offset-u': 'texture-shift-u',
  'offset-v': 'texture-shift-v',
  'scale-u': 'texture-scale-u',
  'scale-v': 'texture-scale-v',
  rotation: 'texture-rotation',
};

function storedFaceUpperHeight(): number {
  try {
    const stored = localStorage.getItem(FACE_SPLIT_STORAGE_KEY);
    if (stored === null) return DEFAULT_FACE_UPPER_HEIGHT;
    const parsed = Number(stored);
    return Number.isFinite(parsed)
      ? Math.max(MINIMUM_FACE_UPPER_HEIGHT, Math.min(1200, parsed))
      : DEFAULT_FACE_UPPER_HEIGHT;
  } catch {
    return DEFAULT_FACE_UPPER_HEIGHT;
  }
}

function persistFaceUpperHeight(height: number): void {
  try {
    localStorage.setItem(FACE_SPLIT_STORAGE_KEY, String(height));
  } catch {
    // The splitter remains functional when machine-local storage is unavailable.
  }
}

interface ProjectionFieldProps {
  readonly label: string;
  readonly field: FaceTextureProjectionField;
  readonly value: number | null;
  readonly step: number;
  readonly disabled: boolean;
  readonly shellState: EditorShellState;
}

function ProjectionField({
  label,
  field,
  value,
  step,
  disabled,
  shellState,
}: ProjectionFieldProps) {
  const draft = useRef(value);
  useEffect(() => {
    draft.current = value;
  }, [value]);
  const commit = () => {
    const next = draft.current;
    if (next === null || !Number.isFinite(next) || next === value) return;
    shellState.faceInspector.commands?.setProjectionField(field, next);
  };
  return (
    <NumberField
      key={`${field}:${value ?? 'mixed'}`}
      className="face-projection-field"
      label={label}
      step={step}
      isDisabled={disabled}
      {...(value === null ? {} : { defaultValue: value })}
      input={{
        id: PROJECTION_FIELD_INPUT_IDS[field],
        ...(value === null ? { placeholder: 'Mixed' } : {}),
        onChange: (event) => {
          const next = Number(event.currentTarget.value);
          draft.current = Number.isFinite(next) ? next : null;
        },
      }}
      onChange={(next) => {
        draft.current = next;
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        commit();
        (event.currentTarget as HTMLElement).querySelector('input')?.blur();
      }}
    />
  );
}

interface FaceCommand {
  readonly operation: FaceTextureAlignmentOperation;
  readonly icon: IconName;
  readonly label: string;
}

const projectionCommands: readonly FaceCommand[] = [
  { operation: 'reset', icon: 'reset-face', label: 'Reset face projection' },
  { operation: 'world', icon: 'reset-world', label: 'Align projection to world axes' },
  { operation: 'flip-u', icon: 'flip-horizontal', label: 'Flip horizontally' },
  { operation: 'flip-v', icon: 'flip-vertical', label: 'Flip vertically' },
  { operation: 'rotate-ccw', icon: 'rotate-counter-clockwise', label: 'Rotate 90° left' },
  { operation: 'rotate-cw', icon: 'rotate-clockwise', label: 'Rotate 90° right' },
];

const boundsCommands: readonly FaceCommand[] = [
  { operation: 'justify-v-min', icon: 'align-top', label: 'Align to top edge' },
  { operation: 'justify-u-min', icon: 'align-left', label: 'Align to left edge' },
  { operation: 'auto-fit', icon: 'align-center', label: 'Fit to face' },
  { operation: 'justify-u-max', icon: 'align-right', label: 'Align to right edge' },
  { operation: 'justify-v-max', icon: 'align-bottom', label: 'Align to bottom edge' },
  { operation: 'align-edge', icon: 'align-edge', label: 'Align to selected edge' },
  { operation: 'fit-u', icon: 'fit-horizontal', label: 'Fit horizontally' },
  { operation: 'fit-v', icon: 'fit-vertical', label: 'Fit vertically' },
];

function FaceCommandGroup({
  label,
  commands,
  disabled,
  shellState,
}: {
  readonly label: string;
  readonly commands: readonly FaceCommand[];
  readonly disabled: boolean;
  readonly shellState: EditorShellState;
}) {
  return (
    <div className="face-icon-group" role="group" aria-label={label}>
      {commands.map((command) => (
        <IconButton
          key={command.operation}
          icon={command.icon}
          label={command.label}
          isDisabled={disabled}
          data-texture-operation={command.operation}
          onPress={(event) =>
            shellState.faceInspector.commands?.align(command.operation, {
              reverse: event.shiftKey,
              subdivide: event.ctrlKey || event.metaKey,
            })
          }
        />
      ))}
    </div>
  );
}

function UvToolbar({
  snapshot,
  shellState,
}: {
  readonly snapshot: FaceInspectorSnapshot;
  readonly shellState: EditorShellState;
}) {
  return (
    <div className="uv-toolbar">
      <div className="face-icon-group" role="group" aria-label="UV view">
        <IconButton
          icon="frame-uv"
          label="Frame selected face"
          isDisabled={snapshot.mode !== 'single'}
          onPress={() => shellState.faceInspector.commands?.frameUvSelection()}
        />
        <IconButton
          icon="align-center"
          label="Reset UV origin"
          isDisabled={snapshot.mode !== 'single'}
          onPress={() => shellState.faceInspector.commands?.resetUvPivot()}
        />
      </div>
      <div className="uv-grid-fields" aria-label="UV grid subdivisions">
        <NumberField
          label="Grid X"
          value={snapshot.uvGrid[0]}
          minValue={1}
          maxValue={16}
          step={1}
          onChange={(value) => shellState.faceInspector.commands?.setUvGrid(0, value)}
          input={{ id: 'uv-grid-x', 'aria-label': 'UV grid X subdivisions' }}
        />
        <NumberField
          label="Y"
          value={snapshot.uvGrid[1]}
          minValue={1}
          maxValue={16}
          step={1}
          onChange={(value) => shellState.faceInspector.commands?.setUvGrid(1, value)}
          input={{ id: 'uv-grid-y', 'aria-label': 'UV grid Y subdivisions' }}
        />
      </div>
    </div>
  );
}

function FlagCheckbox({
  field,
  flag,
  shellState,
}: {
  readonly field: 'contents' | 'flags';
  readonly flag: SurfaceFlagControl;
  readonly shellState: EditorShellState;
}) {
  return (
    <Checkbox
      isSelected={flag.checked}
      isIndeterminate={flag.mixed}
      onChange={(selected) =>
        shellState.surfaceInspector.commands?.setFlag(field, flag.value, selected)
      }
    >
      {flag.label}
    </Checkbox>
  );
}

function SurfaceValueField({
  value,
  mixed,
  label,
  shellState,
}: {
  readonly value: string;
  readonly mixed: boolean;
  readonly label: string;
  readonly shellState: EditorShellState;
}) {
  const parsed = Number(value);
  const initialValue = value.trim() && Number.isFinite(parsed) ? parsed : null;
  const draft = useRef(initialValue);
  const commit = () => {
    const next = draft.current;
    if (next === null || !Number.isFinite(next) || next === initialValue) return;
    shellState.surfaceInspector.commands?.setValue(next);
  };
  return (
    <NumberField
      key={`${value}:${mixed}`}
      label={label}
      step={1}
      {...(initialValue === null ? {} : { defaultValue: initialValue })}
      input={{
        ...(mixed ? { placeholder: 'Mixed' } : {}),
        onChange: (event) => {
          const next = Number(event.currentTarget.value);
          draft.current = Number.isFinite(next) ? next : null;
        },
      }}
      onChange={(next) => {
        draft.current = next;
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        commit();
        (event.currentTarget as HTMLElement).querySelector('input')?.blur();
      }}
    />
  );
}

function SurfaceInspector({ shellState }: { readonly shellState: EditorShellState }) {
  const snapshot = useSyncExternalStore(
    shellState.surfaceInspector.subscribe,
    shellState.surfaceInspector.getSnapshot,
    shellState.surfaceInspector.getSnapshot,
  );
  if (!snapshot.visible) return null;
  return (
    <details className="surface-attributes">
      <summary>Quake II surface</summary>
      <fieldset>
        <legend>Contents</legend>
        <div className="surface-flag-grid">
          {snapshot.contents.map((flag) => (
            <FlagCheckbox key={flag.name} field="contents" flag={flag} shellState={shellState} />
          ))}
        </div>
        {snapshot.unknownContents ? <p>Unknown bits: {snapshot.unknownContents}</p> : null}
      </fieldset>
      <fieldset>
        <legend>Surface flags</legend>
        <div className="surface-flag-grid">
          {snapshot.flags.map((flag) => (
            <FlagCheckbox key={flag.name} field="flags" flag={flag} shellState={shellState} />
          ))}
        </div>
        {snapshot.unknownFlags ? <p>Unknown bits: {snapshot.unknownFlags}</p> : null}
      </fieldset>
      <SurfaceValueField
        label={snapshot.valueLabel}
        value={snapshot.value}
        mixed={snapshot.valueMixed}
        shellState={shellState}
      />
    </details>
  );
}

function FaceAttributes({ shellState }: { readonly shellState: EditorShellState }) {
  const snapshot = useSyncExternalStore(
    shellState.faceInspector.subscribe,
    shellState.faceInspector.getSnapshot,
    shellState.faceInspector.getSnapshot,
  );
  const selectionLabel = snapshot.mode === 'none' ? 'No face selected' : snapshot.material;
  const materialSize = snapshot.materialSize
    ? `${snapshot.materialSize[0]} × ${snapshot.materialSize[1]}`
    : '';
  const detailLabel =
    snapshot.mode === 'multiple'
      ? `${snapshot.selectedFaceCount} faces${materialSize ? ` · ${materialSize}` : ''}`
      : materialSize;
  return (
    <div className="face-attributes-pane">
      <header className="face-summary" data-mixed={snapshot.materialMixed || undefined}>
        <strong>{selectionLabel}</strong>
        {detailLabel ? <span>{detailLabel}</span> : null}
      </header>
      <div className="uv-editor-frame">
        <svg
          id="uv-editor"
          viewBox="0 0 320 220"
          role="application"
          aria-label="Selected face UV editor"
          tabIndex={0}
        />
      </div>
      <div className="uv-editor-status" aria-live="polite">
        <span id="uv-editor-status">{snapshot.uvStatus}</span>
        <span>Drag changes offset. Middle or right drag pans. Wheel zooms.</span>
      </div>
      <UvToolbar snapshot={snapshot} shellState={shellState} />
      <div className="face-projection-grid">
        <ProjectionField
          label="X offset"
          field="offset-u"
          value={snapshot.offset[0]}
          step={1}
          disabled={!snapshot.canEditProjection}
          shellState={shellState}
        />
        <ProjectionField
          label="Y offset"
          field="offset-v"
          value={snapshot.offset[1]}
          step={1}
          disabled={!snapshot.canEditProjection}
          shellState={shellState}
        />
        <ProjectionField
          label="X scale"
          field="scale-u"
          value={snapshot.scale[0]}
          step={0.05}
          disabled={!snapshot.canEditProjection}
          shellState={shellState}
        />
        <ProjectionField
          label="Y scale"
          field="scale-v"
          value={snapshot.scale[1]}
          step={0.05}
          disabled={!snapshot.canEditProjection}
          shellState={shellState}
        />
        <ProjectionField
          label="Angle"
          field="rotation"
          value={snapshot.rotationDegrees}
          step={1}
          disabled={!snapshot.canEditProjection}
          shellState={shellState}
        />
      </div>
      <div className="face-command-row">
        <FaceCommandGroup
          label="Projection alignment"
          commands={projectionCommands}
          disabled={!snapshot.canAlign}
          shellState={shellState}
        />
        <FaceCommandGroup
          label="Face bounds alignment"
          commands={boundsCommands}
          disabled={!snapshot.canAlign}
          shellState={shellState}
        />
      </div>
      <details className="face-axis-details">
        <summary>Projection axes</summary>
        <dl className="texture-axes">
          <div>
            <dt>U axis</dt>
            <dd>{snapshot.uAxis || 'No face selected'}</dd>
          </div>
          <div>
            <dt>V axis</dt>
            <dd>{snapshot.vAxis || 'No face selected'}</dd>
          </div>
        </dl>
      </details>
      <SurfaceInspector shellState={shellState} />
    </div>
  );
}

function MaterialThumbnail({ material }: { readonly material: EditorMaterial }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    context?.putImageData(
      new ImageData(new Uint8ClampedArray(material.rgba), material.width, material.height),
      0,
      0,
    );
  }, [material]);
  return <canvas ref={canvas} width={material.width} height={material.height} aria-hidden="true" />;
}

function MaterialGrid({
  snapshot,
  shellState,
}: {
  readonly snapshot: MaterialBrowserSnapshot;
  readonly shellState: EditorShellState;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const [focusedMaterial, setFocusedMaterial] = useState<string | null>(null);
  const columns = 3;
  const focusedIndex =
    focusedMaterial === null
      ? -1
      : snapshot.cells.findIndex((cell) => cell.material.name === focusedMaterial);
  const focusedRow = focusedIndex < 0 ? -1 : Math.floor(focusedIndex / columns);
  const virtualizer = useVirtualizer({
    count: Math.ceil(snapshot.cells.length / columns),
    getScrollElement: () => scroll.current,
    estimateSize: () => 104,
    overscan: 3,
    rangeExtractor: (range) => {
      const rows = defaultRangeExtractor(range);
      return focusedRow < 0 || rows.includes(focusedRow)
        ? rows
        : [...rows, focusedRow].toSorted((left, right) => left - right);
    },
  });
  useEffect(() => {
    if (snapshot.revealVersion === 0) return;
    const index = snapshot.cells.findIndex(
      (cell) => cell.material.name.toLowerCase() === snapshot.activeMaterial.toLowerCase(),
    );
    if (index < 0) return;
    setFocusedMaterial(snapshot.cells[index]!.material.name);
    virtualizer.scrollToIndex(Math.floor(index / columns), { align: 'auto' });
  }, [snapshot.revealVersion, snapshot.activeMaterial, snapshot.cells, virtualizer]);
  return (
    <div ref={scroll} id="material-grid" className="material-grid" aria-label="Loaded materials">
      {snapshot.cells.length === 0 ? (
        <p className="material-empty">No materials match this view.</p>
      ) : (
        <div className="material-virtual-space" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              className="material-virtual-row"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {snapshot.cells
                .slice(virtualRow.index * columns, virtualRow.index * columns + columns)
                .map((cell) => {
                  const { material } = cell;
                  const usage = cell.inUse
                    ? `${cell.faceCount} ${cell.faceCount === 1 ? 'face' : 'faces'} in ${cell.brushCount} ${cell.brushCount === 1 ? 'brush' : 'brushes'}`
                    : 'Unused';
                  return (
                    <Button
                      key={material.name.toLowerCase()}
                      className={`material-tile${cell.active ? ' active' : ''}${cell.inUse ? ' in-use' : ''}`}
                      data-material-name={material.name}
                      aria-pressed={cell.active}
                      aria-label={material.name}
                      aria-description={`${material.logicalWidth ?? material.width}×${material.logicalHeight ?? material.height}, ${usage}, ${material.sourceName}`}
                      onFocus={() => setFocusedMaterial(material.name)}
                      onPress={() =>
                        shellState.materialBrowser.commands?.activateMaterial(material.name)
                      }
                    >
                      <MaterialThumbnail material={material} />
                      <span>{material.name}</span>
                    </Button>
                  );
                })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MaterialActionsMenu({
  disabled,
  onReplace,
  shellState,
}: {
  readonly disabled: boolean;
  readonly onReplace: () => void;
  readonly shellState: EditorShellState;
}) {
  return (
    <MenuTrigger>
      <Button
        className="material-menu-trigger"
        tone="quiet"
        size="compact"
        aria-label="Material actions"
        isDisabled={disabled}
      >
        <Icon name="more-actions" />
      </Button>
      <Popover placement="bottom end" offset={2}>
        <Menu
          aria-label="Material actions"
          onAction={(key) => {
            if (key === 'faces') shellState.materialBrowser.commands?.selectFaces();
            if (key === 'brushes') shellState.materialBrowser.commands?.selectBrushes();
            if (key === 'copy') shellState.materialBrowser.commands?.copyMaterialName();
            if (key === 'replace') onReplace();
          }}
        >
          <MenuItem id="faces" label="Select using faces" />
          <MenuItem id="brushes" label="Select using brushes" />
          <MenuItem id="copy" label="Copy material name" />
          <MenuItem id="replace" label="Replace material uses…" />
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

function MaterialBrowser({ shellState }: { readonly shellState: EditorShellState }) {
  const snapshot = useSyncExternalStore(
    shellState.materialBrowser.subscribe,
    shellState.materialBrowser.getSnapshot,
    shellState.materialBrowser.getSnapshot,
  );
  const [replaceOpen, setReplaceOpen] = useState(false);
  const hasMaterial = snapshot.activeMaterial.trim().length > 0;
  const replaceDisabled =
    !snapshot.replaceSource.trim() ||
    !snapshot.replaceTarget.trim() ||
    snapshot.replaceSource.trim().toLowerCase() === snapshot.replaceTarget.trim().toLowerCase();
  return (
    <section className="material-browser-pane">
      <header className="material-browser-heading">
        <strong>Material Browser</strong>
        <span id="material-count">
          {snapshot.loadedCount} loaded · {snapshot.usedCount} in use
        </span>
        <Button
          tone="quiet"
          size="compact"
          onPress={() => {
            shellState.inspectorLayout.setActive('map');
            const resources = shellState.resourceSettings.getSnapshot();
            shellState.resourceSettings.update({ revealVersion: resources.revealVersion + 1 });
          }}
        >
          <Icon name="settings" />
          Settings
        </Button>
      </header>
      {snapshot.coverageMessage ? (
        <p id="material-coverage" className="material-coverage">
          {snapshot.coverageMessage}
        </p>
      ) : null}
      <MaterialGrid snapshot={snapshot} shellState={shellState} />
      <div className="material-current-row">
        <TextField
          label="Current material"
          hideLabel
          value={snapshot.activeMaterial}
          onChange={(value) => shellState.materialBrowser.commands?.setActiveMaterial(value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') shellState.materialBrowser.commands?.applyActiveMaterial();
          }}
          input={{ id: 'material-name', placeholder: 'Material name', spellCheck: false }}
        />
        <IconButton
          icon="apply-material"
          label="Apply current material"
          data-action="apply-material"
          isDisabled={!hasMaterial}
          onPress={() => shellState.materialBrowser.commands?.applyActiveMaterial()}
        />
        <IconButton
          icon="sample-material"
          label="Sample selected face material"
          onPress={() => shellState.materialBrowser.commands?.sampleSelection()}
        />
        <MaterialActionsMenu
          disabled={!hasMaterial}
          onReplace={() => {
            shellState.materialBrowser.commands?.setReplaceSource(snapshot.activeMaterial);
            setReplaceOpen(true);
          }}
          shellState={shellState}
        />
      </div>
      <div className="material-browser-controls">
        <Select
          id="material-sort"
          label="Sort materials"
          hideLabel
          selectedKey={snapshot.sort}
          options={[
            { id: 'name', label: 'Name' },
            { id: 'usage', label: 'Usage' },
          ]}
          onSelectionChange={(key) => {
            if (key === 'name' || key === 'usage')
              shellState.materialBrowser.commands?.setSort(key);
          }}
        />
        <Select
          id="material-source"
          label="Material group"
          hideLabel
          selectedKey={snapshot.source}
          options={[
            { id: 'all', label: 'All groups' },
            ...snapshot.sources.map((source) => ({ id: source, label: source })),
          ]}
          onSelectionChange={(key) => shellState.materialBrowser.commands?.setSource(String(key))}
        />
        <Checkbox
          id="material-used-only"
          className="material-used-only"
          isSelected={snapshot.usedOnly}
          onChange={(value) => shellState.materialBrowser.commands?.setUsedOnly(value)}
        >
          Used
        </Checkbox>
        <TextField
          label="Search materials"
          hideLabel
          value={snapshot.filter}
          onChange={(value) => shellState.materialBrowser.commands?.setFilter(value)}
          input={{ id: 'material-filter', type: 'search', placeholder: 'Search…' }}
        />
      </div>
      <Dialog
        id="material-replace-dialog"
        title="Replace material"
        detail={snapshot.replaceScope}
        isOpen={replaceOpen}
        isDismissable
        onOpenChange={setReplaceOpen}
      >
        <div className="material-replace-dialog-body">
          <TextField
            label="Find"
            value={snapshot.replaceSource}
            onChange={(value) => shellState.materialBrowser.commands?.setReplaceSource(value)}
            input={{ id: 'material-replace-source', spellCheck: false }}
          />
          <TextField
            label="Replace with"
            value={snapshot.replaceTarget}
            onChange={(value) => shellState.materialBrowser.commands?.setReplaceTarget(value)}
            input={{ id: 'material-replace-target', spellCheck: false }}
          />
          <p id="material-replace-scope">{snapshot.replaceScope}</p>
          <Button
            tone="primary"
            isDisabled={replaceDisabled}
            data-action="replace-material"
            onPress={() => {
              shellState.materialBrowser.commands?.replace();
              setReplaceOpen(false);
            }}
          >
            Replace
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

export function TextureInspector({ shellState }: { readonly shellState: EditorShellState }) {
  const [upperHeight, setUpperHeight] = useState(storedFaceUpperHeight);
  const [containerHeight, setContainerHeight] = useState(0);
  const root = useRef<HTMLElement>(null);
  const dragStart = useRef<{ readonly y: number; readonly height: number } | null>(null);
  const maximumUpperHeight =
    containerHeight > 0
      ? Math.max(
          MINIMUM_FACE_UPPER_HEIGHT,
          Math.floor(containerHeight - MINIMUM_MATERIAL_HEIGHT - FACE_SPLITTER_HEIGHT),
        )
      : 1200;
  const visibleUpperHeight = Math.min(upperHeight, maximumUpperHeight);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const setLiveHeight = (height: number) => {
    const next = Math.max(MINIMUM_FACE_UPPER_HEIGHT, Math.min(maximumUpperHeight, height));
    root.current?.style.setProperty('--face-upper-height', `${next}px`);
  };
  const commitHeight = (height: number) => {
    const maximum = Math.max(
      MINIMUM_FACE_UPPER_HEIGHT,
      Math.floor(
        (root.current?.getBoundingClientRect().height ?? 700) -
          MINIMUM_MATERIAL_HEIGHT -
          FACE_SPLITTER_HEIGHT,
      ),
    );
    const next = Math.max(MINIMUM_FACE_UPPER_HEIGHT, Math.min(maximum, Math.round(height)));
    setLiveHeight(next);
    setUpperHeight(next);
    persistFaceUpperHeight(next);
  };
  return (
    <section
      ref={root}
      className="face-inspector-layout"
      style={{ '--face-upper-height': `${visibleUpperHeight}px` } as CSSProperties}
    >
      <div className="face-upper-scroll">
        <FaceAttributes shellState={shellState} />
      </div>
      <div
        className="face-inspector-resizer"
        role="separator"
        aria-label="Resize face attributes and material browser"
        aria-orientation="horizontal"
        aria-valuemin={MINIMUM_FACE_UPPER_HEIGHT}
        aria-valuemax={maximumUpperHeight}
        aria-valuenow={visibleUpperHeight}
        tabIndex={0}
        onPointerDown={(event) => {
          dragStart.current = { y: event.clientY, height: visibleUpperHeight };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = dragStart.current;
          if (start && event.currentTarget.hasPointerCapture(event.pointerId))
            setLiveHeight(start.height + event.clientY - start.y);
        }}
        onPointerUp={(event) => {
          const start = dragStart.current;
          dragStart.current = null;
          if (!start) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          commitHeight(start.height + event.clientY - start.y);
        }}
        onPointerCancel={() => {
          dragStart.current = null;
          setLiveHeight(visibleUpperHeight);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          commitHeight(visibleUpperHeight + (event.key === 'ArrowUp' ? -16 : 16));
        }}
      />
      <MaterialBrowser shellState={shellState} />
    </section>
  );
}
