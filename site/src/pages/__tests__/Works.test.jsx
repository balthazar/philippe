import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import * as api from '@/api.js'
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
  it('renders all works in a single flat grid with no decade headings', async () => {
    render(<MemoryRouter><LangProvider><Works /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/porte/i)).toBeInTheDocument())
    expect(screen.getByText(/chassis/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '2020' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '2010' })).not.toBeInTheDocument()
  })

  it('renders Éditions and Commandes publiques as sections beneath the works', async () => {
    render(<MemoryRouter><LangProvider><Works /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Éditions' })).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Commandes publiques' })).toBeInTheDocument()
  })

  // Task 27, Part A: articles live at the root now, no /oeuvres/ segment.
  it('links each card to its article', async () => {
    render(<MemoryRouter><LangProvider><Works /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('link', { name: /porte/i })).toHaveAttribute('href', '/porte'))
  })

  // Coordinator feedback (task 27): the section's own title, from the same
  // /pages/works response headFor() reads at build time.
  it('sets document.title from the /pages/works title', async () => {
    render(<MemoryRouter><LangProvider><Works /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(document.title).toBe('Œuvres | Philippe Gronon'))
  })

  // Task 26, correction to B4: Works previously had no loading guard at
  // all, so it painted an empty grid immediately, indistinguishable from a
  // genuinely empty category -- both looked like nothing, and the footer
  // rode up in both cases. The two must render distinguishably, without a
  // spinner: a still-loading page reserves space and renders no grid; a
  // loaded-but-empty page renders the (empty) grid for real.
  it('reserves space and renders no grid while still loading, distinguishable from a loaded-but-empty category', async () => {
    // Three separate /articles calls (works, editions, public-orders) share
    // this same path, distinguished only by the category param, so every
    // one of them must resolve before usePageData's Promise.all settles.
    const resolvers = []
    vi.spyOn(api, 'apiGet').mockImplementation((path) => {
      if (path === '/articles') return new Promise((resolve) => resolvers.push(resolve))
      return Promise.resolve({ key: 'works', title: 'Œuvres', blocks: [] })
    })
    const { container } = render(<MemoryRouter><LangProvider><Works /></LangProvider></MemoryRouter>)

    const main = container.querySelector('main')
    expect(main).toBeInTheDocument()
    expect(main).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.grid')).not.toBeInTheDocument()

    resolvers.forEach((resolve) => resolve({ items: [], total: 0 }))
    await waitFor(() => expect(container.querySelector('main')).not.toHaveAttribute('aria-busy'))
    expect(container.querySelector('.grid')).toBeInTheDocument()
  })
})
