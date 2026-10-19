/**
 * Offer / stock / media fixtures for the fixture catalog (`fixtures/catalog/`)
 * — runs after both `fixtures/sellers.ts` and `fixtures/catalog/index.ts` so
 * their sellers/warehouses and products/variants already exist. Covers: a
 * variant with many competing offers across many sellers (Offers dialog
 * scroll), one offer with stock split across several warehouses (one seller,
 * multiple `Stock` rows), a seller with no warehouse at all placing an offer
 * anyway (no stock row — the empty-state case), every `OfferStatus` and
 * `OfferCondition`, and a scattering of plain single-offer variants — plus a
 * batch of hotlinked placeholder media (images + a couple of videos) on a
 * subset of products, since there's no upload pipeline yet to seed real
 * uploaded files against. Dev / CI only.
 */
import type { PrismaClient } from '../../../src/index.js';
import type { SeedCtx, SeedLog } from '../ctx.js';
import { recomputeBuyboxes, upsertMediaAsset, upsertOffer } from '../factories.js';
import { SEED_PHOTO, type SeedPhotoKey } from './seed-media.js';
import { DEFAULT_WAREHOUSE_NAME, MANY_WAREHOUSE_NAMES } from './sellers.js';

const COMPETING_SELLERS = [
  'shopnetic-retail',
  'apex-sellers',
  'fx-seller-gb',
  'fx-seller-de',
  'fx-seller-in',
  'fx-seller-jp',
  'fx-seller-ca',
  'fx-seller-au',
  'fx-seller-review',
  'fx-seller-suspended',
  'fx-seller-offboarding',
];

const WAREHOUSE_FOR: Record<string, string> = {
  'shopnetic-retail': 'Shopnetic Central FC (Austin)',
  'apex-sellers': 'Apex West Coast Hub (LA)',
  ...DEFAULT_WAREHOUSE_NAME,
};

const CONDITIONS = [
  'new',
  'refurbished_like_new',
  'refurbished_good',
  'used_like_new',
  'used_good',
  'used_fair',
] as const;

const STATUSES = ['active', 'active', 'active', 'paused', 'under_review', 'suppressed'] as const;

