import { describe, expect, it } from 'vitest';
import {
  docToPlainText,
  getJsonByteLength,
  isDocEmpty,
  isValidDescriptionLinkHref,
  plainTextToDoc,
  productDescriptionDocSchema,
  productDescriptionSchema,
  type ProductDescriptionDoc,
} from '@shopnetic/contracts';

describe('Product Description Schema (TipTap ProseMirror AST)', () => {
  it('accepts a valid rich text document with paragraphs, headings, lists, and marks', () => {
    const validDoc: ProductDescriptionDoc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Product Highlights' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'This is a ' },
            { type: 'text', text: 'bold statement', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'italicized text', marks: [{ type: 'italic' }] },
            { type: 'text', text: ' with ' },
            {
              type: 'text',
              text: 'a trusted link',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/guide' } }],
            },
            { type: 'text', text: '.' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '100% Organic Cotton' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Machine Washable' }],
                },
              ],
            },
          ],
        },
        {
          type: 'horizontalRule',
        },
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '“Best everyday t-shirt we have ever tested.”' }],
            },
          ],
        },
      ],
    };

    const parsed = productDescriptionDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it('rejects disallowed node types like raw html, scripts, or images', () => {
    const docWithImage = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'https://evil.com/exploit.jpg' },
        },
      ],
    };
    expect(() => productDescriptionDocSchema.parse(docWithImage)).toThrow();

    const docWithScript = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'rawHtml', text: '<script>alert(1)</script>' }],
        },
      ],
    };
    expect(() => productDescriptionDocSchema.parse(docWithScript)).toThrow();
  });

  it('accepts tables with rows, headers, and cells and formats them cleanly in docToPlainText', () => {
    const docWithTable = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Size' }] }],
                },
                {
                  type: 'tableHeader',
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chest (in)' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'M' }] }],
                },
                {
                  type: 'tableCell',
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '38-40' }] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const parsed = productDescriptionDocSchema.parse(docWithTable);
    expect(parsed).toEqual(docWithTable);

    const plain = docToPlainText(parsed as ProductDescriptionDoc);
    expect(plain).toContain('Size');
    expect(plain).toContain('Chest (in)');
    expect(plain).toContain('M');
    expect(plain).toContain('38-40');
  });

  it('accepts text alignment attributes and superscript/subscript marks', () => {
    const docWithFormatting = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, textAlign: 'center' },
          content: [{ type: 'text', text: 'Centered Heading' }],
        },
        {
          type: 'paragraph',
          attrs: { textAlign: 'right' },
          content: [
            { type: 'text', text: 'Area: 100 m' },
            { type: 'text', text: '2', marks: [{ type: 'superscript' }] },
            { type: 'text', text: ', Formula: H' },
            { type: 'text', text: '2', marks: [{ type: 'subscript' }] },
            { type: 'text', text: 'O' },
          ],
        },
      ],
    };

    const parsed = productDescriptionDocSchema.parse(docWithFormatting);
    expect(parsed).toEqual(docWithFormatting);
  });

  it('rejects insecure link protocols like javascript:, data:, and protocol-relative //evil.com', () => {
    // Protocol-relative URLs (open-redirect / host escape)
    expect(isValidDescriptionLinkHref('//evil.com/phish')).toBe(false);
    expect(isValidDescriptionLinkHref('/\\evil.com')).toBe(false);

    // WHATWG URL parsing strips internal ASCII tab (\t), newline (\n), and CR (\r)
    expect(isValidDescriptionLinkHref('/\\t/evil.com'.replace(/\\t/, '\t'))).toBe(false);
    expect(isValidDescriptionLinkHref('/\\n/evil.com'.replace(/\\n/, '\n'))).toBe(false);
    expect(isValidDescriptionLinkHref('/\\r/evil.com'.replace(/\\r/, '\r'))).toBe(false);
    expect(isValidDescriptionLinkHref('j\\navascript:alert(1)'.replace(/\\n/, '\n'))).toBe(false);
    expect(isValidDescriptionLinkHref('j\\tavascript:alert(1)'.replace(/\\t/, '\t'))).toBe(false);

    // Javascript / Data XSS vectors
    expect(isValidDescriptionLinkHref('javascript:document.cookie')).toBe(false);
    expect(isValidDescriptionLinkHref('data:text/html,<script>alert(1)</script>')).toBe(false);

    // Valid same-origin and absolute links
    expect(isValidDescriptionLinkHref('/care-instructions')).toBe(true);
    expect(isValidDescriptionLinkHref('/products/cotton-tee')).toBe(true);
    expect(isValidDescriptionLinkHref('https://example.com/guide')).toBe(true);
    expect(isValidDescriptionLinkHref('mailto:support@shopnetic.com')).toBe(true);
    expect(isValidDescriptionLinkHref('tel:+1234567890')).toBe(true);

    const docWithBadLink = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Click here',
              marks: [
                {
                  type: 'link',
                  attrs: { href: '//evil.com/phish' },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(() => productDescriptionDocSchema.parse(docWithBadLink)).toThrow(
      /protocol-relative URLs like \/\/evil\.com are forbidden/,
    );

    const docWithTabBypass = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Click here',
              marks: [
                {
                  type: 'link',
                  attrs: { href: '/\t/evil.com' },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(() => productDescriptionDocSchema.parse(docWithTabBypass)).toThrow(
      /protocol-relative URLs like \/\/evil\.com are forbidden/,
    );
  });

  it('enforces size cap based on UTF-8 bytes rather than UTF-16 code units (CJK test case)', () => {
    // Multibyte CJK string: each character is 3 UTF-8 bytes but only 1 UTF-16 code unit
    const cjkText = '日本語テスト'.repeat(2800);
    const cjkDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: cjkText }],
        },
      ],
    };

    const serialized = JSON.stringify(cjkDoc);
    const charCount = serialized.length;
    const byteCount = getJsonByteLength(cjkDoc);

    // Char count is ~16,800 (< 50,000 UTF-16 characters)
    expect(charCount).toBeLessThan(50_000);
    // Real UTF-8 byte count exceeds 50,000 bytes (~50,480 bytes)
    expect(byteCount).toBeGreaterThan(50_000);

    // Schema MUST reject based on true UTF-8 byte size!
    expect(() => productDescriptionDocSchema.parse(cjkDoc)).toThrow(/exceeds maximum size limit/);
  });

  it('rejects oversized JSON documents exceeding the 50KB size cap', () => {
    const hugeParagraphs = Array.from({ length: 500 }, (_, i) => ({
      type: 'paragraph' as const,
      content: [
        {
          type: 'text' as const,
          text: `Paragraph ${i}: ` + 'x'.repeat(200),
        },
      ],
    }));

    const oversizedDoc = {
      type: 'doc',
      content: hugeParagraphs,
    };

    expect(() => productDescriptionDocSchema.parse(oversizedDoc)).toThrow(
      /exceeds maximum size limit/,
    );
  });

  it('automatically wraps plain text strings into a valid paragraph document', () => {
    const text = 'Line 1\n\nLine 2';
    const doc = plainTextToDoc(text);

    expect(doc).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Line 1' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Line 2' }],
        },
      ],
    });

    // productDescriptionSchema seamlessly parses both plain string and TipTap doc
    const fromString = productDescriptionSchema.parse({
      en: 'Plain text description',
    });
    expect(fromString.en).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Plain text description' }],
        },
      ],
    });
  });

  it('extracts plain text and detects empty documents accurately', () => {
    expect(isDocEmpty(null)).toBe(true);
    expect(isDocEmpty(undefined)).toBe(true);
    expect(isDocEmpty({ type: 'doc' })).toBe(true);
    expect(isDocEmpty({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
    expect(
      isDocEmpty({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
      }),
    ).toBe(true);

    const doc: ProductDescriptionDoc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Features' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Lightweight fabric.' }],
        },
      ],
    };

    expect(isDocEmpty(doc)).toBe(false);
    expect(docToPlainText(doc)).toBe('Features\nLightweight fabric.');

    // Nested table is recognized as non-empty even without text
    const nestedTableDoc: ProductDescriptionDoc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'table',
              content: [
                {
                  type: 'tableRow',
                  content: [
                    {
                      type: 'tableCell',
                      attrs: { align: 'center', colspan: 1, rowspan: 1 },
                      content: [{ type: 'paragraph' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(isDocEmpty(nestedTableDoc)).toBe(false);
    expect(productDescriptionDocSchema.safeParse(nestedTableDoc).success).toBe(true);

    const invalidAlignCellDoc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: { align: 'justify' },
                  content: [{ type: 'paragraph' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(productDescriptionDocSchema.safeParse(invalidAlignCellDoc).success).toBe(false);

    // Verify valid cell alignments ('left' | 'center' | 'right') are accepted
    for (const validAlign of ['left', 'center', 'right'] as const) {
      const validAlignCellDoc = {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    attrs: { align: validAlign },
                    content: [{ type: 'paragraph' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      expect(productDescriptionDocSchema.safeParse(validAlignCellDoc).success).toBe(true);
    }

    // Verify textAlign: 'justify' remains valid on paragraph and heading
    const validJustifyDoc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, textAlign: 'justify' },
          content: [{ type: 'text', text: 'Justified Heading' }],
        },
        {
          type: 'paragraph',
          attrs: { textAlign: 'justify' },
          content: [{ type: 'text', text: 'Justified paragraph text.' }],
        },
      ],
    };
    expect(productDescriptionDocSchema.safeParse(validJustifyDoc).success).toBe(true);
  });
});
