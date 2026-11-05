import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { MediaValidationJob } from '@shopnetic/events';
import {
  processMediaValidationJob,
  type StorageValidatorDriver,
} from './media-validation-processor.js';

describe('processMediaValidationJob', () => {
  const fakeJob = (data: MediaValidationJob): Job<MediaValidationJob> =>
    ({
      id: 'job_val_1',
      data,
    }) as object as Job<MediaValidationJob>;

  it('passes validation for valid image magic bytes and does not delete or reject', async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const validator: StorageValidatorDriver = {
      readHeaderBytes: vi.fn().mockResolvedValue(jpegBytes),
      deleteFile: vi.fn().mockResolvedValue(true),
    };
    const prisma = {
      mediaAsset: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const processor = processMediaValidationJob(validator, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_1',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/photo.jpg',
        expectedKind: 'image',
      }),
    );

    expect(result).toEqual({ status: 'valid' });
    expect(validator.readHeaderBytes).toHaveBeenCalledWith(
      'product/11111111-1111-1111-1111-111111111111/photo.jpg',
      64,
    );
    expect(validator.deleteFile).not.toHaveBeenCalled();
    expect(prisma.mediaAsset.update).not.toHaveBeenCalled();
  });

  it('passes validation for valid video magic bytes and does not delete or reject', async () => {
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const validator: StorageValidatorDriver = {
      readHeaderBytes: vi.fn().mockResolvedValue(mp4Bytes),
      deleteFile: vi.fn().mockResolvedValue(true),
    };
    const prisma = {
      mediaAsset: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const processor = processMediaValidationJob(validator, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_video',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/video.mp4',
        expectedKind: 'video',
      }),
    );

    expect(result).toEqual({ status: 'valid' });
    expect(validator.deleteFile).not.toHaveBeenCalled();
    expect(prisma.mediaAsset.update).not.toHaveBeenCalled();
  });

  it('deletes storage object and rejects DB row on invalid magic bytes', async () => {
    const textBytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // 'Hello'
    const validator: StorageValidatorDriver = {
      readHeaderBytes: vi.fn().mockResolvedValue(textBytes),
      deleteFile: vi.fn().mockResolvedValue(true),
    };
    const prisma = {
      mediaAsset: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const processor = processMediaValidationJob(validator, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_bad',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/corrupted.jpg',
        expectedKind: 'image',
      }),
    );

    expect(result).toEqual({ status: 'rejected' });
    expect(validator.deleteFile).toHaveBeenCalledWith(
      'product/11111111-1111-1111-1111-111111111111/corrupted.jpg',
    );
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset_bad' },
      data: { status: 'rejected' },
    });
  });

  it('rejects asset when detected kind mismatches expected kind', async () => {
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const validator: StorageValidatorDriver = {
      readHeaderBytes: vi.fn().mockResolvedValue(mp4Bytes),
      deleteFile: vi.fn().mockResolvedValue(true),
    };
    const prisma = {
      mediaAsset: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const processor = processMediaValidationJob(validator, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_mismatch',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/sneaky.jpg',
        expectedKind: 'image', // Video uploaded as image
      }),
    );

    expect(result).toEqual({ status: 'rejected' });
    expect(validator.deleteFile).toHaveBeenCalledWith(
      'product/11111111-1111-1111-1111-111111111111/sneaky.jpg',
    );
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset_mismatch' },
      data: { status: 'rejected' },
    });
  });

  it('rejects asset when header cannot be read (missing/null)', async () => {
    const validator: StorageValidatorDriver = {
      readHeaderBytes: vi.fn().mockResolvedValue(null),
      deleteFile: vi.fn().mockResolvedValue(true),
    };
    const prisma = {
      mediaAsset: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const processor = processMediaValidationJob(validator, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_missing',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/missing.jpg',
        expectedKind: 'image',
      }),
    );

    expect(result).toEqual({ status: 'rejected' });
    expect(validator.deleteFile).toHaveBeenCalledWith(
      'product/11111111-1111-1111-1111-111111111111/missing.jpg',
    );
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset_missing' },
      data: { status: 'rejected' },
    });
  });
});
