import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { EditorShell } from './components/editor-shell.js';
import { EditorApplication } from './editor-application.js';
import { bindEditorElements } from './editor-elements.js';
import { createEditorShellState } from './editor-shell-state.js';

import '@phosphor-icons/web/regular/style.css';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Editor root is missing');

const shellState = createEditorShellState();
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: { retry: false },
    queries: { retry: false, staleTime: 30_000 },
  },
});
let editor: EditorApplication | null = null;

function attachEditor(node: HTMLElement | null): void {
  if (!node || editor) return;
  editor = new EditorApplication(bindEditorElements(shellState));
  void editor.start().catch((error: unknown) => {
    shellState.statusMessage.setError(error instanceof Error ? error.message : String(error));
  });
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <EditorShell shellState={shellState} onReady={attachEditor} />
    </QueryClientProvider>
  </StrictMode>,
);
