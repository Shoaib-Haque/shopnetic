/** Pulls the `code` out of the identity API's error envelope (`{ error: { code } }`). */
export function extractErrorCode(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { code?: unknown } }).error;
    if (err && typeof err.code === 'string') return err.code;
  }
  return undefined;
}
