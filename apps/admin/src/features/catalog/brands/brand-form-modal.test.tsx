import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
import { brandAliasAvailable } from './api';
import { BrandFormModal } from './brand-form-modal';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, brandAliasAvailable: vi.fn() };
});

const mockedBrandAliasAvailable = vi.mocked(brandAliasAvailable);

afterEach(() => {
  cleanup();
  mockedBrandAliasAvailable.mockReset();
});

describe('BrandFormModal — alias input', () => {
  it("a second Enter press while the first alias check is still in flight doesn't fire a second check — the 2026-09-18 fix", async () => {
    let resolveCheck!: (v: boolean) => void;
    mockedBrandAliasAvailable.mockReturnValueOnce(
      new Promise<boolean>((resolve) => (resolveCheck = resolve)),
    );

    renderAdmin(<BrandFormModal open onOpenChange={vi.fn()} mode="create" onSaved={vi.fn()} />);

    const input = screen.getByPlaceholderText('Add an alias…');
    fireEvent.change(input, { target: { value: 'acme' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // fired before the DOM has necessarily caught up to `disabled` — the
    // explicit in-function guard is what's actually under test here, not
    // the input's own `disabled` attribute.
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockedBrandAliasAvailable).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCheck(true);
    });
    expect(await screen.findByText('acme')).toBeInTheDocument();
  });
});
