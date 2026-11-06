import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { StorageController } from './storage.controller.js';
import { StorageService } from './storage.service.js';
import { probeVideoDuration } from './video-probe.js';
import type { ApiEnv } from '../config/env.js';

vi.mock('./video-probe.js', () => ({
  probeVideoDuration: vi.fn(),
}));

const mockedProbeVideoDuration = vi.mocked(probeVideoDuration);

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

describe('StorageController', () => {
  const service = new StorageService(mockEnv);
  const controller = new StorageController(service);

  it('rejects binary upload exceeding 50MB ceiling (HTTP 413 MEDIA_FILE_TOO_LARGE)', async () => {
    const key = 'product/11111111-1111-1111-1111-111111111111/12345-huge.jpg';
    const expires = Date.now() + 3600000;
    const token = service.signToken(key, expires);

    // 51MB buffer (simulated)
    const oversizedBuffer = Buffer.alloc(51 * 1024 * 1024);
    const mockReq = {
      body: oversizedBuffer,
    } as object as Request;

    await expect(
      controller.uploadLocal(mockReq, key, token, String(expires)),
    ).rejects.toMatchObject({
      status: 413,
      code: 'MEDIA_FILE_TOO_LARGE',
    });
  });

  it('rejects binary upload with extension mismatch (e.g. video bytes to .jpg key) (HTTP 415 MEDIA_TYPE_INVALID)', async () => {
    const key = 'product/11111111-1111-1111-1111-111111111111/12345-fake_image.jpg';
    const expires = Date.now() + 3600000;
    const token = service.signToken(key, expires);

    // Real MP4 header
    const mp4Buffer = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
      0x00, 0x69, 0x73, 0x6f, 0x6d,
    ]);
    const mockReq = {
      body: mp4Buffer,
    } as object as Request;

    await expect(
      controller.uploadLocal(mockReq, key, token, String(expires)),
    ).rejects.toMatchObject({
      status: 415,
      code: 'MEDIA_TYPE_INVALID',
    });
  });

  it('rejects binary upload with invalid magic bytes (HTTP 415 MEDIA_TYPE_INVALID)', async () => {
    const key = 'product/11111111-1111-1111-1111-111111111111/12345-fake.jpg';
    const expires = Date.now() + 3600000;
    const token = service.signToken(key, expires);

    const mockReq = {
      body: Buffer.from('plain text file content - not an image'),
    } as object as Request;

    await expect(
      controller.uploadLocal(mockReq, key, token, String(expires)),
    ).rejects.toMatchObject({
      status: 415,
      code: 'MEDIA_TYPE_INVALID',
    });
  });

  it('accepts binary upload with valid JPEG magic bytes', async () => {
    const key = 'product/11111111-1111-1111-1111-111111111111/12345-valid.jpg';
    const expires = Date.now() + 3600000;
    const token = service.signToken(key, expires);

    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const mockReq = {
      body: jpegBuffer,
    } as object as Request;

    const res = await controller.uploadLocal(mockReq, key, token, String(expires));
    expect(res).toEqual({ status: 'ok' });

    // Clean up
    await service.deleteFile(key);
  });

  it('accepts binary upload with valid MP4 magic bytes and duration <= 120s', async () => {
    mockedProbeVideoDuration.mockResolvedValueOnce(30);

    const key = 'product/11111111-1111-1111-1111-111111111111/12345-clip.mp4';
    const expires = Date.now() + 3600000;
    const token = service.signToken(key, expires);

    const mp4Buffer = Buffer.from([
      0x00,
      0x00,
      0x00,
      0x18,
      0x66,
      0x74,
      0x79,
      0x70, // ftyp
      0x6d,
      0x70,
      0x34,
      0x32, // mp42
      0x00,
      0x00,
      0x00,
      0x00,
      0x69,
      0x73,
      0x6f,
      0x6d,
    ]);
    const mockReq = {
      body: mp4Buffer,
    } as object as Request;

    const res = await controller.uploadLocal(mockReq, key, token, String(expires));
    expect(res).toEqual({ status: 'ok' });
    expect(mockedProbeVideoDuration).toHaveBeenCalled();

    // Clean up
    await service.deleteFile(key);
  });

  it('rejects binary upload when video duration exceeds 120 seconds (HTTP 422 MEDIA_VIDEO_DURATION_EXCEEDED)', async () => {
    mockedProbeVideoDuration.mockResolvedValueOnce(125);

    const key = 'product/11111111-1111-1111-1111-111111111111/12345-too-long.mp4';
    const expires = Date.now() + 3600000;
    const token = service.signToken(key, expires);

    const mp4Buffer = Buffer.from([
      0x00,
      0x00,
      0x00,
      0x18,
      0x66,
      0x74,
      0x79,
      0x70, // ftyp
      0x6d,
      0x70,
      0x34,
      0x32, // mp42
      0x00,
      0x00,
      0x00,
      0x00,
      0x69,
      0x73,
      0x6f,
      0x6d,
    ]);
    const mockReq = {
      body: mp4Buffer,
    } as object as Request;

    await expect(
      controller.uploadLocal(mockReq, key, token, String(expires)),
    ).rejects.toMatchObject({
      status: 422,
      code: 'MEDIA_VIDEO_DURATION_EXCEEDED',
    });
  });

  it('rejects binary upload when video duration has fractional seconds exceeding 120s (e.g. 120.4s)', async () => {
    mockedProbeVideoDuration.mockResolvedValueOnce(120.4);

    const key = 'product/11111111-1111-1111-1111-111111111111/12345-fractional-exceeded.mp4';
    const expires = Date.now() + 3600000;
    const token = service.signToken(key, expires);

    const mp4Buffer = Buffer.from([
      0x00,
      0x00,
      0x00,
      0x18,
      0x66,
      0x74,
      0x79,
      0x70, // ftyp
      0x6d,
      0x70,
      0x34,
      0x32, // mp42
      0x00,
      0x00,
      0x00,
      0x00,
      0x69,
      0x73,
      0x6f,
      0x6d,
    ]);
    const mockReq = {
      body: mp4Buffer,
    } as object as Request;

    await expect(
      controller.uploadLocal(mockReq, key, token, String(expires)),
    ).rejects.toMatchObject({
      status: 422,
      code: 'MEDIA_VIDEO_DURATION_EXCEEDED',
    });
  });

  it('rejects binary upload and unlinks file when video duration probe fails (HTTP 415 MEDIA_TYPE_INVALID)', async () => {
    mockedProbeVideoDuration.mockRejectedValueOnce(new Error('ffprobe spawn failure'));

    const key = 'product/11111111-1111-1111-1111-111111111111/12345-corrupt.mp4';
    const expires = Date.now() + 3600000;
    const token = service.signToken(key, expires);

    const mp4Buffer = Buffer.from([
      0x00,
      0x00,
      0x00,
      0x18,
      0x66,
      0x74,
      0x79,
      0x70, // ftyp
      0x6d,
      0x70,
      0x34,
      0x32, // mp42
      0x00,
      0x00,
      0x00,
      0x00,
      0x69,
      0x73,
      0x6f,
      0x6d,
    ]);
    const mockReq = {
      body: mp4Buffer,
    } as object as Request;

    await expect(
      controller.uploadLocal(mockReq, key, token, String(expires)),
    ).rejects.toMatchObject({
      status: 415,
      code: 'MEDIA_TYPE_INVALID',
    });
  });

  describe('getPosterCandidates', () => {
    it('returns candidate frames for a video file key', async () => {
      const generateSpy = vi
        .spyOn(service, 'generateAndSavePosterCandidates')
        .mockResolvedValueOnce([
          { key: 'product/1/vid-poster-cand-1.jpg', url: 'http://cdn/1.jpg' },
          { key: 'product/1/vid-poster-cand-2.jpg', url: 'http://cdn/2.jpg' },
          { key: 'product/1/vid-poster-cand-3.jpg', url: 'http://cdn/3.jpg' },
        ]);

      const mockReq = { headers: { 'x-request-id': 'req_1' } } as object as Request;
      const res = await controller.getPosterCandidates(mockReq, {
        fileKey: 'product/1/vid.mp4',
      });

      expect(generateSpy).toHaveBeenCalledWith('product/1/vid.mp4');
      expect(res.data.candidates).toHaveLength(3);
      expect(res.data.candidates[0]?.key).toBe('product/1/vid-poster-cand-1.jpg');
    });
  });
});
