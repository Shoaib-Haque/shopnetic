'use client';

import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import { Skeleton } from './skeleton';
import { cn } from '../lib/cn';

export interface QrCodeProps {
  /** the raw payload to encode — e.g. an `otpauth://` URI */
  value: string;
  size?: number;
  className?: string;
  alt?: string;
}

/**
 * Renders `value` as a scannable QR (PNG data URI, generated client-side —
 * nothing is sent anywhere to produce it). A `<Skeleton>` fills the frame
 * while the encoder runs so the layout doesn't jump. plan/CODING-RULES.md
 * section D3.
 */
export function QrCode({ value, size = 180, className, alt = 'QR code' }: QrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <Skeleton className={cn('rounded-md', className)} style={{ width: size, height: size }} />
    );
  }
  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt={alt}
      className={cn('rounded-md', className)}
    />
  );
}
