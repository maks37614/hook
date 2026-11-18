/**
 * Copy chart pair labels on HTTPS mobile browsers, including a fallback for
 * browsers where navigator.clipboard is unavailable or rejects permission.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard permission failed; try synchronous selection fallback.
    }
  }
  if (typeof document === 'undefined' || !document.body || typeof document.execCommand !== 'function') return false;

  const input = document.createElement('textarea');
  input.value = text;
  input.readOnly = true;
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.top = '0';
  input.setAttribute('aria-hidden', 'true');
  const lastFocused = document.activeElement as HTMLElement | null;
  document.body.appendChild(input);
  try {
    input.focus();
    input.select();
    input.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    input.remove();
    lastFocused?.focus?.({ preventScroll: true });
  }
}
