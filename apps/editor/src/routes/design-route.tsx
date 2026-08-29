import { useState } from 'react';
import {
  ActionButton,
  EmptyState,
  Field,
  ProductHeader,
  ProductPage,
  SectionHeading,
} from '../components/ui.js';

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
    </section>
  );
}

export function Component() {
  const [selectedTool, setSelectedTool] = useState('select');
  return (
    <ProductPage wide>
      <ProductHeader
        title="Interface system"
        description="The shared visual language for project setup, editor chrome, controls, state, and themes."
        backTo="/"
        backLabel="Editor home"
        aside={<span className="design-branch">design/pre-editor-system</span>}
      />

      <section className="design-section">
        <SectionHeading title="Color" detail="OKLCH semantic roles" />
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
            <ActionButton disabled>Unavailable</ActionButton>
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

      <section className="design-section">
        <SectionHeading title="Editor chrome" detail="Compact desktop controls" />
        <div className="editor-specimen">
          <header className="specimen-topbar">
            <strong>WORLDVIEW</strong>
            <span>untitled.map</span>
            <div className="specimen-actions">
              <ActionButton tone="quiet">Undo</ActionButton>
              <ActionButton tone="quiet">Compile</ActionButton>
            </div>
          </header>
          <div className="specimen-editor-body">
            <nav className="specimen-toolrail" aria-label="Example tools">
              {['cursor', 'cube', 'scissors', 'arrows-out'].map((icon, index) => {
                const id = index === 0 ? 'select' : icon;
                return (
                  <button
                    key={icon}
                    className={selectedTool === id ? 'active' : ''}
                    onClick={() => setSelectedTool(id)}
                    aria-label={id}
                  >
                    <i className={`ph ph-${icon}`} />
                  </button>
                );
              })}
            </nav>
            <div className="specimen-viewports">
              {['Perspective', 'Top', 'Front', 'Side'].map((name) => (
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
            Grid 16 <span>Ready</span>
          </footer>
        </div>
      </section>
    </ProductPage>
  );
}
