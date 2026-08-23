import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import * as api from '@/api.js'
import { Exhibitions } from '../Exhibitions.jsx'

// Task 28, part 3: real archive shape -- exhibitions are titled by year and
// the list API's own order (position) is a curated display order, NOT
// chronological (see lib/exhibitionsOrder.js). Deliberately out of year
// order here to prove the page sorts rather than trusting list order.
const listItems = [
  { _id: '1', slug: '2023', category: 'exhibitions', title: '2023' },
  { _id: '2', slug: '1989', category: 'exhibitions', title: '1989' },
  { _id: '3', slug: '2024', category: 'exhibitions', title: '2024' },
]

const fullArticle = (slug, title) => ({
  _id: slug, slug, title, category: 'exhibitions', blocks: [{ type: 'text', value: `<p>${title} content</p>` }],
})

beforeEach(() => {
  vi.spyOn(api, 'apiGet').mockImplementation(async (path, params = {}) => {
    if (path === '/pages/exhibitions') return { key: 'exhibitions', title: 'Expositions', blocks: [] }
    if (path === '/articles') {
      expect(params.category).toBe('exhibitions')
      return { items: listItems, total: listItems.length }
    }
    if (path === '/articles/2024') return fullArticle('2024', '2024')
    throw Object.assign(new Error('unexpected path ' + path), { status: 404 })
  })
})

const renderPage = () => render(<MemoryRouter><LangProvider><Exhibitions /></LangProvider></MemoryRouter>)

describe('Exhibitions page', () => {
  it('renders a year timeline with every exhibition, sorted most recent first', async () => {
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelector('.exhibitions-timeline')).toBeInTheDocument())
    const links = screen.getByRole('navigation').querySelectorAll('a')
    expect([...links].map((a) => a.textContent)).toEqual(['2024', '2023', '1989'])
  })

  it('links every year to its own root-level article URL', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('link', { name: '1989' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '2024' })).toHaveAttribute('href', '/2024')
    expect(screen.getByRole('link', { name: '2023' })).toHaveAttribute('href', '/2023')
    expect(screen.getByRole('link', { name: '1989' })).toHaveAttribute('href', '/1989')
  })

  it('marks the most recent year current and renders its content on the right', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('link', { name: '2024' })).toHaveAttribute('aria-current', 'true'))
    expect(screen.getByRole('link', { name: '2023' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '1989' })).not.toHaveAttribute('aria-current')
    expect(screen.getByText('2024 content')).toBeInTheDocument()
  })

  // Task 29, part 1: the timeline already marks 2024 as the current year
  // (aria-current, checked above) -- repeating it as a page heading beside
  // the timeline is a duplicate label, not new information.
  it('renders no duplicate year heading beside the timeline', async () => {
    const { container } = renderPage()
    await waitFor(() => expect(screen.getByText('2024 content')).toBeInTheDocument())
    expect(container.querySelector('.exhibitions-content h1')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: '2024' })).not.toBeInTheDocument()
  })

  // Coordinator feedback (task 27): same reasoning as Works.jsx.
  it('sets document.title from the /pages/exhibitions title', async () => {
    renderPage()
    await waitFor(() => expect(document.title).toBe('Expositions | Philippe Gronon'))
  })

  // Task 26, correction to B4: same guard as Works -- no loading state
  // before this rendered content immediately, indistinguishable from a
  // loaded-but-empty category.
  it('reserves space and renders no timeline while still loading', async () => {
    let resolveItems
    vi.spyOn(api, 'apiGet').mockImplementation((path) => {
      if (path === '/articles') return new Promise((resolve) => { resolveItems = resolve })
      return Promise.resolve({ key: 'exhibitions', title: 'Expositions', blocks: [] })
    })
    const { container } = render(<MemoryRouter><LangProvider><Exhibitions /></LangProvider></MemoryRouter>)

    const main = container.querySelector('main')
    expect(main).toBeInTheDocument()
    expect(main).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.exhibitions-layout')).not.toBeInTheDocument()

    resolveItems({ items: [], total: 0 })
    await waitFor(() => expect(container.querySelector('main')).not.toHaveAttribute('aria-busy'))
    expect(container.querySelector('.exhibitions-layout')).not.toBeInTheDocument()
  })
})
