import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseJsonBody } from './api-route';

const schema = z.object({ email: z.string().email() });

function reqWith(body: unknown): Request {
  return new Request('http://localhost/api/x', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('parseJsonBody', () => {
  it('returns the parsed data on a valid body', async () => {
    const result = await parseJsonBody(reqWith({ email: 'a@b.com' }), schema);
    expect('data' in result && result.data).toEqual({ email: 'a@b.com' });
  });

  it('returns a 422 VALIDATION_ERROR response on a schema mismatch', async () => {
    const result = await parseJsonBody(reqWith({ email: 'not-an-email' }), schema);
    expect('error' in result).toBe(true);
    if (!('error' in result)) throw new Error('expected error');
    expect(result.error.status).toBe(422);
    expect(await result.error.json()).toEqual({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('collapses a non-JSON/malformed body into the same VALIDATION_ERROR, not a thrown exception', async () => {
    const req = new Request('http://localhost/api/x', { method: 'POST', body: 'not json' });
    const result = await parseJsonBody(req, schema);
    expect('error' in result).toBe(true);
    if (!('error' in result)) throw new Error('expected error');
    expect(result.error.status).toBe(422);
  });
});
