import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductMedia } from './product-media';
import type { MediaVariants } from '@shopnetic/contracts';

describe('Storefront ProductMedia', () => {
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
    const html = renderToStaticMarkup(
      <ProductMedia
        src="http://cdn/orig.jpg"
        variants={sampleVariants}
        alt="Storefront product shot"
      />,
    );

    expect(html).toContain('<picture>');
    expect(html).toContain('type="image/avif"');
    expect(html).toContain('srcSet="http://cdn/320.avif 320w"');
    expect(html).toContain('type="image/webp"');
    expect(html).toContain('srcSet="http://cdn/320.webp 320w"');
    expect(html).toContain('src="http://cdn/orig.jpg"');
    expect(html).toContain('srcSet="http://cdn/320.jpg 320w"');
    expect(html).toContain('alt="Storefront product shot"');
  });
});
