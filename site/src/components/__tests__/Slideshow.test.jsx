import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import { Slideshow } from '../Slideshow.jsx'

const slides = [
  { caption: 'Porte', article: { slug: 'porte' }, image: { alt: 'porte', variants: { large: { path: 'a.webp', width: 2400, height: 1600 } } } },
  { caption: 'Châssis', article: { slug: 'chassis' }, image: { alt: 'chassis', variants: { large: { path: 'b.webp', width: 2400, height: 1600 } } } },
]

const slidesWithGap = [
  { caption: 'Porte', article: { slug: 'porte' }, image: { alt: 'porte', variants: { large: { path: 'a.webp', width: 2400, height: 1600 } } } },
  // No image variants at all: the API should already filter these out, but
  // the component guards defensively too. Must not render as an empty <img>
  // or count toward `count`.
  { caption: 'Sans image', article: { slug: 'sans-image' }, image: null },
  { caption: 'Châssis', article: { slug: 'chassis' }, image: { alt: 'chassis', variants: { large: { path: 'b.webp', width: 2400, height: 1600 } } } },
]

const mockMotion = (reduced) =>
  vi.stubGlobal('matchMedia', (query) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener: () => {}, removeEventListener: () => {},
  }))

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); mockMotion(false) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const renderShow = (props = {}) =>
  render(<MemoryRouter><LangProvider><Slideshow slides={slides} interval={5000} {...props} /></LangProvider></MemoryRouter>)

describe('Slideshow', () => {
  it('shows the first slide initially', () => {
    renderShow()
    expect(screen.getByAltText('porte')).toBeInTheDocument()
  })

  it('advances after the interval', () => {
    renderShow()
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('defaults to a 5000ms autoplay interval when none is passed', () => {
    render(<MemoryRouter><LangProvider><Slideshow slides={slides} /></LangProvider></MemoryRouter>)
    act(() => { vi.advanceTimersByTime(4999) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('advances on the right arrow key', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderShow()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('does not autoplay when reduced motion is preferred', () => {
    mockMotion(true)
    renderShow()
    act(() => { vi.advanceTimersByTime(20000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()
  })

  it('links the current slide to its article', () => {
    renderShow()
    expect(screen.getByRole('link', { name: /porte/i })).toHaveAttribute('href', '/oeuvres/porte')
  })

  it('passes width and height through to the image so the browser can reserve the box', () => {
    renderShow()
    const img = screen.getByAltText('porte')
    expect(img).toHaveAttribute('width', '2400')
    expect(img).toHaveAttribute('height', '1600')
  })

  it('renders both the outgoing and incoming images mid-transition, and only the incoming one once it completes', () => {
    renderShow()
    act(() => { vi.advanceTimersByTime(5000) })
    // Mid-crossfade: both slides are mounted.
    expect(screen.getByAltText('porte')).toBeInTheDocument()
    expect(screen.getByAltText('chassis')).toBeInTheDocument()

    // After the 600ms crossfade completes, only the incoming slide remains.
    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.queryByAltText('porte')).not.toBeInTheDocument()
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('swaps instantly with no double-rendered slide under reduced motion', async () => {
    mockMotion(true)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderShow()
    await user.keyboard('{ArrowRight}')
    expect(screen.queryByAltText('porte')).not.toBeInTheDocument()
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  // A free-running setInterval keeps counting through a manual navigation, so
  // a viewer who clicks next partway through an interval can be advanced
  // again a moment later by the timer they thought they had just pre-empted.
  // Every slide the viewer chooses must get the full interval.
  //
  // t=5000 is the discriminating instant, and the only one that is: it is
  // where the ORIGINAL interval would fire if it were still running. Asserting
  // at a later point proves nothing, because with only two slides the show
  // cycles back and a stale timer lands on the same image a fresh one would.
  it('restarts the autoplay countdown when the viewer navigates manually', () => {
    renderShow()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /suivant|next/i }))
    expect(screen.getByAltText('chassis')).toBeInTheDocument()

    // t=5000. The pre-empted timer fires here if it was never cleared, which
    // would bring 'porte' back as the incoming slide.
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.queryByAltText('porte')).not.toBeInTheDocument()
    expect(screen.getByAltText('chassis')).toBeInTheDocument()

    // t=8000, a full fresh interval after the manual move, does advance.
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()
  })

  it('pauses autoplay while the pointer is over the caption and controls', () => {
    renderShow()
    fireEvent.mouseEnter(document.querySelector('.slideshow-chrome'))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()

    fireEvent.mouseLeave(document.querySelector('.slideshow-chrome'))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  // Regression guard. Hover-pause used to sit on the <section>, which is
  // full-bleed and 100dvh tall once the slideshow became the whole homepage.
  // A pointer resting anywhere on the page therefore paused autoplay
  // permanently and the slideshow never advanced for any mouse user. The
  // pause target must stay small.
  it('does not pause autoplay when the pointer is over the image stage', () => {
    renderShow()
    fireEvent.mouseEnter(document.querySelector('.slideshow-stage'))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('does not pause autoplay when the pointer is over the section itself', () => {
    renderShow()
    fireEvent.mouseEnter(document.querySelector('.slideshow'))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('pauses autoplay on focus and resumes on blur', () => {
    renderShow()
    const link = screen.getByRole('link', { name: /porte/i })
    fireEvent.focus(link)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()

    fireEvent.blur(link)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('resets to the first slide when the slide list changes', () => {
    const { rerender } = renderShow()
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()

    // A different-length slide list (e.g. after a language switch re-fetch)
    // must reset the index to 0, not leave it pointing past a shorter list
    // or mid-array of a reordered one.
    rerender(
      <MemoryRouter>
        <LangProvider>
          <Slideshow slides={[slides[1]]} interval={5000} />
        </LangProvider>
      </MemoryRouter>,
    )
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
  })

  it('skips a slide with no image and does not count it', () => {
    renderShow({ slides: slidesWithGap })
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(5000); vi.advanceTimersByTime(600) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })
})
