'use client';

import { useState, useEffect, useRef } from 'react';

export type SlugCheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export function useSlugCheck(slug: string, initialValidSlug?: string) {
  const [status, setStatus] = useState<SlugCheckStatus>(() => {
    if (initialValidSlug && slug === initialValidSlug) return 'available';
    return 'idle';
  });
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = slug.trim().toLowerCase();

    // If matches initial existing valid slug, it's available for this seller
    if (initialValidSlug && trimmed === initialValidSlug) {
      setStatus('available');
      setErrorDetail(null);
      return;
    }

    if (!trimmed || trimmed.length < 3) {
      setStatus('idle');
      setErrorDetail(null);
      return;
    }

    // Slug format regex: lowercase letters, numbers, hyphens
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
      setStatus('idle');
      setErrorDetail(null);
      return;
    }

    setStatus('checking');
    setErrorDetail(null);

    controllerRef.current?.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/seller/shops/check-slug?slug=${encodeURIComponent(trimmed)}`,
          {
            signal: ctrl.signal,
          },
        );

        if (!res.ok) {
          // Graceful degradation on 500 / server error
          setStatus('error');
          setErrorDetail('Unable to verify slug availability right now');
          return;
        }

        const json = await res.json();
        const available = json?.data?.available ?? false;
        if (available) {
          setStatus('available');
          setErrorDetail(null);
        } else {
          setStatus('taken');
          setErrorDetail('This shop URL is already taken');
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setStatus('error');
        setErrorDetail('Unable to verify slug availability right now');
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [slug, initialValidSlug]);

  return { status, errorDetail };
}
