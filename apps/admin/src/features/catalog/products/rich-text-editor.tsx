'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useEditor, EditorContent, type Editor, type JSONContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Superscript } from '@tiptap/extension-superscript';
import { Subscript } from '@tiptap/extension-subscript';
import { TextAlign } from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link2,
  Unlink,
  Undo2,
  Redo2,
  RemoveFormatting,
  LayoutTemplate,
  Maximize2,
  Minimize2,
  Superscript as SuperscriptIcon,
  Subscript as SubscriptIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table as TableIcon,
  Smile,
  AlertCircle,
} from 'lucide-react';
import { Button, Input, Popover, PopoverTrigger, PopoverContent, cn } from '@shopnetic/ui';
import {
  getJsonByteLength,
  isDocEmpty,
  isValidDescriptionLinkHref,
  MAX_PRODUCT_DESCRIPTION_JSON_BYTES,
  productDescriptionDocSchema,
  type ProductDescriptionDoc,
} from '@shopnetic/contracts';

export interface RichTextEditorProps {
  value?: ProductDescriptionDoc | null | undefined;
  onChange: (value: ProductDescriptionDoc | null) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string | undefined;
  id?: string;
  draftKey?: string;
  className?: string;
  contentClassName?: string;
}

function cleanDoc(obj: unknown): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) return obj.map(cleanDoc);
  if (typeof obj === 'object') {
    const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
    const res: Record<string, unknown> = {};
    for (const k of sortedKeys) {
      const cleaned = cleanDoc((obj as Record<string, unknown>)[k]);
      if (cleaned !== undefined) {
        res[k] = cleaned;
      }
    }
    if (Object.keys(res).length === 0) return undefined;
    return res;
  }
  return obj;
}

function areDocsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!a || !b) return false;
  return JSON.stringify(cleanDoc(a)) === JSON.stringify(cleanDoc(b));
}

function toJSONContent(doc: ProductDescriptionDoc | null | undefined): JSONContent {
  if (!doc) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  return JSON.parse(JSON.stringify(doc)) as JSONContent;
}

function getTemplates(t: (key: string) => string): Array<{
  id: string;
  labelKey: 'templateFeatures' | 'templateCare' | 'templateHighlights';
  content: JSONContent[];
}> {
  return [
    {
      id: 'features',
      labelKey: 'templateFeatures',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: t('products.form.editor.template.featuresHeading') }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      marks: [{ type: 'bold' }],
                      text: t('products.form.editor.template.featuresKeyPrimary'),
                    },
                    {
                      type: 'text',
                      text: t('products.form.editor.template.featuresValPrimary'),
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      marks: [{ type: 'bold' }],
                      text: t('products.form.editor.template.featuresKeyBuild'),
                    },
                    {
                      type: 'text',
                      text: t('products.form.editor.template.featuresValBuild'),
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      marks: [{ type: 'bold' }],
                      text: t('products.form.editor.template.featuresKeyPackage'),
                    },
                    {
                      type: 'text',
                      text: t('products.form.editor.template.featuresValPackage'),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'care',
      labelKey: 'templateCare',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: t('products.form.editor.template.careHeading') }],
        },
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: t('products.form.editor.template.careStep1') }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: t('products.form.editor.template.careStep2') }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: t('products.form.editor.template.careStep3') }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'highlights',
      labelKey: 'templateHighlights',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: t('products.form.editor.template.highlightsHeading') }],
        },
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: t('products.form.editor.template.highlightsQuote'),
                },
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: t('products.form.editor.template.highlightsParagraph'),
            },
          ],
        },
      ],
    },
  ];
}

interface EditorToolbarProps {
  editor: Editor | null;
  disabled: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isTableOpen: boolean;
  setIsTableOpen: (open: boolean) => void;
  isEmojiOpen: boolean;
  setIsEmojiOpen: (open: boolean) => void;
  isLinkOpen: boolean;
  setIsLinkOpen: (open: boolean) => void;
  isTemplatesOpen: boolean;
  setIsTemplatesOpen: (open: boolean) => void;
}

