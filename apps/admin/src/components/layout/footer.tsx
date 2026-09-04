'use client';

import { useTranslations } from 'next-intl';

/**
 * Sits at the bottom of the scrollable main column — so it spans the main area
 * (full width when the sidebar is collapsed, narrower when expanded) and pins to
 * the viewport bottom when content is short, else flows after the content.
 */
export function Footer() {
  const t = useTranslations('admin');
  return (
    <footer className="flex h-12 shrink-0 items-center justify-center border-t border-border px-4 text-center text-xs text-muted-foreground">
      {t('footer.text')}
    </footer>
  );
}
