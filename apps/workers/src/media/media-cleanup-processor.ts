import { existsSync } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { Job } from 'bullmq';
import type { MediaSweepJob } from '@shopnetic/events';
import { extractVariantKeys, isInternalStorageKey } from '@shopnetic/contracts';
import { createLogger } from '@shopnetic/observability';
import type { WorkersEnv } from '../config/env.js';

const log = createLogger({ service: 'media-cleanup' });

export { isInternalStorageKey };

export interface StorageCleanerDriver {
  listInternalFiles(): Promise<Array<{ key: string; lastModified: Date }>>;
  deleteFile(key: string): Promise<boolean>;
}

export function createStorageCleaner(env: WorkersEnv): StorageCleanerDriver {
  if (env.STORAGE_PROVIDER === 's3') {
    const s3Client = new S3Client({
      region: env.STORAGE_REGION,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
      ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT } : {}),
      ...(env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.STORAGE_ACCESS_KEY_ID,
              secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });

    return {
      async listInternalFiles(): Promise<Array<{ key: string; lastModified: Date }>> {
        const results: Array<{ key: string; lastModified: Date }> = [];
        let continuationToken: string | undefined;
        do {
          const response = await s3Client.send(
            new ListObjectsV2Command({
              Bucket: env.STORAGE_BUCKET,
              ContinuationToken: continuationToken,
            }),
          );
          for (const obj of response.Contents ?? []) {
            if (obj.Key && isInternalStorageKey(obj.Key)) {
              results.push({
                key: obj.Key,
                lastModified: obj.LastModified ?? new Date(),
              });
            }
          }
          continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
        } while (continuationToken);
        return results;
      },
      async deleteFile(key: string): Promise<boolean> {
        if (!isInternalStorageKey(key)) return false;
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: env.STORAGE_BUCKET,
            Key: key,
          }),
        );
        return true;
      },
    };
  }

  // Local storage driver
  const candidateDirs = [
    env.STORAGE_LOCAL_DIR,
    resolve(process.cwd(), 'public/uploads'),
    resolve(process.cwd(), '../api/public/uploads'),
    resolve(process.cwd(), 'apps/api/public/uploads'),
  ].filter((d): d is string => typeof d === 'string' && d.length > 0);

  const uploadsDir =
    candidateDirs.find((d) => existsSync(d)) ?? resolve(process.cwd(), 'public/uploads');

  return {
    async listInternalFiles(): Promise<Array<{ key: string; lastModified: Date }>> {
      try {
        await stat(uploadsDir);
      } catch {
        return [];
      }

      const results: Array<{ key: string; lastModified: Date }> = [];
      const walk = async (dir: string): Promise<void> => {
        let entries: Dirent[];
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const fullPath = resolve(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile()) {
            const fileStat = await stat(fullPath);
            const relativeKey = relative(uploadsDir, fullPath).split(sep).join('/');
            if (isInternalStorageKey(relativeKey)) {
              results.push({
                key: relativeKey,
                lastModified: fileStat.mtime,
              });
            }
          }
        }
      };

      await walk(uploadsDir);
      return results;
    },
    async deleteFile(key: string): Promise<boolean> {
      if (!isInternalStorageKey(key)) return false;
      const safePath = resolve(uploadsDir, key);
      if (!safePath.startsWith(uploadsDir + sep)) {
        return false;
      }
      try {
        await unlink(safePath);
        return true;
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code: string }).code === 'ENOENT'
        ) {
          return true;
        }
        throw err;
      }
    },
  };
}

export interface MediaCleanupResult {
  scanned: number;
  candidateCount: number;
  deletedCount: number;
}

export interface MediaAssetDbClient {
  mediaAsset: {
    findMany(args: {
      where: {
        OR: Array<
          | { fileKey: { in: string[] } }
          | { posterKey: { in: string[] } }
          | { ownerId?: { in: string[] } }
        >;
      };
      select: {
        fileKey: true;
        posterKey: true;
        posterCandidates?: true;
        variants?: true;
      };
    }): Promise<
      Array<{
        fileKey: string;
        posterKey: string | null;
        posterCandidates?: string[];
        variants?: unknown;
      }>
    >;
  };
}

export function processMediaCleanupJob(driver: StorageCleanerDriver, prisma: MediaAssetDbClient) {
  return async (job: Job<MediaSweepJob>): Promise<MediaCleanupResult> => {
    const gracePeriodMs = job.data?.gracePeriodMs ?? 3_600_000;
    const cutoff = new Date(Date.now() - gracePeriodMs);

    const allFiles = await driver.listInternalFiles();
    const candidateFiles = allFiles.filter((f) => f.lastModified.getTime() <= cutoff.getTime());

    if (candidateFiles.length === 0) {
      log.info(
        { scanned: allFiles.length, candidates: 0 },
        'media sweep completed — no candidate files',
      );
      return { scanned: allFiles.length, candidateCount: 0, deletedCount: 0 };
    }

    const candidateKeys = Array.from(new Set(candidateFiles.map((f) => f.key)));
    const referencedKeys = new Set<string>();
    const chunkSize = 500;

    for (let i = 0; i < candidateKeys.length; i += chunkSize) {
      const batch = candidateKeys.slice(i, i + chunkSize);
      const ownerIds = batch
        .map((k) => k.split('/')[1])
        .filter((id): id is string => typeof id === 'string' && /^[0-9a-fA-F-]{36}$/.test(id));

      const matches = await prisma.mediaAsset.findMany({
        where: {
          OR: [
            { fileKey: { in: batch } },
            { posterKey: { in: batch } },
            ...(ownerIds.length > 0 ? [{ ownerId: { in: ownerIds } }] : []),
          ],
        },
        select: {
          fileKey: true,
          posterKey: true,
          posterCandidates: true,
          variants: true,
        },
      });
      for (const m of matches) {
        referencedKeys.add(m.fileKey);
        if (m.posterKey) {
          referencedKeys.add(m.posterKey);
        }
        for (const cand of m.posterCandidates ?? []) {
          referencedKeys.add(cand);
        }
        for (const vk of extractVariantKeys(m.variants)) {
          referencedKeys.add(vk);
        }
      }
    }

    const orphanedKeys = candidateKeys.filter((key) => !referencedKeys.has(key));
    let deletedCount = 0;

    for (const key of orphanedKeys) {
      try {
        const ok = await driver.deleteFile(key);
        if (ok) {
          deletedCount++;
          log.info({ key }, 'deleted orphaned storage file');
        }
      } catch (err) {
        log.warn({ key, err }, 'failed to delete orphaned storage file');
      }
    }

    log.info(
      { scanned: allFiles.length, candidates: candidateKeys.length, deleted: deletedCount },
      'media sweep completed',
    );

    return {
      scanned: allFiles.length,
      candidateCount: candidateKeys.length,
      deletedCount,
    };
  };
}