const EditorToolbar = memo(function EditorToolbar({
  editor,
  disabled,
  isFullscreen,
  onToggleFullscreen,
  isTableOpen,
  setIsTableOpen,
  isEmojiOpen,
  setIsEmojiOpen,
  isLinkOpen,
  setIsLinkOpen,
  isTemplatesOpen,
  setIsTemplatesOpen,
}: EditorToolbarProps) {
  const t = useTranslations('catalog');
  const templates = useMemo(() => getTemplates(t), [t]);
  const [, setSelectionTick] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      setSelectionTick((tick) => tick + 1);
    };
    editor.on('selectionUpdate', handleUpdate);
    editor.on('transaction', handleUpdate);
    return () => {
      editor.off('selectionUpdate', handleUpdate);
      editor.off('transaction', handleUpdate);
    };
  }, [editor]);

  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkTextError, setLinkTextError] = useState<string | null>(null);
  const [requiresText, setRequiresText] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const handleOpenLink = () => {
    if (!editor) return;
    const isLinkActive = editor.isActive('link');
    const { empty } = editor.state.selection;

    const prevUrl = (editor.getAttributes('link').href as string | undefined) || '';
    setLinkUrl(prevUrl);
    setLinkText('');
    setLinkError(null);
    setLinkTextError(null);

    if (isLinkActive || !empty) {
      setRequiresText(false);
    } else {
      setRequiresText(true);
    }

    setIsLinkOpen(true);
  };

  const handleApplyLink = () => {
    if (!editor) return;
    setLinkError(null);
    setLinkTextError(null);

    const trimmedUrl = linkUrl.trim();
    if (!trimmedUrl) {
      if (editor.isActive('link')) {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
      }
      setIsLinkOpen(false);
      return;
    }

    if (!isValidDescriptionLinkHref(trimmedUrl)) {
      setLinkError(t('products.form.editor.linkError'));
      return;
    }

    if (requiresText) {
      const trimmedText = linkText.trim();
      if (!trimmedText) {
        setLinkTextError(t('products.form.editor.linkTextRequired'));
        textInputRef.current?.focus();
        return;
      }

      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: trimmedText,
          marks: [{ type: 'link', attrs: { href: trimmedUrl } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: trimmedUrl }).run();
    }

    setIsLinkOpen(false);
  };

  const handleUnlink = () => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setIsLinkOpen(false);
  };

  const handleInsertTemplate = (templateContent: JSONContent[]) => {
    if (!editor) return;
    editor.chain().focus().insertContent(templateContent).run();
    setIsTemplatesOpen(false);
  };

  return (
    <div
      data-testid="rich-text-toolbar"
      className="flex flex-wrap items-center gap-0.5 border-b border-border/70 bg-muted/30 p-1"
    >
      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        aria-label={t('products.form.editor.bold')}
        title={t('products.form.editor.bold')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive('bold') && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        aria-label={t('products.form.editor.italic')}
        title={t('products.form.editor.italic')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive('italic') && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <Italic className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
        aria-label={t('products.form.editor.strike')}
        title={t('products.form.editor.strike')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive('strike') && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleSuperscript().run()}
        aria-label={t('products.form.editor.superscript')}
        title={t('products.form.editor.superscript')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive('superscript') && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <SuperscriptIcon className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleSubscript().run()}
        aria-label={t('products.form.editor.subscript')}
        title={t('products.form.editor.subscript')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive('subscript') && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <SubscriptIcon className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-4 w-[1px] bg-border/60" aria-hidden="true" />

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        aria-label={t('products.form.editor.h2')}
        title={t('products.form.editor.h2')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive('heading', { level: 2 }) && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <Heading2 className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        aria-label={t('products.form.editor.h3')}
        title={t('products.form.editor.h3')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive('heading', { level: 3 }) && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <Heading3 className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-4 w-[1px] bg-border/60" aria-hidden="true" />

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        aria-label={t('products.form.editor.bulletList')}
        title={t('products.form.editor.bulletList')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive('bulletList') && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <List className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        aria-label={t('products.form.editor.orderedList')}
        title={t('products.form.editor.orderedList')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive('orderedList') && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        aria-label={t('products.form.editor.blockquote')}
        title={t('products.form.editor.blockquote')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive('blockquote') && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <Quote className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        aria-label={t('products.form.editor.horizontalRule')}
        title={t('products.form.editor.horizontalRule')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-4 w-[1px] bg-border/60" aria-hidden="true" />

      {/* Alignment Buttons */}
      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().setTextAlign('left').run()}
        aria-label={t('products.form.editor.alignLeft')}
        title={t('products.form.editor.alignLeft')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive({ textAlign: 'left' }) && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().setTextAlign('center').run()}
        aria-label={t('products.form.editor.alignCenter')}
        title={t('products.form.editor.alignCenter')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive({ textAlign: 'center' }) && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().setTextAlign('right').run()}
        aria-label={t('products.form.editor.alignRight')}
        title={t('products.form.editor.alignRight')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive({ textAlign: 'right' }) && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <AlignRight className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
        aria-label={t('products.form.editor.alignJustify')}
        title={t('products.form.editor.alignJustify')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          editor?.isActive({ textAlign: 'justify' }) && 'bg-muted text-primary font-bold shadow-xs',
        )}
      >
        <AlignJustify className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-4 w-[1px] bg-border/60" aria-hidden="true" />

      {/* Table Popover */}
      <Popover open={isTableOpen} onOpenChange={setIsTableOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || !editor}
            aria-label={t('products.form.editor.table')}
            title={t('products.form.editor.table')}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
              (isTableOpen || editor?.isActive('table')) &&
                'bg-muted text-primary font-bold shadow-xs',
            )}
          >
            <TableIcon className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" hideClose className="w-60 p-2 text-xs">
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => {
                editor
                  ?.chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run();
                setIsTableOpen(false);
              }}
              className="w-full text-left rounded px-2 py-1.5 hover:bg-muted transition-colors flex items-center justify-between"
            >
              <span>{t('products.form.editor.insertTable')}</span>
              <span className="text-[10px] text-muted-foreground font-mono">3×3</span>
            </button>
            {editor?.isActive('table') && (
              <>
                <div className="my-1 h-[1px] bg-border/60" />
                <button
                  type="button"
                  onClick={() => {
                    editor?.chain().focus().addRowBefore().run();
                    setIsTableOpen(false);
                  }}
                  className="w-full text-left rounded px-2 py-1 hover:bg-muted transition-colors"
                >
                  {t('products.form.editor.addRowBefore')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor?.chain().focus().addRowAfter().run();
                    setIsTableOpen(false);
                  }}
                  className="w-full text-left rounded px-2 py-1 hover:bg-muted transition-colors"
                >
                  {t('products.form.editor.addRowAfter')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor?.chain().focus().deleteRow().run();
                    setIsTableOpen(false);
                  }}
                  className="w-full text-left rounded px-2 py-1 hover:bg-muted transition-colors text-destructive"
                >
                  {t('products.form.editor.deleteRow')}
                </button>
                <div className="my-1 h-[1px] bg-border/60" />
                <button
                  type="button"
                  onClick={() => {
                    editor?.chain().focus().addColumnBefore().run();
                    setIsTableOpen(false);
                  }}
                  className="w-full text-left rounded px-2 py-1 hover:bg-muted transition-colors"
                >
                  {t('products.form.editor.addColumnBefore')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor?.chain().focus().addColumnAfter().run();
                    setIsTableOpen(false);
                  }}
                  className="w-full text-left rounded px-2 py-1 hover:bg-muted transition-colors"
                >
                  {t('products.form.editor.addColumnAfter')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor?.chain().focus().deleteColumn().run();
                    setIsTableOpen(false);
                  }}
                  className="w-full text-left rounded px-2 py-1 hover:bg-muted transition-colors text-destructive"
                >
                  {t('products.form.editor.deleteColumn')}
                </button>
                <div className="my-1 h-[1px] bg-border/60" />
                <button
                  type="button"
                  onClick={() => {
                    editor?.chain().focus().deleteTable().run();
                    setIsTableOpen(false);
                  }}
                  className="w-full text-left rounded px-2 py-1 hover:bg-muted transition-colors text-destructive font-medium"
                >
                  {t('products.form.editor.deleteTable')}
                </button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Emoji Picker Popover */}
      <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || !editor}
            aria-label={t('products.form.editor.emojis')}
            title={t('products.form.editor.emojis')}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
              isEmojiOpen && 'bg-muted text-primary font-bold shadow-xs',
            )}
          >
            <Smile className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2">
          <div className="grid grid-cols-5 gap-1">
            {[
              '⭐',
              '✨',
              '🔥',
              '📦',
              '🏷️',
              '⚡',
              '💯',
              '🌿',
              '💎',
              '👑',
              '🚀',
              '🛒',
              '🎁',
              '❤️',
              '👍',
              '🛡️',
              '✅',
              '🌟',
              '🏆',
              '🎉',
            ].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  editor?.chain().focus().insertContent(emoji).run();
                  setIsEmojiOpen(false);
                }}
                className="flex size-8 items-center justify-center rounded hover:bg-muted text-base transition-colors"
                aria-label={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="mx-1 h-4 w-[1px] bg-border/60" aria-hidden="true" />

      {/* Link Popover */}
      <Popover
        open={isLinkOpen}
        onOpenChange={(open) => {
          if (open) {
            handleOpenLink();
          } else {
            setIsLinkOpen(false);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || !editor}
            onClick={handleOpenLink}
            aria-label={t('products.form.editor.link')}
            title={t('products.form.editor.link')}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
              editor?.isActive('link') && 'bg-muted text-primary font-bold shadow-xs',
            )}
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3">
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-semibold text-foreground">
              {requiresText
                ? t('products.form.editor.linkAddTitle')
                : t('products.form.editor.linkTitle')}
            </span>

            {/* Display Text input: only shown when no text was selected */}
            {requiresText && (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="editor-link-text"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  {t('products.form.editor.linkText')}
                </label>
                <Input
                  id="editor-link-text"
                  ref={textInputRef}
                  value={linkText}
                  onChange={(e) => {
                    setLinkText(e.target.value);
                    if (linkTextError) setLinkTextError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyLink();
                    }
                  }}
                  placeholder={t('products.form.editor.linkTextPlaceholder')}
                  invalid={Boolean(linkTextError)}
                  className="h-8 text-xs"
                />
                {linkTextError && (
                  <span className="text-[11px] text-destructive">{linkTextError}</span>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label
                htmlFor="editor-link-url"
                className="text-[11px] font-medium text-muted-foreground"
              >
                {t('products.form.editor.linkUrl')}
              </label>
              <Input
                id="editor-link-url"
                ref={urlInputRef}
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  if (linkError) setLinkError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleApplyLink();
                  }
                }}
                placeholder="https://example.com"
                invalid={Boolean(linkError)}
                className="h-8 text-xs font-mono"
              />
              {linkError && <span className="text-[11px] text-destructive">{linkError}</span>}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              {editor?.isActive('link') ? (
                <button
                  type="button"
                  onClick={handleUnlink}
                  className="inline-flex items-center gap-1 text-[11px] text-destructive hover:underline"
                >
                  <Unlink className="h-3 w-3" />
                  {t('products.form.editor.linkRemove')}
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-1.5 ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setIsLinkOpen(false)}
                >
                  {t('products.form.editor.linkCancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={handleApplyLink}
                >
                  {t('products.form.editor.linkApply')}
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div className="mx-1 h-4 w-[1px] bg-border/60" aria-hidden="true" />

      <button
        type="button"
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
        aria-label={t('products.form.editor.clearFormatting')}
        title={t('products.form.editor.clearFormatting')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        <RemoveFormatting className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor || !editor.can().undo()}
        onClick={() => editor?.chain().focus().undo().run()}
        aria-label={t('products.form.editor.undo')}
        title={t('products.form.editor.undo')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        disabled={disabled || !editor || !editor.can().redo()}
        onClick={() => editor?.chain().focus().redo().run()}
        aria-label={t('products.form.editor.redo')}
        title={t('products.form.editor.redo')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        <Redo2 className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-4 w-[1px] bg-border/60" aria-hidden="true" />

      {/* Templates Popover */}
      <Popover open={isTemplatesOpen} onOpenChange={setIsTemplatesOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || !editor}
            aria-label={t('products.form.editor.templates')}
            title={t('products.form.editor.templates')}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs font-medium transition-colors',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50 text-muted-foreground hover:text-foreground',
              isTemplatesOpen && 'bg-muted text-primary font-bold shadow-xs',
            )}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            <span className="text-[11px] hidden sm:inline">
              {t('products.form.editor.templates')}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold text-muted-foreground px-2 py-1">
              {t('products.form.editor.templates')}
            </span>
            {templates.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => handleInsertTemplate(tmpl.content)}
                className="w-full text-left rounded px-2 py-1.5 text-xs text-foreground hover:bg-muted transition-colors flex items-center justify-between"
              >
                <span>{t(`products.form.editor.${tmpl.labelKey}`)}</span>
                <span className="text-[10px] text-muted-foreground font-mono">+</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Fullscreen Toggle */}
      <button
        type="button"
        disabled={disabled || !editor}
        onClick={onToggleFullscreen}
        aria-label={
          isFullscreen
            ? t('products.form.editor.exitFullscreen')
            : t('products.form.editor.fullscreen')
        }
        title={
          isFullscreen
            ? t('products.form.editor.exitFullscreen')
            : t('products.form.editor.fullscreen')
        }
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors ml-auto',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50 text-muted-foreground hover:text-foreground',
          isFullscreen && 'bg-primary/10 text-primary font-bold',
        )}
      >
        {isFullscreen ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
});

