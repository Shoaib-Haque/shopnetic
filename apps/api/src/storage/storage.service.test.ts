import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { StorageService } from './storage.service.js';
import { loadApiEnv, type ApiEnv } from '../config/env.js';

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
  CORS_ALLOWED_ORIGINS: '',
  CORS_ALLOW_LAN_IN_DEV: false,
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
  STORAGE_UPLOAD_BASE_URL: 'http://localhost:4000',
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

  it('uses configurable STORAGE_UPLOAD_BASE_URL for non-localhost review environments', async () => {
    const remoteEnv: ApiEnv = {
      ...mockEnv,
      STORAGE_UPLOAD_BASE_URL: 'https://api.review-env.shopnetic.internal',
      STORAGE_PUBLIC_BASE_URL: 'https://cdn.review-env.shopnetic.internal/uploads',
    };
    const service = new StorageService(remoteEnv);
    const res = await service.createUploadUrl({
      fileName: 'sample.png',
      contentType: 'image/png',
      ownerType: 'product',
      ownerId: 'prod-456',
    });

    expect(
      res.uploadUrl.startsWith('https://api.review-env.shopnetic.internal/admin/v1/storage/upload'),
    ).toBe(true);
    expect(
      res.publicUrl.startsWith(
        'https://cdn.review-env.shopnetic.internal/uploads/product/prod-456/',
      ),
    ).toBe(true);
  });

  it('validates storage keys and blocks path traversal attempts', () => {
    const service = new StorageService(mockEnv);

    // Valid path passes
    expect(() => service.assertSafeStorageKey('product/123/valid-photo.jpg')).not.toThrow();

    // Path traversal with ..
    expect(() => service.assertSafeStorageKey('../../../etc/passwd')).toThrow(BadRequestException);
    expect(() => service.assertSafeStorageKey('product/../../secret.txt')).toThrow(
      BadRequestException,
    );

    // Absolute paths or leading slashes
    expect(() => service.assertSafeStorageKey('/etc/passwd')).toThrow(BadRequestException);

    // Backslashes
    expect(() => service.assertSafeStorageKey('product\\secret.txt')).toThrow(BadRequestException);

    // Invalid / unsafe characters
    expect(() => service.assertSafeStorageKey('product/123/photo;evil.sh')).toThrow(
      BadRequestException,
    );
    expect(() => service.assertSafeStorageKey('product/123/photo\0evil.jpg')).toThrow(
      BadRequestException,
    );
  });

  it('validates HMAC tokens and rejects expired or tampered tokens', () => {
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

  it('generates distinct ephemeral HMAC secrets in dev when unset, avoiding predictable fallbacks', () => {
    const devEnv: ApiEnv = {
      ...mockEnv,
      NODE_ENV: 'development',
    };
    const s1 = new StorageService(devEnv);
    const s2 = new StorageService(devEnv);

    const token1 = s1.signToken('product/123/test.jpg', 1234567890);
    const token2 = s2.signToken('product/123/test.jpg', 1234567890);

    // Two unconfigured dev boots must produce distinct HMAC signatures
    expect(token1).not.toBe(token2);
  });

  it('fails loudly in production when STORAGE_HMAC_SECRET is missing for local storage', () => {
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'production',
        PORT: '4000',
        APP_VERSION: '1.0.0',
        DATABASE_URL: 'postgresql://prod:prod@localhost:5432/prod',
        REDIS_URL: 'redis://localhost:6379',
        JWT_ISSUER: 'https://shopnetic.com',
        JWT_ACCESS_TTL_SECONDS: '900',
        AUTH_REFRESH_TTL_DAYS: '30',
        AUTH_STAFF_REFRESH_TTL_HOURS: '8',
        VERIFICATION_TTL_HOURS: '24',
        PASSWORD_RESET_TTL_HOURS: '1',
        TOTP_ISSUER: 'Shopnetic',
        STORAGE_PROVIDER: 'local',
      }),
    ).toThrow('STORAGE_HMAC_SECRET must be configured in production for local storage');
  });

  it('allows booting StorageService in production with STORAGE_PROVIDER=s3 without STORAGE_HMAC_SECRET', () => {
    const s3ProdEnv = loadApiEnv({
      NODE_ENV: 'production',
      PORT: '4000',
      APP_VERSION: '1.0.0',
      DATABASE_URL: 'postgresql://prod:prod@localhost:5432/prod',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ISSUER: 'https://shopnetic.com',
      JWT_ACCESS_TTL_SECONDS: '900',
      AUTH_REFRESH_TTL_DAYS: '30',
      AUTH_STAFF_REFRESH_TTL_HOURS: '8',
      VERIFICATION_TTL_HOURS: '24',
      PASSWORD_RESET_TTL_HOURS: '1',
      TOTP_ISSUER: 'Shopnetic',
      STORAGE_PROVIDER: 's3',
      STORAGE_BUCKET: 'prod-media',
      STORAGE_REGION: 'us-east-1',
    });

    let service: StorageService | undefined;
    expect(() => {
      service = new StorageService(s3ProdEnv);
    }).not.toThrow();

    expect(service).toBeDefined();
    expect(() => service!.signToken('key', Date.now() + 1000)).toThrow(
      'Local storage HMAC operations are unavailable without a configured secret',
    );
    expect(service!.verifyToken('key', 'token', Date.now() + 1000)).toBe(false);
  });
});
