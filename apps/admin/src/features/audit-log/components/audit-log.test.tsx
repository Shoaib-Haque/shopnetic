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

// jsdom doesn't apply the responsive `hidden md:block` / `md:hidden`
// classes, so the desktop table and the mobile card list both render at
// once — every event's action text appears twice. Real browsers show
// exactly one; `findAllByText`/`getAllByText` is the honest query here, not
// a workaround for a product bug. `tableRowFor` picks out the desktop
// `<tr>` specifically, for tests that need to scope into one row's own
// cells or its own expand toggle.
function tableRowFor(text: string): HTMLElement {
  const row = screen
    .getAllByText(text)
    .map((el) => el.closest('tr'))
    .find((el): el is HTMLTableRowElement => el !== null);
  if (!row) throw new Error(`no table row found for ${text}`);
  return row;
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
    expect((await screen.findAllByText('identity.staff_activated')).length).toBeGreaterThan(0);
    expect(mockedListAuditEvents).toHaveBeenCalledTimes(2);
  });

  it('renders rows with actor email, falls back to "System" when there is none', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [event(), event({ id: 'evt-2', actorAccountId: null, actorEmail: null })],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog />);
    expect((await screen.findAllByText('super@example.com')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('System').length).toBeGreaterThan(0);
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
    await screen.findAllByText('identity.staff_activated');
    // one event, shown twice (desktop table + mobile card)
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(2);

    const sentinel = screen.getByTestId('scroll-sentinel');
    act(() => triggerIntersection(sentinel));

    await screen.findByText('No more items');
    // two events now, each shown twice
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(4);
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
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(4);
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
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(2); // still there

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('No more items');
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(4);
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
    await screen.findAllByText('identity.staff_activated');

    const bareRow = tableRowFor('identity.session_created');
    expect(within(bareRow).queryByRole('button')).not.toBeInTheDocument();

    expect(screen.queryByText(/"status": "locked"/)).not.toBeInTheDocument();
    // click only the desktop table's toggle — the shared `expanded` state
    // means the mobile card's own copy of the detail opens too
    fireEvent.click(
      within(tableRowFor('identity.staff_activated')).getByRole('button', {
        name: 'View details',
      }),
    );
    expect(screen.getAllByText(/"status": "locked"/)).toHaveLength(2);
    expect(screen.getAllByText(/"status": "active"/)).toHaveLength(2);

    fireEvent.click(
      within(tableRowFor('identity.staff_activated')).getByRole('button', {
        name: 'Hide details',
      }),
    );
    expect(screen.queryByText(/"status": "locked"/)).not.toBeInTheDocument();
  });

  it('the expand toggle\'s tooltip names the current state\'s action — "View details" ⇄ "Hide details"', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [event({ before: { status: 'locked' }, after: { status: 'active' } })],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog />);
    await screen.findAllByText('identity.staff_activated');
    const toggle = within(tableRowFor('identity.staff_activated')).getByRole('button', {
      name: 'View details',
    });

    fireEvent.focus(toggle);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('View details');

    fireEvent.click(toggle);
    fireEvent.focus(toggle);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Hide details');
  });
});
