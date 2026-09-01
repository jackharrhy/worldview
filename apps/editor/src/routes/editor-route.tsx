import { useCallback, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { EditorShell } from '../components/editor-shell.js';
import { EditorApplication } from '../editor-application.js';
import { bindEditorElements } from '../editor-elements.js';
import { createEditorShellState } from '../editor-shell-state.js';
import { takePendingEditorLaunch } from './editor-launch.js';
import { readNewMapLaunch } from './editor-navigation-state.js';
import type { HostedMapLaunch } from './hosted-project-api.js';
import { HostedMapBuildService } from '../hosted-map-build-service.js';
import type { EditorApplicationLaunch } from '../editor-application-contracts.js';
import type { DetachedHostedMap } from '../collaboration-outbox.js';
import { detachedMapPath } from './local-map-path.js';

import '../style.css';

interface EditorRouteProps {
  readonly hostedMap?: HostedMapLaunch;
  readonly detachedMap?: DetachedHostedMap;
}

export function EditorRoute({ hostedMap, detachedMap }: EditorRouteProps = {}) {
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const initialMap = useMemo(
    () => (hostedMap || detachedMap ? null : readNewMapLaunch(routeLocation.state)),
    [detachedMap, hostedMap, routeLocation.state],
  );
  const [shellState] = useState(createEditorShellState);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: false },
          queries: { retry: false, staleTime: 30_000 },
        },
      }),
  );
  const editor = useRef<EditorApplication | null>(null);
  shellState.workspaceHome.bind({
    newMap: () => location.assign('/new-map'),
    showHome: () => location.assign('/'),
    cancelNewMap: () => undefined,
    setName: () => undefined,
    setProfile: () => undefined,
    setFormat: () => undefined,
    createMap: () => undefined,
    openProject: () => undefined,
    openMap: () => undefined,
    reopenProject: () => undefined,
  });
  const attachEditor = useCallback(
    (node: HTMLElement | null) => {
      if (!node || editor.current) return;
      const applicationOptions = hostedMap
        ? {
            buildService: new HostedMapBuildService({
              mapId: hostedMap.id,
              game: hostedMap.game,
            }),
            buildServiceEnabled: true,
            onHostedMapDetached: (copy: DetachedHostedMap) => {
              void navigate(detachedMapPath(copy.id), { replace: true });
            },
          }
        : {};
      const application = new EditorApplication(
        shellState,
        bindEditorElements(),
        applicationOptions,
      );
      editor.current = application;
      delete document.documentElement.dataset.worldviewEditorReady;
      const launch: EditorApplicationLaunch | null = initialMap
        ? { kind: 'new-map', ...initialMap }
        : detachedMap
          ? { kind: 'detached-map', copy: detachedMap }
          : hostedMap
            ? {
                kind: 'hosted-map',
                id: hostedMap.id,
                name: hostedMap.name,
                source: hostedMap.source,
                projectName: hostedMap.projectName,
                game: hostedMap.game,
                mapVersion: hostedMap.mapVersion,
                actorId: hostedMap.actorId,
                displayName: hostedMap.displayName,
                resources: hostedMap.resources ?? [],
              }
            : takePendingEditorLaunch();
      void (async () => {
        await application.start(launch);
        application.signal.throwIfAborted();
        if (editor.current === application)
          document.documentElement.dataset.worldviewEditorReady = 'true';
      })().catch((error: unknown) => {
        if (application.signal.aborted) return;
        shellState.statusMessage.setError(error instanceof Error ? error.message : String(error));
      });
      return () => {
        const ownsRoute = editor.current === application;
        application.dispose();
        if (!ownsRoute) return;
        editor.current = null;
        delete document.documentElement.dataset.worldviewEditorReady;
      };
    },
    [detachedMap, hostedMap, initialMap, navigate, shellState],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <EditorShell shellState={shellState} onReady={attachEditor} />
    </QueryClientProvider>
  );
}

export function Component() {
  return <EditorRoute />;
}
