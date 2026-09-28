import { useRef, useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import { ProjectLocalStateService } from '../project-local-state.js';
import type { EditorDirectoryHandle } from '../project-workspace.js';
import { ActionButton, ProductPage, SectionHeading } from '../components/ui.js';
import { Icon } from '../components/ui/icon.js';
import { setPendingEditorLaunch } from './editor-launch.js';
import type { loader } from './home-loader.js';
import { hostedProjectPath } from './hosted-route.js';
import { detachedMapPath } from './local-map-path.js';

const projects = new ProjectLocalStateService();

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options: { readonly mode: 'readwrite' }) => Promise<EditorDirectoryHandle>;
}

export function Component() {
  const { localProjects, localMaps, hosted } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const mapInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const enterProject = (handle: EditorDirectoryHandle) => {
    setPendingEditorLaunch({ kind: 'project', handle });
    void navigate('/editor');
  };
  const openProject = async () => {
    try {
      const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
      if (!picker) throw new Error('Project folders require Chromium File System Access.');
      enterProject(await picker({ mode: 'readwrite' }));
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const reopenProject = async (projectKey: string) => {
    try {
      const recent = await projects.load(projectKey);
      if (!recent) throw new Error('This recent project is no longer available.');
      const permission =
        (await recent.handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
      if (permission !== 'granted') {
        const granted = await recent.handle.requestPermission?.({
          mode: 'readwrite',
        });
        if (granted !== 'granted') throw new Error('Project directory permission was not granted.');
      }
      setPendingEditorLaunch({ kind: 'recent-project', projectKey });
      void navigate('/editor');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <ProductPage className="home-page">
      <div className="home-workspace">
        <section className="home-start" aria-labelledby="start-title">
          <h1 id="start-title">Start</h1>
          <div className="home-start-actions">
            <ActionButton
              type="button"
              className="home-start-primary"
              onPress={() => void navigate('/editor')}
            >
              <Icon name="viewport-3d" /> Open editor
            </ActionButton>
            <ActionButton type="button" onPress={() => void navigate('/new-map')}>
              <Icon name="new-map" /> New map
            </ActionButton>
            <ActionButton type="button" onPress={() => mapInput.current?.click()}>
              <Icon name="open-map" /> Open map file
            </ActionButton>
            <ActionButton type="button" onPress={() => void openProject()}>
              <Icon name="open-project" /> Open project folder
            </ActionButton>
          </div>
          <input
            ref={mapInput}
            type="file"
            accept=".map,text/plain"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              setPendingEditorLaunch({ kind: 'map', file });
              void navigate('/editor');
            }}
          />
        </section>
        <div className="home-recent-work">
          <section className="landing-recents" aria-labelledby="hosted-title">
            <SectionHeading
              id="hosted-title"
              title="Hosted projects"
              action={
                hosted.status === 'ready' ? (
                  <ActionButton
                    type="button"
                    size="compact"
                    onPress={() => void navigate('/new-project')}
                  >
                    <span aria-hidden="true">+</span> New project
                  </ActionButton>
                ) : undefined
              }
            />
            {hosted.status === 'signed-out' ? (
              <p className="landing-empty">
                <a className="landing-auth" href="/auth/login">
                  Sign in with 4orm
                </a>{' '}
                to open your projects across browsers.
              </p>
            ) : null}
            {hosted.status === 'offline' ? (
              <p className="landing-empty">Hosted projects are unavailable right now.</p>
            ) : null}
            {hosted.status === 'ready' ? (
              <div className="landing-recent-list">
                {hosted.projects.length === 0 ? (
                  <p className="landing-empty">No hosted projects yet.</p>
                ) : (
                  hosted.projects.map((project) => (
                    <button
                      type="button"
                      className="landing-recent hosted-project-row"
                      key={project.id}
                      onClick={() => void navigate(hostedProjectPath(project))}
                    >
                      <strong>{project.name}</strong>
                      <span>
                        {project.game === 'goldsrc' ? 'GoldSrc' : 'Quake'}, {project.role}
                      </span>
                      <small>{new Date(project.updatedAt).toLocaleDateString()}</small>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </section>
          {localMaps.length > 0 ? (
            <section className="landing-recents" aria-labelledby="local-maps-title">
              <SectionHeading id="local-maps-title" title="Local maps" />
              <div className="landing-recent-list">
                {localMaps.map((map) => (
                  <button
                    type="button"
                    className="landing-recent"
                    key={map.id}
                    onClick={() => void navigate(detachedMapPath(map.id))}
                  >
                    <strong>{map.name}</strong>
                    <span>{map.reason}</span>
                    <small>{new Date(map.updatedAt).toLocaleDateString()}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {localProjects.length > 0 ? (
            <section className="landing-recents" aria-labelledby="recents-title">
              <SectionHeading id="recents-title" title="Local projects" />
              <div className="landing-recent-list">
                {localProjects.map((recent) => (
                  <button
                    type="button"
                    className="landing-recent"
                    key={recent.projectKey}
                    onClick={() => void reopenProject(recent.projectKey)}
                  >
                    <strong>{recent.displayName}</strong>
                    <span>{recent.detail}</span>
                    <small>{new Date(recent.updatedAt).toLocaleDateString()}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="landing-error" role="alert">
          {error}
        </p>
      ) : null}
    </ProductPage>
  );
}
