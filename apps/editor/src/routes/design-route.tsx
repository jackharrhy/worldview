import './design.css';
import { useState } from 'react';
import {
  ActionButton,
  EmptyState,
  Field,
  ProductHeader,
  ProductPage,
  SectionHeading,
} from '../components/ui.js';
import { Menu, MenuItem, MenuSection } from '../components/ui/menu.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Dialog } from '../components/ui/dialog.js';
import { NumberField } from '../components/ui/number-field.js';
import { Select } from '../components/ui/select.js';
import { Tab, TabList, TabPanel, Tabs } from '../components/ui/tabs.js';
import { TextField } from '../components/ui/text-field.js';
import { ICON_NAMES, type IconName } from '../components/ui/icon-registry.js';
import { Icon } from '../components/ui/icon.js';

const colorTokens = [
  'bg',
  'surface',
  'surface-raised',
  'surface-input',
  'surface-hover',
  'surface-active',
  'line',
  'line-strong',
  'text',
  'muted',
  'accent',
  'danger',
  'success',
  'reference',
  'special',
] as const;

const specimenTools: readonly { readonly id: string; readonly icon: IconName }[] = [
  { id: 'select', icon: 'select' },
  { id: 'entity', icon: 'entity' },
  { id: 'hull', icon: 'hull' },
  { id: 'face', icon: 'face' },
  { id: 'vertex', icon: 'vertex' },
  { id: 'edge', icon: 'edge' },
  { id: 'rotate', icon: 'rotate' },
  { id: 'clip', icon: 'clip' },
  { id: 'scale', icon: 'scale' },
];

