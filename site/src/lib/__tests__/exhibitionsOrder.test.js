import { describe, it, expect } from 'vitest'
import { sortExhibitionsByYear, groupExhibitionsByYear } from '../exhibitionsOrder.js'

// Task 33, section 3: before the split, an exhibitions article's title WAS
// its year (1989..2024) -- title was the only reliable sort key. After the
// split, title is the exhibition's own name, and every exhibitions article
// carries a real yearStart (set from the parent year at extraction time --
// see migrate/extract.js's splitExhibitionYear), which is what chronology
// now sorts on instead.
describe('sortExhibitionsByYear', () => {
  it('sorts by yearStart, most recent year first', () => {
    const items = [{ title: 'A', yearStart: 1993 }, { title: 'B', yearStart: 2024 }, { title: 'C', yearStart: 2001 }]
    expect(sortExhibitionsByYear(items).map((i) => i.yearStart)).toEqual([2024, 2001, 1993])
  })

  it('ignores the input list order entirely (position is not chronology)', () => {
    // Real archive data: position 0..24 is a curated display order that does
    // NOT track year (e.g. 2014 sits between 2022 and 2021 by position).
    // The timeline must sort by year regardless of the order items arrive in.
    const items = [{ title: 'A', yearStart: 2022 }, { title: 'B', yearStart: 2014 }, { title: 'C', yearStart: 2021 }]
    expect(sortExhibitionsByYear(items).map((i) => i.yearStart)).toEqual([2022, 2021, 2014])
  })

  // Multiple exhibitions can share a year (nine years do; 2013 holds five).
  // A stable sort keeps their original relative order -- the only ordering
  // the source data has, and the one the client curated when writing the
  // page -- rather than shuffling same-year entries arbitrarily.
  it('keeps same-year entries in their original relative order (stable sort)', () => {
    const items = [
      { title: 'Second lieu', yearStart: 2013 },
      { title: 'Premier lieu', yearStart: 2013 },
    ]
    expect(sortExhibitionsByYear(items).map((i) => i.title)).toEqual(['Second lieu', 'Premier lieu'])
  })

  it('does not mutate the input array', () => {
    const items = [{ title: 'A', yearStart: 1989 }, { title: 'B', yearStart: 2024 }]
    const copy = [...items]
    sortExhibitionsByYear(items)
    expect(items).toEqual(copy)
  })

  it('defaults to an empty array when given none', () => {
    expect(sortExhibitionsByYear()).toEqual([])
  })
})

// Task 33, section 3: the timeline still shows years, one dot per year, even
// though there can now be several exhibitions articles per year. Grouping
// keeps the FIRST item (by the already-sorted, stable order above) as the
// group's own link target -- "first" here means the first exhibition of
// that year in the original page's own order, the only ordering the source
// data has.
describe('groupExhibitionsByYear', () => {
  it('collapses multiple same-year items into one group', () => {
    const items = sortExhibitionsByYear([
      { slug: 'premier-lieu', title: 'Premier lieu', yearStart: 2013 },
      { slug: 'second-lieu', title: 'Second lieu', yearStart: 2013 },
      { slug: 'expo-2012', title: 'Expo 2012', yearStart: 2012 },
    ])
    const groups = groupExhibitionsByYear(items)
    expect(groups).toEqual([
      { year: 2013, slug: 'premier-lieu' },
      { year: 2012, slug: 'expo-2012' },
    ])
  })

  it('produces one group per item when every year is distinct', () => {
    const items = sortExhibitionsByYear([
      { slug: 'a', title: 'A', yearStart: 2024 },
      { slug: 'b', title: 'B', yearStart: 2023 },
    ])
    expect(groupExhibitionsByYear(items)).toEqual([
      { year: 2024, slug: 'a' },
      { year: 2023, slug: 'b' },
    ])
  })

  it('defaults to an empty array when given none', () => {
    expect(groupExhibitionsByYear()).toEqual([])
  })
})
