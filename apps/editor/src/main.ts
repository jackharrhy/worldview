import { renderEditorShell } from './app-shell.js';
import { EditorApplication } from './editor-application.js';
import { bindEditorElements } from './editor-elements.js';

import '@phosphor-icons/web/regular/style.css';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Editor root is missing');

root.innerHTML = renderEditorShell();

const editor = new EditorApplication(bindEditorElements());
await editor.start();
