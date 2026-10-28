import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { extractForwardHeaders } from './bridge';

describe('extractForwardHeaders', () => {
  it('extracts x-debug-* and x-correlation-id headers while ignoring standard headers', () => {
    const headers = new Headers({
      'content-type': 'application/json',
      authorization: 'Bearer secret',
      'x-correlation-id': 'corr-123',
      'x-debug-fault': '500',
      'x-debug-delay': '1500',
      'x-custom-unrelated': 'ignored',
    });

    const result = extractForwardHeaders(headers);

    expect(result).toEqual({
      'x-correlation-id': 'corr-123',
      'x-debug-fault': '500',
      'x-debug-delay': '1500',
    });
  });

  it('returns an empty object when no debug or correlation headers are present', () => {
    const headers = new Headers({
      'content-type': 'application/json',
      cookie: 'sn_srt=token',
    });

    expect(extractForwardHeaders(headers)).toEqual({});
  });
});
