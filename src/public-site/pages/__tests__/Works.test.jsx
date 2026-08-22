import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../../../lib/lang.jsx'
import * as api from '../../../lib/api.js'
import { Works } from '../Works.jsx'

const article = (slug, category, yearStart) => ({
  _id: slug, slug, category, yearStart, title: slug, yearLabel: String(yearStart || ''),
  cover: { variants: { thumb: { path: 't.webp', width: 600, height: 400 }, medium: { path: 'm.webp', width: 1400, height: 933 } } },
})

beforeEach(() => {
  vi.spyOn(api, 'apiGet').mockImplementation(async (path, params) => {
    const byCategory = {
      works: [article('porte', 'works', 2023), article('chassis', 'works', 2018)],
      editions: [article('de', 'editions', 2009)],
      'public-orders': [article('tribunal', 'public-orders', 1984)],
    }
    if (path === '/pages/works') return { key: 'works', title: 'Œuvres', blocks: [] }
    return { items: byCategory[params.category] || [], total: 0 }
  })
})

describe('Works page', () => {
  it('renders decade headings above their works', async () => {
    render(<MemoryRouter><LangProvider><Works /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('heading', { name: '2020' })).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: '2010' })).toBeInTheDocument()
  })

  it('renders Éditions and Commandes publiques as sections beneath the works', async () => {
    render(<MemoryRouter><LangProvider><Works /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Éditions' })).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Commandes publiques' })).toBeInTheDocument()
  })

  it('links each card to its article', async () => {
    render(<MemoryRouter><LangProvider><Works /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('link', { name: /porte/i })).toHaveAttribute('href', '/oeuvres/porte'))
  })
})
