import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
// would actually resolve. Task 27, Part A: articles live at the root now,
// so this link carries no section segment regardless of category.
describe('ArticleEditor live link', () => {
  it('links to the real public URL for a published article with a slug', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ ...ARTICLE, status: 'published', category: 'works', slug: { fr: 'porte', en: '' } })
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())

    const link = screen.getByRole('link', { name: /voir la page publique/i })
    expect(link).toHaveAttribute('href', '/porte')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
  })

  it('links an exhibitions article to the root too, the same as a work', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ ...ARTICLE, status: 'published', category: 'exhibitions', slug: { fr: 'retro', en: '' } })
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())

    expect(screen.getByRole('link', { name: /voir la page publique/i })).toHaveAttribute('href', '/retro')
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
// Task 27, Part B1: the migration added `subtitle` and it renders on the
// public page, but the editor never got an input for it.
describe('ArticleEditor subtitle field', () => {
  it('shows a subtitle input beside Titre and Slug, editable and included on save', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ ...ARTICLE, subtitle: { fr: 'Ancien sous-titre', en: '' } })
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue(ARTICLE)
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Ancien sous-titre')).toBeInTheDocument())

    await userEvent.clear(screen.getByLabelText('Sous-titre'))
    await userEvent.type(screen.getByLabelText('Sous-titre'), 'Nouveau sous-titre')
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

    expect(send.mock.calls[0][2]).toMatchObject({ subtitle: { fr: 'Nouveau sous-titre', en: '' } })
  })
})

// Task 27, Part B3: the client's two per-image gallery toggles ("Cover",
// "Hidden from grid") replace the separate cover picker -- but only after
// the migration folded every stray cover into its own gallery, which it now
// has (verified against the real archive: 0 articles left without a cover
// among their gallery items). The picker itself is gone from the form.
describe('ArticleEditor has no separate cover picker any more', () => {
  it('does not render an "Image de couverture" fieldset or its own image-choosing button', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(ARTICLE)
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())
    expect(screen.queryByText('Image de couverture')).not.toBeInTheDocument()
  })
})

// Task 27, Part B3: the gallery (inside Contenu) is the substance of a work,
// so it moves up to sit directly after "Année de début (tri)"/"Année de fin
// (tri)" rather than further down the form.
// Client feedback: the toolbar's own title duplicated Titre (left) and the
// preview's own <h1> (right); dropped, and the freed line now carries the
// FR/EN toggle beside the publish control, the two controls that act on the
// whole article.
describe('ArticleEditor toolbar', () => {
  it('has no title heading of its own in the toolbar', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(ARTICLE)
    const { container } = renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())
    const toolbar = container.querySelector('.admin-toolbar')
    expect(within(toolbar).queryByRole('heading')).not.toBeInTheDocument()
  })

  it('puts the FR/EN toggle on the same toolbar row as the publish control', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ ...ARTICLE, status: 'draft' })
    const { container } = renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())
    const toolbar = container.querySelector('.admin-toolbar')
    expect(within(toolbar).getByRole('button', { name: 'Français' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Publier' })).toBeInTheDocument()
  })
})

describe('ArticleEditor field order', () => {
  it('places the content/gallery section directly after the sort-year fields', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(ARTICLE)
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())
    const yearEnd = screen.getByLabelText('Année de fin (tri)')
    const contentLegend = screen.getByText('Contenu')
    // eslint-disable-next-line no-bitwise
    expect(yearEnd.compareDocumentPosition(contentLegend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

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

// Task 28, client feedback: (a) a count of pending edits beside
// Enregistrer, (b) leaving the page while any exist gets blocked.
describe('ArticleEditor unsaved changes', () => {
  it('shows no count when nothing has changed since load', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(ARTICLE)
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())
    expect(screen.queryByText(/non enregistrée/)).not.toBeInTheDocument()
  })

  it('counts an edited field and updates as more fields change', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(ARTICLE)
    renderEditor()
    const titleInput = await screen.findByDisplayValue('Titre')

    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Nouveau titre')
    expect(await screen.findByText('1 modification non enregistrée')).toBeInTheDocument()

    const slugInput = screen.getByDisplayValue('titre')
    await userEvent.clear(slugInput)
    await userEvent.type(slugInput, 'nouveau-titre')
    expect(await screen.findByText('2 modifications non enregistrées')).toBeInTheDocument()
  })

  it('clears the count back to 0 after a successful save', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(ARTICLE)
    vi.spyOn(api, 'apiSend').mockResolvedValue({ ...ARTICLE, title: { fr: 'Nouveau titre', en: '' } })
    renderEditor()
    const titleInput = await screen.findByDisplayValue('Titre')
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Nouveau titre')
    await screen.findByText(/non enregistrée/)

    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }))
    await waitFor(() => expect(screen.queryByText(/non enregistrée/)).not.toBeInTheDocument())
  })

  it('does not count publishing/unpublishing itself as an unsaved change', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ ...ARTICLE, status: 'draft' })
    vi.spyOn(api, 'apiSend').mockResolvedValue({ ...ARTICLE, status: 'published' })
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Publier' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dépublier' })).toBeInTheDocument())
    expect(screen.queryByText(/non enregistrée/)).not.toBeInTheDocument()
  })

  it('registers a beforeunload handler only while changes are unsaved', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(ARTICLE)
    const addSpy = vi.spyOn(window, 'addEventListener')
    renderEditor()
    const titleInput = await screen.findByDisplayValue('Titre')
    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function))

    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'x')
    await waitFor(() => expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function)))
  })

  it('reports its live unsaved count up via onUnsavedCountChange, clearing it on unmount', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(ARTICLE)
    const onUnsavedCountChange = vi.fn()
    const { unmount } = render(
      <MemoryRouter initialEntries={['/admin/articles/a1']}>
        <Routes>
          <Route path="/admin/articles/:id" element={<ArticleEditor onUnsavedCountChange={onUnsavedCountChange} />} />
        </Routes>
      </MemoryRouter>
    )
    const titleInput = await screen.findByDisplayValue('Titre')
    onUnsavedCountChange.mockClear()

    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'x')
    await waitFor(() => expect(onUnsavedCountChange).toHaveBeenLastCalledWith(1))

    unmount()
    expect(onUnsavedCountChange).toHaveBeenLastCalledWith(0)
  })
})
