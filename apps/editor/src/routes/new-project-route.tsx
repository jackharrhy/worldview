import { Form, Link, useActionData, useNavigation } from 'react-router';
import type { action } from './new-project-action.js';

export function Component() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  return (
    <main className="new-map-route">
      <section className="new-map-route-content">
        <header>
          <Link to="/" className="route-back">
            ← Back
          </Link>
          <h1>New hosted project</h1>
        </header>
        <Form method="post" className="route-form">
          <div className="route-fields">
            <label>
              Project name
              <input name="name" autoComplete="off" autoFocus />
            </label>
            <label>
              Game
              <select name="game" defaultValue="quake">
                <option value="quake">Quake</option>
                <option value="goldsrc">GoldSrc</option>
              </select>
            </label>
            <p>Maps, resources, history, and builds for this project live on the server.</p>
            {actionData?.error ? (
              <p className="landing-error" role="alert">
                {actionData.error}
              </p>
            ) : null}
          </div>
          <footer>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create project'}
            </button>
          </footer>
        </Form>
      </section>
    </main>
  );
}
