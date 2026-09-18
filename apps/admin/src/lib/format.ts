/** G7: interpolated into a fixed-width dialog/toast — cap the value *before*
 * it's embedded, not after, so a long name wraps the sentence instead of the
 * sentence growing to fit it (default 60, matching G7's dialog/toast rule).
 * A native `<select>` option label uses the other G7 sub-rule instead — pass
 * `max: 64` explicitly there rather than relying on this default. The full
 * value is always one hover/click away (the row's own `title=`, the Edit
 * form), so nothing is actually lost by capping the copy embedded here. */
export function capForMessage(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Postgres/Node's dual-stack sockets report a plain IPv4 client as an
 * IPv4-mapped IPv6 address (`::ffff:203.0.113.5`) — technically correct, but
 * reads as a confusing/broken-looking IPv6 address to an admin skimming a
 * list. Strips the `::ffff:` prefix back down to the plain IPv4 form; a real
 * (non-mapped) IPv6 address, or `null`, passes through unchanged. */
export function formatIp(ip: string | null): string {
  if (!ip) return '—';
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}
