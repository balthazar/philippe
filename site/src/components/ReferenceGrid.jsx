const src = (v) => (v?.path ? `/media/${v.path}` : '')

/**
 * Task 39. One entry in a `references` block: a bibliography citation or a
 * link, with an optional visual.
 *
 * Three shapes fall out of the two optional fields, and all three have to
 * read as members of one list rather than as three different designs:
 *
 *   - image + url  -- the full card. A monograph with its cover, an
 *     exhibition write-up with the installation view from that very show.
 *   - url, no image -- a link with nothing to show for it (an interview in a
 *     journal that puts no images online). Renders as a card whose visual
 *     slot is simply absent, not as a placeholder box: an empty frame reads
 *     as a broken image, while a citation on its own reads as a citation.
 *   - neither -- a catalogue with no web presence anywhere, e.g. Villa(s) 6
 *     (Villa Medici, 1995). Still a real entry; it just isn't a link.
 *
 * The citation is server-sanitized HTML (see api/src/lib/sanitize.js, and
 * cleanBlocks in routes/admin.js, which reaches into these items) because a
 * book title has to keep its italics -- the whole list is set in the
 * typographic conventions of a bibliography, where `<em>` carries meaning
 * rather than emphasis.
 *
 * The link wraps the whole entry rather than sitting inside it as a "read
 * more": the image and the citation are one target, which is both a larger
 * hit area and one tab stop instead of two for the same destination.
 */
function Reference({ item }) {
  const image = item.image
  const medium = image?.variants?.medium
  const body = (
    <>
      {medium && (
        <span className="reference-visual">
          <img
            src={src(medium)}
            srcSet={[medium, image.variants.large].filter(Boolean).map((v) => `${src(v)} ${v.width}w`).join(', ')}
            sizes="(min-width: 900px) 30vw, 45vw"
            width={medium.width}
            height={medium.height}
            alt={image.alt || ''}
            loading="lazy"
          />
        </span>
      )}
      {/* Sanitized on write; see the note above. */}
      <span className="reference-citation" dangerouslySetInnerHTML={{ __html: item.value }} />
    </>
  )

  if (!item.url) return <li className="reference">{body}</li>

  // Every url here is off-site (safeUrl only admits absolute http/https/
  // mailto), so they all get the same treatment rather than this guessing
  // per-item. rel="noreferrer" implies noopener in every browser that
  // matters, but both are set: noopener is the one that actually closes the
  // reverse-tabnabbing hole, and it should not depend on the other's support.
  return (
    <li className="reference is-link">
      <a href={item.url} target="_blank" rel="noopener noreferrer">{body}</a>
    </li>
  )
}

/**
 * A `references` block: the grid itself.
 *
 * Entries WITH a visual and entries without are laid out in the same grid,
 * not split into two -- the order of a bibliography is its meaning
 * (chronological, here), and sorting by "has a picture" would destroy it.
 * CSS handles the ragged result; see .block-references in base.css.
 */
export function ReferenceGrid({ items = [] }) {
  if (!items.length) return null
  return (
    <ul className="block-references">
      {items.map((item, i) => (
        <Reference key={i} item={item} />
      ))}
    </ul>
  )
}
