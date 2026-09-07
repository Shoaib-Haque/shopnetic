'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Project toast layer over `sonner` (plan/CODING-RULES.md D1). Mount `<Toaster/>`
 * once in the app shell; call `notify.*` from anywhere. Messages are
 * already-localized strings (the library stays framework-agnostic).
 *
 * - `notify.saved` — light-green success toast with a shrinking timer bar.
 * - `notify.undo`  — dark toast with an **Undo** button + a 30s timer bar. Only
 *   the latest one is live: a fixed toast id means each call replaces the
 *   previous and restarts a full window (plan/CODING-RULES.md section G8).
 */

const DEFAULT_MS = 3000;
const UNDO_MS = 30_000;
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

function SavedToast({ message, ms }: { message: string; ms: number }) {
  return (
    <div
      role="status"
      className={cn(
        'relative flex w-[var(--width,356px)] items-center gap-2.5 overflow-hidden rounded-md',
        'border border-success/30 bg-success-muted px-3.5 py-3 text-sm text-foreground shadow-md',
      )}
    >
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 self-start text-success" aria-hidden />
      <span className="line-clamp-2 min-w-0 flex-1" title={message}>
        {message}
      </span>
      <TimerBar ms={ms} />
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
      className="relative flex w-[var(--width,356px)] items-center gap-3 overflow-hidden rounded-md bg-foreground px-3.5 py-3 text-sm text-background shadow-md"
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

function showSaved(message: string, ms: number = DEFAULT_MS): void {
  toast.custom(() => <SavedToast message={message} ms={ms} />, { duration: ms, style: BARE });
}

function showError(message: string): void {
  toast.error(message);
}

interface UndoOptions {
  onUndo: () => void | Promise<void>;
  ms?: number;
  /** button text — pass a localized string; falls back to "Undo" */
  undoLabel?: string;
  /** shown after a successful undo — falls back to "Action undone." */
  undoneMessage?: string;
  /** shown if `onUndo` rejects — falls back to "Couldn't undo that." */
  errorMessage?: string;
}

function showUndo(message: string, opts: UndoOptions): void {
  const ms = opts.ms ?? UNDO_MS;
  const run = (): void => {
    toast.dismiss(UNDO_ID);
    void Promise.resolve()
      .then(opts.onUndo)
      .then(() => showSaved(opts.undoneMessage ?? 'Action undone.'))
      .catch(() => showError(opts.errorMessage ?? "Couldn't undo that."));
  };
  toast.custom(
    () => <UndoToast message={message} ms={ms} undoLabel={opts.undoLabel ?? 'Undo'} onUndo={run} />,
    { id: UNDO_ID, duration: ms, style: BARE },
  );
}

export const notify = {
  saved: showSaved,
  error: showError,
  info: (message: string): void => void toast(message),
  undo: showUndo,
};

export { toast };
