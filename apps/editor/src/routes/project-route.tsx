import { useEffect, useRef, useState } from 'react';
import { worldviewGameProfile } from '@jackharrhy/worldview-editor/core';
import { isGameTreeAssetPath } from '@worldview/protocol';
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
  useRevalidator,
} from 'react-router';
import type { action } from './project-action.js';
import type { loader } from './project-loader.js';
import { hostedMapPath, hostedProjectPath, hostedProjectSectionPath } from './hosted-route.js';
import { Icon } from '../components/ui/icon.js';

function uploadedGameAssetPath(file: File): string | null {
  const parts = file.webkitRelativePath.split('/');
  const root = parts.findIndex(
    (part) => part === 'assets' || part === 'textures' || part === 'env',
  );
  if (root < 0) return null;
  const relative = parts.slice(root + (parts[root] === 'assets' ? 1 : 0)).join('/');
  return isGameTreeAssetPath(relative) ? relative : null;
}

export function Component() {
  const { project, section, mounts, assets, assetQuery, accessUsers } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const gameProfile = worldviewGameProfile(project.game);
  const hasGameAssets = gameProfile.materialFormat === 'wal';
  const resourceInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadResources = async (folder = false) => {
    const files = [...((folder ? folderInput : resourceInput).current?.files ?? [])];
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploads = files.flatMap((file) => {
        const name = folder ? uploadedGameAssetPath(file) : file.name;
        if (!name) return [];
        const extension = name.split('.').pop()?.toLowerCase();
        const kind = extension === 'lmp' ? 'palette' : extension;
        return [{ file, name, kind }];
      });
      if (uploads.length === 0)
        throw new Error('No supported project assets found in that folder.');
      for (const [index, { file, name, kind }] of uploads.entries()) {
        if (
          !kind ||
          !['wad', 'palette', 'fgd', 'def', 'ent', 'sprite', 'png', 'tga', 'wal_json'].includes(
            kind,
          )
        ) {
          throw new Error(`Unsupported project resource: ${name}`);
        }
        setUploadStatus(`Uploading ${index + 1} of ${uploads.length}: ${name}`);
        const query = new URLSearchParams({ name, kind });
        const response = await fetch(
          `/api/projects/${encodeURIComponent(project.id)}/resources/upload?${query}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          },
        );
        if (!response.ok) {
          const result: unknown = await response.json().catch(() => null);
          const message =
            result && typeof result === 'object' && 'error' in result
              ? String(result.error)
              : `Upload failed (${response.status})`;
          throw new Error(message);
        }
      }
      setUploadStatus(
        `Added ${uploads.length} project resource${uploads.length === 1 ? '' : 's'}.`,
      );
      if (resourceInput.current) resourceInput.current.value = '';
      if (folderInput.current) folderInput.current.value = '';
      void revalidator.revalidate();
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };
  useEffect(() => {
    if (actionData && 'createdMap' in actionData)
      void navigate(hostedMapPath(project, actionData.createdMap));
  }, [actionData, navigate, project]);
  const canEdit = project.role === 'owner' || project.role === 'editor';
  const projectAssetBytes = [
    ...new Map(mounts.map((mount) => [mount.expectedSha256, mount.size])).values(),
  ].reduce((sum, size) => sum + size, 0);
  return (
    <main className="landing-page">
      <section className="landing-card hosted-project-card">
        <header>
          <Link to="/" className="route-back">
            <Icon name="back" /> Projects
          </Link>
          <h1>{project.name}</h1>
          <p className="project-meta">
            <span>{gameProfile.label}</span>
            <span className="project-role">{project.role}</span>
          </p>
        </header>
        <nav className="project-tabs" aria-label="Project pages">
          <Link
            to={hostedProjectPath(project)}
            aria-current={section === 'maps' ? 'page' : undefined}
          >
            Maps
          </Link>
          {project.role === 'owner' ? (
            <Link
              to={hostedProjectSectionPath(project, 'access')}
              aria-current={section === 'access' ? 'page' : undefined}
            >
              Access
            </Link>
          ) : null}
          <Link
            to={hostedProjectSectionPath(project, 'resources')}
            aria-current={section === 'resources' ? 'page' : undefined}
          >
            Resources
          </Link>
          {canEdit && section !== 'new-map' ? (
            <Link
              to={hostedProjectSectionPath(project, 'new-map')}
              className="project-new-map-button"
            >
              <span aria-hidden="true">+</span> New map
            </Link>
          ) : null}
        </nav>
        {section === 'maps' ? (
          <section className="landing-recents" aria-label="Maps">
            <div className="landing-recent-list">
              {project.maps.length === 0 ? (
                <p className="landing-empty">No maps yet.</p>
              ) : (
                project.maps.map((map) => (
                  <button
                    type="button"
                    className="landing-recent"
                    key={map.id}
                    onClick={() => void navigate(hostedMapPath(project, map))}
                  >
                    <strong>{map.name}</strong>
                    <span>{map.format === 'valve-220' ? 'Valve 220' : 'Classic Quake'}</span>
                  </button>
                ))
              )}
            </div>
          </section>
        ) : null}
        {section === 'new-map' && canEdit ? (
          <section className="project-tab-content">
            <h2>New map</h2>
            <Form
              method="post"
              encType="multipart/form-data"
              className="route-form hosted-map-form"
            >
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
                <label>
                  Existing .map file (optional)
                  <input name="sourceFile" type="file" accept=".map,text/plain" />
                </label>
                {actionData && 'error' in actionData ? (
                  <p className="landing-error">{actionData.error}</p>
                ) : null}
                <p>
                  {project.game === 'quake'
                    ? 'Worldview development textures and the standard Quake palette are included. Add a custom palette below if your mod uses different colors.'
                    : hasGameAssets
                      ? 'Add the game’s textures, skybox, and FGD on the Resources page.'
                      : 'Includes Worldview development textures and this project’s GoldSrc texture packs and palettes.'}
                </p>
              </div>
              <footer>
                <button className="primary" disabled={navigation.state !== 'idle'}>
                  {navigation.state !== 'idle' ? 'Creating…' : 'Create map'}
                </button>
              </footer>
            </Form>
          </section>
        ) : null}
        {section === 'access' && project.role === 'owner' ? (
          <section className="landing-recents project-access">
            <div className="landing-recents-heading">
              <h2>Project access</h2>
              <span>{accessUsers.filter((user) => user.role !== null).length}</span>
            </div>
            <p className="landing-empty">People appear here after they sign in with 4orm.</p>
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
        {section === 'resources' ? (
          <section className="landing-recents">
            <div className="landing-recents-heading">
              <h2>Project resources</h2>
              <span>{Math.ceil(projectAssetBytes / (1024 * 1024))} / 1024 MiB</span>
            </div>
            {!hasGameAssets ? (
              <div className="landing-recent">
                <strong>Worldview development textures</strong>
                <span>Used by every map and build</span>
              </div>
            ) : null}
            {mounts.length === 0 ? (
              <p className="landing-empty">No other resources.</p>
            ) : (
              <div className="landing-recent-list">
                {mounts.map((mount) => (
                  <div className="landing-recent" key={String(mount.id)}>
                    <strong>{mount.displayName}</strong>
                    <span>
                      {String(mount.kind)} · {Math.ceil(mount.size / 1024)} KiB · stored in
                      Worldview
                    </span>
                    {project.role === 'owner' ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="remove-resource" />
                        <input type="hidden" name="resourceId" value={mount.id} />
                        <button type="submit">Remove</button>
                      </Form>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {project.role === 'owner' ? (
              <>
                <div className="route-form">
                  <label>
                    Upload project files
                    <input
                      ref={resourceInput}
                      type="file"
                      multiple
                      accept={hasGameAssets ? '.fgd' : '.wad,.lmp,.fgd,.def,.ent,.spr'}
                    />
                  </label>
                  <p>
                    {hasGameAssets
                      ? 'Upload entity definitions here, or add a game asset folder below. Assets are copied into the project.'
                      : 'WADs, palettes, and entity definitions are copied into this project.'}{' '}
                    Up to 512 MiB per file.
                  </p>
                  <button type="button" disabled={uploading} onClick={() => void uploadResources()}>
                    {uploading ? 'Uploading…' : 'Upload files'}
                  </button>
                  {hasGameAssets ? (
                    <>
                      <label>
                        Game asset folder
                        <input
                          ref={folderInput}
                          type="file"
                          multiple
                          {...{ webkitdirectory: '' }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => void uploadResources(true)}
                      >
                        {uploading ? 'Uploading…' : 'Upload folder'}
                      </button>
                    </>
                  ) : null}
                  {uploadStatus ? <p role="status">{uploadStatus}</p> : null}
                </div>
                <Form method="get" className="route-form">
                  <label>
                    Import from Artbin
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
                          {asset.kind}, {Math.ceil(asset.size / 1024)} KiB
                        </span>
                        <button disabled={!asset.sha256}>Import copy</button>
                      </Form>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}
