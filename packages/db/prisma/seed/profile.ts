import { z } from 'zod';

/**
 * Seed profiles (plan/CODING-RULES.md section M):
 *
 * - `minimal` — the invariant core only (permissions, system roles, role→perm
 *   wiring, optional bootstrap Super Admin). Safe for production.
 * - `demo`    — `minimal` + `demo/*`: a believable, edge-case-free catalog you
 *   can put in front of a client. Default off production.
 * - `dev`     — `demo` + `fixtures/*`: every UI/UX edge case (deep trees, long /
 *   unicode names, archived + inactive rows, all statuses). Dev / CI only —
 *   throws if it would run under `NODE_ENV=production`.
 */
export type SeedProfile = 'minimal' | 'demo' | 'dev';

const schema = z.object({
  SEED_PROFILE: z.enum(['minimal', 'demo', 'dev']).optional(),
  /** Back-compat: the old boolean. `true` → demo, `false` → minimal. */
  SEED_DEMO: z.enum(['true', 'false']).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export function resolveProfile(source: NodeJS.ProcessEnv = process.env): SeedProfile {
  const { SEED_PROFILE, SEED_DEMO, NODE_ENV } = schema.parse(source);

  let profile: SeedProfile;
  if (SEED_PROFILE) profile = SEED_PROFILE;
  else if (SEED_DEMO === 'true') profile = 'demo';
  else if (SEED_DEMO === 'false') profile = 'minimal';
  else profile = NODE_ENV === 'production' ? 'minimal' : 'demo';

  if (NODE_ENV === 'production' && profile === 'dev') {
    throw new Error('SEED_PROFILE=dev must never run with NODE_ENV=production');
  }
  return profile;
}
