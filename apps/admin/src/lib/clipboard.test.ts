import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyToClipboard } from './clipboard.js';

describe('copyToClipboard', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const res = await copyToClipboard('test-text');
    expect(res).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('test-text');
  });

  it('falls back to document.execCommand when navigator.clipboard is undefined', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const execMock = vi.fn().mockReturnValue(true);
    document.execCommand = execMock;

    const res = await copyToClipboard('fallback-text');
    expect(res).toBe(true);
    expect(execMock).toHaveBeenCalledWith('copy');
  });

  it('falls back to document.execCommand when navigator.clipboard.writeText rejects', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const execMock = vi.fn().mockReturnValue(true);
    document.execCommand = execMock;

    const res = await copyToClipboard('fallback-text');
    expect(res).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('fallback-text');
    expect(execMock).toHaveBeenCalledWith('copy');
  });
});
