// Paths corrected per the Task 20 controller corrections: `@/api.js`
// (lib/ was flattened into src/, and `@/` is the Vite alias for site/src/).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as api from '@/api.js'
import Admin from '../Admin.jsx'

beforeEach(() => vi.restoreAllMocks())

describe('Admin login', () => {
  it('shows the login form when not authenticated', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(Object.assign(new Error('nope'), { status: 401 }))
    render(<MemoryRouter initialEntries={['/admin']}><Admin /></MemoryRouter>)
    await waitFor(() => expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument())
  })

  it('shows an error message on a failed login', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(Object.assign(new Error('nope'), { status: 401 }))
    vi.spyOn(api, 'apiSend').mockRejectedValue(Object.assign(new Error('bad'), { status: 401 }))
    render(<MemoryRouter initialEntries={['/admin']}><Admin /></MemoryRouter>)
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
    render(<MemoryRouter initialEntries={['/admin']}><Admin /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Porte')).toBeInTheDocument())
  })
})
