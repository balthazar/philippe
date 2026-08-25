import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GallerySlider } from '../GallerySlider.jsx'

const items = [
  { image: { alt: 'porte', variants: { large: { path: 'a.webp', width: 2400, height: 1600 } } } },
  { image: { alt: 'chassis', variants: { large: { path: 'b.webp', width: 2400, height: 1600 } } } },
]

// Four distinct items, needed for the re-entrancy tests below -- see
// Slideshow.test.jsx's identical fixture for why two is not enough.
const fourItems = [
  { image: { alt: 'un', variants: { large: { path: 'a.webp', width: 2400, height: 1600 } } } },
  { image: { alt: 'deux', variants: { large: { path: 'b.webp', width: 2400, height: 1600 } } } },
  { image: { alt: 'trois', variants: { large: { path: 'c.webp', width: 2400, height: 1600 } } } },
  { image: { alt: 'quatre', variants: { large: { path: 'd.webp', width: 2400, height: 1600 } } } },
]

// Mirrors GallerySlider.jsx's own FADE_OUT_MS (not exported).
const FADE_OUT_MS = 300

const mockMotion = (reduced) =>
  vi.stubGlobal('matchMedia', (query) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener: () => {}, removeEventListener: () => {},
  }))

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); mockMotion(false) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const image = () => document.querySelector('.gallery-slider-image')

