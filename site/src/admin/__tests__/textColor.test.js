import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextColor, TEXT_COLORS } from '../textColor.js'

/**
 * The mark itself, driven through TipTap's own command API rather than
 * through the toolbar. Applying a colour needs a real text selection, and
 * ProseMirror maps a click to a document position via `elementFromPoint`,
 * which jsdom does not implement -- so a click-driven test can only ever
 * prove that nothing happened. RichText.test.jsx covers the toolbar's own
 * rendering and the round trip through stored HTML; this covers what the
 * command actually does to the document.
 */
const editorWith = (content) =>
  new Editor({ extensions: [StarterKit.configure({ codeBlock: false, code: false, horizontalRule: false, strike: false }), TextColor], content })

describe('TextColor', () => {
  it('wraps the selection in a span carrying the class', () => {
    const editor = editorWith('<p>2024</p>')
    editor.commands.selectAll()
    editor.commands.setTextColor('text-muted')
    expect(editor.getHTML()).toBe('<p><span class="text-muted">2024</span></p>')
    editor.destroy()
  })

  it('clears the colour again, leaving the text alone', () => {
    const editor = editorWith('<p><span class="text-muted">2024</span></p>')
    editor.commands.selectAll()
    editor.commands.unsetTextColor()
    expect(editor.getHTML()).toBe('<p>2024</p>')
    editor.destroy()
  })

  // A mark, not a node attribute: colouring a heading must wrap its content,
  // never land as `<h3 class="...">`, which the heading node cannot carry and
  // would silently lose on the next edit.
  it('colours a heading by wrapping its content, not by classing the heading', () => {
    const editor = editorWith('<h3>• EXPOSITIONS PERSONNELLES</h3>')
    editor.commands.selectAll()
    editor.commands.setTextColor('text-muted')
    expect(editor.getHTML()).toBe('<h3><span class="text-muted">• EXPOSITIONS PERSONNELLES</span></h3>')
    editor.destroy()
  })

  it('composes with bold, so a date can be both', () => {
    const editor = editorWith('<p>2024</p>')
    editor.commands.selectAll()
    editor.commands.setTextColor('text-muted')
    editor.commands.setBold()
    expect(editor.getHTML()).toContain('class="text-muted"')
    expect(editor.getHTML()).toContain('<strong>')
    editor.destroy()
  })

  // The server keeps a closed list (TEXT_COLOR_CLASSES in
  // api/src/lib/sanitize.js). The editor must not be able to name anything
  // else, or markup would look applied here and be stripped on save.
  it('refuses a class outside the offered list', () => {
    const editor = editorWith('<p>x</p>')
    editor.commands.selectAll()
    expect(editor.commands.setTextColor('site-header')).toBe(false)
    expect(editor.getHTML()).toBe('<p>x</p>')
    editor.destroy()
  })

  it('drops an unknown class when parsing stored HTML', () => {
    const editor = editorWith('<p><span class="site-header">x</span></p>')
    expect(editor.getHTML()).toBe('<p>x</p>')
    editor.destroy()
  })

  it('offers only palette steps, never a free colour value', () => {
    expect(TEXT_COLORS.map((c) => c.className)).toEqual(['text-ink', 'text-muted', 'text-soft'])
  })
})
