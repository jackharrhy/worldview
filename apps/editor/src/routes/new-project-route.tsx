import { Form, useActionData, useNavigation } from 'react-router';
import { ActionButton, Field, ProductHeader, ProductPage } from '../components/ui.js';
import type { action } from './new-project-action.js';

export function Component() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  return (
    <ProductPage>
      <section className="new-map-route-content">
        <ProductHeader
          title="New hosted project"
          description="Keep maps and pinned resources available across browsers."
          backTo="/"
        />
        <Form method="post" className="route-form">
          <div className="route-fields">
            <Field label="Project name">
              <input name="name" autoComplete="off" autoFocus />
            </Field>
            <Field label="Game">
              <select name="game" defaultValue="quake">
                <option value="quake">Quake</option>
                <option value="goldsrc">GoldSrc</option>
              </select>
            </Field>
            <p>Maps, resources, history, and builds for this project live on the server.</p>
            {actionData?.error ? (
              <p className="landing-error" role="alert">
                {actionData.error}
              </p>
            ) : null}
          </div>
          <footer>
            <ActionButton type="submit" tone="primary" isDisabled={busy} isPending={busy}>
              {busy ? 'Creating…' : 'Create project'}
            </ActionButton>
          </footer>
        </Form>
      </section>
    </ProductPage>
  );
}
