const src = (v) => (v?.path ? `/media/${v.path}` : '')

/**
 * A `collections` block: the institutions holding the work, as a grid of
 * their marks.
 *
 * Same item shape as a `references` entry -- an image, a label, an optional
 * link -- and a deliberately different rendering. A bibliography entry is a
 * card: a book cover with a citation beside it, read one at a time. This is a
 * roll call: twenty-one marks meant to be taken in at a glance, so each cell
 * is just the mark with its name centred beneath.
 *
 * Monochrome, and that is a finding rather than a preference: of the
 * twenty-one logos in the real archive, seventeen contain no coloured pixel
 * at all. Tinting the cells would have meant inventing colours for
 * institutions that chose not to have one, and colouring only the four that
 * do would leave the eye asking why those four.
 *
 * A cell links out when the institution has a reachable site and is plain
 * text when it does not -- three of the twenty-one have no site that answers.
 * An unlinked cell must not pretend to be a target, which is the same rule
 * ReferenceGrid follows.
 */
function Collection({ item }) {
  const image = item.image
  const medium = image?.variants?.medium
  const body = (
    <>
      {medium && (
        <span className="collection-mark">
          <img
            src={src(medium)}
            srcSet={[medium, image.variants.large].filter(Boolean).map((v) => `${src(v)} ${v.width}w`).join(', ')}
            sizes="(min-width: 900px) 12vw, 30vw"
            width={medium.width}
            height={medium.height}
            alt=""
            loading="lazy"
          />
        </span>
      )}
      {/*
        Sanitized on write (cleanBlocks, api/src/routes/admin.js), same as a
        reference citation, so a name keeps its accents and any italic.

        alt="" on the image above rather than the institution's name: the name
        is right here in the markup, and giving the mark the same string would
        have a screen reader announce every institution twice.
      */}
      <span className="collection-name" dangerouslySetInnerHTML={{ __html: item.value }} />
    </>
  )

  if (!item.url) return <li className="collection">{body}</li>

  return (
    <li className="collection is-link">
      <a href={item.url} target="_blank" rel="noopener noreferrer">{body}</a>
    </li>
  )
}

export function CollectionsGrid({ items = [] }) {
  if (!items.length) return null
  return (
    <ul className="block-collections">
      {items.map((item, i) => (
        <Collection key={i} item={item} />
      ))}
    </ul>
  )
}
