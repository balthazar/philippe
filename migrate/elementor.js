import sanitizeHtml from 'sanitize-html'

// Duplicated from api/src/lib/sanitize.js on purpose: migrate/ is a separate
// package from api/. Keep these two whitelists identical.
const OPTIONS = {
  allowedTags: ['p', 'br', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote'],
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

const stripTags = (s) => sanitizeHtml(s, { allowedTags: [], allowedAttributes: {} }).trim()

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

export function mapElementorToBlocks(frNodes, enNodes, ctx = {}) {
  const fr = [...walkWidgets(frNodes)].flatMap((w) => widgetToBlocks(w, ctx))
  if (!enNodes) return fr
  const en = [...walkWidgets(enNodes)].flatMap((w) => widgetToBlocks(w, ctx))

  // The merge is positional, so it is only sound when both trees produced the
  // same block sequence. A count divergence shifts every later index, and if a
  // shifted pair coincides on type the English text lands on the wrong French
  // block: a wrong translation that looks right, which is worse than none.
  // On divergence, leave the English side empty and fall back to French.
  if (en.length !== fr.length) return fr

  return fr.map((block, i) => {
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
}
