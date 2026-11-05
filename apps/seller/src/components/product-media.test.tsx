import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SellerProductMedia } from './product-media';
import type { MediaVariants } from '@shopnetic/contracts';

describe('SellerProductMedia', () => {
  const sampleVariants: MediaVariants = {
    '320': {
      avif: {
        key: 'p1/variants/img-w320.avif',
        url: 'http://cdn/320.avif',
        width: 320,
        format: 'avif',
      },
      webp: {
        key: 'p1/variants/img-w320.webp',
        url: 'http://cdn/320.webp',
        width: 320,
        format: 'webp',
      },
      jpeg: {
        key: 'p1/variants/img-w320.jpg',
        url: 'http://cdn/320.jpg',
        width: 320,
        format: 'jpeg',
      },
    },
  };

  it('renders picture with responsive sources and fallback image', () => {
    const { container } = render(
      <SellerProductMedia
        src="http://cdn/orig.jpg"
        variants={sampleVariants}
        alt="Seller product shot"
      />,
    );

    const picture = container.querySelector('picture');
    expect(picture).not.toBeNull();

    const sources = container.querySelectorAll('source');
    expect(sources.length).toBe(2); // avif and webp
    expect(sources[0]?.getAttribute('type')).toBe('image/avif');
    expect(sources[0]?.getAttribute('srcset')).toContain('http://cdn/320.avif 320w');
    expect(sources[1]?.getAttribute('type')).toBe('image/webp');
    expect(sources[1]?.getAttribute('srcset')).toContain('http://cdn/320.webp 320w');

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('http://cdn/orig.jpg');
    expect(img?.getAttribute('srcset')).toContain('http://cdn/320.jpg 320w');
    expect(img?.getAttribute('alt')).toBe('Seller product shot');
  });
});
