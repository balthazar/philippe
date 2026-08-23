import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
