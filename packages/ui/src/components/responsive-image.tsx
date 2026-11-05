import * as React from 'react';
import { getResponsiveImageSources, type MediaVariants } from '@shopnetic/contracts';
import { cn } from '../lib/cn';

export interface ResponsiveImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  src?: string | null | undefined;
  fileKey?: string | null | undefined;
  variants?: MediaVariants | null | undefined;
  publicBaseUrl?: string | undefined;
  sizes?: string | undefined;
  alt: string;
  pictureClassName?: string | undefined;
}

export function ResponsiveImage({
  src,
  fileKey,
  variants,
  publicBaseUrl,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  alt,
  className,
  pictureClassName,
  ...props
}: ResponsiveImageProps) {
  const sources = React.useMemo(() => {
    return getResponsiveImageSources(
      { fileKey: fileKey ?? '', url: src ?? '', variants: variants ?? null },
      publicBaseUrl,
    );
  }, [src, fileKey, variants, publicBaseUrl]);

  return (
    <picture className={pictureClassName}>
      {sources.avifSrcSet && <source type="image/avif" srcSet={sources.avifSrcSet} sizes={sizes} />}
      {sources.webpSrcSet && <source type="image/webp" srcSet={sources.webpSrcSet} sizes={sizes} />}
      <img
        src={sources.fallbackSrc}
        srcSet={sources.jpegSrcSet}
        sizes={sizes}
        alt={alt}
        className={cn(className)}
        loading="lazy"
        decoding="async"
        {...props}
      />
    </picture>
  );
}
