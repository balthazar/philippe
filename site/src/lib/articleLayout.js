// Task 30, part 5: the `heading` block type is retired -- what used to be a
// heading block is now a `text` block carrying an <h2>/<h3>, so it no longer
// needs (or gets) a separate entry here.
const TEXT_TYPES = new Set(['text', 'specs'])
const MEDIA_TYPES = new Set(['image', 'gallery'])

/**
 * Splits an article's blocks into a text column and a media column for the
 * desktop two-column layout (task 26, part B2: text left, gallery right).
 *
 * Only splits when the blocks partition cleanly into a text-only prefix
 * followed by a media-only suffix -- true for every works article (the
 * technique/description/specs text, then the gallery of the work) and most
 * single-exhibition articles. A handful of multi-exhibition-per-year pages
 * interleave heading+text+gallery groups, one per exhibition; splitting
 * those would separate each heading from its own gallery, so they fall
 * back to `twoColumn: false` and render as a single column, unchanged.
 */
export function splitArticleLayout(blocks = []) {
  const firstMediaIndex = blocks.findIndex((b) => MEDIA_TYPES.has(b.type))
  if (firstMediaIndex === -1) return { text: blocks, media: [], twoColumn: false }

  const text = blocks.slice(0, firstMediaIndex)
  const media = blocks.slice(firstMediaIndex)
  const twoColumn = text.every((b) => TEXT_TYPES.has(b.type)) && media.every((b) => MEDIA_TYPES.has(b.type))
  return twoColumn ? { text, media, twoColumn: true } : { text: blocks, media: [], twoColumn: false }
}
