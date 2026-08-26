import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as api from '@/api.js'
import { ImagePicker } from '../ImagePicker.jsx'

const IMAGE = { _id: 'i1', alt: { fr: 'Porte' }, variants: { thumb: { path: 't.jpg' } } }

beforeEach(() => vi.restoreAllMocks())

// Regression guard: single-image mode (used by the cover-less "image" block
// and, before task 27, the cover picker) is untouched by gridStyle's grid
// branch in ImagePicker.jsx.
describe('ImagePicker single mode (unaffected by gridStyle)', () => {
  it('selects an image and calls onChange with it, closing the library', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: [IMAGE] })
    const onChange = vi.fn()
    render(<ImagePicker value={null} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /choisir une image/i }))
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('img').closest('button'))
    expect(onChange).toHaveBeenCalledWith(IMAGE)
  })
})

// Task 27, client feedback item 5.
describe('ImagePicker gridStyle (the gallery block editor)', () => {
  it('renders each selected image as a tile plus a trailing "+" tile, with no separate add button', () => {
    render(<ImagePicker multiple gridStyle value={[IMAGE]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Ajouter une image' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /choisir une image/i })).not.toBeInTheDocument()
  })

  it('calls renderExtra with each image and its index, and renders the result in the tile', () => {
    const renderExtra = vi.fn((image) => <span>extra-{image._id}</span>)
    render(<ImagePicker multiple gridStyle value={[IMAGE]} onChange={() => {}} renderExtra={renderExtra} />)
    expect(renderExtra).toHaveBeenCalledWith(IMAGE, 0)
    expect(screen.getByText('extra-i1')).toBeInTheDocument()
  })

  it('removes an image via its own trash button', async () => {
    const onChange = vi.fn()
    render(<ImagePicker multiple gridStyle value={[IMAGE]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /retirer/i }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('opens the library when the "+" tile is clicked', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: [] })
    render(<ImagePicker multiple gridStyle value={[]} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une image' }))
    expect(screen.getByRole('button', { name: 'Fermer la médiathèque' })).toBeInTheDocument()
  })
})

// Until this existed, the only way to place a photograph in a gallery was to
// have added it in the right order to begin with: anything added later could
// only land at the end. That is not cosmetic. A gallery's order is what pairs
// each photograph with its entry in the article's list of legends, so a
// photograph stuck at the end wears the wrong caption. It happened, to the
// Yves Tanguy verso n°27 added years after the rest of the Versos series.
describe('ImagePicker gridStyle reordering', () => {
  const A = { _id: 'a', alt: { fr: 'Un' }, variants: { thumb: { path: 'a.jpg' } } }
  const B = { _id: 'b', alt: { fr: 'Deux' }, variants: { thumb: { path: 'b.jpg' } } }
  const C = { _id: 'c', alt: { fr: 'Trois' }, variants: { thumb: { path: 'c.jpg' } } }

  const tiles = () => [...document.querySelectorAll('.gallery-editor-tile')].filter((li) => li.querySelector('img'))

  // Every image in this archive had an empty alt until the legends were
  // stamped, so naming these buttons after the alt gave every one of them on
  // the page the identical accessible name.
  it('names each move button by position, which is unique and is what the tile shows', () => {
    render(<ImagePicker multiple gridStyle value={[{ _id: 'x', alt: { fr: '' }, variants: {} }, { _id: 'y', alt: { fr: '' }, variants: {} }]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Déplacer l’image 1 vers la droite' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Déplacer l’image 2 vers la gauche' })).toBeInTheDocument()
  })

  it('numbers every tile with its position in the gallery', () => {
    render(<ImagePicker multiple gridStyle value={[A, B, C]} onChange={() => {}} />)
    expect([...document.querySelectorAll('.gallery-editor-tile-position')].map((el) => el.textContent)).toEqual(['1', '2', '3'])
  })

  it('moves an image one place left', async () => {
    const onChange = vi.fn()
    render(<ImagePicker multiple gridStyle value={[A, B, C]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer l’image 3 vers la gauche' }))
    expect(onChange).toHaveBeenCalledWith([A, C, B])
  })

  it('moves an image one place right', async () => {
    const onChange = vi.fn()
    render(<ImagePicker multiple gridStyle value={[A, B, C]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer l’image 1 vers la droite' }))
    expect(onChange).toHaveBeenCalledWith([B, A, C])
  })

  // Native drag-and-drop has no keyboard path at all, so the buttons are the
  // guarantee, not the shortcut. They must never be a dead end at the edges.
  it('disables the button that would move an image off either end', () => {
    render(<ImagePicker multiple gridStyle value={[A, B, C]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Déplacer l’image 1 vers la gauche' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Déplacer l’image 3 vers la droite' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Déplacer l’image 2 vers la gauche' })).toBeEnabled()
  })

  // The real case: the photograph added last belongs at position 27 of 62.
  it('drops a dragged image onto the position it was dropped on', () => {
    const onChange = vi.fn()
    render(<ImagePicker multiple gridStyle value={[A, B, C]} onChange={onChange} />)
    const [first, , third] = tiles()
    fireEvent.dragStart(third)
    fireEvent.dragOver(first)
    fireEvent.drop(first)
    expect(onChange).toHaveBeenCalledWith([C, A, B])
  })

  it('shows which edge a dragged image will land on', () => {
    render(<ImagePicker multiple gridStyle value={[A, B, C]} onChange={() => {}} />)
    const [first, , third] = tiles()
    fireEvent.dragStart(first)
    fireEvent.dragOver(third)
    expect(first).toHaveClass('is-dragging')
    // Dragging forward lands the tile after the one hovered.
    expect(third).toHaveClass('drop-indicator-after')
  })

  it('does nothing when an image is dropped on itself', () => {
    const onChange = vi.fn()
    render(<ImagePicker multiple gridStyle value={[A, B, C]} onChange={onChange} />)
    const [first] = tiles()
    fireEvent.dragStart(first)
    fireEvent.drop(first)
    expect(onChange).not.toHaveBeenCalled()
  })
})

// The legend field, added under each tile so a caption can be fixed while
// laying out a gallery instead of in /admin/media.
describe('ImagePicker gridStyle renderBelow', () => {
  it('renders the caller’s content under each tile', () => {
    render(
      <ImagePicker
        multiple
        gridStyle
        value={[IMAGE, { ...IMAGE, _id: 'i2' }]}
        onChange={() => {}}
        renderBelow={(image) => <input aria-label={`legend ${image._id}`} readOnly value="" />}
      />
    )
    expect(screen.getByLabelText('legend i1')).toBeInTheDocument()
    expect(screen.getByLabelText('legend i2')).toBeInTheDocument()
  })

  /*
    The tile is draggable as a whole, which was safe only while it held no
    text field. Selecting text inside the legend would otherwise drag the
    tile instead of selecting, so a drag beginning inside the legend is
    refused. Everywhere else on the tile still drags.
  */
  it('refuses a drag that starts inside the legend field', () => {
    const { container } = render(
      <ImagePicker
        multiple
        gridStyle
        value={[IMAGE, { ...IMAGE, _id: 'i2' }]}
        onChange={() => {}}
        renderBelow={(image) => (
          <div className="gallery-editor-tile-legend">
            <input aria-label={`legend ${image._id}`} readOnly value="" />
          </div>
        )}
      />
    )
    const tile = container.querySelector('.gallery-editor-tile')
    fireEvent.dragStart(screen.getByLabelText('legend i1'))
    expect(tile).not.toHaveClass('is-dragging')

    fireEvent.dragStart(tile)
    expect(tile).toHaveClass('is-dragging')
  })
})
