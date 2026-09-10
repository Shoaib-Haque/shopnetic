'use client';

/**
 * Segment error boundary for the protected admin area. It wraps the page and
 * its children but NOT the sibling `layout.tsx`, so `AdminShell` (topbar /
 * sidebar) stays put and only the content area is replaced — a render throw in
 * one page no longer drops the whole shell to `global-error.tsx` (plan/CODING-RULES.md
 * section F4). Copy is inline English, like `global-error.tsx` / `not-found.tsx`:
 * a boundary is the last place a translation lookup should be able to throw.
 * No retry button by design — the user reloads the page (a full reload re-runs
 * the server gate, which is what a broken section needs anyway).
 */
export default function ProtectedError() {
  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <p className="text-sm text-muted-foreground">Something went wrong. Please reload the page.</p>
    </div>
  );
}
