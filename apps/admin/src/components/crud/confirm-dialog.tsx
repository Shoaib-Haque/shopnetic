'use client';

import type { ReactNode } from 'react';
import {
  Button,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@shopnetic/ui';

/** Small yes/no modal, used for deletes and discard-changes prompts. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  loading = false,
  tone = 'danger',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  tone?: 'danger' | 'primary';
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="sm" closeLabel={cancelLabel}>
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          <ModalDescription>{message}</ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'primary'}
            size="sm"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