function ThemeSpecimen({ theme }: { readonly theme: 'dark' | 'light' }) {
  return (
    <section className="design-theme" data-preview-theme={theme}>
      <header className="design-theme-header">
        <strong>{theme === 'dark' ? 'Dark' : 'Light'}</strong>
        <span>Semantic token preview</span>
      </header>
      <div className="token-grid">
        {colorTokens.map((token) => (
          <div className="token-swatch" key={token}>
            <span className="token-color" data-token={token} />
            <code>--{token}</code>
          </div>
        ))}
      </div>
      <div className="design-control-states">
        <div className="design-state-group">
          <strong>Buttons</strong>
          <div className="control-row">
            <ActionButton tone="primary" size="compact">
              Apply
            </ActionButton>
            <ActionButton size="compact" referenceState="hover">
              Hover
            </ActionButton>
            <ActionButton size="compact" referenceState="pressed">
              Pressed
            </ActionButton>
            <ActionButton size="compact" referenceState="focus">
              Focus
            </ActionButton>
            <ActionButton size="compact" isDisabled>
              Disabled
            </ActionButton>
            <ActionButton size="compact" isPending>
              Saving
            </ActionButton>
            <ActionButton size="compact">Long action label stays on one line</ActionButton>
          </div>
        </div>
        <div className="design-state-group design-field-states">
          <strong>Fields</strong>
          <TextField
            label="Map name"
            description="A normal editable value."
            defaultValue="e1m1.map"
          />
          <TextField label="Keyboard focus" defaultValue="worldspawn" referenceState="focus" />
          <TextField
            label="Invalid value"
            defaultValue="maps/../escape.map"
            isInvalid
            referenceState="invalid"
            errorMessage="Use a contained project path."
          />
          <TextField label="Disabled value" defaultValue="Valve 220" isDisabled />
        </div>
        <div className="design-state-group">
          <strong>Menu</strong>
          <div className="wv-popover viewport-context-menu design-menu-specimen">
            <Menu
              aria-label={`${theme} menu specimen`}
              selectionMode="single"
              defaultSelectedKeys={['grid']}
            >
              <MenuSection label="Selection" showHeading={false}>
                <MenuItem id="focus" label="Focus selection" shortcut="Home" />
                <MenuItem id="grid" label="Snap to grid" shortcut="Ctrl+G" />
                <MenuItem id="disabled" label="Unavailable action" isDisabled />
              </MenuSection>
              <MenuSection label="Create here" showHeading={false}>
                <MenuItem id="entity" label="Create point entity" submenu referenceState="open" />
                <MenuItem
                  id="long"
                  label="A long command name truncates without moving the shortcut column"
                  shortcut="Shift+P"
                />
              </MenuSection>
            </Menu>
          </div>
        </div>
        <div className="design-state-group design-composite-states">
          <strong>Selection and values</strong>
          <Select
            label="Game profile"
            defaultSelectedKey="quake"
            options={[
              { id: 'quake', label: 'Quake' },
              { id: 'goldsrc', label: 'GoldSrc' },
            ]}
          />
          <NumberField label="Grid size" defaultValue={16} minValue={1} step={1} />
          <Checkbox defaultSelected>Texture lock</Checkbox>
          <Checkbox isIndeterminate>Mixed surface flag</Checkbox>
          <Tabs defaultSelectedKey="entity">
            <TabList aria-label={`${theme} inspector specimen`}>
              <Tab id="map">Map</Tab>
              <Tab id="entity">Entity</Tab>
              <Tab id="face">Face</Tab>
            </TabList>
            <TabPanel id="map">Map properties</TabPanel>
            <TabPanel id="entity">Entity properties</TabPanel>
            <TabPanel id="face">Face properties</TabPanel>
          </Tabs>
        </div>
        <div className="design-state-group design-icon-states">
          <strong>Semantic icons</strong>
          <div className="design-icon-grid">
            {ICON_NAMES.map((name) => (
              <div key={name} className="design-icon-cell" data-tool={name}>
                <Icon name={name} />
                <code>{name}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Component() {
  const [selectedTool, setSelectedTool] = useState('select');
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <ProductPage wide className="design-page">
      <ProductHeader
        title="Interface system"
        description="Compact tools, zinc surfaces, quiet borders, and editable geometry. The working reference for Worldview."
        backTo="/"
        backLabel="Editor home"
        aside={<span className="design-branch">Interface / V2</span>}
      />

      <section className="design-section design-assets">
        <SectionHeading title="Icons V2" detail="84 named glyphs / editable SVG" />
        <p>
          A 24-unit grid, 1.5-unit structural strokes, smaller handles, and color reserved for the
          part you manipulate.
        </p>
        <div className="control-row">
          <a className="wv-button wv-button-regular" href="/design/worldview-icons-v2.svg" download>
            Download editable SVG
          </a>
          <a
            className="wv-button wv-button-regular"
            href="/design/worldview-icons-v2.svg"
            target="_blank"
            rel="noreferrer"
          >
            Open icon sheet
          </a>
          <a className="wv-button wv-button-regular" href="/design/icons-v2-notes.md" download>
            Editing notes
          </a>
        </div>
        <details>
          <summary>Preview the complete sheet</summary>
          <img
            className="design-icon-sheet"
            src="/design/worldview-icons-v2.svg"
            alt="All 84 Worldview icons, grouped and labeled for editing"
          />
        </details>
      </section>
      <section className="design-section">
        <SectionHeading title="Editor chrome" detail="Compact desktop controls" />
        <div className="editor-specimen">
          <header className="specimen-topbar">
            <button className="specimen-document" aria-label="Example document menu">
              <Icon name="viewport-3d" />
            </button>
            <nav className="specimen-toolbar" aria-label="Example tools">
              {specimenTools.map(({ id, icon }) => (
                <button
                  key={id}
                  data-tool={id}
                  className={selectedTool === id ? 'active' : ''}
                  onClick={() => setSelectedTool(id)}
                  aria-label={id}
                  aria-pressed={selectedTool === id}
                >
                  <Icon name={icon} />
                </button>
              ))}
            </nav>
            <span className="specimen-grid">
              <Icon name="texture-lock" />
              16
            </span>
            <div className="specimen-actions">
              <Icon name="undo" />
              <Icon name="redo" />
            </div>
          </header>
          <div className="specimen-editor-body">
            <div className="specimen-viewports">
              {['3D', 'XY', 'XZ', 'YZ'].map((name) => (
                <div key={name}>
                  <span>{name}</span>
                </div>
              ))}
            </div>
            <aside className="specimen-inspector">
              <strong>Selection</strong>
              <p>No objects selected.</p>
              <Field label="Grid">
                <select>
                  <option>16</option>
                </select>
              </Field>
            </aside>
          </div>
          <footer className="specimen-status">
            Ready <span>Issues 0</span>
          </footer>
        </div>
      </section>
      <section className="design-section">
        <SectionHeading title="Color" detail="Zinc surfaces / semantic accents" />
        <div className="theme-specimens">
          <ThemeSpecimen theme="dark" />
          <ThemeSpecimen theme="light" />
        </div>
      </section>

      <section className="design-section">
        <SectionHeading title="Controls" detail="Default, hover, focus, active, disabled" />
        <div className="control-specimen">
          <div className="control-row">
            <ActionButton tone="primary">Create map</ActionButton>
            <ActionButton>Open project</ActionButton>
            <ActionButton tone="quiet">Cancel</ActionButton>
            <ActionButton tone="danger">Remove</ActionButton>
            <ActionButton isDisabled>Unavailable</ActionButton>
            <ActionButton onPress={() => setDialogOpen(true)}>Open dialog</ActionButton>
          </div>
          <div className="field-grid">
            <Field label="Map name" hint="Saved as a Quake map source file.">
              <input defaultValue="untitled.map" />
            </Field>
            <Field label="Game profile">
              <select defaultValue="quake">
                <option value="quake">Quake</option>
                <option value="goldsrc">GoldSrc</option>
              </select>
            </Field>
          </div>
        </div>
      </section>

      <Dialog
        title="Dialog specimen"
        detail="React Aria focus and dismissal"
        isOpen={dialogOpen}
        isDismissable
        onOpenChange={setDialogOpen}
      >
        <div className="design-dialog-body">
          <p>Dialogs use the same compact surface, border, field, and action language.</p>
          <TextField label="Checkpoint label" defaultValue="before-lighting" />
        </div>
      </Dialog>

      <section className="design-section">
        <SectionHeading title="Before the editor" detail="Project and map surfaces" />
        <div className="pre-editor-specimen">
          <section className="project-list-specimen">
            <SectionHeading title="Recent projects" detail="2 local" />
            <button className="resource-row">
              <span>
                <strong>castle</strong>
                <small>maps/e1m1.map</small>
              </span>
              <time>Today, 14:32</time>
            </button>
            <button className="resource-row">
              <span>
                <strong>test chamber</strong>
                <small>maps/intro.map</small>
              </span>
              <time>Yesterday</time>
            </button>
            <EmptyState>No hosted projects are available while signed out.</EmptyState>
          </section>
          <form className="form-surface" onSubmit={(event) => event.preventDefault()}>
            <div className="form-body">
              <Field label="Map name">
                <input defaultValue="untitled.map" />
              </Field>
              <Field label="Map format">
                <select>
                  <option>Valve 220</option>
                </select>
              </Field>
              <p className="form-note">Quake profile with standard texture projection.</p>
            </div>
            <footer className="form-actions">
              <ActionButton tone="primary">Create map</ActionButton>
            </footer>
          </form>
        </div>
      </section>
    </ProductPage>
  );
}
