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

  it('returns false when both writeText and execCommand fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const execMock = vi.fn().mockReturnValue(false);
    document.execCommand = execMock;

    const res = await copyToClipboard('fallback-text');
    expect(res).toBe(false);
    expect(execMock).toHaveBeenCalledWith('copy');
  });

  it('selects and copies from already-focused active input matching text', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const input = document.createElement('input');
    input.value = 'active-input-text';
    document.body.appendChild(input);
    input.focus();

    const selectSpy = vi.spyOn(input, 'select');
    const execMock = vi.fn().mockReturnValue(true);
    document.execCommand = execMock;

    const res = await copyToClipboard('active-input-text');
    expect(res).toBe(true);
    expect(selectSpy).toHaveBeenCalled();
    expect(execMock).toHaveBeenCalledWith('copy');

    document.body.removeChild(input);
  });
});
