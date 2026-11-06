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
      probeDuration: vi.fn().mockResolvedValue(30),
    };
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn().mockResolvedValue({ durationS: 30 }),
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

  it('rejects video and deletes storage object when duration exceeds 120 seconds', async () => {
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const validator: StorageValidatorDriver = {
      readHeaderBytes: vi.fn().mockResolvedValue(mp4Bytes),
      deleteFile: vi.fn().mockResolvedValue(true),
      probeDuration: vi.fn().mockResolvedValue(125),
    };
    const prisma = {
      mediaAsset: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const processor = processMediaValidationJob(validator, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_too_long',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/long-video.mp4',
        expectedKind: 'video',
      }),
    );

    expect(result).toEqual({ status: 'rejected' });
    expect(validator.deleteFile).toHaveBeenCalledWith(
      'product/11111111-1111-1111-1111-111111111111/long-video.mp4',
    );
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset_too_long' },
      data: { status: 'rejected' },
    });
  });

  it('rejects video exceeding 120s even with fractional duration (e.g. 120.4 seconds)', async () => {
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const validator: StorageValidatorDriver = {
      readHeaderBytes: vi.fn().mockResolvedValue(mp4Bytes),
      deleteFile: vi.fn().mockResolvedValue(true),
      probeDuration: vi.fn().mockResolvedValue(120.4),
    };
    const prisma = {
      mediaAsset: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const processor = processMediaValidationJob(validator, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_fractional_long',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/fractional-long.mp4',
        expectedKind: 'video',
      }),
    );

    expect(result).toEqual({ status: 'rejected' });
    expect(validator.deleteFile).toHaveBeenCalledWith(
      'product/11111111-1111-1111-1111-111111111111/fractional-long.mp4',
    );
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset_fractional_long' },
      data: { status: 'rejected' },
    });
  });

  it('rejects video and deletes storage object when duration probe returns null (corrupted video)', async () => {
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const validator: StorageValidatorDriver = {
      readHeaderBytes: vi.fn().mockResolvedValue(mp4Bytes),
      deleteFile: vi.fn().mockResolvedValue(true),
      probeDuration: vi.fn().mockResolvedValue(null),
    };
    const prisma = {
      mediaAsset: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const processor = processMediaValidationJob(validator, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_corrupt_vid',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/corrupt.mp4',
        expectedKind: 'video',
      }),
    );

    expect(result).toEqual({ status: 'rejected' });
    expect(validator.deleteFile).toHaveBeenCalledWith(
      'product/11111111-1111-1111-1111-111111111111/corrupt.mp4',
    );
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset_corrupt_vid' },
      data: { status: 'rejected' },
    });
  });

  it('updates MediaAsset.durationS with probed duration when durationS is unset', async () => {
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const validator: StorageValidatorDriver = {
      readHeaderBytes: vi.fn().mockResolvedValue(mp4Bytes),
      deleteFile: vi.fn().mockResolvedValue(true),
      probeDuration: vi.fn().mockResolvedValue(45),
    };
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn().mockResolvedValue({ durationS: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const processor = processMediaValidationJob(validator, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_unset_duration',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/video.mp4',
        expectedKind: 'video',
      }),
    );

    expect(result).toEqual({ status: 'valid' });
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset_unset_duration' },
      data: { durationS: 45 },
    });
  });

  it('updates MediaAsset.durationS with rounded integer when probed duration is fractional', async () => {
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const validator: StorageValidatorDriver = {
      readHeaderBytes: vi.fn().mockResolvedValue(mp4Bytes),
      deleteFile: vi.fn().mockResolvedValue(true),
      probeDuration: vi.fn().mockResolvedValue(45.6),
    };
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn().mockResolvedValue({ durationS: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const processor = processMediaValidationJob(validator, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_unset_duration_frac',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/video.mp4',
        expectedKind: 'video',
      }),
    );

    expect(result).toEqual({ status: 'valid' });
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset_unset_duration_frac' },
      data: { durationS: 46 },
    });
  });

  it('generates poster candidates when posterCandidates is empty', async () => {
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const candKeys = [
      'product/1/vid-poster-cand-1.jpg',
      'product/1/vid-poster-cand-2.jpg',
      'product/1/vid-poster-cand-3.jpg',
    ];
    const validator: StorageValidatorDriver = {
      readHeaderBytes: vi.fn().mockResolvedValue(mp4Bytes),
      deleteFile: vi.fn().mockResolvedValue(true),
      probeDuration: vi.fn().mockResolvedValue(30),
      generatePosterCandidates: vi.fn().mockResolvedValue(candKeys),
    };
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn().mockResolvedValue({ durationS: 30, posterCandidates: [] }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const processor = processMediaValidationJob(validator, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_cand_test',
        fileKey: 'product/1/vid.mp4',
        expectedKind: 'video',
      }),
    );

    expect(result).toEqual({ status: 'valid' });
    expect(validator.generatePosterCandidates).toHaveBeenCalledWith('product/1/vid.mp4', 30);
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset_cand_test' },
      data: { posterCandidates: candKeys },
    });
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
