import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ViewerApp } from './components/viewer-app.js';
import { selectableFixtures } from './fixture-catalog.js';
import { ViewerController } from './viewer-controller.js';
import { createViewerSnapshotReaders, createViewerStore } from './viewer-state.js';
import './style.css';

const store = createViewerStore(selectableFixtures[0]?.id ?? '');
const readers = createViewerSnapshotReaders(store);
const controller = new ViewerController(store);
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: { retry: false },
    queries: { retry: false, staleTime: 30_000 },
  },
});
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Viewer application root is missing');

createRoot(app).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ViewerApp controller={controller} readers={readers} />
    </QueryClientProvider>
  </StrictMode>,
);
