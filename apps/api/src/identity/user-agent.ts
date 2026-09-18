import { UAParser } from 'ua-parser-js';

export interface ParsedUserAgent {
  browser: string | null;
  os: string | null;
  /** Pre-formatted "Chrome on macOS" (or as close as the raw UA lets us get)
   * — the admin UI renders this directly, no client-side parsing needed. */
  deviceLabel: string;
}

const UNKNOWN_LABEL = 'Unknown device';

/** Best-effort — a session's `userAgent` is whatever the client sent, which
 * can be missing, truncated, or from a bot/script that never looked like a
 * real browser. Never throws; a blank field renders as "Unknown device"
 * rather than crashing the whole session list. */
export function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  if (!userAgent) return { browser: null, os: null, deviceLabel: UNKNOWN_LABEL };
  const { browser, os } = UAParser(userAgent);
  const browserName = browser.name ?? null;
  const osName = os.name ?? null;
  const deviceLabel =
    browserName && osName
      ? `${browserName} on ${osName}`
      : (browserName ?? osName ?? UNKNOWN_LABEL);
  return { browser: browserName, os: osName, deviceLabel };
}
