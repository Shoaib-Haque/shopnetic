/**
 * Idempotent builders shared by every seed profile. Each one upserts by natural
 * key (slug / code / email), writes the derived bits (ltree path, grants) and
 * records the result in the {@link SeedCtx} so later seeders can reference it.
 */
import { ARGON2_PARAMS, hashPassword, Role } from '@shopnetic/auth';
import type { PrismaClient } from '../../src/index.js';
import type { SeedCtx } from './ctx.js';

/** ltree label = the uuid with dashes stripped (32 hex chars — a valid label). */
const label = (id: string): string => id.replace(/-/g, '');
const en = (text: string): { en: string } => ({ en: text });

// ── identity ────────────────────────────────────────────────────────────────

export async function upsertAccount(
  prisma: PrismaClient,
  ctx: SeedCtx,
  spec: {
    email: string;
    plane: 'staff' | 'marketplace';
    password?: string;
    status?: 'active' | 'locked' | 'disabled';
    emailVerified?: boolean;
    /** Global-scope role grants. Scoped grants land when seller/category scopes exist. */
    roles?: Role[];
  },
): Promise<string> {
  const account = await prisma.account.upsert({
    where: { email: spec.email },
    update: { status: spec.status ?? 'active' },
    create: {
      email: spec.email,
      plane: spec.plane,
      status: spec.status ?? 'active',
      emailVerifiedAt: spec.emailVerified === false ? null : new Date(),
      ...(spec.password
        ? {
            credential: {
              create: {
                passwordHash: await hashPassword(spec.password),
                hashAlgo: 'argon2id',
                params: ARGON2_PARAMS,
              },
            },
          }
        : {}),
    },
  });

  for (const roleKey of spec.roles ?? []) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const existing = await prisma.grant.findFirst({
      where: { accountId: account.id, roleId: role.id, scopeType: 'global', scopeId: null },
    });
    if (!existing) {
      await prisma.grant.create({
        data: { accountId: account.id, roleId: role.id, scopeType: 'global', scopeId: null },
      });
    }
  }

  ctx.account.set(spec.email, account.id);
  return account.id;
}

// ── catalog: categories ─────────────────────────────────────────────────────

export async function upsertCategory(
  prisma: PrismaClient,
  ctx: SeedCtx,
  spec: {
    parent: string | null;
    slug: string;
    name: string;
    brandRequirement?: 'required' | 'optional' | 'none';
    isActive?: boolean;
    archived?: boolean;
    position?: number;
  },
): Promise<{ id: string; path: string }> {
  const parent = spec.parent ? ctx.category.get(spec.parent) : null;
  if (spec.parent && !parent) {
    throw new Error(`seed: parent category "${spec.parent}" must be seeded before "${spec.slug}"`);
  }

  const data = {
    parentId: parent?.id ?? null,
    slug: spec.slug,
    nameI18n: en(spec.name),
    brandRequirement: spec.brandRequirement ?? 'optional',
    isActive: spec.isActive ?? true,
    position: spec.position ?? 0,
    deletedAt: spec.archived ? new Date() : null,
  };
  const existing = await prisma.category.findFirst({
    where: { slug: spec.slug },
    select: { id: true },
  });
  const row = existing
    ? await prisma.category.update({ where: { id: existing.id }, data })
    : await prisma.category.create({ data });

  const path = parent ? `${parent.path}.${label(row.id)}` : label(row.id);
  await prisma.$executeRawUnsafe(
    `UPDATE catalog.category SET path = $1::ltree WHERE id = $2::uuid`,
    path,
    row.id,
  );

  const rec = { id: row.id, path };
  ctx.category.set(spec.slug, rec);
  return rec;
}

// ── catalog: brands ─────────────────────────────────────────────────────────

export async function upsertBrand(
  prisma: PrismaClient,
  ctx: SeedCtx,
  spec: {
    slug: string;
    name: string;
    aliases?: string[];
    status?: 'pending' | 'active' | 'rejected';
    displayName?: string;
    archived?: boolean;
  },
): Promise<string> {
  const data = {
    name: spec.name,
    status: spec.status ?? 'active',
    deletedAt: spec.archived ? new Date() : null,
    ...(spec.displayName ? { displayNameI18n: en(spec.displayName) } : {}),
  };
  const brand = await prisma.brand.upsert({
    where: { slug: spec.slug },
    update: data,
    create: { slug: spec.slug, ...data },
  });
  for (const alias of spec.aliases ?? []) {
    await prisma.brandAlias.upsert({
      where: { alias },
      update: {},
      create: { brandId: brand.id, alias },
    });
  }
  ctx.brand.set(spec.slug, brand.id);
  return brand.id;
}

// ── catalog: option types + values ──────────────────────────────────────────

