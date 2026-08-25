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

// Four distinct slides, needed for the re-entrancy tests below: clicking
// rapidly through only two slides bounces back to the start (A -> B -> A),
// which cannot distinguish "the fix preserved the settled anchor" from
// "there was nothing to distinguish in the first place".
const fourSlides = [
  { caption: 'Un', article: { slug: 'un' }, image: { alt: 'un', variants: { large: { path: 'a.webp', width: 2400, height: 1600 } } } },
  { caption: 'Deux', article: { slug: 'deux' }, image: { alt: 'deux', variants: { large: { path: 'b.webp', width: 2400, height: 1600 } } } },
  { caption: 'Trois', article: { slug: 'trois' }, image: { alt: 'trois', variants: { large: { path: 'c.webp', width: 2400, height: 1600 } } } },
  { caption: 'Quatre', article: { slug: 'quatre' }, image: { alt: 'quatre', variants: { large: { path: 'd.webp', width: 2400, height: 1600 } } } },
]

const slidesWithGap = [
  { caption: 'Porte', article: { slug: 'porte' }, image: { alt: 'porte', variants: { large: { path: 'a.webp', width: 2400, height: 1600 } } } },
  // No image variants at all: the API should already filter these out, but
  // the component guards defensively too. Must not render as an empty <img>
  // or count toward `count`.
  { caption: 'Sans image', article: { slug: 'sans-image' }, image: null },
  { caption: 'Châssis', article: { slug: 'chassis' }, image: { alt: 'chassis', variants: { large: { path: 'b.webp', width: 2400, height: 1600 } } } },
]

// Mirrors Slideshow.jsx's own FADE_OUT_MS (not exported -- kept in sync by
// hand, the same way the component's CSS counterpart is).
const FADE_OUT_MS = 300

const mockMotion = (reduced) =>
  vi.stubGlobal('matchMedia', (query) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener: () => {}, removeEventListener: () => {},
  }))

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); mockMotion(false) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const renderShow = (props = {}) =>
  render(<MemoryRouter><LangProvider><Slideshow slides={slides} interval={5000} {...props} /></LangProvider></MemoryRouter>)

const image = () => document.querySelector('.slideshow-image')

