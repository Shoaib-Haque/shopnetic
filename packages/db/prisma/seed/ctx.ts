/**
 * Shared state threaded through the seed pipeline. Each seeder records what it
 * created (keyed by natural key), so a later domain / the fixtures layer can
 * reference it without re-querying.
 */
export interface SeedCtx {
  /** category slug → { id, ltree path } */
  category: Map<string, { id: string; path: string }>;
  /** brand slug → id */
  brand: Map<string, string>;
  /** option-type code → { id, value code → value id } */
  optionType: Map<string, { id: string; valueIds: Record<string, string> }>;
  /** value-set name → id */
  valueSet: Map<string, string>;
  /** product slug → id */
  product: Map<string, string>;
  /** account email → id */
  account: Map<string, string>;
}

export function createSeedCtx(): SeedCtx {
  return {
    category: new Map(),
    brand: new Map(),
    optionType: new Map(),
    valueSet: new Map(),
    product: new Map(),
    account: new Map(),
  };
}

export interface SeedLog {
  info: (obj: Record<string, unknown>, msg: string) => void;
}
