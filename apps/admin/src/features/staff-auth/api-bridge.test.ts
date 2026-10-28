import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { callStaffApi } from './api-bridge';

describe('callStaffApi — header forwarding', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards user-agent, IP, x-correlation-id, and x-debug-* headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const headers = new Headers({
      'user-agent': 'Vitest/2.0',
      'x-forwarded-for': '127.0.0.1',
      'x-correlation-id': 'corr-abc',
      'x-debug-fault': '500',
      'x-debug-delay': '200',
    });

    await callStaffApi('/auth/login', {
      method: 'POST',
      json: { email: 'staff@test.com' },
      forwardHeaders: headers,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentHeaders = init.headers as Record<string, string>;

    expect(sentHeaders['user-agent']).toBe('Vitest/2.0');
    expect(sentHeaders['x-forwarded-for']).toBe('127.0.0.1');
    expect(sentHeaders['x-correlation-id']).toBe('corr-abc');
    expect(sentHeaders['x-debug-fault']).toBe('500');
    expect(sentHeaders['x-debug-delay']).toBe('200');
  });
});
