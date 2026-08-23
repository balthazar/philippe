import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import { ExhibitionsTimeline } from '../ExhibitionsTimeline.jsx'

const items = [
  { _id: '1', slug: '2024', title: '2024' },
  { _id: '2', slug: '2023', title: '2023' },
  { _id: '3', slug: '1989', title: '1989' },
]

const renderTimeline = (props, path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LangProvider>
        <ExhibitionsTimeline items={items} {...props} />
      </LangProvider>
    </MemoryRouter>
  )

const mockMotion = (reduced) =>
  vi.stubGlobal('matchMedia', (query) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener: () => {}, removeEventListener: () => {},
  }))

// jsdom never lays anything out, so a scrollable nav (real overflow, a real
// bounding box) has to be faked by hand for every edge-auto-scroll test.
function mockOverflow(nav, { top = 0, height = 300, scrollHeight = 1000, clientHeight = 300, scrollTop = 0 } = {}) {
  nav.getBoundingClientRect = () => ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON() {} })
  Object.defineProperty(nav, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(nav, 'clientHeight', { value: clientHeight, configurable: true })
  nav.scrollTop = scrollTop
}

// jsdom has no PointerEvent implementation at all, so @testing-library's
// fireEvent.pointerMove/pointerLeave silently drop init properties like
// clientY (verified: the fired event's clientY comes back undefined). A
// MouseEvent, which jsdom does implement, carries the same clientY and is
// indistinguishable to a plain `addEventListener('pointermove', ...)`,
// which only ever looks at the event's type string.
const pointerMove = (el, clientY) => el.dispatchEvent(new MouseEvent('pointermove', { clientY, bubbles: true, cancelable: true }))
const pointerLeave = (el) => el.dispatchEvent(new MouseEvent('pointerleave', { bubbles: false, cancelable: true }))
const wheel = (el) => el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true }))

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

  // Task 28: "the list must be fully usable with no hover at all: keyboard
  // focus must move through the years". Every year is a real <a href>, so
  // Tab must walk through all of them without anything intercepting focus.
  it('lets keyboard focus reach every year, in order, via Tab', async () => {
    const user = userEvent.setup()
    renderTimeline({ currentSlug: '2023' })
    await user.tab()
    expect(screen.getByRole('link', { name: '2024' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: '2023' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: '1989' })).toHaveFocus()
  })

  // Task 28: "make sure the current year is reachable without hunting" on a
  // 25-item column. Guarded in the component itself (jsdom has no
  // scrollIntoView implementation at all), so this only asserts the call,
  // not any pixel value.
  it('scrolls the current year into view on mount', () => {
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    renderTimeline({ currentSlug: '1989' })
    expect(scrollIntoView).toHaveBeenCalled()
    delete window.HTMLElement.prototype.scrollIntoView
  })
})

