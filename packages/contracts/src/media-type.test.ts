import { describe, expect, it } from 'vitest';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_MEDIA_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  detectMediaFileType,
  getMediaKindFromKey,
  isValidMediaFileType,
} from './media-type.js';

describe('media-type detection', () => {
  it('exports expected MIME type constants', () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).toContain('image/png');
    expect(ALLOWED_IMAGE_MIME_TYPES).toContain('image/jpeg');
    expect(ALLOWED_IMAGE_MIME_TYPES).toContain('image/webp');
    expect(ALLOWED_IMAGE_MIME_TYPES).toContain('image/avif');
    expect(ALLOWED_IMAGE_MIME_TYPES).toContain('image/gif');

    expect(ALLOWED_VIDEO_MIME_TYPES).toContain('video/mp4');
    expect(ALLOWED_VIDEO_MIME_TYPES).toContain('video/webm');

    expect(ALLOWED_MEDIA_MIME_TYPES).toHaveLength(
      ALLOWED_IMAGE_MIME_TYPES.length + ALLOWED_VIDEO_MIME_TYPES.length,
    );
  });

  describe('detectMediaFileType', () => {
    it('detects JPEG magic bytes (FF D8 FF)', () => {
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      expect(detectMediaFileType(bytes)).toEqual({
        kind: 'image',
        mimeType: 'image/jpeg',
      });
    });

    it('detects PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)', () => {
      const bytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52,
      ]);
      expect(detectMediaFileType(bytes)).toEqual({
        kind: 'image',
        mimeType: 'image/png',
      });
    });

    it('detects GIF87a magic bytes', () => {
      const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x0a, 0x00]);
      expect(detectMediaFileType(bytes)).toEqual({
        kind: 'image',
        mimeType: 'image/gif',
      });
    });

    it('detects GIF89a magic bytes', () => {
      const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x0a, 0x00]);
      expect(detectMediaFileType(bytes)).toEqual({
        kind: 'image',
        mimeType: 'image/gif',
      });
    });

    it('detects WebP (RIFF .... WEBP)', () => {
      const bytes = new Uint8Array([
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x20,
        0x00,
        0x00,
        0x00, // length
        0x57,
        0x45,
        0x42,
        0x50, // WEBP
        0x56,
        0x50,
        0x38,
        0x20, // VP8
      ]);
      expect(detectMediaFileType(bytes)).toEqual({
        kind: 'image',
        mimeType: 'image/webp',
      });
    });

    it('detects AVIF with major brand avif', () => {
      // 4 bytes size (28 = 0x0000001c), 'ftyp', major brand 'avif', minor 0, compatible 'mif1'
      const bytes = new Uint8Array([
        0x00,
        0x00,
        0x00,
        0x1c, // box length 28
        0x66,
        0x74,
        0x79,
        0x70, // ftyp
        0x61,
        0x76,
        0x69,
        0x66, // avif (major brand)
        0x00,
        0x00,
        0x00,
        0x00, // minor version
        0x6d,
        0x69,
        0x66,
        0x31, // mif1 (compatible brand)
        0x61,
        0x76,
        0x69,
        0x66, // avif (compatible brand)
      ]);
      expect(detectMediaFileType(bytes)).toEqual({
        kind: 'image',
        mimeType: 'image/avif',
      });
    });

    it('detects AVIF with compatible brand avif/mif1', () => {
      const bytes = new Uint8Array([
        0x00,
        0x00,
        0x00,
        0x20,
        0x66,
        0x74,
        0x79,
        0x70, // ftyp
        0x6d,
        0x69,
        0x66,
        0x31, // mif1 (major brand)
        0x00,
        0x00,
        0x00,
        0x00, // minor
        0x6d,
        0x69,
        0x66,
        0x31, // mif1
        0x61,
        0x76,
        0x69,
        0x73, // avis
      ]);
      expect(detectMediaFileType(bytes)).toEqual({
        kind: 'image',
        mimeType: 'image/avif',
      });
    });

    it('detects MP4 with major brand mp42', () => {
      const bytes = new Uint8Array([
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
        0x32, // mp42 (major brand)
        0x00,
        0x00,
        0x00,
        0x00,
        0x69,
        0x73,
        0x6f,
        0x6d, // isom
      ]);
      expect(detectMediaFileType(bytes)).toEqual({
        kind: 'video',
        mimeType: 'video/mp4',
      });
    });

    it('detects MP4 with isom brand', () => {
      const bytes = new Uint8Array([
        0x00,
        0x00,
        0x00,
        0x20,
        0x66,
        0x74,
        0x79,
        0x70, // ftyp
        0x69,
        0x73,
        0x6f,
        0x6d, // isom
        0x00,
        0x00,
        0x02,
        0x00,
        0x6d,
        0x70,
        0x34,
        0x31, // mp41
      ]);
      expect(detectMediaFileType(bytes)).toEqual({
        kind: 'video',
        mimeType: 'video/mp4',
      });
    });

    it('detects WebM (EBML header with webm doctype)', () => {
      const bytes = new Uint8Array([
        0x1a,
        0x45,
        0xdf,
        0xa3, // EBML ID
        0x01,
        0x00,
        0x00,
        0x1f,
        0x42,
        0x82,
        0x84,
        0x77,
        0x65,
        0x62,
        0x6d, // webm
      ]);
      expect(detectMediaFileType(bytes)).toEqual({
        kind: 'video',
        mimeType: 'video/webm',
      });
    });

    it('returns null for MKV (EBML with matroska doctype)', () => {
      const bytes = new Uint8Array([
        0x1a,
        0x45,
        0xdf,
        0xa3, // EBML ID
        0x01,
        0x00,
        0x00,
        0x23,
        0x42,
        0x82,
        0x88,
        0x6d,
        0x61,
        0x74,
        0x72,
        0x6f,
        0x73,
        0x6b,
        0x61, // matroska
      ]);
      expect(detectMediaFileType(bytes)).toBeNull();
    });

    it('returns null for plain text files', () => {
      const textBytes = new TextEncoder().encode('Hello world, this is a plain text file!');
      expect(detectMediaFileType(textBytes)).toBeNull();
    });

    it('returns null for executable PE binary (MZ...)', () => {
      const peBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      expect(detectMediaFileType(peBytes)).toBeNull();
    });

    it('returns null for truncated or empty buffers', () => {
      expect(detectMediaFileType(new Uint8Array(0))).toBeNull();
      expect(detectMediaFileType(new Uint8Array([0xff, 0xd8]))).toBeNull();
      expect(detectMediaFileType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
    });
  });

  describe('isValidMediaFileType', () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const textBytes = new TextEncoder().encode('Not a media file');

    it('validates without expectedKind', () => {
      expect(isValidMediaFileType(jpegBytes)).toBe(true);
      expect(isValidMediaFileType(mp4Bytes)).toBe(true);
      expect(isValidMediaFileType(textBytes)).toBe(false);
    });

    it('validates with matching expectedKind', () => {
      expect(isValidMediaFileType(jpegBytes, 'image')).toBe(true);
      expect(isValidMediaFileType(mp4Bytes, 'video')).toBe(true);
    });

    it('rejects when kind mismatches expectedKind', () => {
      expect(isValidMediaFileType(jpegBytes, 'video')).toBe(false);
      expect(isValidMediaFileType(mp4Bytes, 'image')).toBe(false);
    });
  });

  describe('getMediaKindFromKey', () => {
    it('identifies image extensions', () => {
      expect(getMediaKindFromKey('product/123/photo.jpg')).toBe('image');
      expect(getMediaKindFromKey('product/123/photo.JPEG')).toBe('image');
      expect(getMediaKindFromKey('product/123/photo.png')).toBe('image');
      expect(getMediaKindFromKey('product/123/photo.webp')).toBe('image');
      expect(getMediaKindFromKey('product/123/photo.avif')).toBe('image');
      expect(getMediaKindFromKey('product/123/photo.gif')).toBe('image');
      expect(getMediaKindFromKey('https://cdn.example.com/banner.png?v=1#anchor')).toBe('image');
    });

    it('identifies video extensions', () => {
      expect(getMediaKindFromKey('product/123/clip.mp4')).toBe('video');
      expect(getMediaKindFromKey('product/123/clip.webm')).toBe('video');
      expect(getMediaKindFromKey('https://cdn.example.com/movie.MP4')).toBe('video');
    });

    it('returns null for unknown extensions or missing files', () => {
      expect(getMediaKindFromKey('product/123/doc.pdf')).toBeNull();
      expect(getMediaKindFromKey('product/123/archive.zip')).toBeNull();
      expect(getMediaKindFromKey('not-a-file')).toBeNull();
      expect(getMediaKindFromKey('')).toBeNull();
    });
  });
});
