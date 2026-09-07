import { useSyncExternalStore } from 'react';
import { Dialog, DialogTrigger } from 'react-aria-components/Dialog';
import type { EditorShellState } from '../../editor-shell-state.js';
import { Button } from '../ui/button.js';
import { NumberField } from '../ui/number-field.js';
import { Popover } from '../ui/menu.js';

export function FovControl({ shellState }: { readonly shellState: EditorShellState }) {
  const port = shellState.viewportPresentation;
  // Camera motion must not re-render the control unless the lens itself changes.
  const value = useSyncExternalStore(port.subscribe, () => port.getSnapshot().fieldOfView);
  const defaultValue = useSyncExternalStore(
    port.subscribe,
    () => port.getSnapshot().defaultFieldOfView,
  );
  const compiled = useSyncExternalStore(port.subscribe, () => port.getSnapshot().showingCompiled);
  const modified = Math.abs(value - defaultValue) > 0.01;
  return (
    <DialogTrigger>
      <Button
        className="fov-trigger"
        tone="quiet"
        size="compact"
        aria-label="Field of view"
        isDisabled={compiled}
        data-modified={modified}
      >
        FOV {Math.round(value)}°{modified ? ' *' : ''}
      </Button>
      <Popover placement="bottom end" offset={2} className="fov-popover">
        <Dialog aria-label="Perspective field of view">
          <NumberField
            label="Vertical FOV (degrees)"
            value={value}
            minValue={20}
            maxValue={120}
            step={1}
            onChange={(next) => {
              if (Number.isFinite(next)) port.commands?.setFieldOfView(next);
            }}
          />
          <p>Default: {Math.round(defaultValue)}°</p>
          <div className="fov-actions">
            <Button
              size="compact"
              isDisabled={!modified}
              onPress={() => port.commands?.setFieldOfView(defaultValue)}
            >
              Reset to default
            </Button>
            <Button
              size="compact"
              isDisabled={!modified}
              onPress={() => port.commands?.saveDefaultFieldOfView()}
            >
              Use current as default
            </Button>
            <Button size="compact" onPress={() => port.commands?.restoreFactoryFieldOfView()}>
              Restore 60° default
            </Button>
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
