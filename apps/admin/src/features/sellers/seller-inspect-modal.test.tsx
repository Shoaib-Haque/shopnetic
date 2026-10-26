import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { SellerWithShop } from '@shopnetic/contracts';
import { notify } from '@shopnetic/ui';
import { renderAdmin } from '@/test/render';
import { AdminApiError } from '@/features/admin-api/client';
import { getSeller, updateSellerStatus } from './api';
import { SellerInspectModal } from './seller-inspect-modal';

vi.mock('./api', () => ({
  getSeller: vi.fn(),
  updateSellerStatus: vi.fn(),
}));

const mockedGetSeller = vi.mocked(getSeller);
const mockedUpdateSellerStatus = vi.mocked(updateSellerStatus);

function sampleSeller(overrides: Partial<SellerWithShop> = {}): SellerWithShop {
  return {
    id: 'sel-1',
    accountId: 'acc-1',
    legalName: 'Acme Global Corp',
    type: 'business',
    country: 'US',
    status: 'in_review',
    commissionOverrideBps: null,
    reserveBps: null,
    deletedAt: null,
    accountEmail: 'owner@acme.com',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T12:00:00.000Z',
    shop: {
      id: 'shop-1',
      sellerId: 'sel-1',
      slug: 'acme-official',
      displayName: 'Acme Official Store',
      description: 'The authentic ACME store on Shopnetic.',
      logoUrl: null,
      bannerUrl: null,
      vacationUntil: '2026-12-31T00:00:00.000Z',
      deletedAt: null,
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SellerInspectModal', () => {
  it('renders nothing when seller is null or open is false', () => {
    renderAdmin(
      <SellerInspectModal
        open={false}
        onOpenChange={vi.fn()}
        seller={sampleSeller()}
        onUpdated={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    renderAdmin(
      <SellerInspectModal open={true} onOpenChange={vi.fn()} seller={null} onUpdated={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders storefront profile, legal info, account email, and audit log deep-link', () => {
    const seller = sampleSeller();
    renderAdmin(
      <SellerInspectModal
        open={true}
        onOpenChange={vi.fn()}
        seller={seller}
        onUpdated={vi.fn()}
        locale="en"
        basePath="x7f2k9t3m1qp"
      />,
    );

    // Modal title & subtitle
    expect(screen.getByText('Seller Details & Moderation')).toBeInTheDocument();
    expect(
      screen.getByText('Inspect legal details, storefront profile, and manage account status.'),
    ).toBeInTheDocument();

    // Storefront Profile
    expect(screen.getByText('Acme Official Store')).toBeInTheDocument();
    expect(screen.getByText('/acme-official')).toBeInTheDocument();
    expect(screen.getByText('The authentic ACME store on Shopnetic.')).toBeInTheDocument();

    // Legal Information
    expect(screen.getByText('Acme Global Corp')).toBeInTheDocument();
    expect(screen.getByText('Business')).toBeInTheDocument();
    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.getByText('owner@acme.com')).toBeInTheDocument();
    expect(screen.getByText('sel-1')).toBeInTheDocument();
    expect(screen.getByText('acc-1')).toBeInTheDocument();

    // Audit Log Link
    const auditLink = screen.getByRole('link', { name: /view in audit log/i });
    expect(auditLink).toHaveAttribute(
      'href',
      '/en/x7f2k9t3m1qp/audit-log?targetId=sel-1&targetType=seller',
    );
  });

  it('handles seller without shop cleanly with fallback indicators', () => {
    const seller = sampleSeller({ shop: null });
    renderAdmin(
      <SellerInspectModal open={true} onOpenChange={vi.fn()} seller={seller} onUpdated={vi.fn()} />,
    );

    expect(screen.getByText('No description provided.')).toBeInTheDocument();
  });

  it('displays valid transition buttons according to VALID_SELLER_STATUS_TRANSITIONS matrix', () => {
    // 1. in_review -> approved, closed
    const { unmount: u1 } = renderAdmin(
      <SellerInspectModal
        open={true}
        onOpenChange={vi.fn()}
        seller={sampleSeller({ status: 'in_review' })}
        onUpdated={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Approved' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Closed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspended' })).not.toBeInTheDocument();
    u1();

    // 2. approved -> suspended, offboarding
    const { unmount: u2 } = renderAdmin(
      <SellerInspectModal
        open={true}
        onOpenChange={vi.fn()}
        seller={sampleSeller({ status: 'approved' })}
        onUpdated={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Suspended' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offboarding' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approved' })).not.toBeInTheDocument();
    u2();

    // 3. draft -> in_review
    const { unmount: u3 } = renderAdmin(
      <SellerInspectModal
        open={true}
        onOpenChange={vi.fn()}
        seller={sampleSeller({ status: 'draft' })}
        onUpdated={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'In review' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approved' })).not.toBeInTheDocument();
    u3();

    // 4. closed -> terminal state (no transitions)
    renderAdmin(
      <SellerInspectModal
        open={true}
        onOpenChange={vi.fn()}
        seller={sampleSeller({ status: 'closed' })}
        onUpdated={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        'This seller account is closed and in a terminal state. No further status transitions are permitted.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument();
  });

  it('allows optional reason on non-disciplinary transition (Approved)', async () => {
    const notifySpy = vi.spyOn(notify, 'saved').mockImplementation(() => '');
    const onUpdated = vi.fn();
    const onOpenChange = vi.fn();
    const seller = sampleSeller({ status: 'in_review' });

    const updatedSeller: SellerWithShop = {
      ...seller,
      status: 'approved',
      updatedAt: '2026-01-02T13:00:00.000Z',
    };
    mockedUpdateSellerStatus.mockResolvedValueOnce(updatedSeller);

    renderAdmin(
      <SellerInspectModal
        open={true}
        onOpenChange={onOpenChange}
        seller={seller}
        onUpdated={onUpdated}
      />,
    );

    // Click target status Approved
    fireEvent.click(screen.getByRole('button', { name: 'Approved' }));

    // Apply button is immediately enabled without typing reason
    const applyBtn = screen.getByRole('button', { name: 'Update status' });
    expect(applyBtn).toBeEnabled();

    // Click Apply
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockedUpdateSellerStatus).toHaveBeenCalledWith('sel-1', {
        status: 'approved',
        reason: undefined,
        expectedUpdatedAt: seller.updatedAt,
      });
      expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining('Acme Official Store'));
      expect(onUpdated).toHaveBeenCalledWith(updatedSeller);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('enforces mandatory reason (min 5 chars) on disciplinary transition (Suspended)', async () => {
    const onUpdated = vi.fn();
    const onOpenChange = vi.fn();
    const seller = sampleSeller({ status: 'approved' });

    renderAdmin(
      <SellerInspectModal
        open={true}
        onOpenChange={onOpenChange}
        seller={seller}
        onUpdated={onUpdated}
      />,
    );

    // Select Suspended
    fireEvent.click(screen.getByRole('button', { name: 'Suspended' }));

    const applyBtn = screen.getByRole('button', { name: 'Update status' });
    // Disabled initially because reason is empty (< 5 chars)
    expect(applyBtn).toBeDisabled();

    const textarea = screen.getByPlaceholderText(
      'Enter a reason for this disciplinary action (required, min 5 chars)…',
    );
    expect(textarea).toBeInTheDocument();

    // Enter short reason (< 5 chars)
    fireEvent.change(textarea, { target: { value: 'bad' } });
    expect(applyBtn).toBeDisabled();
    expect(
      screen.getByText('Please provide a reason with at least 5 characters.'),
    ).toBeInTheDocument();

    // Enter valid reason (>= 5 chars)
    fireEvent.change(textarea, { target: { value: 'Repeated counterfeit reports' } });
    expect(
      screen.queryByText('Please provide a reason with at least 5 characters.'),
    ).not.toBeInTheDocument();
    expect(applyBtn).toBeEnabled();

    const updatedSeller: SellerWithShop = {
      ...seller,
      status: 'suspended',
      updatedAt: '2026-01-02T14:00:00.000Z',
    };
    mockedUpdateSellerStatus.mockResolvedValueOnce(updatedSeller);

    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockedUpdateSellerStatus).toHaveBeenCalledWith('sel-1', {
        status: 'suspended',
        reason: 'Repeated counterfeit reports',
        expectedUpdatedAt: seller.updatedAt,
      });
      expect(onUpdated).toHaveBeenCalledWith(updatedSeller);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('renders OCC 409 conflict banner and supports reload recovery', async () => {
    const seller = sampleSeller({ status: 'in_review' });
    mockedUpdateSellerStatus.mockRejectedValueOnce(new AdminApiError('CONFLICT', 409));

    renderAdmin(
      <SellerInspectModal open={true} onOpenChange={vi.fn()} seller={seller} onUpdated={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approved' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));

    // Conflict banner appears
    expect(await screen.findByText('Seller updated concurrently')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This seller was updated by another administrator. Please reload to review the latest changes.',
      ),
    ).toBeInTheDocument();

    // Mock reload
    const reloadedSeller: SellerWithShop = {
      ...seller,
      status: 'approved',
      updatedAt: '2026-01-02T15:00:00.000Z',
    };
    mockedGetSeller.mockResolvedValueOnce(reloadedSeller);

    fireEvent.click(screen.getByRole('button', { name: 'Reload seller' }));

    await waitFor(() => {
      expect(mockedGetSeller).toHaveBeenCalledWith('sel-1');
      // Conflict banner cleared
      expect(screen.queryByText('Seller updated concurrently')).not.toBeInTheDocument();
      // Status badge updated
      expect(screen.getByText('Approved')).toBeInTheDocument();
    });
  });

  it('displays defense-in-depth error if API returns SELLER_STATUS_TRANSITION_INVALID (422)', async () => {
    const seller = sampleSeller({ status: 'in_review' });
    mockedUpdateSellerStatus.mockRejectedValueOnce(
      new AdminApiError('SELLER_STATUS_TRANSITION_INVALID', 422),
    );

    renderAdmin(
      <SellerInspectModal open={true} onOpenChange={vi.fn()} seller={seller} onUpdated={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approved' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));

    expect(
      await screen.findByText('No status transitions available from current state.'),
    ).toBeInTheDocument();
  });
});
