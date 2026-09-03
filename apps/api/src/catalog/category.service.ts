import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type {
  Category,
  CreateCategoryRequest,
  MoveCategoryRequest,
  UpdateCategoryRequest,
} from '@shopnetic/contracts';
import type { Prisma } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
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
}

/** ltree label = the uuid with dashes stripped (32 hex chars — a valid label). */
const label = (id: string): string => id.replace(/-/g, '');

@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: { parentId?: string | null; includeInactive?: boolean }): Promise<Category[]> {
    const where = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (opts.parentId === null) {
      where.push('parent_id IS NULL');
    } else if (typeof opts.parentId === 'string') {
      params.push(opts.parentId);
      where.push(`parent_id = $${params.length}::uuid`);
    }
    if (!opts.includeInactive) where.push('is_active = true');

    const rows = await this.prisma.$queryRawUnsafe<RawCategory[]>(
      `SELECT id, parent_id, slug, name_i18n, path::text AS path, position, is_active,
              brand_requirement, created_at, updated_at
         FROM catalog.category
        WHERE ${where.join(' AND ')}
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
    await this.assertSlugFree(parent?.id ?? null, input.slug, null);

    const view = await this.prisma.$transaction(async (tx) => {
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
      await writeOutbox(tx, 'category.created', row.id, {
        id: row.id,
        slug: row.slug,
        parentId: row.parentId,
      });
      return toView({
        ...raw(row),
        path,
      });
    });

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
    if (input.slug && input.slug !== current.slug) {
      await this.assertSlugFree(current.parent_id, input.slug, id);
    }

    const data: Prisma.CategoryUpdateInput = {};
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.name !== undefined) data.nameI18n = input.name;
    if (input.position !== undefined) data.position = input.position;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.brandRequirement !== undefined) data.brandRequirement = input.brandRequirement;

    await this.prisma.$transaction(async (tx) => {
      await tx.category.update({ where: { id }, data });
      await writeOutbox(tx, 'category.updated', id, { id, fields: Object.keys(data) });
    });

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
    const parent = input.parentId ? await this.parentOrThrow(input.parentId) : null;

    if (parent) {
      if (parent.id === id)
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
    }
    await this.assertSlugFree(parent?.id ?? null, self.slug, id);

    await this.prisma.$transaction(async (tx) => {
      const newSelfPath = parent ? `${parent.path}.${label(id)}` : label(id);
      // $2 = old self path (prefix). Self row → new path; descendants → new
      // prefix + the tail below self. (`subpath` errors when offset == nlevel.)
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
        where: { id },
        data: { parentId: parent?.id ?? null, position: input.position ?? 0 },
      });
      await writeOutbox(tx, 'category.moved', id, {
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
      await writeOutbox(tx, 'category.deleted', id, { id });
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

  // ── helpers ────────────────────────────────────────────────────────────────

  private async rowOrThrow(id: string): Promise<RawCategory> {
    const rows = await this.prisma.$queryRawUnsafe<RawCategory[]>(
      `SELECT id, parent_id, slug, name_i18n, path::text AS path, position, is_active,
              brand_requirement, created_at, updated_at
         FROM catalog.category WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    const row = rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'category not found' });
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

  private async assertSlugFree(
    parentId: string | null,
    slug: string,
    exceptId: string | null,
  ): Promise<void> {
    const clash = await this.prisma.category.findFirst({
      where: {
        parentId,
        slug,
        deletedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new AppError('CATEGORY_SLUG_TAKEN', 409, {
        detail: `a sibling already uses "${slug}"`,
      });
    }
  }
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
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

async function writeOutbox(
  tx: Prisma.TransactionClient,
  eventType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.catalogOutbox.create({
    data: {
      aggregateType: 'category',
      aggregateId,
      eventType,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}

function pick(meta: RequestMeta): { ip?: string; correlationId?: string } {
  return {
    ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
  };
}
