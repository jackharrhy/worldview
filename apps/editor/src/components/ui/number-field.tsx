import type { ReactNode } from 'react';
import {
  Button,
  FieldError,
  Group,
  Input,
  Label,
  NumberField as AriaNumberField,
  Text,
  type InputProps,
  type NumberFieldProps as AriaNumberFieldProps,
} from 'react-aria-components/NumberField';
import { Icon } from './icon.js';

export interface NumberFieldProps extends Omit<AriaNumberFieldProps, 'children' | 'className'> {
  readonly label: string;
  readonly description?: string;
  readonly errorMessage?: ReactNode;
  readonly input?: InputProps;
  readonly hideSteppers?: boolean;
  readonly className?: string;
  readonly referenceState?: 'hover' | 'focus' | 'invalid';
}

export function NumberField({
  label,
  description,
  errorMessage,
  input,
  hideSteppers = false,
  className = '',
  referenceState,
  ...props
}: NumberFieldProps) {
  return (
    <AriaNumberField
      className={`wv-field wv-number-field ${className}`.trim()}
      data-reference-state={referenceState}
      {...props}
    >
      <Label className="wv-field-label">{label}</Label>
      <Group className="wv-number-control">
        <Input className="wv-input" {...input} />
        {hideSteppers ? null : (
          <span className="wv-number-steppers">
            <Button className="wv-number-stepper" slot="increment">
              <Icon name="caret-up" />
            </Button>
            <Button className="wv-number-stepper" slot="decrement">
              <Icon name="caret-down" />
            </Button>
          </span>
        )}
      </Group>
      {description ? (
        <Text className="wv-field-description" slot="description">
          {description}
        </Text>
      ) : null}
      <FieldError className="wv-field-error">{errorMessage}</FieldError>
    </AriaNumberField>
  );
}
