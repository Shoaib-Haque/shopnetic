/**
 * Demo catalog — a believable, edge-case-free slice you can put in front of a
 * client. Deliberately tidy: short names, no archived / inactive rows, no
 * combinatorial blow-ups. The nasty cases live in `fixtures/`.
 */
import type { PrismaClient } from '../../../src/index.js';
import type { SeedCtx, SeedLog } from '../ctx.js';
import {
  putCategoryOption,
  upsertBrand,
  upsertCategory,
  upsertOptionType,
  upsertProduct,
  upsertValueSet,
} from '../factories.js';

export async function seedDemoCatalog(
  prisma: PrismaClient,
  ctx: SeedCtx,
  log: SeedLog,
): Promise<void> {
  const cat = (
    parent: string | null,
    slug: string,
    name: string,
    brandRequirement: 'required' | 'optional' | 'none' = 'optional',
  ): Promise<unknown> => upsertCategory(prisma, ctx, { parent, slug, name, brandRequirement });

  // ── category tree (3 levels, ~16 nodes) ───────────────────────────────────
  await cat(null, 'electronics', 'Electronics', 'required');
  await cat('electronics', 'phones', 'Phones', 'required');
  await cat('electronics', 'laptops', 'Laptops', 'required');
  await cat('electronics', 'audio', 'Audio', 'required');
  await cat('audio', 'headphones', 'Headphones', 'required');
  await cat('audio', 'speakers', 'Speakers', 'required');

  await cat(null, 'fashion', 'Fashion', 'optional');
  await cat('fashion', 'mens-clothing', "Men's Clothing", 'optional');
  await cat('mens-clothing', 't-shirts', 'T-Shirts', 'optional');
  await cat('mens-clothing', 'jeans', 'Jeans', 'optional');
  await cat('fashion', 'womens-clothing', "Women's Clothing", 'optional');
  await cat('womens-clothing', 'dresses', 'Dresses', 'optional');
  await cat('fashion', 'shoes', 'Shoes', 'optional');

  await cat(null, 'home-kitchen', 'Home & Kitchen', 'none');
  await cat('home-kitchen', 'cookware', 'Cookware', 'none');
  await cat('home-kitchen', 'small-appliances', 'Small Appliances', 'optional');

  await cat(null, 'sports-outdoors', 'Sports & Outdoors', 'optional');
  await cat('sports-outdoors', 'fitness', 'Fitness', 'optional');
  await cat('sports-outdoors', 'camping', 'Camping', 'optional');

  // ── brands ───────────────────────────────────────────────────────────────
  await upsertBrand(prisma, ctx, {
    slug: 'samsung',
    name: 'Samsung',
    aliases: ['samsung electronics'],
  });
  await upsertBrand(prisma, ctx, { slug: 'apple', name: 'Apple', aliases: ['apple inc'] });
  await upsertBrand(prisma, ctx, { slug: 'sony', name: 'Sony' });
  await upsertBrand(prisma, ctx, { slug: 'bose', name: 'Bose' });
  await upsertBrand(prisma, ctx, { slug: 'nike', name: 'Nike', aliases: ['nike inc'] });
  await upsertBrand(prisma, ctx, { slug: 'adidas', name: 'Adidas' });
  await upsertBrand(prisma, ctx, { slug: 'levis', name: "Levi's", aliases: ['levi strauss'] });
  await upsertBrand(prisma, ctx, { slug: 'kitchenaid', name: 'KitchenAid' });

  // ── option types + values ────────────────────────────────────────────────
  await upsertOptionType(prisma, ctx, {
    code: 'color',
    name: 'Color',
    dataType: 'swatch',
    hasSwatch: true,
    values: [
      { code: 'black', label: 'Black', swatchHex: '#000000' },
      { code: 'white', label: 'White', swatchHex: '#ffffff' },
      { code: 'blue', label: 'Blue', swatchHex: '#1e3a8a' },
      { code: 'red', label: 'Red', swatchHex: '#dc2626' },
      { code: 'green', label: 'Green', swatchHex: '#16a34a' },
    ],
  });
  await upsertOptionType(prisma, ctx, {
    code: 'size',
    name: 'Size',
    values: [
      { code: 'xs', label: 'XS' },
      { code: 's', label: 'S' },
      { code: 'm', label: 'M' },
      { code: 'l', label: 'L' },
      { code: 'xl', label: 'XL' },
      { code: 'xxl', label: 'XXL' },
    ],
  });
  await upsertOptionType(prisma, ctx, {
    code: 'storage',
    name: 'Storage',
    values: [
      { code: '128gb', label: '128 GB' },
      { code: '256gb', label: '256 GB' },
      { code: '512gb', label: '512 GB' },
      { code: '1tb', label: '1 TB' },
    ],
  });
  await upsertOptionType(prisma, ctx, {
    code: 'ram',
    name: 'RAM',
    values: [
      { code: '8gb', label: '8 GB' },
      { code: '16gb', label: '16 GB' },
      { code: '32gb', label: '32 GB' },
    ],
  });

  // ── value sets ───────────────────────────────────────────────────────────
  await upsertValueSet(prisma, ctx, {
    name: 'Apparel sizes',
    values: (['s', 'm', 'l', 'xl'] as const).map((valueCode) => ({ typeCode: 'size', valueCode })),
  });
  await upsertValueSet(prisma, ctx, {
    name: 'Phone storage',
    values: (['128gb', '256gb', '512gb'] as const).map((valueCode) => ({
      typeCode: 'storage',
      valueCode,
    })),
  });

  // ── category → option config ─────────────────────────────────────────────
  await putCategoryOption(prisma, ctx, {
    categorySlug: 't-shirts',
    optionTypeCode: 'color',
    applicability: 'optional',
    isVariantAxis: true,
    valueSource: 'open',
    position: 0,
  });
  await putCategoryOption(prisma, ctx, {
    categorySlug: 't-shirts',
    optionTypeCode: 'size',
    applicability: 'required',
    isVariantAxis: true,
    valueSource: 'predefined',
    valueSetName: 'Apparel sizes',
    position: 1,
  });
  await putCategoryOption(prisma, ctx, {
    categorySlug: 'phones',
    optionTypeCode: 'storage',
    applicability: 'required',
    isVariantAxis: true,
    valueSource: 'predefined',
    valueSetName: 'Phone storage',
    priceImpact: true,
    position: 0,
  });
  await putCategoryOption(prisma, ctx, {
    categorySlug: 'phones',
    optionTypeCode: 'color',
    applicability: 'optional',
    isVariantAxis: true,
    valueSource: 'open',
    position: 1,
  });
  await putCategoryOption(prisma, ctx, {
    categorySlug: 'phones',
    optionTypeCode: 'ram',
    applicability: 'optional',
    isVariantAxis: false,
    valueSource: 'open',
    position: 2,
  });

  // ── products ─────────────────────────────────────────────────────────────
  await upsertProduct(prisma, ctx, {
    slug: 'classic-cotton-tee',
    categorySlug: 't-shirts',
    brandSlug: 'nike',
    title: 'Classic Cotton Tee',
    status: 'active',
    basePriceMinor: 1999,
    currency: 'USD',
    options: [
      { typeCode: 'color', valueCodes: ['black', 'white', 'blue'] },
      { typeCode: 'size', valueCodes: ['s', 'm', 'l'] },
    ],
    variants: [
      {
        sku: 'TEE-BLK-S',
        select: [
          { typeCode: 'color', valueCode: 'black' },
          { typeCode: 'size', valueCode: 's' },
        ],
      },
      {
        sku: 'TEE-BLK-M',
        select: [
          { typeCode: 'color', valueCode: 'black' },
          { typeCode: 'size', valueCode: 'm' },
        ],
      },
      {
        sku: 'TEE-WHT-M',
        select: [
          { typeCode: 'color', valueCode: 'white' },
          { typeCode: 'size', valueCode: 'm' },
        ],
      },
      {
        sku: 'TEE-BLU-L',
        select: [
          { typeCode: 'color', valueCode: 'blue' },
          { typeCode: 'size', valueCode: 'l' },
        ],
      },
    ],
  });
  await upsertProduct(prisma, ctx, {
    slug: 'galaxy-s-flagship',
    categorySlug: 'phones',
    brandSlug: 'samsung',
    title: 'Galaxy S Flagship',
    status: 'active',
    basePriceMinor: 79999,
    currency: 'USD',
    options: [
      { typeCode: 'storage', valueCodes: ['128gb', '256gb'] },
      { typeCode: 'color', valueCodes: ['black', 'white'] },
    ],
    variants: [
      {
        sku: 'GS-128-BLK',
        select: [
          { typeCode: 'storage', valueCode: '128gb' },
          { typeCode: 'color', valueCode: 'black' },
        ],
      },
      {
        sku: 'GS-256-BLK',
        select: [
          { typeCode: 'storage', valueCode: '256gb' },
          { typeCode: 'color', valueCode: 'black' },
        ],
      },
      {
        sku: 'GS-256-WHT',
        select: [
          { typeCode: 'storage', valueCode: '256gb' },
          { typeCode: 'color', valueCode: 'white' },
        ],
      },
    ],
  });
  await upsertProduct(prisma, ctx, {
    slug: 'quiet-comfort-headphones',
    categorySlug: 'headphones',
    brandSlug: 'bose',
    title: 'QuietComfort Wireless Headphones',
    status: 'active',
    basePriceMinor: 34999,
    currency: 'USD',
    options: [{ typeCode: 'color', valueCodes: ['black', 'white'] }],
    variants: [
      { sku: 'QC-BLK', select: [{ typeCode: 'color', valueCode: 'black' }] },
      { sku: 'QC-WHT', select: [{ typeCode: 'color', valueCode: 'white' }] },
    ],
  });
  await upsertProduct(prisma, ctx, {
    slug: 'slim-fit-jeans',
    categorySlug: 'jeans',
    brandSlug: 'levis',
    title: 'Slim Fit Jeans',
    status: 'active',
    basePriceMinor: 5999,
    currency: 'USD',
  });

  log.info(
    { categories: ctx.category.size, brands: ctx.brand.size, products: ctx.product.size },
    'demo catalog seeded',
  );
}
