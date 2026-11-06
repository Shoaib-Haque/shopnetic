import * as React from 'react';
import { getResponsiveImageSources, type MediaVariants } from '@shopnetic/contracts';
import { cn } from '../lib/cn';

export const DUMMY_MEDIA_PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300" fill="%23f1f5f9"><rect width="400" height="300" fill="%23f8fafc"/><rect x="1" y="1" width="398" height="298" fill="none" stroke="%23e2e8f0" stroke-width="2"/><g fill="%2394a3b8"><path d="M160 130a20 20 0 1 0 0-40 20 20 0 0 0 0 40zm120 70H120l45-60 35 45 25-30 55 45z"/></g><text x="50%" y="240" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="13" font-weight="500" fill="%2394a3b8" text-anchor="middle">Image unavailable</text></svg>';

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
  onError,
  ...props
}: ResponsiveImageProps) {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [src, fileKey]);

  const sources = React.useMemo(() => {
    return getResponsiveImageSources(
      { fileKey: fileKey ?? '', url: src ?? '', variants: variants ?? null },
      publicBaseUrl,
    );
  }, [src, fileKey, variants, publicBaseUrl]);

  const handleError = React.useCallback(
    (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      setHasError(true);
      onError?.(e);
    },
    [onError],
  );

  const finalSrc = hasError || !sources.fallbackSrc ? DUMMY_MEDIA_PLACEHOLDER : sources.fallbackSrc;
  const showResponsiveSources = !hasError && Boolean(sources.fallbackSrc);

  return (
    <picture className={pictureClassName}>
      {showResponsiveSources && sources.avifSrcSet && (
        <source type="image/avif" srcSet={sources.avifSrcSet} sizes={sizes} />
      )}
      {showResponsiveSources && sources.webpSrcSet && (
        <source type="image/webp" srcSet={sources.webpSrcSet} sizes={sizes} />
      )}
      <img
        src={finalSrc}
        {...(showResponsiveSources && sources.jpegSrcSet
          ? { srcSet: sources.jpegSrcSet, sizes }
          : {})}
        alt={alt}
        className={cn(className)}
        loading="lazy"
        decoding="async"
        onError={handleError}
        {...props}
      />
    </picture>
  );
}
