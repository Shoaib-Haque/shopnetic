'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
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
} from 'lucide-react';
import { Button, Input, Popover, PopoverTrigger, PopoverContent, cn } from '@shopnetic/ui';
import {
  getJsonByteLength,
  isDocEmpty,
  isValidDescriptionLinkHref,
  MAX_PRODUCT_DESCRIPTION_JSON_BYTES,
  type ProductDescriptionDoc,
} from '@shopnetic/contracts';

export interface RichTextEditorProps {
  value?: ProductDescriptionDoc | null | undefined;
  onChange: (value: ProductDescriptionDoc | null) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string | undefined;
  id?: string;
  className?: string;
  contentClassName?: string;
}

function toJSONContent(doc: ProductDescriptionDoc | null | undefined): JSONContent {
  if (!doc) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  return JSON.parse(JSON.stringify(doc)) as JSONContent;
}

export function RichTextEditor({
  value,
  onChange,
  disabled = false,
  placeholder,
  error,
  id,
  className,
  contentClassName,
}: RichTextEditorProps) {
  const t = useTranslations('catalog');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkTextError, setLinkTextError] = useState<string | null>(null);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [requiresText, setRequiresText] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

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
    ],
    editorProps: {
      attributes: {
        role: 'textbox',
        ...(id ? { id } : {}),
        'aria-label': t('products.form.description'),
        'aria-multiline': 'true',
        'aria-disabled': disabled ? 'true' : 'false',
        tabindex: disabled ? '-1' : '0',
      },
    },
    ...(value ? { content: toJSONContent(value) } : {}),
    onUpdate: ({ editor: instance }) => {
      const json = instance.getJSON() as ProductDescriptionDoc;
      if (isDocEmpty(json)) {
        onChange(null);
      } else {
        onChange(json);
      }
    },
  });

  // Keep editor content in sync with external value updates (e.g. form reset or product load)
  useEffect(() => {
    if (!editor) return;
    const currentJson = editor.getJSON();
    if (!value && isDocEmpty(currentJson as ProductDescriptionDoc)) return;
    if (JSON.stringify(currentJson) !== JSON.stringify(value)) {
      editor.commands.setContent(toJSONContent(value));
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

  const handleOpenLink = () => {
    if (!editor) return;
    const isLinkActive = editor.isActive('link');
    const { empty } = editor.state.selection;

    const prevUrl = (editor.getAttributes('link').href as string | undefined) || '';
    setLinkUrl(prevUrl);
    setLinkText('');
    setLinkError(null);
    setLinkTextError(null);

    // If an existing link is active or text is selected in the editor, skip text input
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

      // Insert new text node with link mark at current cursor position
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
      // Apply link mark to the highlighted range or update existing link
      editor.chain().focus().extendMarkRange('link').setLink({ href: trimmedUrl }).run();
    }

    setIsLinkOpen(false);
  };

  const handleUnlink = () => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setIsLinkOpen(false);
  };

  const isEditorEmpty = !editor || editor.isEmpty;

  return (
    <div
      data-testid="rich-text-editor"
      className={cn(
        'relative flex flex-col rounded-md border border-input bg-background transition-colors',
        'focus-within:border-ring focus-within:ring-1 focus-within:ring-ring focus-within:shadow-[0_0_0_4px_hsl(var(--ring)/0.15)]',
        error && 'border-destructive focus-within:border-destructive focus-within:ring-destructive',
        disabled && 'cursor-not-allowed bg-muted/20 opacity-70',
        className,
      )}
    >
      {/* Mini Toolbar */}
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
            editor?.isActive('heading', { level: 2 }) &&
              'bg-muted text-primary font-bold shadow-xs',
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
            editor?.isActive('heading', { level: 3 }) &&
              'bg-muted text-primary font-bold shadow-xs',
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

              {requiresText && (
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="editor-link-text-input"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    {t('products.form.editor.linkText')}
                  </label>
                  <Input
                    id="editor-link-text-input"
                    ref={textInputRef}
                    value={linkText}
                    onChange={(e) => {
                      setLinkText(e.target.value);
                      setLinkTextError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        urlInputRef.current?.focus();
                      }
                    }}
                    placeholder={t('products.form.editor.linkTextPlaceholder')}
                    autoFocus
                    invalid={Boolean(linkTextError)}
                  />
                  {linkTextError && <p className="text-xs text-destructive">{linkTextError}</p>}
                </div>
              )}

              <div className="flex flex-col gap-1">
                {requiresText && (
                  <label
                    htmlFor="editor-link-url-input"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    {t('products.form.editor.linkUrl')}
                  </label>
                )}
                <Input
                  id="editor-link-url-input"
                  ref={urlInputRef}
                  value={linkUrl}
                  onChange={(e) => {
                    setLinkUrl(e.target.value);
                    setLinkError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyLink();
                    }
                  }}
                  placeholder={t('products.form.editor.linkPlaceholder')}
                  autoFocus={!requiresText}
                  invalid={Boolean(linkError)}
                />
                {linkError && <p className="text-xs text-destructive">{linkError}</p>}
              </div>

              <div className="flex items-center justify-between pt-1">
                {editor?.isActive('link') ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleUnlink}
                    className="text-destructive hover:text-destructive text-xs h-7 px-2"
                  >
                    <Unlink className="mr-1 h-3 w-3" />
                    {t('products.form.editor.linkRemove')}
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2 ml-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsLinkOpen(false)}
                    className="text-xs h-7 px-2.5"
                  >
                    {t('products.form.editor.linkCancel')}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleApplyLink}
                    className="text-xs h-7 px-2.5"
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
      </div>

      {/* Editor Content Area */}
      <div
        data-testid="rich-text-content-area"
        className={cn(
          'relative min-h-[140px] max-h-[260px] overflow-y-auto px-3 py-2 text-sm text-foreground cursor-text',
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

      {/* Footer / Size Warning */}
      {docByteSize > 35_000 && (
        <div className="flex items-center justify-end px-3 py-1 border-t border-border/40 text-[11px] text-muted-foreground">
          <span
            className={
              docByteSize > MAX_PRODUCT_DESCRIPTION_JSON_BYTES
                ? 'font-medium text-destructive'
                : 'text-amber-600 dark:text-amber-400'
            }
          >
            {(docByteSize / 1000).toFixed(1)} KB /{' '}
            {(MAX_PRODUCT_DESCRIPTION_JSON_BYTES / 1000).toFixed(0)} KB
          </span>
        </div>
      )}
    </div>
  );
}
