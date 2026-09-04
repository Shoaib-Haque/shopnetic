'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Project toast layer over `sonner` (plan/CODING-RULES.md D1). Mount `<Toaster/>`
 * once in the app shell; call `notify.*` from anywhere.
 *
 * `notify.saved` is the light-green success toast with a shrinking timer bar,
 * used after a create/edit returns to a list. Messages are already-localized
 * strings (the library stays framework-agnostic — like `Button`'s `loadingText`).
 */

const DEFAULT_MS = 3000;

export function Toaster({ topOffset = 72 }: { topOffset?: number }) {
  return (
    <SonnerToaster
      position="top-center"
      offset={topOffset}
      gap={8}
      duration={DEFAULT_MS}
      toastOptions={{
        style: {
          background: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          border: '1px solid hsl(var(--border))',
        },
      }}
    />
  );
}

function TimerBar({ ms }: { ms: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-success/60"
      style={{ animation: `sn-toast-timer ${ms}ms linear forwards` }}
    />
  );
}

function SavedToast({ message, ms }: { message: string; ms: number }) {
  return (
    <div
      role="status"
      className={cn(
        'relative flex w-[var(--width,356px)] items-center gap-2.5 overflow-hidden rounded-md',
        'border border-success/30 bg-success-muted px-3.5 py-3 text-sm text-foreground shadow-md',
      )}
    >
      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
      <span className="min-w-0 flex-1">{message}</span>
      <TimerBar ms={ms} />
    </div>
  );
}

export const notify = {
  saved(message: string, ms: number = DEFAULT_MS): void {
    toast.custom(() => <SavedToast message={message} ms={ms} />, { duration: ms });
  },
  error(message: string): void {
    toast.error(message);
  },
  info(message: string): void {
    toast(message);
  },
};

export { toast };
