import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Modal, ModalContent, ModalHeader, ModalTitle, isToastInteraction } from '@shopnetic/ui';

afterEach(cleanup);

describe('Modal toast interaction guard', () => {
  it('isToastInteraction returns true for targets inside toast container', () => {
    render(
      <div data-sonner-toaster="true">
        <button type="button">Undo Toast</button>
      </div>,
    );
    const btn = screen.getByText('Undo Toast');
    const nativeEvent = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(nativeEvent, 'target', { value: btn });
    const mockEvent = {
      detail: {
        originalEvent: nativeEvent,
      },
    };
    expect(isToastInteraction(mockEvent)).toBe(true);
  });

  it('isToastInteraction returns false for normal targets', () => {
    render(
      <div>
        <button type="button">Normal Button</button>
      </div>,
    );
    const btn = screen.getByText('Normal Button');
    const nativeEvent = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(nativeEvent, 'target', { value: btn });
    const mockEvent = {
      detail: {
        originalEvent: nativeEvent,
      },
    };
    expect(isToastInteraction(mockEvent)).toBe(false);
  });

  it('does not close the modal when clicking inside a sonner toast container', () => {
    const onOpenChange = vi.fn();
    render(
      <div>
        <div data-sonner-toaster="true">
          <button type="button">Undo Toast Action</button>
        </div>
        <Modal open onOpenChange={onOpenChange}>
          <ModalContent>
            <ModalHeader>
              <ModalTitle>Test Modal</ModalTitle>
            </ModalHeader>
          </ModalContent>
        </Modal>
      </div>,
    );

    const toastButton = screen.getByText('Undo Toast Action');
    fireEvent.pointerDown(toastButton);

    // Modal should not have been requested to close
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
