// Shared by ArticlePreview.jsx and PagePreview.jsx (task 27, Part C1): maps
// one block from the editor's `{ fr, en }` draft shape into the plain,
// language-resolved shape BlockRenderer (and the public API) expect --
// mirrors api/src/lib/localize.js's resolveDoc, but only for the block
// fields this admin editor can actually produce. Kept local rather than
// imported from api/: api/ and site/ are separate bundles, the same reason
// ArticleEditor.jsx duplicates CATEGORY_LABELS.
export const resolve = (field, lang) => (field ? field[lang] || field.fr || '' : '')

/**
 * Task 32, item 5: the single home for "is this image field a populated
 * object or just an id string, and if it's an id, what object does it
 * resolve to". Previously ArticlePreview's own `findImageById` answered
 * this question for `cover` alone, by searching the article's blocks; this
 * function answers it for `cover`, `block.image` (image blocks) and
 * `item.image` (gallery items) alike, from one shared index, so the
 * question is never answered two different ways in two different places.
 *
 * `buildImageIndex` scans every field that COULD hold a populated image
 * object anywhere in the article/page (cover, image blocks, gallery items)
 * and indexes the ones that currently ARE objects, by id. That -- not the
 * blocks alone, and not the cover alone -- is the source of truth this task
 * uses to resolve any OTHER field that currently holds just an id: if the
 * same image is populated anywhere else in this article, an id-only
 * reference to it resolves correctly regardless of which specific field
 * happened to arrive populated and which didn't. An id that appears nowhere
 * as a populated object cannot be resolved client-side at all -- the same
 * boundary `findImageById` already accepted for `cover` alone, extended
 * here to every image field rather than left as a cover-only special case.
 */
export function buildImageIndex(article) {
  const index = new Map()
  const add = (image) => {
    if (image && typeof image === 'object' && image._id) index.set(image._id, image)
  }
  add(article?.cover)
  for (const block of article?.blocks || []) {
    if (block.type === 'image') add(block.image)
    if (block.type === 'gallery' || block.type === 'references') {
      for (const item of block.items || []) add(item.image)
    }
  }
  return index
}

/** Resolves one image field (already an object, a bare id, or null/undefined)
 * against the index `buildImageIndex` built. Returns the populated object,
 * or null if it cannot be resolved -- never throws, and never returns a bare
 * id string for a caller (Picture/img src logic) that expects an object or
 * nothing.
 */
export function resolveImage(image, index) {
  if (image && typeof image === 'object') return image
  if (typeof image === 'string') return index.get(image) || null
  return null
}

export function resolveBlock(block, lang, imageIndex) {
  switch (block.type) {
    // Task 30, part 5: `heading` is retired as a block type -- what used to
    // be a heading is now a `text` block carrying an <h2>/<h3>, so it needs
    // no case of its own here any more.
    case 'text':
      return { ...block, value: resolve(block.value, lang) }
    case 'image':
      return { ...block, image: resolveImage(block.image, imageIndex), caption: resolve(block.caption, lang) }
    case 'gallery':
      return {
        ...block,
        items: (block.items || []).map((item) => ({
          ...item,
          image: resolveImage(item.image, imageIndex),
          caption: resolve(item.caption, lang),
        })),
      }
    // Task 39: like a gallery item, a reference item carries its own
    // image; unlike one, its text is HTML (the citation, sanitized
    // server-side) rather than a plain caption. `url` needs no resolving --
    // it is a plain string, not localized.
    case 'references':
      return {
        ...block,
        items: (block.items || []).map((item) => ({
          ...item,
          image: resolveImage(item.image, imageIndex),
          value: resolve(item.value, lang),
        })),
      }
    case 'specs':
      return { ...block, items: (block.items || []).map((item) => ({ term: resolve(item.term, lang), value: resolve(item.value, lang) })) }
    default:
      return block
  }
}
