export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const;

export const ALLOWED_MEDIA_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];
export type AllowedVideoMimeType = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];
export type AllowedMediaMimeType = (typeof ALLOWED_MEDIA_MIME_TYPES)[number];

export interface DetectedMediaFileType {
  kind: 'image' | 'video';
  mimeType: AllowedMediaMimeType;
}

const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'dash',
  'mmp4',
  'M4V ',
  'M4A ',
  'M4P ',
  'f4v ',
  'kddi',
  '3gp4',
  '3gp5',
  '3gp6',
  'MSNV',
  'NDSC',
  'NSDC',
  'qt  ',
]);

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  let str = '';
  for (let i = start; i < start + length && i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]!);
  }
  return str;
}

/**
 * Detects whether the given binary data matches an allowed image or video file type
 * based on magic bytes inspection (compatible with Browser ArrayBuffer/Uint8Array and Node Buffer).
 */
export function detectMediaFileType(bytes: Uint8Array): DetectedMediaFileType | null {
  if (!bytes || bytes.length < 3) {
    return null;
  }

  // 1. JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: 'image', mimeType: 'image/jpeg' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { kind: 'image', mimeType: 'image/png' };
  }

  // 3. GIF: GIF87a or GIF89a
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && // G
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x38 && // 8
    (bytes[4] === 0x37 || bytes[4] === 0x39) && // 7 or 9
    bytes[5] === 0x61 // a
  ) {
    return { kind: 'image', mimeType: 'image/gif' };
  }

  // 4. WebP: RIFF ... WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return { kind: 'image', mimeType: 'image/webp' };
  }

  // 5. ISO-BMFF: bytes 4..7 'ftyp' (AVIF or MP4)
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70 // p
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const boxLength = view.getUint32(0);
    const maxOffset = Math.min(boxLength > 0 ? boxLength : bytes.length, bytes.length);

    const brands: string[] = [];
    // Major brand at offset 8..11
    brands.push(readAscii(bytes, 8, 4));

    // Compatible brands from offset 16 onwards
    for (let offset = 16; offset + 4 <= maxOffset; offset += 4) {
      brands.push(readAscii(bytes, offset, 4));
    }

    // Check AVIF brands
    if (brands.some((b) => b === 'avif' || b === 'avis' || b === 'mif1' || b === 'msf1')) {
      return { kind: 'image', mimeType: 'image/avif' };
    }

    // Check MP4 brands
    if (
      brands.some(
        (b) =>
          MP4_BRANDS.has(b) ||
          b.startsWith('mp4') ||
          b.startsWith('iso') ||
          b.startsWith('3gp') ||
          b.startsWith('M4V') ||
          b.startsWith('M4A'),
      )
    ) {
      return { kind: 'video', mimeType: 'video/mp4' };
    }
  }

  // 6. WebM: EBML header 1A 45 DF A3 containing ASCII 'webm'
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    for (let i = 4; i + 4 <= bytes.length; i++) {
      if (
        bytes[i] === 0x77 && // w
        bytes[i + 1] === 0x65 && // e
        bytes[i + 2] === 0x62 && // b
        bytes[i + 3] === 0x6d // m
      ) {
        return { kind: 'video', mimeType: 'video/webm' };
      }
    }
  }

  return null;
}

/**
 * Validates if the binary data matches an allowed media file type, optionally matching an expected kind.
 */
export function isValidMediaFileType(bytes: Uint8Array, expectedKind?: 'image' | 'video'): boolean {
  const detected = detectMediaFileType(bytes);
  if (!detected) return false;
  if (expectedKind && detected.kind !== expectedKind) return false;
  return true;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm']);

/**
 * Derives the media kind ('image' | 'video') from a file key or URL extension.
 */
export function getMediaKindFromKey(key: string): 'image' | 'video' | null {
  if (!key || typeof key !== 'string') return null;
  const cleanKey = key.split('?')[0]!.split('#')[0]!.toLowerCase();
  const lastDot = cleanKey.lastIndexOf('.');
  if (lastDot === -1) return null;
  const ext = cleanKey.slice(lastDot);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
}
