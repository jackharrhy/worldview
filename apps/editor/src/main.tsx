import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { EditorShell } from './components/editor-shell.js';
import { EditorApplication } from './editor-application.js';
import { bindEditorElements } from './editor-elements.js';

import '@phosphor-icons/web/regular/style.css';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Editor root is missing');

const reactRoot = createRoot(root);
flushSync(() => reactRoot.render(<EditorShell />));

const editor = new EditorApplication(bindEditorElements());
await editor.start();
