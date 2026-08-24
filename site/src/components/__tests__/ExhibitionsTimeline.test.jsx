import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import { ExhibitionsTimeline } from '../ExhibitionsTimeline.jsx'

// Task 35, Part B: the split that produced 39 real exhibitions across 25
// years (nine years hold more than one; 2013 holds five) means a
// one-dot-per-YEAR rail links only to that year's first exhibition -- the
// other exhibitions in a multi-exhibition year are unreachable from the
// rail entirely. The rail must carry one dot per EXHIBITION, all of them,
// with the YEAR label still shown once per year (not once per dot).
//
// 11 items across 10 distinct years (2019 holds two, mirroring 2013 in the
// real archive) -- enough to exercise both the every-fifth persistent-label
// rule (now read against the flat 11-dot sequence, since the previous
// design's "one dot" and "one year" were the same thing and no longer are)
// and the multi-exhibition-year disambiguation requirement.
const items = [
  { _id: '11', slug: 'expo-2024', title: 'Expo 2024', yearStart: 2024 }, // flat 0 -- newest, persistent
  { _id: '10', slug: 'expo-2023', title: 'Expo 2023', yearStart: 2023 }, // flat 1
  { _id: '9', slug: 'expo-2022', title: 'Expo 2022', yearStart: 2022 }, // flat 2
  { _id: '8', slug: 'expo-2021', title: 'Expo 2021', yearStart: 2021 }, // flat 3
  { _id: '7', slug: 'expo-2020', title: 'Expo 2020', yearStart: 2020 }, // flat 4
  { _id: '6a', slug: 'premier-lieu', title: 'Premier lieu', yearStart: 2019 }, // flat 5 -- every-fifth, persistent
  { _id: '6b', slug: 'second-lieu', title: 'Second lieu', yearStart: 2019 }, // flat 6
  { _id: '5', slug: 'expo-2018', title: 'Expo 2018', yearStart: 2018 }, // flat 7
  { _id: '4', slug: 'expo-2017', title: 'Expo 2017', yearStart: 2017 }, // flat 8 -- current in some tests
  { _id: '3', slug: 'expo-2016', title: 'Expo 2016', yearStart: 2016 }, // flat 9
  { _id: '1', slug: 'expo-1989', title: 'Expo 1989', yearStart: 1989 }, // flat 10 -- oldest, persistent
]

const renderTimeline = (props, path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LangProvider>
        <ExhibitionsTimeline items={items} {...props} />
      </LangProvider>
    </MemoryRouter>
  )

