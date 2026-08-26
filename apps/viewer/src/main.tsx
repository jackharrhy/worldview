import { createRoot } from 'react-dom/client';

import { ViewerApp } from './components/viewer-app.js';
import { selectableFixtures } from './fixture-catalog.js';
import { ViewerController } from './viewer-controller.js';
import { createViewerStore } from './viewer-state.js';
import './style.css';

const store = createViewerStore(selectableFixtures[0]?.id ?? '');
const controller = new ViewerController(store);
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Viewer application root is missing');

createRoot(app).render(<ViewerApp controller={controller} store={store} />);
