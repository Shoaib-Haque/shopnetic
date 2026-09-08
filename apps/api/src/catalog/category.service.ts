import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type {
  Category,
  CategoryListStatus,
  CreateCategoryRequest,
  MoveCategoryRequest,
  ReorderCategoriesRequest,
  UpdateCategoryRequest,
} from '@shopnetic/contracts';
import type { Prisma } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';
import type { RequestMeta } from '../identity/identity.service.js';

interface RawCategory {
  id: string;
  parent_id: string | null;
  slug: string;
  name_i18n: Record<string, string>;
  path: string;
  position: number;
  is_active: boolean;
  brand_requirement: Category['brandRequirement'];
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

const COLUMNS = `id, parent_id, slug, name_i18n, path::text AS path, position, is_active,
        brand_requirement, created_at, updated_at, deleted_at`;

/** ltree label = the uuid with dashes stripped (32 hex chars — a valid label). */
const label = (id: string): string => id.replace(/-/g, '');

@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: { parentId?: string | null; status?: CategoryListStatus }): Promise<Category[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const status = opts.status ?? 'active';
    if (status === 'active') where.push('deleted_at IS NULL');
    else if (status === 'archived') where.push('deleted_at IS NOT NULL');
    // 'all' → no lifecycle filter
    if (opts.parentId === null) {
      where.push('parent_id IS NULL');
    } else if (typeof opts.parentId === 'string') {
      params.push(opts.parentId);
      where.push(`parent_id = $${params.length}::uuid`);
    }

    const rows = await this.prisma.$queryRawUnsafe<RawCategory[]>(
      `SELECT ${COLUMNS}
         FROM catalog.category
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY path, position`,
      ...params,
    );
    return rows.map(toView);
  }

  async get(id: string): Promise<Category> {
    return toView(await this.rowOrThrow(id));
  }

  async create(input: CreateCategoryRequest, actor: Actor, meta: RequestMeta): Promise<Category> {
    const parent = input.parentId ? await this.parentOrThrow(input.parentId) : null;
    await this.assertSlugFree(input.slug, []);
    await this.assertNameFree(input.name['en'] ?? '', []);

    const view = await this.prisma
      .$transaction(async (tx) => {
        const row = await tx.category.create({
          data: {
            slug: input.slug,
            nameI18n: input.name,
            parentId: parent?.id ?? null,
            position: input.position ?? 0,
            isActive: input.isActive ?? true,
            brandRequirement: input.brandRequirement ?? 'optional',
          },
        });
        const path = parent ? `${parent.path}.${label(row.id)}` : label(row.id);
        await tx.$executeRawUnsafe(
          `UPDATE catalog.category SET path = $1::ltree WHERE id = $2::uuid`,
          path,
          row.id,
        );
        await writeCatalogOutbox(tx, 'category', 'category.created', row.id, {
          id: row.id,
          slug: row.slug,
          parentId: row.parentId,
        });
        return toView({ ...raw(row), path });
      })
      .catch(mapUniqueViolation);

    await this.audit.record({
      actorAccountId: actor.accountId,
      action: 'catalog.category_created',
      targetType: 'category',
      targetId: view.id,
      after: view,
      ...pick(meta),
    });
    return view;
  }

  async update(
    id: string,
    input: UpdateCategoryRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Category> {
    const current = await this.rowOrThrow(id);

    // optimistic concurrency: reject a save built on a stale view of the row
    if (
      input.expectedUpdatedAt !== undefined &&
      input.expectedUpdatedAt !== current.updated_at.toISOString()
    ) {
      throw new AppError('CONFLICT', 409, { detail: 'category changed since it was loaded' });
    }

    if (input.slug !== undefined && input.slug !== current.slug) {
      await this.assertSlugFree(input.slug, [id]);
    }
    if (input.name !== undefined) {
      const nextName = input.name['en'] ?? '';
      if (nextName.toLowerCase() !== (current.name_i18n['en'] ?? '').toLowerCase()) {
        await this.assertNameFree(nextName, [id]);
      }
    }

    const wantsReparent =
      input.parentId !== undefined && (input.parentId ?? null) !== current.parent_id;
    const newParent =
      wantsReparent && input.parentId
        ? await this.assertReparentable(current, input.parentId)
        : null;

    const data: Prisma.CategoryUpdateInput = {};
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.name !== undefined) data.nameI18n = input.name;
    if (input.position !== undefined) data.position = input.position;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.brandRequirement !== undefined) data.brandRequirement = input.brandRequirement;

    await this.prisma
      .$transaction(async (tx) => {
        if (Object.keys(data).length > 0) {
          await tx.category.update({ where: { id }, data });
          await writeCatalogOutbox(tx, 'category', 'category.updated', id, {
            id,
            fields: Object.keys(data),
          });
        }
        if (wantsReparent) {
          await this.reparentInTx(tx, current, newParent, input.position ?? current.position);
          await writeCatalogOutbox(tx, 'category', 'category.moved', id, {
            id,
            fromParentId: current.parent_id,
            toParentId: newParent?.id ?? null,
          });
        }
      })
      .catch(mapUniqueViolation);

    const view = await this.get(id);
    await this.audit.record({
      actorAccountId: actor.accountId,
      action: 'catalog.category_updated',
      targetType: 'category',
      targetId: id,
      before: toView(current),
      after: view,
      ...pick(meta),
    });
    return view;
  }

  async move(
    id: string,
    input: MoveCategoryRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Category> {
    const self = await this.rowOrThrow(id);
    const parent = input.parentId ? await this.assertReparentable(self, input.parentId) : null;

    await this.prisma.$transaction(async (tx) => {
      await this.reparentInTx(tx, self, parent, input.position ?? 0);
      await writeCatalogOutbox(tx, 'category', 'category.moved', id, {
        id,
        fromParentId: self.parent_id,
        toParentId: parent?.id ?? null,
      });
    });

    const view = await this.get(id);
    await this.audit.record({
      actorAccountId: actor.accountId,
      action: 'catalog.category_moved',
      targetType: 'category',
      targetId: id,
      before: { parentId: self.parent_id, path: self.path },
      after: { parentId: view.parentId, path: view.path },
      ...pick(meta),
    });
    return view;
  }

  /**
   * Drag-reorder: make `orderedIds` the exact, ordered child list of `parentId`
   * (`position = index`). Ids that change parent get their subtree paths
   * rewritten in the same transaction; cycle-checked first.
   */
  async reorder(
    input: ReorderCategoriesRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Category[]> {
    const parentId = input.parentId ?? null;
    const placeholders = input.orderedIds.map((_, i) => `$${i + 1}::uuid`).join(', ');
    const rows = await this.prisma.$queryRawUnsafe<RawCategory[]>(
      `SELECT ${COLUMNS} FROM catalog.category
        WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ...input.orderedIds,
    );
    if (rows.length !== input.orderedIds.length) {
      throw new AppError('VALIDATION_ERROR', 422, {
        detail: 'every id must be an existing live category',
      });
    }
    const byId = new Map(rows.map((r) => [r.id, r]));

    const newParent = parentId === null ? null : await this.parentOrThrow(parentId);
    for (const row of rows) {
      if ((row.parent_id ?? null) !== parentId && newParent) {
        await this.assertReparentable(row, newParent.id);
      }
    }

    const movedIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const [i, id] of input.orderedIds.entries()) {
        const row = byId.get(id);
        if (!row) continue;
        if ((row.parent_id ?? null) !== parentId) {
          await this.reparentInTx(tx, row, newParent, i);
          movedIds.push(id);
          await writeCatalogOutbox(tx, 'category', 'category.moved', id, {
            id,
            fromParentId: row.parent_id,
            toParentId: parentId,
          });
        } else if (row.position !== i) {
          await tx.category.update({ where: { id }, data: { position: i } });
        }
      }
      await writeCatalogOutbox(tx, 'category', 'category.reordered', parentId ?? 'root', {
        parentId,
        orderedIds: input.orderedIds,
      });
    });

    await this.audit.record({
      actorAccountId: actor.accountId,
      action: 'catalog.categories_reordered',
      targetType: 'category',
      targetId: parentId ?? 'root',
      before: null,
      after: { parentId, orderedIds: input.orderedIds, movedIds },
      ...pick(meta),
    });

    // `list` orders by the ltree path (uuid labels); re-sort the affected
    // sibling group by the freshly written `position`.
    const siblings = await this.list({ parentId, status: 'active' });
    return siblings.sort((a, b) => a.position - b.position);
  }

  async remove(id: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const self = await this.rowOrThrow(id);
    const children = await this.prisma.category.count({ where: { parentId: id, deletedAt: null } });
    if (children > 0) {
      throw new AppError('CATEGORY_HAS_CHILDREN', 409, {
        detail: 'move or delete the child categories first',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.category.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeCatalogOutbox(tx, 'category', 'category.deleted', id, { id });
    });

    await this.audit.record({
      actorAccountId: actor.accountId,
      action: 'catalog.category_deleted',
      targetType: 'category',
      targetId: id,
      before: toView(self),
      reason: 'soft delete',
      ...pick(meta),
    });
  }

  /**
   * Un-archive a category and every archived descendant that went down with it
   * (cascade). Blocked when the parent is still archived / gone, or when a
   * restored name/slug would now collide with a live row.
   */
  async restore(id: string, actor: Actor, meta: RequestMeta): Promise<Category> {
    const self = await this.archivedRowOrThrow(id);

    let parent: { id: string; path: string } | null = null;
    if (self.parent_id) {
      const rows = await this.prisma.$queryRawUnsafe<
        { id: string; path: string; deleted_at: Date | null }[]
      >(
        `SELECT id, path::text AS path, deleted_at FROM catalog.category WHERE id = $1::uuid`,
        self.parent_id,
      );
      const p = rows[0];
      if (!p) {
        throw new AppError('CATEGORY_PARENT_INVALID', 422, {
          detail: 'the parent category no longer exists',
        });
      }
      if (p.deleted_at) {
        throw new AppError('CATEGORY_PARENT_ARCHIVED', 409, {
          detail: 'restore the parent category first',
        });
      }
      parent = { id: p.id, path: p.path };
    }

    const subtree = await this.prisma.$queryRawUnsafe<RawCategory[]>(
      `SELECT ${COLUMNS}
         FROM catalog.category
        WHERE path <@ $1::ltree AND deleted_at IS NOT NULL
        ORDER BY path`,
      self.path,
    );
    const subtreeIds = subtree.map((r) => r.id);

    for (const row of subtree) {
      await this.assertNameFree(row.name_i18n['en'] ?? '', subtreeIds);
      await this.assertSlugFree(row.slug, subtreeIds);
    }

    await this.prisma
      .$transaction(async (tx) => {
        await tx.category.updateMany({
          where: { id: { in: subtreeIds } },
          data: { deletedAt: null },
        });
        // the parent may have moved while this was archived → rebuild the paths
        const newSelfPath = parent ? `${parent.path}.${label(self.id)}` : label(self.id);
        await tx.$executeRawUnsafe(
          `UPDATE catalog.category
              SET path = CASE
                WHEN nlevel(path) = nlevel($2::ltree) THEN $1::ltree
                ELSE $1::ltree || subpath(path, nlevel($2::ltree))
              END
            WHERE path <@ $2::ltree`,
          newSelfPath,
          self.path,
        );
        await writeCatalogOutbox(tx, 'category', 'category.restored', self.id, {
          id: self.id,
          restoredCount: subtreeIds.length,
        });
      })
      .catch(mapUniqueViolation);

    const view = await this.get(self.id);
    await this.audit.record({
      actorAccountId: actor.accountId,
      action: 'catalog.category_restored',
      targetType: 'category',
      targetId: self.id,
      after: view,
      reason: `restore (${subtreeIds.length} row${subtreeIds.length === 1 ? '' : 's'})`,
      ...pick(meta),
    });
    return view;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async rowOrThrow(id: string): Promise<RawCategory> {
    const rows = await this.prisma.$queryRawUnsafe<RawCategory[]>(
      `SELECT ${COLUMNS} FROM catalog.category WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    const row = rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'category not found' });
    return row;
  }

  private async archivedRowOrThrow(id: string): Promise<RawCategory> {
    const rows = await this.prisma.$queryRawUnsafe<RawCategory[]>(
      `SELECT ${COLUMNS} FROM catalog.category WHERE id = $1::uuid AND deleted_at IS NOT NULL`,
      id,
    );
    const row = rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'archived category not found' });
    return row;
  }

  private async parentOrThrow(parentId: string): Promise<{ id: string; path: string }> {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string; path: string }[]>(
      `SELECT id, path::text AS path FROM catalog.category WHERE id = $1::uuid AND deleted_at IS NULL`,
      parentId,
    );
    const row = rows[0];
    if (!row)
      throw new AppError('CATEGORY_PARENT_INVALID', 422, { detail: 'parent category not found' });
    return row;
  }

  /** Read-side check: the new parent exists, is live, and is not in `self`'s subtree. */
  private async assertReparentable(
    self: RawCategory,
    newParentId: string,
  ): Promise<{ id: string; path: string }> {
    const parent = await this.parentOrThrow(newParentId);
    if (parent.id === self.id)
      throw new AppError('CATEGORY_CYCLE', 422, { detail: 'cannot parent to self' });
    const inSubtree = await this.prisma.$queryRawUnsafe<{ c: number }[]>(
      `SELECT count(*)::int AS c FROM catalog.category
        WHERE id = $1::uuid AND path <@ $2::ltree`,
      parent.id,
      self.path,
    );
    if ((inSubtree[0]?.c ?? 0) > 0) {
      throw new AppError('CATEGORY_CYCLE', 422, {
        detail: 'cannot move a category under its own descendant',
      });
    }
    return parent;
  }

  /** Write-side of a reparent: rewrite the subtree's ltree paths + set parent. */
  private async reparentInTx(
    tx: Prisma.TransactionClient,
    self: RawCategory,
    newParent: { id: string; path: string } | null,
    position: number,
  ): Promise<void> {
    const newSelfPath = newParent ? `${newParent.path}.${label(self.id)}` : label(self.id);
    await tx.$executeRawUnsafe(
      `UPDATE catalog.category
          SET path = CASE
            WHEN nlevel(path) = nlevel($2::ltree) THEN $1::ltree
            ELSE $1::ltree || subpath(path, nlevel($2::ltree))
          END
        WHERE path <@ $2::ltree`,
      newSelfPath,
      self.path,
    );
    await tx.category.update({
      where: { id: self.id },
      data: { parentId: newParent?.id ?? null, position },
    });
  }

  /** Exact `slug` uniqueness among live categories (global). */
  private async assertSlugFree(slug: string, exceptIds: string[]): Promise<void> {
    const params: unknown[] = [slug];
    const where = ['deleted_at IS NULL', 'slug = $1'];
    if (exceptIds.length > 0) {
      const ph = exceptIds.map((_, i) => `$${i + 2}::uuid`).join(', ');
      where.push(`id NOT IN (${ph})`);
      params.push(...exceptIds);
    }
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM catalog.category WHERE ${where.join(' AND ')} LIMIT 1`,
      ...params,
    );
    if (rows.length > 0) {
      throw new AppError('CATEGORY_SLUG_TAKEN', 409, {
        detail: `slug "${slug}" is already in use`,
      });
    }
  }

  /** Case-insensitive `name.en` uniqueness among live categories (global). */
  private async assertNameFree(nameEn: string, exceptIds: string[]): Promise<void> {
    const params: unknown[] = [nameEn];
    const where = ['deleted_at IS NULL', "lower(name_i18n->>'en') = lower($1)"];
    if (exceptIds.length > 0) {
      const ph = exceptIds.map((_, i) => `$${i + 2}::uuid`).join(', ');
      where.push(`id NOT IN (${ph})`);
      params.push(...exceptIds);
    }
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM catalog.category WHERE ${where.join(' AND ')} LIMIT 1`,
      ...params,
    );
    if (rows.length > 0) {
      throw new AppError('CATEGORY_NAME_TAKEN', 409, {
        detail: `a category is already named "${nameEn}" (names are case-insensitive)`,
      });
    }
  }
}

