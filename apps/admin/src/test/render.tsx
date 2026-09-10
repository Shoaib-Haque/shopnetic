import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Toaster } from '@shopnetic/ui';
import common from '../../messages/en/common.json';
import staff from '../../messages/en/staff.json';
import admin from '../../messages/en/admin.json';
import catalog from '../../messages/en/catalog.json';

// Mirrors `src/i18n/request.ts`'s namespace merge, so a test asserts against
// the real English copy (not a translation key) — a typo'd or missing message
// key fails the test the same way it'd show up broken in the app.
const messages = { ...common, ...staff, ...admin, ...catalog };

/**
 * Render helper for components that call `useTranslations` and/or `notify.*`
 * (Sonner toasts): provides the real `NextIntlClientProvider` and mounts
 * `<Toaster />` alongside so toast assertions (`screen.findByText(...)`) work
 * without mocking `@shopnetic/ui`.
 */
export function renderAdmin(ui: ReactElement): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
      <Toaster />
    </NextIntlClientProvider>,
  );
}
