/**
 * Task 28: what counts as ONE unsaved change in the article editor, so the
 * count shown beside "Enregistrer" is a rule anyone can read, not a guess.
 *
 * Scalar fields, each counting for at most 1 regardless of how many of its
 * own sub-fields changed:
 *   - title, subtitle, slug: localized {fr, en} objects -- editing either
 *     language still counts as one changed field, not two.
 *   - year: yearLabel (the displayed, localized year) and the numeric
 *     yearStart/yearEnd sort fields are grouped under this single concept
 *     -- any of the three differing contributes at most 1, not up to 3.
 *   - status, cover: plain scalars. `cover` is normalized to its id first,
 *     since the same article can hold it as a populated object (right
 *     after a GET) or a bare id (right after a block-editor pick), and
 *     those two representations of "the same cover" must not read as a
 *     change.
 *
 * Blocks are compared by position against the last-saved list, not by any
 * per-block identity (blocks carry none): a block whose JSON differs at the
 * same index counts as one "modified" block; any extra index past the
 * shorter list's length counts as one "added" (current is longer) or one
 * "removed" (saved is longer). This is a positional diff, not a
 * content-aware one -- reordering blocks with no other edit reads as N
 * changes, not zero. Documented here rather than hidden, so the count is
 * always explainable from this file alone.
 *
 * NOT counted: `category`. The client's own field list for this count was
 * title/subtitle/slug/year/status/cover; category was not named, so this
 * follows that list literally rather than guessing it was an omission.
 */

const normalizeCover = (cover) => cover?._id || cover || null
const normalizeYearNum = (n) => (n === '' || n == null ? '' : String(n))

const SCALAR_FIELDS = [
  { group: 'title', get: (a) => a.title },
  { group: 'subtitle', get: (a) => a.subtitle },
  { group: 'slug', get: (a) => a.slug },
  {
    group: 'year',
    get: (a) => ({ yearLabel: a.yearLabel, yearStart: normalizeYearNum(a.yearStart), yearEnd: normalizeYearNum(a.yearEnd) }),
  },
  { group: 'status', get: (a) => a.status },
  { group: 'cover', get: (a) => normalizeCover(a.cover) },
]

function countScalarChanges(current, saved) {
  return SCALAR_FIELDS.reduce((count, field) => {
    const a = JSON.stringify(field.get(current) ?? null)
    const b = JSON.stringify(field.get(saved) ?? null)
    return count + (a !== b ? 1 : 0)
  }, 0)
}

function countBlockChanges(current = [], saved = []) {
  const len = Math.max(current.length, saved.length)
  let count = 0
  for (let i = 0; i < len; i++) {
    if (i >= saved.length || i >= current.length) {
      count++ // added (current longer) or removed (saved longer)
      continue
    }
    if (JSON.stringify(current[i]) !== JSON.stringify(saved[i])) count++
  }
  return count
}

/** Total unsaved-change count for the article editor: see the rule above. */
export function countUnsavedChanges(current, saved) {
  if (!current || !saved) return 0
  return countScalarChanges(current, saved) + countBlockChanges(current.blocks, saved.blocks)
}
