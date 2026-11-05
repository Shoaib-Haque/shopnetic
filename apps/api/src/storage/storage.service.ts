import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { basename, extname, join, dirname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { RequestUploadUrlRequest, UploadUrlResponse } from '@shopnetic/contracts';
import { API_ENV, type ApiEnv } from '../config/env.js';

@Injectable()
export class StorageService {
  private readonly s3Client?: S3Client;
  private readonly hmacSecret: string;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {
    this.hmacSecret = env.JWT_PRIVATE_KEY || 'dev-storage-secret-key-shopnetic';
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
    const uploadUrl = `http://localhost:${this.env.PORT}/admin/v1/storage/upload?key=${encodeURIComponent(fileKey)}&token=${token}&expires=${expires}`;

    return { uploadUrl, fileKey, publicUrl };
  }

  signToken(key: string, expires: number): string {
    return createHmac('sha256', this.hmacSecret).update(`${key}:${expires}`).digest('hex');
  }

  verifyToken(key: string, token: string, expires: number): boolean {
    if (Date.now() > expires) return false;
    const expected = this.signToken(key, expires);
    return token === expected;
  }

  async saveLocalFile(key: string, data: Buffer): Promise<void> {
    const fullPath = join(process.cwd(), 'public/uploads', key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }
}
