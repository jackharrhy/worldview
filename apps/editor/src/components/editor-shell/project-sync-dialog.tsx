import { useMemo, useState, useSyncExternalStore } from 'react';
import { diffLines } from 'diff';
import type { ProjectSyncPort } from '../../project-sync-ui-state.js';
import { Button } from '../ui/button.js';
import { useModalDialog } from '../ui/use-modal-dialog.js';

const statusText = {
  'in-sync': 'In sync',
  'first-link': 'No common sync point',
  'local-changed': 'Local changed',
  'hosted-changed': 'Hosted changed',
  conflict: 'Both changed',
} as const;

export function ProjectSyncDialog({ port }: { readonly port: ProjectSyncPort }) {
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot);
  const [projectId, setProjectId] = useState('');
  const dialog = useModalDialog(state.open, () => port.close());
  const inspection = state.inspection;
  const changes = useMemo(
    () => (inspection ? diffLines(inspection.localSource, inspection.hostedSource) : []),
    [inspection],
  );
  const diffRows = useMemo(
    () =>
      changes.flatMap((change, index) => {
        const lines = change.value.split('\n');
        if (lines.at(-1) === '') lines.pop();
        const visible =
          change.added || change.removed || changes.length === 1
            ? lines
            : index === 0
              ? lines.slice(-3)
              : index === changes.length - 1
                ? lines.slice(0, 3)
                : [...lines.slice(0, 3), ...(lines.length > 6 ? ['…'] : []), ...lines.slice(-3)];
        return visible.map((line, lineIndex) => ({
          key: `${index}-${lineIndex}`,
          line,
          kind: change.added ? 'hosted' : change.removed ? 'local' : 'same',
        }));
      }),
    [changes],
  );
  const truncated = diffRows.length > 1200;
  return (
    <dialog {...dialog} className="project-sync-dialog" aria-label="Project sync">
      <header>
        <div>
          <strong>Project sync</strong>
          <span>Local files ↔ hosted maps</span>
        </div>
        <Button size="compact" onPress={() => port.close()}>
          Close
        </Button>
      </header>
      <div className="project-sync-body">
        <nav aria-label="Linked maps">
          {state.maps.map((map) => (
            <button
              key={map.mapId}
              type="button"
              className={map.path === state.selectedPath ? 'selected' : ''}
              onClick={() => port.inspect(map.path)}
            >
              {map.path}
            </button>
          ))}
        </nav>
        <section>
          {state.busy && !inspection ? <p>Checking disk and hosted source…</p> : null}
          {state.error ? (
            <p role="alert" className="project-sync-error">
              {state.error}
            </p>
          ) : null}
          {state.setup ? (
            <div className="project-sync-setup">
              <h2>Link a hosted project</h2>
              <p>
                Paste the project ID from its Worldview URL, then pair local files with hosted maps.
                The links are saved in worldview.project.json.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  port.loadProject(projectId);
                }}
              >
                <label>
                  Hosted project ID{' '}
                  <input
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                    placeholder="12-character project ID"
                    required
                  />
                </label>
                <Button type="submit" isDisabled={state.busy}>
                  Load maps
                </Button>
              </form>
              {state.setup.hostedMaps.length > 0 ? (
                <>
                  <div className="project-sync-mapping">
                    {state.localMaps.map((path) => (
                      <label key={path}>
                        {path}
                        <select
                          aria-label={`Hosted map for ${path}`}
                          value={state.setup!.mappings[path] ?? ''}
                          onChange={(event) => port.setMapping(path, event.target.value)}
                        >
                          <option value="">Not linked</option>
                          {state.setup!.hostedMaps.map((map) => (
                            <option key={map.id} value={map.id}>
                              {map.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <Button isDisabled={state.busy} onPress={() => port.saveLink()}>
                    Save project links
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          {inspection ? (
            <>
              <div className="project-sync-summary">
                <div>
                  <strong>{inspection.path}</strong>
                  <span>{statusText[inspection.status]}</span>
                </div>
                <a
                  href={`/project/${inspection.projectId}/map/${inspection.mapId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open hosted map ↗
                </a>
              </div>
              <p className="project-sync-hint">
                Review the source changes below. Red lines are local; green lines are hosted. Pull
                replaces the local file. Push replaces the hosted source.
              </p>
              {inspection.status === 'conflict' ? (
                <p className="project-sync-warning">
                  Both copies changed since the last sync. Choose the version you want to keep after
                  reviewing the diff.
                </p>
              ) : null}
              {inspection.status === 'first-link' ? (
                <p className="project-sync-warning">
                  These copies have no common sync point. Choose the version you want to keep.
                </p>
              ) : null}
              <div className="project-sync-diff" aria-label="Local and hosted source diff">
                {diffRows.slice(0, 1200).map(({ key, line, kind }) => (
                  <div key={key} className={kind}>
                    <span>{kind === 'hosted' ? '+' : kind === 'local' ? '−' : ' '}</span>
                    {line}
                  </div>
                ))}
                {truncated ? (
                  <p>
                    Diff shortened to 1,200 lines. Open both maps to inspect the rest before
                    syncing.
                  </p>
                ) : null}
              </div>
              <footer>
                <span>Hosted version {inspection.hosted.mapVersion}</span>
                <Button
                  isDisabled={state.busy || truncated || inspection.status === 'in-sync'}
                  onPress={() => port.pull()}
                >
                  Pull hosted to disk
                </Button>
                <Button
                  isDisabled={state.busy || truncated || inspection.status === 'in-sync'}
                  onPress={() => port.push()}
                >
                  Push disk to hosted
                </Button>
              </footer>
            </>
          ) : null}
        </section>
      </div>
    </dialog>
  );
}
