import type { CSSProperties } from 'react';
import { cn } from '../lib/cn';

export interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

/** A pulsing placeholder block for content that's still loading. */
export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      style={style}
    />
  );
}