export async function upsertOptionType(
  prisma: PrismaClient,
  ctx: SeedCtx,
  spec: {
    code: string;
    name: string;
    dataType?: 'select' | 'text' | 'number' | 'bool' | 'swatch';
    hasSwatch?: boolean;
    status?: 'active' | 'deprecated';
    values?: { code: string; label: string; swatchHex?: string }[];
  },
): Promise<{ id: string; valueIds: Record<string, string> }> {
  const ot = await prisma.optionType.upsert({
    where: { code: spec.code },
    update: {
      nameI18n: en(spec.name),
      dataType: spec.dataType ?? 'select',
      hasSwatch: spec.hasSwatch ?? false,
      status: spec.status ?? 'active',
    },
    create: {
      code: spec.code,
      nameI18n: en(spec.name),
      dataType: spec.dataType ?? 'select',
      hasSwatch: spec.hasSwatch ?? false,
      status: spec.status ?? 'active',
    },
  });
  const valueIds: Record<string, string> = {};
  for (const [i, v] of (spec.values ?? []).entries()) {
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
  const rec = { id: ot.id, valueIds };
  ctx.optionType.set(spec.code, rec);
  return rec;
}

// ── catalog: value sets ─────────────────────────────────────────────────────

export async function upsertValueSet(
  prisma: PrismaClient,
  ctx: SeedCtx,
  spec: { name: string; values: { typeCode: string; valueCode: string }[] },
): Promise<string> {
  const vs = await prisma.valueSet.upsert({
    where: { name: spec.name },
    update: {},
    create: { name: spec.name },
  });
  await prisma.valueSetItem.deleteMany({ where: { valueSetId: vs.id } });
  const ids = spec.values.map((ref) => {
    const ot = ctx.optionType.get(ref.typeCode);
    const id = ot?.valueIds[ref.valueCode];
    if (!id) {
      throw new Error(`seed: value "${ref.typeCode}/${ref.valueCode}" not seeded for value set`);
    }
    return id;
  });
  await prisma.valueSetItem.createMany({
    data: ids.map((optionValueId, position) => ({ valueSetId: vs.id, optionValueId, position })),
  });
  ctx.valueSet.set(spec.name, vs.id);
  return vs.id;
}

// ── catalog: category → option config ───────────────────────────────────────

export async function putCategoryOption(
  prisma: PrismaClient,
  ctx: SeedCtx,
  spec: {
    categorySlug: string;
    optionTypeCode: string;
    applicability: 'required' | 'optional' | 'not_applicable';
    isVariantAxis: boolean;
    valueSource: 'predefined' | 'open' | 'hybrid';
    valueSetName?: string;
    priceImpact?: boolean;
    position: number;
  },
): Promise<void> {
  const category = ctx.category.get(spec.categorySlug);
  const optionType = ctx.optionType.get(spec.optionTypeCode);
  if (!category || !optionType) {
    throw new Error(
      `seed: category option needs "${spec.categorySlug}" + "${spec.optionTypeCode}"`,
    );
  }
  const data = {
    applicability: spec.applicability,
    isVariantAxis: spec.isVariantAxis,
    valueSource: spec.valueSource,
    valueSetId: spec.valueSetName ? (ctx.valueSet.get(spec.valueSetName) ?? null) : null,
    priceImpact: spec.priceImpact ?? false,
    position: spec.position,
  };
  await prisma.categoryOption.upsert({
    where: { categoryId_optionTypeId: { categoryId: category.id, optionTypeId: optionType.id } },
    update: data,
    create: { categoryId: category.id, optionTypeId: optionType.id, ...data },
  });
}

// ── catalog: products, options, offered values, variants ─────────────────────

export async function upsertProduct(
  prisma: PrismaClient,
  ctx: SeedCtx,
  spec: {
    slug: string;
    categorySlug: string;
    brandSlug: string;
    title: string;
    status: 'draft' | 'pending' | 'active' | 'archived';
    basePriceMinor?: number;
    currency?: string;
    options?: { typeCode: string; valueCodes: string[] }[];
    variants?: { sku: string; select: { typeCode: string; valueCode: string }[] }[];
  },
): Promise<string> {
  const category = ctx.category.get(spec.categorySlug);
  const brandId = ctx.brand.get(spec.brandSlug);
  if (!category || !brandId) {
    throw new Error(`seed: product "${spec.slug}" needs category + brand seeded first`);
  }

  const base = {
    categoryId: category.id,
    brandId,
    titleI18n: en(spec.title),
    status: spec.status,
    basePriceMinor: spec.basePriceMinor != null ? BigInt(spec.basePriceMinor) : null,
    currency: spec.currency ?? null,
  };
  const p = await prisma.product.upsert({
    where: { slug: spec.slug },
    update: base,
    create: { slug: spec.slug, ...base },
  });

  const valueId = (typeCode: string, valueCode: string): string => {
    const id = ctx.optionType.get(typeCode)?.valueIds[valueCode];
    if (!id)
      throw new Error(`seed: value "${typeCode}/${valueCode}" missing for product ${spec.slug}`);
    return id;
  };

  for (const [i, opt] of (spec.options ?? []).entries()) {
    const optionTypeId = ctx.optionType.get(opt.typeCode)?.id;
    if (!optionTypeId) throw new Error(`seed: option type "${opt.typeCode}" missing`);
    await prisma.productOption.upsert({
      where: { productId_optionTypeId: { productId: p.id, optionTypeId } },
      update: { position: i },
      create: { productId: p.id, optionTypeId, position: i },
    });
    await prisma.productOptionValue.deleteMany({ where: { productId: p.id, optionTypeId } });
    await prisma.productOptionValue.createMany({
      data: opt.valueCodes.map((code, position) => ({
        productId: p.id,
        optionTypeId,
        optionValueId: valueId(opt.typeCode, code),
        position,
      })),
    });
  }

  for (const [i, v] of (spec.variants ?? []).entries()) {
    const selections = v.select.map((s) => ({
      optionTypeId: ctx.optionType.get(s.typeCode)!.id,
      optionValueId: valueId(s.typeCode, s.valueCode),
    }));
    const signature = [...selections]
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
      data: selections.map((s) => ({
        variantId: variant.id,
        optionTypeId: s.optionTypeId,
        optionValueId: s.optionValueId,
      })),
    });
  }

  ctx.product.set(spec.slug, p.id);
  return p.id;
}
