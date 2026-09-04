import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type {
  CategoryOption,
  OptionApplicability,
  PutCategoryOptionRequest,
  ValueSource,
} from '@shopnetic/contracts';
import type { Prisma } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

const withType = { optionType: true } satisfies Prisma.CategoryOptionInclude;
type CategoryOptionRow = Prisma.CategoryOptionGetPayload<{ include: typeof withType }>;

interface Patch {
  applicability?: OptionApplicability;
  isVariantAxis?: boolean;
  valueSource?: ValueSource;
  valueSetId?: string | null;
  priceImpact?: boolean;
  position?: number;
}

/**
 * Per-category option config (plan/26 section 2.1). One row per (category, option type):
 * is the option `required`/`optional`/`not_applicable` here, does a value create a
 * variant (`is_variant_axis`) or just a spec, and where do its values come from
 * (`open` = seller-added, `predefined`/`hybrid` = a managed `value_set`).
 */
@Injectable()
export class CategoryOptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(categoryId: string): Promise<CategoryOption[]> {
    await this.assertCategory(categoryId);
    const rows = await this.prisma.categoryOption.findMany({
      where: { categoryId },
      include: withType,
      orderBy: [{ position: 'asc' }, { optionTypeId: 'asc' }],
    });
    return rows.map(toView);
  }

  async put(
    categoryId: string,
    optionTypeId: string,
    input: PutCategoryOptionRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<CategoryOption> {
    await this.assertCategory(categoryId);
    await this.assertOptionType(optionTypeId);

    const existing = await this.prisma.categoryOption.findUnique({
      where: { categoryId_optionTypeId: { categoryId, optionTypeId } },
    });

    const effSource: ValueSource = input.valueSource ?? existing?.valueSource ?? 'open';
    const effSetId =
      input.valueSetId !== undefined ? input.valueSetId : (existing?.valueSetId ?? null);
    await this.assertSourceAndSet(effSource, effSetId, optionTypeId);

    const patch: Patch = {};
    if (input.applicability !== undefined) patch.applicability = input.applicability;
    if (input.isVariantAxis !== undefined) patch.isVariantAxis = input.isVariantAxis;
    if (input.valueSource !== undefined) patch.valueSource = input.valueSource;
    if (input.valueSetId !== undefined) patch.valueSetId = input.valueSetId;
    if (input.priceImpact !== undefined) patch.priceImpact = input.priceImpact;
    if (input.position !== undefined) patch.position = input.position;

    await this.prisma.$transaction(async (tx) => {
      await tx.categoryOption.upsert({
        where: { categoryId_optionTypeId: { categoryId, optionTypeId } },
        create: { categoryId, optionTypeId, ...patch },
        update: patch,
      });
      await writeCatalogOutbox(
        tx,
        'category_option',
        'category_option.set',
        `${categoryId}:${optionTypeId}`,
        { categoryId, optionTypeId, ...patch },
      );
    });

    const view = await this.rowView(categoryId, optionTypeId);
    await this.record(actor, 'catalog.category_option_set', `${categoryId}:${optionTypeId}`, meta, {
      before: existing ? toRawView(existing, view.optionTypeCode) : null,
      after: view,
    });
    return view;
  }

  async remove(
    categoryId: string,
    optionTypeId: string,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<void> {
    const { count } = await this.prisma.$transaction(async (tx) => {
      const res = await tx.categoryOption.deleteMany({ where: { categoryId, optionTypeId } });
      if (res.count > 0) {
        await writeCatalogOutbox(
          tx,
          'category_option',
          'category_option.removed',
          `${categoryId}:${optionTypeId}`,
          { categoryId, optionTypeId },
        );
      }
      return res;
    });
    if (count === 0) {
      throw new AppError('NOT_FOUND', 404, {
        detail: 'this option is not configured on the category',
      });
    }
    await this.record(
      actor,
      'catalog.category_option_removed',
      `${categoryId}:${optionTypeId}`,
      meta,
      { before: { categoryId, optionTypeId }, reason: 'removed' },
    );
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async assertCategory(id: string): Promise<void> {
    const row = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'category not found' });
  }

  private async assertOptionType(id: string): Promise<void> {
    const row = await this.prisma.optionType.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!row) {
      throw new AppError('CATEGORY_OPTION_INVALID', 422, { detail: 'option type not found' });
    }
  }

  private async assertSourceAndSet(
    source: ValueSource,
    valueSetId: string | null,
    optionTypeId: string,
  ): Promise<void> {
    if (source === 'open' && valueSetId !== null) {
      throw new AppError('CATEGORY_OPTION_INVALID', 422, {
        detail: 'an "open" value source takes no value set',
      });
    }
    if (source !== 'open' && valueSetId === null) {
      throw new AppError('CATEGORY_OPTION_INVALID', 422, {
        detail: `value source "${source}" requires a value set`,
      });
    }
    if (valueSetId === null) return;

    const set = await this.prisma.valueSet.findUnique({
      where: { id: valueSetId },
      include: { items: { include: { optionValue: { select: { optionTypeId: true } } } } },
    });
    if (!set) {
      throw new AppError('CATEGORY_OPTION_INVALID', 422, { detail: 'value set not found' });
    }
    if (set.items.some((i) => i.optionValue.optionTypeId !== optionTypeId)) {
      throw new AppError('VALUE_SET_TYPE_MISMATCH', 422, {
        detail: 'the value set contains values of another option type',
      });
    }
  }

  private async rowView(categoryId: string, optionTypeId: string): Promise<CategoryOption> {
    const row = await this.prisma.categoryOption.findUnique({
      where: { categoryId_optionTypeId: { categoryId, optionTypeId } },
      include: withType,
    });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'category option not found' });
    return toView(row);
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
      targetType: 'category_option',
      targetId,
      ...(extra.before !== undefined ? { before: extra.before } : {}),
      ...(extra.after !== undefined ? { after: extra.after } : {}),
      ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
      ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    });
  }
}

function toView(row: CategoryOptionRow): CategoryOption {
  return { ...toRawView(row, row.optionType.code) };
}

function toRawView(
  row: Omit<CategoryOptionRow, 'optionType'>,
  optionTypeCode: string,
): CategoryOption {
  return {
    categoryId: row.categoryId,
    optionTypeId: row.optionTypeId,
    optionTypeCode,
    applicability: row.applicability,
    isVariantAxis: row.isVariantAxis,
    valueSource: row.valueSource,
    valueSetId: row.valueSetId,
    priceImpact: row.priceImpact,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
