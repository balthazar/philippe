import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GallerySlider } from '../GallerySlider.jsx'

const items = [
  { image: { alt: 'porte', variants: { large: { path: 'a.webp', width: 2400, height: 1600 } } } },
  { image: { alt: 'chassis', variants: { large: { path: 'b.webp', width: 2400, height: 1600 } } } },
]

const mockMotion = (reduced) =>
  vi.stubGlobal('matchMedia', (query) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener: () => {}, removeEventListener: () => {},
  }))

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); mockMotion(false) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

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

  it('renders both the outgoing and incoming images mid-transition, and only the incoming one once it completes', () => {
    render(<GallerySlider items={items} interval={5000} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()
    expect(screen.getByAltText('chassis')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.queryByAltText('porte')).not.toBeInTheDocument()
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })
})
