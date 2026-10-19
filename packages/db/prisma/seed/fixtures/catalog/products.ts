/**
 * Product fixtures — every status × both origins, a variant-less product, a
 * long title, a unicode/emoji title, a null-price product, a max-length SKU,
 * brand-status edge cases (pending / archived brand), an option-heavy
 * product (10 assigned option types, for the Options dialog's scroll), a
 * 60-variant combinatorial product (for the Variants dialog's scroll), and a
 * wide volume batch (~70+ products total across demo + fixtures) rotating
 * category / brand / status / origin so every filter combination the admin
 * Product list exposes has at least one matching row. Dev / CI only.
 */
import type { PrismaClient } from '../../../../src/index.js';
import type { SeedCtx } from '../../ctx.js';
import { upsertProduct } from '../../factories.js';

const COMBO_COLORS = ['black', 'white', 'blue', 'red', 'green'] as const;
const COMBO_SIZES = ['s', 'm', 'l', 'xl'] as const;

/** 10 colours (from options.ts's expanded 38-value `color` set) × the 6 seeded
 * `size` values = 60 variants — enough to force real scroll/virtualization
 * in the Variants dialog. */
const MEGA_COLORS = [
  'black',
  'white',
  'blue',
  'red',
  'green',
  'gray',
  'silver',
  'gold',
  'navy',
  'teal',
] as const;
const MEGA_SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl'] as const;

/** 10 `select`-typed attributes from options.ts's `MANY_ATTRIBUTES` batch,
 * each with 2-3 of its seeded values — assigned to one product (not as
 * variant axes) so the Options & Attributes dialog has enough rows to
 * scroll. */
const MANY_OPTION_TYPES: { typeCode: string; valueCodes: string[] }[] = [
  { typeCode: 'fx-screen-size', valueCodes: ['13-inch', '15-inch', '17-inch'] },
  { typeCode: 'fx-processor', valueCodes: ['i5', 'i7', 'i9'] },
  { typeCode: 'fx-operating-system', valueCodes: ['windows', 'macos', 'linux'] },
  { typeCode: 'fx-connector-type', valueCodes: ['usb-c', 'usb-a', 'hdmi'] },
  { typeCode: 'fx-bluetooth-version', valueCodes: ['5-0', '5-2', '5-3'] },
  { typeCode: 'fx-wifi-standard', valueCodes: ['802-11ac', 'wi-fi-6', 'wi-fi-6e'] },
  { typeCode: 'fx-camera-resolution', valueCodes: ['12mp', '48mp', '108mp'] },
  { typeCode: 'fx-refresh-rate', valueCodes: ['60hz', '120hz', '144hz'] },
  { typeCode: 'fx-screen-resolution', valueCodes: ['full-hd', '2k', '4k'] },
  { typeCode: 'fx-water-resistance-rating', valueCodes: ['ipx4', 'ipx7', 'ip68'] },
];

const VOLUME_CATEGORIES = [
  'phones',
  'laptops',
  'headphones',
  'speakers',
  't-shirts',
  'jeans',
  'dresses',
  'shoes',
  'cookware',
  'small-appliances',
  'fitness',
  'camping',
  'fx-rtx-series',
  'fx-long-90',
  'fx-long-200',
  'fx-jp',
  'fx-ru',
  'fx-ar',
  'fx-emoji',
  'fx-live-item-1',
  'fx-live-item-2',
  'fx-live-item-3',
  'fx-acc-1',
  'fx-acc-2',
  'fx-acc-3',
];

const VOLUME_BRANDS = [
  'samsung',
  'apple',
  'sony',
  'bose',
  'nike',
  'adidas',
  'levis',
  'kitchenaid',
  'fx-long-brand',
  'fx-many-aliases',
  'fx-no-aliases',
  'fx-display-name',
  'fx-huge-aliases',
];

const VOLUME_STATUSES = ['draft', 'pending', 'active', 'active', 'archived'] as const;
const VOLUME_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'INR'] as const;

/** 3P sellers from fixtures/sellers.ts, rotated for origin-filter coverage. */
const VOLUME_3P_SELLERS = [
  'apex-sellers',
  'fx-seller-gb',
  'fx-seller-de',
  'fx-seller-in',
  'fx-seller-jp',
  'fx-seller-ca',
  'fx-seller-au',
  'fx-no-warehouse-seller',
  'fx-many-warehouse-seller',
  'fx-seller-review',
  'fx-seller-suspended',
  'fx-seller-offboarding',
];

