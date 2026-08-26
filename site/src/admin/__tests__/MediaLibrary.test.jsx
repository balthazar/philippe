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

  // The reported case, end to end through the component: the legends all
  // read "Verso n°27, ...", so the two words a person remembers are split by
  // "n°" and a contiguous-substring search found nothing.
  it('finds an image from separate words that are not adjacent in the legend', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      items: [
        { _id: 'v27', filename: 'a.jpg', alt: { fr: 'Verso n°27, Portrait, Anonyme, Malakoff - 2005', en: '' }, variants: {} },
        { _id: 'v3', filename: 'b.jpg', alt: { fr: 'Verso n°3, Etude pour chevaux, Paris - 2005', en: '' }, variants: {} },
      ],
      total: 2,
    })
    render(<MediaLibrary />)
    await waitFor(() => expect(screen.getByLabelText('Rechercher dans les textes alternatifs')).toBeInTheDocument())
    await userEvent.type(screen.getByLabelText('Rechercher dans les textes alternatifs'), 'ver 27')

    // Wait for the NON-match to go: both rows are on screen until the 200ms
    // debounce settles, so waiting for the match to appear proves nothing.
    await waitFor(() => expect(screen.queryByDisplayValue(/Verso n°3,/)).not.toBeInTheDocument())
    expect(screen.getByDisplayValue(/Verso n°27/)).toBeInTheDocument()
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

