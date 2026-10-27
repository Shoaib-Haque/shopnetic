import type { ReactElement, ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Toaster, TooltipProvider } from '@shopnetic/ui';
import common from '../../messages/en/common.json';

export function SellerTestProviders({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={common}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster />
      </TooltipProvider>
    </NextIntlClientProvider>
  );
}

export function renderSeller(ui: ReactElement): RenderResult {
  return render(ui, { wrapper: SellerTestProviders });
}
