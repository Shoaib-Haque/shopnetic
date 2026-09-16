import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AuditEvent } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
import { triggerIntersection } from '@/test/intersection-observer';
import { listAuditEvents } from '../api';
import { AuditLog } from './audit-log';

vi.mock('../api', () => ({ listAuditEvents: vi.fn() }));

const PATHNAME = '/en/x7f2k9t3m1qp/audit-log';
const routerReplace = vi.fn();
// per-test control over what `useSearchParams()` returns on mount —
// reassigned (not mutated) in `beforeEach`, and the mock factory re-reads
// this binding on every call rather than capturing one instance.
let mockSearchParams = new URLSearchParams();

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: routerReplace,
    refresh: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => PATHNAME,
  useSearchParams: () => mockSearchParams,
}));

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

// jsdom doesn't apply the responsive `hidden lg:block` / `lg:hidden`
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

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  routerReplace.mockReset();
});

afterEach(() => {
  cleanup();
  mockedListAuditEvents.mockReset();
});

describe('AuditLog', () => {
  it('load error → shows the error state, retry re-fetches', async () => {
    mockedListAuditEvents
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ events: [event()], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
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

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    expect((await screen.findAllByText('super@example.com')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('System').length).toBeGreaterThan(0);
    expect(screen.getByText('No more items')).toBeInTheDocument();
  });

  it('the table only takes over at lg, not md — 768–960px stays on the card list that actually fits it', async () => {
    // Below lg, the table's fixed-width columns (Time/Actor/Action/Target/
    // chevron) don't all fit, and it opts out of horizontal scroll to keep
    // its sticky header working — an overflow there gets silently clipped,
    // not scrolled, so Target and the expand toggle become unreachable.
    mockedListAuditEvents.mockResolvedValueOnce({ events: [event()], nextCursor: undefined });

    const { container } = renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');

    // two levels up: <table> → Table's own scroll wrapper → this page's
    // `hidden lg:block` wrapper
    const table = screen.getByRole('table').parentElement?.parentElement;
    expect(table).toHaveClass('hidden', 'lg:block');
    expect(table).not.toHaveClass('md:block');

    const cardList = container.querySelector('ul');
    expect(cardList).toHaveClass('lg:hidden');
    expect(cardList).not.toHaveClass('md:hidden');
  });

  it('an empty result shows the empty state, not a table', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({ events: [], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    expect(await screen.findByText('No audit events yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('scrolling the sentinel into view appends the next page; the sentinel disappears once there is no next cursor', async () => {
    mockedListAuditEvents
      .mockResolvedValueOnce({ events: [event({ id: 'evt-1' })], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-2' })], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');
    // one event, shown twice (desktop table + mobile card)
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(2);

    const sentinel = screen.getByTestId('scroll-sentinel');
    act(() => triggerIntersection(sentinel));

    await screen.findByText('No more items');
    // two events now, each shown twice
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(4);
    expect(mockedListAuditEvents).toHaveBeenCalledWith('cursor-1', {});
    expect(screen.queryByTestId('scroll-sentinel')).not.toBeInTheDocument();
  });

  it('a sentinel already on screen at mount (short first page) keeps auto-loading until there is no more', async () => {
    mockedListAuditEvents
      .mockResolvedValueOnce({ events: [event({ id: 'evt-1' })], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-2' })], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
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

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    const sentinel = await screen.findByTestId('scroll-sentinel');
    act(() => triggerIntersection(sentinel));

    expect(await screen.findByText('Couldn’t load the list.')).toBeInTheDocument();
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(2); // still there

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('No more items');
    expect(screen.getAllByText('identity.staff_activated')).toHaveLength(4);
  });

  it('expanding a row with before/after shows only what changed; a row with nothing to show has no toggle', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [
        event({
          id: 'evt-with-detail',
          before: { status: 'locked', id: 'acc-2', updatedAt: '2026-09-15T00:00:00Z' },
          after: { status: 'active', id: 'acc-2', updatedAt: '2026-09-16T00:00:00Z' },
        }),
        event({ id: 'evt-bare', action: 'identity.session_created' }),
      ],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');

    const bareRow = tableRowFor('identity.session_created');
    expect(within(bareRow).queryByRole('button')).not.toBeInTheDocument();

    expect(screen.queryByText('status')).not.toBeInTheDocument();
    // click only the desktop table's toggle — the shared `expanded` state
    // means the mobile card's own copy of the detail opens too
    fireEvent.click(
      within(tableRowFor('identity.staff_activated')).getByRole('button', {
        name: 'View details',
      }),
    );
    // only `status` shows — `id`/`updatedAt` are excluded even though both
    // differ (updatedAt) or are present (id) on both sides
    expect(screen.getAllByText('status')).toHaveLength(2);
    expect(screen.getAllByText('"locked"')).toHaveLength(2);
    expect(screen.getAllByText('"active"')).toHaveLength(2);
    expect(screen.queryByText('id')).not.toBeInTheDocument();
    expect(screen.queryByText('updatedAt')).not.toBeInTheDocument();

    fireEvent.click(
      within(tableRowFor('identity.staff_activated')).getByRole('button', {
        name: 'Hide details',
      }),
    );
    expect(screen.queryByText('status')).not.toBeInTheDocument();
  });

  it('an update where nothing but id/updatedAt differ shows "nothing else changed", not an empty list', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [
        event({
          before: { status: 'active', updatedAt: '2026-09-15T00:00:00Z' },
          after: { status: 'active', updatedAt: '2026-09-16T00:00:00Z' },
        }),
      ],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');
    fireEvent.click(
      within(tableRowFor('identity.staff_activated')).getByRole('button', {
        name: 'View details',
      }),
    );

    expect(screen.getAllByText('Nothing else changed.')).toHaveLength(2);
  });

  it('a create (before: null) still shows the full record dump, wrapped, not a diff', async () => {
    // Nothing to diff *against* on a create — every field is the whole
    // relevant state, not a change. Also the one remaining case that still
    // renders the wrapped `<pre>` dump (see the wrap-not-scroll test below).
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [event({ before: null, after: { status: 'locked' } })],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');
    fireEvent.click(
      within(tableRowFor('identity.staff_activated')).getByRole('button', {
        name: 'View details',
      }),
    );

    expect(screen.getAllByText('After')).toHaveLength(2);
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
    expect(screen.getAllByText(/"status": "locked"/)).toHaveLength(2);
  });

  it("Before/After boxes (a create/delete's full dump) wrap long values instead of scrolling horizontally", async () => {
    // Two independent horizontal scrollbars side by side desync the moment
    // one value is longer than the other — scrolling Before doesn't move
    // After, so corresponding lines stop lining up. Wrapping avoids that
    // failure mode entirely, since there's no scroll position to desync.
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [event({ before: null, after: { status: 'locked' } })],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');
    fireEvent.click(
      within(tableRowFor('identity.staff_activated')).getByRole('button', {
        name: 'View details',
      }),
    );

    const [afterPre] = screen.getAllByText(/"status": "locked"/).map((el) => el.closest('pre'));
    expect(afterPre).toHaveClass('whitespace-pre-wrap', 'break-words');
    expect(afterPre).not.toHaveClass('overflow-x-auto');
  });

  it('the expand toggle\'s tooltip names the current state\'s action — "View details" ⇄ "Hide details"', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [event({ before: { status: 'locked' }, after: { status: 'active' } })],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
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

describe('AuditLog — filter bar', () => {
  function openFiltersPanel(): void {
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  }

  it('typing a search query re-fetches (debounced) with q, resetting to page one', async () => {
    mockedListAuditEvents
      .mockResolvedValueOnce({ events: [event({ id: 'evt-1' })], nextCursor: undefined })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-2' })], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');

    fireEvent.change(screen.getByPlaceholderText('Search actor, target, action…'), {
      target: { value: 'sukanto' },
    });

    openFiltersPanel();
    expect(await screen.findByText('Clear filters')).toBeInTheDocument();
    await waitFor(
      () => expect(mockedListAuditEvents).toHaveBeenLastCalledWith(undefined, { q: 'sukanto' }),
      { timeout: 2000 },
    );
  });

  it('the Filters panel opens on trigger click and closes on its own close button', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({ events: [event()], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');
    expect(screen.queryByLabelText('Domain')).not.toBeInTheDocument();

    openFiltersPanel();
    expect(await screen.findByLabelText('Domain')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByLabelText('Domain')).not.toBeInTheDocument());
  });

  // Popover (unlike Dialog, which Modal/Drawer use) has no Overlay/backdrop
  // primitive at all — nothing renders behind it to block pointer events on
  // the rest of the page. jsdom's synthetic events don't do real hit-testing,
  // so this can't directly prove "clicking the search box works while the
  // panel is open" the way a real browser would; what it CAN prove is that
  // the structural mechanism a blocking backdrop would need (a `fixed
  // inset-0` overlay element) simply isn't there, and the search box never
  // becomes `aria-hidden`/inert while the panel is open — both would be true
  // if this had been left on `Drawer`/`Modal`'s `Dialog` primitive instead.
  it('opening the filters panel renders no blocking backdrop, and the search box stays in the accessible tree', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({ events: [event()], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');

    openFiltersPanel();
    await screen.findByLabelText('Domain');

    expect(document.querySelector('.fixed.inset-0')).not.toBeInTheDocument();
    const search = screen.getByPlaceholderText('Search actor, target, action…');
    expect(search).not.toHaveAttribute('aria-hidden');
    expect(search.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('picking a domain re-fetches with that domain', async () => {
    mockedListAuditEvents
      .mockResolvedValueOnce({ events: [event({ id: 'evt-1' })], nextCursor: undefined })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-2' })], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');

    openFiltersPanel();
    fireEvent.change(await screen.findByLabelText('Domain'), { target: { value: 'catalog' } });

    await screen.findByText('Clear filters');
    expect(mockedListAuditEvents).toHaveBeenLastCalledWith(undefined, { domain: 'catalog' });
  });

  it('picking a target type re-fetches with it', async () => {
    mockedListAuditEvents
      .mockResolvedValueOnce({ events: [event({ id: 'evt-1' })], nextCursor: undefined })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-2' })], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');

    openFiltersPanel();
    fireEvent.change(await screen.findByLabelText('Target type'), {
      target: { value: 'category' },
    });

    await screen.findByText('Clear filters');
    expect(mockedListAuditEvents).toHaveBeenLastCalledWith(undefined, { targetType: 'category' });
  });

  it('setting From/To re-fetches with the date range', async () => {
    mockedListAuditEvents
      .mockResolvedValueOnce({ events: [event({ id: 'evt-1' })], nextCursor: undefined })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-2' })], nextCursor: undefined })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-3' })], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');

    openFiltersPanel();
    fireEvent.change(await screen.findByLabelText('From'), { target: { value: '2026-09-01' } });
    await screen.findByText('Clear filters');
    expect(mockedListAuditEvents).toHaveBeenLastCalledWith(undefined, { from: '2026-09-01' });

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-16' } });
    await waitFor(() =>
      expect(mockedListAuditEvents).toHaveBeenLastCalledWith(undefined, {
        from: '2026-09-01',
        to: '2026-09-16',
      }),
    );
  });

  it('clicking anywhere in a date field opens its native picker, not just the calendar icon', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({ events: [event()], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');
    openFiltersPanel();

    const fromInput = (await screen.findByLabelText('From')) as HTMLInputElement;
    const showPicker = vi.fn();
    fromInput.showPicker = showPicker;

    fireEvent.click(fromInput);
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('"Clear filters" only shows once a filter is set, and resets every one of them', async () => {
    mockedListAuditEvents
      .mockResolvedValueOnce({ events: [event({ id: 'evt-1' })], nextCursor: undefined })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-2' })], nextCursor: undefined })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-3' })], nextCursor: undefined })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-4' })], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();

    openFiltersPanel();
    fireEvent.change(await screen.findByLabelText('Domain'), { target: { value: 'identity' } });
    fireEvent.change(screen.getByLabelText('Target type'), { target: { value: 'account' } });
    await screen.findByText('Clear filters');
    await waitFor(() =>
      expect(mockedListAuditEvents).toHaveBeenLastCalledWith(undefined, {
        domain: 'identity',
        targetType: 'account',
      }),
    );

    fireEvent.click(screen.getByText('Clear filters'));
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Domain')).toHaveValue('all');
    await waitFor(() => expect(mockedListAuditEvents).toHaveBeenLastCalledWith(undefined, {}));
  });
});

describe('AuditLog — filters sync to the URL', () => {
  it('a link with filters already in it pre-fills the panel and fetches that filtered view on mount', async () => {
    mockSearchParams = new URLSearchParams({
      q: 'sukanto',
      domain: 'catalog',
      targetType: 'category',
      from: '2026-09-01',
      to: '2026-09-16',
    });
    mockedListAuditEvents.mockResolvedValueOnce({ events: [event()], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');

    expect(mockedListAuditEvents).toHaveBeenCalledWith(undefined, {
      q: 'sukanto',
      domain: 'catalog',
      targetType: 'category',
      from: '2026-09-01',
      to: '2026-09-16',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(await screen.findByLabelText('Domain')).toHaveValue('catalog');
    expect(screen.getByLabelText('Target type')).toHaveValue('category');
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('To')).toHaveValue('2026-09-16');
  });

  it('an unrecognized domain in the URL falls back to "all" rather than crashing or sticking', async () => {
    mockSearchParams = new URLSearchParams({ domain: 'not-a-real-domain' });
    mockedListAuditEvents.mockResolvedValueOnce({ events: [event()], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));

    expect(await screen.findByLabelText('Domain')).toHaveValue('all');
  });

  it('changing a filter replaces the URL (not push, so refining a filter never piles up history)', async () => {
    mockedListAuditEvents
      .mockResolvedValueOnce({ events: [event({ id: 'evt-1' })], nextCursor: undefined })
      .mockResolvedValueOnce({ events: [event({ id: 'evt-2' })], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findAllByText('identity.staff_activated');
    routerReplace.mockClear(); // drop the mount-time no-op replace

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(await screen.findByLabelText('Domain'), { target: { value: 'identity' } });

    await waitFor(() =>
      expect(routerReplace).toHaveBeenLastCalledWith(`${PATHNAME}?domain=identity`, {
        scroll: false,
      }),
    );
  });

  it('clearing filters replaces the URL back down to just the bare pathname', async () => {
    mockSearchParams = new URLSearchParams({ domain: 'catalog' });
    mockedListAuditEvents
      .mockResolvedValueOnce({ events: [event()], nextCursor: undefined })
      .mockResolvedValueOnce({ events: [event()], nextCursor: undefined });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    await screen.findByText('Clear filters');
    routerReplace.mockClear();

    fireEvent.click(screen.getByText('Clear filters'));

    await waitFor(() =>
      expect(routerReplace).toHaveBeenLastCalledWith(PATHNAME, { scroll: false }),
    );
  });
});

describe('AuditLog — Target column deep-links to the live record', () => {
  // Only `category` and staff-originated `account` rows have anywhere real
  // to land — every other targetType (or a non-staff `account`, like a
  // buyer/marketplace one) stays plain text since there's no admin page to
  // send it to.
  it('a category row links to the Category List, forcing status=all and highlighting the row', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [
        event({ targetType: 'category', targetId: 'cat-9', action: 'catalog.category_updated' }),
      ],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    const links = await screen.findAllByText('category:cat-9');
    for (const link of links) {
      expect(link.closest('a')).toHaveAttribute(
        'href',
        '/en/x7f2k9t3m1qp/catalog/categories?status=all&highlight=cat-9',
      );
    }
  });

  it('a staff-action account row (e.g. a role change) links to the Staff List', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [
        event({ targetType: 'account', targetId: 'acc-9', action: 'identity.staff_role_changed' }),
      ],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    const links = await screen.findAllByText('account:acc-9');
    for (const link of links) {
      expect(link.closest('a')).toHaveAttribute('href', '/en/x7f2k9t3m1qp/staff?highlight=acc-9');
    }
  });

  it('a non-staff account row (e.g. a buyer registering) stays plain text — no admin page to send it to', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [
        event({ targetType: 'account', targetId: 'acc-9', action: 'identity.account_registered' }),
      ],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    const texts = await screen.findAllByText('account:acc-9');
    for (const text of texts) expect(text.closest('a')).toBeNull();
  });

  it('a targetType with no admin page yet (e.g. brand) stays plain text', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [
        event({ targetType: 'brand', targetId: 'brand-1', action: 'catalog.brand_created' }),
      ],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    const texts = await screen.findAllByText('brand:brand-1');
    for (const text of texts) expect(text.closest('a')).toBeNull();
  });

  it('a row with no targetType renders the em dash, not a link', async () => {
    mockedListAuditEvents.mockResolvedValueOnce({
      events: [event({ targetType: null, targetId: null })],
      nextCursor: undefined,
    });

    renderAdmin(<AuditLog locale="en" basePath="x7f2k9t3m1qp" />);
    const dashes = await screen.findAllByText('—');
    // page header/other chrome doesn't use an em dash, so every one found
    // here is the Target cell's (desktop + mobile)
    expect(dashes.length).toBeGreaterThan(0);
    for (const dash of dashes) expect(dash.closest('a')).toBeNull();
  });
});
