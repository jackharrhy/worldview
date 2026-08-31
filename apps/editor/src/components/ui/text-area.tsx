import type { ReactNode } from 'react';
import {
  FieldError,
  Label,
  Text,
  TextArea as AriaTextArea,
  TextField,
  type TextAreaProps as AriaTextAreaProps,
  type TextFieldProps,
} from 'react-aria-components/TextField';

export interface TextAreaProps extends Omit<TextFieldProps, 'children' | 'className'> {
  readonly label: string;
  readonly description?: string;
  readonly errorMessage?: ReactNode;
  readonly input?: AriaTextAreaProps;
  readonly className?: string;
}

export function TextArea({
  label,
  description,
  errorMessage,
  input,
  className = '',
  ...props
}: TextAreaProps) {
  return (
    <TextField className={`wv-field wv-text-area ${className}`.trim()} {...props}>
      <Label className="wv-field-label">{label}</Label>
      <AriaTextArea className="wv-input" {...input} />
      {description ? (
        <Text className="wv-field-description" slot="description">
          {description}
        </Text>
      ) : null}
      <FieldError className="wv-field-error">{errorMessage}</FieldError>
    </TextField>
  );
}
