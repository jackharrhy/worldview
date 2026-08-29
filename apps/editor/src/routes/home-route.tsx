import { useRef, useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import { ProjectLocalStateService } from '../project-local-state.js';
import type { EditorDirectoryHandle } from '../project-workspace.js';
import {
  ActionButton,
  EmptyState,
  ProductHeader,
  ProductPage,
  SectionHeading,
} from '../components/ui.js';
import { setPendingEditorLaunch } from './editor-launch.js';
import type { loader } from './home-loader.js';

const projects = new ProjectLocalStateService();

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options: { readonly mode: 'readwrite' }) => Promise<EditorDirectoryHandle>;
}

export function Component() {
  const { localProjects, hosted } = useLoaderData<typeof loader>();
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
        const granted = await recent.handle.requestPermission?.({ mode: 'readwrite' });
        if (granted !== 'granted') throw new Error('Project directory permission was not granted.');
      }
      setPendingEditorLaunch({ kind: 'recent-project', projectKey });
      void navigate('/editor');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <ProductPage>
      <ProductHeader
        title="Worldview Editor"
        description="Build Quake and GoldSrc maps locally, or sign in to work across browsers."
      />
      <div className="landing-actions">
        <ActionButton type="button" tone="primary" onClick={() => void navigate('/new-map')}>
          New map
        </ActionButton>
        <ActionButton type="button" onClick={() => void openProject()}>
          Open project folder
        </ActionButton>
        <ActionButton type="button" onClick={() => mapInput.current?.click()}>
          Open map file
        </ActionButton>
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
      </div>
      <section className="landing-recents" aria-labelledby="hosted-title">
        <SectionHeading title="Hosted projects" detail="Stored on the server" />
        {hosted.status === 'signed-out' ? (
          <EmptyState>
            <a className="landing-auth" href="/auth/login">
              Sign in with 4orm
            </a>{' '}
            to open projects from any browser.
          </EmptyState>
        ) : null}
        {hosted.status === 'offline' ? (
          <p className="landing-empty">
            The hosted project service is unavailable. Local editing still works.
          </p>
        ) : null}
        {hosted.status === 'ready' ? (
          <div className="landing-recent-list">
            <ActionButton
              type="button"
              tone="primary"
              onClick={() => void navigate('/new-project')}
            >
              New hosted project
            </ActionButton>
            {hosted.projects.length === 0 ? (
              <p className="landing-empty">No hosted projects yet.</p>
            ) : (
              hosted.projects.map((project) => (
                <button
                  type="button"
                  className="landing-recent"
                  key={project.id}
                  onClick={() => void navigate(`/projects/${encodeURIComponent(project.id)}`)}
                >
                  <strong>{project.name}</strong>
                  <span>
                    {project.game === 'goldsrc' ? 'GoldSrc' : 'Quake'} · {project.role}
                  </span>
                  <small>{new Date(project.updatedAt).toLocaleString()}</small>
                </button>
              ))
            )}
          </div>
        ) : null}
      </section>
      <section className="landing-recents" aria-labelledby="recents-title">
        <SectionHeading title="Local projects" detail="Stored on this browser" />
        <div className="landing-recent-list">
          {localProjects.length === 0 ? (
            <p className="landing-empty">No project folders have been opened here yet.</p>
          ) : (
            localProjects.map((recent) => (
              <button
                type="button"
                className="landing-recent"
                key={recent.projectKey}
                onClick={() => void reopenProject(recent.projectKey)}
              >
                <strong>{recent.displayName}</strong>
                <span>{recent.detail}</span>
                <small>{new Date(recent.updatedAt).toLocaleString()}</small>
              </button>
            ))
          )}
        </div>
      </section>
      {error ? (
        <p className="landing-error" role="alert">
          {error}
        </p>
      ) : null}
    </ProductPage>
  );
}
