/**
 * Reduces an audit event's `before`/`after` JSON down to what actually
 * changed — an audit log's job is "what did this person change," not
 * "reproduce the exact record," so showing all 12 unchanged fields to find
 * the one that moved is the wrong default (plan/CODING-RULES.md's
 * discussion on this page).
 */

export interface DiffEntry {
  /** Dot path into nested objects, e.g. `name.en`. */
  path: string;
  /** `undefined` when the key didn't exist on this side (a field added/removed). */
  before: unknown;
  after: unknown;
}

/** Never meaningfully diffable: `id` can't change on an update (it's the
 * record's own key, already shown as the row's `targetId`), and `updatedAt`
 * changes as a side effect of every write regardless of what else changed —
 * the audit row's own timestamp already says when the write happened. */
const EXCLUDED_KEYS = new Set(['id', 'updatedAt']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Recurses into nested plain objects (`name: {en: 'x'}` → `name.en: 'x'`);
 * arrays and primitives stop the recursion and are compared as one unit —
 * flattening array indices into paths (`orderedIds.0`, `orderedIds.1`, …)
 * reads worse than just showing the whole array changed. */
function flatten(value: unknown, prefix = ''): Record<string, unknown> {
  if (!isPlainObject(value)) return { [prefix]: value };
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    Object.assign(out, flatten(v, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** Only meaningful when both sides are real objects — an update. A create
 * (`before: null`) or a delete (`after: null`) has nothing to diff *against*;
 * every field there is the whole relevant state, not a change, so the
 * caller should render those as a plain object dump instead of calling this. */
export function diffRecords(before: unknown, after: unknown): DiffEntry[] {
  if (!isPlainObject(before) || !isPlainObject(after)) return [];

  const beforeFlat = flatten(before);
  const afterFlat = flatten(after);
  const paths = new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]);

  const entries: DiffEntry[] = [];
  for (const path of paths) {
    const topKey = path.split('.')[0]!;
    if (EXCLUDED_KEYS.has(topKey)) continue;
    const b = beforeFlat[path];
    const a = afterFlat[path];
    if (!deepEqual(b, a)) entries.push({ path, before: b, after: a });
  }
  return entries.sort((x, y) => x.path.localeCompare(y.path));
}
