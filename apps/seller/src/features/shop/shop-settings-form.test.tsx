import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { Shop } from '@shopnetic/contracts';
import { renderSeller } from '@/test/render';
import { ShopSettingsForm } from './shop-settings-form';

describe('ShopSettingsForm', () => {
  const baseShop: Shop = {
    id: 'shop-1',
    sellerId: 'sel-1',
    slug: 'apex-goods',
    displayName: 'Apex Goods Official',
    description: 'Premier home goods',
    logoUrl: 'https://example.com/logo.png',
    bannerUrl: 'https://example.com/banner.png',
    vacationUntil: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders initial shop details correctly', () => {
    renderSeller(<ShopSettingsForm initialShop={baseShop} locale="en" />);

    expect(screen.getByTestId('input-edit-display-name')).toHaveValue('Apex Goods Official');
    expect(screen.getByTestId('textarea-edit-description')).toHaveValue('Premier home goods');
    expect(screen.getByTestId('input-edit-logo-url')).toHaveValue('https://example.com/logo.png');
    expect(screen.getByTestId('input-edit-banner-url')).toHaveValue(
      'https://example.com/banner.png',
    );
  });

  it('displays conflict banner with working reload action on 409 conflict', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 409,
      ok: false,
      json: async () => ({ error: { code: 'CONFLICT' } }),
    });

    renderSeller(<ShopSettingsForm initialShop={baseShop} locale="en" />);

    fireEvent.change(screen.getByTestId('input-edit-display-name'), {
      target: { value: 'Updated Shop Name' },
    });
    fireEvent.click(screen.getByTestId('btn-save-shop-settings'));

    await waitFor(() => {
      expect(screen.getByTestId('conflict-alert-banner')).toBeInTheDocument();
      expect(screen.getByTestId('conflict-reload-button')).toBeInTheDocument();
    });

    // Test reload action
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        data: {
          shop: {
            ...baseShop,
            displayName: 'Concurrent Updated Name',
            updatedAt: '2026-10-03T10:00:00.000Z',
          },
        },
      }),
    });

    fireEvent.click(screen.getByTestId('conflict-reload-button'));

    await waitFor(() => {
      expect(screen.getByTestId('input-edit-display-name')).toHaveValue('Concurrent Updated Name');
    });
  });
});
