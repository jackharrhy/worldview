import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Form, useActionData, useNavigate, useNavigation } from 'react-router';
import type { WorldviewGameProfile } from '@jackharrhy/worldview-editor/core';
import { ActionButton, Field, ProductHeader, ProductPage } from '../components/ui.js';
import type { action } from './new-map-action.js';
import { NEW_MAP_PROFILES } from './new-map-options.js';
import { preloadEditorRoute } from './preload-editor.js';

export function Component() {
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [profile, setProfile] = useState<WorldviewGameProfile>('quake');
  const selected = NEW_MAP_PROFILES[profile];
  const nameInput = useRef<HTMLInputElement>(null);
  const launch = actionData && 'launch' in actionData ? actionData.launch : null;
  const creating = navigation.state !== 'idle' || launch !== null;
  useLayoutEffect(() => nameInput.current?.focus(), []);
  useEffect(() => {
    if (!launch) return;
    void navigate('/editor', { state: { newMap: launch } });
  }, [launch, navigate]);
  useEffect(() => {
    const warm = () => void preloadEditorRoute();
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(warm, { timeout: 1_500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = globalThis.setTimeout(warm, 250);
    return () => globalThis.clearTimeout(id);
  }, []);
  return (
    <ProductPage className="new-map-page">
      <section className="new-map-route-content setup-panel">
        <ProductHeader
          title="New map"
          description="Choose a game and map format."
          backTo="/"
          backLabel="Maps"
          centered
        />
        <Form method="post" className="route-form">
          <div className="route-fields">
            <Field label="Map name">
              <input ref={nameInput} name="name" defaultValue="untitled.map" autoComplete="off" />
            </Field>
            <Field label="Game">
              <select
                name="profile"
                value={profile}
                onChange={(event) => setProfile(event.currentTarget.value as typeof profile)}
              >
                {Object.entries(NEW_MAP_PROFILES).map(([id, entry]) => (
                  <option key={id} value={id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Map format">
              <select name="format" defaultValue="valve-220">
                {selected.formats.map((format) => (
                  <option key={format} value={format}>
                    {format === 'valve-220' ? 'Valve 220' : 'Classic Quake'}
                  </option>
                ))}
              </select>
            </Field>
            <p>{selected.description}</p>
            {actionData && 'error' in actionData ? (
              <p className="landing-error" role="alert">
                {actionData.error}
              </p>
            ) : null}
          </div>
          <footer>
            <ActionButton
              type="submit"
              tone="primary"
              isDisabled={creating}
              isPending={creating}
              onHoverStart={() => void preloadEditorRoute()}
              onFocus={() => void preloadEditorRoute()}
            >
              {creating ? 'Opening editor…' : 'Create map'}
            </ActionButton>
          </footer>
        </Form>
      </section>
    </ProductPage>
  );
}
