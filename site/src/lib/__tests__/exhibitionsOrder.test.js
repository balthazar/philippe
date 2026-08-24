import { describe, it, expect } from 'vitest'
import {
  sortExhibitionsByYear,
  groupExhibitionsByYear,
  layoutExhibitionsTimeline,
  persistentLabelYears,
} from '../exhibitionsOrder.js'

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

// Task 35, Part B: the rail moved from one dot per YEAR (collapsing same-year
// exhibitions down to a single link, to that year's first exhibition only --
// the other 14 of the 39 real exhibitions were unreachable from the rail)
// to one dot per EXHIBITION, all 39, each linking to its own article. The
// YEAR label is still shown once per year, not once per dot -- so grouping
// is still year-based, but a group now keeps every item in that year (in
// their already-sorted, stable, original-page order), not just the first.
describe('groupExhibitionsByYear', () => {
  it('groups multiple same-year items together, keeping every one of them', () => {
    const items = sortExhibitionsByYear([
      { slug: 'premier-lieu', title: 'Premier lieu', yearStart: 2013 },
      { slug: 'second-lieu', title: 'Second lieu', yearStart: 2013 },
      { slug: 'expo-2012', title: 'Expo 2012', yearStart: 2012 },
    ])
    const groups = groupExhibitionsByYear(items)
    expect(groups).toEqual([
      { year: 2013, items: [
        { slug: 'premier-lieu', title: 'Premier lieu', yearStart: 2013 },
        { slug: 'second-lieu', title: 'Second lieu', yearStart: 2013 },
      ] },
      { year: 2012, items: [{ slug: 'expo-2012', title: 'Expo 2012', yearStart: 2012 }] },
    ])
  })

  it('produces one group per item when every year is distinct', () => {
    const items = sortExhibitionsByYear([
      { slug: 'a', title: 'A', yearStart: 2024 },
      { slug: 'b', title: 'B', yearStart: 2023 },
    ])
    expect(groupExhibitionsByYear(items)).toEqual([
      { year: 2024, items: [{ slug: 'a', title: 'A', yearStart: 2024 }] },
      { year: 2023, items: [{ slug: 'b', title: 'B', yearStart: 2023 }] },
    ])
  })

  it('keeps a group\'s items in their original relative order, not re-sorted', () => {
    const items = sortExhibitionsByYear([
      { slug: 'second-lieu', title: 'Second lieu', yearStart: 2013 },
      { slug: 'premier-lieu', title: 'Premier lieu', yearStart: 2013 },
    ])
    expect(groupExhibitionsByYear(items)[0].items.map((i) => i.slug)).toEqual(['second-lieu', 'premier-lieu'])
  })

  it('defaults to an empty array when given none', () => {
    expect(groupExhibitionsByYear()).toEqual([])
  })
})