// "Is 1200px enough?" has no answer on its own: ample for a bibliography
// cover set at 30vw, visibly soft for a photograph a reader can open
// fullscreen and zoom into. The API tags each image with the most demanding
// place it is used (api/src/lib/imageUsage.js) and the library judges it
// against that.
describe('MediaLibrary resolution', () => {
  const withOriginal = (id, width, role, bytes) => ({
    _id: id,
    filename: id,
    alt: { fr: id, en: '' },
    role,
    variants: { original: { width, height: Math.round(width * 0.75), bytes } },
  })

  const LIBRARY = [
    withOriginal('grand', 3000, 'fullscreen', 1024 * 1024 * 2),
    withOriginal('doux', 1000, 'fullscreen', 1024 * 200),
    withOriginal('enorme', 9000, 'reference', 1024 * 1024 * 30),
  ]

  const renderLibrary = async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: LIBRARY, total: 3 })
    render(<MediaLibrary />)
    await waitFor(() => expect(screen.getByLabelText('Filtrer par définition')).toBeInTheDocument())
  }

  const shown = () => screen.getAllByLabelText('Texte alternatif').map((i) => i.value)

  it('shows each image’s own dimensions and weight', async () => {
    await renderLibrary()
    expect(screen.getByText('3000 × 2250')).toBeInTheDocument()
    expect(screen.getByText('2,0 Mo')).toBeInTheDocument()
    expect(screen.getByText('200 Ko')).toBeInTheDocument()
  })

  // A bare "trop petite" is not actionable; the number it is measured against is.
  it('names the width a soft image would need', async () => {
    await renderLibrary()
    expect(screen.getByText('il en faudrait 2400 px sur le grand côté')).toBeInTheDocument()
  })

  it('flags an original far past anything the site can serve', async () => {
    await renderLibrary()
    expect(screen.getByText('bien au-delà des 1400 px affichables')).toBeInTheDocument()
  })

  it('says nothing about an image that is the right size', async () => {
    await renderLibrary()
    // Three images, two warnings: the 3000px fullscreen one is simply fine.
    expect(document.querySelectorAll('.media-library-flag')).toHaveLength(2)
  })

  it('filters to the soft ones, and counts them in the option', async () => {
    await renderLibrary()
    expect(screen.getByRole('option', { name: 'Définition insuffisante (1)' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Filtrer par définition'), 'low')
    expect(shown()).toEqual(['doux'])
    expect(screen.getByText('1 image sur 3')).toBeInTheDocument()
  })

  it('filters to the oversized ones', async () => {
    await renderLibrary()
    expect(screen.getByRole('option', { name: 'Surdimensionnées (1)' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Filtrer par définition'), 'oversized')
    expect(shown()).toEqual(['enorme'])
  })

  it('combines the filter with the text search', async () => {
    await renderLibrary()
    await userEvent.selectOptions(screen.getByLabelText('Filtrer par définition'), 'low')
    await userEvent.type(screen.getByLabelText('Rechercher dans les textes alternatifs'), 'enorme')
    await waitFor(() => expect(screen.getByText('Aucune image ne correspond à cette recherche.')).toBeInTheDocument())
  })
})

// An image used by nothing is the one state the library cannot show any
// other way, and the one that quietly accumulates: leftovers from a merged
// entry, a scan uploaded twice, a file superseded by a better version.
describe('MediaLibrary orphans', () => {
  const img = (id, role) => ({
    _id: id,
    filename: id,
    alt: { fr: id, en: '' },
    role,
    variants: { original: { width: 2600, height: 2000, bytes: 1024 * 500 } },
  })

  const LIBRARY = [img('placee', 'fullscreen'), img('orpheline', 'unused'), img('autre', 'fullscreen')]

  const renderLibrary = async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: LIBRARY, total: 3 })
    render(<MediaLibrary />)
    await waitFor(() => expect(screen.getByLabelText('Filtrer par définition')).toBeInTheDocument())
  }

  const shown = () => screen.getAllByLabelText('Texte alternatif').map((i) => i.value)

  it('says so on the tile', async () => {
    await renderLibrary()
    expect(screen.getByText('utilisée nulle part')).toBeInTheDocument()
  })

  // Burying the one image that needs a decision among five hundred that are
  // fine is how a library accumulates the ones nobody meant to keep.
  it('puts orphans first, leaving the rest in the order they arrived', async () => {
    await renderLibrary()
    expect(shown()).toEqual(['orpheline', 'placee', 'autre'])
  })

  it('filters to them, and counts them in the option', async () => {
    await renderLibrary()
    expect(screen.getByRole('option', { name: 'Utilisées nulle part (1)' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Filtrer par définition'), 'orphan')
    expect(shown()).toEqual(['orpheline'])
  })
})

// Uploading a better scan as a NEW image means hunting down every reference
// by hand, and some photographs are used in three places at once. Replacing
// keeps the document, so everything pointing at it follows.
describe('MediaLibrary replace', () => {
  const IMAGE = {
    _id: 'i1',
    filename: 'i1',
    alt: { fr: 'Porte', en: '' },
    role: 'fullscreen',
    variants: { original: { width: 1000, height: 800, bytes: 1024 * 100 } },
  }
  const file = () => new File(['x'], 'better.jpg', { type: 'image/jpeg' })

  const renderLibrary = async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: [IMAGE], total: 1 })
    render(<MediaLibrary />)
    await waitFor(() => expect(screen.getByText('Remplacer')).toBeInTheDocument())
  }

  it('posts the new file to the image’s own replace endpoint', async () => {
    await renderLibrary()
    const upload = vi.spyOn(api, 'apiUpload').mockResolvedValue({
      ...IMAGE,
      variants: { original: { width: 3000, height: 2400, bytes: 1024 * 900 } },
    })
    await userEvent.upload(document.querySelector('.button-quiet input[type="file"]'), file())
    expect(upload).toHaveBeenCalledWith('/admin/images/i1/replace', expect.any(File))
  })

  // The point of replacing in place: the tile shows the new file's numbers
  // without the page being reloaded, and the id never changed.
  it('shows the new file’s resolution once it lands', async () => {
    await renderLibrary()
    expect(screen.getByText('1000 × 800')).toBeInTheDocument()
    vi.spyOn(api, 'apiUpload').mockResolvedValue({
      ...IMAGE,
      variants: { original: { width: 3000, height: 2400, bytes: 1024 * 900 } },
    })
    await userEvent.upload(document.querySelector('.button-quiet input[type="file"]'), file())
    await waitFor(() => expect(screen.getByText('3000 × 2400')).toBeInTheDocument())
    expect(screen.queryByText('1000 × 800')).not.toBeInTheDocument()
  })

  // The content hash carries a unique index, so the same file already stored
  // under another image collides. Say which problem it is.
  it('explains a duplicate file rather than failing vaguely', async () => {
    await renderLibrary()
    vi.spyOn(api, 'apiUpload').mockRejectedValue(Object.assign(new Error('x'), { status: 409 }))
    await userEvent.upload(document.querySelector('.button-quiet input[type="file"]'), file())
    await waitFor(() =>
      expect(screen.getByText('Ce fichier est déjà dans la médiathèque sous une autre image.')).toBeInTheDocument()
    )
  })
})
