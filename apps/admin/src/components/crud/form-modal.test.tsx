import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderAdmin } from '@/test/render';
import { FormModal } from './form-modal';

afterEach(cleanup);

function renderForm(submitting: boolean) {
  return renderAdmin(
    <FormModal
      open
      onOpenChange={vi.fn()}
      title="Test form"
      onSubmit={vi.fn()}
      submitting={submitting}
      submitLabel="Save"
    >
      <input aria-label="Field" defaultValue="original" />
    </FormModal>,
  );
}

describe('FormModal', () => {
  it('fields stay enabled while not submitting', () => {
    renderForm(false);
    expect(screen.getByLabelText('Field')).not.toBeDisabled();
  });

  it('disables every field for the duration of the request — an edit made after clicking Save must not be silently dropped (the 2026-09-18 fix)', () => {
    renderForm(true);
    expect(screen.getByLabelText('Field')).toBeDisabled();
  });
});
