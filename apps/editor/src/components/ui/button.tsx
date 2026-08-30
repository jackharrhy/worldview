import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from 'react-aria-components/Button';

export type ButtonTone = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'compact' | 'regular';

export interface ButtonProps extends Omit<AriaButtonProps, 'className'> {
  readonly tone?: ButtonTone;
  readonly size?: ButtonSize;
  readonly className?: string;
  readonly referenceState?: 'hover' | 'pressed' | 'focus';
}

export function Button({
  tone = 'secondary',
  size = 'regular',
  className = '',
  referenceState,
  ...props
}: ButtonProps) {
  return (
    <AriaButton
      className={`wv-button wv-button-${tone} wv-button-${size} ${className}`.trim()}
      data-reference-state={referenceState}
      {...props}
    />
  );
}
