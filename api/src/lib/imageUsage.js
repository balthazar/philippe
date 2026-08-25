/**
 * Where each image is used, and therefore the largest the site can ever
 * display it.
 *
 * The media library needs this to say anything useful about resolution. "Is
 * 1200px enough?" has no answer on its own: it is ample for a bibliography
 * cover set at 30vw and visibly soft for a photograph a reader can open
 * fullscreen and zoom into. So the question is always "enough for what", and
 * what depends on where the image is referenced.
 *
 * Two roles, because the site has two ceilings:
 *
 *   - `fullscreen`: an article's cover (the homepage slideshow shows it at
 *     the `large` variant), any gallery item (the lightbox does the same, and
 *     zooms 2.5x into it), and any standalone image block (served at 100vw).
 *     These want every pixel the pipeline is willing to make.
 *
 *   - `reference`: a bibliography or links entry, and nothing else. The grid
 *     sets those at 30vw on a wide screen, so the `medium` variant covers a
 *     retina display comfortably and `large` is never the sensible source.
 *
 *   - `unused`: referenced by nothing. Not a fault -- an image can be waiting
 *     to be placed -- but worth being able to list.
 *
 * An image used in more than one place takes the most demanding role it has:
 * being a reference cover somewhere does not excuse being soft in a lightbox
 * elsewhere.
 */
export const ROLES = { FULLSCREEN: 'fullscreen', REFERENCE: 'reference', UNUSED: 'unused' }

/**
 * Built from the blocks of every article and page in one pass, rather than
 * asking per image. The archive holds ~500 images against ~80 documents, so
 * the alternative is 1000 queries to answer what two already have in hand.
 */
export function buildUsageMap({ articles = [], pages = [] } = {}) {
  const usage = new Map()

  const record = (imageId, role) => {
    if (!imageId) return
    const id = String(imageId)
    // Most demanding role wins; `fullscreen` is never downgraded.
    if (usage.get(id) === ROLES.FULLSCREEN) return
    usage.set(id, role)
  }

  const walkBlocks = (blocks = []) => {
    for (const block of blocks) {
      // A standalone image block renders at 100vw, so it can pull `large`.
      if (block.type === 'image') record(block.image, ROLES.FULLSCREEN)
      for (const item of block.items || []) {
        record(item.image, block.type === 'references' ? ROLES.REFERENCE : ROLES.FULLSCREEN)
      }
    }
  }

  for (const article of articles) {
    // The cover is what the homepage slideshow shows, at `large`.
    record(article.cover, ROLES.FULLSCREEN)
    walkBlocks(article.blocks)
  }
  for (const page of pages) walkBlocks(page.blocks)

  return usage
}

export const roleOf = (usage, imageId) => usage.get(String(imageId)) || ROLES.UNUSED
