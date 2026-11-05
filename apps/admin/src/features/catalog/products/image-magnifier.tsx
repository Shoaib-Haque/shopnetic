'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type TouchEvent,
} from 'react';
import { cn, ResponsiveImage } from '@shopnetic/ui';
import type { MediaVariants } from '@shopnetic/contracts';

export interface ImageMagnifierProps {
  src: string;
  alt: string;
  variants?: MediaVariants | null | undefined;
  sizes?: string | undefined;
  zoomLevel?: number;
  lensSize?: number;
  mode?: 'flyout' | 'loupe';
  flyoutPlacement?: 'auto' | 'right' | 'left' | 'inside';
  className?: string;
  flyoutClassName?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export function ImageMagnifier({
  src,
  alt,
  variants,
  sizes = '(max-width: 1024px) 90vw, 600px',
  zoomLevel = 2.5,
  lensSize = 120,
  mode = 'flyout',
  flyoutPlacement = 'auto',
  className,
  flyoutClassName,
  onLoad,
  onError,
}: ImageMagnifierProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isActive, setIsActive] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [computedPlacement, setComputedPlacement] = useState<'right' | 'left' | 'inside'>('right');
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  const updatePlacement = useCallback(() => {
    if (flyoutPlacement !== 'auto') {
      setComputedPlacement(flyoutPlacement);
      return;
    }
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const boundary =
      containerRef.current.closest('[role="dialog"]') ??
      containerRef.current.closest('[data-scroll-container]') ??
      document.body;
    const boundaryRect = boundary.getBoundingClientRect();

    const flyoutWidth = window.innerWidth >= 768 ? 384 : 320;
    const gap = 16;

    const spaceRight = boundaryRect.right - rect.right - gap;
    const spaceLeft = rect.left - boundaryRect.left - gap;

    if (spaceRight >= flyoutWidth) {
      setComputedPlacement('right');
    } else if (spaceLeft >= flyoutWidth) {
      setComputedPlacement('left');
    } else {
      setComputedPlacement('inside');
    }
  }, [flyoutPlacement]);

