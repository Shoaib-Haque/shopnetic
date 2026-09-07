/**
 * Product fixtures — every status, a variant-less product, a long title, and a
 * combinatorial product (5 colours × 4 sizes = 20 variants). Uses demo option
 * types (`color`, `size`) and fixture categories / brands. Dev / CI only.
 */
import type { PrismaClient } from '../../../../src/index.js';
import type { SeedCtx } from '../../ctx.js';
import { upsertProduct } from '../../factories.js';

const COLORS = ['black', 'white', 'blue', 'red', 'green'] as const;
const SIZES = ['s', 'm', 'l', 'xl'] as const;

export async function seedFixtureProducts(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  const statuses = ['draft', 'pending', 'active', 'archived'] as const;
  for (const status of statuses) {
    await upsertProduct(prisma, ctx, {
      slug: `fx-status-${status}`,
      categorySlug: 'fx-rtx-series',
      brandSlug: 'fx-no-aliases',
      title: `Status Sample — ${status}`,
      status,
      basePriceMinor: 4999,
      currency: 'USD',
    });
  }

  await upsertProduct(prisma, ctx, {
    slug: 'fx-no-variants',
    categorySlug: 'fx-long-90',
    brandSlug: 'fx-long-brand',
    title: 'Simple product with no options or variants',
    status: 'active',
    basePriceMinor: 999,
    currency: 'USD',
  });

  await upsertProduct(prisma, ctx, {
    slug: 'fx-long-title',
    categorySlug: 'fx-long-90',
    brandSlug: 'fx-many-aliases',
    title:
      'The Definitive All-Weather Multi-Purpose Everyday Carry Backpack with 27 Compartments, USB Pass-Through and Lifetime Warranty',
    status: 'active',
    basePriceMinor: 12999,
    currency: 'EUR',
  });

  await upsertProduct(prisma, ctx, {
    slug: 'fx-combinatorial',
    categorySlug: 'fx-rtx-series',
    brandSlug: 'fx-no-aliases',
    title: 'Combinatorial Tee (20 variants)',
    status: 'active',
    basePriceMinor: 2499,
    currency: 'USD',
    options: [
      { typeCode: 'color', valueCodes: [...COLORS] },
      { typeCode: 'size', valueCodes: [...SIZES] },
    ],
    variants: COLORS.flatMap((color) =>
      SIZES.map((size) => ({
        sku: `FXC-${color.toUpperCase().slice(0, 3)}-${size.toUpperCase()}`,
        select: [
          { typeCode: 'color', valueCode: color },
          { typeCode: 'size', valueCode: size },
        ],
      })),
    ),
  });
}
