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

// Mirrors GallerySlider.jsx's own FADE_OUT_MS + FADE_IN_MS (not exported).
const TRANSITION_MS = 600

const mockMotion = (reduced) =>
  vi.stubGlobal('matchMedia', (query) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener: () => {}, removeEventListener: () => {},
  }))

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); mockMotion(false) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

// Task 32, item 4: same structural guard as Slideshow.test.jsx -- see its
// comment. GallerySlider duplicates Slideshow's fade mechanism on purpose
// (file-level comment in GallerySlider.jsx), so it carries the identical
// fault and the identical fix, verified here the same way.
const mockRAF = () => {
  let queue = []
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => { queue.push(cb); return queue.length }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  return { flushFrame: () => { const cbs = queue; queue = []; cbs.forEach((cb) => cb()) } }
}

describe('GallerySlider', () => {
  it('renders nothing for an empty item list', () => {
    const { container } = render(<GallerySlider items={[]} interval={5000} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the first image initially', () => {
    render(<GallerySlider items={items} interval={5000} />)
    expect(screen.getByAltText('porte')).toBeInTheDocument()
  })

  it('shows no prev/next controls with only one image', () => {
    render(<GallerySlider items={[items[0]]} interval={5000} />)
    expect(screen.queryByRole('button', { name: /suivant|précédent/i })).not.toBeInTheDocument()
  })

  it('advances after the interval', () => {
    render(<GallerySlider items={items} interval={5000} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('advances on next click and restarts the countdown (does not double-advance at the original interval mark)', () => {
    render(<GallerySlider items={items} interval={5000} />)
    act(() => { vi.advanceTimersByTime(3000) })
    fireEvent.click(screen.getByRole('button', { name: /suivant/i }))
    expect(screen.getByAltText('chassis')).toBeInTheDocument()

    // t=5000: the pre-empted timer would land back on 'porte' if not cleared.
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.queryByAltText('porte')).not.toBeInTheDocument()
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('navigates with the previous button and wraps around', () => {
    render(<GallerySlider items={items} interval={5000} />)
    fireEvent.click(screen.getByRole('button', { name: /précédent/i }))
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
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('does not autoplay when reduced motion is preferred', () => {
    mockMotion(true)
    render(<GallerySlider items={items} interval={5000} />)
    act(() => { vi.advanceTimersByTime(20000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()
  })

  it('pauses autoplay while the pointer is over the slider', () => {
    const { container } = render(<GallerySlider items={items} interval={5000} />)
    fireEvent.mouseEnter(container.querySelector('.gallery-slider'))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()

    fireEvent.mouseLeave(container.querySelector('.gallery-slider'))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('calls onActivate with the current index when the current image is clicked', async () => {
    const onActivate = vi.fn()
    render(<GallerySlider items={items} interval={5000} onActivate={onActivate} />)
    await userEvent.click(screen.getByRole('button', { name: 'porte' }))
    expect(onActivate).toHaveBeenCalledWith(0)
  })

  it('waits for two animation frames before flipping the fade to its final state', () => {
    const { flushFrame } = mockRAF()
    render(<GallerySlider items={items} interval={5000} />)
    fireEvent.click(screen.getByRole('button', { name: /suivant/i }))

    const outgoing = () => document.querySelector('.gallery-slider-image--outgoing')
    expect(outgoing()).not.toHaveClass('is-leaving')

    act(() => { flushFrame() })
    expect(outgoing()).not.toHaveClass('is-leaving')

    act(() => { flushFrame() })
    expect(outgoing()).toHaveClass('is-leaving')
  })

  it('renders both the outgoing and incoming images mid-transition, and only the incoming one once it completes', () => {
    render(<GallerySlider items={items} interval={5000} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()
    expect(screen.getByAltText('chassis')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.queryByAltText('porte')).not.toBeInTheDocument()
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  // Task 33, section 4: same re-entrancy fix as Slideshow.jsx (this file
  // deliberately duplicates rather than shares its fade mechanism -- see
  // the file-level comment in GallerySlider.jsx), verified the same way.
  describe('re-entrancy: clicking faster than the transition (Task 33, section 4)', () => {
    const next = () => fireEvent.click(screen.getByRole('button', { name: /suivant/i }))
    const prev = () => fireEvent.click(screen.getByRole('button', { name: /pr[ée]c[ée]dent/i }))

    // Task 34, section 2: same fault as Slideshow.jsx's identical guard --
    // see that file's test for the full account. GallerySlider duplicates
    // the mechanism on purpose, so it carries the identical bug and fix.
    it('keeps fading instead of snapping when a click sequence returns to the settled item mid-transition', () => {
      render(<GallerySlider items={fourItems} interval={5000} />)
      next() // Un -> Deux: fresh transition, outgoing becomes "un"
      act(() => { vi.advanceTimersByTime(100) })

      prev() // Deux -> Un: net target is back at the settled anchor while
             // "un" is still mid-fade-out.
      act(() => { vi.advanceTimersByTime(50) })

      expect(screen.getAllByAltText('un')).toHaveLength(2)
      const outgoingNode = document.querySelector('.gallery-slider-image--outgoing')
      expect(outgoingNode).not.toBeNull()
      expect(outgoingNode).toHaveAttribute('alt', 'un')
      const incoming = screen.getAllByAltText('un').find((n) => n !== outgoingNode)
      expect(incoming.className).toContain('gallery-slider-image--entering')
      expect(incoming.className).not.toContain('is-entered')

      act(() => { vi.advanceTimersByTime(TRANSITION_MS) })
      expect(screen.getAllByAltText('un')).toHaveLength(1)
    })

    it('lands on the item actually navigated to, not an intermediate one, after a rapid burst', () => {
      render(<GallerySlider items={fourItems} interval={5000} />)
      next() // Un -> Deux
      act(() => { vi.advanceTimersByTime(100) })
      next() // Deux -> Trois: interrupts
      act(() => { vi.advanceTimersByTime(100) })
      next() // Trois -> Quatre: interrupts again

      act(() => { vi.advanceTimersByTime(TRANSITION_MS) })
      expect(screen.queryByAltText('un')).not.toBeInTheDocument()
      expect(screen.queryByAltText('deux')).not.toBeInTheDocument()
      expect(screen.queryByAltText('trois')).not.toBeInTheDocument()
      expect(screen.getByAltText('quatre')).toBeInTheDocument()
    })

    it('keeps the same item as the outgoing (fading-out) node throughout a rapid burst', () => {
      render(<GallerySlider items={fourItems} interval={5000} />)
      next() // Un -> Deux
      act(() => { vi.advanceTimersByTime(50) })
      expect(screen.getByAltText('un').className).toContain('gallery-slider-image--outgoing')

      next() // Deux -> Trois: interrupts
      act(() => { vi.advanceTimersByTime(50) })
      expect(screen.getByAltText('un').className).toContain('gallery-slider-image--outgoing')
      expect(screen.queryByAltText('deux')).not.toBeInTheDocument()

      next() // Trois -> Quatre: interrupts again
      act(() => { vi.advanceTimersByTime(50) })
      expect(screen.getByAltText('un').className).toContain('gallery-slider-image--outgoing')
      expect(screen.queryByAltText('trois')).not.toBeInTheDocument()
    })

    it('gives every click its own fresh entering state, never pre-entered on mount', () => {
      render(<GallerySlider items={fourItems} interval={5000} />)
      next() // Un -> Deux
      act(() => { vi.advanceTimersByTime(400) }) // past the outgoing fade, mid the incoming one
      next() // Deux -> Trois: interrupts while `leaving` is already true

      const incoming = screen.getByAltText('trois')
      expect(incoming.className).toContain('gallery-slider-image--entering')
      expect(incoming.className).not.toContain('is-entered')
    })

    it('a subsequent automatic advance still transitions after a rapid burst settles', () => {
      render(<GallerySlider items={fourItems} interval={5000} />)
      next()
      act(() => { vi.advanceTimersByTime(100) })
      next()
      act(() => { vi.advanceTimersByTime(100) })
      next() // lands on "quatre"
      act(() => { vi.advanceTimersByTime(TRANSITION_MS) })
      expect(screen.getByAltText('quatre')).toBeInTheDocument()

      act(() => { vi.advanceTimersByTime(5000) })
      expect(screen.getByAltText('quatre')).toBeInTheDocument()
      expect(screen.getByAltText('un')).toBeInTheDocument()

      act(() => { vi.advanceTimersByTime(TRANSITION_MS) })
      expect(screen.queryByAltText('quatre')).not.toBeInTheDocument()
      expect(screen.getByAltText('un')).toBeInTheDocument()
    })
  })
})
