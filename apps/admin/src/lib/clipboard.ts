/**
 * Copies a string to the clipboard in a browser environment.
 * Attempts modern navigator.clipboard.writeText first (secure context).
 * Falls back to document.execCommand('copy') using the active input selection
 * or a temporary in-container element (compatible with modal focus scopes).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback if writeText fails/rejects
    }
  }

  try {
    // 1. If an input or textarea with this value is already active/focused, copy directly
    const activeEl = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
      activeEl.value === text
    ) {
      activeEl.select();
      activeEl.setSelectionRange(0, activeEl.value.length);
      const successful = document.execCommand('copy');
      if (successful) return true;
    }

    // 2. Otherwise create a temporary textarea attached to the active element's container
    // (appending to the active container ensures it stays inside any modal dialog focus trap)
    const container = activeEl?.parentElement ?? document.body;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    textarea.style.fontSize = '12pt';
    container.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const successful = document.execCommand('copy');
    container.removeChild(textarea);
    return successful;
  } catch {
    return false;
  }
}
