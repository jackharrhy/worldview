import type { ReactNode } from 'react';
import {
  CheckboxButton,
  CheckboxField,
  FieldError,
  Text,
  type CheckboxFieldProps,
} from 'react-aria-components/Checkbox';

export interface CheckboxProps extends Omit<CheckboxFieldProps, 'children' | 'className'> {
  readonly children: ReactNode;
  readonly description?: string;
  readonly errorMessage?: ReactNode;
  readonly className?: string;
  readonly referenceState?: 'hover' | 'focus' | 'pressed';
}

export function Checkbox({
  children,
  description,
  errorMessage,
  className = '',
  referenceState,
  ...props
}: CheckboxProps) {
  return (
    <CheckboxField className={`wv-checkbox-field ${className}`.trim()} {...props}>
      <CheckboxButton className="wv-checkbox" data-reference-state={referenceState}>
        {({ isIndeterminate }) => (
          <>
            <span className="wv-checkbox-indicator" aria-hidden="true">
              <i className={`ph ${isIndeterminate ? 'ph-minus' : 'ph-check'}`} />
            </span>
            <span className="wv-checkbox-label">{children}</span>
          </>
        )}
      </CheckboxButton>
      {description ? (
        <Text className="wv-field-description wv-checkbox-description" slot="description">
          {description}
        </Text>
      ) : null}
      <FieldError className="wv-field-error">{errorMessage}</FieldError>
    </CheckboxField>
  );
}
