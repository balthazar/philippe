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

// Mirrors Slideshow.jsx's own FADE_OUT_MS + FADE_IN_MS (not exported --
// kept in sync by hand, the same way the component's own file comment
// already says its CSS counterparts are).
const TRANSITION_MS = 600

const mockMotion = (reduced) =>
  vi.stubGlobal('matchMedia', (query) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener: () => {}, removeEventListener: () => {},
  }))

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); mockMotion(false) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const renderShow = (props = {}) =>
  render(<MemoryRouter><LangProvider><Slideshow slides={slides} interval={5000} {...props} /></LangProvider></MemoryRouter>)

// Task 32, item 4: a real browser paint cannot be observed in jsdom at all
// (no layout, no paint pipeline -- see Slideshow.jsx's own comment on the
// fix), but the STRUCTURAL fact that the fade waits for two animation
// frames before flipping its final class, rather than one, is exactly what
// makes that fix work and is fully deterministic to assert. This installs a
// manually-driven requestAnimationFrame in place of fake-timers' own
// (time-based) polyfill so each frame can be flushed one at a time.
const mockRAF = () => {
  let queue = []
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => { queue.push(cb); return queue.length }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  return { flushFrame: () => { const cbs = queue; queue = []; cbs.forEach((cb) => cb()) } }
}

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

  // Task 27, Part A: articles live at the root now, no /oeuvres/ segment.
  it('links the current slide to its article', () => {
    renderShow()
    expect(screen.getByRole('link', { name: /porte/i })).toHaveAttribute('href', '/porte')
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

  // The bug this guards: a single requestAnimationFrame loses the race when
  // the update comes from a click handler, because a rAF scheduled from
  // inside a click can still fire before that same frame paints -- so the
  // freshly-mounted images' final classes committed with nothing painted in
  // between for the CSS transition to animate from, and arrow navigation
  // swapped instantly with no visible fade. Waiting for a SECOND frame is
  // what guarantees a real paint lands in between regardless of what
  // triggered the update.
  it('waits for two animation frames before flipping the fade to its final state', () => {
    const { flushFrame } = mockRAF()
    renderShow()
    fireEvent.click(screen.getByRole('button', { name: /suivant|next/i }))

    const outgoing = () => document.querySelector('.slideshow-image--outgoing')
    expect(outgoing()).not.toHaveClass('is-leaving')

    act(() => { flushFrame() })
    // After exactly one frame: still not flipped. Flipping here is the bug
    // -- it is indistinguishable from "already painted" in a browser that
    // hasn't actually painted yet.
    expect(outgoing()).not.toHaveClass('is-leaving')

    act(() => { flushFrame() })
    // Only the second frame drives the actual class flip.
    expect(outgoing()).toHaveClass('is-leaving')
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

  // Task 33, section 4: re-entrancy. Client report: fades correctly once,
  // then several quick clicks make it instant, then it recovers "at some
  // point". A SINGLE-click test (every test above this point) passes
  // against this bug -- it only ever exercises one transition at a time --
  // which is why it survived a previous fix (the click-vs-timer race, a
  // different bug, still guarded above). These click several times faster
  // than the 600ms transition.
  //
  // jsdom has no paint pipeline, so it cannot see a real fade -- these pin
  // the STATE MACHINE (which node is mounted, which classes it carries),
  // not the actual on-screen animation. That part is browser-verified
  // separately (see the task report).
  describe('re-entrancy: clicking faster than the transition (Task 33, section 4)', () => {
    const next = () => fireEvent.click(screen.getByRole('button', { name: /suivant|next/i }))
    const prev = () => fireEvent.click(screen.getByRole('button', { name: /pr[ée]c[ée]dent|previous/i }))

    // Task 34, section 2: the fix above still leaves one interrupting case
    // broken -- alternating direction so the click sequence's NET target
    // lands back on the already-settled slide while the outgoing fade is
    // still in flight (e.g. next, then prev, inside the 600ms window). The
    // guard above treats `prevSettled === currentSlide` as "nothing to
    // animate" unconditionally, which is right at rest but wrong mid-flight:
    // it yanks out the live fading-out node and remounts the settled slide
    // with no transition classes at all -- an instant snap, not a fade.
    it('keeps fading instead of snapping when a click sequence returns to the settled slide mid-transition', () => {
      renderShow({ slides: fourSlides })
      next() // Un -> Deux: fresh transition, outgoing becomes "un"
      act(() => { vi.advanceTimersByTime(100) })

      prev() // Deux -> Un: net target is back at the settled anchor while
             // "un" is still mid-fade-out.
      act(() => { vi.advanceTimersByTime(50) })

      // Both halves of the fade-through-white must still be live: the
      // settled "un" continuing its fade-out (outgoing), and a freshly
      // (re)mounted "un" fading back in (current/entering) -- never a
      // single, already-settled "un" with no transition classes, which is
      // what an instant snap looks like.
      expect(screen.getAllByAltText('un')).toHaveLength(2)
      const outgoingNode = document.querySelector('.slideshow-image--outgoing')
      expect(outgoingNode).not.toBeNull()
      expect(outgoingNode).toHaveAttribute('alt', 'un')
      const incoming = screen.getAllByAltText('un').find((n) => n !== outgoingNode)
      expect(incoming.className).toContain('slideshow-image--entering')
      expect(incoming.className).not.toContain('is-entered')

      // It does eventually settle back on a single "un", nothing stuck
      // mid-fade forever.
      act(() => { vi.advanceTimersByTime(TRANSITION_MS) })
      expect(screen.getAllByAltText('un')).toHaveLength(1)
    })

    it('lands on the slide actually navigated to, not an intermediate one, after a rapid burst', () => {
      renderShow({ slides: fourSlides })
      next() // Un -> Deux
      act(() => { vi.advanceTimersByTime(100) })
      next() // Deux -> Trois (interrupts the still-in-flight Un->Deux fade)
      act(() => { vi.advanceTimersByTime(100) })
      next() // Trois -> Quatre (interrupts again)

      // Let the final transition actually finish.
      act(() => { vi.advanceTimersByTime(TRANSITION_MS) })
      expect(screen.queryByAltText('un')).not.toBeInTheDocument()
      expect(screen.queryByAltText('deux')).not.toBeInTheDocument()
      expect(screen.queryByAltText('trois')).not.toBeInTheDocument()
      expect(screen.getByAltText('quatre')).toBeInTheDocument()
      expect(screen.getByText('4 / 4')).toBeInTheDocument()
    })

    // The core of the fix: the outgoing (fading-out) node must be the last
    // SETTLED slide throughout an entire rapid burst, never an intermediate
    // one that was itself interrupted mid-fade -- that stability is what
    // lets its live opacity keep interpolating instead of snapping. If an
    // intermediate slide became the outgoing node even briefly, this fails.
    it('keeps the same slide as the outgoing (fading-out) node throughout a rapid burst', () => {
      renderShow({ slides: fourSlides })
      next() // Un -> Deux: outgoing becomes "un"
      act(() => { vi.advanceTimersByTime(50) })
      expect(screen.getByAltText('un').className).toContain('slideshow-image--outgoing')

      next() // Deux -> Trois: an interruption
      act(() => { vi.advanceTimersByTime(50) })
      // Still "un" -- never remounted as "deux", and not un-mounted either.
      expect(screen.getByAltText('un').className).toContain('slideshow-image--outgoing')
      expect(screen.queryByAltText('deux')).not.toBeInTheDocument()

      next() // Trois -> Quatre: another interruption
      act(() => { vi.advanceTimersByTime(50) })
      expect(screen.getByAltText('un').className).toContain('slideshow-image--outgoing')
      expect(screen.queryByAltText('trois')).not.toBeInTheDocument()
    })

    // Something must visibly animate on every click, not just the last one
    // -- an unresponsive-looking arrow is exactly the failure the client
    // reported. Pinned here as: every click's own target slide mounts as
    // the incoming image with its OWN fresh `entering` state (never
    // `is-entered` on its very first paint, which would mean no transition
    // to animate at all -- see the file comment on why `entered` is its own
    // piece of state, independent of the outgoing image's `leaving`).
    it('gives every click its own fresh entering state, never pre-entered on mount', () => {
      renderShow({ slides: fourSlides })
      next() // Un -> Deux
      act(() => { vi.advanceTimersByTime(400) }) // past the outgoing fade, mid the incoming one
      next() // Deux -> Trois: interrupts while `leaving` (outgoing's own flag) is already true

      const incoming = screen.getByAltText('trois')
      expect(incoming.className).toContain('slideshow-image--entering')
      expect(incoming.className).not.toContain('is-entered')
    })

    it('a subsequent automatic advance still transitions after a rapid burst settles', () => {
      renderShow({ slides: fourSlides })
      next()
      act(() => { vi.advanceTimersByTime(100) })
      next()
      act(() => { vi.advanceTimersByTime(100) })
      next() // lands on "quatre"
      act(() => { vi.advanceTimersByTime(TRANSITION_MS) })
      expect(screen.getByAltText('quatre')).toBeInTheDocument()

      // Manual navigation restarts the autoplay countdown (existing,
      // unrelated behaviour) -- a full fresh interval after settling.
      act(() => { vi.advanceTimersByTime(5000) })
      // Now on "un" (wrapped), mid-transition: both must be mounted, proving
      // the automatic advance actually transitions rather than snapping or
      // silently failing to advance at all.
      expect(screen.getByAltText('quatre')).toBeInTheDocument()
      expect(screen.getByAltText('un')).toBeInTheDocument()

      act(() => { vi.advanceTimersByTime(TRANSITION_MS) })
      expect(screen.queryByAltText('quatre')).not.toBeInTheDocument()
      expect(screen.getByAltText('un')).toBeInTheDocument()
    })
  })
})
