/**
 * Demo catalog data (plan/26) — a small but complete slice: a category tree,
 * brands, option types + values, value sets, per-category option config, and a
 * couple of products with options, offered values and variants.
 *
 * Idempotent: everything is keyed by slug / code / natural key and re-run safely.
 * Gated by `SEED_DEMO` in `seed.ts` — never runs in production unless asked.
 */
import type { PrismaClient } from '../src/index.js';

type SeedLog = { info: (obj: Record<string, unknown>, msg: string) => void };

const label = (id: string): string => id.replace(/-/g, '');
const en = (text: string): { en: string } => ({ en: text });

interface Cat {
  id: string;
  path: string;
}

export async function seedCatalogDemo(prisma: PrismaClient, log: SeedLog): Promise<void> {
  // ── categories (ltree tree) ──────────────────────────────────────────────
  const upsertCategory = async (
    parent: Cat | null,
    slug: string,
    name: string,
    brandRequirement: 'required' | 'optional' | 'none',
  ): Promise<Cat> => {
    const existing = await prisma.category.findFirst({
      where: { parentId: parent?.id ?? null, slug },
      select: { id: true },
    });
    const row = existing
      ? await prisma.category.update({
          where: { id: existing.id },
          data: { nameI18n: en(name), brandRequirement },
        })
      : await prisma.category.create({
          data: { parentId: parent?.id ?? null, slug, nameI18n: en(name), brandRequirement },
        });
    const path = parent ? `${parent.path}.${label(row.id)}` : label(row.id);
    await prisma.$executeRawUnsafe(
      `UPDATE catalog.category SET path = $1::ltree WHERE id = $2::uuid`,
      path,
      row.id,
    );
    return { id: row.id, path };
  };

  const electronics = await upsertCategory(null, 'electronics', 'Electronics', 'required');
  const phones = await upsertCategory(electronics, 'phones', 'Phones', 'required');
  await upsertCategory(electronics, 'laptops', 'Laptops', 'required');
  const fashion = await upsertCategory(null, 'fashion', 'Fashion', 'optional');
  const mensClothing = await upsertCategory(fashion, 'mens-clothing', "Men's Clothing", 'optional');
  const tShirts = await upsertCategory(mensClothing, 't-shirts', 'T-Shirts', 'optional');
  await upsertCategory(null, 'home-kitchen', 'Home & Kitchen', 'none');

  // ── brands ──────────────────────────────────────────────────────────────
  const upsertBrand = async (slug: string, name: string, aliases: string[]): Promise<string> => {
    const brand = await prisma.brand.upsert({
      where: { slug },
      update: { name, status: 'active' },
      create: { name, slug, status: 'active' },
    });
    for (const alias of aliases) {
      await prisma.brandAlias.upsert({
        where: { alias },
        update: {},
        create: { brandId: brand.id, alias },
      });
    }
    return brand.id;
  };

  const samsung = await upsertBrand('samsung', 'Samsung', ['samsung electronics']);
  await upsertBrand('apple', 'Apple', ['apple inc']);
  const nike = await upsertBrand('nike', 'Nike', ['nike inc']);
  await upsertBrand('sony', 'Sony', []);

  // ── option types + values ───────────────────────────────────────────────
  const upsertOptionType = async (
    code: string,
    name: string,
    dataType: 'select' | 'text' | 'number' | 'bool' | 'swatch',
    hasSwatch: boolean,
    values: { code: string; label: string; swatchHex?: string }[],
  ): Promise<{ id: string; valueIds: Record<string, string> }> => {
    const ot = await prisma.optionType.upsert({
      where: { code },
      update: { nameI18n: en(name), dataType, hasSwatch },
      create: { code, nameI18n: en(name), dataType, hasSwatch },
    });
    const valueIds: Record<string, string> = {};
    for (const [i, v] of values.entries()) {
      const ov = await prisma.optionValue.upsert({
        where: { optionTypeId_code: { optionTypeId: ot.id, code: v.code } },
        update: { labelI18n: en(v.label), position: i, swatchHex: v.swatchHex ?? null },
        create: {
          optionTypeId: ot.id,
          code: v.code,
          labelI18n: en(v.label),
          position: i,
          swatchHex: v.swatchHex ?? null,
        },
      });
      valueIds[v.code] = ov.id;
    }
    return { id: ot.id, valueIds };
  };

  const color = await upsertOptionType('color', 'Color', 'swatch', true, [
    { code: 'black', label: 'Black', swatchHex: '#000000' },
    { code: 'white', label: 'White', swatchHex: '#ffffff' },
    { code: 'blue', label: 'Blue', swatchHex: '#1e3a8a' },
    { code: 'red', label: 'Red', swatchHex: '#dc2626' },
  ]);
  const size = await upsertOptionType('size', 'Size', 'select', false, [
    { code: 'xs', label: 'XS' },
    { code: 's', label: 'S' },
    { code: 'm', label: 'M' },
    { code: 'l', label: 'L' },
    { code: 'xl', label: 'XL' },
    { code: 'xxl', label: 'XXL' },
  ]);
  const storage = await upsertOptionType('storage', 'Storage', 'select', false, [
    { code: '128gb', label: '128 GB' },
    { code: '256gb', label: '256 GB' },
    { code: '512gb', label: '512 GB' },
    { code: '1tb', label: '1 TB' },
  ]);
  const ram = await upsertOptionType('ram', 'RAM', 'select', false, [
    { code: '8gb', label: '8 GB' },
    { code: '16gb', label: '16 GB' },
    { code: '32gb', label: '32 GB' },
  ]);

  // ── value sets ──────────────────────────────────────────────────────────
  const upsertValueSet = async (name: string, optionValueIds: string[]): Promise<string> => {
    const vs = await prisma.valueSet.upsert({ where: { name }, update: {}, create: { name } });
    await prisma.valueSetItem.deleteMany({ where: { valueSetId: vs.id } });
    await prisma.valueSetItem.createMany({
      data: optionValueIds.map((optionValueId, position) => ({
        valueSetId: vs.id,
        optionValueId,
        position,
      })),
    });
    return vs.id;
  };

  const apparelSizesId = await upsertValueSet('Apparel sizes', [
    size.valueIds['s']!,
    size.valueIds['m']!,
    size.valueIds['l']!,
    size.valueIds['xl']!,
  ]);
  const phoneStorageId = await upsertValueSet('Phone storage', [
    storage.valueIds['128gb']!,
    storage.valueIds['256gb']!,
    storage.valueIds['512gb']!,
  ]);

  // ── category → option config ────────────────────────────────────────────
  const putCategoryOption = async (
    categoryId: string,
    optionTypeId: string,
    cfg: {
      applicability: 'required' | 'optional' | 'not_applicable';
      isVariantAxis: boolean;
      valueSource: 'predefined' | 'open' | 'hybrid';
      valueSetId?: string;
      priceImpact?: boolean;
      position: number;
    },
  ): Promise<void> => {
    const data = {
      applicability: cfg.applicability,
      isVariantAxis: cfg.isVariantAxis,
      valueSource: cfg.valueSource,
      valueSetId: cfg.valueSetId ?? null,
      priceImpact: cfg.priceImpact ?? false,
      position: cfg.position,
    };
    await prisma.categoryOption.upsert({
      where: { categoryId_optionTypeId: { categoryId, optionTypeId } },
      update: data,
      create: { categoryId, optionTypeId, ...data },
    });
  };

  await putCategoryOption(tShirts.id, color.id, {
    applicability: 'optional',
    isVariantAxis: true,
    valueSource: 'open',
    position: 0,
  });
  await putCategoryOption(tShirts.id, size.id, {
    applicability: 'required',
    isVariantAxis: true,
    valueSource: 'predefined',
    valueSetId: apparelSizesId,
    position: 1,
  });
  await putCategoryOption(phones.id, storage.id, {
    applicability: 'required',
    isVariantAxis: true,
    valueSource: 'predefined',
    valueSetId: phoneStorageId,
    priceImpact: true,
    position: 0,
  });
  await putCategoryOption(phones.id, color.id, {
    applicability: 'optional',
    isVariantAxis: true,
    valueSource: 'open',
    position: 1,
  });
  await putCategoryOption(phones.id, ram.id, {
    applicability: 'optional',
    isVariantAxis: false,
    valueSource: 'open',
    position: 2,
  });

  // ── products, options, offered values, variants ─────────────────────────
  const upsertProduct = async (spec: {
    slug: string;
    categoryId: string;
    brandId: string;
    title: string;
    status: 'draft' | 'pending' | 'active' | 'archived';
    basePriceMinor?: number;
    currency?: string;
    options: { optionTypeId: string; valueIds: string[] }[];
    variants: { selections: { optionTypeId: string; optionValueId: string }[]; sku: string }[];
  }): Promise<string> => {
    const p = await prisma.product.upsert({
      where: { slug: spec.slug },
      update: {
        categoryId: spec.categoryId,
        brandId: spec.brandId,
        titleI18n: en(spec.title),
        status: spec.status,
        basePriceMinor: spec.basePriceMinor != null ? BigInt(spec.basePriceMinor) : null,
        currency: spec.currency ?? null,
      },
      create: {
        slug: spec.slug,
        categoryId: spec.categoryId,
        brandId: spec.brandId,
        titleI18n: en(spec.title),
        status: spec.status,
        ...(spec.basePriceMinor != null ? { basePriceMinor: BigInt(spec.basePriceMinor) } : {}),
        ...(spec.currency ? { currency: spec.currency } : {}),
      },
    });

    for (const [i, opt] of spec.options.entries()) {
      await prisma.productOption.upsert({
        where: { productId_optionTypeId: { productId: p.id, optionTypeId: opt.optionTypeId } },
        update: { position: i },
        create: { productId: p.id, optionTypeId: opt.optionTypeId, position: i },
      });
      await prisma.productOptionValue.deleteMany({
        where: { productId: p.id, optionTypeId: opt.optionTypeId },
      });
      await prisma.productOptionValue.createMany({
        data: opt.valueIds.map((optionValueId, position) => ({
          productId: p.id,
          optionTypeId: opt.optionTypeId,
          optionValueId,
          position,
        })),
      });
    }

    for (const [i, v] of spec.variants.entries()) {
      const signature = [...v.selections]
        .sort((a, b) => a.optionTypeId.localeCompare(b.optionTypeId))
        .map((s) => `${s.optionTypeId}:${s.optionValueId}`)
        .join('|');
      const variant = await prisma.variant.upsert({
        where: { productId_comboSignature: { productId: p.id, comboSignature: signature } },
        update: { skuCode: v.sku, position: i },
        create: { productId: p.id, comboSignature: signature, skuCode: v.sku, position: i },
      });
      await prisma.variantOptionValue.deleteMany({ where: { variantId: variant.id } });
      await prisma.variantOptionValue.createMany({
        data: v.selections.map((s) => ({
          variantId: variant.id,
          optionTypeId: s.optionTypeId,
          optionValueId: s.optionValueId,
        })),
      });
    }
    return p.id;
  };

  await upsertProduct({
    slug: 'classic-cotton-tee',
    categoryId: tShirts.id,
    brandId: nike,
    title: 'Classic Cotton Tee',
    status: 'active',
    basePriceMinor: 1999,
    currency: 'USD',
    options: [
      {
        optionTypeId: color.id,
        valueIds: [color.valueIds['black']!, color.valueIds['white']!, color.valueIds['blue']!],
      },
      {
        optionTypeId: size.id,
        valueIds: [size.valueIds['s']!, size.valueIds['m']!, size.valueIds['l']!],
      },
    ],
    variants: [
      {
        sku: 'TEE-BLK-S',
        selections: [
          { optionTypeId: color.id, optionValueId: color.valueIds['black']! },
          { optionTypeId: size.id, optionValueId: size.valueIds['s']! },
        ],
      },
      {
        sku: 'TEE-BLK-M',
        selections: [
          { optionTypeId: color.id, optionValueId: color.valueIds['black']! },
          { optionTypeId: size.id, optionValueId: size.valueIds['m']! },
        ],
      },
      {
        sku: 'TEE-WHT-M',
        selections: [
          { optionTypeId: color.id, optionValueId: color.valueIds['white']! },
          { optionTypeId: size.id, optionValueId: size.valueIds['m']! },
        ],
      },
      {
        sku: 'TEE-BLU-L',
        selections: [
          { optionTypeId: color.id, optionValueId: color.valueIds['blue']! },
          { optionTypeId: size.id, optionValueId: size.valueIds['l']! },
        ],
      },
    ],
  });

  await upsertProduct({
    slug: 'galaxy-s-flagship',
    categoryId: phones.id,
    brandId: samsung,
    title: 'Galaxy S Flagship',
    status: 'active',
    basePriceMinor: 79999,
    currency: 'USD',
    options: [
      {
        optionTypeId: storage.id,
        valueIds: [storage.valueIds['128gb']!, storage.valueIds['256gb']!],
      },
      { optionTypeId: color.id, valueIds: [color.valueIds['black']!, color.valueIds['white']!] },
    ],
    variants: [
      {
        sku: 'GS-128-BLK',
        selections: [
          { optionTypeId: storage.id, optionValueId: storage.valueIds['128gb']! },
          { optionTypeId: color.id, optionValueId: color.valueIds['black']! },
        ],
      },
      {
        sku: 'GS-256-BLK',
        selections: [
          { optionTypeId: storage.id, optionValueId: storage.valueIds['256gb']! },
          { optionTypeId: color.id, optionValueId: color.valueIds['black']! },
        ],
      },
      {
        sku: 'GS-256-WHT',
        selections: [
          { optionTypeId: storage.id, optionValueId: storage.valueIds['256gb']! },
          { optionTypeId: color.id, optionValueId: color.valueIds['white']! },
        ],
      },
    ],
  });

  log.info(
    { categories: 7, brands: 4, optionTypes: 4, valueSets: 2, products: 2 },
    'catalog demo data seeded',
  );
}
