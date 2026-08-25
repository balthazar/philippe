import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * The colours the artist can apply to stored text, and the only ones the
 * server will keep: this list must stay identical to TEXT_COLOR_CLASSES in
 * api/src/lib/sanitize.js, which is what actually enforces it on write.
 * Duplicated rather than imported for the same reason constants.js's
 * SEGMENTS is duplicated in routes.js -- the api and the site are separate
 * deployables and neither container holds the other's source at runtime.
 *
 * Deliberately a short, closed list of the palette's own steps rather than a
 * colour wheel. The artist asked to make a date quieter than its entry, not
 * to choose from sixteen million values; a free picker would also let stored
 * content name colours that exist nowhere in tokens.css, which is exactly
 * how a site stops having a palette. `label` is what the toolbar shows.
 */
export const TEXT_COLORS = [
  { className: 'text-ink', label: 'Encre' },
  { className: 'text-muted', label: 'Gris' },
  { className: 'text-soft', label: 'Gris clair' },
]

const CLASS_NAMES = TEXT_COLORS.map((c) => c.className)

/**
 * A TipTap mark rendering `<span class="text-muted">`.
 *
 * A MARK, not a node attribute, and that is the whole design: a mark wraps
 * inline content, so colouring a heading produces
 * `<h3><span class="text-muted">…</span></h3>` and never
 * `<h3 class="text-muted">`. The heading node has nowhere to keep a class,
 * so a colour written onto the element itself would be dropped the first
 * time the artist opened that block in this editor -- the text would keep
 * its colour on the public site right up until someone edited the block,
 * then silently lose it. Wrapping the content instead means the colour
 * survives every round trip through the editor, which is what makes it safe
 * to write from a script and edit by hand afterwards.
 *
 * `parseHTML` accepts only the known class names, so pasted markup carrying
 * some other class arrives as plain text here, matching what the server
 * would have done to it on save.
 */
export const TextColor = Mark.create({
  name: 'textColor',

  addAttributes() {
    return {
      className: {
        default: null,
        parseHTML: (element) => (CLASS_NAMES.includes(element.className) ? element.className : null),
        renderHTML: (attributes) => (attributes.className ? { class: attributes.className } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span', getAttrs: (el) => CLASS_NAMES.includes(el.className) && null }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setTextColor: (className) => ({ commands }) => {
        if (!CLASS_NAMES.includes(className)) return false
        return commands.setMark(this.name, { className })
      },
      unsetTextColor: () => ({ commands }) => commands.unsetMark(this.name),
    }
  },
})
