import { useRef, useState } from 'react';
import { MenuTrigger } from 'react-aria-components/Menu';
import { Link, useNavigate } from 'react-router';
import type { EditorDirectoryHandle } from '../project-workspace.js';
import { setPendingEditorLaunch } from '../routes/editor-launch.js';
import { Button } from './ui/button.js';
import { Icon } from './ui/icon.js';
import { Menu, MenuItem, MenuSection, Popover } from './ui/menu.js';

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options: { readonly mode: 'readwrite' }) => Promise<EditorDirectoryHandle>;
}

export function ApplicationHeader() {
  const navigate = useNavigate();
  const mapInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const openProject = async () => {
    try {
      const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
      if (!picker) throw new Error('Project folders require Chromium File System Access.');
      const handle = await picker({ mode: 'readwrite' });
      setPendingEditorLaunch({ kind: 'project', handle });
      void navigate('/editor');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const onAction = (action: string) => {
    if (action === 'home') void navigate('/');
    if (action === 'editor') void navigate('/editor');
    if (action === 'new') void navigate('/new-map');
    if (action === 'open-map') mapInput.current?.click();
    if (action === 'open-project') void openProject();
  };

  return (
    <>
      <header className="application-topbar">
        <MenuTrigger>
          <Button
            className="application-menu-trigger"
            tone="quiet"
            size="compact"
            aria-label="Worldview document menu"
          >
            <Icon name="viewport-3d" />
          </Button>
          <Popover className="toolbar-menu-popover" placement="bottom start" offset={0}>
            <div className="application-menu-heading">Worldview Editor</div>
            <Menu aria-label="Worldview document menu" onAction={(key) => onAction(String(key))}>
              <MenuSection label="File" showHeading={false}>
                <MenuItem id="home" icon="home" label="Projects" />
                <MenuItem id="editor" icon="viewport-3d" label="Open editor" />
                <MenuItem id="new" icon="new-map" label="New map" />
                <MenuItem id="open-map" icon="open-map" label="Open map file" />
                <MenuItem id="open-project" icon="open-project" label="Open project folder" />
              </MenuSection>
            </Menu>
          </Popover>
        </MenuTrigger>
        <Link to="/" className="application-topbar-name">
          Worldview
        </Link>
        <input
          ref={mapInput}
          type="file"
          accept=".map,text/plain"
          aria-label="Open map file"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            setPendingEditorLaunch({ kind: 'map', file });
            void navigate('/editor');
          }}
        />
      </header>
      {error ? (
        <p className="application-header-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
