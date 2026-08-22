import { describe, it, expect } from 'vitest'
import { groupByDecade } from '../groupByDecade.js'

describe('groupByDecade', () => {
  it('groups by decade, newest first, items newest first inside', () => {
    const groups = groupByDecade([
      { slug: 'a', yearStart: 1988 },
      { slug: 'b', yearStart: 2021 },
      { slug: 'c', yearStart: 2023 },
      { slug: 'd', yearStart: 1995 },
    ])
    expect(groups.map((g) => g.decade)).toEqual([2020, 1990, 1980])
    expect(groups[0].items.map((i) => i.slug)).toEqual(['c', 'b'])
  })

  it('puts undated articles in a trailing group with a null decade', () => {
    const groups = groupByDecade([{ slug: 'x', yearStart: null }, { slug: 'y', yearStart: 2020 }])
    expect(groups.at(-1).decade).toBeNull()
    expect(groups.at(-1).items.map((i) => i.slug)).toEqual(['x'])
  })

  it('returns an empty array for no articles', () => {
    expect(groupByDecade([])).toEqual([])
  })
})
