import { z } from 'zod';

// ── Allowed Marks ────────────────────────────────────────────────────────────

export const productDescriptionBoldMarkSchema = z.object({
  type: z.literal('bold'),
});

export const productDescriptionItalicMarkSchema = z.object({
  type: z.literal('italic'),
});

export const productDescriptionStrikeMarkSchema = z.object({
  type: z.literal('strike'),
});

export const productDescriptionSuperscriptMarkSchema = z.object({
  type: z.literal('superscript'),
});

export const productDescriptionSubscriptMarkSchema = z.object({
  type: z.literal('subscript'),
});

export const PRODUCT_DESCRIPTION_LINK_HREF_REGEX =
  /^(?:https?:\/\/|mailto:|tel:|\/(?![\\/\t\n\r]))/i;

export function isValidDescriptionLinkHref(href: unknown): boolean {
  if (typeof href !== 'string') return false;
  // WHATWG URL parsing strips internal ASCII tab (\t), newline (\n), and CR (\r).
  // A href containing tabs, newlines, or null bytes is an injection/bypass vector (e.g. "/\t/evil.com").
  if (/[\t\n\r\0]/.test(href)) return false;
  const trimmed = href.trim();
  if (!trimmed) return false;
  // Also verify against WHATWG-stripped representation for defense in depth
  const stripped = trimmed.replace(/[\t\n\r]/g, '');
  return (
    PRODUCT_DESCRIPTION_LINK_HREF_REGEX.test(trimmed) &&
    PRODUCT_DESCRIPTION_LINK_HREF_REGEX.test(stripped)
  );
}

export const productDescriptionLinkMarkSchema = z.object({
  type: z.literal('link'),
  attrs: z.object({
    href: z
      .string()
      .trim()
      .refine(
        isValidDescriptionLinkHref,
        'link href must be an http(s), mailto, tel, or same-origin relative URL (protocol-relative URLs like //evil.com are forbidden)',
      ),
    target: z.string().nullable().optional(),
    rel: z.string().nullable().optional(),
  }),
});

export const productDescriptionMarkSchema = z.discriminatedUnion('type', [
  productDescriptionBoldMarkSchema,
  productDescriptionItalicMarkSchema,
  productDescriptionStrikeMarkSchema,
  productDescriptionLinkMarkSchema,
  productDescriptionSuperscriptMarkSchema,
  productDescriptionSubscriptMarkSchema,
]);
export type ProductDescriptionMark = z.infer<typeof productDescriptionMarkSchema>;

// ── Inline Nodes ─────────────────────────────────────────────────────────────

export const productDescriptionTextNodeSchema = z.object({
  type: z.literal('text'),
  text: z.string().max(10_000),
  marks: z.array(productDescriptionMarkSchema).optional(),
});

export const productDescriptionHardBreakNodeSchema = z.object({
  type: z.literal('hardBreak'),
});

export const productDescriptionInlineNodeSchema = z.discriminatedUnion('type', [
  productDescriptionTextNodeSchema,
  productDescriptionHardBreakNodeSchema,
]);
export type ProductDescriptionInlineNode = z.infer<typeof productDescriptionInlineNodeSchema>;

// ── Block Nodes ──────────────────────────────────────────────────────────────

export const productDescriptionParagraphNodeSchema = z.object({
  type: z.literal('paragraph'),
  attrs: z
    .object({
      textAlign: z.enum(['left', 'center', 'right', 'justify']).nullable().optional(),
    })
    .optional(),
  content: z.array(productDescriptionInlineNodeSchema).optional(),
});

export const productDescriptionHeadingNodeSchema = z.object({
  type: z.literal('heading'),
  attrs: z.object({
    level: z.union([z.literal(2), z.literal(3)]),
    textAlign: z.enum(['left', 'center', 'right', 'justify']).nullable().optional(),
  }),
  content: z.array(productDescriptionInlineNodeSchema).optional(),
});

export const productDescriptionHorizontalRuleNodeSchema = z.object({
  type: z.literal('horizontalRule'),
});

export const productDescriptionTableCellAttrsSchema = z
  .object({
    colspan: z.number().int().positive().optional(),
    rowspan: z.number().int().positive().optional(),
    colwidth: z.array(z.number().positive()).nullable().optional(),
    align: z.enum(['left', 'center', 'right']).nullable().optional(),
  })
  .optional();

export type ProductDescriptionNode =
  | z.infer<typeof productDescriptionParagraphNodeSchema>
  | z.infer<typeof productDescriptionHeadingNodeSchema>
  | z.infer<typeof productDescriptionHorizontalRuleNodeSchema>
  | { type: 'blockquote'; content?: ProductDescriptionNode[] | undefined }
  | { type: 'listItem'; content?: ProductDescriptionNode[] | undefined }
  | { type: 'bulletList'; content?: ProductDescriptionNode[] | undefined }
  | {
      type: 'orderedList';
      attrs?: { start?: number | undefined } | undefined;
      content?: ProductDescriptionNode[] | undefined;
    }
  | { type: 'table'; content?: ProductDescriptionNode[] | undefined }
  | { type: 'tableRow'; content?: ProductDescriptionNode[] | undefined }
  | {
      type: 'tableHeader';
      attrs?:
        | {
            colspan?: number | undefined;
            rowspan?: number | undefined;
            colwidth?: number[] | null | undefined;
            align?: 'left' | 'center' | 'right' | null | undefined;
          }
        | undefined;
      content?: ProductDescriptionNode[] | undefined;
    }
  | {
      type: 'tableCell';
      attrs?:
        | {
            colspan?: number | undefined;
            rowspan?: number | undefined;
            colwidth?: number[] | null | undefined;
            align?: 'left' | 'center' | 'right' | null | undefined;
          }
        | undefined;
      content?: ProductDescriptionNode[] | undefined;
    };

