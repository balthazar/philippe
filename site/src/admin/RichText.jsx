import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'

/**
 * Stored HTML from a `text` block is sanitized server-side on write against
 * a narrow whitelist: p, br, em, strong, a[href], ul, ol, li, dl, dt, dd,
 * blockquote (api/src/lib/sanitize.js). StarterKit ships several extensions
 * that produce markup outside that list -- heading (h1-h6), codeBlock
 * (pre/code), code, horizontalRule (hr) and strike (s).
 *
 * Hiding their toolbar buttons is NOT enough to keep that markup out: TipTap
 * still binds their keyboard shortcuts and markdown input rules (typing
 * "# " at the start of a line, "```", or the strikethrough shortcut), so
 * without disabling them here the artist could produce markup that looks
 * applied in the editor, survives until save, and is then silently dropped
 * by the server -- the work looks accepted and is quietly discarded. So
 * these extensions are turned off in the schema itself (`false`, not just
 * omitted from the toolbar), which also means content fed in from outside
 * (paste, or old stored HTML) can never be represented by this editor
 * either. See src/admin/__tests__/RichText.test.jsx, which proves this by
 * feeding disallowed markup directly and asserting none of it survives.
 */
const extensions = [
  StarterKit.configure({
    heading: false,
    codeBlock: false,
    code: false,
    horizontalRule: false,
    strike: false,
  }),
  Link.configure({ openOnClick: false }),
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

  const buttons = [
    { name: 'bold', label: 'Gras', run: () => editor.chain().focus().toggleBold().run() },
    { name: 'italic', label: 'Italique', run: () => editor.chain().focus().toggleItalic().run() },
    { name: 'bulletList', label: 'Liste à puces', run: () => editor.chain().focus().toggleBulletList().run() },
    { name: 'orderedList', label: 'Liste numérotée', run: () => editor.chain().focus().toggleOrderedList().run() },
    { name: 'blockquote', label: 'Citation', run: () => editor.chain().focus().toggleBlockquote().run() },
  ]

  return (
    <div className="rich-text">
      <div className="rich-text-toolbar" role="toolbar">
        {buttons.map((b) => (
          <button
            key={b.name}
            type="button"
            className={editor.isActive(b.name) ? 'active' : ''}
            onClick={b.run}
          >
            {b.label}
          </button>
        ))}
        <button type="button" className={editor.isActive('link') ? 'active' : ''} onClick={setLink}>
          Lien
        </button>
      </div>
      <EditorContent editor={editor} className="rich-text-content" />
    </div>
  )
}