export function RichTextEditor({
  value,
  onChange,
  disabled = false,
  placeholder,
  error,
  id,
  draftKey,
  className,
  contentClassName,
}: RichTextEditorProps) {
  const t = useTranslations('catalog');
  const [isTableOpen, setIsTableOpen] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);
  const valueRef = useRef(value);
  valueRef.current = value;

  const resolvedDraftKey =
    draftKey !== undefined ? draftKey : id ? `shopnetic:draft:desc:${id}` : null;
  const [recoveredDraft, setRecoveredDraft] = useState<ProductDescriptionDoc | null>(null);

  useEffect(() => {
    if (!resolvedDraftKey || disabled) {
      setRecoveredDraft(null);
      return;
    }
    try {
      const saved = sessionStorage.getItem(resolvedDraftKey);
      if (saved) {
        const raw = JSON.parse(saved);
        const parseResult = productDescriptionDocSchema.safeParse(raw);
        if (!parseResult.success) {
          sessionStorage.removeItem(resolvedDraftKey);
          setRecoveredDraft(null);
          return;
        }
        const parsed = parseResult.data;
        if (!isDocEmpty(parsed) && !areDocsEqual(parsed, value)) {
          setRecoveredDraft(parsed);
        } else {
          setRecoveredDraft(null);
        }
      } else {
        setRecoveredDraft(null);
      }
    } catch {
      // Ignore sessionStorage access errors
    }
  }, [resolvedDraftKey, value, disabled]);

  const handleRestoreDraft = () => {
    if (!recoveredDraft || !editor || disabled) return;
    const parseResult = productDescriptionDocSchema.safeParse(recoveredDraft);
    if (!parseResult.success) {
      if (resolvedDraftKey) {
        try {
          sessionStorage.removeItem(resolvedDraftKey);
        } catch {
          // Ignore
        }
      }
      setRecoveredDraft(null);
      return;
    }
    onChange(parseResult.data);
    editor.commands.setContent(toJSONContent(parseResult.data), { emitUpdate: false });
    setRecoveredDraft(null);
  };

  const handleDiscardDraft = () => {
    if (resolvedDraftKey) {
      try {
        sessionStorage.removeItem(resolvedDraftKey);
      } catch {
        // Ignore
      }
    }
    setRecoveredDraft(null);
  };

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
        code: false,
        codeBlock: false,
        underline: false,
        link: {
          openOnClick: false,
          HTMLAttributes: {
            rel: 'noopener noreferrer nofollow',
            target: '_blank',
          },
          isAllowedUri: (url) => isValidDescriptionLinkHref(url),
          shouldAutoLink: (url) => isValidDescriptionLinkHref(url),
        },
      }),
      Superscript,
      Subscript,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    editorProps: {
      attributes: {
        role: 'textbox',
        ...(id ? { id } : {}),
        'aria-label': t('products.form.description'),
        'aria-multiline': 'true',
        'aria-disabled': disabled ? 'true' : 'false',
        tabindex: disabled ? '-1' : '0',
        class: cn('outline-none focus:outline-none', disabled && 'pointer-events-none select-text'),
      },
    },
    ...(value ? { content: toJSONContent(value) } : {}),
    onUpdate: ({ editor: instance }) => {
      const json = instance.getJSON() as ProductDescriptionDoc;
      const isEmpty = isDocEmpty(json);
      const nextValue = isEmpty ? null : json;
      if (areDocsEqual(nextValue, valueRef.current)) {
        return;
      }
      if (isEmpty) {
        onChange(null);
        if (resolvedDraftKey && !disabled) {
          try {
            sessionStorage.removeItem(resolvedDraftKey);
          } catch {
            // Ignore storage quota or access errors
          }
        }
      } else {
        onChange(json);
        if (resolvedDraftKey && !disabled) {
          try {
            sessionStorage.setItem(resolvedDraftKey, JSON.stringify(json));
          } catch {
            // Ignore storage quota or access errors
          }
        }
      }
    },
  });

  // Keep editor content in sync with external value updates (e.g. form reset or product load)
  useEffect(() => {
    if (!editor) return;
    const currentJson = editor.getJSON();
    if (!value && isDocEmpty(currentJson as ProductDescriptionDoc)) return;
    if (!areDocsEqual(currentJson, value)) {
      editor.commands.setContent(toJSONContent(value), { emitUpdate: false });
    }
  }, [editor, value]);

  // Keep editable state synced
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Delegate label clicks to editor focus since <div contenteditable> is not natively labelable per HTML5 spec
  useEffect(() => {
    if (!id || !editor || disabled) return;
    const safeId =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(id)
        : id.replace(/(["\\])/g, '\\$1');
    const label = document.querySelector<HTMLLabelElement>(`label[for="${safeId}"]`);
    if (!label) return;

    const handleLabelClick = (e: Event) => {
      e.preventDefault();
      const el = document.getElementById(id);
      if (el) {
        el.focus();
      }
      if (!editor.isFocused) {
        editor.commands.focus();
      }
    };

    label.addEventListener('click', handleLabelClick);
    return () => {
      label.removeEventListener('click', handleLabelClick);
    };
  }, [id, editor, disabled]);

  const docByteSize = useMemo(() => {
    if (!value) return 0;
    return getJsonByteLength(value);
  }, [value]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isTableOpen || isEmojiOpen || isLinkOpen || isTemplatesOpen) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setIsTableOpen(false);
          setIsEmojiOpen(false);
          setIsLinkOpen(false);
          setIsTemplatesOpen(false);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isFullscreen, isTableOpen, isEmojiOpen, isLinkOpen, isTemplatesOpen]);

  const stats = useMemo(() => {
    if (!editor || editor.isEmpty) return { words: 0, characters: 0 };
    const text = editor.getText().trim();
    if (!text) return { words: 0, characters: 0 };
    const words = text.split(/\s+/).filter(Boolean).length;
    return { words, characters: text.length };
  }, [editor?.state.doc]);

  const isEditorEmpty = !editor || editor.isEmpty;

  return (
    <div
      data-testid="rich-text-editor"
      className={cn(
        'relative flex flex-col rounded-md border border-input bg-background transition-colors',
        !disabled &&
          'focus-within:border-ring focus-within:ring-1 focus-within:ring-ring focus-within:shadow-[0_0_0_4px_hsl(var(--ring)/0.15)]',
        error &&
          !disabled &&
          'border-destructive focus-within:border-destructive focus-within:ring-destructive',
        disabled && 'cursor-default bg-muted/20 opacity-75',
        isFullscreen &&
          'fixed inset-0 z-50 rounded-none border-0 p-4 sm:p-6 bg-background flex flex-col shadow-2xl',
        className,
      )}
    >
      {/* Draft Recovery Banner */}
      {recoveredDraft && !disabled && (
        <div
          data-testid="draft-recovery-banner"
          className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs shrink-0"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="truncate">{t('products.form.editor.draftNotice')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="font-medium underline hover:text-foreground cursor-pointer"
            >
              {t('products.form.editor.restoreDraft')}
            </button>
            <span className="text-muted-foreground">•</span>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {t('products.form.editor.discardDraft')}
            </button>
          </div>
        </div>
      )}

      {/* Editor Toolbar */}
      <EditorToolbar
        editor={editor}
        disabled={disabled}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        isTableOpen={isTableOpen}
        setIsTableOpen={setIsTableOpen}
        isEmojiOpen={isEmojiOpen}
        setIsEmojiOpen={setIsEmojiOpen}
        isLinkOpen={isLinkOpen}
        setIsLinkOpen={setIsLinkOpen}
        isTemplatesOpen={isTemplatesOpen}
        setIsTemplatesOpen={setIsTemplatesOpen}
      />

      {/* Editor Content Area */}
      <div
        data-testid="rich-text-content-area"
        className={cn(
          'relative px-3 py-2 text-sm text-foreground',
          !disabled ? 'cursor-text' : 'cursor-default',
          '[&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:p-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-xs [&_td]:border [&_td]:border-border [&_td]:p-1.5 [&_td]:text-xs',
          isFullscreen
            ? 'flex-1 min-h-0 max-h-none overflow-y-auto'
            : 'min-h-[140px] max-h-[260px] overflow-y-auto',
          contentClassName,
        )}
        onClick={() => {
          if (!disabled && editor && !editor.isFocused) {
            editor.commands.focus();
          }
        }}
      >
        {placeholder && isEditorEmpty && !disabled && (
          <div className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground select-none">
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {/* Footer / Word Count & Document Size */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border/40 text-[11px] text-muted-foreground select-none bg-muted/10 shrink-0">
        <div className="flex items-center gap-2">
          <span>{t('products.form.editor.words', { count: stats.words })}</span>
          <span>•</span>
          <span>{t('products.form.editor.characters', { count: stats.characters })}</span>
        </div>
        <div>
          <span
            className={
              docByteSize > MAX_PRODUCT_DESCRIPTION_JSON_BYTES
                ? 'font-medium text-destructive'
                : docByteSize > 35_000
                  ? 'text-amber-600 dark:text-amber-400 font-medium'
                  : 'text-muted-foreground'
            }
          >
            {(docByteSize / 1000).toFixed(1)} KB /{' '}
            {(MAX_PRODUCT_DESCRIPTION_JSON_BYTES / 1000).toFixed(0)} KB
          </span>
        </div>
      </div>
    </div>
  );
}
