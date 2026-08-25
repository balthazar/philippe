import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as api from '@/api.js'
import { MediaLibrary } from '../MediaLibrary.jsx'

const IMAGES = [{ _id: 'i1', filename: 'porte.jpg', alt: { fr: 'Porte', en: '' }, variants: {} }]

beforeEach(() => vi.restoreAllMocks())

// Task 25, client feedback item 3: one unconfirmed click here used to also
// destroy the archival original under _originals/, the same gap fixed on
// article delete. Confirms the in-page prompt gates the actual DELETE call.
describe('MediaLibrary delete confirmation', () => {
  it('does not call the DELETE endpoint on the first click', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: IMAGES, total: 1 })
    const send = vi.spyOn(api, 'apiSend')
    render(<MediaLibrary />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText('Supprimer « Porte » ?')).toBeInTheDocument()
  })

  it('calls DELETE only after confirming, and removes the image from the grid', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: IMAGES, total: 1 })
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue({ ok: true })
    render(<MediaLibrary />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(send).toHaveBeenCalledWith('DELETE', '/admin/images/i1')
    await waitFor(() => expect(screen.queryByText('Porte')).not.toBeInTheDocument())
  })
})

// Five hundred images, one field per image, and no way to reach the one you
// mean except by scrolling. The filter matches on alt text (the "Texte
// alternatif" field), which since the legends were stamped is where each
// photograph's own title lives.
describe('MediaLibrary search', () => {
  const LIBRARY = [
    { _id: 'i1', filename: 'a.jpg', alt: { fr: 'Cuvette de développement n°1, Paris', en: '' }, variants: {} },
    { _id: 'i2', filename: 'b.jpg', alt: { fr: 'Écritoire n°93, Bibliothèque Mazarine', en: '' }, variants: {} },
    { _id: 'i3', filename: 'c.jpg', alt: { fr: '', en: 'Push button n°1' }, variants: {} },
  ]

  const renderLibrary = async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: LIBRARY, total: 3 })
    render(<MediaLibrary />)
    await waitFor(() => expect(screen.getByLabelText('Rechercher dans les textes alternatifs')).toBeInTheDocument())
  }

  const altValues = () =>
    screen.getAllByLabelText('Texte alternatif').map((input) => input.value)

  it('shows everything before anything is typed', async () => {
    await renderLibrary()
    expect(altValues()).toHaveLength(3)
    expect(screen.getByText('3 images')).toBeInTheDocument()
  })

  it('filters to the matching images, and counts them', async () => {
    await renderLibrary()
    await userEvent.type(screen.getByLabelText('Rechercher dans les textes alternatifs'), 'cuvette')
    await waitFor(() => expect(altValues()).toEqual(['Cuvette de développement n°1, Paris']))
    expect(screen.getByText('1 image sur 3')).toBeInTheDocument()
  })

  // Nearly every legend in this archive carries an accent. A search that made
  // the artist reproduce them exactly is a search he stops using.
  it('ignores accents and case', async () => {
    await renderLibrary()
    await userEvent.type(screen.getByLabelText('Rechercher dans les textes alternatifs'), 'ECRITOIRE')
    await waitFor(() => expect(altValues()).toEqual(['Écritoire n°93, Bibliothèque Mazarine']))
  })

  it('searches the English alt too, so it does not matter which language holds the word', async () => {
    await renderLibrary()
    await userEvent.type(screen.getByLabelText('Rechercher dans les textes alternatifs'), 'push button')
    await waitFor(() => expect(altValues()).toEqual(['']))
  })

  // An empty grid on its own reads as a page that failed to load.
  it('says so when nothing matches', async () => {
    await renderLibrary()
    await userEvent.type(screen.getByLabelText('Rechercher dans les textes alternatifs'), 'zzz')
    await waitFor(() => expect(screen.getByText('Aucune image ne correspond à cette recherche.')).toBeInTheDocument())
    expect(screen.getByText('0 image sur 3')).toBeInTheDocument()
  })

  it('restores the full list when the search is cleared', async () => {
    await renderLibrary()
    const search = screen.getByLabelText('Rechercher dans les textes alternatifs')
    await userEvent.type(search, 'cuvette')
    await waitFor(() => expect(altValues()).toHaveLength(1))
    await userEvent.clear(search)
    await waitFor(() => expect(altValues()).toHaveLength(3))
  })

  // The debounce is the point: without it every keystroke re-renders several
  // hundred thumbnails. The field itself must stay immediate, though -- an
  // input driven by the debounced value drops characters.
  it('keeps the field responsive while the filtering trails behind', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await renderLibrary()
      const search = screen.getByLabelText('Rechercher dans les textes alternatifs')
      await userEvent.type(search, 'cuvette')
      expect(search).toHaveValue('cuvette')
      // Not yet filtered: the debounce has not elapsed.
      expect(altValues()).toHaveLength(3)
      await vi.advanceTimersByTimeAsync(250)
      await waitFor(() => expect(altValues()).toHaveLength(1))
    } finally {
      vi.useRealTimers()
    }
  })
})
