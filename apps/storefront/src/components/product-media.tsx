import * as React from 'react';
import { ResponsiveImage } from '@shopnetic/ui';
import type { MediaAsset, MediaVariants } from '@shopnetic/contracts';

export interface ProductMediaProps {
  asset?: Pick<MediaAsset, 'fileKey' | 'url' | 'variants' | 'alt' | 'kind'> | null | undefined;
  src?: string | null | undefined;
  fileKey?: string | null | undefined;
  variants?: MediaVariants | null | undefined;
  alt?: string | undefined;
  sizes?: string | undefined;
  className?: string | undefined;
  pictureClassName?: string | undefined;
}

export function ProductMedia({
  asset,
  src,
  fileKey,
  variants,
  alt = 'Product media',
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  className,
  pictureClassName,
}: ProductMediaProps) {
  const finalSrc = asset ? asset.url || asset.fileKey : src;
  const finalFileKey = asset ? asset.fileKey : fileKey;
  const finalVariants = asset ? asset.variants : variants;
  const finalAlt = asset?.alt?.en ?? alt;

  return (
    <ResponsiveImage
      src={finalSrc}
      fileKey={finalFileKey}
      variants={finalVariants}
      sizes={sizes}
      alt={finalAlt}
      className={className}
      pictureClassName={pictureClassName}
    />
  );
}
