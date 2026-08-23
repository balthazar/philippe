import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import * as api from '@/api.js'
import Admin from '../Admin.jsx'

beforeEach(() => vi.restoreAllMocks())

function renderAdmin(initialEntries = ['/admin']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Admin nav', () => {
  beforeEach(() => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/auth/me') return { email: 'philippe.gronon@me.com' }
      return { items: [], total: 0 }
    })
  })

  // Task 27, client feedback item 3: Articles, Pages, Images.
  it('lists the nav links in the order Articles, Pages, Images', async () => {
    renderAdmin()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Articles' })).toBeInTheDocument())
    const links = screen.getAllByRole('link').filter((a) => ['Articles', 'Pages', 'Images'].includes(a.textContent))
    expect(links.map((a) => a.textContent)).toEqual(['Articles', 'Pages', 'Images'])
  })

  // Task 27, client feedback item 7: same-tab now, not a new tab (reverses
  // an earlier instruction). The editor preview's own "Voir la page
  // publique" link stays a new tab -- untouched here.
  it('links the PG mark to the public site in the same tab', async () => {
    renderAdmin()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Philippe Gronon' })).toBeInTheDocument())
    const mark = screen.getByRole('link', { name: 'Philippe Gronon' })
    expect(mark).toHaveAttribute('href', '/')
    expect(mark).not.toHaveAttribute('target')
    expect(mark).not.toHaveAttribute('rel')
  })
})

// Task 28, client feedback: leaving the editor with unsaved changes must be
// blocked at the points that actually leave it -- the admin nav's own
// links, which stay on screen across every admin route. Not a browser
// confirm(): an in-page prompt, consistent with ConfirmDelete.
describe('Admin nav unsaved-changes guard', () => {
  const ARTICLE = {
    _id: 'a1',
    title: { fr: 'Titre', en: '' },
    yearLabel: { fr: '', en: '' },
    slug: { fr: 'titre', en: '' },
    category: 'works',
    yearStart: '',
    yearEnd: '',
    cover: null,
    blocks: [],
    status: 'draft',
  }

  beforeEach(() => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/auth/me') return { email: 'philippe.gronon@me.com' }
      if (path === '/admin/articles/a1') return ARTICLE
      return { items: [], total: 0 }
    })
  })

  it('navigates immediately when there are no unsaved changes', async () => {
    renderAdmin(['/admin/articles/a1'])
    await waitFor(() => expect(screen.getByDisplayValue('Titre')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('link', { name: 'Articles' }))
    expect(screen.queryByText(/non enregistrées/)).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByDisplayValue('Titre')).not.toBeInTheDocument())
  })

  it('prompts before an Articles/Pages/Images nav click when changes are unsaved, and stays put on Annuler', async () => {
    renderAdmin(['/admin/articles/a1'])
    const titleInput = await screen.findByDisplayValue('Titre')
    await userEvent.type(titleInput, ' modifié')

    await userEvent.click(screen.getByRole('link', { name: 'Pages' }))
    // Task 29, client feedback: a real modal now, not an inline header
    // group -- and the count (kept from the existing unsaved-count
    // tracking) is in the message, not a generic warning.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('1 modification non enregistrée. Quitter quand même ?')).toBeInTheDocument()
    // Still on the editor -- the nav click was intercepted, not followed.
    expect(screen.getByDisplayValue(/Titre/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue(/Titre/)).toBeInTheDocument()
  })

  it('navigates only after confirming Quitter', async () => {
    renderAdmin(['/admin/articles/a1'])
    const titleInput = await screen.findByDisplayValue('Titre')
    await userEvent.type(titleInput, ' modifié')

    await userEvent.click(screen.getByRole('link', { name: 'Images' }))
    await userEvent.click(screen.getByRole('button', { name: 'Quitter' }))
    await waitFor(() => expect(screen.queryByDisplayValue(/Titre/)).not.toBeInTheDocument())
  })

  it('guards the Déconnexion button the same way', async () => {
    renderAdmin(['/admin/articles/a1'])
    const titleInput = await screen.findByDisplayValue('Titre')
    await userEvent.type(titleInput, ' modifié')

    await userEvent.click(screen.getByRole('button', { name: 'Déconnexion' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('1 modification non enregistrée. Quitter quand même ?')).toBeInTheDocument()
    // Still authenticated -- logout was intercepted, not called.
    expect(screen.getByDisplayValue(/Titre/)).toBeInTheDocument()
  })

  // Task 29, client feedback: Escape must cancel, never confirm -- and must
  // not navigate away.
  it('cancels on Escape without navigating', async () => {
    renderAdmin(['/admin/articles/a1'])
    const titleInput = await screen.findByDisplayValue('Titre')
    await userEvent.type(titleInput, ' modifié')

    await userEvent.click(screen.getByRole('link', { name: 'Pages' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue(/Titre/)).toBeInTheDocument()
  })

  // Task 29, client feedback: a backdrop click must cancel, never confirm.
  it('cancels on a backdrop click without navigating', async () => {
    renderAdmin(['/admin/articles/a1'])
    const titleInput = await screen.findByDisplayValue('Titre')
    await userEvent.type(titleInput, ' modifié')

    await userEvent.click(screen.getByRole('link', { name: 'Pages' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // eslint-disable-next-line testing-library/no-node-access -- the backdrop itself has no accessible role
    await userEvent.click(document.querySelector('.modal-backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue(/Titre/)).toBeInTheDocument()
  })

  // Task 29, client feedback: initial focus goes to the safe action
  // (Annuler), never the destructive one, so a stray Enter right after the
  // modal opens can't discard the edit.
  it('puts initial focus on Annuler, not Quitter', async () => {
    renderAdmin(['/admin/articles/a1'])
    const titleInput = await screen.findByDisplayValue('Titre')
    await userEvent.type(titleInput, ' modifié')

    await userEvent.click(screen.getByRole('link', { name: 'Pages' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus())
  })

  // Task 29, client feedback: focus returns to whatever opened the modal
  // once it's dismissed without navigating.
  it('returns focus to the nav link that opened the modal, once cancelled', async () => {
    renderAdmin(['/admin/articles/a1'])
    const titleInput = await screen.findByDisplayValue('Titre')
    await userEvent.type(titleInput, ' modifié')

    const pagesLink = screen.getByRole('link', { name: 'Pages' })
    await userEvent.click(pagesLink)
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(pagesLink).toHaveFocus()
  })
})
