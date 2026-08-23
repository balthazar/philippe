import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import * as api from '@/api.js'
import { PageEditor } from '../PageEditor.jsx'

const PAGE = { key: 'biography', title: { fr: 'Biographie', en: '' }, blocks: [{ type: 'text', value: { fr: '<p>Né en 1964</p>', en: '' } }] }

beforeEach(() => vi.restoreAllMocks())

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/admin/pages/biography']}>
      <Routes>
        <Route path="/admin/pages/:key" element={<PageEditor />} />
      </Routes>
    </MemoryRouter>
  )
}

// Task 27, Part C1: PageEditor had no preview at all (ArticleEditor already
// had one). Reuses BlockRenderer through PagePreview, exactly as
// ArticleEditor does through ArticlePreview.
describe('PageEditor preview', () => {
  it('shows a live preview of the page title and blocks', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(PAGE)
    renderEditor()
    await waitFor(() => expect(screen.getByLabelText('Aperçu')).toBeInTheDocument())
    const preview = screen.getByLabelText('Aperçu')
    expect(preview).toHaveTextContent('Biographie')
    expect(preview).toHaveTextContent('Né en 1964')
  })

  it('updates the preview as the title field is edited, without saving', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(PAGE)
    renderEditor()
    await waitFor(() => expect(screen.getByLabelText('Aperçu')).toBeInTheDocument())

    await userEvent.clear(screen.getByLabelText('Titre'))
    await userEvent.type(screen.getByLabelText('Titre'), 'Nouveau titre')

    expect(screen.getByLabelText('Aperçu')).toHaveTextContent('Nouveau titre')
  })
})

// D5: the nav (Pages) already covers this; same reasoning as the article
// back-links removed earlier.
describe('PageEditor toolbar', () => {
  it('has no "Retour aux pages" link', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(PAGE)
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Biographie')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /retour aux pages/i })).not.toBeInTheDocument()
  })
})
