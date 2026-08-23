import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import * as api from '@/api.js'
import { Exhibitions } from '../Exhibitions.jsx'

const article = (slug, yearStart) => ({
  _id: slug, slug, category: 'exhibitions', yearStart, title: slug, yearLabel: String(yearStart || ''),
  cover: { variants: { thumb: { path: 't.webp', width: 600, height: 400 }, medium: { path: 'm.webp', width: 1400, height: 933 } } },
})

beforeEach(() => {
  vi.spyOn(api, 'apiGet').mockImplementation(async (path) =>
    path === '/pages/exhibitions'
      ? { key: 'exhibitions', title: 'Expositions', blocks: [] }
      : { items: [article('retro', 2023)], total: 1 }
  )
})

describe('Exhibitions page', () => {
  it('renders exhibitions in a flat grid', async () => {
    render(<MemoryRouter><LangProvider><Exhibitions /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/retro/i)).toBeInTheDocument())
  })

  // Coordinator feedback (task 27): same reasoning as Works.jsx.
  it('sets document.title from the /pages/exhibitions title', async () => {
    render(<MemoryRouter><LangProvider><Exhibitions /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(document.title).toBe('Expositions | Philippe Gronon'))
  })

  // Task 26, correction to B4: same guard as Works -- no loading state
  // before this rendered an empty grid immediately, indistinguishable from
  // a genuinely empty category.
  it('reserves space and renders no grid while still loading, distinguishable from a loaded-but-empty category', async () => {
    let resolveItems
    vi.spyOn(api, 'apiGet').mockImplementation((path) => {
      if (path === '/articles') return new Promise((resolve) => { resolveItems = resolve })
      return Promise.resolve({ key: 'exhibitions', title: 'Expositions', blocks: [] })
    })
    const { container } = render(<MemoryRouter><LangProvider><Exhibitions /></LangProvider></MemoryRouter>)

    const main = container.querySelector('main')
    expect(main).toBeInTheDocument()
    expect(main).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.grid')).not.toBeInTheDocument()

    resolveItems({ items: [], total: 0 })
    await waitFor(() => expect(container.querySelector('main')).not.toHaveAttribute('aria-busy'))
    expect(container.querySelector('.grid')).toBeInTheDocument()
  })
})
