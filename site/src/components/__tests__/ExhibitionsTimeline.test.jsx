import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import { ExhibitionsTimeline } from '../ExhibitionsTimeline.jsx'

// Task 33, section 3: post-split, `items` is the list of EXHIBITIONS (each
// with its own name as `title` and the year as `yearStart`), not one per
// year -- the timeline still shows one dot per YEAR, grouped internally
// (see ExhibitionsTimeline.jsx). Mirrors the real archive's shape closely
// enough to exercise the "every fifth dot" persistent-label rule (task 31,
// part 1): 11 distinct years, so index 0, 5, 10 land on real dots and the
// rule can be checked without needing all 25.
const items = [
  { _id: '11', slug: 'expo-2024', title: 'Expo 2024', yearStart: 2024 }, // index 0 -- newest, persistent
  { _id: '10', slug: 'expo-2023', title: 'Expo 2023', yearStart: 2023 }, // index 1
  { _id: '9', slug: 'expo-2022', title: 'Expo 2022', yearStart: 2022 }, // index 2
  { _id: '8', slug: 'expo-2021', title: 'Expo 2021', yearStart: 2021 }, // index 3
  { _id: '7', slug: 'expo-2020', title: 'Expo 2020', yearStart: 2020 }, // index 4
  { _id: '6', slug: 'expo-2019', title: 'Expo 2019', yearStart: 2019 }, // index 5 -- every-fifth, persistent
  { _id: '5', slug: 'expo-2018', title: 'Expo 2018', yearStart: 2018 }, // index 6
  { _id: '4', slug: 'expo-2017', title: 'Expo 2017', yearStart: 2017 }, // index 7 -- current in some tests
  { _id: '3', slug: 'expo-2016', title: 'Expo 2016', yearStart: 2016 }, // index 8
  { _id: '2', slug: 'expo-2015', title: 'Expo 2015', yearStart: 2015 }, // index 9
  { _id: '1', slug: 'expo-1989', title: 'Expo 1989', yearStart: 1989 }, // index 10 -- oldest, persistent
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
  it('renders one link per year, at the root-level URL of that year\'s own (first) exhibition', () => {
    renderTimeline({ currentYear: 2023 })
    expect(screen.getByRole('link', { name: '2024' })).toHaveAttribute('href', '/expo-2024')
    expect(screen.getByRole('link', { name: '2023' })).toHaveAttribute('href', '/expo-2023')
    expect(screen.getByRole('link', { name: '1989' })).toHaveAttribute('href', '/expo-1989')
  })

  it('builds English hrefs under /en when rendered on an English route', () => {
    renderTimeline({ currentYear: 2023 }, '/en')
    expect(screen.getByRole('link', { name: '2024' })).toHaveAttribute('href', '/en/expo-2024')
  })

  it('marks only the current year with aria-current="true"', () => {
    renderTimeline({ currentYear: 2023 })
    expect(screen.getByRole('link', { name: '2023' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: '2024' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '1989' })).not.toHaveAttribute('aria-current')
  })

  it('marks no year current when the current year matches none of them', () => {
    renderTimeline({ currentYear: 1500 })
    for (const item of items) {
      expect(screen.getByRole('link', { name: String(item.yearStart) })).not.toHaveAttribute('aria-current')
    }
  })

  // Task 33, section 3: multiple exhibitions in one year must not produce
  // duplicate year dots. 2013 holds five in the real archive.
  it('collapses multiple exhibitions in the same year into a single dot', () => {
    const multi = [
      { _id: 'a', slug: 'premier-lieu', title: 'Premier lieu', yearStart: 2013 },
      { _id: 'b', slug: 'second-lieu', title: 'Second lieu', yearStart: 2013 },
      { _id: 'c', slug: 'expo-2012', title: 'Expo 2012', yearStart: 2012 },
    ]
    render(
      <MemoryRouter>
        <LangProvider><ExhibitionsTimeline items={multi} currentYear={2013} /></LangProvider>
      </MemoryRouter>
    )
    expect(screen.getAllByRole('link', { name: '2013' })).toHaveLength(1)
    // Links to the FIRST exhibition of that year, in source order.
    expect(screen.getByRole('link', { name: '2013' })).toHaveAttribute('href', '/premier-lieu')
    expect(screen.getByRole('link', { name: '2013' })).toHaveAttribute('aria-current', 'true')
  })

  // Task 31, part 2: a dot carries no text -- every link's accessible name
  // must still be its year, or the whole rail is 11 (25, on the real
  // archive) unlabelled links to a screen reader. getByRole('link', {name})
  // below already depends on this for every other test in this file; this
  // test makes the requirement explicit and checks every item, not just the
  // ones other tests happen to touch.
  it("gives every link its year as its accessible name, even ones with no persistent label", () => {
    renderTimeline({ currentYear: 2017 })
    for (const item of items) {
      expect(screen.getByRole('link', { name: String(item.yearStart) })).toBeInTheDocument()
    }
  })

  it('lets keyboard focus reach every year, in order, via Tab', async () => {
    const user = userEvent.setup()
    renderTimeline({ currentYear: 2023 })
    await user.tab()
    expect(screen.getByRole('link', { name: '2024' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: '2023' })).toHaveFocus()
  })

  // Task 31, part 1 (client decision, ruled on in the brief -- not
  // re-litigated here): persistent labels are every fifth dot (index 0, 5,
  // 10, ... zero-based in the sorted-newest-first list), plus the current
  // year, plus the newest and oldest. Cosmetics (dot size, transform) are
  // deliberately not asserted -- only which items the rule selects, via the
  // 'is-persistent' marker the component renders for them.
  it('keeps a persistent label on every fifth dot plus the newest and oldest', () => {
    const { container } = renderTimeline({ currentYear: 1500 })
    const persistentYears = [...container.querySelectorAll('.is-persistent')]
      .map((li) => li.querySelector('a').textContent.trim())
    expect(persistentYears).toEqual(['2024', '2019', '1989'])
  })

  it('adds the current year to the persistent set even when it falls off the every-fifth pattern', () => {
    const { container } = renderTimeline({ currentYear: 2017 }) // index 7, not on the every-fifth pattern
    const persistentYears = [...container.querySelectorAll('.is-persistent')]
      .map((li) => li.querySelector('a').textContent.trim())
    expect(persistentYears).toEqual(['2024', '2019', '2017', '1989'])
  })

  it('does not mark a non-current, non-every-fifth, non-edge item as persistent', () => {
    const { container } = renderTimeline({ currentYear: 1500 })
    const link2021 = screen.getByRole('link', { name: '2021' })
    expect(link2021.closest('li')).not.toHaveClass('is-persistent')
  })
})
