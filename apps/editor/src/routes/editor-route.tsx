import { useCallback, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { EditorShell } from '../components/editor-shell.js';
import { EditorApplication } from '../editor-application.js';
import { bindEditorElements } from '../editor-elements.js';
import { createEditorShellState } from '../editor-shell-state.js';
import { takePendingEditorLaunch } from './editor-launch.js';
import { readNewMapLaunch } from './editor-navigation-state.js';
import type { HostedMapLaunch } from './hosted-project-api.js';
import { HostedMapBuildService } from '../hosted-map-build-service.js';

import '../style.css';

interface EditorRouteProps {
  readonly hostedMap?: HostedMapLaunch;
}

export function EditorRoute({ hostedMap }: EditorRouteProps = {}) {
  const routeLocation = useLocation();
  const initialMap = useMemo(
    () => (hostedMap ? null : readNewMapLaunch(routeLocation.state)),
    [hostedMap, routeLocation.state],
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
          }
        : {};
      const application = new EditorApplication(
        shellState,
        bindEditorElements(),
        applicationOptions,
      );
      editor.current = application;
      delete document.documentElement.dataset.worldviewEditorReady;
      void (async () => {
        await application.start();
        application.signal.throwIfAborted();
        if (initialMap) {
          application.project.createNewMap(
            initialMap.profile,
            initialMap.format,
            initialMap.name,
            initialMap.workspaceId,
          );
        } else if (hostedMap) {
          const source = new File([hostedMap.source], hostedMap.name, { type: 'text/plain' });
          await application.project.openEditorMap(source, null, hostedMap.name, {
            throwOnError: true,
            viewportWorkspaceKey: `hosted-map:${hostedMap.id}`,
          });
          application.signal.throwIfAborted();
          application.project.loadHostedResources(hostedMap.resources ?? []);
          await application.collaborationUi.joinHostedMap(
            hostedMap.id,
            hostedMap.actorId,
            hostedMap.displayName,
          );
          application.signal.throwIfAborted();
          shellState.statusMessage.set(
            `Opened hosted map ${hostedMap.projectName} / ${hostedMap.name} · live at v${hostedMap.mapVersion}`,
          );
        } else {
          const launch = takePendingEditorLaunch();
          if (launch?.kind === 'project')
            await application.project.openProjectDirectory(launch.handle);
          else if (launch?.kind === 'recent-project')
            await application.project.reopenProject(launch.projectKey);
          else if (launch?.kind === 'map')
            await application.project.openEditorMap(launch.file, null);
        }
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
    [hostedMap, initialMap, shellState],
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
