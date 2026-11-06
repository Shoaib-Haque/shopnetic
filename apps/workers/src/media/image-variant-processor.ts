import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Job } from 'bullmq';
import type { ImageVariantJob } from '@shopnetic/events';
import type { MediaVariants } from '@shopnetic/contracts';
import { createLogger } from '@shopnetic/observability';
import type { WorkersEnv } from '../config/env.js';
import {
  generateImageVariantsBuffers,
  buildMediaVariantsRecord,
} from './image-variant-generator.js';

const log = createLogger({ service: 'image-variants' });

export interface ImageVariantStorageDriver {
  readBuffer(key: string): Promise<Buffer | null>;
  saveFile(key: string, data: Buffer, contentType: string): Promise<boolean>;
}

export function createImageVariantStorage(env: WorkersEnv): ImageVariantStorageDriver {
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
      async readBuffer(key: string): Promise<Buffer | null> {
        try {
          const res = await s3Client.send(
            new GetObjectCommand({
              Bucket: env.STORAGE_BUCKET,
              Key: key,
            }),
          );
          if (!res.Body) return null;
          if (
            typeof (res.Body as { transformToByteArray?: () => Promise<Uint8Array> })
              .transformToByteArray === 'function'
          ) {
            const arr = await (
              res.Body as { transformToByteArray: () => Promise<Uint8Array> }
            ).transformToByteArray();
            return Buffer.from(arr);
          }
          const chunks: Buffer[] = [];
          for await (const chunk of res.Body as AsyncIterable<Uint8Array | Buffer>) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          return Buffer.concat(chunks);
        } catch (err) {
          log.warn({ key, err }, 'failed to read buffer from s3');
          return null;
        }
      },
      async saveFile(key: string, data: Buffer, contentType: string): Promise<boolean> {
        try {
          await s3Client.send(
            new PutObjectCommand({
              Bucket: env.STORAGE_BUCKET,
              Key: key,
              Body: data,
              ContentType: contentType,
            }),
          );
          return true;
        } catch (err) {
          log.warn({ key, err }, 'failed to save file to s3');
          return false;
        }
      },
    };
  }

  // Local storage
  const baseDir = resolve(process.cwd(), '../../apps/api/public/uploads');
  return {
    async readBuffer(key: string): Promise<Buffer | null> {
      const fullPath = resolve(baseDir, key.replace(/\//g, sep));
      if (!fullPath.startsWith(baseDir) || !existsSync(fullPath)) {
        return null;
      }
      try {
        return await readFile(fullPath);
      } catch (err) {
        log.warn({ key, err }, 'failed to read local buffer');
        return null;
      }
    },
    async saveFile(key: string, data: Buffer): Promise<boolean> {
      const fullPath = resolve(baseDir, key.replace(/\//g, sep));
      if (!fullPath.startsWith(baseDir)) return false;
      try {
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, data);
        return true;
      } catch (err) {
        log.warn({ key, err }, 'failed to write local variant file');
        return false;
      }
    },
  };
}

export interface ImageVariantPrisma {
  mediaAsset: {
    findUnique?: (args: {
      where: { id: string };
      select: { id?: boolean; fileKey?: boolean; status?: boolean; updatedAt?: boolean };
    }) => Promise<{ id?: string; fileKey?: string; status?: string; updatedAt?: Date } | null>;
    update: (args: {
      where: { id: string };
      data: { variants: MediaVariants; updatedAt?: Date };
    }) => Promise<unknown>;
  };
}

export function processImageVariantJob(
  storage: ImageVariantStorageDriver,
  prisma: ImageVariantPrisma,
  publicBaseUrl?: string,
) {
  return async (
    job: Job<ImageVariantJob>,
  ): Promise<{ status: 'generated' | 'skipped' | 'failed' }> => {
    const { mediaAssetId, fileKey } = job.data;
    const sourceBuffer = await storage.readBuffer(fileKey);
    if (!sourceBuffer) {
      log.warn({ jobId: job.id, mediaAssetId, fileKey }, 'source buffer could not be loaded');
      return { status: 'failed' };
    }

    const variants = await generateImageVariantsBuffers(sourceBuffer, fileKey);
    for (const v of variants) {
      const contentType =
        v.format === 'avif' ? 'image/avif' : v.format === 'webp' ? 'image/webp' : 'image/jpeg';
      await storage.saveFile(v.key, v.data, contentType);
    }

    const variantsRecord = buildMediaVariantsRecord(variants, publicBaseUrl);
    const existing =
      typeof prisma.mediaAsset.findUnique === 'function'
        ? await prisma.mediaAsset.findUnique({
            where: { id: mediaAssetId },
            select: { updatedAt: true },
          })
        : null;

    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        variants: variantsRecord,
        ...(existing?.updatedAt ? { updatedAt: existing.updatedAt } : {}),
      },
    });

    log.info(
      { jobId: job.id, mediaAssetId, variantCount: variants.length },
      'image variants generated',
    );
    return { status: 'generated' };
  };
}
