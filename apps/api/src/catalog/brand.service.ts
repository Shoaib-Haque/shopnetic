import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type {
  AddBrandAliasRequest,
  Brand,
  CreateBrandRequest,
  MergeBrandRequest,
  UpdateBrandRequest,
} from '@shopnetic/contracts';
import { Prisma } from '@shopnetic/db';
import type { Brand as BrandRow, BrandAlias as BrandAliasRow } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

type BrandWithAliases = BrandRow & { aliases: BrandAliasRow[] };

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

@Injectable()
export class BrandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: {
    status?: Brand['status'];
    q?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: Brand[]; nextCursor?: string }> {
    const limit = clamp(opts.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
    const where: Prisma.BrandWhereInput = { deletedAt: null };
    if (opts.status) where.status = opts.status;
    if (opts.q) {
      where.OR = [
        { name: { contains: opts.q, mode: 'insensitive' } },
        { slug: { contains: opts.q.toLowerCase() } },
        { aliases: { some: { alias: { contains: opts.q } } } },
      ];
    }

    const rows = await this.prisma.brand.findMany({
      where,
      include: { aliases: true },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? page.at(-1)?.id : undefined;
    return { items: page.map(toView), ...(nextCursor ? { nextCursor } : {}) };
  }

  async get(id: string): Promise<Brand> {
    return toView(await this.rowOrThrow(id));
  }

  async create(input: CreateBrandRequest, actor: Actor, meta: RequestMeta): Promise<Brand> {
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw new AppError('VALIDATION_ERROR', 422, { detail: 'name yields an empty slug' });
    await this.assertSlugFree(slug, null);

    const aliases = dedupe([...(input.aliases ?? [])].map((a) => a.trim()).filter(Boolean));
    await this.assertAliasesFree(aliases, null);

    const created = await this.prisma.$transaction(async (tx) => {
      const brand = await tx.brand.create({
        data: {
          name: input.name,
          slug,
          status: input.status ?? 'active',
          ...(input.displayName ? { displayNameI18n: input.displayName } : {}),
          aliases: { create: aliases.map((alias) => ({ alias })) },
        },
        include: { aliases: true },
      });
      await writeCatalogOutbox(tx, 'brand', 'brand.created', brand.id, {
        id: brand.id,
        slug: brand.slug,
        status: brand.status,
      });
      return brand;
    });

    await this.record(actor, 'catalog.brand_created', created.id, meta, { after: toView(created) });
    return toView(created);
  }

  async update(
    id: string,
    input: UpdateBrandRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Brand> {
    const current = await this.rowOrThrow(id);
    if (input.slug && input.slug !== current.slug) await this.assertSlugFree(input.slug, id);

    const data: Prisma.BrandUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.status !== undefined) data.status = input.status;
    if (input.logoKey !== undefined) data.logoKey = input.logoKey;
    if (input.displayName !== undefined) {
      data.displayNameI18n = input.displayName === null ? Prisma.DbNull : input.displayName;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.brand.update({ where: { id }, data });
      await writeCatalogOutbox(tx, 'brand', 'brand.updated', id, { id, fields: Object.keys(data) });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.brand_updated', id, meta, {
      before: toView(current),
      after: view,
    });
    return view;
  }

  async addAlias(
    id: string,
    input: AddBrandAliasRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Brand> {
    await this.rowOrThrow(id);
    const alias = input.alias.trim();
    await this.assertAliasesFree([alias], null);

    await this.prisma.$transaction(async (tx) => {
      await tx.brandAlias.create({ data: { brandId: id, alias } });
      await writeCatalogOutbox(tx, 'brand', 'brand.updated', id, { id, aliasAdded: alias });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.brand_updated', id, meta, { after: { alias } });
    return view;
  }

  async removeAlias(id: string, aliasId: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const { count } = await this.prisma.brandAlias.deleteMany({
      where: { id: aliasId, brandId: id },
    });
    if (count === 0)
      throw new AppError('NOT_FOUND', 404, { detail: 'alias not found on this brand' });
    await this.record(actor, 'catalog.brand_updated', id, meta, { before: { aliasId } });
  }

  async merge(
    id: string,
    input: MergeBrandRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Brand> {
    if (id === input.intoBrandId) {
      throw new AppError('BRAND_MERGE_INVALID', 422, {
        detail: 'cannot merge a brand into itself',
      });
    }
    const source = await this.rowOrThrow(id);
    const target = await this.rowOrThrow(input.intoBrandId);
    if (source.mergedIntoBrandId || target.mergedIntoBrandId) {
      throw new AppError('BRAND_MERGE_INVALID', 422, {
        detail: 'a brand in the merge is already merged',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const taken = new Set(
        (await tx.brandAlias.findMany({ where: { brandId: target.id } })).map((a) =>
          a.alias.toLowerCase(),
        ),
      );
      for (const a of await tx.brandAlias.findMany({ where: { brandId: id } })) {
        if (taken.has(a.alias.toLowerCase())) {
          await tx.brandAlias.delete({ where: { id: a.id } });
        } else {
          await tx.brandAlias.update({ where: { id: a.id }, data: { brandId: target.id } });
          taken.add(a.alias.toLowerCase());
        }
      }
      for (const candidate of [source.name, source.slug]) {
        if (taken.has(candidate.toLowerCase())) continue;
        if (await tx.brandAlias.findUnique({ where: { alias: candidate } })) continue;
        await tx.brandAlias.create({ data: { brandId: target.id, alias: candidate } });
        taken.add(candidate.toLowerCase());
      }
      await tx.brand.update({
        where: { id },
        data: { mergedIntoBrandId: target.id, status: 'rejected', deletedAt: new Date() },
      });
      await writeCatalogOutbox(tx, 'brand', 'brand.merged', id, { id, intoBrandId: target.id });
    });

    const view = await this.get(target.id);
    await this.record(actor, 'catalog.brand_merged', id, meta, {
      before: toView(source),
      after: { mergedIntoBrandId: target.id },
      reason: `merged into ${target.id}`,
    });
    return view;
  }

  async remove(id: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const current = await this.rowOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.brand.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeCatalogOutbox(tx, 'brand', 'brand.deleted', id, { id });
    });
    await this.record(actor, 'catalog.brand_deleted', id, meta, {
      before: toView(current),
      reason: 'soft delete',
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async rowOrThrow(id: string): Promise<BrandWithAliases> {
    const row = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
      include: { aliases: true },
    });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'brand not found' });
    return row;
  }

  private async assertSlugFree(slug: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.brand.findFirst({
      where: { slug, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new AppError('BRAND_SLUG_TAKEN', 409, { detail: `slug "${slug}" is in use` });
  }

  private async assertAliasesFree(aliases: string[], exceptBrandId: string | null): Promise<void> {
    if (aliases.length === 0) return;
    const clash = await this.prisma.brandAlias.findFirst({
      where: {
        alias: { in: aliases },
        ...(exceptBrandId ? { brandId: { not: exceptBrandId } } : {}),
      },
      select: { alias: true },
    });
    if (clash) {
      throw new AppError('BRAND_ALIAS_TAKEN', 409, {
        detail: `alias "${clash.alias}" already maps to a brand`,
      });
    }
  }

  private async record(
    actor: Actor,
    action: string,
    targetId: string,
    meta: RequestMeta,
    extra: { before?: unknown; after?: unknown; reason?: string },
  ): Promise<void> {
    await this.audit.record({
      actorAccountId: actor.accountId,
      action,
      targetType: 'brand',
      targetId,
      ...(extra.before !== undefined ? { before: extra.before } : {}),
      ...(extra.after !== undefined ? { after: extra.after } : {}),
      ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
      ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    });
  }
}

function toView(row: BrandWithAliases): Brand {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    displayName: (row.displayNameI18n as Record<string, string> | null) ?? null,
    logoKey: row.logoKey,
    status: row.status,
    mergedIntoBrandId: row.mergedIntoBrandId,
    aliases: row.aliases
      .map((a) => ({ id: a.id, alias: a.alias, createdAt: a.createdAt.toISOString() }))
      .sort((x, y) => x.alias.localeCompare(y.alias)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(Math.trunc(n), lo), hi);
}
