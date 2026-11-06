import { existsSync } from 'node:fs';
import { mkdir, open, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { Job } from 'bullmq';
import type { MediaValidationJob } from '@shopnetic/events';
import { isValidMediaFileType, MEDIA_VIDEO_MAX_DURATION_SECONDS } from '@shopnetic/contracts';
import { createLogger } from '@shopnetic/observability';
import type { WorkersEnv } from '../config/env.js';
import { probeVideoDuration } from './video-probe.js';
import { generatePosterCandidates as generatePosterCandidatesUtil } from './poster-generator.js';

const log = createLogger({ service: 'media-validation' });

export interface StorageValidatorDriver {
  readHeaderBytes(key: string, maxBytes?: number): Promise<Uint8Array | null>;
  deleteFile(key: string): Promise<boolean>;
  probeDuration?(key: string): Promise<number | null>;
  generatePosterCandidates?(fileKey: string, durationS: number): Promise<string[] | null>;
}

async function streamToUint8Array(stream: unknown): Promise<Uint8Array> {
  if (!stream) return new Uint8Array(0);
  if (
    typeof (stream as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray ===
    'function'
  ) {
    return (stream as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array | Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export function createStorageValidator(env: WorkersEnv): StorageValidatorDriver {
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
      async readHeaderBytes(key: string, maxBytes = 64): Promise<Uint8Array | null> {
        try {
          const res = await s3Client.send(
            new GetObjectCommand({
              Bucket: env.STORAGE_BUCKET,
              Key: key,
              Range: `bytes=0-${maxBytes - 1}`,
            }),
          );
          if (!res.Body) return null;
          return await streamToUint8Array(res.Body);
        } catch (err) {
          log.warn(
            { key, err: err instanceof Error ? err.message : String(err) },
            'Failed to read S3 object header',
          );
          return null;
        }
      },

      async deleteFile(key: string): Promise<boolean> {
        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: env.STORAGE_BUCKET,
              Key: key,
            }),
          );
          return true;
        } catch (err) {
          log.warn(
            { key, err: err instanceof Error ? err.message : String(err) },
            'Failed to delete S3 object',
          );
          return false;
        }
      },

      async probeDuration(key: string): Promise<number | null> {
        const tempPath = resolve(
          tmpdir(),
          `probe-${Date.now()}-${randomBytes(6).toString('hex')}.tmp`,
        );
        try {
          const res = await s3Client.send(
            new GetObjectCommand({
              Bucket: env.STORAGE_BUCKET,
              Key: key,
            }),
          );
          if (!res.Body) return null;
          const bytes = await streamToUint8Array(res.Body);
          await writeFile(tempPath, bytes);
          return await probeVideoDuration(tempPath);
        } catch (err) {
          log.warn(
            { key, err: err instanceof Error ? err.message : String(err) },
            'Failed to probe S3 video duration',
          );
          return null;
        } finally {
          await unlink(tempPath).catch(() => {});
        }
      },

      async generatePosterCandidates(fileKey: string, durationS: number): Promise<string[] | null> {
        const ext = extname(fileKey);
        const baseName = basename(fileKey, ext);
        const dir = dirname(fileKey).split(sep).join('/');
        const candKeys = [1, 2, 3].map((i) => `${dir}/${baseName}-poster-cand-${i}.jpg`);

        const tempDir = resolve(
          tmpdir(),
          `worker-poster-${Date.now()}-${randomBytes(4).toString('hex')}`,
        );
        await mkdir(tempDir, { recursive: true });
        const tempVideoPath = resolve(tempDir, `video${ext}`);

        try {
          const res = await s3Client.send(
            new GetObjectCommand({
              Bucket: env.STORAGE_BUCKET,
              Key: fileKey,
            }),
          );
          if (!res.Body) return null;
          const bytes = await streamToUint8Array(res.Body);
          await writeFile(tempVideoPath, bytes);

          const generated = await generatePosterCandidatesUtil(
            tempVideoPath,
            durationS,
            tempDir,
            baseName,
          );

          for (let i = 0; i < candKeys.length; i++) {
            const key = candKeys[i]!;
            const framePath = generated[i]!;
            const frameBytes = await readFile(framePath);
            await s3Client.send(
              new PutObjectCommand({
                Bucket: env.STORAGE_BUCKET,
                Key: key,
                Body: frameBytes,
                ContentType: 'image/jpeg',
              }),
            );
          }
          return candKeys;
        } catch (err) {
          log.warn(
            { fileKey, err: err instanceof Error ? err.message : String(err) },
            'Failed to generate S3 poster candidates in worker',
          );
          return null;
        } finally {
          await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }
      },
    };
  }

  // Local storage driver fallback
  const baseDir = resolve(env.STORAGE_LOCAL_DIR ?? 'uploads');
  return {
    async readHeaderBytes(key: string, maxBytes = 64): Promise<Uint8Array | null> {
      const fullPath = resolve(baseDir, key.replace(/\//g, sep));
      if (!fullPath.startsWith(baseDir) || !existsSync(fullPath)) {
        return null;
      }
      let handle;
      try {
        handle = await open(fullPath, 'r');
        const buf = Buffer.alloc(maxBytes);
        const { bytesRead } = await handle.read(buf, 0, maxBytes, 0);
        return new Uint8Array(buf.subarray(0, bytesRead));
      } catch (err) {
        log.warn(
          { key, err: err instanceof Error ? err.message : String(err) },
          'Failed to read local file header',
        );
        return null;
      } finally {
        await handle?.close();
      }
    },

    async deleteFile(key: string): Promise<boolean> {
      const fullPath = resolve(baseDir, key.replace(/\//g, sep));
      if (!fullPath.startsWith(baseDir)) return false;
      try {
        await unlink(fullPath);
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return true;
        log.warn(
          { key, err: err instanceof Error ? err.message : String(err) },
          'Failed to unlink local file',
        );
        return false;
      }
    },

    async probeDuration(key: string): Promise<number | null> {
      const fullPath = resolve(baseDir, key.replace(/\//g, sep));
      if (!fullPath.startsWith(baseDir) || !existsSync(fullPath)) {
        return null;
      }
      try {
        return await probeVideoDuration(fullPath);
      } catch (err) {
        log.warn(
          { key, err: err instanceof Error ? err.message : String(err) },
          'Failed to probe local video duration',
        );
        return null;
      }
    },

    async generatePosterCandidates(fileKey: string, durationS: number): Promise<string[] | null> {
      const fullPath = resolve(baseDir, fileKey.replace(/\//g, sep));
      if (!fullPath.startsWith(baseDir) || !existsSync(fullPath)) {
        return null;
      }
      const ext = extname(fileKey);
      const baseName = basename(fileKey, ext);
      const outDir = dirname(fullPath);
      const dirKey = dirname(fileKey).split(sep).join('/');
      const candKeys = [1, 2, 3].map((i) => `${dirKey}/${baseName}-poster-cand-${i}.jpg`);

      try {
        await mkdir(outDir, { recursive: true });
        await generatePosterCandidatesUtil(fullPath, durationS, outDir, baseName);
        return candKeys;
      } catch (err) {
        log.warn(
          { fileKey, err: err instanceof Error ? err.message : String(err) },
          'Failed to generate local poster candidates in worker',
        );
        return null;
      }
    },
  };
}

export interface MediaValidationPrisma {
  mediaAsset: {
    findUnique?: (args: {
      where: { id: string };
      select: { durationS: true; posterCandidates?: true; posterKey?: true };
    }) => Promise<{
      durationS: number | null;
      posterCandidates?: string[];
      posterKey?: string | null;
    } | null>;
    update: (args: {
      where: { id: string };
      data: { status?: 'rejected'; durationS?: number; posterCandidates?: string[] };
    }) => Promise<unknown>;
  };
}

export function processMediaValidationJob(
  validator: StorageValidatorDriver,
  prisma: MediaValidationPrisma,
) {
  return async (job: Job<MediaValidationJob>): Promise<{ status: 'valid' | 'rejected' }> => {
    const { mediaAssetId, fileKey, expectedKind } = job.data;
    const headerBytes = await validator.readHeaderBytes(fileKey, 64);

    const isValid = headerBytes !== null && isValidMediaFileType(headerBytes, expectedKind);
    if (!isValid) {
      log.warn(
        { jobId: job.id, mediaAssetId, fileKey, expectedKind },
        'Media asset validation failed; rejecting asset and purging storage object',
      );

      await validator.deleteFile(fileKey);
      await prisma.mediaAsset.update({
        where: { id: mediaAssetId },
        data: { status: 'rejected' },
      });

      return { status: 'rejected' };
    }

    if (expectedKind === 'video') {
      const duration = validator.probeDuration ? await validator.probeDuration(fileKey) : null;
      if (duration === null || duration > MEDIA_VIDEO_MAX_DURATION_SECONDS) {
        log.warn(
          { jobId: job.id, mediaAssetId, fileKey, expectedKind, duration },
          'Video duration validation failed; rejecting asset and purging storage object',
        );

        await validator.deleteFile(fileKey);
        await prisma.mediaAsset.update({
          where: { id: mediaAssetId },
          data: { status: 'rejected' },
        });

        return { status: 'rejected' };
      }

      let existingCandidates: string[] = [];
      let existingHasPosterKey = false;
      if (typeof prisma.mediaAsset.findUnique === 'function') {
        const existing = await prisma.mediaAsset.findUnique({
          where: { id: mediaAssetId },
          select: { durationS: true, posterCandidates: true, posterKey: true },
        });
        if (existing) {
          existingHasPosterKey = Boolean(existing.posterKey);
          if (existing.durationS == null) {
            await prisma.mediaAsset.update({
              where: { id: mediaAssetId },
              data: { durationS: Math.round(duration) },
            });
          }
          if (Array.isArray(existing.posterCandidates)) {
            existingCandidates = existing.posterCandidates;
          }
        }
      }

      if (
        !existingHasPosterKey &&
        existingCandidates.length === 0 &&
        validator.generatePosterCandidates
      ) {
        try {
          const candidateKeys = await validator.generatePosterCandidates(fileKey, duration);
          if (candidateKeys && candidateKeys.length > 0) {
            await prisma.mediaAsset.update({
              where: { id: mediaAssetId },
              data: { posterCandidates: candidateKeys },
            });
          }
        } catch (err) {
          log.warn(
            {
              jobId: job.id,
              mediaAssetId,
              fileKey,
              err: err instanceof Error ? err.message : String(err),
            },
            'Failed to generate poster candidates during worker validation',
          );
        }
      }
    }

    log.info(
      { jobId: job.id, mediaAssetId, fileKey, expectedKind },
      'Media asset validation passed',
    );
    return { status: 'valid' };
  };
}
