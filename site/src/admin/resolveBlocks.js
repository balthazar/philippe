// Shared by ArticlePreview.jsx and PagePreview.jsx (task 27, Part C1): maps
// one block from the editor's `{ fr, en }` draft shape into the plain,
// language-resolved shape BlockRenderer (and the public API) expect --
// mirrors api/src/lib/localize.js's resolveDoc, but only for the block
// fields this admin editor can actually produce. Kept local rather than
// imported from api/: api/ and site/ are separate bundles, the same reason
// ArticleEditor.jsx duplicates CATEGORY_LABELS.
export const resolve = (field, lang) => (field ? field[lang] || field.fr || '' : '')

export function resolveBlock(block, lang) {
  switch (block.type) {
    // Task 30, part 5: `heading` is retired as a block type -- what used to
    // be a heading is now a `text` block carrying an <h2>/<h3>, so it needs
    // no case of its own here any more.
    case 'text':
      return { ...block, value: resolve(block.value, lang) }
    case 'image':
      return { ...block, caption: resolve(block.caption, lang) }
    case 'gallery':
      return { ...block, items: (block.items || []).map((item) => ({ ...item, caption: resolve(item.caption, lang) })) }
    case 'specs':
      return { ...block, items: (block.items || []).map((item) => ({ term: resolve(item.term, lang), value: resolve(item.value, lang) })) }
    default:
      return block
  }
}
