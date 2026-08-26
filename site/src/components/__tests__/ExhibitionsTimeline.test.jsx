import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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

// Both timelines -- the desktop dot rail and the mobile year strip -- are in
// the DOM at once, and CSS alone decides which of the two is laid out (see
// ExhibitionsTimeline.jsx for why they are two lists rather than one, and
// base.css for the `display: none` that also takes the hidden one out of the
// accessibility tree). jsdom applies no stylesheet, so BOTH are queryable
// here and a document-wide `getByRole('link', { name: '2024' })` now finds
// two. Every test below this line is about the rail, so every one of them
// asks the rail rather than the document; the strip has its own block at the
// end of this file.
const railScope = () => within(document.querySelector('.exhibitions-timeline-rail'))

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
    const links = railScope().getAllByRole('link')
    expect(links).toHaveLength(11)
    expect(railScope().getByRole('link', { name: /Premier lieu/ })).toHaveAttribute('href', '/premier-lieu')
    expect(railScope().getByRole('link', { name: /Second lieu/ })).toHaveAttribute('href', '/second-lieu')
    expect(railScope().getByRole('link', { name: '1989' })).toHaveAttribute('href', '/expo-1989')
  })

  it('builds English hrefs under /en when rendered on an English route', () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 }, '/en')
    expect(railScope().getByRole('link', { name: '2024' })).toHaveAttribute('href', '/en/expo-2024')
  })

  it('marks aria-current="true" on the current EXHIBITION\'s own link, not shared across its year', () => {
    renderTimeline({ currentSlug: 'second-lieu', currentYear: 2019 })
    expect(railScope().getByRole('link', { name: /Second lieu/ })).toHaveAttribute('aria-current', 'true')
    // The sibling exhibition in the SAME year is not also marked current.
    expect(railScope().getByRole('link', { name: /Premier lieu/ })).not.toHaveAttribute('aria-current')
    expect(railScope().getByRole('link', { name: '2024' })).not.toHaveAttribute('aria-current')
  })

  it('marks no link current when the current slug matches none of them', () => {
    renderTimeline({ currentSlug: 'nope', currentYear: 1500 })
    for (const link of railScope().getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-current')
    }
  })

  // Task 35, Part B: "39 links reading 2013 five times is useless to a
  // screen reader" -- a single-exhibition year's link is still just its
  // year, but a multi-exhibition year's links must each say enough to tell
  // them apart.
  it("names a single-exhibition year's link with just the year", () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    expect(railScope().getByRole('link', { name: '2024' })).toBeInTheDocument()
    expect(railScope().getByRole('link', { name: '1989' })).toBeInTheDocument()
  })

  it("distinguishes a multi-exhibition year's links from each other, both still naming the year", () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const premier = railScope().getByRole('link', { name: /Premier lieu/ })
    const second = railScope().getByRole('link', { name: /Second lieu/ })
    expect(premier).toHaveAccessibleName(/2019/)
    expect(second).toHaveAccessibleName(/2019/)
    expect(premier).not.toBe(second)
    // Never the bare, undifferentiated year for either one.
    expect(railScope().queryAllByRole('link', { name: '2019' })).toHaveLength(0)
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
    expect(railScope().getByRole('link', { name: '2024' })).toHaveFocus()
    await user.tab()
    expect(railScope().getByRole('link', { name: '2023' })).toHaveFocus()
  })

  // Task 38, part 5 (client feedback): persistent labels are spaced by
  // CALENDAR YEARS -- at least five since the last one placed -- plus the
  // current year and the newest/oldest. See persistentLabelYears for why
  // the previous rule (every fifth DOT) left whole decades unlabelled.
  it('keeps a persistent label every five years, plus the newest and oldest', () => {
    const { container } = renderTimeline({ currentSlug: 'nope', currentYear: 1500 })
    const persistentYears = [...container.querySelectorAll('.exhibitions-timeline-label.is-persistent')]
      .map((el) => el.textContent.trim())
    // 2019 is five years back from 2024; 2016 is only three back from 2019,
    // so it waits. 1989 is the oldest and labelled regardless of its gap.
    expect(persistentYears).toEqual(['2024', '2019', '1989'])
  })

  it('adds the current year to the persistent set even when it falls off the five-year pattern', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2017', currentYear: 2017 }) // flat 8
    const persistentYears = [...container.querySelectorAll('.exhibitions-timeline-label.is-persistent')]
      .map((el) => el.textContent.trim())
    expect(persistentYears).toEqual(['2024', '2019', '2017', '1989'])
  })

  // The client's own report, reproduced: on the REAL archive's shape the
  // dot-counting rule spent four labels inside seven years and then went
  // twenty years without one, so 2003 and 1993 never appeared. Counting
  // years instead spreads them evenly across the whole span. Every year in
  // this fixture, and every multi-exhibition count, is the production
  // archive's own (39 exhibitions across 25 years, 1989..2024).
  it('labels evenly across the real archive, where counting dots skipped two decades', () => {
    const REAL = [
      [2024, 1], [2023, 1], [2022, 1], [2021, 1], [2020, 2], [2019, 3], [2018, 2],
      [2017, 1], [2016, 1], [2015, 2], [2014, 2], [2013, 5], [2012, 2], [2011, 1],
      [2010, 2], [2009, 1], [2008, 3], [2007, 1], [2006, 1], [2003, 1], [2001, 1],
      [1998, 1], [1993, 1], [1992, 1], [1989, 1],
    ]
    const archive = REAL.flatMap(([year, count]) =>
      Array.from({ length: count }, (_, i) => ({
        slug: `y${year}-${i}`,
        title: `Expo ${year} #${i}`,
        yearStart: year,
      }))
    )
    expect(archive).toHaveLength(39)

    const { container } = render(
      <MemoryRouter>
        <LangProvider>
          <ExhibitionsTimeline items={archive} currentSlug="nope" currentYear={1500} />
        </LangProvider>
      </MemoryRouter>
    )
    const persistentYears = [...container.querySelectorAll('.exhibitions-timeline-label.is-persistent')]
      .map((el) => el.textContent.trim())
    expect(persistentYears).toEqual(['2024', '2019', '2014', '2009', '2003', '1998', '1993', '1989'])
    // The two the client named, and the cluster the old rule wasted its
    // labels on.
    expect(persistentYears).toContain('2003')
    expect(persistentYears).toContain('1993')
    expect(persistentYears).not.toContain('2013')
  })

  it('does not mark a non-current, non-edge year outside the five-year cadence as persistent', () => {
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
    expect(railScope().getByRole('link', { name: /Premier lieu/ })).toHaveFocus()
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
    // Tab all the way through the rail, then through the mobile year strip
    // that follows it in the DOM, and one step past both. In a browser the
    // strip is `display: none` at this width and takes no tab stops at all,
    // but jsdom applies no stylesheet, so its links are focusable here and
    // have to be counted -- one per distinct YEAR (the strip groups; the
    // rail does not), which is what makes this a Set rather than a length.
    const years = new Set(items.map((item) => item.yearStart)).size
    for (let i = 0; i < items.length + years; i++) await user.tab()
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
    const rail = railScope().getByRole('link', { name: '2024' }).closest('.exhibitions-timeline-rail')

    // clientY: 0 is nearest the newest item (flat index 0, "expo-2024") by
    // nearestIndexByY -- confirm the label agrees first.
    fireEvent.mouseMove(rail, { clientY: 0 })
    expect(screen.getByText('2024', { selector: '.exhibitions-timeline-scrub-year' })).toBeInTheDocument()

    // Click a DIFFERENT link's own DOM node (the oldest, "1989") but at the
    // SAME clientY the label above was computed from.
    const wrongLink = railScope().getByRole('link', { name: '1989' })
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
    const rail = railScope().getByRole('link', { name: '2024' }).closest('.exhibitions-timeline-rail')
    const link = railScope().getByRole('link', { name: '1989' })
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
  it('restores the floating scrubber label from the focused link when a KEYBOARD activation navigates', () => {
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

    // Enter on a focused link: browsers dispatch a click for it like any
    // other, distinguishable only by `detail` staying 0 (see pointerNavRef
    // in the component). This viewer has no pointer, so the label has to
    // survive the navigation and follow the focused dot.
    const link = railScope().getByRole('link', { name: '1989' })
    link.focus()
    fireEvent.click(link, { clientY: 700, detail: 0 })

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

  // Task 38, part 3 (client feedback: the label "being stuck visible after
  // clicking one exhibit"). A mouse click focuses its target exactly as Tab
  // does, so the restore-from-focus above used to fire for pointer clicks
  // too and left the label sitting over the newly loaded page with the
  // pointer no longer anywhere near it. `detail: 1` is what marks this as
  // pointer-driven.
  it('clears the floating scrubber label outright when a POINTER click navigates, even though the click focused its own link', () => {
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

    const link = railScope().getByRole('link', { name: '1989' })
    link.focus() // as a real mouse click does
    fireEvent.click(link, { clientY: 700, detail: 1 })

    rerender(
      <MemoryRouter initialEntries={['/']}>
        <LangProvider>
          <ExhibitionsTimeline items={items} currentSlug="expo-1989" currentYear={1989} />
        </LangProvider>
      </MemoryRouter>
    )

    expect(container.querySelector('.exhibitions-timeline-scrub')).not.toBeInTheDocument()
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

  // Task 38, part 1 (client feedback: the rail "bleeds too much at the
  // bottom ... and creates a scrollbar"). A year label is taller than a
  // dot's own hit box, so centring the oldest year's label on the bottommost
  // dot hung it past the rail's bottom edge -- which is the viewport's
  // bottom edge, on a page designed never to scroll. jsdom has no layout, so
  // these assert against the component's own fallbacks: a 700px rail
  // (FALLBACK_RAIL_HEIGHT) and a 25px label (FALLBACK_LABEL_HEIGHT), i.e.
  // every label's centre must sit within [12.5, 687.5].
  it('clamps the newest year\'s label inside the rail\'s own top edge, rather than centring it past it', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const label = screen.getByText('2024', { selector: '.exhibitions-timeline-label' })
    expect(parseFloat(label.style.top)).toBeGreaterThanOrEqual(12.5)
    expect(container.querySelector('.exhibitions-timeline-label')).toBe(label)
  })

  it('clamps the oldest year\'s label inside the rail\'s own bottom edge, rather than centring it past it', () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const label = screen.getByText('1989', { selector: '.exhibitions-timeline-label' })
    expect(parseFloat(label.style.top)).toBeLessThanOrEqual(700 - 12.5)
  })

  it('leaves every year label centred on its own dot away from the rail\'s ends', () => {
    const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    const labels = [...container.querySelectorAll('.exhibitions-timeline-label')]
    const tops = labels.map((l) => parseFloat(l.style.top))
    // Strictly descending in DOM order (newest first), and every one inside
    // the rail: clamping the two ends must not reorder or collapse the rest.
    expect(tops).toEqual([...tops].sort((a, b) => a - b))
    expect(new Set(tops).size).toBe(tops.length)
    tops.forEach((top) => {
      expect(top).toBeGreaterThanOrEqual(12.5)
      expect(top).toBeLessThanOrEqual(700 - 12.5)
    })
  })

  // Task 38, part 9 (client: "still seeing a scrollbar ... a couple pixels
  // off"). The previous fix clamped the labels but still placed everything
  // against `clientHeight`, which is an INTEGER and ROUNDED -- so a rail
  // whose real height is 748.5px measured as 749, and the bottommost dot's
  // own box ended half a pixel below the rail's true bottom edge. That edge
  // is the viewport's, so half a pixel there is a scrollbar; and it is far
  // too small to find by hunting for an element hanging past the fold,
  // which is how it survived.
  //
  // jsdom implements no layout and has no ResizeObserver, so both are
  // supplied here: this asserts the arithmetic the browser was tripping on,
  // which is the only part that was ever wrong.
  describe('against a fractional rail height', () => {
    const RAIL_HEIGHT = 748.5
    const DOT_BOX = 24
    const LABEL_BOX = 25
    let realGetBoundingClientRect
    let realResizeObserver

    beforeEach(() => {
      realResizeObserver = global.ResizeObserver
      // Measures once on observe, which is all these assertions need.
      global.ResizeObserver = class {
        constructor(callback) { this.callback = callback }
        observe() { this.callback([]) }
        disconnect() {}
      }
      realGetBoundingClientRect = Element.prototype.getBoundingClientRect
      Element.prototype.getBoundingClientRect = function fake() {
        const height = this.classList.contains('exhibitions-timeline-rail')
          ? RAIL_HEIGHT
          : this.classList.contains('exhibitions-timeline-label')
            ? LABEL_BOX
            : this.tagName === 'A'
              ? DOT_BOX
              : 0
        return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height }
      }
    })

    afterEach(() => {
      Element.prototype.getBoundingClientRect = realGetBoundingClientRect
      global.ResizeObserver = realResizeObserver
    })

    it('keeps every dot\'s own box inside the rail, rounding the height down rather than to nearest', () => {
      const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
      const tops = [...container.querySelectorAll('.exhibitions-timeline-dot-item')]
        .map((el) => parseFloat(el.style.top))
      expect(tops.length).toBe(11)
      tops.forEach((top) => {
        // Each dot is centred on its own `top` (translateY(-50%)).
        expect(top - DOT_BOX / 2).toBeGreaterThanOrEqual(0)
        expect(top + DOT_BOX / 2).toBeLessThanOrEqual(RAIL_HEIGHT)
      })
    })

    it('keeps every year label inside the rail too', () => {
      const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
      const tops = [...container.querySelectorAll('.exhibitions-timeline-label')]
        .map((el) => parseFloat(el.style.top))
      expect(tops.length).toBeGreaterThan(0)
      tops.forEach((top) => {
        expect(top - LABEL_BOX / 2).toBeGreaterThanOrEqual(0)
        expect(top + LABEL_BOX / 2).toBeLessThanOrEqual(RAIL_HEIGHT)
      })
    })

    // The inset used to be a hardcoded 24, "true at the default root size"
    // -- a visitor browsing larger got a taller hit box than that and the
    // bottommost dot hung past the edge by the difference.
    it('insets by the dot\'s own measured box, not a hardcoded one, at a larger root size', () => {
      const BIG_DOT = 36 // 1.5rem at a 24px root
      Element.prototype.getBoundingClientRect = function fake() {
        const height = this.classList.contains('exhibitions-timeline-rail')
          ? RAIL_HEIGHT
          : this.classList.contains('exhibitions-timeline-label')
            ? LABEL_BOX
            : this.tagName === 'A'
              ? BIG_DOT
              : 0
        return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height }
      }
      const { container } = renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
      const tops = [...container.querySelectorAll('.exhibitions-timeline-dot-item')]
        .map((el) => parseFloat(el.style.top))
      tops.forEach((top) => {
        expect(top - BIG_DOT / 2).toBeGreaterThanOrEqual(0)
        expect(top + BIG_DOT / 2).toBeLessThanOrEqual(RAIL_HEIGHT)
      })
    })
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

// The mobile timeline. A second list, not the rail restyled -- see the
// component for why -- so it gets its own scope and its own block. In a
// browser exactly one of the two is ever laid out (a `display: none` per
// breakpoint, which also takes the hidden one out of the accessibility
// tree); jsdom applies no stylesheet, so both are here and each block asks
// for the one it means.
describe('ExhibitionsTimeline, mobile year strip', () => {
  const strip = () => within(document.querySelector('.exhibitions-timeline-years'))

  it('renders one link per YEAR, not one per exhibition', () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    // 11 exhibitions across 10 distinct years: 2019 holds two (Premier lieu
    // and Second lieu), which the rail gives two dots and this gives one
    // chip. That collapse is the whole point of grouping -- two chips both
    // reading "2019" would say nothing about which was which.
    expect(strip().getAllByRole('link')).toHaveLength(10)
    expect(railScope().getAllByRole('link')).toHaveLength(11)
  })

  it('sends a year holding ONE exhibition straight to that exhibition', () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    expect(strip().getByRole('link', { name: '2024' })).toHaveAttribute('href', '/expo-2024')
    expect(strip().getByRole('link', { name: '1989' })).toHaveAttribute('href', '/expo-1989')
  })

  it('sends a year holding SEVERAL to that year\'s own index, so none of them is unreachable', () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    // 2019 holds Premier lieu and Second lieu. Linking the chip to either one
    // would leave the other with no way in from the strip at all.
    expect(strip().getByRole('link', { name: /^2019/ })).toHaveAttribute('href', '/2019')
  })

  it('names a crowded year by its count, so the chip says there is more than one behind it', () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    expect(strip().getByRole('link', { name: '2019 \u2013 2 expositions' })).toBeInTheDocument()
    // A year with a single exhibition is named by the year alone: there is
    // nothing to disambiguate, and "2024 - 1 exposition" is noise.
    expect(strip().getByRole('link', { name: '2024' })).toBeInTheDocument()
  })

  it('counts in English on an English route, and builds its hrefs under /en', () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 }, '/en')
    expect(strip().getByRole('link', { name: '2019 \u2013 2 exhibitions' })).toHaveAttribute('href', '/en/2019')
    expect(strip().getByRole('link', { name: '2024' })).toHaveAttribute('href', '/en/expo-2024')
  })

  it('marks the current YEAR, and marks exactly one', () => {
    renderTimeline({ currentSlug: 'expo-2023', currentYear: 2023 })
    expect(strip().getByRole('link', { name: '2023' })).toHaveAttribute('aria-current', 'true')
    const marked = strip().getAllByRole('link').filter((a) => a.hasAttribute('aria-current'))
    expect(marked).toHaveLength(1)
  })

  it('marks the whole year current when the current exhibition is one of several in it', () => {
    // The rail marks the EXHIBITION (aria-current on Second lieu's own dot,
    // not Premier lieu's -- see the rail's own tests above). The strip has
    // one chip for the pair, so what it can mark is the year.
    renderTimeline({ currentSlug: 'second-lieu', currentYear: 2019 })
    expect(strip().getByRole('link', { name: /^2019/ })).toHaveAttribute('aria-current', 'true')
  })
})
