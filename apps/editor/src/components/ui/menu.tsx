import type { PropsWithChildren, ReactNode } from 'react';
import {
  Header,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  Popover as AriaPopover,
  SubmenuTrigger,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
  type PopoverProps as AriaPopoverProps,
} from 'react-aria-components/Menu';

export function Menu<T extends object>({ className = '', ...props }: AriaMenuProps<T>) {
  return <AriaMenu className={`wv-menu ${className}`.trim()} {...props} />;
}

export interface MenuItemProps extends Omit<AriaMenuItemProps, 'children' | 'className'> {
  readonly label: string;
  readonly shortcut?: string;
  readonly submenu?: boolean;
  readonly referenceState?: 'focused' | 'open';
}

function accessibleShortcut(shortcut: string | undefined): string | undefined {
  return shortcut?.replaceAll('Ctrl', 'Control').replaceAll('Cmd', 'Meta');
}

export function MenuItem({
  label,
  shortcut,
  submenu = false,
  referenceState,
  ...props
}: MenuItemProps) {
  return (
    <AriaMenuItem
      className="wv-menu-item"
      textValue={label}
      data-reference-state={referenceState}
      aria-keyshortcuts={accessibleShortcut(shortcut)}
      {...props}
    >
      <span className="wv-menu-item-label">{label}</span>
      {shortcut ? (
        <kbd className="wv-menu-shortcut" aria-hidden="true">
          {shortcut}
        </kbd>
      ) : null}
      {submenu ? <i className="ph ph-caret-right wv-menu-submenu-mark" aria-hidden="true" /> : null}
    </AriaMenuItem>
  );
}

export function MenuSection({ label, children }: PropsWithChildren<{ readonly label: string }>) {
  return (
    <AriaMenuSection className="wv-menu-section">
      <Header className="wv-menu-section-heading">{label}</Header>
      {children}
    </AriaMenuSection>
  );
}

export interface PopoverProps extends AriaPopoverProps {
  readonly id?: string;
}

export function Popover({ className = '', ...props }: PopoverProps) {
  return (
    <AriaPopover className={`wv-popover ${className}`.trim()} {...(props as AriaPopoverProps)} />
  );
}

export function Submenu({
  label,
  disabled = false,
  children,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <SubmenuTrigger delay={100}>
      <MenuItem label={label} isDisabled={disabled} submenu />
      <Popover className="wv-submenu-popover" placement="right top" offset={2}>
        <Menu aria-label={label} autoFocus="first">
          {children}
        </Menu>
      </Popover>
    </SubmenuTrigger>
  );
}
