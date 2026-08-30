import type { ReactNode } from 'react';
import { Dialog as AriaDialog, Heading } from 'react-aria-components/Dialog';
import {
  Modal as AriaModal,
  ModalOverlay,
  type ModalOverlayProps,
} from 'react-aria-components/Modal';

import { Button } from './button.js';

export interface DialogProps extends Omit<ModalOverlayProps, 'children' | 'className'> {
  readonly id?: string;
  readonly title: string;
  readonly detail?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly closeLabel?: string;
}

export function Dialog({
  id,
  title,
  detail,
  children,
  className = '',
  closeLabel = 'Close',
  ...props
}: DialogProps) {
  return (
    <ModalOverlay className="wv-modal-overlay" {...props}>
      <AriaModal className={`wv-modal ${className}`.trim()}>
        <AriaDialog {...(id ? { id } : {})} className="wv-dialog">
          {({ close }) => (
            <>
              <header className="wv-dialog-header">
                <div>
                  <Heading className="wv-dialog-title" slot="title">
                    {title}
                  </Heading>
                  {detail ? <span className="wv-dialog-detail">{detail}</span> : null}
                </div>
                <Button tone="quiet" size="compact" onPress={close}>
                  {closeLabel}
                </Button>
              </header>
              {children}
            </>
          )}
        </AriaDialog>
      </AriaModal>
    </ModalOverlay>
  );
}
