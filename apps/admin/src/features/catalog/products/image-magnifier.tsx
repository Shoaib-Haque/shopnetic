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
import { cn } from '@shopnetic/ui';

export interface ImageMagnifierProps {
  src: string;
  alt: string;
  zoomLevel?: number;
  lensSize?: number;
  mode?: 'flyout' | 'loupe';
  className?: string;
  flyoutClassName?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export function ImageMagnifier({
  src,
  alt,
  zoomLevel = 2.5,
  lensSize = 120,
  mode = 'flyout',
  className,
  flyoutClassName,
  onLoad,
  onError,
}: ImageMagnifierProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const updateContainerSize = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    }
  }, []);

  useEffect(() => {
    updateContainerSize();
    window.addEventListener('resize', updateContainerSize);
    return () => window.removeEventListener('resize', updateContainerSize);
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
    handlePointerMove(e.clientX, e.clientY);
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (touch) {
      handlePointerMove(touch.clientX, touch.clientY);
    }
  };

  const handleMouseEnter = (e: MouseEvent<HTMLDivElement>) => {
    updateContainerSize();
    handlePointerMove(e.clientX, e.clientY);
    setIsActive(true);
  };

  const handleMouseLeave = () => {
    setIsActive(false);
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
      setIsActive(false);
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
    <div className={cn('relative flex flex-col md:flex-row items-center gap-4', className)}>
      {/* Main Image Viewport */}
      <div
        ref={containerRef}
        data-testid="image-magnifier-container"
        tabIndex={0}
        role="region"
        aria-label={alt}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative overflow-hidden cursor-crosshair select-none bg-muted/20 border border-border rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring flex items-center justify-center',
          'touch-none',
        )}
      >
        <img
          src={src}
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
            className="absolute border-2 border-primary/80 bg-primary/20 backdrop-contrast-125 pointer-events-none shadow-xs rounded-xs motion-safe:transition-[left,top] motion-safe:duration-75"
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

      {/* Flyout Magnified Panel (Amazon Desktop Style) */}
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
            'w-72 h-72 md:w-96 md:h-96 rounded-md border-2 border-border shadow-2xl bg-card overflow-hidden shrink-0 pointer-events-none animate-in fade-in zoom-in-95 duration-150',
            flyoutClassName,
          )}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
