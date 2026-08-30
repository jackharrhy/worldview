import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  type TabListProps as AriaTabListProps,
  type TabPanelProps as AriaTabPanelProps,
  type TabProps as AriaTabProps,
  type TabsProps as AriaTabsProps,
} from 'react-aria-components/Tabs';

export function Tabs({
  className = '',
  ...props
}: AriaTabsProps & { readonly className?: string }) {
  return <AriaTabs className={`wv-tabs ${className}`.trim()} {...props} />;
}

export function TabList<T>({
  className = '',
  ...props
}: AriaTabListProps<T> & { readonly className?: string }) {
  return <AriaTabList className={`wv-tab-list ${className}`.trim()} {...props} />;
}

export function Tab({ className = '', ...props }: AriaTabProps & { readonly className?: string }) {
  return <AriaTab className={`wv-tab ${className}`.trim()} {...props} />;
}

export function TabPanel({
  className = '',
  ...props
}: AriaTabPanelProps & { readonly className?: string }) {
  return <AriaTabPanel className={`wv-tab-panel ${className}`.trim()} {...props} />;
}
