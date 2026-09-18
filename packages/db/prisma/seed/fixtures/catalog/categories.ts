/**
 * Category fixtures — a level-6 branch, a wide sibling group, long / unicode /
 * emoji names, and archived + inactive rows. Slugs are `fx-…` and names are
 * `FX …` so they never collide with the demo tree (category name + slug are
 * globally unique). Dev / CI only.
 */
import type { PrismaClient } from '../../../../src/index.js';
import type { SeedCtx } from '../../ctx.js';
import { upsertCategory } from '../../factories.js';

const LONG_90 =
  'FX Premium Wireless Noise-Cancelling Over-Ear Headphones for Studio, Travel & Daily Commute';
const LONG_200 =
  `FX Ultra Long Category Name Used To Exercise Truncation And Wrapping Everywhere It Appears — ${'lorem ipsum dolor sit amet '.repeat(4)}`.slice(
    0,
    198,
  );

export async function seedFixtureCategories(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  const c = (
    parent: string | null,
    slug: string,
    name: string,
    extra: { isActive?: boolean; archived?: boolean; position?: number } = {},
  ): Promise<unknown> =>
    upsertCategory(prisma, ctx, { parent, slug, name, brandRequirement: 'optional', ...extra });

  // ── level-6 branch ────────────────────────────────────────────────────────
  await c(null, 'fx-tech', 'FX Tech');
  await c('fx-tech', 'fx-computers', 'FX Computers');
  await c('fx-computers', 'fx-laptops', 'FX Laptops');
  await c('fx-laptops', 'fx-gaming-laptops', 'FX Gaming Laptops');
  await c('fx-gaming-laptops', 'fx-17-inch', 'FX 17-inch');
  await c('fx-17-inch', 'fx-rtx-series', 'FX RTX 40-Series');

  // ── wide sibling group (12 children) ──────────────────────────────────────
  await c(null, 'fx-accessories', 'FX Accessories');
  for (let i = 1; i <= 12; i++) {
    await c('fx-accessories', `fx-acc-${i}`, `FX Accessory Group ${i}`, { position: i });
  }

  // ── long names ───────────────────────────────────────────────────────────
  await c(null, 'fx-long-90', LONG_90);
  await c(null, 'fx-long-200', LONG_200);

  // ── unicode / emoji ──────────────────────────────────────────────────────
  await c(null, 'fx-jp', 'FX 日本語 カテゴリ');
  await c(null, 'fx-ru', 'FX Категория товаров');
  await c(null, 'fx-ar', 'FX قسم التسوق');
  await c(null, 'fx-emoji', 'FX 🎧 Audio Gear');

  // ── lifecycle ────────────────────────────────────────────────────────────
  await c(null, 'fx-inactive', 'FX Hidden but live (inactive)', { isActive: false });
  await c(null, 'fx-archived-root', 'FX Archived root', { archived: true });
  await c('fx-archived-root', 'fx-archived-child', 'FX Archived child', { archived: true });

  // ── volume: a wide live group (UI-test data — pagination on the Live/All
  // tabs, ~70 live categories total across demo + fixtures) ────────────────
  await c(null, 'fx-live-group', 'FX Live Volume Group');
  for (let i = 1; i <= 28; i++) {
    await c('fx-live-group', `fx-live-item-${i}`, `FX Live Item ${i}`, { position: i });
  }

  // ── volume: a second deep archived branch, 6 levels, every level archived
  // — exercises the breadcrumb-pool fix (an archived row's ancestors, also
  // archived, resolved from the full-table pool, not just the current
  // Archived-tab page) ──────────────────────────────────────────────────────
  await c(null, 'fx-arch-tech', 'FX Archived Tech', { archived: true });
  await c('fx-arch-tech', 'fx-arch-computers', 'FX Archived Computers', { archived: true });
  await c('fx-arch-computers', 'fx-arch-laptops', 'FX Archived Laptops', { archived: true });
  await c('fx-arch-laptops', 'fx-arch-gaming', 'FX Archived Gaming Laptops', { archived: true });
  await c('fx-arch-gaming', 'fx-arch-17-inch', 'FX Archived 17-inch', { archived: true });
  await c('fx-arch-17-inch', 'fx-arch-rtx', 'FX Archived RTX Series', { archived: true });

  // ── volume: a wide archived group (~70 archived categories total across
  // fixtures) — forces multiple Archived-tab pages, and puts most of its
  // rows' single-level ancestor (`fx-arch-group` itself) off the first page
  // once there are enough of them, so its name must come from the
  // breadcrumb pool rather than the current page. ──────────────────────────
  await c(null, 'fx-arch-group', 'FX Archived Volume Group', { archived: true });
  for (let i = 1; i <= 61; i++) {
    await c('fx-arch-group', `fx-arch-item-${i}`, `FX Archived Item ${i}`, {
      archived: true,
      position: i,
    });
  }
}
