import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Brand } from '@shopnetic/contracts';
import { adminApi, AdminApiError } from '@/features/admin-api/client';
import { renderAdmin } from '@/test/render';
import { triggerIntersection } from '@/test/intersection-observer';
import { BrandList } from './brand-list';

vi.mock('@/features/admin-api/client', async () => {
  const actual = await vi.importActual<typeof import('@/features/admin-api/client')>(
    '@/features/admin-api/client',
  );
  return { ...actual, adminApi: vi.fn() };
});

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/en/x7f2k9t3m1qp/catalog/brands',
  useSearchParams: () => mockSearchParams,
}));

const mockedAdminApi = vi.mocked(adminApi);

function brand(id: string, name: string, overrides: Partial<Brand> = {}): Brand {
  return {
    id,
    name,
    slug: id,
    displayName: null,
    logoKey: null,
    status: 'active',
    isRestricted: false,
    mergedIntoBrandId: null,
    archived: false,
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** every BrandList/BrandMergeDialog call is the raw `{data, meta}` envelope. */
const page = (items: Brand[], nextCursor?: string) => ({
  data: items,
  meta: nextCursor ? { nextCursor } : {},
});

/** Radix's dropdown trigger opens on `pointerdown` (or Enter/Space/
 * ArrowDown) — jsdom's `fireEvent.click` never fires a `pointerdown` first
 * the way a real browser interaction would, so a plain click silently does
 * nothing; the keyboard path avoids that (same pattern staff-list's own
 * tests use). Desktop and mobile both render in jsdom regardless of
 * viewport, so more than one trigger exists per row — the first is the
 * desktop table's. */
function openRowMenu(): void {
  const trigger = screen.getAllByRole('button', { name: 'More actions' })[0]!;
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  mockedAdminApi.mockReset();
});

describe('BrandList', () => {
  it('renders the live list, with a status/restricted badge per row', async () => {
    mockedAdminApi.mockResolvedValueOnce(
      page([
        brand('a', 'Acme', { status: 'pending' }),
        brand('b', 'Zenith', { isRestricted: true }),
      ]),
    );

    renderAdmin(<BrandList />);

    expect(await screen.findAllByText('Acme')).not.toHaveLength(0);
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    // isRestricted renders as an icon+tooltip next to the name, not a
    // second status badge (the 2026-09-18 fix) — assert via its label
    expect(
      document.querySelectorAll(
        '[aria-label="Counterfeit-prone — new listings under this brand need extra verification."]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('creating a brand posts the form and shows the created toast', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([])) // #1 mount
      .mockResolvedValueOnce(brand('new-1', 'Fresh Co')) // #2 POST /brands
      .mockResolvedValueOnce(page([brand('new-1', 'Fresh Co')])); // #3 resync

    renderAdmin(<BrandList />);
    await screen.findByText('No brands yet.');

    fireEvent.click(screen.getByRole('button', { name: /New brand/i }));
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Fresh Co' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Brand “Fresh Co” created.')).toBeInTheDocument();
    expect(mockedAdminApi).toHaveBeenNthCalledWith(
      2,
      '/brands',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('the Restricted switch toggles by clicking its label text, not just the switch itself — the 2026-09-18 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([])) // #1 mount
      .mockResolvedValueOnce(brand('new-1', 'Fresh Co', { isRestricted: true })) // #2 POST /brands
      .mockResolvedValueOnce(page([brand('new-1', 'Fresh Co', { isRestricted: true })])); // #3 resync

    renderAdmin(<BrandList />);
    await screen.findByText('No brands yet.');

    fireEvent.click(screen.getByRole('button', { name: /New brand/i }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Fresh Co' } });

    const restrictedSwitch = screen.getByRole('switch');
    expect(restrictedSwitch).toHaveAttribute('aria-checked', 'false');

    // click the *label*, not the switch control itself — a real `<label>`
    // wrapping a real `<button role="switch">` forwards the click natively,
    // same as it already did for the plain checkbox this replaced. Found
    // via the label text (which sits alongside a nested hint span, so
    // `getAllByText` + `.closest('label')` sidesteps any ambiguity over
    // which of the two elements' text technically matches).
    const restrictedLabel = screen
      .getAllByText(/Restricted \(counterfeit-prone\)/)[0]!
      .closest('label')!;
    fireEvent.click(restrictedLabel);
    expect(restrictedSwitch).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Brand “Fresh Co” created.')).toBeInTheDocument();
    expect(mockedAdminApi).toHaveBeenNthCalledWith(
      2,
      '/brands',
      expect.objectContaining({ body: expect.objectContaining({ isRestricted: true }) }),
    );
  });

  it('create mode blocks a taken alias at Add time, not at Save — the 2026-09-18 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([])) // #1 mount
      .mockResolvedValueOnce({ available: false }) // #2 GET availability — taken
      .mockResolvedValueOnce({ available: true }) // #3 GET availability — free
      .mockResolvedValueOnce(brand('new-1', 'Fresh Co')); // #4 POST /brands

    renderAdmin(<BrandList />);
    await screen.findByText('No brands yet.');

    fireEvent.click(screen.getByRole('button', { name: /New brand/i }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Fresh Co' } });

    const aliasInput = screen.getByPlaceholderText('Add an alias…');
    fireEvent.change(aliasInput, { target: { value: 'dup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('That alias already maps to a brand.')).toBeInTheDocument();
    // never staged — the chip for a blocked alias must not exist
    expect(screen.queryByText('dup')).not.toBeInTheDocument();

    fireEvent.change(aliasInput, { target: { value: 'free' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('free')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Brand “Fresh Co” created.')).toBeInTheDocument();
    expect(mockedAdminApi).toHaveBeenNthCalledWith(
      4,
      '/brands',
      expect.objectContaining({ body: expect.objectContaining({ aliases: ['free'] }) }),
    );
  });

  it('deleting a brand shows an undo toast (soft-delete, no confirm dialog)', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount
      .mockResolvedValueOnce(undefined) // #2 DELETE
      .mockResolvedValueOnce(page([])); // #3 resync

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(await screen.findByText('Brand “Acme” deleted.')).toBeInTheDocument();
  });

  it('editing a brand patches the row in place instantly — no network resync, no skeleton flash', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount
      .mockResolvedValueOnce(brand('a', 'Acme Renamed')); // #2 PATCH

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    await screen.findByText('Edit brand');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Brand “Acme Renamed” saved.');
    await screen.findAllByText('Acme Renamed');
    expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
    // the PATCH response already has the fresh data — patched straight into
    // the list, no third request to re-fetch it (the 2026-09-29 fix; this
    // also means an edit to a row loaded via scroll, past page 1, no longer
    // vanishes from view until scrolling back down re-fetches it)
    expect(mockedAdminApi).toHaveBeenCalledTimes(2);
  });

  it("a stale edit conflict closes the modal, refetches, and notifies — mirrors Category's own guard", async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount
      .mockRejectedValueOnce(new AdminApiError('CONFLICT', 409)) // #2 PATCH /brands/a
      .mockResolvedValueOnce(page([brand('a', 'Acme Renamed')])); // #3 resync

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    await screen.findByText('Edit brand');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'This brand was changed elsewhere — the list has been refreshed. Reopen it to try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Edit brand')).not.toBeInTheDocument();
    await screen.findAllByText('Acme Renamed');
  });

  it('restoring the same row from the Archived tab dismisses its still-open undo toast — the 2026-09-18 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount (live)
      .mockResolvedValueOnce(undefined) // #2 DELETE /brands/a
      .mockResolvedValueOnce(page([])) // #3 resync (live, now empty)
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #4 switch to archived
      .mockResolvedValueOnce(brand('a', 'Acme')) // #5 POST /brands/a/restore
      .mockResolvedValueOnce(page([])); // #6 resync (archived, now empty)

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(await screen.findByText('Brand “Acme” deleted.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await screen.findAllByText('Acme');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restore' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    await screen.findByText('Brand “Acme” restored.');
    // the delete's own undo toast — still well inside its 20s window — is
    // gone now that this row was restored a different way. `sonner` removes
    // a dismissed toast's DOM node after its own exit animation, not
    // synchronously, hence `waitFor` rather than an instant assertion.
    await waitFor(() =>
      expect(screen.queryByText('Brand “Acme” deleted.')).not.toBeInTheDocument(),
    );
  });

  it('deleting an already-deleted brand shows a calm "already deleted" toast, not an error — the 2026-09-18 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount
      .mockRejectedValueOnce(new AdminApiError('NOT_FOUND', 404)) // #2 DELETE — someone else beat this tab to it
      .mockResolvedValueOnce(page([])); // #3 resync

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(await screen.findByText('“Acme” was already deleted.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
  });

  it('restoring an already-restored brand shows a calm "already restored" toast, not an error — the 2026-09-18 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount (live)
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #2 switch to archived
      .mockRejectedValueOnce(new AdminApiError('NOT_FOUND', 404)) // #3 POST restore — already restored elsewhere
      .mockResolvedValueOnce(page([])); // #4 resync (archived, now empty)

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await screen.findAllByText('Acme');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restore' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    expect(await screen.findByText('“Acme” was already restored.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
  });

  it('removing an already-removed alias shows a calm "already removed" toast and drops the stale chip — the 2026-09-18 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(
        page([
          brand('a', 'Acme', {
            aliases: [{ id: 'al1', alias: 'ACM', createdAt: '2026-01-01T00:00:00.000Z' }],
          }),
        ]),
      ) // #1 mount
      .mockRejectedValueOnce(new AdminApiError('NOT_FOUND', 404)); // #2 DELETE /brands/a/aliases/al1

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    await screen.findByText('Edit brand');
    await screen.findByText('ACM');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByText('Alias “ACM” was already removed.')).toBeInTheDocument();
    expect(screen.queryByText('ACM')).not.toBeInTheDocument();
  });

  it('merging searches for a target, then posts the merge and shows the merged toast', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme'), brand('b', 'Zenith')])) // #1 mount
      .mockResolvedValueOnce(page([brand('a', 'Acme'), brand('b', 'Zenith')])) // #2 merge dialog's own search
      .mockResolvedValueOnce(brand('b', 'Zenith')) // #3 POST /brands/a/merge
      .mockResolvedValueOnce(page([brand('b', 'Zenith')])); // #4 resync

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Merge' }));
    await screen.findByText('Merge “Acme” into…');

    // the source itself is excluded from its own merge target list
    const results = await screen.findAllByText('Zenith');
    expect(screen.queryByText('Acme', { selector: 'button *' })).not.toBeInTheDocument();

    fireEvent.click(results[results.length - 1]!.closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    expect(await screen.findByText('“Acme” merged into “Zenith”.')).toBeInTheDocument();
    expect(mockedAdminApi).toHaveBeenNthCalledWith(
      3,
      '/brands/a/merge',
      expect.objectContaining({ method: 'POST', body: { intoBrandId: 'b' } }),
    );
  });

  it('the merge target picker loads more results past the first page instead of hard-capping at it — the 2026-09-18 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount
      .mockResolvedValueOnce(page([brand('b', 'Bravo')], 'c1')) // #2 merge dialog's first page
      .mockResolvedValueOnce(page([brand('c', 'Charlie')])); // #3 merge dialog's second page

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Merge' }));
    await screen.findByText('Bravo');
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();

    triggerIntersection(await screen.findByTestId('scroll-sentinel'));
    expect(await screen.findByText('Charlie')).toBeInTheDocument();
  });

  it('an AdminApiError on the first load shows the error line, not the empty state', async () => {
    mockedAdminApi.mockRejectedValueOnce(new AdminApiError('INTERNAL', 500));

    renderAdmin(<BrandList />);

    expect(await screen.findByText('Couldn’t load the list.')).toBeInTheDocument();
    expect(screen.queryByText('No brands yet.')).not.toBeInTheDocument();
  });

  it('a status filter picked on Live is not silently carried into the Archived query — the 2026-09-17 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount (live)
      .mockResolvedValueOnce(page([brand('a', 'Acme', { status: 'pending' })])) // #2 live, status=pending
      .mockResolvedValueOnce(page([])); // #3 switch to archived

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pending' } });
    await screen.findAllByText('Acme');

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await screen.findByText('No brands yet.');

    const archivedCall = mockedAdminApi.mock.calls[2]?.[0] as string;
    expect(archivedCall).toContain('archived=true');
    expect(archivedCall).not.toContain('status=');
  });

  it('adding an alias updates the row in place — no extra list reload — the 2026-09-17 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount
      .mockResolvedValueOnce(
        brand('a', 'Acme', {
          aliases: [{ id: 'al1', alias: 'ACM', createdAt: '2026-01-01T00:00:00.000Z' }],
        }),
      ); // #2 POST /brands/a/aliases

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    await screen.findByText('Edit brand');

    fireEvent.change(screen.getByPlaceholderText('Add an alias…'), { target: { value: 'ACM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Alias “ACM” added.')).toBeInTheDocument();
    // exactly the mount + the add-alias call — no third (resync) call
    expect(mockedAdminApi).toHaveBeenCalledTimes(2);
  });

  it('a duplicate-alias error renders inline under the field, not as a toast — the 2026-09-17 fix', async () => {
    mockedAdminApi
      .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount
      .mockRejectedValueOnce(new AdminApiError('BRAND_ALIAS_TAKEN', 409)); // #2 POST /aliases fails

    renderAdmin(<BrandList />);
    await screen.findAllByText('Acme');

    openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    await screen.findByText('Edit brand');

    const aliasInput = screen.getByPlaceholderText('Add an alias…');
    fireEvent.change(aliasInput, { target: { value: 'dup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const err = await screen.findByText('That alias already maps to a brand.');
    expect(err.tagName).toBe('P');
    expect(aliasInput).toHaveAttribute('aria-invalid', 'true');
  });

  describe('deep link from Audit Log (?highlight=id) — fetches the target directly by id', () => {
    it('shows the pinned target immediately, before the rest of the list has finished loading', async () => {
      mockSearchParams = new URLSearchParams({ highlight: 'z' });
      let resolvePage1!: (v: { data: Brand[]; meta: object }) => void;
      mockedAdminApi
        .mockReturnValueOnce(new Promise((resolve) => (resolvePage1 = resolve))) // #1 page 1 — held open
        .mockResolvedValueOnce(brand('z', 'Zulu')); // #2 direct GET — resolves fast

      renderAdmin(<BrandList />);
      // the pinned row shows even though page 1 is still pending — it used
      // to be gated behind the same loading skeleton as the rest of the
      // list (found live 2026-09-29)
      await screen.findAllByText('Zulu');
      expect(document.querySelector('[data-brand-row="z"]')).toHaveClass('bg-primary/5');
      expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();

      resolvePage1(page([brand('a', 'Acme')]));
      await screen.findAllByText('Acme');
    });

    it('pins the target as the first row with a light tint, even when it was already loaded on the first page', async () => {
      mockSearchParams = new URLSearchParams({ highlight: 'a' });
      mockedAdminApi
        .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount, Live page 1 — has the target
        .mockResolvedValueOnce(brand('a', 'Acme')); // #2 direct GET by id — same row

      renderAdmin(<BrandList />);
      await screen.findAllByText('Acme');
      await waitFor(() =>
        expect(document.querySelector('[data-brand-row="a"]')).toHaveClass('bg-primary/5'),
      );

      // pinned once (desktop + its hidden mobile twin) — its own natural
      // spot in the loaded page is filtered out, not rendered a second time
      expect(document.querySelectorAll('[data-brand-row="a"]')).toHaveLength(2);
    });

    it('pins the target as the first row with a light tint when it would otherwise sort past the first page', async () => {
      mockSearchParams = new URLSearchParams({ highlight: 'z' });
      mockedAdminApi
        .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount, Live page 1
        .mockResolvedValueOnce(brand('z', 'Zulu')); // #2 GET /brands/z directly

      renderAdmin(<BrandList />);
      await screen.findAllByText('Zulu');

      expect(document.querySelector('[data-brand-row="z"]')).toHaveClass('bg-primary/5');
      // a plain GET by id — no cursor, no page-walk, no `raw: true`; `priority:
      // 'high'` so it doesn't queue behind bulkier list fetches on a busy
      // mount (2026-09-30 fix)
      expect(mockedAdminApi).toHaveBeenNthCalledWith(2, '/brands/z', { priority: 'high' });
    });

    it('stays pinned, never duplicated, once normal pagination organically loads the same target too', async () => {
      mockSearchParams = new URLSearchParams({ highlight: 'z' });
      mockedAdminApi
        .mockResolvedValueOnce(page([brand('a', 'Acme')], 'a')) // #1 page 1, more to come
        .mockResolvedValueOnce(brand('z', 'Zulu')) // #2 direct GET — pinned at top
        .mockResolvedValueOnce(page([brand('z', 'Zulu')])); // #3 page 2 — its natural spot

      renderAdmin(<BrandList />);
      await screen.findAllByText('Zulu');
      expect(document.querySelector('[data-brand-row="z"]')).toHaveClass('bg-primary/5');

      triggerIntersection(await screen.findByTestId('scroll-sentinel'));
      // page 2 (which naturally contains the target too) has landed once
      // the sentinel — rendered only while `hasMore` — disappears
      await waitFor(() => expect(screen.queryByTestId('scroll-sentinel')).not.toBeInTheDocument());

      // still pinned once (desktop + its hidden mobile twin) — the copy
      // that just loaded into its natural spot is filtered out, not shown
      expect(document.querySelector('[data-brand-row="z"]')).toHaveClass('bg-primary/5');
      expect(document.querySelectorAll('[data-brand-row="z"]')).toHaveLength(2);
    });

    it('editing the pinned deep-link target patches its pinned copy too', async () => {
      mockSearchParams = new URLSearchParams({ highlight: 'z' });
      mockedAdminApi
        .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 page 1 — no target
        .mockResolvedValueOnce(brand('z', 'Zulu')) // #2 direct GET — pinned at top
        .mockResolvedValueOnce(brand('z', 'Zulu Renamed')); // #3 PATCH

      renderAdmin(<BrandList />);
      await screen.findAllByText('Zulu');
      expect(document.querySelector('[data-brand-row="z"]')).toHaveClass('bg-primary/5');

      openRowMenu(); // targets the first "More actions" trigger — the pinned row
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
      await screen.findByText('Edit brand');

      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Zulu Renamed' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await screen.findByText('Brand “Zulu Renamed” saved.');
      await screen.findAllByText('Zulu Renamed');
      expect(screen.queryByText('Zulu')).not.toBeInTheDocument();
      expect(document.querySelector('[data-brand-row="z"]')).toHaveClass('bg-primary/5');
      // no extra fetch beyond the PATCH — the pinned copy is patched locally
      expect(mockedAdminApi).toHaveBeenCalledTimes(3);
    });

    it('switches to the Archived tab on its own once the fetched target turns out to be archived — no action-name guessing needed', async () => {
      mockSearchParams = new URLSearchParams({ highlight: 'z' });
      mockedAdminApi
        .mockResolvedValueOnce(page([brand('a', 'Acme')])) // #1 mount, Live
        .mockResolvedValueOnce(brand('z', 'Zulu', { archived: true })) // #2 direct GET — archived
        .mockResolvedValueOnce(page([])); // #3 Archived tab's own first page, triggered by the switch

      renderAdmin(<BrandList />);
      await screen.findAllByText('Zulu');

      expect(document.querySelector('[data-brand-row="z"]')).toHaveClass('bg-primary/5');
      expect(screen.getByRole('button', { name: 'Archived' })).toHaveClass('bg-muted');
    });

    it('a stale/invalid highlight id fails quietly — nothing pinned, no crash', async () => {
      mockSearchParams = new URLSearchParams({ highlight: 'nope' });
      mockedAdminApi
        .mockResolvedValueOnce(page([brand('a', 'Acme')]))
        .mockRejectedValueOnce(new AdminApiError('NOT_FOUND', 404));

      renderAdmin(<BrandList />);
      await screen.findAllByText('Acme');
      await waitFor(() => expect(mockedAdminApi).toHaveBeenCalledTimes(2));

      expect(document.querySelector('[data-brand-row="a"]')).not.toHaveClass('bg-primary/5');
    });

    it('without a highlight param, nothing is pinned and no direct fetch happens', async () => {
      mockedAdminApi.mockResolvedValueOnce(page([brand('a', 'Acme')]));

      renderAdmin(<BrandList />);
      await screen.findAllByText('Acme');

      expect(document.querySelector('[data-brand-row="a"]')).not.toHaveClass('bg-primary/5');
      expect(mockedAdminApi).toHaveBeenCalledTimes(1);
    });
  });
});
