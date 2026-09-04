import type { ReactNode } from 'react';
import '@shopnetic/ui/tokens.css';
import '@/styles/globals.css';

/**
 * Root layout. `<html>`/`<body>` live in `[locale]/layout.tsx` so `lang` can be
 * set from the route locale (plan/24 section 8). This file only passes children through.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
