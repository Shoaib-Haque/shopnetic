import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import {
  createMediaRequestSchema,
  updateMediaRequestSchema,
  resolveMediaUrl,
  type CreateMediaRequest,
  type MediaAsset,
  type MediaOwnerType,
  type UpdateMediaRequest,
} from '@shopnetic/contracts';
import { Prisma } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { auditRecordFor } from '../audit/audit-record-for.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { StorageService, isInternalStorageKey } from '../storage/storage.service.js';
import { MediaValidationQueueService } from '../queue/media-validation-queue.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

const withTags = {
  tags: {
    include: { optionValue: { select: { code: true, optionType: { select: { code: true } } } } },
  },
} satisfies Prisma.MediaAssetInclude;
type MediaRow = Prisma.MediaAssetGetPayload<{ include: typeof withTags }>;

/**
 * Photos + videos for the catalog (plan/26 section 5). Only `product`-owned media is
 * writable now; `offer`-owned media waits for the inventory context. Tagging an
 * asset to option values drives the per-variant PDP gallery.
 */
@Injectable()
export class MediaService {
  private readonly record: ReturnType<typeof auditRecordFor>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() @Inject(API_ENV) private readonly env?: ApiEnv,
    @Optional() private readonly storage?: StorageService,
    @Optional() private readonly validationQueue?: MediaValidationQueueService,
  ) {
    this.record = auditRecordFor(this.audit, 'media_asset');
  }

  async listForOwner(ownerType: MediaOwnerType, ownerId: string): Promise<MediaAsset[]> {
    await this.assertOwner(ownerType, ownerId, true);
    const rows = await this.prisma.mediaAsset.findMany({
      where: { ownerType, ownerId },
      include: withTags,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async get(id: string): Promise<MediaAsset> {
    return this.toView(await this.rowOrThrow(id));
  }

  async create(
    ownerType: MediaOwnerType,
    ownerId: string,
    input: CreateMediaRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<MediaAsset> {
    const parseRes = createMediaRequestSchema.safeParse(input);
    if (!parseRes.success) {
      throw AppError.validation(
        parseRes.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(body)',
          rule: issue.code,
          message: `errors.field.${issue.code}`,
        })),
        'media input failed schema validation',
      );
    }
    const valid = parseRes.data;
    await this.assertOwner(ownerType, ownerId);

    let created: MediaRow;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        let position = valid.position;
        if (position === undefined) {
          const last = await tx.mediaAsset.findFirst({
            where: { ownerType, ownerId },
            orderBy: { position: 'desc' },
            select: { position: true },
          });
          position = last ? last.position + 1 : 0;
        }

        const row = await tx.mediaAsset.create({
          data: {
            ownerType,
            ownerId,
            kind: valid.kind,
            fileKey: valid.fileKey,
            position,
            ...(valid.posterKey != null ? { posterKey: valid.posterKey } : {}),
            ...(valid.width != null ? { width: valid.width } : {}),
            ...(valid.height != null ? { height: valid.height } : {}),
            ...(valid.durationS != null ? { durationS: valid.durationS } : {}),
            ...(valid.blurhash != null ? { blurhash: valid.blurhash } : {}),
            ...(valid.alt ? { altI18n: valid.alt } : {}),
            ...(valid.status ? { status: valid.status } : {}),
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
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('MEDIA_FILE_KEY_CONFLICT', 409, {
          detail: 'a media asset with this file key already exists for this owner',
        });
      }
      throw err;
    }

    if (this.env?.STORAGE_PROVIDER === 's3' && isInternalStorageKey(created.fileKey)) {
      await this.validationQueue?.enqueueValidation({
        mediaAssetId: created.id,
        fileKey: created.fileKey,
        expectedKind: created.kind,
      });
    }

    await this.record(actor, 'catalog.media_created', created.id, meta, {
      after: this.toView(created),
    });
    return this.toView(created);
  }

  async update(
    id: string,
    input: UpdateMediaRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<MediaAsset> {
    const parseRes = updateMediaRequestSchema.safeParse(input);
    if (!parseRes.success) {
      throw AppError.validation(
        parseRes.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(body)',
          rule: issue.code,
          message: `errors.field.${issue.code}`,
        })),
        'media input failed schema validation',
      );
    }
    const valid = parseRes.data;
    const current = await this.rowOrThrow(id);
    await this.assertOwner(current.ownerType, current.ownerId);

    if (
      valid.expectedUpdatedAt !== undefined &&
      valid.expectedUpdatedAt !== current.updatedAt.toISOString()
    ) {
      throw new AppError('CONFLICT', 409, {
        detail: 'media asset was modified concurrently; reload and try again',
      });
    }

    const data: Prisma.MediaAssetUpdateInput = {};
    if (valid.fileKey !== undefined) data.fileKey = valid.fileKey;
    if (valid.posterKey !== undefined) data.posterKey = valid.posterKey;
    if (valid.width !== undefined) data.width = valid.width;
    if (valid.height !== undefined) data.height = valid.height;
    if (valid.durationS !== undefined) data.durationS = valid.durationS;
    if (valid.blurhash !== undefined) data.blurhash = valid.blurhash;
    if (valid.alt !== undefined) data.altI18n = valid.alt === null ? Prisma.DbNull : valid.alt;
    if (valid.position !== undefined) data.position = valid.position;
    if (valid.status !== undefined) data.status = valid.status;

    const keysToDelete: string[] = [];
    if (valid.fileKey !== undefined && valid.fileKey !== current.fileKey) {
      keysToDelete.push(current.fileKey);
    }
    if (
      valid.posterKey !== undefined &&
      valid.posterKey !== current.posterKey &&
      current.posterKey
    ) {
      keysToDelete.push(current.posterKey);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.mediaAsset.update({ where: { id }, data });
        await writeCatalogOutbox(tx, 'media_asset', 'media.updated', id, {
          id,
          fields: Object.keys(data),
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('MEDIA_FILE_KEY_CONFLICT', 409, {
          detail: 'a media asset with this file key already exists for this owner',
        });
      }
      throw err;
    }

    if (this.storage && keysToDelete.length > 0) {
      await Promise.allSettled(keysToDelete.map((k) => this.storage!.deleteFile(k)));
    }

    const view = await this.get(id);
    await this.record(actor, 'catalog.media_updated', id, meta, {
      before: this.toView(current),
      after: view,
    });
    return view;
  }

  async remove(id: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const current = await this.rowOrThrow(id);
    await this.assertOwner(current.ownerType, current.ownerId);
    await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.delete({ where: { id } });
      await writeCatalogOutbox(tx, 'media_asset', 'media.deleted', id, { id });
    });
    if (this.storage) {
      await Promise.allSettled([
        this.storage.deleteFile(current.fileKey),
        current.posterKey ? this.storage.deleteFile(current.posterKey) : Promise.resolve(),
      ]);
    }
    await this.record(actor, 'catalog.media_deleted', id, meta, {
      before: this.toView(current),
      reason: 'deleted',
    });
  }

  async reorder(
    ownerType: MediaOwnerType,
    ownerId: string,
    assetIds: string[],
    actor: Actor,
    meta: RequestMeta,
  ): Promise<MediaAsset[]> {
    await this.assertOwner(ownerType, ownerId);

    const uniqueIds = new Set(assetIds);
    if (uniqueIds.size !== assetIds.length) {
      throw new AppError('VALIDATION_ERROR', 422, {
        detail: 'duplicate asset IDs in reorder request',
      });
    }

    const existing = await this.prisma.mediaAsset.findMany({
      where: { ownerType, ownerId, id: { in: assetIds } },
      select: { id: true },
    });
    if (existing.length !== assetIds.length) {
      throw new AppError('NOT_FOUND', 404, {
        detail: 'one or more media assets not found or belong to another owner',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < assetIds.length; i++) {
        const id = assetIds[i];
        if (!id) continue;
        await tx.mediaAsset.update({
          where: { id },
          data: { position: i },
        });
      }
      await writeCatalogOutbox(tx, 'media_asset', 'media.reordered', ownerId, {
        ownerType,
        ownerId,
        count: assetIds.length,
      });
    });

    await this.record(actor, 'catalog.media_reordered', ownerId, meta, {
      after: {
        count: assetIds.length,
        assetIds,
      },
    });

    return this.listForOwner(ownerType, ownerId);
  }

  async putTag(
    id: string,
    optionTypeId: string,
    optionValueId: string,
    actor: Actor,
    meta: RequestMeta,
    expectedUpdatedAt?: string,
  ): Promise<MediaAsset> {
    const row = await this.rowOrThrow(id);
    await this.assertOwner(row.ownerType, row.ownerId);

    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== row.updatedAt.toISOString()) {
      throw new AppError('CONFLICT', 409, {
        detail: 'media asset was modified concurrently; reload and try again',
      });
    }
    const value = await this.prisma.optionValue.findFirst({
      where: { id: optionValueId, optionTypeId },
      select: { id: true, code: true, optionType: { select: { code: true } } },
    });
    if (!value) {
      throw new AppError('MEDIA_TAG_INVALID', 422, {
        detail: 'value does not belong to this option type',
      });
    }

    if (row.ownerType === 'product') {
      const configured = await this.prisma.productOptionValue.findUnique({
        where: {
          productId_optionTypeId_optionValueId: {
            productId: row.ownerId,
            optionTypeId,
            optionValueId,
          },
        },
        select: { optionValueId: true },
      });
      if (!configured) {
        throw new AppError('MEDIA_TAG_INVALID', 422, {
          detail: 'option value is not configured for this product',
        });
      }
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
    // `value` (the existence check above) already carries both codes once
    // widened past a bare `id: true` select — free.
    await this.record(actor, 'catalog.media_updated', id, meta, {
      after: {
        tag: {
          optionTypeId,
          optionTypeCode: value.optionType.code,
          optionValueId,
          optionValueCode: value.code,
        },
      },
    });
    return view;
  }

  async removeTag(
    id: string,
    optionTypeId: string,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<void> {
    const row = await this.rowOrThrow(id);
    await this.assertOwner(row.ownerType, row.ownerId);
    // best-effort, for the audit snapshot below — this method never
    // otherwise needs the option type's own row
    const optionType = await this.prisma.optionType.findUnique({
      where: { id: optionTypeId },
      select: { code: true },
    });
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
      before: { untaggedAxis: optionTypeId, untaggedAxisCode: optionType?.code ?? null },
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async rowOrThrow(id: string): Promise<MediaRow> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id }, include: withTags });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'media asset not found' });
    return row;
  }

  private async assertOwner(
    ownerType: MediaOwnerType,
    ownerId: string,
    allowArchived = false,
  ): Promise<void> {
    if (ownerType === 'offer') {
      throw new AppError('VALIDATION_ERROR', 422, {
        detail: 'offer-owned media is not supported until the inventory context exists',
      });
    }
    const product = await this.prisma.product.findFirst({
      where: allowArchived ? { id: ownerId } : { id: ownerId, deletedAt: null },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!product) throw new AppError('NOT_FOUND', 404, { detail: 'product not found' });
    if (!allowArchived && (product.deletedAt || product.status === 'archived')) {
      throw new AppError('PRODUCT_PARENT_ARCHIVED', 409, {
        detail: 'cannot modify media on an archived product',
      });
    }
    if (!allowArchived && product.status === 'pending') {
      throw new AppError('PRODUCT_IN_REVIEW', 409, {
        detail: 'cannot modify media on a pending product',
      });
    }
  }

  private toView(row: MediaRow): MediaAsset {
    const baseUrl = this.env?.STORAGE_PUBLIC_BASE_URL;
    return {
      id: row.id,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      kind: row.kind,
      fileKey: row.fileKey,
      url: resolveMediaUrl(row.fileKey, baseUrl),
      posterKey: row.posterKey,
      posterUrl: row.posterKey ? resolveMediaUrl(row.posterKey, baseUrl) : null,
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
}
