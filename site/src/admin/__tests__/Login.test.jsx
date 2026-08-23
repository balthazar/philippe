// Paths corrected per the Task 20 controller corrections: `@/api.js`
// (lib/ was flattened into src/, and `@/` is the Vite alias for site/src/).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import * as api from '@/api.js'
import Admin from '../Admin.jsx'

beforeEach(() => vi.restoreAllMocks())

// Mounts <Admin/> the way App.jsx actually mounts it: nested inside a
// matched <Route path="/admin/*">, not standalone. Admin's own internal
// <Routes> uses relative paths (index, articles/new, ...) that only
// resolve correctly with that real route context above them (see
// Admin.jsx's comment on this) -- a bare <MemoryRouter><Admin/></MemoryRouter>
// would test a mounting configuration the app never actually produces.
function renderAdmin(initialPath = '/admin') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Admin login', () => {
  it('shows the login form when not authenticated', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(Object.assign(new Error('nope'), { status: 401 }))
    renderAdmin()
    await waitFor(() => expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument())
  })

  it('shows an error message on a failed login', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(Object.assign(new Error('nope'), { status: 401 }))
    vi.spyOn(api, 'apiSend').mockRejectedValue(Object.assign(new Error('bad'), { status: 401 }))
    renderAdmin()
    await waitFor(() => screen.getByLabelText(/mot de passe/i))
    await userEvent.type(screen.getByLabelText(/courriel/i), 'admin@example.com')
    await userEvent.type(screen.getByLabelText(/mot de passe/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /connexion/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('shows the article list once authenticated', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/auth/me') return { email: 'admin@example.com' }
      if (path === '/admin/articles') return { items: [{ _id: '1', title: { fr: 'Porte', en: '' }, category: 'works', status: 'published', slug: { fr: 'porte' } }], total: 1 }
      return { items: [] }
    })
    renderAdmin()
    await waitFor(() => expect(screen.getByText('Porte')).toBeInTheDocument())
  })

  // The session is a 12-hour cookie: it can and will expire while the
  // article list is open. Forces exactly that -- /auth/me succeeds (already
  // logged in) but the subsequent /admin/articles call comes back 401 --
  // and checks the app lands back on the login form instead of hanging on
  // a blank page forever (ArticleList.jsx never resolves `loading` to
  // false there without the session-expiry handling).
  it('returns to the login form when the session expires while the article list is open', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/auth/me') return { email: 'admin@example.com' }
      if (path === '/admin/articles') return Promise.reject(Object.assign(new Error('expired'), { status: 401 }))
      return { items: [] }
    })
    renderAdmin()
    await waitFor(() => expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument())
  })

  // Task 25, client feedback items 4 then 5: a link to the live public site
  // from the admin nav (top-left), opening in a new tab without granting it
  // access to `window.opener`. Superseded from a text link to the artist's
  // own PG mark image -- its accessible name comes from the image's alt,
  // since the link has no other text.
  it('links out to the live public site via the PG mark in the nav, in a new tab', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/auth/me') return { email: 'admin@example.com' }
      return { items: [] }
    })
    renderAdmin()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Philippe Gronon' })).toBeInTheDocument())
    const link = screen.getByRole('link', { name: 'Philippe Gronon' })
    expect(link).toHaveAttribute('href', '/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
  })

  // Task 25, section 6: every one of the eight pages must be reachable, not
  // just biography (previously the nav's only pages link).
  it('reaches the pages index from the nav, listing all eight pages', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/auth/me') return { email: 'admin@example.com' }
      return { items: [] }
    })
    renderAdmin()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Pages' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('link', { name: 'Pages' }))

    for (const [key, label] of [
      ['home', 'Accueil'],
      ['works', 'Œuvres (intro)'],
      ['exhibitions', 'Expositions (intro)'],
      ['biography', 'Biographie'],
      ['contact', 'Contact'],
      ['bibliography', 'Bibliographie'],
      ['links', 'Liens'],
      ['legal', 'Mentions légales'],
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', `/admin/pages/${key}`)
    }
  })
})
