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
