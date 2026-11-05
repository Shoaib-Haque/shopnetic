import { existsSync } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Job } from 'bullmq';
import type { MediaValidationJob } from '@shopnetic/events';
import { isValidMediaFileType } from '@shopnetic/contracts';
import { createLogger } from '@shopnetic/observability';
import type { WorkersEnv } from '../config/env.js';

const log = createLogger({ service: 'media-validation' });

export interface StorageValidatorDriver {
  readHeaderBytes(key: string, maxBytes?: number): Promise<Uint8Array | null>;
  deleteFile(key: string): Promise<boolean>;
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
  };
}

export function processMediaValidationJob(
  validator: StorageValidatorDriver,
  prisma: {
    mediaAsset: {
      update: (args: { where: { id: string }; data: { status: 'rejected' } }) => Promise<unknown>;
    };
  },
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

    log.info(
      { jobId: job.id, mediaAssetId, fileKey, expectedKind },
      'Media asset validation passed',
    );
    return { status: 'valid' };
  };
}
