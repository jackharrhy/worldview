import { useEffect, useId, useState, type ReactNode } from 'react';

interface FieldProps {
  readonly label: string;
  readonly children: ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <label className="viewer-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function TextField({ label, value, onChange }: TextFieldProps) {
  return (
    <Field label={label}>
      <input value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </Field>
  );
}

interface ReadonlyFieldProps {
  readonly label: string;
  readonly value: string;
  readonly dataAttribute?: string;
  readonly multiline?: boolean;
  readonly rows?: number;
}

export function ReadonlyField({
  label,
  value,
  dataAttribute,
  multiline = false,
  rows = 3,
}: ReadonlyFieldProps) {
  const data = dataAttribute ? { [dataAttribute]: '' } : {};
  return (
    <Field label={label}>
      {multiline ? (
        <textarea {...data} value={value} rows={rows} readOnly />
      ) : (
        <input {...data} value={value} readOnly />
      )}
    </Field>
  );
}

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly onCommit: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly fractionDigits?: number;
  readonly dataAttribute?: string;
}

export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step,
  fractionDigits,
  dataAttribute,
}: NumberFieldProps) {
  const format = (number: number) =>
    fractionDigits === undefined ? String(number) : number.toFixed(fractionDigits);
  const [draft, setDraft] = useState(() => format(value));
  useEffect(() => setDraft(format(value)), [fractionDigits, value]);
  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(format(value));
      return;
    }
    const bounded = Math.min(max ?? parsed, Math.max(min ?? parsed, parsed));
    setDraft(format(bounded));
    onCommit(bounded);
  };
  const data = dataAttribute ? { [dataAttribute]: '' } : {};
  return (
    <Field label={label}>
      <input
        {...data}
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
            event.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}

interface CheckboxFieldProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

export function CheckboxField({ label, checked, onChange }: CheckboxFieldProps) {
  return (
    <label className="viewer-field viewer-field--checkbox">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

interface PanelSectionProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
}

export function PanelSection({ title, children, defaultOpen = false }: PanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  return (
    <section className="viewer-section">
      <button
        className="viewer-section__toggle"
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">{open ? '−' : '+'}</span>
        {title}
      </button>
      <div className="viewer-section__body" id={regionId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
