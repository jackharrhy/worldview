import type { ReactNode } from 'react';
import {
  Button,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  Text,
  type SelectProps as AriaSelectProps,
} from 'react-aria-components/Select';
import { Icon } from './icon.js';

export interface SelectOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface SelectProps extends Omit<
  AriaSelectProps<SelectOption>,
  'children' | 'className' | 'items'
> {
  readonly label: string;
  readonly options: readonly SelectOption[];
  readonly description?: string;
  readonly errorMessage?: ReactNode;
  readonly hideLabel?: boolean;
  readonly className?: string;
  readonly referenceState?: 'hover' | 'focus' | 'open' | 'invalid';
}

export function Select({
  label,
  options,
  description,
  errorMessage,
  hideLabel = false,
  className = '',
  referenceState,
  ...props
}: SelectProps) {
  return (
    <AriaSelect
      className={`wv-select ${className}`.trim()}
      data-reference-state={referenceState}
      {...(hideLabel ? { 'aria-label': label } : {})}
      {...props}
    >
      {hideLabel ? null : <Label className="wv-field-label">{label}</Label>}
      <Button className="wv-select-trigger">
        <SelectValue className="wv-select-value" />
        <Icon name="caret-down" className="wv-select-caret" />
      </Button>
      {description ? (
        <Text className="wv-field-description" slot="description">
          {description}
        </Text>
      ) : null}
      <FieldError className="wv-field-error">{errorMessage}</FieldError>
      <Popover className="wv-popover wv-select-popover" placement="bottom start" offset={2}>
        <ListBox className="wv-listbox" items={options}>
          {(option) => (
            <ListBoxItem
              className="wv-listbox-item"
              id={option.id}
              textValue={option.label}
              {...(option.disabled === undefined ? {} : { isDisabled: option.disabled })}
            >
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
              <Icon name="check" className="wv-listbox-check" />
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
