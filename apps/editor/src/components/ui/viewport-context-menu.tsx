import { useRef, useSyncExternalStore } from 'react';

import type {
  ContextMenuActionSnapshot,
  ViewportContextMenuPort,
} from '../../editor-shell-state.js';
import { Menu, MenuItem, MenuSection, Popover, Submenu } from './menu.js';

function ContextAction({
  action,
  menu,
}: {
  readonly action: ContextMenuActionSnapshot;
  readonly menu: ViewportContextMenuPort;
}) {
  if (action.children) {
    return (
      <Submenu
        label={action.label}
        {...(action.disabled === undefined ? {} : { disabled: action.disabled })}
      >
        {action.children.map((child) => (
          <ContextAction key={child.id} action={child} menu={menu} />
        ))}
      </Submenu>
    );
  }
  return (
    <MenuItem
      id={action.id}
      label={action.label}
      {...(action.shortcut === undefined ? {} : { shortcut: action.shortcut })}
      {...(action.disabled === undefined ? {} : { isDisabled: action.disabled })}
      onAction={() => menu.invoke(action.id)}
    />
  );
}

export function ViewportContextMenu({ menu }: { readonly menu: ViewportContextMenuPort }) {
  const snapshot = useSyncExternalStore(menu.subscribe, menu.getSnapshot);
  const anchor = useRef<HTMLSpanElement>(null);
  return (
    <>
      <span
        ref={anchor}
        className="viewport-context-anchor"
        style={{ left: snapshot.x, top: snapshot.y }}
        aria-hidden="true"
      />
      <Popover
        id="viewport-context-menu"
        className="viewport-context-menu"
        triggerRef={anchor}
        isOpen={snapshot.open}
        onOpenChange={(open) => {
          if (!open) menu.dismiss(false);
        }}
        placement="bottom start"
        offset={2}
        containerPadding={8}
      >
        <header className="viewport-context-heading">
          <strong>{snapshot.heading}</strong>
          <span>{snapshot.detail}</span>
        </header>
        <div
          onKeyDownCapture={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            menu.dismiss(true);
          }}
        >
          <Menu aria-label="Map view actions" autoFocus="first">
            {snapshot.sections.map((section) => (
              <MenuSection key={section.id} label={section.label}>
                {section.actions.length > 0 ? (
                  section.actions.map((action) => (
                    <ContextAction key={action.id} action={action} menu={menu} />
                  ))
                ) : (
                  <MenuItem
                    id={`${section.id}:empty`}
                    label={section.emptyMessage ?? 'No actions available'}
                    isDisabled
                  />
                )}
              </MenuSection>
            ))}
          </Menu>
        </div>
      </Popover>
    </>
  );
}
