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
