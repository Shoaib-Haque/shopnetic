import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import type { SellerWithShop } from '@shopnetic/contracts';
import { renderSeller } from '@/test/render';
import { StatusView } from './status-view';

describe('StatusView', () => {
  const baseSeller: SellerWithShop = {
    id: 'sel-1',
    accountId: 'acc-1',
    legalName: 'Apex Goods Inc',
    type: 'business',
    country: 'US',
    status: 'in_review',
    lastReviewNote: null,
    commissionOverrideBps: null,
    reserveBps: null,
    accountEmail: 'owner@apex.com',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
    deletedAt: null,
    shop: {
      id: 'shop-1',
      sellerId: 'sel-1',
      slug: 'apex-goods',
      displayName: 'Apex Goods Official',
      description: 'Quality goods',
      logoUrl: null,
      bannerUrl: null,
      vacationUntil: null,
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
      deletedAt: null,
    },
  };

  it('renders "Under Review" card when status is in_review', () => {
    renderSeller(<StatusView seller={baseSeller} locale="en" />);

    expect(screen.getByTestId('status-under-review-card')).toBeInTheDocument();
    expect(screen.getByText('Application Under Review')).toBeInTheDocument();
    expect(screen.getByText('Apex Goods Official')).toBeInTheDocument();
    expect(screen.getByText('apex-goods')).toBeInTheDocument();
    expect(screen.getByText('1–2 Business Days')).toBeInTheDocument();
  });

  it('renders "Application Denied" notice when status is closed', () => {
    const closedSeller: SellerWithShop = { ...baseSeller, status: 'closed' };
    renderSeller(<StatusView seller={closedSeller} locale="en" />);

    expect(screen.getByTestId('status-application-denied-card')).toBeInTheDocument();
    expect(screen.getByText('Application Not Approved')).toBeInTheDocument();
    expect(screen.getByText('Account Decision Notice')).toBeInTheDocument();
    expect(screen.getByText('Contact Support')).toBeInTheDocument();
  });
});
