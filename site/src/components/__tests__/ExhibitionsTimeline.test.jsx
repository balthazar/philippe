import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import { ExhibitionsTimeline } from '../ExhibitionsTimeline.jsx'

// Task 37, part B: a plain, testid-tagged readout of the current route so a
// test can assert WHERE a click actually navigated, independent of which
// DOM element the click event itself targeted.
function LocationDisplay() {
  return <div data-testid="location">{useLocation().pathname}</div>
}

// Task 35, Part B / task 36: the split that produced 39 real exhibitions
// across 25 years (nine years hold more than one; 2013 holds five) means a
// one-dot-per-YEAR rail links only to that year's first exhibition -- the
// other exhibitions in a multi-exhibition year are unreachable from the
// rail entirely. The rail carries one dot per EXHIBITION, all of them, with
// the YEAR label still shown once per year (not once per dot).
//
// 11 items across 10 distinct years (2019 holds two, mirroring 2013 in the
// real archive) -- enough to exercise both the every-fifth persistent-label
// rule (read against the flat 11-dot sequence) and the multi-exhibition-year
// disambiguation requirement.
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
  // carries its own, more specific name above. Task 36: the label is now a
  // standalone element (not nested inside a shared per-year <li>), one per
  // distinct year regardless of DOM nesting.
  it('renders the year label text only once for a multi-exhibition year', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const labels = [...container.querySelectorAll('.exhibitions-timeline-label')].map((n) => n.textContent.trim())
    expect(labels.filter((t) => t === '2019')).toHaveLength(1)
  })

  it('renders exactly one label per distinct year', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const labels = [...container.querySelectorAll('.exhibitions-timeline-label')]
    const distinctYears = new Set(items.map((i) => i.yearStart)).size
    expect(labels).toHaveLength(distinctYears)
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
  // Task 35, Part B / task 36 re-check this against the new dot count:
  // "every fifth" counts across the flat 11-dot (39, on the real archive)
  // sequence, not the ~10 (25) year groups -- a group is persistent if ANY
  // of its dots lands on the rule, so a multi-exhibition year absorbs an
  // every-fifth hit without showing its label twice.
  it('keeps a persistent label on the group containing every fifth dot, plus the newest and oldest', () => {
    const { container } = renderTimeline({ currentSlug: 'nope', currentYear: 1500 })
    const persistentYears = [...container.querySelectorAll('.exhibitions-timeline-label.is-persistent')]
      .map((el) => el.textContent.trim())
    // flat index 5 (the every-fifth hit) is "Premier lieu", inside the 2019
    // group -- its group is persistent, shown once, not twice.
    expect(persistentYears).toEqual(['2024', '2019', '1989'])
  })

  it('adds the current year to the persistent set even when it falls off the every-fifth pattern', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2017', currentYear: 2017 }) // flat 8
    const persistentYears = [...container.querySelectorAll('.exhibitions-timeline-label.is-persistent')]
      .map((el) => el.textContent.trim())
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
    const persistentYears = [...container.querySelectorAll('.exhibitions-timeline-label.is-persistent')]
      .map((el) => el.textContent.trim())
    expect(persistentYears).toEqual(['2024', '2020', '1989'])
  })

  it('does not mark a non-current, non-every-fifth, non-edge year as persistent', () => {
    const { container } = renderTimeline({ currentSlug: 'nope', currentYear: 1500 })
    const label2021 = [...container.querySelectorAll('.exhibitions-timeline-label')]
      .find((el) => el.textContent.trim() === '2021')
    expect(label2021).not.toHaveClass('is-persistent')
  })

  // Task 36, item 4: replaces the old "hover a dot, its year appears
  // inline" mechanism with one floating element that tracks the pointer or
  // keyboard focus and names BOTH the year and the exhibition's own title
  // -- resolving the hit-target problem (the viewer points at the rail, not
  // a 6px dot) and giving more than a bare year even for a single-
  // exhibition year, unlike the always-on persistent label.
  it('shows no floating scrubber label until the rail is hovered or focused', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    expect(container.querySelector('.exhibitions-timeline-scrub')).not.toBeInTheDocument()
  })

  it('shows the floating scrubber label, naming year and title, when the rail is hovered', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const rail = container.querySelector('.exhibitions-timeline-rail')
    fireEvent.mouseMove(rail, { clientY: 0 })
    const scrub = container.querySelector('.exhibitions-timeline-scrub')
    expect(scrub).toBeInTheDocument()
    expect(scrub).toHaveTextContent('2024')
  })

  // Task 37, part C1. Before this fix the scrubber label was always
  // vertically CENTRED on the dot it named (`transform: translateY(-50%)`
  // on a `top` equal to the dot's own position). Centred on the topmost dot
  // (top: 0, right under the header) its own upper half poked above the
  // header; centred on the bottommost dot (top: railHeight, the viewport's
  // own bottom edge) its lower half poked past the bottom of the viewport
  // and forced a scrollbar -- confirmed in a real browser (see the task
  // report). jsdom has no ResizeObserver, so the scrubber's own measured
  // height falls back to a fixed estimate (FALLBACK_SCRUB_HEIGHT, 44px);
  // half of that (22px) is the least/most a clamped `top` can be within a
  // FALLBACK_RAIL_HEIGHT-tall (700px) rail.
  it('clamps the floating scrubber label at the rail\'s own top edge, rather than letting it centre past it', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const rail = container.querySelector('.exhibitions-timeline-rail')
    fireEvent.mouseMove(rail, { clientY: 0 })
    const scrub = container.querySelector('.exhibitions-timeline-scrub')
    expect(parseFloat(scrub.style.top)).toBeGreaterThanOrEqual(22)
  })

  it('clamps the floating scrubber label at the rail\'s own bottom edge, rather than letting it centre past it', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const rail = container.querySelector('.exhibitions-timeline-rail')
    fireEvent.mouseMove(rail, { clientY: 700 })
    const scrub = container.querySelector('.exhibitions-timeline-scrub')
    expect(parseFloat(scrub.style.top)).toBeLessThanOrEqual(700 - 22)
  })

  it('clears the floating scrubber label when the pointer leaves the rail (and nothing is focused)', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const rail = container.querySelector('.exhibitions-timeline-rail')
    fireEvent.mouseMove(rail, { clientY: 0 })
    expect(container.querySelector('.exhibitions-timeline-scrub')).toBeInTheDocument()
    fireEvent.mouseLeave(rail)
    expect(container.querySelector('.exhibitions-timeline-scrub')).not.toBeInTheDocument()
  })

  // Accessibility (task 36, item 4): "the floating label must appear on
  // keyboard focus exactly as it does on hover" -- with no pointer
  // involved at all.
  it('shows the floating scrubber label on keyboard focus of a dot, naming that exhibition', async () => {
    const user = userEvent.setup()
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    await user.tab() // focuses the first (newest) link, "2024"
    const scrub = container.querySelector('.exhibitions-timeline-scrub')
    expect(scrub).toBeInTheDocument()
    expect(scrub).toHaveTextContent('2024')
  })

  it('shows a multi-exhibition year link\'s own distinct title in the scrubber on focus, not just the shared year', async () => {
    const user = userEvent.setup()
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    // Tab to "Premier lieu" (flat index 5, the 6th link).
    for (let i = 0; i < 6; i++) await user.tab()
    expect(screen.getByRole('link', { name: /Premier lieu/ })).toHaveFocus()
    expect(container.querySelector('.exhibitions-timeline-scrub')).toHaveTextContent('Premier lieu')
  })

  it('hides the floating scrubber label once focus leaves the rail entirely', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <MemoryRouter>
        <LangProvider>
          <div>
            <button type="button">before</button>
            <ExhibitionsTimeline items={items} currentSlug="expo-2023" currentYear={2023} />
            <button type="button">after</button>
          </div>
        </LangProvider>
      </MemoryRouter>
    )
    await user.tab() // "before" button
    await user.tab() // first rail link
    expect(container.querySelector('.exhibitions-timeline-scrub')).toBeInTheDocument()
    // Tab all the way through the rail and one step past it.
    for (let i = 0; i < items.length; i++) await user.tab()
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus()
    expect(container.querySelector('.exhibitions-timeline-scrub')).not.toBeInTheDocument()
  })

  // Task 37, part B. Dots sit as little as 10px apart while each one's own
  // clickable hit-box is much larger (24px, DOT_HIT_SIZE in the component),
  // so adjacent hit-boxes overlap heavily and whichever sibling paints last
  // wins a raw hit-test -- not necessarily the dot nearest the pointer, the
  // one the floating label just named. The fix routes every click through
  // that SAME nearest-by-Y computation, so the label and the navigation
  // target can never disagree. Proven here by firing the click directly on
  // a DIFFERENT link's own DOM node (exactly what an overlapping hit-box
  // would let happen) at a clientY that names a THIRD item -- if the fix
  // works, navigation follows the Y position, not which node the browser's
  // hit-test happened to hand the event to.
  it('navigates to the same exhibition the floating label names for a given pointer position, even when a different link\'s own DOM node receives the click', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <LangProvider>
          <LocationDisplay />
          <ExhibitionsTimeline items={items} currentSlug="expo-2023" currentYear={2023} />
        </LangProvider>
      </MemoryRouter>
    )
    const rail = screen.getByRole('link', { name: '2024' }).closest('.exhibitions-timeline-rail')

    // clientY: 0 is nearest the newest item (flat index 0, "expo-2024") by
    // nearestIndexByY -- confirm the label agrees first.
    fireEvent.mouseMove(rail, { clientY: 0 })
    expect(screen.getByText('2024', { selector: '.exhibitions-timeline-scrub-year' })).toBeInTheDocument()

    // Click a DIFFERENT link's own DOM node (the oldest, "1989") but at the
    // SAME clientY the label above was computed from.
    const wrongLink = screen.getByRole('link', { name: '1989' })
    fireEvent.click(wrongLink, { clientY: 0 })

    expect(screen.getByTestId('location')).toHaveTextContent('/expo-2024')
  })

  it('leaves a ctrl/cmd-clicked link to the browser\'s own default (open in a new tab), rather than overriding it', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <LangProvider>
          <LocationDisplay />
          <ExhibitionsTimeline items={items} currentSlug="expo-2023" currentYear={2023} />
        </LangProvider>
      </MemoryRouter>
    )
    const rail = screen.getByRole('link', { name: '2024' }).closest('.exhibitions-timeline-rail')
    const link = screen.getByRole('link', { name: '1989' })
    fireEvent.click(link, { clientY: 0, metaKey: true })
    // Not overridden to the clientY-nearest target -- the click is left
    // alone entirely (jsdom does not itself follow the link's href).
    expect(screen.getByTestId('location')).toHaveTextContent('/')
    expect(rail).toBeInTheDocument()
  })

  // Task 37, part C2 (client feedback). `ExhibitionsTimeline` never unmounts
  // across an exhibition-to-exhibition navigation (ExhibitionsLayout keeps
  // the rail mounted deliberately), so `activeSlug` -- this component's own
  // state -- survived a click straight through to the newly loaded page,
  // still naming whatever it named the instant before the click. Proven by
  // reproducing exactly that: hover names one item (the stale value the bug
  // would leave behind), a DIFFERENT item is clicked and focused (as a real
  // click does), and the parent re-renders with the newly current slug --
  // exactly what ExhibitionsLayout does once the URL updates.
  it('clears the floating scrubber label\'s stale value once navigation completes, restoring it from the link that still holds focus', () => {
    const { container, rerender } = render(
      <MemoryRouter initialEntries={['/']}>
        <LangProvider>
          <ExhibitionsTimeline items={items} currentSlug="expo-2023" currentYear={2023} />
        </LangProvider>
      </MemoryRouter>
    )
    const rail = container.querySelector('.exhibitions-timeline-rail')
    fireEvent.mouseMove(rail, { clientY: 0 })
    expect(container.querySelector('.exhibitions-timeline-scrub')).toHaveTextContent('2024')

    // Click "1989" (a different item than the stale hover above) -- a real
    // click focuses its target the same way a keyboard Enter does.
    const link = screen.getByRole('link', { name: '1989' })
    link.focus()
    fireEvent.click(link, { clientY: 700 })

    // The parent (ExhibitionsLayout) re-renders with the newly current
    // slug once the URL updates.
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <LangProvider>
          <ExhibitionsTimeline items={items} currentSlug="expo-1989" currentYear={1989} />
        </LangProvider>
      </MemoryRouter>
    )

    const scrub = container.querySelector('.exhibitions-timeline-scrub')
    expect(scrub).toHaveTextContent('1989')
    expect(scrub).not.toHaveTextContent('2024')
  })

  it('clears the floating scrubber label entirely on navigation when nothing holds focus within the rail', () => {
    const { container, rerender } = render(
      <MemoryRouter initialEntries={['/']}>
        <LangProvider>
          <ExhibitionsTimeline items={items} currentSlug="expo-2023" currentYear={2023} />
        </LangProvider>
      </MemoryRouter>
    )
    const rail = container.querySelector('.exhibitions-timeline-rail')
    fireEvent.mouseMove(rail, { clientY: 0 })
    expect(container.querySelector('.exhibitions-timeline-scrub')).toBeInTheDocument()
    document.activeElement?.blur()

    rerender(
      <MemoryRouter initialEntries={['/']}>
        <LangProvider>
          <ExhibitionsTimeline items={items} currentSlug="expo-1989" currentYear={1989} />
        </LangProvider>
      </MemoryRouter>
    )

    expect(container.querySelector('.exhibitions-timeline-scrub')).not.toBeInTheDocument()
  })

  it('leaves the floating scrubber label alone while the current exhibition does not change', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const rail = container.querySelector('.exhibitions-timeline-rail')
    fireEvent.mouseMove(rail, { clientY: 0 })
    expect(container.querySelector('.exhibitions-timeline-scrub')).toHaveTextContent('2024')
  })

  it('is aria-hidden, since each dot\'s own link already carries its accessible name', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const rail = container.querySelector('.exhibitions-timeline-rail')
    fireEvent.mouseMove(rail, { clientY: 0 })
    expect(container.querySelector('.exhibitions-timeline-scrub')).toHaveAttribute('aria-hidden', 'true')
  })
})
