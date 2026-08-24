import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Lightbox } from '../Lightbox.jsx'

const images = [
  { alt: 'Un', variants: { large: { path: 'a.webp', width: 10, height: 10 } } },
  { alt: 'Deux', variants: { large: { path: 'b.webp', width: 10, height: 10 } } },
]

// Task 29, client feedback: role="dialog" aria-modal="true" is a claim
// about behaviour -- these confirm it's now true (focus trap, focus
// restore, click-outside close), via the same shared primitive Modal.jsx
// uses (useDialogA11y.js), not a second implementation.
describe('Lightbox', () => {
  it('moves focus to the close button on open', () => {
    render(<Lightbox images={images} index={0} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Lightbox images={images} index={0} onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a click outside the image and controls', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Lightbox images={images} index={0} onClose={onClose} />)
    // eslint-disable-next-line testing-library/no-node-access -- the lightbox's own background has no accessible role
    await user.click(document.querySelector('.lightbox'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Task 38, part 6 (client feedback: "we shouldnt have arrows if theres a
  // single iamge"). `move` wraps modulo images.length, so on a one-image
  // gallery the arrows were live controls that did nothing observable.
  it('renders both arrows for a multi-image gallery', () => {
    render(<Lightbox images={images} index={0} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeInTheDocument()
  })

  it('renders no arrows for a single-image gallery, keeping only the close control', () => {
    render(<Lightbox images={[images[0]]} index={0} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Précédent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suivant' })).not.toBeInTheDocument()
    // The dialog still has something to hold initial focus, so the focus
    // trap is never empty.
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus()
  })

  // Task 38, part 8 (client request: "a feature once in fullscreen mode, to
  // zoom in more onto an image, in order to see details of it").
  describe('zoom', () => {
    const imageIn = (container) => container.querySelector('.lightbox-image-button img')

    it('starts fitted, with no scale applied', () => {
      const { container } = render(<Lightbox images={images} index={0} onClose={vi.fn()} />)
      expect(imageIn(container).style.transform).toBe('scale(1)')
      expect(screen.getByRole('button', { name: 'Agrandir' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('zooms in on a click, and back out on the next one', async () => {
      const user = userEvent.setup()
      const { container } = render(<Lightbox images={images} index={0} onClose={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: 'Agrandir' }))
      expect(imageIn(container).style.transform).toBe('scale(2.5)')
      const zoomedOut = screen.getByRole('button', { name: 'Réduire' })
      expect(zoomedOut).toHaveAttribute('aria-pressed', 'true')

      await user.click(zoomedOut)
      expect(imageIn(container).style.transform).toBe('scale(1)')
    })

    // The point under the cursor is the point that must stay put as the
    // image scales up around it -- that is what makes a click land on the
    // detail you were looking at rather than on the middle of the frame.
    it('zooms about the point that was clicked', () => {
      const { container } = render(<Lightbox images={images} index={0} onClose={vi.fn()} />)
      const button = screen.getByRole('button', { name: 'Agrandir' })
      // jsdom lays nothing out, so the box has to be supplied.
      button.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 200 })

      fireEvent.click(button, { detail: 1, clientX: 300, clientY: 100 })
      // (300-100)/400 = 50%, (100-50)/200 = 25%
      expect(imageIn(container).style.transformOrigin).toBe('50% 25%')
    })

    it('zooms to the centre when activated from the keyboard, where there is no pointer', () => {
      const { container } = render(<Lightbox images={images} index={0} onClose={vi.fn()} />)
      const button = screen.getByRole('button', { name: 'Agrandir' })
      button.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 200 })

      // detail: 0 is what a browser dispatches for Enter/Space on a focused
      // button, where clientX/clientY are meaningless (0, 0 here).
      fireEvent.click(button, { detail: 0, clientX: 0, clientY: 0 })
      expect(imageIn(container).style.transform).toBe('scale(2.5)')
      expect(imageIn(container).style.transformOrigin).toBe('50% 50%')
    })

    it('pans with the pointer while zoomed, and ignores it while fitted', () => {
      const { container } = render(<Lightbox images={images} index={0} onClose={vi.fn()} />)
      const button = screen.getByRole('button', { name: 'Agrandir' })
      button.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200 })

      fireEvent.mouseMove(button, { clientX: 100, clientY: 100 })
      expect(imageIn(container).style.transformOrigin).toBe('50% 50%')

      fireEvent.click(button, { detail: 1, clientX: 0, clientY: 0 })
      fireEvent.mouseMove(button, { clientX: 300, clientY: 150 })
      expect(imageIn(container).style.transformOrigin).toBe('75% 75%')
    })

    it('steps out of the zoom on Escape before closing, so one Escape never does both', async () => {
      const onClose = vi.fn()
      const user = userEvent.setup()
      const { container } = render(<Lightbox images={images} index={0} onClose={onClose} />)

      await user.click(screen.getByRole('button', { name: 'Agrandir' }))
      await user.keyboard('{Escape}')
      expect(imageIn(container).style.transform).toBe('scale(1)')
      expect(onClose).not.toHaveBeenCalled()

      await user.keyboard('{Escape}')
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    // useDialogA11y lists onCancel among its dependencies, so a cancel
    // callback rebuilt on every zoom change would tear the focus trap down
    // and re-run its initial focus, yanking focus back to the close button
    // mid-interaction.
    it('keeps focus where it is across a zoom, rather than re-running the focus trap', async () => {
      const user = userEvent.setup()
      render(<Lightbox images={images} index={0} onClose={vi.fn()} />)
      const zoomButton = screen.getByRole('button', { name: 'Agrandir' })
      await user.click(zoomButton)
      expect(screen.getByRole('button', { name: 'Réduire' })).toHaveFocus()
    })

    it('starts the next image fitted, not carrying the previous one\'s zoom', async () => {
      const user = userEvent.setup()
      const { container } = render(<Lightbox images={images} index={0} onClose={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'Agrandir' }))
      expect(imageIn(container).style.transform).toBe('scale(2.5)')

      await user.click(screen.getByRole('button', { name: 'Suivant' }))
      expect(screen.getByAltText('Deux')).toBeInTheDocument()
      expect(imageIn(container).style.transform).toBe('scale(1)')
    })
  })

  it('does not close when clicking the image itself', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Lightbox images={images} index={0} onClose={onClose} />)
    await user.click(screen.getByAltText('Un'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('restores focus to whatever opened it once it unmounts', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = render(<Lightbox images={images} index={0} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus()

    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
