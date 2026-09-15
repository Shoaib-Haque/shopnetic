import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { AuditEvent } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { triggerIntersection } from '@/test/intersection-observer';
import { listAuditEvents } from '../api';
import { AuditLog } from './audit-log';

vi.mock('../api', () => ({ listAuditEvents: vi.fn() }));

const mockedListAuditEvents = vi.mocked(listAuditEvents);

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: '01a0000000000000000000001',
    actorAccountId: 'acc-1',
    actorEmail: 'super@example.com',
    action: 'identity.staff_activated',
    targetType: 'account',
    targetId: 'acc-2',
    before: null,
    after: null,
    reason: null,
    ip: null,
    correlationId: null,
    createdAt: '2026-09-15T10:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mockedListAuditEvents.mockReset();
});

describe('AuditLog', () => {
  it('load error → shows the error state, retry re-fetches', async () => {
    mockedListAuditEvents
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ events: [event()], nextCursor: undefined });

    renderAdmin(<AuditLog />);
    expect(await screen.findByText('Couldn’t load the list.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('identity.staff_activated')).toBeInTheDocument();
    expect(mockedListAuditEvents).toHaveBeenCalledTimes(2);
  });

  it('renders rows with actor email, falls back to "System" when there is none', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [event(), event({ id: 'evt-2', actorAccountId: null, actorEmail: null })],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog />);
    expect(await screen.findByText('super@example.com')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('No more items')).toBeInTheDocument();
  });

  it('an empty result shows the empty state, not a table', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({ events: [], nextCursor: undefined });

    renderAdmin(<AuditLog />);
    expect(await screen.findByText('No audit events yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('scrolling the sentinel into view appends the next page; the sentinel disappears once there is no next cursor', async () => {
    mockedListAuditEvents
      .mockResolvedValueOnce({ events: [event({ id: 'evt-1' })], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-2' })], nextCursor: undefined });

    renderAdmin(<AuditLog />);
    await screen.findByText('identity.staff_activated');
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(1);

    const sentinel = screen.getByTestId('scroll-sentinel');
    act(() => triggerIntersection(sentinel));

    await screen.findByText('No more items');
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(2);
    expect(mockedListAuditEvents).toHaveBeenCalledWith('cursor-1');
    expect(screen.queryByTestId('scroll-sentinel')).not.toBeInTheDocument();
  });

  it('a sentinel already on screen at mount (short first page) keeps auto-loading until there is no more', async () => {
    mockedListAuditEvents
      .mockResolvedValueOnce({ events: [event({ id: 'evt-1' })], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-2' })], nextCursor: undefined });

    renderAdmin(<AuditLog />);
    const sentinel = await screen.findByTestId('scroll-sentinel');
    // simulates the observer firing on mount because the sentinel was
    // already visible — no scroll gesture involved
    act(() => triggerIntersection(sentinel));

    await screen.findByText('No more items');
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(2);
  });

  it('a failed later page keeps the already-loaded row and offers a retry, without wiping the list', async () => {
    mockedListAuditEvents
      .mockResolvedValueOnce({ events: [event({ id: 'evt-1' })], nextCursor: 'cursor-1' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ events: [event({ id: 'evt-2' })], nextCursor: undefined });

    renderAdmin(<AuditLog />);
    const sentinel = await screen.findByTestId('scroll-sentinel');
    act(() => triggerIntersection(sentinel));

    expect(await screen.findByText('Couldn’t load the list.')).toBeInTheDocument();
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(1); // still there

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('No more items');
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(2);
  });

  it('expanding a row with before/after shows the JSON diff; a row with nothing to show has no toggle', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [
        event({ id: 'evt-with-detail', before: { status: 'locked' }, after: { status: 'active' } }),
        event({ id: 'evt-bare', action: 'identity.session_created' }),
      ],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog />);
    await screen.findByText('identity.staff_activated');

    const bareRow = screen.getByText('identity.session_created').closest('tr')!;
    expect(within(bareRow).queryByRole('button')).not.toBeInTheDocument();

    expect(screen.queryByText(/"status": "locked"/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View details' }));
    expect(screen.getByText(/"status": "locked"/)).toBeInTheDocument();
    expect(screen.getByText(/"status": "active"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByText(/"status": "locked"/)).not.toBeInTheDocument();
  });
});
