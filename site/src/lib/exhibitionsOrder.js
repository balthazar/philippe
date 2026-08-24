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
 * Task 33, section 3: the timeline still shows years, one dot each, even
 * though a year can now hold several exhibitions articles (nine do; 2013
 * holds five) -- multiple exhibitions in one year must not produce
 * duplicate year dots. Collapses an already-sorted (sortExhibitionsByYear)
 * list into one entry per distinct year, keeping the FIRST item's slug as
 * that year's own link target: with a stable sort, same-year items stay
 * adjacent in their original source order, so "first" here means the first
 * exhibition of that year on the original page -- the only ordering the
 * source data has.
 */
export function groupExhibitionsByYear(items = []) {
  const groups = []
  let last = null
  for (const item of items) {
    const year = item.yearStart
    if (last && last.year === year) continue
    last = { year, slug: item.slug }
    groups.push(last)
  }
  return groups
}
