import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import type { ImageVariantJob } from '@shopnetic/events';
import {
  processImageVariantJob,
  type ImageVariantStorageDriver,
} from './image-variant-processor.js';
import { RESPONSIVE_IMAGE_WIDTHS } from '@shopnetic/contracts';

describe('processImageVariantJob', () => {
  const fakeJob = (data: ImageVariantJob): Job<ImageVariantJob> =>
    ({
      id: 'job_var_1',
      data,
    }) as object as Job<ImageVariantJob>;

  it('generates 18 variants, saves each file, and updates mediaAsset.variants in database', async () => {
    const testImage = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 50, g: 150, b: 250 },
      },
    })
      .jpeg()
      .toBuffer();

    const savedFiles: Record<string, { data: Buffer; contentType: string }> = {};
    const storage: ImageVariantStorageDriver = {
      readBuffer: vi.fn().mockResolvedValue(testImage),
      saveFile: vi.fn().mockImplementation((key, data, contentType) => {
        savedFiles[key] = { data, contentType };
        return Promise.resolve(true);
      }),
    };

    let updatedData: unknown = null;
    const fixedUpdatedAt = new Date('2026-11-06T11:42:16.842Z');
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn().mockResolvedValue({ updatedAt: fixedUpdatedAt }),
        update: vi.fn().mockImplementation(({ data }) => {
          updatedData = data;
          return Promise.resolve({});
        }),
      },
    };

    const processor = processImageVariantJob(storage, prisma, 'https://cdn.shopnetic.com');
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_test_1',
        fileKey: 'product/018f23c0-0000-7000-8000-000000000001/1700000000-abcd-test.jpg',
      }),
    );

    expect(result).toEqual({ status: 'generated' });
    expect(storage.readBuffer).toHaveBeenCalledWith(
      'product/018f23c0-0000-7000-8000-000000000001/1700000000-abcd-test.jpg',
    );
    // 6 widths * 3 formats = 18 files saved
    expect(storage.saveFile).toHaveBeenCalledTimes(18);
    expect(Object.keys(savedFiles)).toHaveLength(18);

    expect(prisma.mediaAsset.findUnique).toHaveBeenCalledWith({
      where: { id: 'asset_test_1' },
      select: { updatedAt: true },
    });
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset_test_1' },
      data: expect.objectContaining({
        variants: expect.any(Object),
        updatedAt: fixedUpdatedAt,
      }),
    });

    const variants = (updatedData as { variants: Record<string, Record<string, { url: string }>> })
      .variants;
    for (const w of RESPONSIVE_IMAGE_WIDTHS) {
      const wStr = String(w);
      expect(variants[wStr]).toBeDefined();
      expect(variants[wStr]?.avif?.url).toContain('.avif');
      expect(variants[wStr]?.webp?.url).toContain('.webp');
      expect(variants[wStr]?.jpeg?.url).toContain('.jpg');
    }
  }, 15000);

  it('returns status failed if source buffer cannot be read', async () => {
    const storage: ImageVariantStorageDriver = {
      readBuffer: vi.fn().mockResolvedValue(null),
      saveFile: vi.fn(),
    };
    const prisma = {
      mediaAsset: {
        update: vi.fn(),
      },
    };

    const processor = processImageVariantJob(storage, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_missing',
        fileKey: 'product/p1/missing.jpg',
      }),
    );

    expect(result).toEqual({ status: 'failed' });
    expect(storage.saveFile).not.toHaveBeenCalled();
    expect(prisma.mediaAsset.update).not.toHaveBeenCalled();
  });

  it('omits updatedAt from update when findUnique returns null', async () => {
    const testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();

    const storage: ImageVariantStorageDriver = {
      readBuffer: vi.fn().mockResolvedValue(testImage),
      saveFile: vi.fn().mockResolvedValue(true),
    };

    let updatedPayload: Record<string, unknown> | null = null;
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockImplementation(({ data }) => {
          updatedPayload = data;
          return Promise.resolve({});
        }),
      },
    };

    const processor = processImageVariantJob(storage, prisma);
    const result = await processor(
      fakeJob({
        mediaAssetId: 'asset_no_existing',
        fileKey: 'product/p1/test.jpg',
      }),
    );

    expect(result).toEqual({ status: 'generated' });
    expect(updatedPayload).toBeDefined();
    expect(updatedPayload).toHaveProperty('variants');
    expect(updatedPayload).not.toHaveProperty('updatedAt');
  });
});
