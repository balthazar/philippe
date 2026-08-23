import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RichText } from '../RichText.jsx'

/**
 * Controller correction 2: the API sanitizes stored HTML server-side against
 * a whitelist (p, br, em, strong, a[href], ul, ol, li, dl, dt, dd,
 * blockquote). StarterKit ships heading/codeBlock/code/horizontalRule/strike,
 * which all produce markup outside that list. A restricted toolbar alone
 * does not stop them: TipTap still binds their keyboard shortcuts and
 * markdown input rules. These extensions must be disabled in the schema
 * itself, not just hidden from the toolbar, so content that would use them
 * (typed, pasted, or already stored) can never round-trip through the editor
 * as forbidden markup.
 *
 * This is exercised by feeding the editor HTML that uses every disabled
 * feature and asserting none of it survives in the rendered document. If any
 * of the StarterKit.configure({...: false}) lines in RichText.jsx were
 * reverted to `true` (or simply omitted), the corresponding node/mark would
 * re-enter the schema and this test would fail because the forbidden tag
 * would render.
 */
describe('RichText', () => {
  it('never represents heading, code block, inline code, hr or strike, even when fed that markup directly', () => {
    const dirty =
      '<h1>Titre interdit</h1>' +
      '<pre><code>const x = 1</code></pre>' +
      '<hr/>' +
      '<p><s>barré</s> et <code>inline</code></p>' +
      '<p>Paragraphe autorisé</p>'

    const { container } = render(<RichText value={dirty} onChange={() => {}} />)
    const doc = container.querySelector('.ProseMirror')

    expect(doc).toBeTruthy()
    expect(doc.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull()
    expect(doc.querySelector('pre')).toBeNull()
    expect(doc.querySelector('code')).toBeNull()
    expect(doc.querySelector('hr')).toBeNull()
    expect(doc.querySelector('s')).toBeNull()
    // The allowed paragraph survives, proving content isn't just being
    // wholesale dropped -- only the forbidden nodes/marks are unrepresentable.
    expect(doc.textContent).toContain('Paragraphe autorisé')
  })

  it('keeps the allowed marks: bold, italic, links, lists and blockquote', () => {
    const clean =
      '<p><strong>gras</strong> <em>italique</em> <a href="https://example.com">lien</a></p>' +
      '<ul><li>un</li><li>deux</li></ul>' +
      '<ol><li>un</li></ol>' +
      '<blockquote><p>citation</p></blockquote>'

    const { container } = render(<RichText value={clean} onChange={() => {}} />)
    const doc = container.querySelector('.ProseMirror')

    expect(doc.querySelector('strong')).toBeTruthy()
    expect(doc.querySelector('em')).toBeTruthy()
    const link = doc.querySelector('a[href="https://example.com"]')
    expect(link).toBeTruthy()
    // href and nothing else: the Link extension's defaults would otherwise add
    // target and rel, which fall outside the server's `a[href]` whitelist.
    expect([...link.attributes].map((a) => a.name).sort()).toEqual(['href'])
    expect(doc.querySelectorAll('ul li')).toHaveLength(2)
    expect(doc.querySelector('ol li')).toBeTruthy()
    expect(doc.querySelector('blockquote')).toBeTruthy()
  })

  it('calls onChange with sanitized-schema HTML as the user types', async () => {
    const onChange = vi.fn()
    const { container } = render(<RichText value="" onChange={onChange} />)
    const doc = container.querySelector('.ProseMirror')
    expect(doc).toBeTruthy()
    expect(doc.getAttribute('contenteditable')).toBe('true')
  })

  // Task 25, section 4: the toolbar became icon-only buttons. Covers exactly
  // the marks the schema permits (bold, italic, bullet list, ordered list,
  // blockquote, link) and, per the accessibility rule, checks aria-label and
  // title as explicit attributes -- a title-only button would still resolve
  // to the same accessible name via the browser's title fallback, so the
  // accessible-name query alone couldn't prove aria-label is actually set.
  it('gives every toolbar button both an aria-label and a title, for exactly the allowed marks', () => {
    render(<RichText value="" onChange={() => {}} />)
    const expected = ['Gras', 'Italique', 'Liste à puces', 'Liste numérotée', 'Citation', 'Lien']
    const toolbar = screen.getByRole('toolbar')
    const buttons = within(toolbar).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(expected)
    for (const button of buttons) {
      const label = button.getAttribute('aria-label')
      expect(button).toHaveAttribute('title', label)
    }
  })
})