export const productDescriptionNodeSchema: z.ZodType<ProductDescriptionNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    productDescriptionParagraphNodeSchema,
    productDescriptionHeadingNodeSchema,
    productDescriptionHorizontalRuleNodeSchema,
    z.object({
      type: z.literal('blockquote'),
      content: z.array(productDescriptionNodeSchema).optional(),
    }),
    z.object({
      type: z.literal('listItem'),
      content: z.array(productDescriptionNodeSchema).optional(),
    }),
    z.object({
      type: z.literal('bulletList'),
      content: z.array(productDescriptionNodeSchema).optional(),
    }),
    z.object({
      type: z.literal('orderedList'),
      attrs: z.object({ start: z.number().int().optional() }).optional(),
      content: z.array(productDescriptionNodeSchema).optional(),
    }),
    z.object({
      type: z.literal('table'),
      content: z.array(productDescriptionNodeSchema).optional(),
    }),
    z.object({
      type: z.literal('tableRow'),
      content: z.array(productDescriptionNodeSchema).optional(),
    }),
    z.object({
      type: z.literal('tableHeader'),
      attrs: productDescriptionTableCellAttrsSchema,
      content: z.array(productDescriptionNodeSchema).optional(),
    }),
    z.object({
      type: z.literal('tableCell'),
      attrs: productDescriptionTableCellAttrsSchema,
      content: z.array(productDescriptionNodeSchema).optional(),
    }),
  ]),
);

// ── Top-level Document Schema ────────────────────────────────────────────────

export const MAX_PRODUCT_DESCRIPTION_JSON_BYTES = 50_000;

/**
 * Calculates the exact UTF-8 byte length of a JSON-serializable value or string.
 * Accurately measures multi-byte characters (CJK, emojis) rather than UTF-16 code units.
 */
export function getJsonByteLength(val: unknown): number {
  try {
    const serialized = typeof val === 'string' ? val : JSON.stringify(val);
    const g = globalThis as Record<string, unknown>;
    const buf = g['Buffer'] as { byteLength?: (str: string, enc: string) => number } | undefined;
    if (typeof buf?.byteLength === 'function') {
      return buf.byteLength(serialized, 'utf8');
    }
    const encoderCtor = g['TextEncoder'] as
      | (new () => { encode: (s: string) => { length: number } })
      | undefined;
    if (typeof encoderCtor === 'function') {
      return new encoderCtor().encode(serialized).length;
    }
    return serialized.length;
  } catch {
    return Infinity;
  }
}

export const productDescriptionDocSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(productDescriptionNodeSchema).optional(),
  })
  .superRefine((val, ctx) => {
    const byteLength = getJsonByteLength(val);
    if (byteLength > MAX_PRODUCT_DESCRIPTION_JSON_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `product description exceeds maximum size limit (${MAX_PRODUCT_DESCRIPTION_JSON_BYTES} bytes, received ${byteLength} bytes)`,
      });
    }
  });

export type ProductDescriptionDoc = z.infer<typeof productDescriptionDocSchema>;

// ── Helper Utilities ─────────────────────────────────────────────────────────

/**
 * Converts a plain-text string into a valid minimal TipTap document AST.
 * Splits on double newlines into separate paragraphs.
 */
export function plainTextToDoc(text: string): ProductDescriptionDoc {
  const trimmed = text.trim();
  if (!trimmed) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  return {
    type: 'doc',
    content: paragraphs.map((p) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: p }],
    })),
  };
}

/**
 * Extracts plain-text content from a TipTap document AST.
 * Useful for search indexing, fallback displays, and meta descriptions.
 */
export function docToPlainText(doc: ProductDescriptionDoc | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return '';

  const chunks: string[] = [];

  function walk(node: ProductDescriptionNode | ProductDescriptionInlineNode): void {
    if ('text' in node && typeof node.text === 'string') {
      chunks.push(node.text);
      return;
    }
    if ('content' in node && Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child);
      }
      if (
        node.type === 'paragraph' ||
        node.type === 'heading' ||
        node.type === 'listItem' ||
        node.type === 'tableRow' ||
        node.type === 'table'
      ) {
        chunks.push('\n');
      } else if (node.type === 'tableCell' || node.type === 'tableHeader') {
        chunks.push('\t');
      }
    }
  }

  for (const node of doc.content) {
    walk(node);
  }

  return chunks.join('').trim();
}

function hasMeaningfulContent(
  node: ProductDescriptionNode | ProductDescriptionInlineNode,
): boolean {
  if (node.type === 'table') return true;
  if ('text' in node && typeof node.text === 'string' && node.text.trim().length > 0) {
    return true;
  }
  if ('content' in node && Array.isArray(node.content)) {
    for (const child of node.content) {
      if (hasMeaningfulContent(child)) return true;
    }
  }
  return false;
}

/**
 * Checks whether a TipTap document is empty (has no meaningful text or structured elements like tables at any nesting level).
 */
export function isDocEmpty(doc: ProductDescriptionDoc | null | undefined): boolean {
  if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) return true;
  for (const node of doc.content) {
    if (hasMeaningfulContent(node)) return false;
  }
  return true;
}

// ── Localized Product Description Schema ─────────────────────────────────────

export const productDescriptionValueSchema = z.union([
  productDescriptionDocSchema,
  z.string().transform(plainTextToDoc),
]);

export const productDescriptionSchema = z
  .record(z.string().min(2).max(12), productDescriptionValueSchema)
  .refine((v) => typeof v['en'] !== 'undefined', {
    message: 'a value for the default locale ("en") is required',
  });

export type ProductDescription = z.infer<typeof productDescriptionSchema>;
