import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { plainTextToDoc, type ProductDescriptionDoc } from '@shopnetic/contracts';
import { Modal, ModalContent, ModalTitle } from '@shopnetic/ui';
import { AdminTestProviders, renderAdmin } from '@/test/render';
import { RichTextEditor } from './rich-text-editor';

describe('RichTextEditor', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the editor container, toolbar, and accessible contenteditable textbox with id', () => {
    const onChange = vi.fn();
    renderAdmin(
      <RichTextEditor
        id="product-desc"
        value={null}
        onChange={onChange}
        placeholder="Enter rich details..."
      />,
    );

    expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
    expect(screen.getByTestId('rich-text-toolbar')).toBeInTheDocument();
    expect(screen.getByText('Enter rich details...')).toBeInTheDocument();

    const editorEl = document.getElementById('product-desc');
    expect(editorEl).toBeInTheDocument();
    expect(editorEl).toHaveAttribute('role', 'textbox');
    expect(editorEl).toHaveAttribute('contenteditable', 'true');
    expect(editorEl).toHaveAttribute('tabindex', '0');
  });

  it('renders all toolbar formatting buttons with proper accessible titles', () => {
    const onChange = vi.fn();
    renderAdmin(<RichTextEditor value={null} onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Strikethrough' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Heading 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Heading 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bullet List' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Numbered List' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quote' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Divider' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear Formatting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
  });

  it('disables all toolbar buttons and marks editor disabled in read-only mode', () => {
    const onChange = vi.fn();
    renderAdmin(
      <RichTextEditor
        id="product-desc"
        disabled
        value={plainTextToDoc('Read-only description')}
        onChange={onChange}
      />,
    );

    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }

    const editorEl = document.getElementById('product-desc');
    expect(editorEl).toHaveAttribute('contenteditable', 'false');
    expect(editorEl).toHaveAttribute('tabindex', '-1');
  });

  it('opens link popover on Link button click, requires text when none is selected, and validates link protocol', async () => {
    const onChange = vi.fn();
    renderAdmin(<RichTextEditor value={null} onChange={onChange} />);

    const linkBtn = screen.getByRole('button', { name: 'Link' });
    fireEvent.click(linkBtn);

    await waitFor(() => {
      expect(screen.getByText('Insert Link')).toBeInTheDocument();
      expect(screen.getByText('Text to display')).toBeInTheDocument();
      expect(screen.getByText('Link URL')).toBeInTheDocument();
    });

    const textInput = screen.getByPlaceholderText('e.g. User manual, Storefront');
    const urlInput = screen.getByPlaceholderText('https://example.com');
    const applyBtn = screen.getByRole('button', { name: 'Apply' });

    // Validation: text is required when no text was selected
    fireEvent.change(urlInput, { target: { value: 'https://shopnetic.com/manual' } });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(screen.getByText('Text to display is required.')).toBeInTheDocument();
    });

    // Enter text
    fireEvent.change(textInput, { target: { value: 'User Manual' } });

    // Invalid protocol
    fireEvent.change(urlInput, { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(
        screen.getByText('URL must start with https://, http://, mailto:, tel:, or /'),
      ).toBeInTheDocument();
    });

    // Protocol-relative URL bypass attempt (//evil.com) must also be rejected
    fireEvent.change(urlInput, { target: { value: '//evil.com/phish' } });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(
        screen.getByText('URL must start with https://, http://, mailto:, tel:, or /'),
      ).toBeInTheDocument();
    });

    // WHATWG stripped tab/newline bypass attempt (/\t/evil.com) must also be rejected
    fireEvent.change(urlInput, { target: { value: '/\t/evil.com' } });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(
        screen.getByText('URL must start with https://, http://, mailto:, tel:, or /'),
      ).toBeInTheDocument();
    });

    // Valid protocol and text closes popover and inserts link content
    fireEvent.change(urlInput, { target: { value: 'https://shopnetic.com/manual' } });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(screen.queryByText('Insert Link')).not.toBeInTheDocument();
    });
  });

  it('renders a bounded scrollable content container preventing unbounded growth', () => {
    const onChange = vi.fn();
    renderAdmin(<RichTextEditor value={null} onChange={onChange} />);

    const contentArea = screen.getByTestId('rich-text-content-area');
    expect(contentArea).toBeInTheDocument();
    expect(contentArea).toHaveClass('min-h-[140px]');
    expect(contentArea).toHaveClass('max-h-[260px]');
    expect(contentArea).toHaveClass('overflow-y-auto');
  });

  it('skips the text input field when editing an existing link', async () => {
    const onChange = vi.fn();
    const docWithLink: ProductDescriptionDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Existing Link Text',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/existing' } }],
            },
          ],
        },
      ],
    };

    renderAdmin(<RichTextEditor value={docWithLink} onChange={onChange} />);

    // In TipTap with an existing link, when clicking the link, it activates
    const linkBtn = screen.getByRole('button', { name: 'Link' });
    fireEvent.click(linkBtn);

    await waitFor(() => {
      // When existing link or selection exists, it displays Link URL directly
      expect(screen.getByPlaceholderText('https://example.com')).toBeInTheDocument();
    });
  });

  it('shows size indicator warning when document byte size is near the limit', () => {
    const onChange = vi.fn();
    // Build a large document ~36KB
    const largeDoc: ProductDescriptionDoc = {
      type: 'doc',
      content: Array.from({ length: 400 }, (_, i) => ({
        type: 'paragraph' as const,
        content: [
          {
            type: 'text' as const,
            text: `Detailed product specification paragraph ${i} with long descriptive text content.`,
          },
        ],
      })),
    };

    renderAdmin(<RichTextEditor value={largeDoc} onChange={onChange} />);

    // Should render the KB counter badge
    expect(screen.getByText(/KB \/ 50 KB/)).toBeInTheDocument();
  });

  it('associates id directly with contenteditable textbox without redundant aria-hidden textarea', () => {
    const onChange = vi.fn();
    renderAdmin(<RichTextEditor id="product-desc" value={null} onChange={onChange} />);

    const editorEl = document.getElementById('product-desc');
    expect(editorEl).toBeInTheDocument();
    expect(editorEl).toHaveAttribute('role', 'textbox');
    expect(editorEl).toHaveAttribute('aria-multiline', 'true');
    // Ensure no conflicting aria-hidden textarea exists in DOM
    expect(document.querySelector('textarea')).not.toBeInTheDocument();
  });

  it('delegates label click to editor focus when associated via htmlFor', () => {
    const onChange = vi.fn();
    renderAdmin(
      <div>
        <label htmlFor="product-desc">Product Description Label</label>
        <RichTextEditor id="product-desc" value={null} onChange={onChange} />
      </div>,
    );

    const label = screen.getByText('Product Description Label');
    const editorEl = document.getElementById('product-desc');
    expect(editorEl).toBeInTheDocument();
    expect(editorEl).not.toHaveFocus();

    fireEvent.click(label);

    expect(editorEl).toHaveFocus();
  });

  it('does not delegate label click to editor focus when disabled', () => {
    const onChange = vi.fn();
    renderAdmin(
      <div>
        <label htmlFor="product-desc-disabled">Product Description Disabled</label>
        <RichTextEditor id="product-desc-disabled" disabled value={null} onChange={onChange} />
      </div>,
    );

    const label = screen.getByText('Product Description Disabled');
    const editorEl = document.getElementById('product-desc-disabled');
    expect(editorEl).toBeInTheDocument();

    fireEvent.click(label);

    expect(editorEl).not.toHaveFocus();
    const container = screen.getByTestId('rich-text-editor');
    expect(container).toHaveClass('cursor-default');
    expect(container.className).not.toContain('focus-within:border-ring');
  });

  it('displays live word and character counts in footer bar', () => {
    const doc = plainTextToDoc('Ten little monkeys jumping on the bed');
    renderAdmin(<RichTextEditor value={doc} onChange={vi.fn()} />);

    expect(screen.getByText('7 words')).toBeInTheDocument();
    expect(screen.getByText('37 characters')).toBeInTheDocument();
    expect(screen.getByText(/0\.1 KB \/ 50 KB/)).toBeInTheDocument();
  });

  it('toggles full-screen distraction-free mode and exits on Escape', () => {
    renderAdmin(<RichTextEditor value={null} onChange={vi.fn()} />);

    const fullscreenBtn = screen.getByRole('button', { name: /Full screen/i });
    expect(fullscreenBtn).toBeInTheDocument();

    // Click full screen
    fireEvent.click(fullscreenBtn);

    const editorContainer = screen.getByTestId('rich-text-editor');
    expect(editorContainer).toHaveClass('fixed', 'inset-0', 'z-50');

    const exitBtn = screen.getByRole('button', { name: /Exit full screen/i });
    expect(exitBtn).toBeInTheDocument();

    // Press Escape to exit
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(editorContainer).not.toHaveClass('fixed', 'inset-0');
    expect(screen.getByRole('button', { name: /Full screen/i })).toBeInTheDocument();
  });

  it('inserts structured content template via template dropdown', async () => {
    const onChange = vi.fn();
    renderAdmin(<RichTextEditor value={null} onChange={onChange} />);

    const templatesBtn = screen.getByRole('button', { name: /Insert template/i });
    expect(templatesBtn).toBeInTheDocument();

    fireEvent.click(templatesBtn);

    const featureTemplateBtn = await screen.findByRole('button', {
      name: /Features & Specifications/i,
    });
    expect(featureTemplateBtn).toBeInTheDocument();

    fireEvent.click(featureTemplateBtn);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'doc',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'heading',
              attrs: expect.objectContaining({ level: 2 }),
            }),
            expect.objectContaining({
              type: 'bulletList',
            }),
          ]),
        }),
      );
    });
  });

  it('renders superscript, subscript, and alignment formatting buttons', () => {
    renderAdmin(<RichTextEditor value={null} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Superscript' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subscript' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Align left' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Align center' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Align right' })).toBeInTheDocument();
  });

  it('inserts table via table popover button', async () => {
    const onChange = vi.fn();
    renderAdmin(<RichTextEditor value={null} onChange={onChange} />);

    const tableBtn = screen.getByRole('button', { name: 'Table' });
    expect(tableBtn).toBeInTheDocument();

    fireEvent.click(tableBtn);

    const insertTableBtn = await screen.findByRole('button', {
      name: /Insert table \(3×3\)/i,
    });
    expect(insertTableBtn).toBeInTheDocument();

    fireEvent.click(insertTableBtn);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'doc',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'table',
            }),
          ]),
        }),
      );
    });
  });

  it('inserts emoji via emoji popover', async () => {
    const onChange = vi.fn();
    renderAdmin(<RichTextEditor value={null} onChange={onChange} />);

    const emojiBtn = screen.getByRole('button', { name: 'Insert emoji' });
    expect(emojiBtn).toBeInTheDocument();

    fireEvent.click(emojiBtn);

    const starBtn = await screen.findByRole('button', { name: '⭐' });
    expect(starBtn).toBeInTheDocument();

    fireEvent.click(starBtn);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'doc',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'paragraph',
              content: expect.arrayContaining([
                expect.objectContaining({
                  type: 'text',
                  text: expect.stringContaining('⭐'),
                }),
              ]),
            }),
          ]),
        }),
      );
    });
  });

  it('displays unsaved draft recovery banner and restores draft', async () => {
    const draftDoc = plainTextToDoc('Unsaved draft content recovered');
    sessionStorage.setItem('shopnetic:draft:desc:test-draft', JSON.stringify(draftDoc));

    const onChange = vi.fn();
    renderAdmin(<RichTextEditor id="test-draft" value={null} onChange={onChange} />);

    expect(screen.getByTestId('draft-recovery-banner')).toBeInTheDocument();
    expect(
      screen.getByText('You have an unsaved draft from a previous session.'),
    ).toBeInTheDocument();

    const restoreBtn = screen.getByRole('button', { name: 'Restore draft' });
    fireEvent.click(restoreBtn);

    expect(onChange).toHaveBeenCalledWith(draftDoc);
    expect(screen.queryByTestId('draft-recovery-banner')).not.toBeInTheDocument();

    sessionStorage.clear();
  });

  it('discards unsaved draft recovery banner and clears sessionStorage', () => {
    const draftDoc = plainTextToDoc('Draft to discard');
    sessionStorage.setItem('shopnetic:draft:desc:test-discard', JSON.stringify(draftDoc));

    renderAdmin(<RichTextEditor id="test-discard" value={null} onChange={vi.fn()} />);

    expect(screen.getByTestId('draft-recovery-banner')).toBeInTheDocument();

    const discardBtn = screen.getByRole('button', { name: 'Discard' });
    fireEvent.click(discardBtn);

    expect(screen.queryByTestId('draft-recovery-banner')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('shopnetic:draft:desc:test-discard')).toBeNull();
  });

  it('does not display draft recovery banner or allow restore when disabled=true', () => {
    const draftDoc = plainTextToDoc('Draft in disabled editor');
    sessionStorage.setItem('shopnetic:draft:desc:test-disabled', JSON.stringify(draftDoc));

    renderAdmin(<RichTextEditor id="test-disabled" value={null} onChange={vi.fn()} disabled />);

    expect(screen.queryByTestId('draft-recovery-banner')).not.toBeInTheDocument();
  });

  it('discards corrupted or schema-violating draft from sessionStorage instead of restoring it', () => {
    // Malicious or corrupted JSON in sessionStorage (invalid node type)
    const invalidDraft = { type: 'doc', content: [{ type: 'script', text: 'alert(1)' }] };
    sessionStorage.setItem('shopnetic:draft:desc:test-invalid', JSON.stringify(invalidDraft));

    renderAdmin(<RichTextEditor id="test-invalid" value={null} onChange={vi.fn()} />);

    expect(screen.queryByTestId('draft-recovery-banner')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('shopnetic:draft:desc:test-invalid')).toBeNull();
  });

  it('scopes draft to custom draftKey preventing collision between different products', () => {
    const draftProductA = plainTextToDoc('Draft for product A');
    sessionStorage.setItem('shopnetic:draft:product-desc:prod_A', JSON.stringify(draftProductA));

    renderAdmin(
      <RichTextEditor
        id="product-description"
        draftKey="shopnetic:draft:product-desc:prod_B"
        value={null}
        onChange={vi.fn()}
      />,
    );

    // Product B editor should not show Product A's draft
    expect(screen.queryByTestId('draft-recovery-banner')).not.toBeInTheDocument();
  });

  it('pressing Escape in fullscreen-editor mode inside a Modal exits fullscreen without closing the parent Modal', () => {
    const onModalOpenChange = vi.fn();
    renderAdmin(
      <Modal open onOpenChange={onModalOpenChange}>
        <ModalContent>
          <ModalTitle>Parent Modal</ModalTitle>
          <RichTextEditor value={null} onChange={vi.fn()} />
        </ModalContent>
      </Modal>,
    );

    const fullscreenBtn = screen.getByRole('button', { name: 'Full screen' });
    fireEvent.click(fullscreenBtn);

    // Editor is now in fullscreen mode
    const exitFullscreenBtn = screen.getByRole('button', { name: 'Exit full screen' });
    expect(exitFullscreenBtn).toBeInTheDocument();

    // Press Escape on the editor textbox inside the modal with bubbling
    const textbox = screen.getByRole('textbox');
    fireEvent.keyDown(textbox, { key: 'Escape', code: 'Escape', bubbles: true });

    // Fullscreen should exit
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument();

    // Parent Modal should still be open
    expect(onModalOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('Parent Modal')).toBeInTheDocument();
  });

  it('pressing Escape in fullscreen-editor mode with a popover open closes only the popover, and a subsequent Escape exits fullscreen', () => {
    const onModalOpenChange = vi.fn();
    renderAdmin(
      <Modal open onOpenChange={onModalOpenChange}>
        <ModalContent>
          <ModalTitle>Parent Modal</ModalTitle>
          <RichTextEditor value={null} onChange={vi.fn()} />
        </ModalContent>
      </Modal>,
    );

    const fullscreenBtn = screen.getByRole('button', { name: 'Full screen' });
    fireEvent.click(fullscreenBtn);
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeInTheDocument();

    // Open emoji popover
    const emojiBtn = screen.getByRole('button', { name: 'Insert emoji' });
    fireEvent.click(emojiBtn);
    expect(screen.getByText('⭐')).toBeInTheDocument();

    // First Escape: closes emoji popover, keeps fullscreen open
    const textbox = screen.getByRole('textbox');
    fireEvent.keyDown(textbox, { key: 'Escape', code: 'Escape', bubbles: true });

    expect(screen.queryByText('⭐')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeInTheDocument();
    expect(onModalOpenChange).not.toHaveBeenCalled();

    // Second Escape: exits fullscreen
    fireEvent.keyDown(textbox, { key: 'Escape', code: 'Escape', bubbles: true });
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument();
    expect(onModalOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('Parent Modal')).toBeInTheDocument();
  });

  it('updates toolbar active highlights on formatting toggle and editor selection changes', async () => {
    renderAdmin(<RichTextEditor value={null} onChange={vi.fn()} />);

    const boldBtn = screen.getByRole('button', { name: 'Bold' });
    expect(boldBtn).not.toHaveClass('bg-muted');

    fireEvent.click(boldBtn);

    await waitFor(() => {
      expect(boldBtn).toHaveClass('bg-muted');
    });
  });

  it('preserves toolbar DOM state and formatting responsiveness across parent prop updates', async () => {
    const onChange = vi.fn();
    const { rerender } = renderAdmin(<RichTextEditor value={null} onChange={onChange} />);

    const boldBtn = screen.getByRole('button', { name: 'Bold' });
    expect(boldBtn).not.toHaveClass('bg-muted');

    // Rerender with external prop update (e.g. form re-render); toolbar remains mounted & responsive
    rerender(
      <AdminTestProviders>
        <RichTextEditor value={null} onChange={onChange} placeholder="New placeholder" />
      </AdminTestProviders>,
    );

    const fullscreenBtn = screen.getByRole('button', { name: 'Full screen' });
    expect(fullscreenBtn).toBeInTheDocument();

    // Toggle bold continues to react smoothly
    fireEvent.click(boldBtn);
    await waitFor(() => {
      expect(boldBtn).toHaveClass('bg-muted');
    });
  });
});
