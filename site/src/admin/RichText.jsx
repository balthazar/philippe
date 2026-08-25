import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { BoldIcon, ItalicIcon, BulletListIcon, OrderedListIcon, BlockquoteIcon, HeadingIcon, LinkIcon } from './icons.jsx'
import { TextColor, TEXT_COLORS } from './textColor.js'

/**
 * Stored HTML from a `text` block is sanitized server-side on write against
 * a narrow whitelist: p, br, em, strong, a[href], span[class] (limited to
 * the colour classes in TEXT_COLOR_CLASSES), ul, ol, li, dl, dt, dd,
 * blockquote, h2, h3 (api/src/lib/sanitize.js). StarterKit ships several
 * extensions that produce markup outside that list -- codeBlock (pre/code),
 * code, horizontalRule (hr), strike (s), and heading at levels the server
 * does not allow (h1, which the article title itself owns, and h4-h6, which
 * this project has no use for).
 *
 * Hiding a toolbar button is NOT enough to keep any of this out: TipTap
 * still binds keyboard shortcuts and markdown input rules (typing "# " or
 * "#### " at the start of a line, "```", or the strikethrough shortcut), so
 * without restricting the schema itself the artist could produce markup
 * that looks applied in the editor, survives until save, and is then
 * silently dropped by the server -- the work looks accepted and is quietly
 * discarded. So:
 *   - codeBlock, code, horizontalRule and strike stay OFF (`false`), exactly
 *     as before Task 30 -- the file's own comment used to list heading here
 *     too; it no longer does.
 *   - heading is back ON, but restricted to `levels: [2, 3]`, so h1/h4/h5/h6
 *     can never be represented by this editor either -- matching the server
 *     whitelist exactly, both what it allows (h2, h3) and what it withholds
 *     (h1, reserved for the article title).
 * This also means content fed in from outside (paste, or old stored HTML)
 * can never be represented outside these exact bounds. See
 * src/admin/__tests__/RichText.test.jsx, which proves this by feeding
 * disallowed markup directly and asserting none of it survives, and by
 * feeding h2/h3 and asserting it does.
 */
const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    codeBlock: false,
    code: false,
    horizontalRule: false,
    strike: false,
  }),
  // HTMLAttributes must be nulled explicitly. @tiptap/extension-link defaults
  // to { target: '_blank', rel: 'noopener noreferrer nofollow' } and merges
  // them into every rendered <a>, which is markup beyond the server's `a[href]`
  // whitelist. The sanitizer would strip them on save, so nothing breaks, but
  // this file claims the editor can only ever produce whitelist-safe markup and
  // that claim has to actually be true -- otherwise the next person trusts a
  // guarantee the code does not keep.
  Link.configure({
    openOnClick: false,
    HTMLAttributes: { target: null, rel: null, class: null },
  }),
  // Renders `<span class="text-muted">` and nothing else: its own attribute
  // parser rejects any class outside the list, so this extension cannot
  // widen what the editor is able to produce beyond the server's whitelist
  // either -- the same guarantee the configuration above exists to keep.
  TextColor,
]

export function RichText({ value, onChange }) {
  const editor = useEditor({
    extensions,
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Keep the editor in sync when `value` changes for a reason other than
  // this editor's own typing -- switching the FR/EN toggle (a different
  // block.value[lang] string) or reordering blocks. Comparing against the
  // editor's own current HTML avoids clobbering the cursor on every
  // keystroke: right after onUpdate fires, the parent re-renders with the
  // same html this editor already holds, so this is a no-op then.
  useEffect(() => {
    if (!editor) return
    const next = value || ''
    if (next !== editor.getHTML()) {
      editor.commands.setContent(next, false)
    }
  }, [value, editor])

  if (!editor) return null

  const setLink = () => {
    const previous = editor.getAttributes('link').href
    // eslint-disable-next-line no-alert
    const url = window.prompt('URL du lien', previous || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  // Every entry here corresponds to a mark/node the schema above actually
  // allows (bold, italic, bullet list, ordered list, blockquote, heading,
  // link) and no others: a button for code, a code block, a horizontal rule
  // or strikethrough would let the artist apply something that looks
  // accepted in the editor and is then silently stripped by the server on
  // save. See the file-level comment for why those extensions are disabled
  // in the schema itself, not just left out of this toolbar.
  //
  // Task 30, part 5: the heading button toggles level 2 specifically -- the
  // single toolbar button the brief calls for. Level 3 stays representable
  // (see RichText.test.jsx) via TipTap's own "### " markdown input rule
  // without a second button.
  const buttons = [
    { name: 'bold', label: 'Gras', Icon: BoldIcon, run: () => editor.chain().focus().toggleBold().run() },
    { name: 'italic', label: 'Italique', Icon: ItalicIcon, run: () => editor.chain().focus().toggleItalic().run() },
    { name: 'bulletList', label: 'Liste à puces', Icon: BulletListIcon, run: () => editor.chain().focus().toggleBulletList().run() },
    { name: 'orderedList', label: 'Liste numérotée', Icon: OrderedListIcon, run: () => editor.chain().focus().toggleOrderedList().run() },
    { name: 'blockquote', label: 'Citation', Icon: BlockquoteIcon, run: () => editor.chain().focus().toggleBlockquote().run() },
    // Label "Titre de section", not the bare "Titre" every LocalizedInput
    // field for an article/page's own title already uses (ArticleEditor.jsx,
    // PageEditor.jsx) -- a RichText toolbar can render nested inside either
    // form alongside that field, and a colliding accessible name breaks
    // getByLabelText-style lookups for BOTH controls, not just this one.
    {
      name: 'heading',
      label: 'Titre de section',
      Icon: HeadingIcon,
      isActive: () => editor.isActive('heading', { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
  ]

  // A <select>, not one button per colour: the toolbar is already seven
  // controls wide inside a block editor that can show several at once, and
  // a colour is a choice among alternatives (including "none") rather than
  // a state to toggle. Its value is read from the selection, so it shows
  // what the cursor is actually sitting in.
  const activeColor = TEXT_COLORS.find((c) => editor.isActive('textColor', { className: c.className }))
  const onColorChange = (e) => {
    const { value } = e.target
    if (value) editor.chain().focus().setTextColor(value).run()
    else editor.chain().focus().unsetTextColor().run()
  }

  return (
    <div className="rich-text">
      <div className="rich-text-toolbar" role="toolbar">
        {buttons.map((b) => (
          <button
            key={b.name}
            type="button"
            className={(b.isActive ? b.isActive() : editor.isActive(b.name)) ? 'active' : ''}
            aria-label={b.label}
            title={b.label}
            onClick={b.run}
          >
            <b.Icon />
          </button>
        ))}
        <button type="button" className={editor.isActive('link') ? 'active' : ''} aria-label="Lien" title="Lien" onClick={setLink}>
          <LinkIcon />
        </button>
        <select
          className="rich-text-color"
          aria-label="Couleur du texte"
          title="Couleur du texte"
          value={activeColor?.className || ''}
          onChange={onColorChange}
        >
          <option value="">Noir</option>
          {TEXT_COLORS.map((c) => (
            <option key={c.className} value={c.className}>{c.label}</option>
          ))}
        </select>
      </div>
      <EditorContent editor={editor} className="rich-text-content" />
    </div>
  )
}
