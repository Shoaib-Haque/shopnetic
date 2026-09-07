'use client';

import { useState, type FormEventHandler, type ReactNode } from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@shopnetic/ui';
import { useTranslations } from 'next-intl';
import { ConfirmDialog } from './confirm-dialog';

/**
 * A centered modal wrapping a form: header, scrollable field area, sticky
 * submit/cancel footer. If `dirty`, closing via Esc / overlay / cancel / × first
 * asks the user to confirm discarding changes.
 */
export function FormModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitting = false,
  submitLabel,
  /** rendered left-aligned in the footer — e.g. a Delete / Restore button */
  secondaryAction,
  dirty = false,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  submitting?: boolean;
  submitLabel: string;
  secondaryAction?: ReactNode;
  dirty?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const t = useTranslations('admin');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  function requestChange(next: boolean): void {
    if (!next && dirty && !submitting) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(next);
  }

  return (
    <>
      <Modal open={open} onOpenChange={requestChange}>
        <ModalContent size={size} closeLabel={t('actions.cancel')}>
          <ModalHeader>
            <ModalTitle>{title}</ModalTitle>
            {description !== undefined && <ModalDescription>{description}</ModalDescription>}
          </ModalHeader>
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            <ModalBody className="flex flex-col gap-4">{children}</ModalBody>
            <ModalFooter className={secondaryAction ? 'justify-between' : undefined}>
              {secondaryAction ?? null}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => requestChange(false)}
                  disabled={submitting}
                >
                  {t('actions.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  loading={submitting}
                  loadingText={t('actions.saving')}
                >
                  {submitLabel}
                </Button>
              </div>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t('form.discardTitle')}
        message={t('form.discardMessage')}
        confirmLabel={t('form.discardConfirm')}
        cancelLabel={t('actions.cancel')}
        onConfirm={() => {
          setConfirmDiscard(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
