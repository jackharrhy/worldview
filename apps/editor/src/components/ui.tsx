import type { PropsWithChildren, ReactNode } from 'react';
import { Link } from 'react-router';

export { Button } from './ui/button.js';
export type { ButtonProps, ButtonSize, ButtonTone } from './ui/button.js';
import { Button, type ButtonProps } from './ui/button.js';

export function ProductPage({
  children,
  wide = false,
  className = '',
}: PropsWithChildren<{
  readonly wide?: boolean;
  readonly className?: string;
}>) {
  return (
    <main className={`product-page${wide ? ' product-page-wide' : ''} ${className}`.trim()}>
      {children}
    </main>
  );
}

export function ProductHeader({
  title,
  description,
  backTo,
  backLabel = 'Back',
  aside,
  centered = false,
  showWordmark = true,
}: {
  readonly title: string;
  readonly description?: string;
  readonly backTo?: string;
  readonly backLabel?: string;
  readonly aside?: ReactNode;
  readonly centered?: boolean;
  readonly showWordmark?: boolean;
}) {
  return (
    <header className={`product-header${centered ? ' product-header-centered' : ''}`}>
      <div className="product-header-primary">
        {backTo ? (
          <Link to={backTo} className="text-action product-back">
            <i className="ph ph-arrow-left" aria-hidden="true" />
            {backLabel}
          </Link>
        ) : showWordmark ? (
          <span className="product-wordmark">WORLDVIEW</span>
        ) : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {aside ? <div className="product-header-aside">{aside}</div> : null}
    </header>
  );
}

export function SectionHeading({
  title,
  detail,
}: {
  readonly title: string;
  readonly detail?: ReactNode;
}) {
  return (
    <header className="section-heading-row">
      <h2>{title}</h2>
      {detail ? <span>{detail}</span> : null}
    </header>
  );
}

export function EmptyState({ children }: PropsWithChildren) {
  return <div className="empty-state">{children}</div>;
}

export function Field({
  label,
  hint,
  children,
}: PropsWithChildren<{ readonly label: string; readonly hint?: string }>) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function ActionButton({ tone = 'secondary', className = '', ...props }: ButtonProps) {
  return <Button tone={tone} className={className} {...props} />;
}

export function FormSurface({ children }: PropsWithChildren) {
  return <div className="form-surface">{children}</div>;
}
