import { useState } from 'react';
import type { EditorShellState } from '../../editor-shell-state.js';
import type { ProjectToolbarSnapshot } from '../../project-build-ui-state.js';
import { Button } from '../ui/button.js';

export function ProjectMapSelector({
  shellState,
  project,
}: {
  readonly shellState: EditorShellState;
  readonly project: ProjectToolbarSnapshot;
}) {
  const [query, setQuery] = useState('');
  const maps = project.maps.filter((map) =>
    map.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section className="project-map-selector" aria-labelledby="project-map-selector-title">
      <div className="project-map-selector-content">
        <header>
          <span>Local project</span>
          <h1 id="project-map-selector-title">{project.projectName}</h1>
          <p>Choose a map to start editing.</p>
        </header>
        <div className="project-map-selector-list">
          <div className="project-map-selector-list-heading">
            <strong>
              Maps <span>{project.maps.length}</span>
            </strong>
            {project.maps.length > 5 ? (
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter maps"
                aria-label="Filter project maps"
              />
            ) : null}
          </div>
          {project.maps.length === 0 ? (
            <p className="project-map-selector-empty">
              No .map files were found under this project’s map roots.
            </p>
          ) : null}
          {project.maps.length > 0 && maps.length === 0 ? (
            <p className="project-map-selector-empty">No maps match “{query}”.</p>
          ) : null}
          {maps.map((map) => {
            const last = map.id === project.lastMapId;
            const slash = map.label.lastIndexOf('/');
            return (
              <button
                key={map.id}
                type="button"
                className="project-map-selector-row"
                aria-label={`Open ${map.label}`}
                onClick={() => shellState.projectToolbar.openMap(map.id)}
              >
                <span className="project-map-selector-map-name">
                  {slash < 0 ? map.label : map.label.slice(slash + 1)}
                  <small>{slash < 0 ? '.' : map.label.slice(0, slash)}</small>
                </span>
                {last ? <span className="project-map-selector-last">Last opened</span> : null}
                <span className="project-map-selector-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            );
          })}
        </div>
        <footer>
          <Button size="compact" onPress={() => shellState.projectSync.open()}>
            Project sync
          </Button>
        </footer>
      </div>
    </section>
  );
}
