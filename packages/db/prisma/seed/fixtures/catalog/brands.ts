/**
 * Brand fixtures — long name, many aliases, none, and each non-active status
 * (`pending`, `rejected`, archived). Dev / CI only.
 */
import type { PrismaClient } from '../../../../src/index.js';
import type { SeedCtx } from '../../ctx.js';
import { upsertBrand } from '../../factories.js';

export async function seedFixtureBrands(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  await upsertBrand(prisma, ctx, {
    slug: 'fx-long-brand',
    name: 'The Extraordinarily Long Premium Heritage Manufacturing Company International Ltd.',
  });
  await upsertBrand(prisma, ctx, {
    slug: 'fx-many-aliases',
    name: 'Polyglot Audio',
    aliases: [
      'polyglot',
      'polyglot inc',
      'poly audio',
      'p-audio',
      'polyglot-audio',
      'polyglotaudio',
    ],
  });
  await upsertBrand(prisma, ctx, { slug: 'fx-no-aliases', name: 'Plainmark' });
  await upsertBrand(prisma, ctx, {
    slug: 'fx-pending',
    name: 'Awaiting Review Co.',
    status: 'pending',
  });
  await upsertBrand(prisma, ctx, {
    slug: 'fx-rejected',
    name: 'Rejected Brand Co.',
    status: 'rejected',
  });
  await upsertBrand(prisma, ctx, {
    slug: 'fx-archived-brand',
    name: 'Archived Brand Co.',
    archived: true,
  });
  await upsertBrand(prisma, ctx, {
    slug: 'fx-display-name',
    name: 'ACME Corp',
    displayName: 'ACME — Everything Store',
  });

  // ── a brand with a large alias set (UI-test data — 30 aliases, beyond the
  // 6 `fx-many-aliases` already has) ────────────────────────────────────────
  await upsertBrand(prisma, ctx, {
    slug: 'fx-huge-aliases',
    name: 'Megaphone Industries',
    aliases: Array.from({ length: 30 }, (_, i) => `megaphone-alias-${i + 1}`),
  });

  // ── volume: many live brands (UI-test data — pagination + the merge-target
  // picker, ~70 live brands total across demo + fixtures) ──────────────────
  for (let i = 1; i <= 56; i++) {
    await upsertBrand(prisma, ctx, { slug: `fx-live-brand-${i}`, name: `FX Live Brand ${i}` });
  }

  // ── volume: many archived brands (UI-test data — ~70 archived brands
  // total across fixtures) ──────────────────────────────────────────────────
  for (let i = 1; i <= 69; i++) {
    await upsertBrand(prisma, ctx, {
      slug: `fx-arch-brand-${i}`,
      name: `FX Archived Brand ${i}`,
      archived: true,
    });
  }
}
