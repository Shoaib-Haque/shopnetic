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
import { auditRecordFor } from '../audit/audit-record-for.js';
import { clampLimit, paginate } from '../common/pagination.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

type BrandWithAliases = BrandRow & { aliases: BrandAliasRow[] };

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** Mirrors `CategoryService`'s own `tokenizeForSql` (same normalize +
 * rules) — duplicated rather than shared, following those files' own
 * precedent of not extracting this into a cross-package util. Splits on
 * whitespace/punctuation runs into individual search words, each matched
 * with its own `OR` clause below — a query of "pla lev" matches a brand
 * containing *either* word, not the literal two-word phrase (the
 * 2026-09-17 fix — `list()` previously did one `contains` on the whole
 * query string). */
function tokenizeForSql(query: string): string[] {
  const normalized = query
    .toLowerCase()
    .replace(/['’"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const tokens = new Set<string>();
  for (const tok of normalized.split(' ')) {
    if (tok.length >= 2) tokens.add(tok);
    if (tokens.size >= 10) break;
  }
  return [...tokens];
}

@Injectable()
export class BrandService {
  private readonly record: ReturnType<typeof auditRecordFor>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.record = auditRecordFor(this.audit, 'brand');
  }

  async list(opts: {
    status?: Brand['status'];
    /** List archived (soft-deleted) rows instead of live ones — the only
     * way to reach `restore()` again once the delete's undo-toast window
     * has passed. */
    archived?: boolean;
    q?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: Brand[]; nextCursor?: string }> {
    const limit = clampLimit(opts.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
    const where: Prisma.BrandWhereInput = opts.archived
      ? { deletedAt: { not: null } }
      : { deletedAt: null };
    if (opts.status) where.status = opts.status;
    const tokens = opts.q ? tokenizeForSql(opts.q) : [];
    if (tokens.length > 0) {
      where.OR = tokens.flatMap((tok) => [
        { name: { contains: tok, mode: 'insensitive' as const } },
        { slug: { contains: tok } },
        { aliases: { some: { alias: { contains: tok } } } },
      ]);
    }

    const rows = await this.prisma.brand.findMany({
      where,
      include: { aliases: true },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const { page, nextCursor } = paginate(rows, limit);
    return { items: page.map(toView), ...(nextCursor ? { nextCursor } : {}) };
  }

  async get(id: string): Promise<Brand> {
    return toView(await this.rowOrThrow(id));
  }

  async create(input: CreateBrandRequest, actor: Actor, meta: RequestMeta): Promise<Brand> {
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw new AppError('VALIDATION_ERROR', 422, { detail: 'name yields an empty slug' });
    await this.assertSlugFree(slug, null);
    await this.assertNameFree(input.name, null);

    const aliases = dedupe([...(input.aliases ?? [])].map((a) => a.trim()).filter(Boolean));
    await this.assertAliasesFree(aliases, null);

    const created = await this.prisma.$transaction(async (tx) => {
      const brand = await tx.brand.create({
        data: {
          name: input.name,
          slug,
          status: input.status ?? 'active',
          isRestricted: input.isRestricted ?? false,
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

    // optimistic concurrency: reject a save built on a stale view of the
    // row — mirrors `CategoryService.update()`'s own guard, same risk
    // (concurrent edits by multiple staff), same fix.
    if (
      input.expectedUpdatedAt !== undefined &&
      input.expectedUpdatedAt !== current.updatedAt.toISOString()
    ) {
      throw new AppError('CONFLICT', 409, { detail: 'brand changed since it was loaded' });
    }

    if (input.slug && input.slug !== current.slug) await this.assertSlugFree(input.slug, id);
    if (input.name !== undefined && input.name.toLowerCase() !== current.name.toLowerCase()) {
      await this.assertNameFree(input.name, id);
    }

    const data: Prisma.BrandUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.status !== undefined) data.status = input.status;
    if (input.isRestricted !== undefined) data.isRestricted = input.isRestricted;
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
    // its own action, not the generic `brand_updated` — mirrors
    // `category_moved` vs `category_updated`: a semantically distinct
    // operation gets a name the Audit Log's Action column can show as-is,
    // rather than making an admin expand the row and read Before/After to
    // tell an alias change apart from a plain field edit (the 2026-09-18
    // fix, found via a live screenshot question).
    await this.record(actor, 'catalog.brand_alias_added', id, meta, { after: { alias } });
    return view;
  }

  async removeAlias(id: string, aliasId: string, actor: Actor, meta: RequestMeta): Promise<void> {
    // fetched first, not just existence-checked by the delete's own count —
    // the alias *text* itself was never in scope before this, only its id
    const existing = await this.prisma.brandAlias.findFirst({
      where: { id: aliasId, brandId: id },
      select: { alias: true },
    });
    if (!existing)
      throw new AppError('NOT_FOUND', 404, { detail: 'alias not found on this brand' });

    await this.prisma.$transaction(async (tx) => {
      await tx.brandAlias.delete({ where: { id: aliasId } });
      await writeCatalogOutbox(tx, 'brand', 'brand.updated', id, {
        id,
        aliasRemoved: existing.alias,
      });
    });

    // its own action, not the generic `brand_updated` — see addAlias above.
    await this.record(actor, 'catalog.brand_alias_removed', id, meta, {
      before: { aliasId, alias: existing.alias },
    });
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
      // `target` is already the full row (fetched above) — its `name` is
      // free, no extra query, unlike category moves/reorders where the
      // referenced row lives outside what the action itself touched.
      after: { mergedIntoBrandId: target.id, mergedIntoBrandName: target.name },
      reason: `merged into ${target.name}`,
    });
    return view;
  }

  async remove(id: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const current = await this.rowOrThrow(id);
    // A plain remove is for a brand that's meant to be truly unused; unlike
    // `merge()` (the preferred path when real products still reference it,
    // since it relinks + preserves the name as an alias), this just cuts
    // any remaining stragglers loose — plan/25 §2.3, plan/26 §brands:
    // "never leave products pointing at a deleted brand id."
    const relinked = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.product.updateMany({
        where: { brandId: id, deletedAt: null },
        data: { brandId: null },
      });
      await tx.brand.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeCatalogOutbox(tx, 'brand', 'brand.deleted', id, { id, productsRelinked: count });
      return count;
    });
    await this.record(actor, 'catalog.brand_deleted', id, meta, {
      before: toView(current),
      reason:
        relinked > 0
          ? `soft delete (${relinked} product${relinked === 1 ? '' : 's'} relinked to no brand)`
          : 'soft delete',
    });
  }

  /** Restore an archived brand. Blocked when the freed name/slug was picked
   * up by a live row in the meantime (same reasoning as `category.restore`)
   * — no subtree/cascade here, though: brand is flat. */
  async restore(id: string, actor: Actor, meta: RequestMeta): Promise<Brand> {
    const current = await this.archivedRowOrThrow(id);
    await this.assertSlugFree(current.slug, id);
    await this.assertNameFree(current.name, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.brand.update({ where: { id }, data: { deletedAt: null } });
      await writeCatalogOutbox(tx, 'brand', 'brand.restored', id, { id });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.brand_restored', id, meta, {
      after: view,
      reason: 'restore',
    });
    return view;
  }

  /** Exact (case-insensitive) alias availability, for the admin UI to
   * check *before* staging a draft alias on the create form — where
   * there's no brand id yet for `addAlias`'s own round-trip to validate
   * against, so without this a duplicate wasn't caught until the whole
   * form was submitted (the 2026-09-18 fix). Reuses the same lookup
   * `assertAliasesFree` does, just returning a boolean instead of
   * throwing. */
  async aliasAvailable(alias: string): Promise<boolean> {
    const clash = await this.prisma.brandAlias.findFirst({
      where: { alias },
      select: { id: true },
    });
    return !clash;
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

  private async archivedRowOrThrow(id: string): Promise<BrandWithAliases> {
    const row = await this.prisma.brand.findFirst({
      where: { id, deletedAt: { not: null } },
      include: { aliases: true },
    });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'archived brand not found' });
    return row;
  }

  private async assertSlugFree(slug: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.brand.findFirst({
      where: { slug, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new AppError('BRAND_SLUG_TAKEN', 409, { detail: `slug "${slug}" is in use` });
  }

  /** Case-insensitive brand-name uniqueness across live brands. */
  private async assertNameFree(name: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.brand.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new AppError('BRAND_NAME_TAKEN', 409, {
        detail: `a brand is already named "${name}" (names are case-insensitive)`,
      });
    }
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
}

function toView(row: BrandWithAliases): Brand {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    displayName: (row.displayNameI18n as Record<string, string> | null) ?? null,
    logoKey: row.logoKey,
    status: row.status,
    isRestricted: row.isRestricted,
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
