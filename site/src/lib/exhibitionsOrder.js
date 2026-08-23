/**
 * Sorts exhibition articles by year, most recent first.
 *
 * Task 28: the exhibitions timeline is the existing list of 25 exhibition
 * articles, not a new model -- every one is already titled by its year
 * (1989 to 2024), so the year IS the article's title. `yearStart`/
 * `yearLabel` are not populated for this category (verified against the
 * real archive), so title is the only reliable sort key here, and the
 * API's own list order (`position` first) is a curated display order that
 * does not track chronology -- not safe to reuse for a year timeline.
 */
export function sortExhibitionsByYear(items = []) {
  return [...items].sort((a, b) => Number(b.title) - Number(a.title))
}