describe('ExhibitionsTimeline', () => {
  it('renders one link per exhibition, all 11, at the root-level URL of its own article', () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(11)
    expect(screen.getByRole('link', { name: /Premier lieu/ })).toHaveAttribute('href', '/premier-lieu')
    expect(screen.getByRole('link', { name: /Second lieu/ })).toHaveAttribute('href', '/second-lieu')
    expect(screen.getByRole('link', { name: '1989' })).toHaveAttribute('href', '/expo-1989')
  })

  it('builds English hrefs under /en when rendered on an English route', () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 }, '/en')
    expect(screen.getByRole('link', { name: '2024' })).toHaveAttribute('href', '/en/expo-2024')
  })

  it('marks aria-current="true" on the current EXHIBITION\'s own link, not shared across its year', () => {
    renderTimeline({ currentSlug: 'second-lieu', currentYear: 2019 })
    expect(screen.getByRole('link', { name: /Second lieu/ })).toHaveAttribute('aria-current', 'true')
    // The sibling exhibition in the SAME year is not also marked current.
    expect(screen.getByRole('link', { name: /Premier lieu/ })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '2024' })).not.toHaveAttribute('aria-current')
  })

  it('marks no link current when the current slug matches none of them', () => {
    renderTimeline({ currentSlug: 'nope', currentYear: 1500 })
    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-current')
    }
  })

  // Task 35, Part B: "39 links reading 2013 five times is useless to a
  // screen reader" -- a single-exhibition year's link is still just its
  // year, but a multi-exhibition year's links must each say enough to tell
  // them apart.
  it("names a single-exhibition year's link with just the year", () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    expect(screen.getByRole('link', { name: '2024' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '1989' })).toBeInTheDocument()
  })

  it("distinguishes a multi-exhibition year's links from each other, both still naming the year", () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const premier = screen.getByRole('link', { name: /Premier lieu/ })
    const second = screen.getByRole('link', { name: /Second lieu/ })
    expect(premier).toHaveAccessibleName(/2019/)
    expect(second).toHaveAccessibleName(/2019/)
    expect(premier).not.toBe(second)
    // Never the bare, undifferentiated year for either one.
    expect(screen.queryAllByRole('link', { name: '2019' })).toHaveLength(0)
  })

  // The visible YEAR LABEL is shown once per year, not once per dot, even
  // for a multi-exhibition year -- "not the year repeated once per dot"
  // (task brief). It is deliberately not part of any single link's own
  // accessible name computation (aria-hidden), since each link already
  // carries its own, more specific name above.
  it('renders the year label text only once for a multi-exhibition year', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const labels = [...container.querySelectorAll('.exhibitions-timeline-label')].map((n) => n.textContent.trim())
    expect(labels.filter((t) => t === '2019')).toHaveLength(1)
  })

  it('lets keyboard focus reach every exhibition, in order, via Tab', async () => {
    const user = userEvent.setup()
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    await user.tab()
    expect(screen.getByRole('link', { name: '2024' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: '2023' })).toHaveFocus()
  })

  // Task 31, part 1 (client decision, not re-litigated): persistent labels
  // land on every fifth dot, the current year, and the newest/oldest.
  // Task 35, Part B re-checks this against the new dot count: "every fifth"
  // now counts across the flat 11-dot (39, on the real archive) sequence,
  // not the ~10 (25) year groups -- a group is persistent if ANY of its
  // dots lands on the rule, so a multi-exhibition year absorbs an
  // every-fifth hit without showing its label twice.
  it('keeps a persistent label on the group containing every fifth dot, plus the newest and oldest', () => {
    const { container } = renderTimeline({ currentSlug: 'nope', currentYear: 1500 })
    const persistentYears = [...container.querySelectorAll('.is-persistent')]
      .map((li) => li.querySelector('.exhibitions-timeline-label').textContent.trim())
    // flat index 5 (the every-fifth hit) is "Premier lieu", inside the 2019
    // group -- its group is persistent, shown once, not twice.
    expect(persistentYears).toEqual(['2024', '2019', '1989'])
  })

  it('adds the current year to the persistent set even when it falls off the every-fifth pattern', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2017', currentYear: 2017 }) // flat 8
    const persistentYears = [...container.querySelectorAll('.is-persistent')]
      .map((li) => li.querySelector('.exhibitions-timeline-label').textContent.trim())
    expect(persistentYears).toEqual(['2024', '2019', '2017', '1989'])
  })

  // Discriminates "every fifth FLAT dot" from "every fifth GROUP" -- with a
  // multi-exhibition year positioned so the two rules would pick different
  // groups. Group order (desc.): 2024, 2023, 2022, 2021, 2020(x2), 2019,
  // 2018, 2017, 2016, 1989 -- flat index 5 lands inside the 2020 group
  // (group index 4), while GROUP index 5 would be 2019. Only a genuinely
  // flat-index-based rule marks 2020 persistent here.
  it('counts every fifth against the flat exhibition sequence, not the year-group count', () => {
    const withEarlierMultiYear = [
      { slug: 'y2024', title: 'Y2024', yearStart: 2024 },
      { slug: 'y2023', title: 'Y2023', yearStart: 2023 },
      { slug: 'y2022', title: 'Y2022', yearStart: 2022 },
      { slug: 'y2021', title: 'Y2021', yearStart: 2021 },
      { slug: 'y2020a', title: '2020 A', yearStart: 2020 },
      { slug: 'y2020b', title: '2020 B', yearStart: 2020 },
      { slug: 'y2019', title: 'Y2019', yearStart: 2019 },
      { slug: 'y2018', title: 'Y2018', yearStart: 2018 },
      { slug: 'y2017', title: 'Y2017', yearStart: 2017 },
      { slug: 'y2016', title: 'Y2016', yearStart: 2016 },
      { slug: 'y1989', title: 'Y1989', yearStart: 1989 },
    ]
    const { container } = render(
      <MemoryRouter>
        <LangProvider>
          <ExhibitionsTimeline items={withEarlierMultiYear} currentSlug="nope" currentYear={1500} />
        </LangProvider>
      </MemoryRouter>
    )
    const persistentYears = [...container.querySelectorAll('.is-persistent')]
      .map((li) => li.querySelector('.exhibitions-timeline-label').textContent.trim())
    expect(persistentYears).toEqual(['2024', '2020', '1989'])
  })

  it('does not mark a non-current, non-every-fifth, non-edge year as persistent', () => {
    const { container } = renderTimeline({ currentSlug: 'nope', currentYear: 1500 })
    const link2021 = screen.getByRole('link', { name: '2021' })
    expect(link2021.closest('li.is-persistent')).toBeNull()
  })

  // Hover/focus on ANY dot in a group reveals that group's shared label --
  // exercised structurally (the label lives in the same <li> the dots
  // share, revealed via :hover/:focus-within in base.css, not per-link).
  it('keeps every exhibition link inside the same group <li> as its year label', () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    // The dot's own <li> (inside the inner, per-exhibition <ol>) is one
    // level down from the shared group <li> (which also holds the label).
    const dotItem = screen.getByRole('link', { name: /Second lieu/ }).closest('li')
    const groupItem = dotItem.parentElement.closest('li')
    expect(within(groupItem).getByRole('link', { name: /Premier lieu/ })).toBeInTheDocument()
    expect(within(groupItem).getByText('2019')).toBeInTheDocument()
  })
})
