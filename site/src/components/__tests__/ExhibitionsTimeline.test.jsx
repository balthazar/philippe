import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import { ExhibitionsTimeline } from '../ExhibitionsTimeline.jsx'

// Mirrors the real archive's shape closely enough to exercise the "every
// fifth dot" persistent-label rule (task 31, part 1): 11 items, so index 0,
// 5, 10 land on real dots and the rule can be checked without needing all 25.
const items = [
  { _id: '11', slug: '2024', title: '2024' }, // index 0 -- newest, persistent
  { _id: '10', slug: '2023', title: '2023' }, // index 1
  { _id: '9', slug: '2022', title: '2022' }, // index 2
  { _id: '8', slug: '2021', title: '2021' }, // index 3
  { _id: '7', slug: '2020', title: '2020' }, // index 4
  { _id: '6', slug: '2019', title: '2019' }, // index 5 -- every-fifth, persistent
  { _id: '5', slug: '2018', title: '2018' }, // index 6
  { _id: '4', slug: '2017', title: '2017' }, // index 7 -- current in some tests
  { _id: '3', slug: '2016', title: '2016' }, // index 8
  { _id: '2', slug: '2015', title: '2015' }, // index 9
  { _id: '1', slug: '1989', title: '1989' }, // index 10 -- oldest, persistent
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
  it('renders one link per item, at the root-level article URL for each slug', () => {
    renderTimeline({ currentSlug: '2023' })
    expect(screen.getByRole('link', { name: '2024' })).toHaveAttribute('href', '/2024')
    expect(screen.getByRole('link', { name: '2023' })).toHaveAttribute('href', '/2023')
    expect(screen.getByRole('link', { name: '1989' })).toHaveAttribute('href', '/1989')
  })

  it('builds English hrefs under /en when rendered on an English route', () => {
    renderTimeline({ currentSlug: '2023' }, '/en')
    expect(screen.getByRole('link', { name: '2024' })).toHaveAttribute('href', '/en/2024')
  })

  it('marks only the current year with aria-current="true"', () => {
    renderTimeline({ currentSlug: '2023' })
    expect(screen.getByRole('link', { name: '2023' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: '2024' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '1989' })).not.toHaveAttribute('aria-current')
  })

  it('marks no year current when the current slug matches none of them', () => {
    renderTimeline({ currentSlug: 'not-a-year' })
    for (const item of items) {
      expect(screen.getByRole('link', { name: item.title })).not.toHaveAttribute('aria-current')
    }
  })

  // Task 31, part 2: a dot carries no text -- every link's accessible name
  // must still be its year, or the whole rail is 11 (25, on the real
  // archive) unlabelled links to a screen reader. getByRole('link', {name})
  // below already depends on this for every other test in this file; this
  // test makes the requirement explicit and checks every item, not just the
  // ones other tests happen to touch.
  it("gives every link its year as its accessible name, even ones with no persistent label", () => {
    renderTimeline({ currentSlug: '2017' })
    for (const item of items) {
      expect(screen.getByRole('link', { name: item.title })).toBeInTheDocument()
    }
  })

  it('lets keyboard focus reach every year, in order, via Tab', async () => {
    const user = userEvent.setup()
    renderTimeline({ currentSlug: '2023' })
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
    const { container } = renderTimeline({ currentSlug: 'not-a-year' })
    const persistentTitles = [...container.querySelectorAll('.is-persistent')]
      .map((li) => li.querySelector('a').textContent.trim())
    expect(persistentTitles).toEqual(['2024', '2019', '1989'])
  })

  it('adds the current year to the persistent set even when it falls off the every-fifth pattern', () => {
    const { container } = renderTimeline({ currentSlug: '2017' }) // index 7, not on the every-fifth pattern
    const persistentTitles = [...container.querySelectorAll('.is-persistent')]
      .map((li) => li.querySelector('a').textContent.trim())
    expect(persistentTitles).toEqual(['2024', '2019', '2017', '1989'])
  })

  it('does not mark a non-current, non-every-fifth, non-edge item as persistent', () => {
    const { container } = renderTimeline({ currentSlug: 'not-a-year' })
    const link2021 = screen.getByRole('link', { name: '2021' })
    expect(link2021.closest('li')).not.toHaveClass('is-persistent')
  })
})
