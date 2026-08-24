import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
