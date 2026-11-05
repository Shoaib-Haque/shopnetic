import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { ApiEnv } from '../config/env.js';
import type { MediaValidationQueueService } from '../queue/media-validation-queue.service.js';
import { MediaService } from './media.service.js';
import type { Actor } from '@shopnetic/auth';

describe('MediaService', () => {
  const actor: Actor = {
    plane: 'staff',
    accountId: 'staff_1',
    grants: [],
  };
  const meta = { correlationId: 'corr_1', ip: '127.0.0.1', userAgent: 'test' };

  it('enqueues media validation job when STORAGE_PROVIDER is s3 and key is internal', async () => {
    const createdRow = {
      id: 'asset_s3_1',
      ownerType: 'product',
      ownerId: '11111111-1111-1111-1111-111111111111',
      kind: 'image',
      fileKey: 'product/11111111-1111-1111-1111-111111111111/123-photo.jpg',
      posterKey: null,
      width: null,
      height: null,
      durationS: null,
      blurhash: null,
      altI18n: null,
      position: 0,
      status: 'active',
      tags: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    const prismaMock = {
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: '11111111-1111-1111-1111-111111111111',
          status: 'active',
          deletedAt: null,
        }),
      },
      mediaAsset: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdRow),
      },
      catalogOutbox: {
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => cb(prismaMock)),
    } as object as PrismaService;

    const auditMock = {
      record: vi.fn().mockResolvedValue(undefined),
    } as object as AuditService;

    const envMock = {
      STORAGE_PROVIDER: 's3',
    } as ApiEnv;

    const validationQueueMock = {
      enqueueValidation: vi.fn().mockResolvedValue(undefined),
    } as object as MediaValidationQueueService;

    const service = new MediaService(
      prismaMock,
      auditMock,
      envMock,
      undefined,
      validationQueueMock,
    );

    const result = await service.create(
      'product',
      '11111111-1111-1111-1111-111111111111',
      {
        kind: 'image',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/123-photo.jpg',
      },
      actor,
      meta,
    );

    expect(result.id).toBe('asset_s3_1');
    expect(validationQueueMock.enqueueValidation).toHaveBeenCalledWith({
      mediaAssetId: 'asset_s3_1',
      fileKey: 'product/11111111-1111-1111-1111-111111111111/123-photo.jpg',
      expectedKind: 'image',
    });
  });

  it('does not enqueue media validation when STORAGE_PROVIDER is local', async () => {
    const createdRow = {
      id: 'asset_local_1',
      ownerType: 'product',
      ownerId: '11111111-1111-1111-1111-111111111111',
      kind: 'image',
      fileKey: 'product/11111111-1111-1111-1111-111111111111/123-photo.jpg',
      posterKey: null,
      width: null,
      height: null,
      durationS: null,
      blurhash: null,
      altI18n: null,
      position: 0,
      status: 'active',
      tags: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    const prismaMock = {
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: '11111111-1111-1111-1111-111111111111',
          status: 'active',
          deletedAt: null,
        }),
      },
      mediaAsset: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdRow),
      },
      catalogOutbox: {
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => cb(prismaMock)),
    } as object as PrismaService;

    const auditMock = {
      record: vi.fn().mockResolvedValue(undefined),
    } as object as AuditService;

    const envMock = {
      STORAGE_PROVIDER: 'local',
    } as ApiEnv;

    const validationQueueMock = {
      enqueueValidation: vi.fn().mockResolvedValue(undefined),
    } as object as MediaValidationQueueService;

    const service = new MediaService(
      prismaMock,
      auditMock,
      envMock,
      undefined,
      validationQueueMock,
    );

    await service.create(
      'product',
      '11111111-1111-1111-1111-111111111111',
      {
        kind: 'image',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/123-photo.jpg',
      },
      actor,
      meta,
    );

    expect(validationQueueMock.enqueueValidation).not.toHaveBeenCalled();
  });
});
