import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import {
  Modal,
  ModalContent,
  useModalBoundary,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@shopnetic/ui';

afterEach(cleanup);

function BoundaryProbe({ id = 'probe' }: { id?: string }) {
  const boundary = useModalBoundary();
  return (
    <div
      data-testid={id}
      data-has-boundary={boundary !== null ? 'true' : 'false'}
      data-boundary-tag={boundary?.tagName?.toLowerCase() ?? 'none'}
      data-boundary-testid={boundary?.getAttribute('data-testid') ?? 'none'}
    />
  );
}

describe('ModalBoundaryContext and SelectContent integration', () => {
  it('provides modal boundary element reactively to nested components inside ModalContent', () => {
    render(
      <Modal open onOpenChange={vi.fn()}>
        <ModalContent size="md" data-testid="test-modal">
          <BoundaryProbe />
          <Select defaultValue="one">
            <SelectTrigger aria-label="Choose inside modal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one">One</SelectItem>
            </SelectContent>
          </Select>
        </ModalContent>
      </Modal>,
    );

    const probe = screen.getByTestId('probe');
    expect(probe.getAttribute('data-has-boundary')).toBe('true');
    expect(probe.getAttribute('data-boundary-tag')).toBe('div');
    expect(probe.getAttribute('data-boundary-testid')).toBe('test-modal');
  });

  it('evaluates to null boundary when used outside of ModalContent', () => {
    render(
      <div>
        <BoundaryProbe />
        <Select defaultValue="one">
          <SelectTrigger aria-label="Choose outside modal">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="one">One</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    );

    const probe = screen.getByTestId('probe');
    expect(probe.getAttribute('data-has-boundary')).toBe('false');
    expect(probe.getAttribute('data-boundary-tag')).toBe('none');
    expect(probe.getAttribute('data-boundary-testid')).toBe('none');
  });

  it('reactively binds boundary to asynchronously mounted child components inside ModalContent', async () => {
    function DeferredChild() {
      const [mounted, setMounted] = useState(false);
      useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 20);
        return () => clearTimeout(timer);
      }, []);

      if (!mounted) {
        return <div data-testid="loading-state">Loading...</div>;
      }

      return <BoundaryProbe id="deferred-probe" />;
    }

    render(
      <Modal open onOpenChange={vi.fn()}>
        <ModalContent size="md" data-testid="async-modal">
          <DeferredChild />
        </ModalContent>
      </Modal>,
    );

    expect(screen.getByTestId('loading-state')).toBeInTheDocument();

    const deferredProbe = await screen.findByTestId('deferred-probe');
    expect(deferredProbe.getAttribute('data-has-boundary')).toBe('true');
    expect(deferredProbe.getAttribute('data-boundary-tag')).toBe('div');
    expect(deferredProbe.getAttribute('data-boundary-testid')).toBe('async-modal');
  });

  it('isolates boundary references cleanly across sibling modal transitions without leakage', async () => {
    function SiblingModals() {
      const [activeModal, setActiveModal] = useState<'a' | 'b'>('a');

      return (
        <div>
          <button
            type="button"
            data-testid="toggle-modal-btn"
            onClick={() => setActiveModal((prev) => (prev === 'a' ? 'b' : 'a'))}
          >
            Switch Modal
          </button>

          <Modal open={activeModal === 'a'} onOpenChange={vi.fn()}>
            <ModalContent size="md" data-testid="modal-a-content">
              <BoundaryProbe id="probe-a" />
            </ModalContent>
          </Modal>

          <Modal open={activeModal === 'b'} onOpenChange={vi.fn()}>
            <ModalContent size="lg" data-testid="modal-b-content">
              <BoundaryProbe id="probe-b" />
            </ModalContent>
          </Modal>
        </div>
      );
    }

    render(<SiblingModals />);

    // Step 1: Modal A is active
    const probeA = screen.getByTestId('probe-a');
    expect(probeA.getAttribute('data-has-boundary')).toBe('true');
    expect(probeA.getAttribute('data-boundary-testid')).toBe('modal-a-content');
    expect(screen.queryByTestId('probe-b')).toBeNull();

    // Step 2: Transition to Modal B
    fireEvent.click(screen.getByTestId('toggle-modal-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('probe-a')).toBeNull();
      expect(screen.getByTestId('probe-b')).toBeInTheDocument();
    });

    const probeB = screen.getByTestId('probe-b');
    expect(probeB.getAttribute('data-has-boundary')).toBe('true');
    expect(probeB.getAttribute('data-boundary-testid')).toBe('modal-b-content');

    // Step 3: Transition back to Modal A
    fireEvent.click(screen.getByTestId('toggle-modal-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('probe-b')).toBeNull();
      expect(screen.getByTestId('probe-a')).toBeInTheDocument();
    });

    const restoredProbeA = screen.getByTestId('probe-a');
    expect(restoredProbeA.getAttribute('data-has-boundary')).toBe('true');
    expect(restoredProbeA.getAttribute('data-boundary-testid')).toBe('modal-a-content');
  });

  it('preserves innermost boundary scoping when modals are nested', () => {
    render(
      <Modal open onOpenChange={vi.fn()}>
        <ModalContent size="lg" data-testid="outer-modal">
          <BoundaryProbe id="outer-probe" />
          <Modal open onOpenChange={vi.fn()}>
            <ModalContent size="sm" data-testid="inner-modal">
              <BoundaryProbe id="inner-probe" />
            </ModalContent>
          </Modal>
        </ModalContent>
      </Modal>,
    );

    const outerProbe = screen.getByTestId('outer-probe');
    const innerProbe = screen.getByTestId('inner-probe');

    expect(outerProbe.getAttribute('data-boundary-testid')).toBe('outer-modal');
    expect(innerProbe.getAttribute('data-boundary-testid')).toBe('inner-modal');
  });
});
