import sanitizeHtml from 'sanitize-html'

// Duplicated from api/src/lib/sanitize.js on purpose: migrate/ is a separate
// package from api/. Keep these two whitelists identical. Task 30, part 5:
// h2/h3 added (never h1 -- the article title owns the page's only h1) so a
// migrated heading (see headingToText, below) survives this sanitizer the
// same way the live admin's would.
const OPTIONS = {
  allowedTags: ['p', 'br', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'h2', 'h3'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https', 'mailto'],
}
const clean = (html) => (html ? sanitizeHtml(html, OPTIONS) : '')

// `global` is deliberately NOT here. Elementor global widgets keep their
// canonical copy in an elementor_library template and cache the rendered
// settings inline. This archive has exactly one, in a PUBLISHED article, and it
// carries a photo credit line. Dropping it would lose that silently, which is
// precisely the failure mode this phase exists to prevent.
//
// The three below ARE safe to drop, each for a documented reason inspected
// against the real data, not by default:
//   - the7-post-loop: the theme's dynamic archive query (the works grid on
//     oeuvres/works). Its settings are filter/pagination config, no static
//     content. The new site regenerates this grid natively (Task 16) by
//     querying /api/articles?category=works; the page's own intro text is
//     preserved separately as page blocks.
//   - the7_content_carousel: dynamic carousel sourced from posts (`source`,
//     `autoplay`, `arrows`), no static content. The new home page's featured
//     slideshow plus selection grid covers the same ground.
//   - slider_revolution: per the approved spec, Revolution Slider content is
//     explicitly out of migration scope; the homepage slideshow is rebuilt
//     from works flagged "en avant". This is agreed scope, not an oversight.
const DROP = new Set(['spacer', 'the7_nav-menu', 'post-navigation', 'the7-post-loop', 'the7_content_carousel', 'slider_revolution'])

export function* walkWidgets(nodes = []) {
  for (const node of nodes || []) {
    if (node?.elType === 'widget') yield node
    if (node?.elements?.length) yield* walkWidgets(node.elements)
  }
}

/** Splits a <dl> out of a text blob so provenance data becomes structured. */
export function liftSpecs(html) {
  const parts = []
  const re = /<dl[\s\S]*?<\/dl>/gi
  let last = 0
  for (const match of html.matchAll(re)) {
    const before = html.slice(last, match.index).trim()
    if (before) parts.push({ type: 'text', html: before })
    const items = []
    const pairRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi
    for (const pair of match[0].matchAll(pairRe)) {
      items.push({ term: stripTags(pair[1]), value: stripTags(pair[2]) })
    }
    if (items.length) parts.push({ type: 'specs', items })
    last = match.index + match[0].length
  }
  const rest = html.slice(last).trim()
  if (rest) parts.push({ type: 'text', html: rest })
  return parts.length ? parts : [{ type: 'text', html }]
}

// sanitize-html decodes entities while parsing and then re-encodes the three
// characters that are unsafe in HTML text (& < >) on the way out. That is
// correct when the output is HTML, and wrong here: every stripTags caller
// stores a field that is rendered as PLAIN TEXT (heading values, specs terms
// and values, button labels), deliberately never through
// dangerouslySetInnerHTML, because those fields are not sanitized on write.
// Left as-is, the biography page shipped a heading reading
// "BOURSES &amp;amp; RESIDENCES". Note &quot; and numeric entities need no
// handling: sanitize-html already returns those decoded.
//
// &amp; is reversed LAST and that ordering is load-bearing. Reversing it
// first would turn "&amp;lt;" into "&lt;" and then into "<", collapsing two
// levels of escaping instead of one and inventing markup the source never had.
const unescapeTextEntities = (s) => s
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')

const stripTags = (s) => unescapeTextEntities(sanitizeHtml(s, { allowedTags: [], allowedAttributes: {} })).trim()

function galleryIds(settings) {
  // `query_manual_attachment` is how every real wpr-media-grid widget in the
  // archive actually stores its images (query_selection: 'manual'), confirmed
  // against all 78 instances in the live data. `images`/`gallery` are kept as
  // defensive fallbacks for shapes not seen in this archive but plausible for
  // the widget in general; wp_gallery is what image-gallery uses.
  const list = settings?.wp_gallery || settings?.query_manual_attachment || settings?.images || settings?.gallery || []
  return list.map((i) => Number(i.id)).filter(Boolean)
}

function widgetToBlocks(widget, ctx) {
  const s = widget.settings || {}
  switch (widget.widgetType) {
    case 'text-editor':
      return liftSpecs(clean(s.editor || '')).map((part) =>
        part.type === 'specs'
          ? { type: 'specs', items: part.items.map((i) => ({ term: { fr: i.term, en: '' }, value: { fr: i.value, en: '' } })) }
          : { type: 'text', value: { fr: part.html, en: '' } }
      )
    case 'heading':
      return [{ type: 'heading', value: { fr: stripTags(s.title || ''), en: '' }, level: s.header_size === 'h3' ? 3 : 2 }]
    case 'image':
      return s.image?.id
        ? [{ type: 'image', image: { legacyWpId: Number(s.image.id) }, caption: { fr: '', en: '' }, size: 'wide' }]
        : []
    case 'image-gallery':
    case 'wpr-media-grid': {
      const ids = galleryIds(s)
      return ids.length
        ? [{ type: 'gallery', columns: 3, items: ids.map((id) => ({ image: { legacyWpId: id }, caption: { fr: '', en: '' } })) }]
        : []
    }
    case 'toggle': {
      // The biography page's toggle holds real content (collection listings),
      // not chrome. Each tab becomes a heading plus its body text. Find the
      // repeater by shape rather than by key name. Both real toggles in this
      // archive use `tabs`, but the lookup does not depend on that, so a
      // theme or Elementor version that names it differently still migrates.
      const items = Object.values(s).find(
        (v) => Array.isArray(v) && v.some((it) => it && (it.tab_title || it.tab_content))
      )
      if (!items) {
        throw new Error(`toggle widget in post ${ctx.postId} has no tab items; inspect it rather than dropping it`)
      }
      return items.flatMap((it) => [
        ...(it.tab_title ? [{ type: 'heading', value: { fr: stripTags(it.tab_title), en: '' }, level: 3 }] : []),
        ...(it.tab_content ? liftSpecs(clean(it.tab_content)).map((part) =>
          part.type === 'specs'
            ? { type: 'specs', items: part.items.map((i) => ({ term: { fr: i.term, en: '' }, value: { fr: i.value, en: '' } })) }
            : { type: 'text', value: { fr: part.html, en: '' } }
        ) : []),
      ])
    }
    case 'button': {
      // Settings carry `text` and `link.url`, on the bibliography page: almost
      // certainly document links. The sanitize whitelist already allows
      // a[href], so a text block holding an anchor round-trips safely.
      const label = stripTags(s.text || '')
      const href = s.link?.url || ''
      if (!label && !href) return []
      const html = href ? `<p><a href="${href}">${label || href}</a></p>` : `<p>${label}</p>`
      return [{ type: 'text', value: { fr: clean(html), en: '' } }]
    }
    case 'global': {
      // Infer the underlying widget from the cached inline settings rather than
      // resolving templateID, which needs a second query for the same payload.
      // If nothing recognisable is there, throw rather than drop it.
      if (typeof s.editor === 'string') return widgetToBlocks({ ...widget, widgetType: 'text-editor' }, ctx)
      if (typeof s.title === 'string') return widgetToBlocks({ ...widget, widgetType: 'heading' }, ctx)
      if (s.image?.id) return widgetToBlocks({ ...widget, widgetType: 'image' }, ctx)
      throw new Error(
        `global widget in post ${ctx.postId} (templateID ${s.templateID ?? 'unknown'}) has no inferable content; ` +
        `inspect it and add an explicit mapping rather than dropping it`
      )
    }
    default:
      if (DROP.has(widget.widgetType)) return []
      // Failing loudly is the point: a new mapping is cheap, lost content is not.
      throw new Error(`unknown Elementor widget "${widget.widgetType}" in post ${ctx.postId}`)
  }
}

/**
 * A heading with nothing but headings after it labels content that no longer
 * exists. That happens where a dropped dynamic widget (the7-post-loop and
 * friends) was introduced by a heading: we regenerate those listings from the
 * database, correctly labelled, so the original label is left stranded.
 * Verified against the real archive: this removes exactly the two orphans on
 * the works page and touches nothing else (0 of 63 articles are affected).
 */
function dropTrailingHeadings(blocks) {
  let end = blocks.length
  while (end > 0 && blocks[end - 1].type === 'heading') end -= 1
  return blocks.slice(0, end)
}

// Task 26, part A2: the Elementor default that a "Heading" widget is dropped
// onto the page with, never edited. 76 of 115 heading blocks in the archive
// are exactly this string; the artist confirmed none of it is real content.
// Matched exactly, not by category or article, so the ~39 genuine exhibition
// titles (and any other heading whose text merely starts the same way, or
// carries extra content) survive untouched.
const PLACEHOLDER_HEADING = 'Ajoutez votre titre ici'

function isPlaceholderHeading(block) {
  return block.type === 'heading' && block.value.fr.trim() === PLACEHOLDER_HEADING
}

export function dropPlaceholderHeadings(blocks) {
  return blocks.filter((b) => !isPlaceholderHeading(b))
}

// `<`, `>` and `&` must be escaped before being interposed into an HTML
// template string: `stripTags`/`unescapeTextEntities` upstream already
// decoded a heading's title down to plain text (so an artist-facing value
// never reads as double-escaped), so wrapping it in `<h2>...</h2>` without
// re-escaping here would let a literal "<" in a title be parsed as markup by
// the sanitizer below instead of shown as text -- at best stripped, at worst
// a different tag than intended.
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Task 30, part 5: retires the `heading` block type. A `heading` is still
// used INTERNALLY throughout this file (dropTrailingHeadings,
// dropPlaceholderHeadings, the fr/en merge above) because those all key off
// `block.type === 'heading'` and there is no reason to disturb logic that
// already works -- this is the one place, at the very end of
// mapElementorToBlocks, that turns whatever heading blocks survived into
// `text` blocks carrying an `<h2>` or `<h3>` (never `<h1>`: the article
// title owns the page's only h1, and `level` was always 2 or 3 already,
// schema-enforced, so this mapping can never produce one). Run through the
// same `clean()` every other text block goes through, so a migrated heading
// is sanitized exactly the way a live admin-authored one would be.
function headingToText(block) {
  const wrap = (text) => (text ? clean(`<h${block.level}>${escapeHtml(text)}</h${block.level}>`) : '')
  return { type: 'text', value: { fr: wrap(block.value.fr), en: wrap(block.value.en) } }
}

export function convertHeadingsToText(blocks) {
  return blocks.map((b) => (b.type === 'heading' ? headingToText(b) : b))
}

export function mapElementorToBlocks(frNodes, enNodes, ctx = {}) {
  const fr = [...walkWidgets(frNodes)].flatMap((w) => widgetToBlocks(w, ctx))
  if (!enNodes) return convertHeadingsToText(dropTrailingHeadings(dropPlaceholderHeadings(fr)))
  const en = [...walkWidgets(enNodes)].flatMap((w) => widgetToBlocks(w, ctx))

  // The merge is positional, so it is only sound when both trees produced the
  // same block sequence. A count divergence shifts every later index, and if a
  // shifted pair coincides on type the English text lands on the wrong French
  // block: a wrong translation that looks right, which is worse than none.
  // On divergence, leave the English side empty and fall back to French.
  if (en.length !== fr.length) return convertHeadingsToText(dropTrailingHeadings(dropPlaceholderHeadings(fr)))

  const merged = fr.map((block, i) => {
    const other = en[i]
    if (!other || other.type !== block.type) return block
    if (block.type === 'text' || block.type === 'heading') {
      return { ...block, value: { ...block.value, en: other.value.fr } }
    }
    if (block.type === 'specs') {
      return {
        ...block,
        items: block.items.map((item, j) => ({
          term: { ...item.term, en: other.items[j]?.term.fr || '' },
          value: { ...item.value, en: other.items[j]?.value.fr || '' },
        })),
      }
    }
    return block
  })
  return convertHeadingsToText(dropTrailingHeadings(dropPlaceholderHeadings(merged)))
}
