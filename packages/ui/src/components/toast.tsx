'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';
import { CheckCircle2, CircleAlert, Info, type LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Project toast layer over `sonner` (plan/CODING-RULES.md D1). Mount `<Toaster/>`
 * once in the app shell; call `notify.*` from anywhere. Messages are
 * already-localized strings (the library stays framework-agnostic).
 *
 * - `notify.saved` / `notify.error` / `notify.info` — one `BarToast` box, tone
 *   sets the icon and colours; every one carries a shrinking timer bar that runs
 *   the toast's `duration` (default 3s; pass `ms` to `error` to hold it longer).
 * - `notify.undo`  — dark toast with an **Undo** button + a 20s timer bar. Only
 *   the latest one is live: a fixed toast id means each call replaces the
 *   previous and restarts a full window (plan/CODING-RULES.md section G8).
 *
 * Width: our custom toasts are `min(356px, 100vw - 2rem)` so the box — and the
 * Undo button — never runs off a narrow screen (sonner's built-in toasts shrink
 * below 600px on their own; `toast.custom` content does not). The bar is a plain
 * CSS animation, so it keeps draining while sonner pauses the dismiss timer on
 * hover / when the tab is hidden — treat it as indicative, not exact.
 */

const DEFAULT_MS = 3000;
const UNDO_MS = 20_000;
const UNDO_ID = 'sn-undo';
/** neutralises the sonner wrapper so only our own box paints (no border ring) */
const BARE = { background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 } as const;

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

function TimerBar({ ms, className }: { ms: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left',
        className ?? 'bg-success/60',
      )}
      style={{ animation: `sn-toast-timer ${ms}ms linear forwards` }}
    />
  );
}

type Tone = 'success' | 'error' | 'info';
const TONE: Record<Tone, { box: string; icon: string; bar: string; Icon: LucideIcon }> = {
  success: {
    box: 'border-success/30 bg-success-muted',
    icon: 'text-success',
    bar: 'bg-success/60',
    Icon: CheckCircle2,
  },
  error: {
    box: 'border-destructive/30 bg-destructive-muted',
    icon: 'text-destructive',
    bar: 'bg-destructive/60',
    Icon: CircleAlert,
  },
  info: {
    box: 'border-border bg-background',
    icon: 'text-muted-foreground',
    bar: 'bg-muted-foreground/40',
    Icon: Info,
  },
};

function BarToast({ tone, message, ms }: { tone: Tone; message: string; ms: number }) {
  const s = TONE[tone];
  return (
    <div
      role="status"
      className={cn(
        'relative flex w-[min(356px,100vw_-_2rem)] items-center gap-2.5 overflow-hidden rounded-md',
        'border px-3.5 py-3 text-sm text-foreground shadow-md',
        s.box,
      )}
    >
      <s.Icon className={cn('mt-0.5 size-4 shrink-0 self-start', s.icon)} aria-hidden />
      <span className="line-clamp-2 min-w-0 flex-1" title={message}>
        {message}
      </span>
      <TimerBar ms={ms} className={s.bar} />
    </div>
  );
}

function UndoToast({
  message,
  ms,
  undoLabel,
  onUndo,
}: {
  message: string;
  ms: number;
  undoLabel: string;
  onUndo: () => void;
}) {
  return (
    <div
      role="status"
      className="relative flex w-[min(356px,100vw_-_2rem)] items-center gap-3 overflow-hidden rounded-md bg-foreground px-3.5 py-3 text-sm text-background shadow-md"
    >
      <span className="line-clamp-2 min-w-0 flex-1" title={message}>
        {message}
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="-my-1 shrink-0 rounded px-2 py-1 font-semibold text-background underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-background"
      >
        {undoLabel}
      </button>
      <TimerBar ms={ms} className="bg-background/40" />
    </div>
  );
}

function showBar(tone: Tone, message: string, ms: number): void {
  toast.custom(() => <BarToast tone={tone} message={message} ms={ms} />, {
    duration: ms,
    style: BARE,
  });
}

function showSaved(message: string, ms: number = DEFAULT_MS): void {
  showBar('success', message, ms);
}

function showError(message: string, ms: number = DEFAULT_MS): void {
  showBar('error', message, ms);
}

function showInfo(message: string, ms: number = DEFAULT_MS): void {
  showBar('info', message, ms);
}

interface UndoOptions {
  onUndo: () => void | Promise<void>;
  ms?: number;
  /** button text — pass a localized string; falls back to "Undo" */
  undoLabel?: string;
  /** shown after a successful undo — falls back to "Action undone." */
  undoneMessage?: string;
  /** shown if `onUndo` rejects; omit and the caller's `onUndo` owns error display */
  errorMessage?: string;
}

function showUndo(message: string, opts: UndoOptions): void {
  const ms = opts.ms ?? UNDO_MS;
  const run = (): void => {
    toast.dismiss(UNDO_ID);
    void Promise.resolve()
      .then(opts.onUndo)
      .then(() => showSaved(opts.undoneMessage ?? 'Action undone.'))
      .catch(() => {
        if (opts.errorMessage) showError(opts.errorMessage);
      });
  };
  toast.custom(
    () => <UndoToast message={message} ms={ms} undoLabel={opts.undoLabel ?? 'Undo'} onUndo={run} />,
    { id: UNDO_ID, duration: ms, style: BARE },
  );
}

export const notify = {
  saved: showSaved,
  error: showError,
  info: showInfo,
  undo: showUndo,
};

export { toast };
