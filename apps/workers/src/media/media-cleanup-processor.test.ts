import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { MediaSweepJob } from '@shopnetic/events';
import {
  isInternalStorageKey,
  processMediaCleanupJob,
  type MediaAssetDbClient,
  type StorageCleanerDriver,
} from './media-cleanup-processor.js';

describe('media-cleanup-processor', () => {
  describe('isInternalStorageKey', () => {
    it('accepts valid internal storage keys', () => {
      expect(
        isInternalStorageKey('product/11111111-1111-1111-1111-111111111111/123-photo.png'),
      ).toBe(true);
      expect(isInternalStorageKey('variant/22222222-2222-2222-2222-222222222222/video.mp4')).toBe(
        true,
      );
    });

    it('rejects external URLs and invalid strings', () => {
      expect(isInternalStorageKey('https://example.com/photo.jpg')).toBe(false);
      expect(isInternalStorageKey('http://localhost:4000/uploads/file.png')).toBe(false);
      expect(isInternalStorageKey('//cdn.example.com/asset.webp')).toBe(false);
      expect(isInternalStorageKey('')).toBe(false);
      expect(isInternalStorageKey('random-file.jpg')).toBe(false);
    });
  });

  describe('processMediaCleanupJob', () => {
    it('ignores files that are newer than grace period', async () => {
      const now = Date.now();
      const mockDriver: StorageCleanerDriver = {
        listInternalFiles: vi.fn().mockResolvedValue([
          {
            key: 'product/11111111-1111-1111-1111-111111111111/new-file.jpg',
            lastModified: new Date(now - 1000 * 60 * 30), // 30 mins ago
          },
        ]),
        deleteFile: vi.fn().mockResolvedValue(true),
      };

      const mockPrisma: MediaAssetDbClient = {
        mediaAsset: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const processor = processMediaCleanupJob(mockDriver, mockPrisma);
      const job = { data: { gracePeriodMs: 3_600_000 } } as Job<MediaSweepJob>;

      const result = await processor(job);

      expect(result).toEqual({ scanned: 1, candidateCount: 0, deletedCount: 0 });
      expect(mockPrisma.mediaAsset.findMany).not.toHaveBeenCalled();
      expect(mockDriver.deleteFile).not.toHaveBeenCalled();
    });

    it('retains files referenced as fileKey or posterKey, deletes true orphans', async () => {
      const now = Date.now();
      const twoHoursAgo = new Date(now - 1000 * 60 * 120);

      const activeFile = 'product/11111111-1111-1111-1111-111111111111/active.jpg';
      const posterFile = 'product/11111111-1111-1111-1111-111111111111/poster.webp';
      const orphanFile = 'product/11111111-1111-1111-1111-111111111111/abandoned.png';

      const mockDriver: StorageCleanerDriver = {
        listInternalFiles: vi.fn().mockResolvedValue([
          { key: activeFile, lastModified: twoHoursAgo },
          { key: posterFile, lastModified: twoHoursAgo },
          { key: orphanFile, lastModified: twoHoursAgo },
        ]),
        deleteFile: vi.fn().mockResolvedValue(true),
      };

      const mockPrisma: MediaAssetDbClient = {
        mediaAsset: {
          findMany: vi.fn().mockResolvedValue([{ fileKey: activeFile, posterKey: posterFile }]),
        },
      };

      const processor = processMediaCleanupJob(mockDriver, mockPrisma);
      const job = { data: { gracePeriodMs: 3_600_000 } } as Job<MediaSweepJob>;

      const result = await processor(job);

      expect(result).toEqual({ scanned: 3, candidateCount: 3, deletedCount: 1 });
      expect(mockDriver.deleteFile).toHaveBeenCalledTimes(1);
      expect(mockDriver.deleteFile).toHaveBeenCalledWith(orphanFile);
    });
  });
});
