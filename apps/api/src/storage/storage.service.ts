import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { basename, extname, dirname, resolve, sep } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { RequestUploadUrlRequest, UploadUrlResponse } from '@shopnetic/contracts';
import { API_ENV, type ApiEnv } from '../config/env.js';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client?: S3Client;
  private readonly hmacSecret: string;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {
    if (env.STORAGE_HMAC_SECRET) {
      this.hmacSecret = env.STORAGE_HMAC_SECRET;
    } else if (env.NODE_ENV === 'test') {
      this.hmacSecret = 'test-storage-hmac-secret-32-chars-long';
    } else if (env.NODE_ENV === 'development') {
      this.hmacSecret = randomBytes(32).toString('hex');
      this.logger.warn(
        'STORAGE_HMAC_SECRET unset; generated an ephemeral 32-byte secret for local storage tokens.',
      );
    } else if (env.STORAGE_PROVIDER === 'local') {
      throw new Error('STORAGE_HMAC_SECRET must be configured in production for local storage');
    } else {
      // In production with S3 provider, HMAC tokens are not used
      this.hmacSecret = '';
    }

    if (env.STORAGE_PROVIDER === 's3') {
      this.s3Client = new S3Client({
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
    }
  }

  async createUploadUrl(request: RequestUploadUrlRequest): Promise<UploadUrlResponse> {
    const ext = extname(request.fileName).toLowerCase() || '.bin';
    const rawBase = basename(request.fileName, ext);
    const sanitizedBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40) || 'media';
    const uniqueSuffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    const fileKey = `${request.ownerType}/${request.ownerId}/${uniqueSuffix}-${sanitizedBase}${ext}`;

    const baseUrl = this.env.STORAGE_PUBLIC_BASE_URL.replace(/\/$/, '');
    const publicUrl = `${baseUrl}/${fileKey}`;

    if (this.env.STORAGE_PROVIDER === 's3' && this.s3Client) {
      const command = new PutObjectCommand({
        Bucket: this.env.STORAGE_BUCKET,
        Key: fileKey,
        ContentType: request.contentType,
      });
      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });
      return { uploadUrl, fileKey, publicUrl };
    }

    // Local dev mode: sign URL pointing to local upload endpoint
    const expires = Date.now() + 15 * 60 * 1000;
    const token = this.signToken(fileKey, expires);
    const uploadBaseUrl = this.env.STORAGE_UPLOAD_BASE_URL.replace(/\/$/, '');
    const uploadUrl = `${uploadBaseUrl}/admin/v1/storage/upload?key=${encodeURIComponent(fileKey)}&token=${token}&expires=${expires}`;

    return { uploadUrl, fileKey, publicUrl };
  }

  signToken(key: string, expires: number): string {
    if (!this.hmacSecret) {
      throw new Error('Local storage HMAC operations are unavailable without a configured secret');
    }
    return createHmac('sha256', this.hmacSecret).update(`${key}:${expires}`).digest('hex');
  }

  verifyToken(key: string, token: string, expires: number): boolean {
    if (!this.hmacSecret || Date.now() > expires) return false;
    const expected = this.signToken(key, expires);
    return token === expected;
  }

  assertSafeStorageKey(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new BadRequestException('Storage key is required');
    }
    if (key.includes('..') || key.includes('\\') || key.startsWith('/') || /\0/.test(key)) {
      throw new BadRequestException('Path traversal detected in storage key');
    }
    if (!/^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_.-]+)+$/.test(key)) {
      throw new BadRequestException('Invalid storage key format');
    }
    const uploadsDir = resolve(process.cwd(), 'public/uploads');
    const resolvedPath = resolve(uploadsDir, key);
    if (!resolvedPath.startsWith(uploadsDir + sep)) {
      throw new BadRequestException('Resolved path outside uploads directory');
    }
    return resolvedPath;
  }

  async saveLocalFile(key: string, data: Buffer): Promise<void> {
    const fullPath = this.assertSafeStorageKey(key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }
}
