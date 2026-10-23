import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { plainTextToDoc, type ProductDescriptionDoc } from '@shopnetic/contracts';
import { renderAdmin } from '@/test/render';
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
  });
});