export async function seedFixtureInventory(
  prisma: PrismaClient,
  ctx: SeedCtx,
  log: SeedLog,
): Promise<void> {
  let offerCount = 0;
  const place = async (spec: {
    sellerSlug: string;
    sku: string;
    priceMinor: number;
    currency?: string | undefined;
    salePriceMinor?: number | undefined;
    condition?: (typeof CONDITIONS)[number] | undefined;
    status?: (typeof STATUSES)[number] | undefined;
    onHand?: number | undefined;
    warehouseName?: string | undefined;
  }): Promise<void> => {
    if (!ctx.variant.has(spec.sku)) return; // variant wasn't seeded (defensive)
    await upsertOffer(prisma, ctx, {
      sellerSlug: spec.sellerSlug,
      sku: spec.sku,
      priceMinor: spec.priceMinor,
      currency: spec.currency ?? 'USD',
      condition: spec.condition ?? 'new',
      status: spec.status ?? 'active',
      ...(spec.salePriceMinor != null ? { salePriceMinor: spec.salePriceMinor } : {}),
      ...(spec.warehouseName
        ? { warehouseName: spec.warehouseName, onHand: spec.onHand ?? 20 }
        : {}),
    });
    offerCount++;
  };

  // ── fx-combinatorial: FXC-BLA-S gets 8 competing offers (Offers dialog
  // scroll); a handful of siblings get 2-3; the rest stay offer-less. SKU
  // colour codes are `color.toUpperCase().slice(0, 3)` from products.ts —
  // "black" → BLA, "white" → WHI, "green" → GRE, not the 4-letter codes
  // you'd guess. ──────────────────────────────────────────────────────────
  for (const [i, sellerSlug] of COMPETING_SELLERS.slice(0, 8).entries()) {
    await place({
      sellerSlug,
      sku: 'FXC-BLA-S',
      priceMinor: 2199 + i * 150,
      salePriceMinor: i === 2 ? 1999 : undefined,
      condition: CONDITIONS[i % CONDITIONS.length]!,
      status: STATUSES[i % STATUSES.length]!,
      warehouseName: WAREHOUSE_FOR[sellerSlug],
      onHand: 10 + i * 5,
    });
  }
  for (const [sku, sellers] of [
    ['FXC-BLA-M', ['shopnetic-retail', 'apex-sellers', 'fx-seller-gb']],
    ['FXC-WHI-M', ['shopnetic-retail', 'fx-seller-de']],
    ['FXC-BLU-L', ['apex-sellers', 'fx-seller-in', 'fx-seller-jp']],
    ['FXC-RED-S', ['fx-seller-ca']],
    ['FXC-GRE-XL', ['fx-seller-au', 'fx-seller-review']],
  ] as const) {
    for (const [i, sellerSlug] of sellers.entries()) {
      await place({
        sellerSlug,
        sku,
        priceMinor: 2299 + i * 200,
        warehouseName: WAREHOUSE_FOR[sellerSlug],
        onHand: 15 + i * 10,
      });
    }
  }

  // ── fx-no-warehouse-seller: places an offer with no warehouse yet — no
  // Stock row at all (the "offer exists, nothing in stock anywhere" case) ──
  await place({ sellerSlug: 'fx-no-warehouse-seller', sku: 'FXC-BLA-S', priceMinor: 1899 });

  // ── fx-max-sku: one plain offer ───────────────────────────────────────────
  await place({
    sellerSlug: 'shopnetic-retail',
    sku: 'FX-MAXLEN-SKU-CODE-0001-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    priceMinor: 1999,
    warehouseName: WAREHOUSE_FOR['shopnetic-retail'],
    onHand: 50,
  });

  // ── fx-mega-variants: FXM-BLA-XS gets one offer with stock split across 3
  // of fx-many-warehouse-seller's 5 warehouses (one offer, several Stock
  // rows) plus a second seller; a few sibling variants get a single offer;
  // most of the 60 stay offer-less ─────────────────────────────────────────
  for (const [i, warehouseName] of MANY_WAREHOUSE_NAMES.slice(0, 3).entries()) {
    await place({
      sellerSlug: 'fx-many-warehouse-seller',
      sku: 'FXM-BLA-XS',
      priceMinor: 2999,
      warehouseName,
      onHand: 30 + i * 10,
    });
  }
  await place({
    sellerSlug: 'shopnetic-retail',
    sku: 'FXM-BLA-XS',
    priceMinor: 3199,
    warehouseName: WAREHOUSE_FOR['shopnetic-retail'],
    onHand: 25,
  });
  for (const [sku, sellerSlug] of [
    ['FXM-SIL-L', 'fx-seller-gb'],
    ['FXM-GOL-M', 'fx-seller-de'],
    ['FXM-NAV-XL', 'fx-seller-jp'],
    ['FXM-TEA-S', 'fx-seller-ca'],
    ['FXM-GRA-XXL', 'apex-sellers'],
  ] as const) {
    await place({
      sellerSlug,
      sku,
      priceMinor: 3099,
      warehouseName: WAREHOUSE_FOR[sellerSlug],
      onHand: 18,
    });
  }

  // ── fx-vol-N volume products: every 6th gets a scroll-stress variant (6
  // competing offers), every other 4th gets 1-2, the remainder stay
  // offer-less (realistic "not yet listed by any seller" spread) ───────────
  for (let i = 2; i <= 52; i += 2) {
    const heavy = i % 6 === 0;
    const moderate = !heavy && i % 4 === 0;
    if (!heavy && !moderate) continue;

    const sellerCount = heavy ? 6 : 2;
    for (let s = 0; s < sellerCount; s++) {
      const sellerSlug = COMPETING_SELLERS[(i + s) % COMPETING_SELLERS.length]!;
      await place({
        sellerSlug,
        sku: `FXV${i}-BLK`,
        priceMinor: 1000 + (((i + s) * 97) % 20_000),
        condition: CONDITIONS[(i + s) % CONDITIONS.length]!,
        status: STATUSES[(i + s) % STATUSES.length]!,
        warehouseName: WAREHOUSE_FOR[sellerSlug],
        onHand: s === 0 ? 0 : 10 + s * 5,
      });
    }
    await place({
      sellerSlug: COMPETING_SELLERS[i % COMPETING_SELLERS.length]!,
      sku: `FXV${i}-WHT`,
      priceMinor: 1200 + ((i * 83) % 20_000),
      warehouseName: WAREHOUSE_FOR[COMPETING_SELLERS[i % COMPETING_SELLERS.length]!],
      onHand: 12,
    });
  }

  // ── buybox recompute — must run after every offer above (and after
  // demo/inventory.ts's, which ran earlier in the pipeline; idempotent) ────
  await recomputeBuyboxes(prisma, ctx);

  // ── media: real product photos served locally from
  // apps/admin/public/seed-media/ (see fixtures/seed-media.ts for sourcing +
  // how to swap these for S3/MinIO object keys once that pipeline exists) on
  // a spread of fixture products, plus two videos ──────────────────────────
  const ALL_PHOTO_KEYS = Object.keys(SEED_PHOTO) as SeedPhotoKey[];

  // primary (thematically-matched) photo per product; multi-shot products
  // fill the rest of their gallery from the general pool for visual variety.
  const PRODUCT_PHOTO: Record<string, SeedPhotoKey> = {
    'fx-combinatorial': 'tshirt',
    'fx-mega-variants': 'tshirt',
    'fx-mega-options': 'laptop',
    'fx-long-title': 'backpack',
    'fx-emoji-title': 'headphones',
    'fx-no-variants': 'gadget',
    'fx-no-price': 'gadget',
    'fx-max-sku': 'laptop',
    'fx-pending-brand-product': 'gadget',
    'fx-archived-brand-product': 'gadget',
  };
  for (const [slug, primaryKey] of Object.entries(PRODUCT_PHOTO)) {
    const shots = slug === 'fx-mega-variants' || slug === 'fx-combinatorial' ? 5 : 2;
    for (let n = 1; n <= shots; n++) {
      const key =
        n === 1
          ? primaryKey
          : ALL_PHOTO_KEYS[(ALL_PHOTO_KEYS.indexOf(primaryKey) + n) % ALL_PHOTO_KEYS.length]!;
      await upsertMediaAsset(prisma, ctx, {
        productSlug: slug,
        kind: 'image',
        fileKey: SEED_PHOTO[key],
        alt: `${slug} photo ${n}`,
        position: n - 1,
      });
    }
  }
  for (let i = 1; i <= 10; i++) {
    const key = ALL_PHOTO_KEYS[i % ALL_PHOTO_KEYS.length]!;
    await upsertMediaAsset(prisma, ctx, {
      productSlug: `fx-vol-${i * 2}`,
      kind: 'image',
      fileKey: SEED_PHOTO[key],
      alt: `FX Volume Product ${i * 2} photo`,
    });
  }

  // a couple of video-kind assets — MDN's CC0 sample clip, a legitimately
  // open, stable, hotlinkable source (videos aren't part of this local-photo
  // batch; still hotlinked for the same reason — no upload pipeline yet).
  await upsertMediaAsset(prisma, ctx, {
    productSlug: 'fx-mega-variants',
    kind: 'video',
    fileKey: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    posterKey: SEED_PHOTO.tshirt,
    durationS: 10,
    alt: 'Product video',
    position: 10,
  });
  await upsertMediaAsset(prisma, ctx, {
    productSlug: 'fx-combinatorial',
    kind: 'video',
    fileKey: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    posterKey: SEED_PHOTO.tshirt,
    durationS: 10,
    alt: 'Product video',
    position: 10,
  });

  log.info({ offers: offerCount }, 'inventory fixtures seeded');
}
