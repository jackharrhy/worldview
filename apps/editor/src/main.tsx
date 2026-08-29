import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import './routes/landing.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Editor root is missing');

if (location.pathname === '/' && new URLSearchParams(location.hash.slice(1)).has('room')) {
  history.replaceState(null, '', `/editor${location.search}${location.hash}`);
}

function RouteLoading() {
  return <main className="route-loading">Loading…</main>;
}

const router = createBrowserRouter([
  {
    path: '/',
    HydrateFallback: RouteLoading,
    lazy: {
      loader: async () => (await import('./routes/home-loader.js')).loader,
      Component: async () => (await import('./routes/home-route.js')).Component,
    },
  },
  {
    path: '/new-map',
    HydrateFallback: RouteLoading,
    lazy: {
      action: async () => (await import('./routes/new-map-action.js')).action,
      Component: async () => (await import('./routes/new-map-route.js')).Component,
    },
  },
  {
    path: '/new-project',
    HydrateFallback: RouteLoading,
    lazy: {
      action: async () => (await import('./routes/new-project-action.js')).action,
      Component: async () => (await import('./routes/new-project-route.js')).Component,
    },
  },
  {
    path: '/projects/:projectId',
    HydrateFallback: RouteLoading,
    lazy: {
      loader: async () => (await import('./routes/project-loader.js')).loader,
      action: async () => (await import('./routes/project-action.js')).action,
      Component: async () => (await import('./routes/project-route.js')).Component,
    },
  },
  {
    path: '/projects/:projectId/maps/:mapId',
    HydrateFallback: RouteLoading,
    lazy: {
      loader: async () => (await import('./routes/hosted-map-loader.js')).loader,
      Component: async () => (await import('./routes/hosted-map-route.js')).Component,
    },
  },
  {
    path: '/shared/:projectId/maps/:mapId',
    HydrateFallback: RouteLoading,
    lazy: {
      Component: async () => (await import('./routes/shared-map-route.js')).Component,
    },
  },
  {
    path: '/editor',
    HydrateFallback: RouteLoading,
    lazy: {
      Component: async () => (await import('./routes/editor-route.js')).Component,
    },
  },
]);

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
