import type { HTMLAttributes, ReactNode } from 'react';
import { Tooltip, TooltipTrigger } from 'react-aria-components/Tooltip';

import { Button, type ButtonProps } from './button.js';
import { ICON_GLYPHS, type IconName } from './icon-registry.js';

export type { IconName } from './icon-registry.js';

export interface IconProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  readonly name: IconName;
}

export function Icon({ name, className = '', ...props }: IconProps) {
  return (
    <i
      className={`ph ph-${ICON_GLYPHS[name]} wv-icon ${className}`.trim()}
      aria-hidden="true"
      {...props}
    />
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'aria-label'> {
  readonly icon: IconName;
  readonly label: string;
  readonly tooltip?: ReactNode;
  readonly badge?: ReactNode;
}

export function IconButton({
  icon,
  label,
  tooltip = label,
  badge,
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <TooltipTrigger delay={500} closeDelay={0}>
      <Button
        className={`wv-icon-button ${className}`.trim()}
        size="compact"
        tone="quiet"
        aria-label={label}
        {...props}
      >
        <Icon name={icon} />
        {badge}
      </Button>
      <Tooltip className="wv-tooltip" placement="bottom">
        {tooltip}
      </Tooltip>
    </TooltipTrigger>
  );
}