// Task 29, part 4: replaces the timeline's own scrollbar with edge
// auto-scroll -- the "drag near a window edge" pattern. Behaviour only, per
// the task brief: no assertion here pins a scroll speed or a mask's
// opacity, only whether the list moves, which way, and when it must not.
describe('ExhibitionsTimeline edge auto-scroll', () => {
  beforeEach(() => { vi.useFakeTimers(); mockMotion(false) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('scrolls the list forward while the pointer dwells near the bottom edge', () => {
    const { container } = renderTimeline({ currentSlug: '2023' })
    const nav = container.querySelector('.exhibitions-timeline')
    mockOverflow(nav)

    pointerMove(nav, 290) // within 48px of the 300px-tall bottom edge
    vi.advanceTimersByTime(1000)
    expect(nav.scrollTop).toBeGreaterThan(0)
  })

  it('scrolls the list backward while the pointer dwells near the top edge', () => {
    const { container } = renderTimeline({ currentSlug: '2023' })
    const nav = container.querySelector('.exhibitions-timeline')
    mockOverflow(nav, { scrollTop: 500 })

    pointerMove(nav, 5)
    vi.advanceTimersByTime(1000)
    expect(nav.scrollTop).toBeLessThan(500)
  })

  // "must not trigger from a pointer merely passing over the list on its
  // way somewhere else" -- a pointer that dwells for less than the required
  // delay before moving elsewhere (or leaving) must never have scrolled it.
  it('does not scroll when the pointer only passes through the edge zone briefly', () => {
    const { container } = renderTimeline({ currentSlug: '2023' })
    const nav = container.querySelector('.exhibitions-timeline')
    mockOverflow(nav)

    pointerMove(nav, 290)
    vi.advanceTimersByTime(50) // well under the dwell delay
    pointerMove(nav, 150) // back to the middle, on its way elsewhere
    vi.advanceTimersByTime(1000)
    expect(nav.scrollTop).toBe(0)
  })

  it('stops as soon as the pointer leaves the edge zone', () => {
    const { container } = renderTimeline({ currentSlug: '2023' })
    const nav = container.querySelector('.exhibitions-timeline')
    mockOverflow(nav)

    pointerMove(nav, 290)
    vi.advanceTimersByTime(1000)
    const scrolledSoFar = nav.scrollTop
    expect(scrolledSoFar).toBeGreaterThan(0)

    pointerLeave(nav)
    vi.advanceTimersByTime(1000)
    expect(nav.scrollTop).toBe(scrolledSoFar)
  })

  it('stops as soon as the pointer moves back to the middle of the list', () => {
    const { container } = renderTimeline({ currentSlug: '2023' })
    const nav = container.querySelector('.exhibitions-timeline')
    mockOverflow(nav)

    pointerMove(nav, 290)
    vi.advanceTimersByTime(1000)
    const scrolledSoFar = nav.scrollTop
    expect(scrolledSoFar).toBeGreaterThan(0)

    pointerMove(nav, 150)
    vi.advanceTimersByTime(1000)
    expect(nav.scrollTop).toBe(scrolledSoFar)
  })

  // "must not fight a user-initiated scroll" -- a real wheel scroll wins
  // outright and auto-scroll does not resume on its own.
  it('yields to a real wheel scroll and does not keep auto-scrolling underneath it', () => {
    const { container } = renderTimeline({ currentSlug: '2023' })
    const nav = container.querySelector('.exhibitions-timeline')
    mockOverflow(nav)

    pointerMove(nav, 290)
    vi.advanceTimersByTime(1000)
    const scrolledByAutoScroll = nav.scrollTop
    expect(scrolledByAutoScroll).toBeGreaterThan(0)

    // The user scrolls for themselves -- simulated directly, the way a real
    // wheel/trackpad scroll would move scrollTop, since jsdom does not
    // implement actual scrolling.
    nav.scrollTop = scrolledByAutoScroll + 200
    wheel(nav)
    const afterUserScroll = nav.scrollTop

    vi.advanceTimersByTime(1000)
    expect(nav.scrollTop).toBe(afterUserScroll)
  })

  it('does nothing at all when the list has no vertical overflow (e.g. the mobile horizontal row)', () => {
    const { container } = renderTimeline({ currentSlug: '2023' })
    const nav = container.querySelector('.exhibitions-timeline')
    mockOverflow(nav, { scrollHeight: 300, clientHeight: 300 })

    pointerMove(nav, 290)
    vi.advanceTimersByTime(1000)
    expect(nav.scrollTop).toBe(0)
  })

  it('honours prefers-reduced-motion: reduce by never auto-scrolling', () => {
    mockMotion(true)
    const { container } = renderTimeline({ currentSlug: '2023' })
    const nav = container.querySelector('.exhibitions-timeline')
    mockOverflow(nav)

    pointerMove(nav, 290)
    vi.advanceTimersByTime(1000)
    expect(nav.scrollTop).toBe(0)
  })
})
