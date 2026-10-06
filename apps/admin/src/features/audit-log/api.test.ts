import { describe, expect, it, vi } from 'vitest';
import { auditLogApi } from '@/features/admin-api/client';
import { listAuditEvents } from './api';

vi.mock('@/features/admin-api/client', () => ({
  auditLogApi: vi.fn(),
}));

const mockedAuditLogApi = vi.mocked(auditLogApi);

describe('auditLog api — listAuditEvents', () => {
  it('defaults to limit=30 when called with no arguments', async () => {
    mockedAuditLogApi.mockResolvedValueOnce({ data: [], meta: { requestId: 'req-1' } });

    const result = await listAuditEvents();
    expect(mockedAuditLogApi).toHaveBeenCalledWith('?limit=30', { raw: true });
    expect(result).toEqual({ events: [], nextCursor: undefined });
  });

  it('supports options object syntax with filters and custom limit', async () => {
    mockedAuditLogApi.mockResolvedValueOnce({
      data: [{ id: 'evt-1' } as never],
      meta: { requestId: 'req-2', nextCursor: 'next-1' },
    });

    const result = await listAuditEvents({
      cursor: 'c1',
      q: 'super',
      domain: 'identity',
      targetType: 'account',
      from: '2026-09-01',
      to: '2026-09-15',
      limit: 10,
    });

    expect(mockedAuditLogApi).toHaveBeenCalledWith(
      '?limit=10&cursor=c1&q=super&domain=identity&targetType=account&from=2026-09-01&to=2026-09-15',
      { raw: true },
    );
    expect(result.events).toHaveLength(1);
    expect(result.nextCursor).toBe('next-1');
  });

  it('supports legacy positional arguments syntax', async () => {
    mockedAuditLogApi.mockResolvedValueOnce({ data: [], meta: { requestId: 'req-3' } });

    await listAuditEvents('c2', { domain: 'catalog', q: 'brand' });
    expect(mockedAuditLogApi).toHaveBeenCalledWith('?limit=30&cursor=c2&q=brand&domain=catalog', {
      raw: true,
    });
  });
});