  const updateContainerSize = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
      updatePlacement();
    }
  }, [updatePlacement]);

  useEffect(() => {
    updateContainerSize();
    window.addEventListener('resize', updateContainerSize);
    return () => {
      window.removeEventListener('resize', updateContainerSize);
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, [updateContainerSize]);

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const clampedX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const clampedY = Math.max(0, Math.min(clientY - rect.top, rect.height));

    const xPercent = (clampedX / rect.width) * 100;
    const yPercent = (clampedY / rect.height) * 100;

    setCoords({ x: xPercent, y: yPercent });
    if (!isActive) setIsActive(true);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    handlePointerMove(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (touch) {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      containerRef.current?.focus({ preventScroll: true });
      updateContainerSize();
      handlePointerMove(touch.clientX, touch.clientY);
      setIsActive(true);
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (touch) {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      handlePointerMove(touch.clientX, touch.clientY);
    }
  };

  const handleTouchEnd = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      setIsActive(false);
    }, 100);
  };

  const handleMouseEnter = (e: MouseEvent<HTMLDivElement>) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    containerRef.current?.focus({ preventScroll: true });
    updateContainerSize();
    handlePointerMove(e.clientX, e.clientY);
    setIsActive(true);
  };

  const handleMouseLeave = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      setIsActive(false);
    }, 80);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 5;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setCoords((prev) => ({ ...prev, x: Math.max(0, prev.x - step) }));
      setIsActive(true);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setCoords((prev) => ({ ...prev, x: Math.min(100, prev.x + step) }));
      setIsActive(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCoords((prev) => ({ ...prev, y: Math.max(0, prev.y - step) }));
      setIsActive(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCoords((prev) => ({ ...prev, y: Math.min(100, prev.y + step) }));
      setIsActive(true);
    } else if (e.key === 'Escape') {
      if (isActive) {
        e.preventDefault();
        e.stopPropagation();
        setIsActive(false);
      }
    }
  };

  // Lens dimensions
  const effectiveLensWidth =
    containerSize.width > 0 ? Math.min(lensSize, containerSize.width / zoomLevel) : lensSize;
  const effectiveLensHeight =
    containerSize.height > 0 ? Math.min(lensSize, containerSize.height / zoomLevel) : lensSize;

  const lensLeftPx =
    containerSize.width > 0
      ? Math.max(
          0,
          Math.min(
            (coords.x / 100) * containerSize.width - effectiveLensWidth / 2,
            containerSize.width - effectiveLensWidth,
          ),
        )
      : 0;

  const lensTopPx =
    containerSize.height > 0
      ? Math.max(
          0,
          Math.min(
            (coords.y / 100) * containerSize.height - effectiveLensHeight / 2,
            containerSize.height - effectiveLensHeight,
          ),
        )
      : 0;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      {/* Main Image Viewport — has stable dimensions independent of flyout visibility */}
      <div
        ref={containerRef}
        data-testid="image-magnifier-container"
        tabIndex={0}
        role="region"
        aria-label={alt}
        onClick={() => containerRef.current?.focus({ preventScroll: true })}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative overflow-hidden cursor-crosshair select-none bg-muted/20 border border-border rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring flex items-center justify-center',
          'touch-none',
        )}
      >
        <ResponsiveImage
          src={src}
          variants={variants}
          sizes={sizes}
          alt={alt}
          onLoad={onLoad}
          onError={onError}
          className="max-h-[65vh] w-auto max-w-full object-contain pointer-events-none"
        />

        {/* Hover Lens Box */}
        {isActive && (
          <div
            data-testid="image-magnifier-lens"
            style={{
              width: `${effectiveLensWidth}px`,
              height: `${effectiveLensHeight}px`,
              left: `${lensLeftPx}px`,
              top: `${lensTopPx}px`,
            }}
            className={cn(
              'absolute border-2 border-primary/80 bg-primary/20 backdrop-contrast-125 pointer-events-none shadow-xs rounded-xs',
              !reducedMotion && 'motion-safe:transition-[left,top] motion-safe:duration-75',
            )}
          />
        )}

        {/* Loupe Mode (Floating Circular / Square Loupe over Cursor) */}
        {isActive && mode === 'loupe' && (
          <div
            data-testid="image-magnifier-loupe"
            style={{
              width: `${lensSize * 1.5}px`,
              height: `${lensSize * 1.5}px`,
              left: `${lensLeftPx}px`,
              top: `${lensTopPx}px`,
              backgroundImage: `url(${src})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: `${coords.x}% ${coords.y}%`,
              backgroundSize: `${zoomLevel * 100}%`,
            }}
            className="absolute z-20 pointer-events-none rounded-full border-2 border-primary shadow-xl bg-background overflow-hidden"
          />
        )}
      </div>

      {/* Flyout Magnified Panel (Amazon Desktop Style) — ABSOLUTELY POSITIONED to eliminate layout shift/flicker */}
      {isActive && mode === 'flyout' && (
        <div
          data-testid="image-magnifier-flyout"
          style={{
            backgroundImage: `url(${src})`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: `${coords.x}% ${coords.y}%`,
            backgroundSize: `${zoomLevel * 100}%`,
          }}
          className={cn(
            'absolute z-30 pointer-events-none rounded-md border-2 border-border shadow-2xl bg-card overflow-hidden',
            computedPlacement === 'right' &&
              'w-72 h-72 sm:w-80 sm:h-80 md:w-96 md:h-96 left-full top-0 ml-4',
            computedPlacement === 'left' &&
              'w-72 h-72 sm:w-80 sm:h-80 md:w-96 md:h-96 right-full top-0 mr-4',
            computedPlacement === 'inside' && [
              'w-64 h-64 sm:w-72 sm:h-72 max-w-[80%] max-h-[80%] top-2',
              coords.x > 50 ? 'left-2' : 'right-2',
            ],
            !reducedMotion &&
              'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150',
            flyoutClassName,
          )}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
