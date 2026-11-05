import { describe, expect, it } from 'vitest';
import { StorageService } from './storage.service.js';
import type { ApiEnv } from '../config/env.js';

const mockEnv: ApiEnv = {
  NODE_ENV: 'test',
  PORT: 4000,
  APP_VERSION: '0.0.0',
  DATABASE_URL: 'postgresql://localhost:5433/test',
  REDIS_URL: 'redis://localhost:6380',
  JWT_ISSUER: 'https://shopnetic.local',
  JWT_ACCESS_TTL_SECONDS: 900,
  AUTH_REFRESH_TTL_DAYS: 30,
  AUTH_STAFF_REFRESH_TTL_HOURS: 8,
  VERIFICATION_TTL_HOURS: 24,
  PASSWORD_RESET_TTL_HOURS: 1,
  TOTP_ISSUER: 'Shopnetic',
  TOTP_WINDOW_STEPS: 1,
  APP_WEB_URL: 'http://localhost:3000',
  ADMIN_WEB_URL: 'http://localhost:3002',
  ADMIN_BASE_PATH: 'x7f2k9t3m1qp',
  PASSWORD_BREACH_CHECK: false,
  DEV_AUTH_RELAXED: false,
  DEV_RATE_LIMIT_DISABLED: false,
  DEV_RESPONSE_DELAY_MS: 0,
  DEV_RESPONSE_DELAY_ROUTES: '',
  DEV_FAULT_STATUS: 0,
  DEV_FAULT_ROUTES: '',
  DEV_FAULT_BODY: 'envelope',
  STORAGE_PROVIDER: 'local',
  STORAGE_BUCKET: 'media',
  STORAGE_REGION: 'us-east-1',
  STORAGE_PUBLIC_BASE_URL: 'http://localhost:4000/uploads',
  STORAGE_FORCE_PATH_STYLE: true,
};

describe('StorageService', () => {
  it('generates local signed upload URL and valid fileKey', async () => {
    const service = new StorageService(mockEnv);
    const res = await service.createUploadUrl({
      fileName: 'camera test #1.jpg',
      contentType: 'image/jpeg',
      ownerType: 'product',
      ownerId: '11111111-1111-1111-1111-111111111111',
    });

    expect(res.fileKey).toMatch(
      /^product\/11111111-1111-1111-1111-111111111111\/\d+-[a-f0-9]+-camera-test--1\.jpg$/,
    );
    expect(res.uploadUrl).toContain('http://localhost:4000/admin/v1/storage/upload');
    expect(res.uploadUrl).toContain('token=');
    expect(res.uploadUrl).toContain('expires=');
    expect(res.publicUrl).toBe(`http://localhost:4000/uploads/${res.fileKey}`);
  });

  it('validates HMAC tokens and rejects expired tokens', () => {
    const service = new StorageService(mockEnv);
    const key = 'product/123/photo.jpg';
    const futureExpiry = Date.now() + 60_000;
    const token = service.signToken(key, futureExpiry);

    expect(service.verifyToken(key, token, futureExpiry)).toBe(true);
    // Tampered key
    expect(service.verifyToken('product/123/other.jpg', token, futureExpiry)).toBe(false);
    // Tampered token
    expect(service.verifyToken(key, 'bad-token', futureExpiry)).toBe(false);
    // Expired
    const pastExpiry = Date.now() - 1000;
    const expiredToken = service.signToken(key, pastExpiry);
    expect(service.verifyToken(key, expiredToken, pastExpiry)).toBe(false);
  });
});
