'use client';

import { useState } from 'react';
import { Button } from '@shopnetic/ui';

/**
 * Tiny client leaf demonstrating the pattern: the page is a Server Component,
 * only this interactive bit is `'use client'` (plan/CODING-RULES.md section C1/section D1/section E1).
 * The `label` is passed in already-translated from the server.
 */
export function BrowseButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      loading={loading}
      onClick={() => {
        setLoading(true);
        // No catalog yet — this just shows the loading/disabled behaviour.
        setTimeout(() => setLoading(false), 1200);
      }}
    >
      {label}
    </Button>
  );
}
