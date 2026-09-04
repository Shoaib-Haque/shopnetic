import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type {
  CreateMediaRequest,
  MediaAsset,
  MediaOwnerType,
  UpdateMediaRequest,
} from '@shopnetic/contracts';
import { Prisma } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

const withTags = {
  tags: {
    include: { optionValue: { select: { code: true, optionType: { select: { code: true } } } } },
  },
} satisfies Prisma.MediaAssetInclude;
type MediaRow = Prisma.MediaAssetGetPayload<{ include: typeof withTags }>;

/**
 * Photos + videos for the catalog (plan/26 §5). Only `product`-owned media is
 * writable now; `offer`-owned media waits for the inventory context. Tagging an
 * asset to option values drives the per-variant PDP gallery.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForOwner(ownerType: MediaOwnerType, ownerId: string): Promise<MediaAsset[]> {
    await this.assertOwner(ownerType, ownerId);
    const rows = await this.prisma.mediaAsset.findMany({
      where: { ownerType, ownerId },
      include: withTags,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toView);
  }

  async get(id: string): Promise<MediaAsset> {
    return toView(await this.rowOrThrow(id));
  }

  async create(
    ownerType: MediaOwnerType,
    ownerId: string,
    input: CreateMediaRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<MediaAsset> {
    await this.assertOwner(ownerType, ownerId);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.mediaAsset.create({
        data: {
          ownerType,
          ownerId,
          kind: input.kind,
          fileKey: input.fileKey,
          ...(input.posterKey != null ? { posterKey: input.posterKey } : {}),
          ...(input.width != null ? { width: input.width } : {}),
          ...(input.height != null ? { height: input.height } : {}),
          ...(input.durationS != null ? { durationS: input.durationS } : {}),
          ...(input.blurhash != null ? { blurhash: input.blurhash } : {}),
          ...(input.alt ? { altI18n: input.alt } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        include: withTags,
      });
      await writeCatalogOutbox(tx, 'media_asset', 'media.created', row.id, {
        id: row.id,
        ownerType,
        ownerId,
        kind: row.kind,
      });
      return row;
    });

    await this.record(actor, 'catalog.media_created', created.id, meta, { after: toView(created) });
    return toView(created);
  }

  async update(
    id: string,
    input: UpdateMediaRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<MediaAsset> {
    const current = await this.rowOrThrow(id);

    const data: Prisma.MediaAssetUpdateInput = {};
    if (input.fileKey !== undefined) data.fileKey = input.fileKey;
    if (input.posterKey !== undefined) data.posterKey = input.posterKey;
    if (input.width !== undefined) data.width = input.width;
    if (input.height !== undefined) data.height = input.height;
    if (input.durationS !== undefined) data.durationS = input.durationS;
    if (input.blurhash !== undefined) data.blurhash = input.blurhash;
    if (input.alt !== undefined) data.altI18n = input.alt === null ? Prisma.DbNull : input.alt;
    if (input.position !== undefined) data.position = input.position;
    if (input.status !== undefined) data.status = input.status;

    await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.update({ where: { id }, data });
      await writeCatalogOutbox(tx, 'media_asset', 'media.updated', id, {
        id,
        fields: Object.keys(data),
      });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.media_updated', id, meta, {
      before: toView(current),
      after: view,
    });
    return view;
  }

  async remove(id: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const current = await this.rowOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.delete({ where: { id } });
      await writeCatalogOutbox(tx, 'media_asset', 'media.deleted', id, { id });
    });
    await this.record(actor, 'catalog.media_deleted', id, meta, {
      before: toView(current),
      reason: 'deleted',
    });
  }

  async putTag(
    id: string,
    optionTypeId: string,
    optionValueId: string,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<MediaAsset> {
    await this.rowOrThrow(id);
    const value = await this.prisma.optionValue.findFirst({
      where: { id: optionValueId, optionTypeId },
      select: { id: true },
    });
    if (!value) {
      throw new AppError('MEDIA_TAG_INVALID', 422, {
        detail: 'value does not belong to this option type',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.mediaOptionTag.upsert({
        where: { mediaAssetId_optionTypeId: { mediaAssetId: id, optionTypeId } },
        update: { optionValueId },
        create: { mediaAssetId: id, optionTypeId, optionValueId },
      });
      await writeCatalogOutbox(tx, 'media_asset', 'media.updated', id, {
        id,
        taggedAxis: optionTypeId,
      });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.media_updated', id, meta, {
      after: { tag: { optionTypeId, optionValueId } },
    });
    return view;
  }

  async removeTag(
    id: string,
    optionTypeId: string,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<void> {
    await this.rowOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.mediaOptionTag.deleteMany({
        where: { mediaAssetId: id, optionTypeId },
      });
      if (count === 0) throw new AppError('NOT_FOUND', 404, { detail: 'tag not found' });
      await writeCatalogOutbox(tx, 'media_asset', 'media.updated', id, {
        id,
        untaggedAxis: optionTypeId,
      });
    });
    await this.record(actor, 'catalog.media_updated', id, meta, {
      before: { untaggedAxis: optionTypeId },
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async rowOrThrow(id: string): Promise<MediaRow> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id }, include: withTags });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'media asset not found' });
    return row;
  }

  private async assertOwner(ownerType: MediaOwnerType, ownerId: string): Promise<void> {
    if (ownerType === 'offer') {
      throw new AppError('VALIDATION_ERROR', 422, {
        detail: 'offer-owned media is not supported until the inventory context exists',
      });
    }
    const product = await this.prisma.product.findFirst({
      where: { id: ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new AppError('NOT_FOUND', 404, { detail: 'product not found' });
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
      targetType: 'media_asset',
      targetId,
      ...(extra.before !== undefined ? { before: extra.before } : {}),
      ...(extra.after !== undefined ? { after: extra.after } : {}),
      ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
      ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    });
  }
}

function toView(row: MediaRow): MediaAsset {
  return {
    id: row.id,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    kind: row.kind,
    fileKey: row.fileKey,
    posterKey: row.posterKey,
    width: row.width,
    height: row.height,
    durationS: row.durationS,
    blurhash: row.blurhash,
    alt: (row.altI18n as Record<string, string> | null) ?? null,
    position: row.position,
    status: row.status,
    tags: [...row.tags]
      .sort((a, b) => a.optionTypeId.localeCompare(b.optionTypeId))
      .map((tag) => ({
        optionTypeId: tag.optionTypeId,
        optionTypeCode: tag.optionValue.optionType.code,
        optionValueId: tag.optionValueId,
        code: tag.optionValue.code,
      })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
