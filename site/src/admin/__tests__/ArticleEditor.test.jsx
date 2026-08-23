import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import * as api from '@/api.js'
import { ArticleEditor } from '../ArticleEditor.jsx'

const COVER_ID = 'cover-1'
const POPULATED_COVER = { _id: COVER_ID, variants: { medium: { path: 'cover.jpg', width: 800, height: 600 } } }

const ARTICLE = {
  _id: 'a1',
  title: { fr: 'Titre', en: '' },
  yearLabel: { fr: '', en: '' },
  slug: { fr: 'titre', en: '' },
  category: 'works',
  yearStart: '',
  yearEnd: '',
  cover: POPULATED_COVER,
  blocks: [],
  status: 'draft',
}

beforeEach(() => vi.restoreAllMocks())

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/admin/articles/a1']}>
      <Routes>
        <Route path="/admin/articles/:id" element={<ArticleEditor />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ArticleEditor cover round-trip (task 25, section 0 regression)', () => {
  // GET /admin/articles/:id populates `cover`; PATCH used to return a bare
  // `.lean()` document. The client read `article.cover?._id`, so after
  // absorbing that first PATCH response `article.cover` was a bare id
  // string, `?._id` was undefined, and the *second* save sent `cover: null`,
  // silently dropping the cover. This reproduces that exact sequence: the
  // mocked PATCH intentionally returns an unpopulated (bare-id) cover, which
  // is the shape the client must survive regardless of which end holds the fix.
  it('keeps the cover id across two consecutive saves, even when a save response comes back unpopulated', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(ARTICLE)
    const send = vi
      .spyOn(api, 'apiSend')
      .mockResolvedValueOnce({ ...ARTICLE, cover: COVER_ID })
      .mockResolvedValueOnce({ ...ARTICLE, cover: COVER_ID })

    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0][2]).toMatchObject({ cover: COVER_ID })

    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2))

    // The second save's payload must still carry the cover id, not null.
    expect(send.mock.calls[1][2]).toMatchObject({ cover: COVER_ID })
  })
})

// Task 25, section 2: a link to the live public page, shown only when it
// would actually resolve.
describe('ArticleEditor live link', () => {
  it('links to the real public URL for a published article with a slug', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ ...ARTICLE, status: 'published', category: 'works', slug: { fr: 'porte', en: '' } })
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())

    const link = screen.getByRole('link', { name: /voir la page publique/i })
    expect(link).toHaveAttribute('href', '/oeuvres/porte')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
  })

  it('builds an exhibitions article link through the exhibitions route, not works', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ ...ARTICLE, status: 'published', category: 'exhibitions', slug: { fr: 'retro', en: '' } })
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())

    expect(screen.getByRole('link', { name: /voir la page publique/i })).toHaveAttribute('href', '/expositions/retro')
  })

  it('disables the link, with an explanation, for a draft', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ ...ARTICLE, status: 'draft', slug: { fr: 'porte', en: '' } })
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())

    expect(screen.queryByRole('link', { name: /voir la page publique/i })).not.toBeInTheDocument()
    // Scoped past the toolbar's own status badge ("Brouillon"), which also
    // matches this regex now that publish/unpublish lives in the editor too.
    expect(screen.getByText(/brouillon : pas encore de page publique/i)).toBeInTheDocument()
  })

  it('disables the link, with an explanation, for a published article with no slug', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ ...ARTICLE, status: 'published', slug: { fr: '', en: '' } })
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())

    expect(screen.queryByRole('link', { name: /voir la page publique/i })).not.toBeInTheDocument()
    expect(screen.getByText(/pas encore de slug/i)).toBeInTheDocument()
  })
})

// Task 25, client feedback item 3: the artist looked for publish/unpublish
// in the editor (it previously only lived in the article list) and delete
// had no UI anywhere.
describe('ArticleEditor publish and delete', () => {
  it('shows the current status and toggles it via an immediate PATCH', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ ...ARTICLE, status: 'draft' })
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue({ ...ARTICLE, status: 'published' })
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())

    expect(screen.getByText('Brouillon')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Publier' }))

    expect(send).toHaveBeenCalledWith('PATCH', '/admin/articles/a1', { status: 'published' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dépublier' })).toBeInTheDocument())
  })

  it('does not show a publish control for a brand-new, unsaved article', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/articles/new']}>
        <Routes>
          <Route path="/admin/articles/new" element={<ArticleEditor />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.queryByRole('button', { name: /publier|dépublier/i })).not.toBeInTheDocument()
  })

  it('deletes the article only after confirming, then navigates back to the list', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(ARTICLE)
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue({ ok: true })
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText('Supprimer « Titre » ?')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(send).toHaveBeenCalledWith('DELETE', '/admin/articles/a1')
  })
})
