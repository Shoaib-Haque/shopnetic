/**
 * Seller / warehouse fixtures — beyond demo's 2 (one 1P-style, one 3P), a
 * wider seller roster so the offer seller/warehouse pickers and the seller
 * admin UI have real variety to page/filter/search through: every
 * `SellerStatus`, several countries, a seller with no warehouse at all (the
 * "warehouse picker falls back to an empty state" case), and a seller with
 * many warehouses (warehouse-picker scroll). Runs before
 * `fixtures/catalog/products.ts` so 3P-origin products can reference these
 * shop slugs. Dev / CI only.
 */
import { Role } from '@shopnetic/auth';
import type { PrismaClient } from '../../../src/index.js';
import type { SeedCtx, SeedLog } from '../ctx.js';
import { upsertAccount, upsertSeller, upsertWarehouse } from '../factories.js';

/** Each single-warehouse seller's default warehouse name, keyed by shop slug
 * — `fixtures/inventory.ts` needs these to seed offers/stock. Built once
 * here so the two files can't drift apart on naming. */
export const DEFAULT_WAREHOUSE_NAME: Record<string, string> = {
  'fx-seller-gb': 'Albion Goods Ltd. — London DC',
  'fx-seller-de': 'Nordwind Handels GmbH — Berlin DC',
  'fx-seller-in': 'Sundar Exports Pvt. Ltd. — Mumbai DC',
  'fx-seller-jp': 'Kurosaki Shouji K.K. — Osaka DC',
  'fx-seller-ca': 'Maple Ridge Supply Co. — Toronto DC',
  'fx-seller-au': 'Outback Mercantile Pty Ltd. — Sydney DC',
  'fx-seller-review': 'Nouveau Marché SARL — Lyon DC',
  'fx-seller-suspended': 'Horizonte Comércio Ltda. — São Paulo DC',
  'fx-seller-offboarding': 'Legacy Traders S.A. — Monterrey DC',
  'fx-seller-closed': 'Shuttered Supply Inc. — Reno DC',
};

/** `fx-many-warehouse-seller`'s 5 warehouse names, in creation order. */
export const MANY_WAREHOUSE_NAMES = [
  'FX Hub 1 (Dallas)',
  'FX Hub 2 (Reno)',
  'FX Hub 3 (Columbus)',
  'FX Hub 4 (Atlanta)',
  'FX Hub 5 (Newark)',
];

export async function seedFixtureSellers(
  prisma: PrismaClient,
  ctx: SeedCtx,
  log: SeedLog,
): Promise<void> {
  const seller = async (spec: {
    slug: string;
    legalName: string;
    country: string;
    status: 'draft' | 'in_review' | 'approved' | 'suspended' | 'offboarding' | 'closed';
    displayName: string;
  }): Promise<void> => {
    const email = `${spec.slug}@shopnetic.test`;
    await upsertAccount(prisma, ctx, {
      email,
      plane: 'marketplace',
      password: '12345678',
      roles: [Role.SELLER],
    });
    await upsertSeller(prisma, ctx, {
      accountEmail: email,
      legalName: spec.legalName,
      country: spec.country,
      status: spec.status,
      shop: { slug: spec.slug, displayName: spec.displayName },
    });
  };

  // ── no warehouse at all — offer/warehouse pickers must fall back cleanly ──
  await seller({
    slug: 'fx-no-warehouse-seller',
    legalName: 'No Warehouse Trading Co.',
    country: 'US',
    status: 'approved',
    displayName: 'FX No-Warehouse Seller',
  });

  // ── many warehouses — warehouse-picker scroll ──────────────────────────────
  await seller({
    slug: 'fx-many-warehouse-seller',
    legalName: 'Global Fulfillment Partners Ltd.',
    country: 'US',
    status: 'approved',
    displayName: 'FX Many-Warehouse Seller',
  });
  const warehouseCities = [
    { city: 'Dallas', state: 'TX', postalCode: '75201' },
    { city: 'Reno', state: 'NV', postalCode: '89501' },
    { city: 'Columbus', state: 'OH', postalCode: '43215' },
    { city: 'Atlanta', state: 'GA', postalCode: '30301' },
    { city: 'Newark', state: 'NJ', postalCode: '07102' },
  ];
  for (const [i, loc] of warehouseCities.entries()) {
    await upsertWarehouse(prisma, ctx, {
      sellerSlug: 'fx-many-warehouse-seller',
      name: `FX Hub ${i + 1} (${loc.city})`,
      isDefault: i === 0,
      address: { line1: `${(i + 1) * 100} Distribution Way`, country: 'US', ...loc },
    });
  }

  // ── one warehouse each, across countries + every remaining status ─────────
  const singleWarehouseSellers: {
    slug: string;
    legalName: string;
    country: string;
    status: 'draft' | 'in_review' | 'approved' | 'suspended' | 'offboarding' | 'closed';
    city: string;
  }[] = [
    {
      slug: 'fx-seller-gb',
      legalName: 'Albion Goods Ltd.',
      country: 'GB',
      status: 'approved',
      city: 'London',
    },
    {
      slug: 'fx-seller-de',
      legalName: 'Nordwind Handels GmbH',
      country: 'DE',
      status: 'approved',
      city: 'Berlin',
    },
    {
      slug: 'fx-seller-in',
      legalName: 'Sundar Exports Pvt. Ltd.',
      country: 'IN',
      status: 'approved',
      city: 'Mumbai',
    },
    {
      slug: 'fx-seller-jp',
      legalName: 'Kurosaki Shouji K.K.',
      country: 'JP',
      status: 'approved',
      city: 'Osaka',
    },
    {
      slug: 'fx-seller-ca',
      legalName: 'Maple Ridge Supply Co.',
      country: 'CA',
      status: 'approved',
      city: 'Toronto',
    },
    {
      slug: 'fx-seller-au',
      legalName: 'Outback Mercantile Pty Ltd.',
      country: 'AU',
      status: 'approved',
      city: 'Sydney',
    },
    {
      slug: 'fx-seller-review',
      legalName: 'Nouveau Marché SARL',
      country: 'FR',
      status: 'in_review',
      city: 'Lyon',
    },
    {
      slug: 'fx-seller-suspended',
      legalName: 'Horizonte Comércio Ltda.',
      country: 'BR',
      status: 'suspended',
      city: 'São Paulo',
    },
    {
      slug: 'fx-seller-offboarding',
      legalName: 'Legacy Traders S.A.',
      country: 'MX',
      status: 'offboarding',
      city: 'Monterrey',
    },
    {
      slug: 'fx-seller-closed',
      legalName: 'Shuttered Supply Inc.',
      country: 'US',
      status: 'closed',
      city: 'Reno',
    },
  ];
  for (const s of singleWarehouseSellers) {
    await seller({
      slug: s.slug,
      legalName: s.legalName,
      country: s.country,
      status: s.status,
      displayName: s.legalName,
    });
    await upsertWarehouse(prisma, ctx, {
      sellerSlug: s.slug,
      name: `${s.legalName} — ${s.city} DC`,
      isDefault: true,
      address: { line1: '1 Warehouse Row', city: s.city, postalCode: '00000', country: s.country },
    });
  }

  // ── draft seller, no warehouse yet (hasn't onboarded that far) ────────────
  await seller({
    slug: 'fx-seller-draft',
    legalName: 'Pending Onboarding Co.',
    country: 'CN',
    status: 'draft',
    displayName: 'Pending Onboarding Co.',
  });

  log.info({ sellers: ctx.seller.size, warehouses: ctx.warehouse.size }, 'seller fixtures seeded');
}
