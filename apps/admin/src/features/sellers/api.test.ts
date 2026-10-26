import { describe, expect, it, vi } from 'vitest';
import { adminApi } from '@/features/admin-api/client';
import { getSeller, listSellersPage, updateSellerStatus } from './api';

vi.mock('@/features/admin-api/client', () => ({
  adminApi: vi.fn(),
}));

const mockedAdminApi = vi.mocked(adminApi);

describe('sellers api', () => {
  describe('listSellersPage', () => {
    it('queries /sellers with raw=true when called with empty options', async () => {
      mockedAdminApi.mockResolvedValueOnce({
        data: [],
        meta: {},
      });

      const res = await listSellersPage({});
      expect(mockedAdminApi).toHaveBeenCalledWith('/sellers', { raw: true });
      expect(res).toEqual({ sellers: [], nextCursor: undefined });
    });

    it('serializes status, cursor, and limit query parameters', async () => {
      const mockSeller = {
        id: 'sel-1',
        accountId: 'acc-1',
        legalName: 'Acme Corp',
        type: 'business' as const,
        country: 'US',
        status: 'approved' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        shop: null,
      };

      mockedAdminApi.mockResolvedValueOnce({
        data: [mockSeller],
        meta: { nextCursor: 'next-cursor-token' },
      });

      const res = await listSellersPage({
        status: 'approved',
        cursor: 'cur-1',
        limit: 10,
        q: 'Stark',
      });

      expect(mockedAdminApi).toHaveBeenCalledWith(
        '/sellers?status=approved&cursor=cur-1&limit=10&q=Stark',
        { raw: true },
      );
      expect(res).toEqual({
        sellers: [mockSeller],
        nextCursor: 'next-cursor-token',
      });
    });
  });

  describe('getSeller', () => {
    it('queries /sellers/:id with high priority', async () => {
      const mockSeller = {
        id: 'sel-2',
        accountId: 'acc-2',
        legalName: 'Beta Inc',
        type: 'business' as const,
        country: 'GB',
        status: 'in_review' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        shop: null,
      };

      mockedAdminApi.mockResolvedValueOnce(mockSeller);

      const res = await getSeller('sel-2');
      expect(mockedAdminApi).toHaveBeenCalledWith('/sellers/sel-2', { priority: 'high' });
      expect(res).toEqual(mockSeller);
    });
  });

  describe('updateSellerStatus', () => {
    it('sends PATCH /sellers/:id/status with payload', async () => {
      const updatedSeller = {
        id: 'sel-3',
        accountId: 'acc-3',
        legalName: 'Gamma LLC',
        type: 'business' as const,
        country: 'CA',
        status: 'suspended' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        shop: null,
      };

      mockedAdminApi.mockResolvedValueOnce(updatedSeller);

      const payload = {
        status: 'suspended' as const,
        reason: 'Policy violations',
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      };

      const res = await updateSellerStatus('sel-3', payload);
      expect(mockedAdminApi).toHaveBeenCalledWith('/sellers/sel-3/status', {
        method: 'PATCH',
        body: payload,
      });
      expect(res).toEqual(updatedSeller);
    });
  });
});
