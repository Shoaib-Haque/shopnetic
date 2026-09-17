import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson, postJson } from './submit.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  mockFetch.mockReset();
});

describe('postJson', () => {
  it('sends a JSON POST and normalizes a successful JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { ok: true } }),
    });

    const result = await postJson('/api/thing', { a: 1 });

    expect(mockFetch).toHaveBeenCalledWith('/api/thing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
    expect(result).toEqual({ ok: true, status: 200, body: { data: { ok: true } } });
  });

  it('normalizes a non-2xx response without throwing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: { code: 'VALIDATION_ERROR' } }),
    });

    const result = await postJson('/api/thing', {});
    expect(result).toEqual({
      ok: false,
      status: 422,
      body: { error: { code: 'VALIDATION_ERROR' } },
    });
  });

  it('a body with no JSON (e.g. 204 No Content) resolves body: null instead of throwing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('Unexpected end of JSON input')),
    });

    const result = await postJson('/api/thing', {});
    expect(result).toEqual({ ok: true, status: 204, body: null });
  });

  it('a network failure returns status 0 rather than throwing', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await postJson('/api/thing', {});
    expect(result).toEqual({ ok: false, status: 0, body: null });
  });
});

describe('getJson', () => {
  it('sends a plain GET and normalizes a successful JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { valid: true } }),
    });

    const result = await getJson('/api/thing?token=abc');

    expect(mockFetch).toHaveBeenCalledWith('/api/thing?token=abc');
    expect(result).toEqual({ ok: true, status: 200, body: { data: { valid: true } } });
  });

  it('a network failure returns status 0 rather than throwing', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await getJson('/api/thing');
    expect(result).toEqual({ ok: false, status: 0, body: null });
  });
});