describe('GallerySlider', () => {
  it('renders nothing for an empty item list', () => {
    const { container } = render(<GallerySlider items={[]} interval={5000} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the first image initially, visible, no fade in progress', () => {
    render(<GallerySlider items={items} interval={5000} />)
    expect(screen.getByAltText('porte')).toBeInTheDocument()
    expect(image()).not.toHaveClass('is-hidden')
  })

  it('is always exactly one image element, at rest or mid-fade', () => {
    render(<GallerySlider items={items} interval={5000} />)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /suivant/i }))
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('shows no prev/next controls with only one image', () => {
    render(<GallerySlider items={[items[0]]} interval={5000} />)
    expect(screen.queryByRole('button', { name: /suivant|précédent/i })).not.toBeInTheDocument()
  })

  it('advances after the interval, fading out first then swapping', () => {
    render(<GallerySlider items={items} interval={5000} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    expect(screen.getByAltText('porte')).toBeInTheDocument()
    expect(image()).toHaveClass('is-hidden')

    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
    expect(image()).not.toHaveClass('is-hidden')
  })

  it('advances on next click and restarts the countdown (does not double-advance at the original interval mark)', () => {
    render(<GallerySlider items={items} interval={5000} />)
    act(() => { vi.advanceTimersByTime(3000) })
    fireEvent.click(screen.getByRole('button', { name: /suivant/i }))
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()

    // t=5000: the pre-empted timer would land back on 'porte' if not cleared.
    act(() => { vi.advanceTimersByTime(2000 - FADE_OUT_MS) })
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('navigates with the previous button and wraps around', () => {
    render(<GallerySlider items={items} interval={5000} />)
    fireEvent.click(screen.getByRole('button', { name: /précédent/i }))
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('responds to arrow keys only while the slider itself has focus', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <div>
        <input aria-label="elsewhere" />
        <GallerySlider items={items} interval={5000} />
      </div>
    )
    // Focus is elsewhere entirely: arrow keys must not reach the slider.
    act(() => { screen.getByLabelText('elsewhere').focus() })
    await user.keyboard('{ArrowRight}')
    expect(screen.getByAltText('porte')).toBeInTheDocument()

    // Move focus into the slider itself, then the same key does advance it.
    act(() => { screen.getByRole('button', { name: 'porte' }).focus() })
    await user.keyboard('{ArrowRight}')
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('does not autoplay when reduced motion is preferred', () => {
    mockMotion(true)
    render(<GallerySlider items={items} interval={5000} />)
    act(() => { vi.advanceTimersByTime(20000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()
  })

  it('swaps instantly with no fade class under reduced motion', async () => {
    mockMotion(true)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<GallerySlider items={items} interval={5000} />)
    act(() => { screen.getByRole('button', { name: 'porte' }).focus() })
    await user.keyboard('{ArrowRight}')
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
    expect(image()).not.toHaveClass('is-hidden')
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('pauses autoplay while the pointer is over the controls, and resumes on leave', () => {
    const { container } = render(<GallerySlider items={items} interval={5000} />)
    const controls = container.querySelector('.gallery-slider-controls')
    fireEvent.mouseEnter(controls)
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()

    fireEvent.mouseLeave(controls)
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  /*
    The bug this component shipped with. Hover-pause covered the whole
    slider, and on an exhibition page that container is `flex: 1 1 auto`
    inside a full-height column -- a measured 53% of the viewport. A pointer
    resting on the photograph, which is where a pointer rests while looking
    at one, stopped autoplay for as long as it stayed there. Measured in a
    browser before the fix: 12s idle advanced two slides, 13s hovering the
    image advanced none.

    Slideshow.jsx had already learned this and scoped its own hover to a
    small chrome strip; this is the same correction.
  */
  it('keeps advancing while the pointer rests on the photograph itself', () => {
    const { container } = render(<GallerySlider items={items} interval={5000} />)
    fireEvent.mouseEnter(container.querySelector('.gallery-slider'))
    fireEvent.mouseEnter(container.querySelector('.gallery-slider-image'))
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  // Keyboard focus still pauses: someone tabbing to an arrow should not have
  // the slide change under them.
  it('pauses autoplay while a control holds keyboard focus', () => {
    render(<GallerySlider items={items} interval={5000} />)
    // act(), because a raw .focus() is not wrapped the way fireEvent is, and
    // the pause would not have flushed before the timers advance.
    act(() => { screen.getByRole('button', { name: 'Suivant' }).focus() })
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()
  })

  // ...but a mouse click must not latch it off. Chrome focuses the button it
  // clicked and that focus outlives the click, so one click on an arrow used
  // to stop autoplay for good. :focus-visible is the distinction; here the
  // pointer case is simulated by reporting it false, as a browser does.
  it('does not latch autoplay off when a click focuses an arrow', () => {
    render(<GallerySlider items={items} interval={5000} />)
    const next = screen.getByRole('button', { name: 'Suivant' })
    next.matches = () => false
    fireEvent.focus(next)
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('calls onActivate with the current index when the current image is clicked', async () => {
    const onActivate = vi.fn()
    render(<GallerySlider items={items} interval={5000} onActivate={onActivate} />)
    await userEvent.click(screen.getByRole('button', { name: 'porte' }))
    expect(onActivate).toHaveBeenCalledWith(0)
  })

  // Task 35, Part A rewrite: re-entrancy is a property of the shared
  // useCrossfade hook (see its own unit tests, and Slideshow.test.jsx's
  // identical wiring-level tests); GallerySlider and Slideshow now share
  // that one implementation instead of each carrying their own copy of the
  // same fade mechanism.
  describe('re-entrancy: clicking faster than the transition', () => {
    const next = () => fireEvent.click(screen.getByRole('button', { name: /suivant/i }))
    const prev = () => fireEvent.click(screen.getByRole('button', { name: /pr[ée]c[ée]dent/i }))

    it('keeps fading instead of snapping when a click sequence returns to the settled item mid-transition', () => {
      render(<GallerySlider items={fourItems} interval={5000} />)
      next() // Un -> Deux
      act(() => { vi.advanceTimersByTime(100) })
      expect(image()).toHaveClass('is-hidden')

      prev() // Deux -> Un: net target is back at the settled anchor while
             // "un" is still mid-fade-out.
      act(() => { vi.advanceTimersByTime(50) })
      expect(screen.getByAltText('un')).toBeInTheDocument()
      expect(image()).toHaveClass('is-hidden')

      act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
      expect(screen.getByAltText('un')).toBeInTheDocument()
      expect(image()).not.toHaveClass('is-hidden')
    })

    it('lands on the item actually navigated to, not an intermediate one, after a rapid burst', () => {
      render(<GallerySlider items={fourItems} interval={5000} />)
      next() // Un -> Deux
      act(() => { vi.advanceTimersByTime(100) })
      next() // Deux -> Trois: interrupts
      act(() => { vi.advanceTimersByTime(100) })
      next() // Trois -> Quatre: interrupts again

      expect(screen.getByText('4 / 4')).toBeInTheDocument()

      act(() => { vi.advanceTimersByTime(100) })
      expect(screen.queryByAltText('un')).not.toBeInTheDocument()
      expect(screen.queryByAltText('deux')).not.toBeInTheDocument()
      expect(screen.queryByAltText('trois')).not.toBeInTheDocument()
      expect(screen.getByAltText('quatre')).toBeInTheDocument()
    })

    it('a subsequent automatic advance still transitions after a rapid burst settles', () => {
      render(<GallerySlider items={fourItems} interval={5000} />)
      next()
      act(() => { vi.advanceTimersByTime(100) })
      next()
      act(() => { vi.advanceTimersByTime(100) })
      next() // net target: "quatre"
      act(() => { vi.advanceTimersByTime(100) })
      expect(screen.getByAltText('quatre')).toBeInTheDocument()

      act(() => { vi.advanceTimersByTime(5000) })
      expect(screen.getByText('1 / 4')).toBeInTheDocument()
      expect(screen.getByAltText('quatre')).toBeInTheDocument()
      expect(image()).toHaveClass('is-hidden')

      act(() => { vi.advanceTimersByTime(FADE_OUT_MS) })
      expect(screen.getByAltText('un')).toBeInTheDocument()
      expect(image()).not.toHaveClass('is-hidden')
    })
  })
})
