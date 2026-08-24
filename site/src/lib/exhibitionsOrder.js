/**
 * Sorts exhibition articles by year, most recent first.
 *
 * Task 28: originally the year WAS the article's title (1989 to 2024, one
 * article per year), so title was the only reliable sort key.
 *
 * Task 33, section 3: each year is now split into one article per
 * exhibition (migrate/extract.js's splitExhibitionYear), so title is the
 * exhibition's own name -- yearStart is what carries the year now (set from
 * the parent year at extraction time, the same for every exhibition split
 * out of it). A stable sort (`Array.prototype.sort` has been stable since
 * ES2019) is what keeps same-year entries in the order they already appear
 * in the source, the only ordering multiple exhibitions in one year have.
 */
export function sortExhibitionsByYear(items = []) {
  return [...items].sort((a, b) => Number(b.yearStart) - Number(a.yearStart))
}

/**
 * Task 35, Part B: the rail shows one dot per EXHIBITION now (all 39), not
 * one per year -- a year-collapsed rail linked only to that year's FIRST
 * exhibition, leaving the other 14 of the real archive's 39 exhibitions
 * (nine years hold more than one; 2013 holds five) unreachable from it. The
 * YEAR LABEL is still shown once per year, though, not once per dot -- "one
 * year label with its dots grouped beneath, not the year repeated once per
 * dot" (task brief) -- so grouping by year is still the right shape, it
 * just needs to keep every item in the group instead of only the first.
 *
 * Collapses an already-sorted (sortExhibitionsByYear) list into one entry
 * per distinct year, each carrying ALL of that year's exhibitions in their
 * original relative order (stable sort keeps same-year items adjacent in
 * the order the source page itself used -- the only ordering that data
 * has). ExhibitionsTimeline.jsx renders one label per group and one dot
 * (its own link, its own accessible name) per item inside it.
 */
export function groupExhibitionsByYear(items = []) {
  const groups = []
  let current = null
  for (const item of items) {
    const year = item.yearStart
    if (!current || current.year !== year) {
      current = { year, items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
}

/**
 * Task 38, part 5 (client feedback: "why is 2003 or 1993 not shown in the
 * timeline? isnt it every 5 years or so?"). It was not. The rule this
 * replaces counted every fifth DOT -- every fifth exhibition -- which reads
 * as "every five years" only if the archive is evenly paced, and this one is
 * not remotely: 2013 alone holds five exhibitions, while 1993 to 1989 holds
 * four years and three exhibitions between them. Counting dots therefore
 * spent its labels on the dense recent cluster and raced through the sparse
 * early decades without stopping. On the real archive it produced 2024,
 * 2020, 2018, 2014, 2013, 2010, 2008, 1998, 1989 -- four labels inside seven
 * years, then a twenty-year silence broken once.
 *
 * The client reads the rail as a CALENDAR, so the spacing is measured in
 * years: walking newest to oldest, a year keeps its label when at least
 * `gap` years have passed since the last label was placed. On the real
 * archive that gives 2024, 2019, 2014, 2009, 2003, 1998, 1993, 1989 -- even
 * across the whole span, and 2003 and 1993 restored.
 *
 * The newest and oldest years are always labelled, so the rail's span is
 * readable with no interaction, exactly as before. The oldest is forced even
 * when it falls short of `gap` (1989 is four years after 1993): an unlabelled
 * bottom end would leave the rail looking like it stops at whatever year was
 * last labelled.
 *
 * The CURRENT year is not this function's business -- the component adds it,
 * since it is a property of the page being viewed, not of the archive.
 *
 * `groups` must already be sorted newest-first (groupExhibitionsByYear's own
 * output, which preserves sortExhibitionsByYear's ordering).
 */
export function persistentLabelYears(groups = [], gap = 5) {
  const years = groups.map((g) => g.year)
  const kept = new Set()
  let last = null
  years.forEach((year, i) => {
    const isEdge = i === 0 || i === years.length - 1
    if (isEdge || last === null || last - year >= gap) {
      kept.add(year)
      last = year
    }
  })
  return kept
}

// Task 36, section 3: the archive's real shape (39 exhibitions, 1989..2024)
// makes pure proportional-by-year placement unusable on its own -- 35 years
// over roughly 700px of usable height is about 20px per year, and 2013
// alone holds five exhibitions. Splitting one year's ~20px slot five ways
// puts those five dots about 4px apart: too tight to read as distinct
// dots, let alone hit individually.
//
// This function places every exhibition in two passes:
//
//   1. A base, proportional-by-year position (newest year at 0, oldest at
//      `height`), with same-year exhibitions subdivided evenly across their
//      own year's slot in their existing (already-sorted, stable) relative
//      order -- so a dense year does not start out fully collapsed onto one
//      point before spacing is even considered.
//   2. A minimum-gap enforcement pass over the flat, already-sorted
//      sequence (sortExhibitionsByYear's contract: newest first), which is
//      what actually keeps a cluster reachable: a forward sweep pushes any
//      point closer than `minGap` to its predecessor down by exactly
//      `minGap`, expanding a dense cluster locally into whatever room the
//      less busy years around it aren't using; if that pushes the last
//      point past the available height, a backward sweep pulls the whole
//      sequence back to fit, still honouring `minGap` between neighbours.
//      This is the standard two-pass "declutter" sweep used for avoiding
//      overlap along one axis (labels, timeline markers, ticks): cheap,
//      stable, and it never reorders anything -- the input's own
//      newest-first order is preserved throughout.
//
// Returns one number per item (a top offset in the same units as `height`,
// 0 at the top), in the same order as `items`. Never asserted against exact
// pixel values in tests (per the task brief) -- only the invariants this
// algorithm actually guarantees: newest-first ordering, minGap between
// every consecutive pair, and the whole sequence landing within `height`
// whenever that many points can fit at all.
export function layoutExhibitionsTimeline(items = [], { height = 0, minGap = 0 } = {}) {
  const n = items.length
  if (n === 0) return []
  if (n === 1) return [0]

  const years = items.map((item) => item.yearStart)
  const maxYear = Math.max(...years)
  const minYear = Math.min(...years)
  const span = maxYear - minYear
  const yearSlot = span > 0 ? height / span : 0

  const groupSizes = new Map()
  for (const year of years) groupSizes.set(year, (groupSizes.get(year) || 0) + 1)
  const seenInGroup = new Map()

  const base = items.map((item) => {
    const year = item.yearStart
    const indexInGroup = seenInGroup.get(year) || 0
    seenInGroup.set(year, indexInGroup + 1)
    const groupSize = groupSizes.get(year)
    const yearTop = span > 0 ? ((maxYear - year) / span) * height : 0
    return yearTop + indexInGroup * (yearSlot / groupSize)
  })

  return enforceMinGap(base, minGap, height)
}

function enforceMinGap(positions, minGap, height) {
  const n = positions.length
  const result = positions.slice()

  for (let i = 1; i < n; i++) {
    if (result[i] - result[i - 1] < minGap) result[i] = result[i - 1] + minGap
  }

  if (height > 0 && result[n - 1] > height) {
    result[n - 1] = height
    for (let i = n - 2; i >= 0; i--) {
      if (result[i + 1] - result[i] < minGap) result[i] = result[i + 1] - minGap
    }
  }

  return result
}
