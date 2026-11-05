import * as React from 'react';
import { ResponsiveImage } from '@shopnetic/ui';
import type { MediaAsset, MediaVariants } from '@shopnetic/contracts';

export interface SellerProductMediaProps {
  asset?: Pick<MediaAsset, 'fileKey' | 'url' | 'variants' | 'alt' | 'kind'> | null | undefined;
  src?: string | null | undefined;
  fileKey?: string | null | undefined;
  variants?: MediaVariants | null | undefined;
  alt?: string | undefined;
  sizes?: string | undefined;
  className?: string | undefined;
  pictureClassName?: string | undefined;
}

export function SellerProductMedia({
  asset,
  src,
  fileKey,
  variants,
  alt = 'Product media',
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 240px',
  className,
  pictureClassName,
}: SellerProductMediaProps) {
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
