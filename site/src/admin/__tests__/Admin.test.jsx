import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import * as api from '@/api.js'
import Admin from '../Admin.jsx'

beforeEach(() => vi.restoreAllMocks())

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
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