// Task 36, section 3: 39 exhibitions across a 35-year span (1989..2024) no
// longer fit one dot per year -- placing dots purely proportionally by year
// puts same-year exhibitions only a few px apart (2013 holds five; naively
// subdividing its own ~20px-per-year slot five ways puts them ~4px apart,
// unreadable and barely clickable). layoutExhibitionsTimeline places dots
// proportionally by year and then enforces a minimum pixel gap between
// EVERY pair of consecutive dots in the flat, already-sorted sequence,
// expanding a dense cluster locally rather than leaving it unusable, while
// keeping the whole rail within the available height. Only invariants are
// asserted here (never exact pixel values, per the task brief) -- ordering,
// minimum spacing, and total extent.
describe('layoutExhibitionsTimeline', () => {
  // Real archive shape (task report): 39 exhibitions, 1989..2024, 2013 holds
  // five, 2008 and 2019 hold three, six years hold two, 11 years in the span
  // have none at all.
  const realShapeYears = [
    2024, 2023, 2022, 2021, 2020, 2020, 2019, 2019, 2019, 2018, 2018, 2017,
    2016, 2015, 2015, 2014, 2014, 2013, 2013, 2013, 2013, 2013, 2012, 2012,
    2011, 2010, 2010, 2009, 2008, 2008, 2008, 2007, 2006, 2003, 2001, 1998,
    1993, 1992, 1989,
  ]
  const realShape = realShapeYears.map((yearStart, i) => ({ slug: `e${i}`, yearStart }))

  it('defaults to an empty array when given none', () => {
    expect(layoutExhibitionsTimeline()).toEqual([])
  })

  it('places a single exhibition at the top', () => {
    expect(layoutExhibitionsTimeline([{ slug: 'a', yearStart: 2020 }], { height: 700 })).toEqual([0])
  })

  it('returns one position per item, in the same order given', () => {
    const positions = layoutExhibitionsTimeline(realShape, { height: 700, minGap: 10 })
    expect(positions).toHaveLength(realShape.length)
  })

  it('keeps positions non-decreasing in the newest-first input order (newest at the top, oldest at the bottom)', () => {
    const positions = layoutExhibitionsTimeline(realShape, { height: 700, minGap: 10 })
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1])
    }
  })

  it('respects the minimum gap between every consecutive pair, including within a dense same-year cluster', () => {
    const minGap = 10
    const positions = layoutExhibitionsTimeline(realShape, { height: 700, minGap })
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i] - positions[i - 1]).toBeGreaterThanOrEqual(minGap - 0.01)
    }
  })

  it('keeps the whole rail within the available height', () => {
    const positions = layoutExhibitionsTimeline(realShape, { height: 700, minGap: 10 })
    expect(positions[0]).toBeGreaterThanOrEqual(0)
    expect(positions[positions.length - 1]).toBeLessThanOrEqual(700)
  })

  it('does not collapse a dense same-year cluster to a single point even before spacing is enforced', () => {
    // 2013 holds five exhibitions -- naive same-year placement (no
    // within-year subdivision at all) would put all five at the exact same
    // proportional position, relying entirely on minGap to ever separate
    // them. Using a minGap of 0 isolates the base (pre-enforcement)
    // placement, which must already spread a year's own exhibitions across
    // that year's slot rather than starting them fully overlapped.
    const positions = layoutExhibitionsTimeline(realShape, { height: 700, minGap: 0 })
    const indices = realShapeYears.reduce((acc, y, i) => (y === 2013 ? [...acc, i] : acc), [])
    const cluster = indices.map((i) => positions[i])
    const unique = new Set(cluster.map((p) => Math.round(p * 100)))
    expect(unique.size).toBe(cluster.length)
  })

  it('still respects ordering and minimum spacing when the measured height is not yet known (e.g. 0)', () => {
    const positions = layoutExhibitionsTimeline(realShape, { height: 0, minGap: 10 })
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i] - positions[i - 1]).toBeGreaterThanOrEqual(10 - 0.01)
    }
  })
})

// Task 38, part 5 (client feedback: "why is 2003 or 1993 not shown in the
// timeline? isnt it every 5 years or so?"). The component test covers the
// real archive's shape end to end; these pin the degenerate inputs and the
// forced edges, which no realistic archive exercises.
describe('persistentLabelYears', () => {
  const groupsOf = (...years) => years.map((year) => ({ year, items: [] }))

  it('returns nothing for an empty archive', () => {
    expect([...persistentLabelYears([])]).toEqual([])
    expect([...persistentLabelYears()]).toEqual([])
  })

  it('labels a single year, which is both the newest and the oldest', () => {
    expect([...persistentLabelYears(groupsOf(2013))]).toEqual([2013])
  })

  it('labels both ends of a two-year archive however close together they are', () => {
    expect([...persistentLabelYears(groupsOf(2013, 2012))]).toEqual([2013, 2012])
  })

  it('forces the oldest year even when it falls short of the gap', () => {
    // 1989 is four years after 1993, inside the five-year cadence -- kept
    // anyway, so the rail never looks like it stops at 1993.
    expect([...persistentLabelYears(groupsOf(2000, 1995, 1993, 1989))]).toEqual([2000, 1995, 1989])
  })

  it('measures the gap from the last LABELLED year, not from the previous year', () => {
    // 2016 is one year after 2017 but five after the last label (2021), so
    // it is kept; a previous-year comparison would keep none of these.
    expect([...persistentLabelYears(groupsOf(2021, 2020, 2019, 2018, 2017, 2016, 2015))])
      .toEqual([2021, 2016, 2015])
  })

  it('takes the gap as a parameter, so the cadence is not baked into the walk', () => {
    expect([...persistentLabelYears(groupsOf(2024, 2022, 2020, 2018), 2)])
      .toEqual([2024, 2022, 2020, 2018])
    expect([...persistentLabelYears(groupsOf(2024, 2022, 2020, 2018), 10)])
      .toEqual([2024, 2018])
  })
})
