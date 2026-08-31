import { useEffect } from 'react';
import { Form, Link, useActionData, useLoaderData, useNavigate, useNavigation } from 'react-router';
import type { action } from './project-action.js';
import type { loader } from './project-loader.js';
import { hostedMapPath } from './hosted-route.js';
import { Icon } from '../components/ui/icon.js';

export function Component() {
  const { project, mounts, assets, assetQuery, accessUsers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  useEffect(() => {
    if (actionData && 'createdMap' in actionData)
      void navigate(hostedMapPath(project, actionData.createdMap));
  }, [actionData, navigate, project]);
  const canEdit = project.role === 'owner' || project.role === 'editor';
  return (
    <main className="landing-page">
      <section className="landing-card hosted-project-card">
        <header>
          <Link to="/" className="route-back">
            <Icon name="back" /> Projects
          </Link>
          <h1>{project.name}</h1>
          <p>
            {project.game === 'goldsrc' ? 'GoldSrc' : 'Quake'} · {project.role}
          </p>
        </header>
        <section className="landing-recents">
          <div className="landing-recents-heading">
            <h2>Maps</h2>
            <span>{project.maps.length}</span>
          </div>
          <div className="landing-recent-list">
            {project.maps.length === 0 ? (
              <p className="landing-empty">This project has no maps yet.</p>
            ) : (
              project.maps.map((map) => (
                <div className="landing-recent" key={map.id}>
                  <button type="button" onClick={() => void navigate(hostedMapPath(project, map))}>
                    <strong>{map.name}</strong>
                    <span>{map.format === 'valve-220' ? 'Valve 220' : 'Classic Quake'}</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
        {canEdit ? (
          <Form method="post" className="route-form hosted-map-form">
            <div className="route-fields">
              <label>
                Map name
                <input name="name" defaultValue="untitled.map" />
              </label>
              <label>
                Format
                <select name="format" defaultValue="valve-220">
                  <option value="valve-220">Valve 220</option>
                  {project.game === 'quake' ? <option value="quake">Classic Quake</option> : null}
                </select>
              </label>
              {actionData && 'error' in actionData ? (
                <p className="landing-error">{actionData.error}</p>
              ) : null}
            </div>
            <footer>
              <button className="primary" disabled={navigation.state !== 'idle'}>
                {navigation.state !== 'idle' ? 'Creating…' : 'Create map'}
              </button>
            </footer>
          </Form>
        ) : null}
        {project.role === 'owner' ? (
          <section className="landing-recents project-access">
            <div className="landing-recents-heading">
              <h2>Project access</h2>
              <span>{accessUsers.filter((user) => user.role !== null).length}</span>
            </div>
            <p className="landing-empty">
              People appear here after signing into Worldview with 4orm.
            </p>
            <div className="landing-recent-list">
              {accessUsers.map((user) => (
                <Form method="post" className="landing-recent project-access-row" key={user.id}>
                  <input type="hidden" name="userId" value={user.id} />
                  <span className="project-access-person">
                    <strong>{user.displayName}</strong>
                    <small>@{user.username}</small>
                  </span>
                  {user.role === 'owner' ? (
                    <span className="project-access-role">Owner</span>
                  ) : (
                    <>
                      <select
                        name="role"
                        defaultValue={user.role ?? 'editor'}
                        aria-label={`Access role for ${user.displayName}`}
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button name="intent" value="set-member-role">
                        {user.role ? 'Update' : 'Add'}
                      </button>
                      {user.role ? (
                        <button name="intent" value="remove-member" className="danger-subtle">
                          Remove
                        </button>
                      ) : null}
                    </>
                  )}
                </Form>
              ))}
            </div>
          </section>
        ) : null}
        <section className="landing-recents">
          <div className="landing-recents-heading">
            <h2>Project resources</h2>
            <span>{mounts.length}</span>
          </div>
          {mounts.length === 0 ? (
            <p className="landing-empty">No remote resources mounted.</p>
          ) : (
            <div className="landing-recent-list">
              {mounts.map((mount) => (
                <div className="landing-recent" key={String(mount.id)}>
                  <strong>{mount.displayName}</strong>
                  <span>{String(mount.kind)} · pinned by SHA-256</span>
                </div>
              ))}
            </div>
          )}
          {project.role === 'owner' ? (
            <>
              <Form method="get" className="route-form">
                <label>
                  Find approved Artbin assets
                  <input
                    name="assets"
                    defaultValue={assetQuery}
                    placeholder="WAD, palette, texture…"
                  />
                </label>
                <footer>
                  <button>Search Artbin</button>
                </footer>
              </Form>
              {assets.length ? (
                <div className="landing-recent-list">
                  {assets.map((asset) => (
                    <Form method="post" className="landing-recent" key={asset.id}>
                      <input type="hidden" name="intent" value="mount-asset" />
                      <input type="hidden" name="assetId" value={asset.id} />
                      <strong>{asset.name}</strong>
                      <span>
                        {asset.kind} · {Math.ceil(asset.size / 1024)} KiB
                      </span>
                      <button disabled={!asset.sha256}>Mount pinned asset</button>
                    </Form>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}
