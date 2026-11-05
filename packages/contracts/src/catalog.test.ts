import { describe, expect, it } from 'vitest';
import {
  MEDIA_VIDEO_MAX_DURATION_SECONDS,
  createMediaRequestSchema,
  updateMediaRequestSchema,
  generatePosterCandidatesRequestSchema,
  posterCandidatesResponseSchema,
  mediaAssetSchema,
  RESPONSIVE_IMAGE_WIDTHS,
  RESPONSIVE_IMAGE_FORMATS,
  buildResponsiveSrcSet,
  getResponsiveImageSources,
  resolveMediaVariantsUrls,
  extractVariantKeys,
  type MediaVariants,
} from './catalog.js';

describe('catalog media contracts', () => {
  it('exports MEDIA_VIDEO_MAX_DURATION_SECONDS as 120', () => {
    expect(MEDIA_VIDEO_MAX_DURATION_SECONDS).toBe(120);
  });

  describe('createMediaRequestSchema durationS validation', () => {
    it('accepts null, undefined, or valid duration <= 120s', () => {
      expect(
        createMediaRequestSchema.safeParse({
          kind: 'video',
          fileKey: 'products/video.mp4',
          durationS: 120,
        }).success,
      ).toBe(true);

      expect(
        createMediaRequestSchema.safeParse({
          kind: 'video',
          fileKey: 'products/video.mp4',
          durationS: 1,
        }).success,
      ).toBe(true);

      expect(
        createMediaRequestSchema.safeParse({
          kind: 'video',
          fileKey: 'products/video.mp4',
          durationS: null,
        }).success,
      ).toBe(true);

      expect(
        createMediaRequestSchema.safeParse({
          kind: 'video',
          fileKey: 'products/video.mp4',
        }).success,
      ).toBe(true);
    });

    it('rejects duration <= 0 or > 120 seconds', () => {
      expect(
        createMediaRequestSchema.safeParse({
          kind: 'video',
          fileKey: 'products/video.mp4',
          durationS: 0,
        }).success,
      ).toBe(false);

      expect(
        createMediaRequestSchema.safeParse({
          kind: 'video',
          fileKey: 'products/video.mp4',
          durationS: 121,
        }).success,
      ).toBe(false);

      expect(
        createMediaRequestSchema.safeParse({
          kind: 'video',
          fileKey: 'products/video.mp4',
          durationS: 86400,
        }).success,
      ).toBe(false);
    });
  });

  describe('updateMediaRequestSchema durationS validation', () => {
    it('accepts null or valid duration <= 120s', () => {
      expect(
        updateMediaRequestSchema.safeParse({
          durationS: 60,
        }).success,
      ).toBe(true);

      expect(
        updateMediaRequestSchema.safeParse({
          durationS: 120,
        }).success,
      ).toBe(true);

      expect(
        updateMediaRequestSchema.safeParse({
          durationS: null,
        }).success,
      ).toBe(true);
    });

    it('rejects duration <= 0 or > 120 seconds', () => {
      expect(
        updateMediaRequestSchema.safeParse({
          durationS: 0,
        }).success,
      ).toBe(false);

      expect(
        updateMediaRequestSchema.safeParse({
          durationS: 121,
        }).success,
      ).toBe(false);
    });
  });

  describe('poster candidates schema', () => {
    it('validates generatePosterCandidatesRequestSchema', () => {
      expect(
        generatePosterCandidatesRequestSchema.safeParse({
          fileKey: 'product/123/video.mp4',
        }).success,
      ).toBe(true);

      expect(
        generatePosterCandidatesRequestSchema.safeParse({
          fileKey: '',
        }).success,
      ).toBe(false);
    });

    it('validates posterCandidatesResponseSchema', () => {
      expect(
        posterCandidatesResponseSchema.safeParse({
          candidates: [
            { key: 'product/123/video-poster-cand-1.jpg', url: 'http://cdn/cand1.jpg' },
            { key: 'product/123/video-poster-cand-2.jpg', url: 'http://cdn/cand2.jpg' },
          ],
        }).success,
      ).toBe(true);
    });

    it('mediaAssetSchema defaults posterCandidates and posterCandidateUrls to empty arrays', () => {
      const parsed = mediaAssetSchema.safeParse({
        id: '1',
        ownerType: 'product',
        ownerId: '018f23c0-0000-7000-8000-000000000001',
        kind: 'video',
        fileKey: 'product/1/v.mp4',
        posterKey: null,
        width: 1920,
        height: 1080,
        durationS: 30,
        blurhash: null,
        alt: null,
        position: 0,
        status: 'active',
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.posterCandidates).toEqual([]);
        expect(parsed.data.posterCandidateUrls).toEqual([]);
        expect(parsed.data.variants).toBeUndefined();
      }
    });
  });

  describe('responsive image variants helper and schema tests', () => {
    it('defines fixed responsive widths and formats', () => {
      expect(RESPONSIVE_IMAGE_WIDTHS).toEqual([320, 480, 800, 1200, 1600, 2000]);
      expect(RESPONSIVE_IMAGE_FORMATS).toEqual(['avif', 'webp', 'jpeg']);
    });

    const sampleVariants: MediaVariants = {
      '320': {
        avif: { key: 'product/p1/variants/img-w320.avif', width: 320, format: 'avif' },
        webp: { key: 'product/p1/variants/img-w320.webp', width: 320, format: 'webp' },
        jpeg: { key: 'product/p1/variants/img-w320.jpg', width: 320, format: 'jpeg' },
      },
      '800': {
        avif: { key: 'product/p1/variants/img-w800.avif', width: 800, format: 'avif' },
        webp: { key: 'product/p1/variants/img-w800.webp', width: 800, format: 'webp' },
        jpeg: { key: 'product/p1/variants/img-w800.jpg', width: 800, format: 'jpeg' },
      },
    };

    it('buildResponsiveSrcSet formats srcSet in ascending width order', () => {
      const srcSet = buildResponsiveSrcSet(sampleVariants, 'webp', 'https://cdn.shopnetic.com');
      expect(srcSet).toBe(
        'https://cdn.shopnetic.com/product/p1/variants/img-w320.webp 320w, https://cdn.shopnetic.com/product/p1/variants/img-w800.webp 800w',
      );
    });

    it('buildResponsiveSrcSet returns empty string when no variants exist for format', () => {
      expect(buildResponsiveSrcSet(null, 'webp')).toBe('');
      expect(buildResponsiveSrcSet(undefined, 'avif')).toBe('');
      expect(buildResponsiveSrcSet({}, 'jpeg')).toBe('');
    });

    it('getResponsiveImageSources returns all formatted sets and fallbackSrc', () => {
      const sources = getResponsiveImageSources(
        {
          fileKey: 'product/p1/original.jpg',
          url: 'https://cdn.shopnetic.com/product/p1/original.jpg',
          variants: sampleVariants,
        },
        'https://cdn.shopnetic.com',
      );

      expect(sources.fallbackSrc).toBe('https://cdn.shopnetic.com/product/p1/original.jpg');
      expect(sources.avifSrcSet).toContain('img-w320.avif 320w');
      expect(sources.webpSrcSet).toContain('img-w320.webp 320w');
      expect(sources.jpegSrcSet).toContain('img-w320.jpg 320w');
    });

    it('resolveMediaVariantsUrls attaches resolved URLs to each variant object', () => {
      const resolved = resolveMediaVariantsUrls(sampleVariants, 'https://cdn.shopnetic.com');
      expect(resolved?.['320']?.['webp']?.url).toBe(
        'https://cdn.shopnetic.com/product/p1/variants/img-w320.webp',
      );
    });

    it('extractVariantKeys extracts all storage keys from a variants record', () => {
      const keys = extractVariantKeys(sampleVariants);
      expect(keys).toHaveLength(6);
      expect(keys).toContain('product/p1/variants/img-w320.avif');
      expect(keys).toContain('product/p1/variants/img-w320.webp');
      expect(keys).toContain('product/p1/variants/img-w320.jpg');
      expect(keys).toContain('product/p1/variants/img-w800.avif');
      expect(keys).toContain('product/p1/variants/img-w800.webp');
      expect(keys).toContain('product/p1/variants/img-w800.jpg');
    });

    it('extractVariantKeys returns empty array for null/undefined/invalid variants', () => {
      expect(extractVariantKeys(null)).toEqual([]);
      expect(extractVariantKeys(undefined)).toEqual([]);
      expect(extractVariantKeys({})).toEqual([]);
      expect(extractVariantKeys('string')).toEqual([]);
    });
  });
});
