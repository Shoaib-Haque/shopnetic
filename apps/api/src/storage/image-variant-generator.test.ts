import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  computeVariantKey,
  generateImageVariantsBuffers,
  buildMediaVariantsRecord,
} from './image-variant-generator.js';
import { RESPONSIVE_IMAGE_WIDTHS } from '@shopnetic/contracts';

describe('image-variant-generator', () => {
  it('computes correct variant storage keys', () => {
    const key = computeVariantKey(
      'product/018f23c0-0000-7000-8000-000000000001/1700000000-abcd-photo.png',
      320,
      'webp',
    );
    expect(key).toBe(
      'product/018f23c0-0000-7000-8000-000000000001/variants/1700000000-abcd-photo-w320.webp',
    );

    const jpegKey = computeVariantKey(
      'product/018f23c0-0000-7000-8000-000000000001/1700000000-abcd-photo.png',
      1200,
      'jpeg',
    );
    expect(jpegKey).toBe(
      'product/018f23c0-0000-7000-8000-000000000001/variants/1700000000-abcd-photo-w1200.jpg',
    );
  });

  it('generates 18 variants (6 widths x 3 formats)', async () => {
    // Generate a 1000x800 test image
    const sourceBuffer = await sharp({
      create: {
        width: 1000,
        height: 800,
        channels: 3,
        background: { r: 10, g: 100, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();

    const fileKey = 'product/p1/sample.jpg';
    const variants = await generateImageVariantsBuffers(sourceBuffer, fileKey);

    expect(variants).toHaveLength(18); // 6 widths * 3 formats

    const record = buildMediaVariantsRecord(variants, 'https://cdn.shopnetic.com');
    for (const w of RESPONSIVE_IMAGE_WIDTHS) {
      const wStr = String(w);
      expect(record[wStr]).toBeDefined();
      expect(record[wStr]?.avif).toBeDefined();
      expect(record[wStr]?.webp).toBeDefined();
      expect(record[wStr]?.jpeg).toBeDefined();

      expect(record[wStr]?.avif?.url).toContain('.avif');
      expect(record[wStr]?.webp?.url).toContain('.webp');
      expect(record[wStr]?.jpeg?.url).toContain('.jpg');
    }
  }, 15000);
});
