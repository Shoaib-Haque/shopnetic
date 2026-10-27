import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { SellerWithShop } from '@shopnetic/contracts';
import { renderSeller } from '@/test/render';
import { OnboardingWizard } from './onboarding-wizard';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    // Reset global fetch mock
    global.fetch = vi.fn();
  });

  it('validates Step 1 fields and blocks Continue when invalid', async () => {
    renderSeller(<OnboardingWizard accountId="acc-1" locale="en" />);

    const continueBtn = screen.getByTestId('btn-step1-continue');
    expect(continueBtn).toBeInTheDocument();

    // Trigger continue with empty fields
    fireEvent.click(continueBtn);

    // Continue is now disabled because inputs are invalid
    expect(continueBtn).toBeDisabled();
    expect(screen.getByText('Legal name must be at least 2 characters.')).toBeInTheDocument();
    expect(screen.getByText('Please enter a valid 2-letter ISO country code.')).toBeInTheDocument();
  });

  it('navigates from Step 1 to Step 2 when valid data is entered', async () => {
    renderSeller(<OnboardingWizard accountId="acc-1" locale="en" />);

    fireEvent.change(screen.getByTestId('input-legal-name'), {
      target: { value: 'Acme Europe SRL' },
    });
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'FR' } });

    const continueBtn = screen.getByTestId('btn-step1-continue');
    expect(continueBtn).not.toBeDisabled();
    fireEvent.click(continueBtn);

    // Advanced to Step 2
    expect(screen.getByTestId('input-shop-name')).toBeInTheDocument();
    expect(screen.getByTestId('input-shop-slug')).toBeInTheDocument();
  });

  it('displays inline error and disables Continue when slug is taken', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { available: false } }),
    });

    renderSeller(<OnboardingWizard accountId="acc-1" locale="en" />);

    // Step 1
    fireEvent.change(screen.getByTestId('input-legal-name'), {
      target: { value: 'Apex Corporation' },
    });
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'US' } });
    fireEvent.click(screen.getByTestId('btn-step1-continue'));

    // Step 2
    const slugInput = screen.getByTestId('input-shop-slug');
    fireEvent.change(slugInput, { target: { value: 'apex-goods' } });

    await waitFor(() => {
      expect(screen.getByTestId('slug-taken-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('btn-step2-continue')).toBeDisabled();
    });
  });

  it('displays green checkmark and enables Continue when slug is available', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { available: true } }),
    });

    renderSeller(<OnboardingWizard accountId="acc-1" locale="en" />);

    // Step 1
    fireEvent.change(screen.getByTestId('input-legal-name'), {
      target: { value: 'Nouveau Artisan' },
    });
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'FR' } });
    fireEvent.click(screen.getByTestId('btn-step1-continue'));

    // Step 2
    fireEvent.change(screen.getByTestId('input-shop-name'), {
      target: { value: 'Nouveau Artisan' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('slug-available-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('btn-step2-continue')).not.toBeDisabled();
    });
  });

  it('renders Changes Requested alert when applicant has draft with lastReviewNote', () => {
    const draftSeller: SellerWithShop = {
      id: 'sel-1',
      accountId: 'acc-1',
      legalName: 'Original Legal Name',
      type: 'business',
      country: 'FR',
      status: 'draft',
      lastReviewNote: 'Please provide registered company legal name',
      commissionOverrideBps: null,
      reserveBps: null,
      accountEmail: 'applicant@example.com',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-02T10:00:00.000Z',
      deletedAt: null,
      shop: {
        id: 'shop-1',
        sellerId: 'sel-1',
        slug: 'original-shop',
        displayName: 'Original Shop',
        description: 'Test shop',
        logoUrl: null,
        bannerUrl: null,
        vacationUntil: null,
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
        deletedAt: null,
      },
    };

    renderSeller(<OnboardingWizard accountId="acc-1" initialSeller={draftSeller} locale="en" />);

    expect(screen.getByTestId('changes-requested-banner')).toBeInTheDocument();
    expect(screen.getByText('Please provide registered company legal name')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Original Legal Name')).toBeInTheDocument();
  });
});