export async function seedFixtureProducts(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  // ── every status, both origins ─────────────────────────────────────────────
  const statuses = ['draft', 'pending', 'active', 'archived'] as const;
  for (const [i, status] of statuses.entries()) {
    await upsertProduct(prisma, ctx, {
      slug: `fx-status-${status}`,
      categorySlug: 'fx-rtx-series',
      brandSlug: 'fx-no-aliases',
      title: `Status Sample — ${status}`,
      status,
      basePriceMinor: 4999,
      currency: 'USD',
    });
    await upsertProduct(prisma, ctx, {
      slug: `fx-status-${status}-3p`,
      categorySlug: 'fx-rtx-series',
      brandSlug: 'fx-no-aliases',
      title: `3P Status Sample — ${status}`,
      status,
      basePriceMinor: 5499,
      currency: 'USD',
      proposedBySellerSlug: VOLUME_3P_SELLERS[i % VOLUME_3P_SELLERS.length]!,
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
    slug: 'fx-no-price',
    categorySlug: 'fx-long-90',
    brandSlug: 'fx-no-aliases',
    title: 'Product with no base price set yet',
    status: 'draft',
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
    slug: 'fx-emoji-title',
    categorySlug: 'headphones',
    brandSlug: 'sony',
    title: '🎧🔥 Ultra Bass Headphones — Édition Spéciale ñ日本語 テスト',
    status: 'active',
    basePriceMinor: 8999,
    currency: 'USD',
  });

  await upsertProduct(prisma, ctx, {
    slug: 'fx-pending-brand-product',
    categorySlug: 'fx-long-90',
    brandSlug: 'fx-pending',
    title: 'Product listed under a brand awaiting review',
    status: 'pending',
    basePriceMinor: 3499,
    currency: 'USD',
  });

  await upsertProduct(prisma, ctx, {
    slug: 'fx-archived-brand-product',
    categorySlug: 'fx-long-90',
    brandSlug: 'fx-archived-brand',
    title: 'Product left under a since-archived brand',
    status: 'active',
    basePriceMinor: 2999,
    currency: 'USD',
  });

  await upsertProduct(prisma, ctx, {
    slug: 'fx-max-sku',
    categorySlug: 'fx-rtx-series',
    brandSlug: 'fx-no-aliases',
    title: 'Product with a maximum-length (64 char) SKU',
    status: 'active',
    basePriceMinor: 1999,
    currency: 'USD',
    options: [{ typeCode: 'color', valueCodes: ['black'] }],
    variants: [
      {
        sku: 'FX-MAXLEN-SKU-CODE-0001-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        select: [{ typeCode: 'color', valueCode: 'black' }],
      },
    ],
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
      { typeCode: 'color', valueCodes: [...COMBO_COLORS] },
      { typeCode: 'size', valueCodes: [...COMBO_SIZES] },
    ],
    variants: COMBO_COLORS.flatMap((color) =>
      COMBO_SIZES.map((size) => ({
        sku: `FXC-${color.toUpperCase().slice(0, 3)}-${size.toUpperCase()}`,
        select: [
          { typeCode: 'color', valueCode: color },
          { typeCode: 'size', valueCode: size },
        ],
      })),
    ),
  });

  // ── 60-variant mega-combinatorial — Variants dialog scroll ────────────────
  await upsertProduct(prisma, ctx, {
    slug: 'fx-mega-variants',
    categorySlug: 'fx-rtx-series',
    brandSlug: 'fx-huge-aliases',
    title: 'Mega Combinatorial Tee (60 variants)',
    status: 'active',
    basePriceMinor: 2999,
    currency: 'USD',
    options: [
      { typeCode: 'color', valueCodes: [...MEGA_COLORS] },
      { typeCode: 'size', valueCodes: [...MEGA_SIZES] },
    ],
    variants: MEGA_COLORS.flatMap((color) =>
      MEGA_SIZES.map((size) => ({
        sku: `FXM-${color.toUpperCase().slice(0, 3)}-${size.toUpperCase()}`,
        select: [
          { typeCode: 'color', valueCode: color },
          { typeCode: 'size', valueCode: size },
        ],
      })),
    ),
  });

  // ── 10 assigned option types — Options & Attributes dialog scroll ────────
  await upsertProduct(prisma, ctx, {
    slug: 'fx-mega-options',
    categorySlug: 'laptops',
    brandSlug: 'fx-display-name',
    title: 'Mega Attributes Laptop (10 option types)',
    status: 'active',
    basePriceMinor: 149999,
    currency: 'USD',
    options: MANY_OPTION_TYPES,
  });

  // ── volume: wide batch rotating category / brand / status / origin so
  // every filter option the Product list exposes has at least one match
  // (~70+ products total across demo + fixtures) ────────────────────────────
  for (let i = 1; i <= 52; i++) {
    const categorySlug = VOLUME_CATEGORIES[i % VOLUME_CATEGORIES.length]!;
    const brandSlug = VOLUME_BRANDS[i % VOLUME_BRANDS.length]!;
    const status = VOLUME_STATUSES[i % VOLUME_STATUSES.length]!;
    const is3p = i % 3 === 0;
    const proposedBySellerSlug = is3p ? VOLUME_3P_SELLERS[i % VOLUME_3P_SELLERS.length] : undefined;
    const hasVariants = i % 2 === 0;

    await upsertProduct(prisma, ctx, {
      slug: `fx-vol-${i}`,
      categorySlug,
      brandSlug,
      title: `FX Volume Product ${i}`,
      status,
      basePriceMinor: 500 + ((i * 137) % 50_000),
      currency: VOLUME_CURRENCIES[i % VOLUME_CURRENCIES.length]!,
      ...(proposedBySellerSlug ? { proposedBySellerSlug } : {}),
      ...(hasVariants
        ? {
            options: [{ typeCode: 'color', valueCodes: ['black', 'white', 'blue'] }],
            variants: [
              { sku: `FXV${i}-BLK`, select: [{ typeCode: 'color', valueCode: 'black' }] },
              { sku: `FXV${i}-WHT`, select: [{ typeCode: 'color', valueCode: 'white' }] },
            ],
          }
        : {}),
    });
  }
}
