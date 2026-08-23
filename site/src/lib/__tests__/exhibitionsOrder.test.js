import { describe, it, expect } from 'vitest'
import { sortExhibitionsByYear } from '../exhibitionsOrder.js'

describe('sortExhibitionsByYear', () => {
  it('sorts by numeric title, most recent year first', () => {
    const items = [{ title: '1993' }, { title: '2024' }, { title: '2001' }]
    expect(sortExhibitionsByYear(items).map((i) => i.title)).toEqual(['2024', '2001', '1993'])
  })

  it('ignores the input list order entirely (position is not chronology)', () => {
    // Real archive data: position 0..24 is a curated display order that does
    // NOT track year (e.g. 2014 sits between 2022 and 2021 by position).
    // The timeline must sort by year regardless of the order items arrive in.
    const items = [{ title: '2022' }, { title: '2014' }, { title: '2021' }]
    expect(sortExhibitionsByYear(items).map((i) => i.title)).toEqual(['2022', '2021', '2014'])
  })

  it('does not mutate the input array', () => {
    const items = [{ title: '1989' }, { title: '2024' }]
    const copy = [...items]
    sortExhibitionsByYear(items)
    expect(items).toEqual(copy)
  })

  it('defaults to an empty array when given none', () => {
    expect(sortExhibitionsByYear()).toEqual([])
  })
})