describe('Slideshow', () => {
  it('shows the first slide initially, visible, no fade in progress', () => {
    renderShow()
    expect(screen.getByAltText('porte')).toBeInTheDocument()
    expect(image()).not.toHaveClass('is-hidden')
  })

  // Client request: arrows alone. The counter stays in the DOM for anyone
  // who cannot watch the slide change -- a carousel that never says where
  // you are is disorienting -- but it is visually hidden.
  it('announces the position without showing it', () => {
    const { container } = renderShow()
    const counter = container.querySelector('.slideshow-controls .sr-only')
    expect(counter).toHaveTextContent('1 / 2')
    expect(counter).toHaveAttribute('aria-live', 'polite')
  })

  // One control, one appearance: the homepage and an exhibition's gallery
  // slider both draw their arrows with Chevron.jsx now, at the shared
  // --slider-arrow-size, instead of the ‹ and › characters this one used.
  it('draws its arrows with the shared chevron, not a quotation mark', () => {
    const { container } = renderShow()
    const buttons = container.querySelectorAll('.slideshow-controls button')
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      expect(button.querySelector('svg.chevron')).toBeInTheDocument()
      expect(button.textContent).toBe('')
    }
  })

  it('is always exactly one image element, at rest or mid-fade', () => {
    renderShow()
    expect(screen.getAllByRole('img')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /suivant|next/i }))
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('advances after the interval, fading out first then swapping', () => {
    renderShow()
    act(() => { vi.advanceTimersByTime(5000) })
    // The counter (immediate feedback) already reflects the new target...
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    // ...but the image itself is still the old one, mid fade-out.
    expect(screen.getByAltText('porte')).toBeInTheDocument()
    expect(image()).toHaveClass('is-hidden')

    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
    expect(image()).not.toHaveClass('is-hidden')
  })

  it('defaults to a 5000ms autoplay interval when none is passed', () => {
    render(<MemoryRouter><LangProvider><Slideshow slides={slides} /></LangProvider></MemoryRouter>)
    act(() => { vi.advanceTimersByTime(4999) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('advances on the right arrow key', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderShow()
    await user.keyboard('{ArrowRight}')
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('does not autoplay when reduced motion is preferred', () => {
    mockMotion(true)
    renderShow()
    act(() => { vi.advanceTimersByTime(20000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()
  })

  // Task 27, Part A: articles live at the root now, no /oeuvres/ segment.
  // Client request: the photograph itself links to its work, not only the
  // caption. Both point at the same place -- the conventional
  // image-plus-headline pattern -- so this asserts on both rather than
  // picking one.
  it('links both the photograph and the caption to the article', () => {
    renderShow()
    const links = screen.getAllByRole('link', { name: /porte/i })
    expect(links).toHaveLength(2)
    for (const link of links) expect(link).toHaveAttribute('href', '/porte')
  })

  // The caption below is already a tab stop to this same work, so the
  // photograph must not be a second one leading nowhere new.
  it('keeps the photograph’s link out of the tab order', () => {
    const { container } = renderShow()
    expect(container.querySelector('.slideshow-image-link')).toHaveAttribute('tabindex', '-1')
    expect(container.querySelector('.slide-caption')).not.toHaveAttribute('tabindex')
  })

  // The white either side of a portrait work must stay un-clickable: the
  // section is 100dvh, and a link spanning it would swallow the viewport.
  it('confines the photograph’s link to the photograph', () => {
    const { container } = renderShow()
    const link = container.querySelector('.slideshow-image-link')
    expect(link).toContainElement(container.querySelector('.slideshow-image'))
    expect(link.className).toBe('slideshow-image-link')
  })

  it('updates the caption link to the new target immediately, ahead of the image fade', () => {
    renderShow()
    fireEvent.click(screen.getByRole('button', { name: /suivant|next/i }))
    expect(screen.getByRole('link', { name: 'Châssis' })).toHaveAttribute('href', '/chassis')
  })

  it('passes width and height through to the image so the browser can reserve the box', () => {
    renderShow()
    const img = screen.getByAltText('porte')
    expect(img).toHaveAttribute('width', '2400')
    expect(img).toHaveAttribute('height', '1600')
  })

  it('swaps instantly with no fade class under reduced motion', async () => {
    mockMotion(true)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderShow()
    await user.keyboard('{ArrowRight}')
    expect(screen.queryByAltText('porte')).not.toBeInTheDocument()
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
    expect(image()).not.toHaveClass('is-hidden')
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  // A free-running setInterval keeps counting through a manual navigation, so
  // a viewer who clicks next partway through an interval can be advanced
  // again a moment later by the timer they thought they had just pre-empted.
  // Every slide the viewer chooses must get the full interval.
  it('restarts the autoplay countdown when the viewer navigates manually', () => {
    renderShow()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /suivant|next/i }))
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()

    // t=5000 (from the manual click). The pre-empted timer fires here if it
    // was never cleared, which would bring 'porte' back as the target.
    act(() => { vi.advanceTimersByTime(2000 - FADE_OUT_MS) })
    expect(screen.getByText('2 / 2')).toBeInTheDocument()

    // t=8000, a full fresh interval after the manual move, does advance.
    act(() => { vi.advanceTimersByTime(3000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()
  })

  it('pauses autoplay while the pointer is over the caption and controls', () => {
    renderShow()
    fireEvent.mouseEnter(document.querySelector('.slideshow-chrome'))
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()

    fireEvent.mouseLeave(document.querySelector('.slideshow-chrome'))
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
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
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('does not pause autoplay when the pointer is over the section itself', () => {
    renderShow()
    fireEvent.mouseEnter(document.querySelector('.slideshow'))
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('pauses autoplay on focus and resumes on blur', () => {
    const { container } = renderShow()
    const link = container.querySelector('.slide-caption')
    fireEvent.focus(link)
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()

    fireEvent.blur(link)
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('resets to the first slide when the slide list changes', () => {
    const { rerender } = renderShow()
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
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
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  // Task 35, Part A rewrite: re-entrancy is a property of the shared
  // useCrossfade hook (see its own unit tests), exercised here through the
  // real component to prove the wiring, not the state machine itself again.
  describe('re-entrancy: clicking faster than the transition', () => {
    const next = () => fireEvent.click(screen.getByRole('button', { name: /suivant|next/i }))
    const prev = () => fireEvent.click(screen.getByRole('button', { name: /pr[ée]c[ée]dent|previous/i }))

    it('keeps fading instead of snapping when a click sequence returns to the settled slide mid-transition', () => {
      renderShow({ slides: fourSlides })
      next() // Un -> Deux: fade-out begins
      act(() => { vi.advanceTimersByTime(100) })
      expect(image()).toHaveClass('is-hidden')

      prev() // Deux -> Un: net target is back at the settled anchor while
             // "un" is still mid-fade-out.
      act(() => { vi.advanceTimersByTime(50) })
      // Still fading -- the image is still "un" (never left) and still
      // mid-transition, not an instant, un-faded snap back.
      expect(screen.getByAltText('un')).toBeInTheDocument()
      expect(image()).toHaveClass('is-hidden')

      // It settles back on "un", visible again, once the fade completes.
      act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
      expect(screen.getByAltText('un')).toBeInTheDocument()
      expect(image()).not.toHaveClass('is-hidden')
    })

    it('lands on the slide actually navigated to, not an intermediate one, after a rapid burst', () => {
      renderShow({ slides: fourSlides })
      next() // Un -> Deux
      act(() => { vi.advanceTimersByTime(100) })
      next() // Deux -> Trois (interrupts the still-in-flight Un->Deux fade)
      act(() => { vi.advanceTimersByTime(100) })
      next() // Trois -> Quatre (interrupts again)

      // The counter already reflects the final target immediately.
      expect(screen.getByText('4 / 4')).toBeInTheDocument()

      // Only 300ms total elapsed since the FIRST interrupted fade-out began
      // (100 + 100 = 200 so far) is needed to land on the final target --
      // not a fresh 300ms per click.
      act(() => { vi.advanceTimersByTime(100) })
      expect(screen.queryByAltText('un')).not.toBeInTheDocument()
      expect(screen.queryByAltText('deux')).not.toBeInTheDocument()
      expect(screen.queryByAltText('trois')).not.toBeInTheDocument()
      expect(screen.getByAltText('quatre')).toBeInTheDocument()
      expect(image()).not.toHaveClass('is-hidden')
    })

    it('a subsequent automatic advance still transitions after a rapid burst settles', () => {
      renderShow({ slides: fourSlides })
      next()
      act(() => { vi.advanceTimersByTime(100) })
      next()
      act(() => { vi.advanceTimersByTime(100) })
      next() // net target: "quatre"
      act(() => { vi.advanceTimersByTime(100) })
      expect(screen.getByAltText('quatre')).toBeInTheDocument()
      expect(image()).not.toHaveClass('is-hidden')

      // Manual navigation restarts the autoplay countdown (existing,
      // unrelated behaviour) -- a full fresh interval after settling.
      act(() => { vi.advanceTimersByTime(5000) })
      expect(screen.getByText('1 / 4')).toBeInTheDocument() // wrapped to "un"
      expect(screen.getByAltText('quatre')).toBeInTheDocument() // still mid fade-out
      expect(image()).toHaveClass('is-hidden')

      act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
      expect(screen.getByAltText('un')).toBeInTheDocument()
      expect(image()).not.toHaveClass('is-hidden')
    })
  })
})