/** Map a Prisma P2002 (unique index) from the DB backstop to a catalog error. */
function mapUniqueViolation(e: unknown): never {
  if (e && typeof e === 'object' && (e as { code?: unknown }).code === 'P2002') {
    const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? '');
    if (target.includes('name')) {
      throw new AppError('CATEGORY_NAME_TAKEN', 409, { detail: 'name already in use' });
    }
    if (target.includes('slug')) {
      throw new AppError('CATEGORY_SLUG_TAKEN', 409, { detail: 'slug already in use' });
    }
    throw new AppError('CONFLICT', 409, { detail: 'unique constraint violated' });
  }
  throw e as Error;
}

function raw(row: {
  id: string;
  parentId: string | null;
  slug: string;
  nameI18n: unknown;
  position: number;
  isActive: boolean;
  brandRequirement: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): RawCategory {
  return {
    id: row.id,
    parent_id: row.parentId,
    slug: row.slug,
    name_i18n: row.nameI18n as Record<string, string>,
    path: '',
    position: row.position,
    is_active: row.isActive,
    brand_requirement: row.brandRequirement as RawCategory['brand_requirement'],
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    deleted_at: row.deletedAt,
  };
}

function toView(r: RawCategory): Category {
  return {
    id: r.id,
    parentId: r.parent_id,
    slug: r.slug,
    name: r.name_i18n,
    path: r.path,
    depth: r.path ? r.path.split('.').length : 1,
    position: r.position,
    isActive: r.is_active,
    brandRequirement: r.brand_requirement,
    archivedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function pick(meta: RequestMeta): { ip?: string; correlationId?: string } {
  return {
    ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
  };
}
