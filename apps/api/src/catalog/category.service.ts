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
import { auditRecordFor } from '../audit/audit-record-for.js';
import { clampLimit } from '../common/pagination.js';
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
/** Same columns as `COLUMNS`, `c.`-prefixed — for a query that joins `catalog.category c`
 * against something else (the ranked-flat-view CTE below), where bare column names would
 * be ambiguous against the other side of the join. */
const COLUMNS_C = `c.id, c.parent_id, c.slug, c.name_i18n, c.path::text AS path, c.position,
        c.is_active, c.brand_requirement, c.created_at, c.updated_at, c.deleted_at`;

/** ltree label = the uuid with dashes stripped (32 hex chars — a valid label). */
const label = (id: string): string => id.replace(/-/g, '');

const LIST_MAX_LIMIT = 100;

/** Mirrors `apps/admin/src/lib/search.ts`'s `tokenize()` — same normalize
 * (lower-case, apostrophes dropped, everything else non-alphanumeric
 * collapsed to a space) and the same ≥2-char / ≤10-token rules — so a query
 * matches the same rows server-side that it would have matched client-side.
 * Search moved server-side specifically so pagination and search results
 * stay consistent (a query now searches the whole table, not just whatever
 * page happened to be loaded already). */
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
export class CategoryService {
  private readonly record: ReturnType<typeof auditRecordFor>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.record = auditRecordFor(this.audit, 'category');
  }

  /**
   * `limit` omitted (the active tree's own load — it needs the whole
   * subtree to build parent/child structure and can't render a page
   * boundary without either breaking the hierarchy or prefetching
   * ancestors) → every matching row, ordered `path, position`, same as
   * always. `limit` given (the flat Archived/All views, and any search) →
   * cursor-paginated.
   *
   * Two different cursor shapes depending on `q`, both opaque to the
   * caller:
   * - No search: the last-seen row's `path` (globally unique — it embeds
   *   the row's own id — so `path > cursor` resumes with no gaps or
   *   repeats). Since a parent's path is always a strict prefix of every
   *   descendant's, and pages accumulate rather than replace, every
   *   ancestor of a loaded row is guaranteed to have been loaded on an
   *   earlier page — `useAncestorPath` on the frontend keeps resolving
   *   correctly across pages for exactly this reason.
   * - Search: a stringified offset. Results are ordered by match score,
   *   not tree structure, so a simple keyset cursor doesn't apply; offset
   *   pagination over a ranked result set is the standard trade-off here.
   *   Known limitation, not a bug: an ancestor that doesn't itself match
   *   the query and hasn't been paged in yet won't resolve in the "in A ›
   *   B" breadcrumb (`useAncestorPath` already drops unresolved ancestors
   *   silently, same as it does today for the unpaginated search case).
   */
  async list(opts: {
    parentId?: string | null;
    status?: CategoryListStatus;
    q?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ categories: Category[]; nextCursor?: string }> {
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

    const tokens = opts.q ? tokenizeForSql(opts.q) : [];
    const isSearch = tokens.length > 0;
    let scoreExpr = '0';
    if (isSearch) {
      const haystack = `regexp_replace(lower(coalesce(name_i18n->>'en', '') || ' ' || slug), '[^a-z0-9]+', ' ', 'g')`;
      const matchExprs = tokens.map((tok) => {
        params.push(`%${tok}%`);
        return `(${haystack} LIKE $${params.length})`;
      });
      where.push(`(${matchExprs.join(' OR ')})`);
      scoreExpr = matchExprs.map((e) => `${e}::int`).join(' + ');
    }

    const paginated = opts.limit !== undefined;
    const take = paginated ? clampLimit(opts.limit!, 1, LIST_MAX_LIMIT) : undefined;

    // The whole-catalog flat, *paginated* view (Archived/All — no `parentId`
    // scoping, no search) needs sibling order to match the tree's own
    // `position`-based order, the same way `buildForest` already re-sorts
    // the (unpaginated, always-complete) active tree client-side. Plain
    // `path, position` ordering can't give that here: `path`'s labels are
    // the row's own uuid (`label()` below), not anything derived from
    // `position`, so ordering by it sorts each sibling group essentially at
    // random relative to drag order. Gated on `paginated` too: the
    // *unpaginated* tree load (`limit` omitted) doesn't need this fix at
    // all — `buildForest` discards and rebuilds the order client-side
    // regardless of what SQL order it arrives in, so paying for the
    // recursive walk there would be pure waste on a path that runs on every
    // category-page visit. `parentId`-scoped calls (a specific parent's
    // direct children, or `parentId: null` for roots-only) don't have the
    // ordering problem either — a single flat sibling level is already
    // directly, correctly orderable by `position` with no tree-walk needed.
    // See `plan/CODING-RULES.md`'s 2026-09-17 dated entry for the full
    // design discussion.
    const rankedFlat = paginated && opts.parentId === undefined && !isSearch;

    let offset = 0;
    if (paginated && opts.cursor) {
      if (isSearch || rankedFlat) {
        offset = Math.max(0, Math.trunc(Number(opts.cursor)) || 0);
      } else {
        params.push(opts.cursor);
        where.push(`path > $${params.length}::ltree`);
      }
    }

    const limitClause = paginated
      ? `LIMIT ${take! + 1}${isSearch || rankedFlat ? ` OFFSET ${offset}` : ''}`
      : '';

    const rows = rankedFlat
      ? await this.listRankedFlat(status, limitClause)
      : await this.prisma.$queryRawUnsafe<RawCategory[]>(
          `SELECT ${COLUMNS}
             FROM catalog.category
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY ${isSearch ? `${scoreExpr} DESC, path` : 'path, position'}
            ${limitClause}`,
          ...params,
        );

    if (!paginated) return { categories: rows.map(toView) };

    const page = rows.slice(0, take);
    const hasMore = rows.length > take!;
    const nextCursor = hasMore
      ? isSearch || rankedFlat
        ? String(offset + take!)
        : page.at(-1)?.path
      : undefined;
    return { categories: page.map(toView), ...(nextCursor ? { nextCursor } : {}) };
  }

  /**
   * The `rankedFlat` case above: every category, across every parent,
   * ordered so a parent always precedes its own descendants and each
   * sibling group is ordered by `position` (then name) — exactly what
   * `buildForest` produces for the tree, just flattened, and computed
   * here instead of client-side because this view is paginated and can't
   * fetch the whole table to sort locally.
   *
   * Walks the *real, unfiltered* parent/child structure (so a node's true
   * position in the actual tree is always used — the walk itself doesn't
   * care about `status`), but a node whose immediate parent does *not*
   * satisfy `status` is treated as an effective root: its `rank_path`
   * restarts at just its own `position`, dropping the excluded parent's
   * prefix. This mirrors `buildForest`'s own "parent missing from the
   * result → orphan, shown at root level" rule (`category-tree.tsx`) for
   * the one case that can't happen on the always-complete active tree but
   * routinely does here — an archived-only view where a category is
   * archived but its parent isn't (or vice versa for "all", which can't
   * actually produce this case today since nothing is hard-deleted, but
   * costs nothing extra to handle correctly anyway).
   *
   * Cursor: `rankedFlat` always paginates by offset (set by the caller),
   * same trade-off the search branch already has — a rank isn't a stable
   * keyset the way `path` is, so a page fetched mid-edit could rarely
   * skip or repeat a row if the tree changed between fetches. Accepted for
   * the same reason it already was for search: this is a low-traffic
   * admin list, not a high-concurrency public one.
   */
  private async listRankedFlat(
    status: CategoryListStatus,
    limitClause: string,
  ): Promise<RawCategory[]> {
    const pFilter =
      status === 'active'
        ? 'p.deleted_at IS NULL'
        : status === 'archived'
          ? 'p.deleted_at IS NOT NULL'
          : 'true';
    const cFilter =
      status === 'active'
        ? 'c.deleted_at IS NULL'
        : status === 'archived'
          ? 'c.deleted_at IS NOT NULL'
          : 'true';
    return this.prisma.$queryRawUnsafe<RawCategory[]>(
      `WITH RECURSIVE eff AS (
         SELECT c.id, c.parent_id, ARRAY[c.position] AS rank_path
           FROM catalog.category c
          WHERE c.parent_id IS NULL
             OR NOT EXISTS (SELECT 1 FROM catalog.category p WHERE p.id = c.parent_id AND ${pFilter})
         UNION ALL
         SELECT c.id, c.parent_id, e.rank_path || c.position
           FROM catalog.category c
           JOIN eff e ON c.parent_id = e.id
          WHERE EXISTS (SELECT 1 FROM catalog.category p WHERE p.id = c.parent_id AND ${pFilter})
       )
       SELECT ${COLUMNS_C}
         FROM eff e
         JOIN catalog.category c ON c.id = e.id
        WHERE ${cFilter}
        ORDER BY e.rank_path, coalesce(c.name_i18n->>'en', c.slug)
        ${limitClause}`,
    );
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

    // `parentName` is audit-only — added alongside `view`, not folded into
    // `toView()` itself, since that builds the public `Category` API shape
    // (`@shopnetic/contracts`) a name field has no business joining onto.
    await this.record(actor, 'catalog.category_created', view.id, meta, {
      after: { ...view, parentName: await this.nameOf(view.parentId) },
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
    const [beforeParentName, afterParentName] = await Promise.all([
      this.nameOf(current.parent_id),
      this.nameOf(view.parentId),
    ]);
    await this.record(actor, 'catalog.category_updated', id, meta, {
      before: { ...toView(current), parentName: beforeParentName },
      after: { ...view, parentName: afterParentName },
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
    const [fromParentName, toParentName] = await Promise.all([
      this.nameOf(self.parent_id),
      this.nameOf(view.parentId),
    ]);
    await this.record(actor, 'catalog.category_moved', id, meta, {
      before: { parentId: self.parent_id, parentName: fromParentName, path: self.path },
      after: { parentId: view.parentId, parentName: toParentName, path: view.path },
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

    // `rows`/`byId` already hold every reordered category's own fields
    // (fetched above to validate the request) — free to read names from,
    // no extra query. The parent itself isn't in that set (it's the
    // *container*, not one of the reordered rows), so it gets the shared
    // `nameOf` lookup like `move()` does.
    const parentName = await this.nameOf(parentId);
    const orderedNames = input.orderedIds.map((oid) => byId.get(oid)?.name_i18n['en'] ?? null);
    const movedNames = movedIds.map((mid) => byId.get(mid)?.name_i18n['en'] ?? null);
    await this.record(actor, 'catalog.categories_reordered', parentId ?? 'root', meta, {
      before: null,
      after: {
        parentId,
        parentName,
        orderedIds: input.orderedIds,
        orderedNames,
        movedIds,
        movedNames,
      },
    });

    // `list` orders by the ltree path (uuid labels); re-sort the affected
    // sibling group by the freshly written `position`.
    const { categories: siblings } = await this.list({ parentId, status: 'active' });
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

    await this.record(actor, 'catalog.category_deleted', id, meta, {
      before: { ...toView(self), parentName: await this.nameOf(self.parent_id) },
      reason: 'soft delete',
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
    await this.record(actor, 'catalog.category_restored', self.id, meta, {
      after: { ...view, parentName: await this.nameOf(view.parentId) },
      reason: `restore (${subtreeIds.length} row${subtreeIds.length === 1 ? '' : 's'})`,
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

  /** Best-effort name lookup for an audit-log snapshot — a category an
   * action *references* (a new parent, a sibling in a reorder) rather than
   * acts on directly, so `record()`'s usual `before`/`after` (the acted-on
   * row's own fields) never carries it. No `deleted_at` filter: the
   * referenced row could itself be archived by the time someone reads the
   * log, and the name at write time is still the correct thing to show —
   * same reasoning every other audit row already snapshots values instead
   * of re-resolving them live. `null` (no id, or a genuinely missing row —
   * shouldn't happen, but this is a display nicety, not load-bearing) just
   * means the id shows with no name alongside it. */
  private async nameOf(id: string | null): Promise<string | null> {
    if (!id) return null;
    const rows = await this.prisma.$queryRawUnsafe<{ name_i18n: Record<string, string> }[]>(
      `SELECT name_i18n FROM catalog.category WHERE id = $1::uuid`,
      id,
    );
    return rows[0]?.name_i18n['en'] ?? null;
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
