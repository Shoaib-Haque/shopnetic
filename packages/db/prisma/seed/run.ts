/**
 * Seed pipeline. Domains run in FK-dependency order (identity → catalog → …).
 * Add a new bounded context by importing its `demo/<domain>.ts` +
 * `fixtures/<domain>.ts` and slotting them into the two arrays below.
 */
import type { PrismaClient } from '../../src/index.js';
import { createSeedCtx, type SeedCtx, type SeedLog } from './ctx.js';
import type { SeedProfile } from './profile.js';
import { seedDemoCatalog } from './demo/catalog.js';
import { seedDemoIdentity } from './demo/identity.js';
import { seedFixtureCatalog } from './fixtures/catalog/index.js';
import { seedFixtureIdentity } from './fixtures/identity.js';

type Domain = (prisma: PrismaClient, ctx: SeedCtx, log: SeedLog) => Promise<void>;

const DEMO: Domain[] = [seedDemoIdentity, seedDemoCatalog];
const FIXTURES: Domain[] = [seedFixtureIdentity, seedFixtureCatalog];

export async function runSeedProfile(
  prisma: PrismaClient,
  log: SeedLog,
  profile: SeedProfile,
): Promise<void> {
  if (profile === 'minimal') {
    log.info({ profile }, 'profile=minimal — core only, no demo or fixture data');
    return;
  }

  const ctx = createSeedCtx();
  for (const seed of DEMO) await seed(prisma, ctx, log);
  if (profile === 'dev') {
    for (const seed of FIXTURES) await seed(prisma, ctx, log);
  }
  log.info({ profile }, 'seed profile complete');
}
