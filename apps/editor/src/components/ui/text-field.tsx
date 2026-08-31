import type { ReactNode, Ref } from 'react';
import {
  FieldError,
  Input,
  Label,
  Text,
  TextField as AriaTextField,
  type InputProps,
  type TextFieldProps as AriaTextFieldProps,
} from 'react-aria-components/TextField';

export interface TextFieldProps extends Omit<AriaTextFieldProps, 'children' | 'className'> {
  readonly label: string;
  readonly description?: string;
  readonly errorMessage?: ReactNode;
  readonly input?: InputProps;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly className?: string;
  readonly hideLabel?: boolean;
  readonly referenceState?: 'hover' | 'focus' | 'invalid';
}

export function TextField({
  label,
  description,
  errorMessage,
  input,
  inputRef,
  className = '',
  hideLabel = false,
  referenceState,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField
      className={`wv-field ${className}`.trim()}
      data-reference-state={referenceState}
      {...(hideLabel ? { 'aria-label': label } : {})}
      {...props}
    >
      {hideLabel ? null : <Label className="wv-field-label">{label}</Label>}
      <Input ref={inputRef} className="wv-input" {...input} />
      {description ? (
        <Text className="wv-field-description" slot="description">
          {description}
        </Text>
      ) : null}
      <FieldError className="wv-field-error">{errorMessage}</FieldError>
    </AriaTextField>
  );
}
