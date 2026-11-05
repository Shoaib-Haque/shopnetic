import sharp from 'sharp';
import {
  RESPONSIVE_IMAGE_WIDTHS,
  type ResponsiveImageWidth,
  type ResponsiveImageFormat,
  type MediaVariants,
  resolveMediaUrl,
} from '@shopnetic/contracts';

export interface GeneratedImageVariant {
  width: ResponsiveImageWidth;
  format: ResponsiveImageFormat;
  key: string;
  data: Buffer;
  actualWidth: number;
  actualHeight: number;
}

export function computeVariantKey(
  fileKey: string,
  width: number,
  format: ResponsiveImageFormat,
): string {
  const lastSlash = fileKey.lastIndexOf('/');
  const dir = lastSlash >= 0 ? fileKey.slice(0, lastSlash) : '';
  const fileName = lastSlash >= 0 ? fileKey.slice(lastSlash + 1) : fileKey;
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = format === 'jpeg' ? 'jpg' : format;

  return dir
    ? `${dir}/variants/${baseName}-w${width}.${ext}`
    : `variants/${baseName}-w${width}.${ext}`;
}

export async function generateImageVariantsBuffers(
  sourceBuffer: Buffer,
  fileKey: string,
): Promise<GeneratedImageVariant[]> {
  const results: GeneratedImageVariant[] = [];

  for (const width of RESPONSIVE_IMAGE_WIDTHS) {
    const pipeline = sharp(sourceBuffer).resize({ width, withoutEnlargement: true });

    // AVIF (quality: 80)
    const avifRes = await pipeline
      .clone()
      .avif({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    results.push({
      width,
      format: 'avif',
      key: computeVariantKey(fileKey, width, 'avif'),
      data: avifRes.data,
      actualWidth: avifRes.info.width,
      actualHeight: avifRes.info.height,
    });

    // WebP (quality: 85)
    const webpRes = await pipeline
      .clone()
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    results.push({
      width,
      format: 'webp',
      key: computeVariantKey(fileKey, width, 'webp'),
      data: webpRes.data,
      actualWidth: webpRes.info.width,
      actualHeight: webpRes.info.height,
    });

    // JPEG (quality: 85)
    const jpegRes = await pipeline
      .clone()
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    results.push({
      width,
      format: 'jpeg',
      key: computeVariantKey(fileKey, width, 'jpeg'),
      data: jpegRes.data,
      actualWidth: jpegRes.info.width,
      actualHeight: jpegRes.info.height,
    });
  }

  return results;
}

export function buildMediaVariantsRecord(
  variants: GeneratedImageVariant[],
  baseUrl?: string,
): MediaVariants {
  const record: MediaVariants = {};
  for (const v of variants) {
    const wKey = String(v.width);
    if (!record[wKey]) {
      record[wKey] = {};
    }
    record[wKey]![v.format] = {
      key: v.key,
      url: resolveMediaUrl(v.key, baseUrl),
      width: v.actualWidth,
      height: v.actualHeight,
      format: v.format,
    };
  }
  return record;
}
